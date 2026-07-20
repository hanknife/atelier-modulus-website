// Cloudflare Pages Function — returns the latest cover-image overrides for all
// projects so the public site can swap images instantly (before the static
// rebuild finishes). Served same-origin to the site, so no CORS is needed.

interface R2Object {
  key: string;
}
interface R2Bucket {
  list(options?: { prefix?: string }): Promise<{ objects: R2Object[] }>;
  get(key: string): Promise<{ text(): Promise<string> } | null>;
}

interface Env {
  EDITOR_BUCKET?: R2Bucket;
}

export const onRequestGet = async (context: { env: Env }) => {
  const { env } = context;
  const map: Record<string, any> = {};
  if (env.EDITOR_BUCKET) {
    try {
      const listed = await env.EDITOR_BUCKET.list({ prefix: "live/" });
      for (const obj of listed.objects) {
        const slug = obj.key.replace(/^live\//, "").replace(/\.json$/, "");
        const got = await env.EDITOR_BUCKET.get(obj.key);
        if (!got) continue;
        try {
          const data = JSON.parse(await got.text());
          if (data) map[slug] = data;
        } catch {
          /* ignore malformed entry */
        }
      }
    } catch {
      /* ignore */
    }
  }
  return new Response(JSON.stringify(map), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
};
