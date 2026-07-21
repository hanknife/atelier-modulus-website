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
    const map = (await res.json()) as Record<string, any>;
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

    // Keep the /coupling/ (and /filter/) waterfall in sync with editor cover
    // swaps. When a slug's cover_image override arrives, swap that slug's
    // cover tile to the new image, then recompute the masonry row spans once
    // (the cover tile's aspect ratio may have changed).
    let couplingDirty = false;
    document.querySelectorAll<HTMLElement>(".coupling-tile[data-detail-cover='cover']").forEach((tile) => {
      const slug = tile.dataset.detailSlug;
      if (!slug) return;
      const override = map[slug];
      if (!override || !override.cover_image) return;
      const img = tile.querySelector<HTMLImageElement>("img");
      if (img && img.src !== override.cover_image) {
        img.src = override.cover_image;
        couplingDirty = true;
      }
    });
    if (couplingDirty) window.dispatchEvent(new Event("resize"));

    // Apply live filter overrides so newly created/edited filters appear
    // instantly in the filter strip (before Cloudflare rebuild finishes).
    const isCoupling = !!document.querySelector(".coupling-state:not(.filter-term)");
    const isFilterTerm = !!document.querySelector(".filter-term");
    if ((isCoupling || isFilterTerm) && map.filters && Array.isArray(map.filters)) {
      const strip = document.querySelector<HTMLElement>(".filter-strip");
      if (strip) {
        // Remove any previously added dynamic items
        strip.querySelectorAll<HTMLElement>(".filter-strip-item").forEach(el => el.remove());
        for (const f of map.filters as Array<{ slug: string; label: string }>) {
          // Only add if not already server-rendered (avoid duplicates)
          if (!strip.querySelector(`[data-filter-slug="${f.slug}"]`)) {
            const wrapper = document.createElement("span");
            wrapper.className = "filter-strip-item";
            wrapper.dataset.filterSlug = f.slug;
            const link = document.createElement("a");
            link.href = `/filter/${f.slug}/`;
            link.textContent = f.label;
            const sep = document.createElement("span");
            sep.className = "filter-comma";
            sep.textContent = ", ";
            wrapper.appendChild(link);
            wrapper.appendChild(sep);
            strip.appendChild(wrapper);
          }
        }
      }
    }

    // Apply live info-text overrides so the public Info page reflects edits
    // instantly, without waiting for the Cloudflare rebuild. Scoped to the
    // server-rendered .info-collage so we never touch the editor's hidden
    // overlay or clobber unsaved localStorage edits on the /editor surface.
    if (location.pathname === "/info" || location.pathname === "/info/") {
      const info = map["info"];
      const scope = document.querySelector<HTMLElement>(".info-collage");
      if (info && scope) {
        const setField = (sel: string, val?: string, asHtml = false) => {
          const el = scope.querySelector<HTMLElement>(sel);
          if (!el || val == null) return;
          const clean = val
            .split("\n")
            .map((line) => line.trim())
            .join("\n")
            .trim();
          if (asHtml) {
            if (el.innerHTML !== clean) el.innerHTML = clean;
          } else {
            if (el.textContent !== clean) el.textContent = clean;
          }
        };
        setField(".info-address", info.address);
        setField(".info-bio", info.bio);
        setField(".chip-exhibitions", info.exhibitions_label);
        setField(".info-note", info.exhibitions_note_html, true);
        setField(".chip-lectures", info.lectures_label);
        setField(".info-caption-lecture", info.lectures_caption);
        setField(".info-caption", info.footer_caption);
      }
    }
  } catch {
    /* ignore */
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", patchLive);
} else {
  patchLive();
}
