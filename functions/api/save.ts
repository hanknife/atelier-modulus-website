// Cloudflare Pages Function — persists in-page editor changes to the GitHub repo.
// Auth: an edit passcode (EDIT_PASSCODE). Writes via the GitHub Contents API
// using a Personal Access Token (GITHUB_PAT, repo scope) stored as a secret.
//
// Set these in Cloudflare Pages > Settings > Environment variables (Production):
//   EDIT_PASSCODE   – the passcode you type in the editor
//   GITHUB_PAT      – a GitHub PAT with repo scope
//   GITHUB_REPO     – optional, defaults to hanknife/atelier-modulus-website

interface Env {
  EDIT_PASSCODE: string;
  GITHUB_PAT: string;
  GITHUB_REPO?: string;
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
  if (!env.GITHUB_PAT) {
    return json({ error: "server missing GITHUB_PAT" }, 500);
  }

  const repo = env.GITHUB_REPO || "hanknife/atelier-modulus-website";
  const api = `https://api.github.com/repos/${repo}/contents`;
  const headers = {
    Authorization: `Bearer ${env.GITHUB_PAT}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  try {
    if (body.action === "upload") {
      const path = `public/images/${body.filename}`;
      const sha = await getSha(api, path, headers);
      const r = await fetch(`${api}/${path}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({
          message: `upload ${body.filename}`,
          content: body.data,
          ...(sha ? { sha } : {}),
        }),
      });
      if (!r.ok) return json({ error: await r.text() }, r.status);
      return json({ url: `/images/${body.filename}` });
    }

    if (body.action === "save") {
      const path = body.path;
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
      if (!r.ok) return json({ error: await r.text() }, r.status);
      return json({ ok: true });
    }

    if (body.action === "delete") {
      const path = body.path;
      const sha = await getSha(api, path, headers);
      if (!sha) return json({ ok: true });
      const r = await fetch(`${api}/${path}`, {
        method: "DELETE",
        headers,
        body: JSON.stringify({ message: `delete ${path}`, sha }),
      });
      if (!r.ok) return json({ error: await r.text() }, r.status);
      return json({ ok: true });
    }

    return json({ error: "unknown action" }, 400);
  } catch (e: any) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
};
