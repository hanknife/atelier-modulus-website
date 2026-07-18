// Cloudflare Pages Function — persists in-page editor changes.
//
// Images ("upload" action) are written straight to a Cloudflare R2 bucket so
// they show instantly at the public URL — no full site rebuild / CDN wait.
// Text ("save-all" / delete actions, i.e. frontmatter markdown) is written
// back to the GitHub repo via the Contents API; those tolerate the 1–2 min
// rebuild delay.
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

function coverFromContent(content: string): string {
  const fm = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) return "";
  const line = fm[1].match(/cover_image:\s*(.+)/);
  if (!line) return "";
  return line[1].trim().replace(/^["']|["']$/g, "");
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

async function getSha(api: string, path: string, headers: Record<string, string>): Promise<string | null> {
  const r = await fetch(`${api}/${path}`, { headers });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`getSha ${r.status}: ${await r.text()}`);
  const j = (await r.json()) as { sha?: string };
  return j.sha ?? null;
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
    // for retries or backoff. The client sends ONE request instead of N.
    if (body.action === "save-all") {
      if (!env.GITHUB_PAT) return json({ error: "server missing GITHUB_PAT" }, 500);
      const repo = env.GITHUB_REPO || "hanknife/atelier-modulus-website";
      const api = `https://api.github.com/repos/${repo}/contents`;
      const headers = {
        "User-Agent": "Atelier-Modulus-Editor/1.0",
        Authorization: `Bearer ${env.GITHUB_PAT}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      };

      const items: Array<{ action: string; path: string; content?: string }> = body.items ?? [];
      const results: Array<{ path: string; ok?: boolean; error?: string }> = [];

      // Process sequentially — no SHA races possible under normal conditions.
      // A single retry per item handles edge cases like a timed-out prior
      // invocation that partially wrote before this one started.
      for (const item of items) {
        try {
          if (item.action === "delete") {
            let ok = false;
            for (let try_ = 0; try_ < 2 && !ok; try_++) {
              const sha = await getSha(api, item.path, headers);
              if (!sha) { ok = true; continue; }
              const r = await fetch(`${api}/${item.path}`, {
                method: "DELETE",
                headers,
                body: JSON.stringify({ message: `delete ${item.path}`, sha }),
              });
              if (r.ok) { ok = true; await deleteLiveOverride(env, slugFromPath(item.path)); }
              else if (r.status !== 409) {
                results.push({ path: item.path, error: `${r.status}: ${await r.text()}` });
                break;
              } // else 409 → retry once with fresh sha
            }
            if (ok) results.push({ path: item.path, ok: true });
          } else if (item.action === "save" && item.content != null) {
            let ok = false;
            for (let try_ = 0; try_ < 2 && !ok; try_++) {
              const sha = await getSha(api, item.path, headers);
              const r = await fetch(`${api}/${item.path}`, {
                method: "PUT",
                headers,
                body: JSON.stringify({
                  message: `update ${item.path}`,
                  content: b64encode(item.content),
                  ...(sha ? { sha } : {}),
                }),
              });
              if (r.ok) {
                ok = true;
                const slug = slugFromPath(item.path);
                await writeLiveOverride(env, slug, coverFromContent(item.content));
              } else if (r.status !== 409) {
                results.push({ path: item.path, error: `${r.status}: ${await r.text()}` });
                break;
              } // else 409 → retry once with fresh sha
            }
            if (ok) results.push({ path: item.path, ok: true });
          } else {
            results.push({ path: item.path, error: "invalid item" });
          }
        } catch (e: any) {
          results.push({ path: item.path, error: String(e?.message ?? e) });
        }
      }

      const failures = results.filter((r) => !r.ok);
      if (failures.length > 0) {
        return json({
          ok: false,
          errors: failures.map((f) => `${f.path}: ${f.error}`),
          results,
        }, 409);
      }
      return json({ ok: true, results });
    }

    return json({ error: "unknown action" }, 400);
  } catch (e: any) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
};
