// Live image overlay for the public site. On load, fetch the latest cover-image
// overrides from /api/live and swap each project card's cover <img src> to the
// latest image — so uploaded images appear instantly, without waiting for the
// static rebuild. ONLY images are touched; text stays frontmatter-driven
// (respecting the "text from frontmatter" red line).

const LIVE_ENDPOINT = "/api/live";

async function patchLive() {
  try {
    const res = await fetch(LIVE_ENDPOINT, { cache: "no-store" });
    if (!res.ok) return;
    const map = (await res.json()) as Record<string, { cover_image?: string }>;
    if (!map || Object.keys(map).length === 0) return;
    document.querySelectorAll<HTMLElement>(".project-card").forEach((card) => {
      const link = card.querySelector<HTMLElement>("a.view-link[data-slug]");
      const slug = link?.dataset.slug;
      if (!slug) return;
      const override = map[slug];
      if (!override || !override.cover_image) return;
      const img = card.querySelector<HTMLImageElement>("img");
      if (img && img.src !== override.cover_image) img.src = override.cover_image;
      const btn = card.querySelector<HTMLElement>(".project-carousel");
      if (btn) {
        try {
          const arr = JSON.parse(btn.dataset.images || "[]");
          if (arr[0] !== override.cover_image) {
            arr[0] = override.cover_image;
            btn.dataset.images = JSON.stringify(arr);
          }
        } catch {
          /* ignore */
        }
      }
    });
  } catch {
    /* ignore */
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", patchLive);
} else {
  patchLive();
}
