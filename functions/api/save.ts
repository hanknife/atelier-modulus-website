// Cloudflare Pages Function — persists in-page editor changes.
//
// Images ("upload" action) are written straight to a Cloudflare R2 bucket so
// they show instantly at the public URL — no full site rebuild / CDN wait.
// Text ("save-all" action, i.e. frontmatter markdown) is written back to the
// GitHub repo via the Git Data API as ONE atomic commit regardless of how many
// files changed — so the Cloudflare deploy queue doesn't pile up and there are
// no per-file SHA races (no 409s).
//
// Set these in Cloudflare Pages > Settings > Environment variables (Production):
//   EDIT_PASSCODE   – the passcode you type in the editor
//   GITHUB_PAT      – a GitHub PAT with repo scope (used for save/delete)
//   GITHUB_REPO     – optional, defaults to hanknife/atelier-modulus-website
//   EDITOR_BUCKET   – the R2 bucket binding (created in Pages > Settings > Bindings)
//   R2_PUBLIC_URL   – the public access URL, e.g. https://pub-xxxx.r2.dev

// Minimal shape of the Cloudflare R2 bucket binding.
interface R2Bucket {
  put(
    key: string,
    value: ArrayBuffer | ArrayBufferView | string | ReadableStream | Blob,
    options?: { httpMetadata?: { contentType?: string } }
  ): Promise<unknown>;
  delete(key: string): Promise<void>;
}

