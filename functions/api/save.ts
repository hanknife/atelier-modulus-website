// Cloudflare Pages Function — persists in-page editor changes.
//
// Images ("upload" action) are written straight to a Cloudflare R2 bucket so
// they show instantly at the public URL — no full site rebuild / CDN wait.
// Text ("save" / "delete" actions, i.e. frontmatter markdown) is still written
// back to the GitHub repo via the Contents API; those tolerate the 1–2 min
// rebuild delay.
//
// Set these in Cloudflare Pages > Settings > Environment variables (Production):
//   EDIT_PASSCODE   – the passcode you type in the editor
//   GITHUB_PAT      – a GitHub PAT with repo scope (used for save/delete)
//   GITHUB_REPO     – optional, defaults to hanknife/atelier-modulus-website
//   EDITOR_BUCKET   – the R2 bucket binding (created in Pages > Settings > Bindings)
//   R2_PUBLIC_URL   – the public access URL, e.g. https://pub-xxxx.r2.dev

// Minimal shape of the Cloudflare R2 bucket binding. The real implementation
// is provided by the runtime; we declare just enough for type-checking.
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

// Best-effort live overrides: a tiny JSON per project in R2 so the public site
// can swap the cover image instantly (before the static rebuild finishes).
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
    /* non-fatal: live overlay is best-effort */
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
    // ---- upload: write image to R2, return public URL instantly -------------
    if (body.action === "upload") {
      if (!env.EDITOR_BUCKET || !env.R2_PUBLIC_URL) {
        return json({ error: "server missing R2 config (EDITOR_BUCKET / R2_PUBLIC_URL)" }, 500);
      }
      const key = body.filename as string;
      if (!key) return json({ error: "missing filename" }, 400);
      // body.data is base64 (text); decode to binary for R2.
      const bin = atob(body.data as string);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      await env.EDITOR_BUCKET.put(key, bytes, {
        httpMetadata: { contentType: (body.contentType as string) || "image/jpeg" },
      });
      const base = env.R2_PUBLIC_URL.replace(/\/+$/, "");
      return json({ url: `${base}/${key}` });
    }

    // ---- save / delete: write frontmatter markdown back to GitHub ----------
    if (!env.GITHUB_PAT) {
      return json({ error: "server missing GITHUB_PAT" }, 500);
    }
    const repo = env.GITHUB_REPO || "hanknife/atelier-modulus-website";
    const api = `https://api.github.com/repos/${repo}/contents`;
    const headers = {
      "User-Agent": "Atelier-Modulus-Editor/1.0",
      Authorization: `Bearer ${env.GITHUB_PAT}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    };

      if (body.action === "save") {
        const path = body.path;
        // Retry on 409 (SHA conflict): another request may have just written
        // this file — fetch the fresh SHA and try again.
        let lastError: string | null = null;
        for (let attempt = 0; attempt < 2; attempt++) {
          const sha = await getSha(api, path, headers);
          const r = await fetch(`${api}/${path}`, {
            method: "PUT",
            headers,
            body: JSON.stringify({
              message: `update ${path}`,
              content: b64encode(body.content),
              ...(sha ? { sha } : {}),
            }),
          });
          if (r.ok) {
            const slug = slugFromPath(path);
            await writeLiveOverride(env, slug, coverFromContent(body.content));
            return json({ ok: true });
          }
          // 409 = SHA mismatch — worth one retry with a fresh sha
          if (r.status !== 409) {
            lastError = await r.text();
            break;
          }
          lastError = await r.text();
        }
        return json({ error: lastError ?? "save failed" }, 409);
      }

      if (body.action === "delete") {
        const path = body.path;
        let lastError: string | null = null;
        for (let attempt = 0; attempt < 2; attempt++) {
          const sha = await getSha(api, path, headers);
          if (!sha) return json({ ok: true });
          const r = await fetch(`${api}/${path}`, {
            method: "DELETE",
            headers,
            body: JSON.stringify({ message: `delete ${path}`, sha }),
          });
          if (r.ok) {
            await deleteLiveOverride(env, slugFromPath(path));
            return json({ ok: true });
          }
          if (r.status !== 409) {
            lastError = await r.text();
            break;
          }
          lastError = await r.text();
        }
        return json({ error: lastError ?? "delete failed" }, 409);
      }

    return json({ error: "unknown action" }, 400);
  } catch (e: any) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
};