interface Env {
  EDIT_PASSCODE: string;
  GITHUB_PAT?: string;
  GITHUB_REPO?: string;
  EDITOR_BUCKET?: R2Bucket;
  R2_PUBLIC_URL?: string;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function b64encode(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}

function slugFromPath(path: string): string {
  return path.replace(/^src\/content\/projects\//, "").replace(/\.mdx?$/, "");
}

async function writeLiveOverride(env: Env, slug: string, coverImage: string) {
  if (!env.EDITOR_BUCKET) return;
  try {
    await env.EDITOR_BUCKET.put(
      `live/${slug}.json`,
      JSON.stringify({ cover_image: coverImage }),
      { httpMetadata: { contentType: "application/json" } }
    );
  } catch {
    /* non-fatal */
  }
}

async function deleteLiveOverride(env: Env, slug: string) {
  if (!env.EDITOR_BUCKET) return;
  try {
    await env.EDITOR_BUCKET.delete(`live/${slug}.json`);
  } catch {
    /* ignore */
  }
}

export const onRequestPost = async (context: { request: Request; env: Env }) => {
  const { request, env } = context;
  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  if (env.EDIT_PASSCODE && body.passcode !== env.EDIT_PASSCODE) {
    return json({ error: "unauthorized" }, 401);
  }

  try {
    // ---- upload: write image to R2 -----------------------------------------
    if (body.action === "upload") {
      if (!env.EDITOR_BUCKET || !env.R2_PUBLIC_URL) {
        return json({ error: "server missing R2 config" }, 500);
      }
      const key = body.filename as string;
      if (!key) return json({ error: "missing filename" }, 400);
      const bin = atob(body.data as string);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      await env.EDITOR_BUCKET.put(key, bytes, {
        httpMetadata: { contentType: (body.contentType as string) || "image/jpeg" },
      });
      const base = env.R2_PUBLIC_URL.replace(/\/+$/, "");
      return json({ url: `${base}/${key}` });
    }

    // ---- save-all: batch write all cards to GitHub ------------------------
    // Accepts an array of { action: "save"|delete", path, content? } and
    // processes them sequentially inside this single function invocation.
    // Sequential processing eliminates all GitHub SHA conflicts — no need
    // ---- save-all: batch write via Git Data API (single atomic commit) ----
    // Instead of the Contents API (one commit per file → one Cloudflare build
    // per file), we build blobs + one tree + ONE commit regardless of how many
    // files changed.  Benefits:
    //   • only 1 GitHub commit per save → the deploy queue doesn't pile up
    //   • one atomic commit → no per-file SHA races, so no 409s possible
    if (body.action === "save-all") {
      if (!env.GITHUB_PAT) return json({ error: "server missing GITHUB_PAT" }, 500);
      const repo = env.GITHUB_REPO || "hanknife/atelier-modulus-website";
      const gh = `https://api.github.com/repos/${repo}`;
      const headers = {
        "User-Agent": "Atelier-Modulus-Editor/1.0",
        Authorization: `Bearer ${env.GITHUB_PAT}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      };

      const items: Array<{ action: string; path: string; content?: string; cover?: string; deletedImages?: string[] }> = body.items ?? [];
      const results: Array<{ path: string; ok?: boolean; error?: string }> = [];

      // A whole-save retry handles the rare case where another save-all moved
      // the branch ref between our read and our commit.  GitHub rejects the
      // ref update with 422; we re-read and try once more.
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          // 1) Resolve the current branch tip + its tree.
          const refRes = await fetch(`${gh}/git/refs/heads/main`, { headers });
          if (!refRes.ok) { results.push({ path: "*", error: `ref ${refRes.status}` }); break; }
          const refData = (await refRes.json()) as { object: { sha: string } };
          const baseCommitSha = refData.object.sha;

          const commitRes = await fetch(`${gh}/git/commits/${baseCommitSha}`, { headers });
          if (!commitRes.ok) { results.push({ path: "*", error: `commit ${commitRes.status}` }); break; }
          const commitData = (await commitRes.json()) as { tree: { sha: string } };
          const baseTreeSha = commitData.tree.sha;

          // 2) Create a blob per file + collect tree entries.
          const treeEntries: Array<{ path: string; mode: string; type: string; sha: string | null }> = [];
          const liveOverrides: Array<{ slug: string; cover: string }> = [];

          for (const item of items) {
            if (item.action === "delete") {
              // sha: null removes the file from the new tree.
              treeEntries.push({ path: item.path, mode: "100644", type: "blob", sha: null });
              await deleteLiveOverride(env, slugFromPath(item.path));
            } else if (item.action === "save" && item.content != null) {
              const blobRes = await fetch(`${gh}/git/blobs`, {
                method: "POST",
                headers,
                body: JSON.stringify({ content: b64encode(item.content), encoding: "base64" }),
              });
              if (!blobRes.ok) {
                results.push({ path: item.path, error: `blob ${blobRes.status}: ${await blobRes.text()}` });
                continue;
              }
              const blobData = (await blobRes.json()) as { sha: string };
              treeEntries.push({ path: item.path, mode: "100644", type: "blob", sha: blobData.sha });
              const slug = slugFromPath(item.path);
              liveOverrides.push({ slug, cover: item.cover ?? "" });
            } else {
              results.push({ path: item.path, error: "invalid item" });
            }
          }

          // 3) Create the tree (based on the current one).
          const treeRes = await fetch(`${gh}/git/trees`, {
            method: "POST",
            headers,
            body: JSON.stringify({ base_tree: baseTreeSha, tree: treeEntries }),
          });
          if (!treeRes.ok) { results.push({ path: "*", error: `tree ${treeRes.status}: ${await treeRes.text()}` }); break; }
          const treeData = (await treeRes.json()) as { sha: string };

          // 4) Create ONE commit for all changes.
          const commitMsg = items.length === 1
            ? `update ${items[0].path}`
            : `editor batch update (${items.length} files)`;
          const newCommitRes = await fetch(`${gh}/git/commits`, {
            method: "POST",
            headers,
            body: JSON.stringify({ message: commitMsg, tree: treeData.sha, parents: [baseCommitSha] }),
          });
          if (!newCommitRes.ok) { results.push({ path: "*", error: `commit-create ${newCommitRes.status}` }); break; }
          const newCommitData = (await newCommitRes.json()) as { sha: string };

          // 5) Point the branch at the new commit.  Pass the expected current
          //    sha so a concurrent save fails fast instead of clobbering us.
          const updateRes = await fetch(`${gh}/git/refs/heads/main`, {
            method: "PATCH",
            headers,
            body: JSON.stringify({ sha: newCommitData.sha, force: false }),
          });
          if (!updateRes.ok) {
            // 422 = ref moved under us → retry the whole save once.
            if (updateRes.status === 422 && attempt === 0) {
              continue;
            }
            results.push({ path: "*", error: `ref-update ${updateRes.status}: ${await updateRes.text()}` });
            break;
          }

          // 6) Write live overrides (best-effort, R2).
          for (const lo of liveOverrides) {
            await writeLiveOverride(env, lo.slug, lo.cover);
          }

          // 7) Delete removed gallery images from R2 (best-effort).
          if (env.EDITOR_BUCKET && env.R2_PUBLIC_URL) {
            const r2Base = env.R2_PUBLIC_URL.replace(/\/+$/, "");
            for (const item of items) {
              const urls: string[] = item.deletedImages ?? [];
              for (const url of urls) {
                // Extract key from URL like https://pub-xxx.r2.dev/path/to/image.jpg
                let key = url;
                if (url.startsWith(r2Base + "/")) {
                  key = url.slice(r2Base.length + 1);
                }
                try { await env.EDITOR_BUCKET.delete(key); } catch { /* non-fatal */ }
              }
            }
          }
          items.forEach((it) => results.push({ path: it.path, ok: true }));
          break;
        } catch (e: any) {
          if (attempt === 0) { results.length = 0; continue; }
          results.push({ path: "*", error: String(e?.message ?? e) });
          break;
        }
      }

      const failures = results.filter((r) => !r.ok);
      if (failures.length > 0) {
        return json({ ok: false, errors: failures.map((f) => `${f.path}: ${f.error}`), results }, 422);
      }
      return json({ ok: true, results });
    }

    return json({ error: "unknown action" }, 400);
  } catch (e: any) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
};
