// Live image overlay for the public site. On load, fetch the latest cover-image
// overrides from /api/live and swap each project card's cover <img src> to the
// latest image — so uploaded images appear instantly, without waiting for the
// static rebuild. ONLY images are touched; text stays frontmatter-driven
// (respecting the "text from frontmatter" red line).

const LIVE_ENDPOINT = "/api/live";

// Local filter edits written by the in-page filter editor (filter-edit.js)
// into localStorage. When a filter is created/edited/deleted locally, the
// editor stores entries here so the change survives a refresh even before the
// server (live/filters.json + Cloudflare rebuild) has caught up. We must
// respect those entries here too — otherwise this live patch re-adds a deleted
// filter from a still-stale live/filters.json, or misses a newly-created filter
// if live/filters.json was not written yet (e.g. missing R2 binding/propagation
// lag).
const FILTER_LS_KEY = "am_filter_edit_v1";

function getLocalFilterEntries(): Array<{ slug: string; label: string; images: string[] | string }> {
  try {
    const raw = localStorage.getItem(FILTER_LS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((f: any) => f && typeof f.slug === "string");
  } catch {
    return [];
  }
}

function getDeletedFilterSlugs(localEntries = getLocalFilterEntries()): Set<string> {
  return new Set(
    localEntries.filter((f) => f.images === "__DELETED__").map((f) => f.slug)
  );
}

// Merge server filters (live/filters.json via /api/live) with local additions.
// Server data wins for slugs that exist on both sides; local-only slugs are
// appended. Deleted slugs (tombstones) are excluded from both sides.
function mergeFilterLists(serverFilters: Array<{ slug: string; label: string }>): Array<{ slug: string; label: string }> {
  const localEntries = getLocalFilterEntries();
  const deletedSlugs = getDeletedFilterSlugs(localEntries);
  const serverMap = new Map(serverFilters.filter((f) => !deletedSlugs.has(f.slug)).map((f) => [f.slug, f]));
  for (const lf of localEntries) {
    if (deletedSlugs.has(lf.slug)) continue;
    if (!serverMap.has(lf.slug)) {
      serverMap.set(lf.slug, { slug: lf.slug, label: lf.label });
    }
  }
  return Array.from(serverMap.values());
}

async function patchLive() {
  try {
    const res = await fetch(LIVE_ENDPOINT, { cache: "no-store" });
    if (!res.ok) return;
    const map = (await res.json()) as Record<string, any>;
    if (!map) return;
    // Local filter edits (additions/edits/deletions) must be applied even when
    // the live map is otherwise empty — e.g. the R2 binding is missing so
    // /api/live returns {}. Compute this up front so we do NOT bail out early in
    // that case; otherwise a deletion tombstone would never hide the filter on
    // the preview page when live data is unavailable.
    const localEntries = getLocalFilterEntries();
    const deletedSlugs = getDeletedFilterSlugs(localEntries);
    const hasLocalFilterChanges = localEntries.length > 0;
    if (Object.keys(map).length === 0 && !hasLocalFilterChanges) return;
    document.querySelectorAll<HTMLElement>(".project-card").forEach((card) => {
      // Most cards expose the slug via an inner a.view-link[data-slug]. The
      // project DETAIL page's editable card is an <article.project-detail> that
      // carries data-slug itself (no inner view-link). Read it directly — we
      // must NOT use card.querySelector("a.view-link[data-slug]") here, because
      // the detail article also contains the PAIRED project's ProjectCard in its
      // .detail-related aside, whose nested view-link would resolve to the wrong
      // slug and make the override lookup miss the hero image.
      const slug = card.classList.contains("project-detail")
        ? card.dataset.slug
        : card.querySelector<HTMLElement>("a.view-link[data-slug]")?.dataset.slug;
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
    const hasLocalAdditions = localEntries.some((f) => f.images !== "__DELETED__");
    const hasLocalDeletions = deletedSlugs.size > 0;
    const serverFilters = Array.isArray(map.filters)
      ? (map.filters as Array<{ slug: string; label: string }>)
      : null;

    // Run whenever the page carries a filter strip AND we have something to
    // apply: live server filters, local additions (new filters), or local
    // deletions (tombstones). Crucially we also run for a deletion tombstone
    // even when map.filters is absent — otherwise a deleted filter would stay
    // visible on the preview page whenever /api/live returned no filters (e.g.
    // the R2 binding is missing), which is exactly the "deleted filter
    // reappears after refresh" failure mode.
    if ((isCoupling || isFilterTerm) && (serverFilters || hasLocalAdditions || hasLocalDeletions)) {
      const strip = document.querySelector<HTMLElement>(".filter-strip");
      if (strip) {
        // Prefer live server filters as the base list (they are fresher than the
        // static build). When live filters are unavailable/empty, fall back to the
        // server-rendered static strip already in the DOM so we never wipe it —
        // we only apply local deletions and additions on top.
        let baseFilters: Array<{ slug: string; label: string }>;
        if (serverFilters && serverFilters.length > 0) {
          baseFilters = serverFilters;
        } else {
          baseFilters = Array.from(strip.querySelectorAll<HTMLElement>(".filter-strip-item"))
            .map((el) => ({
              slug: el.dataset.filterSlug || "",
              label: el.querySelector("a")?.textContent || "",
            }))
            .filter((f) => f.slug);
        }
        // Merge base filters with local additions and respect deletion tombstones.
        // This ensures newly-created filters show up on the preview page even when
        // live/filters.json is stale or hasn't been written yet (e.g. R2 propagation
        // lag / missing bucket binding), and deleted filters stay hidden.
        const visibleFilters = mergeFilterLists(baseFilters);
        // Remove any previously added dynamic items
        strip.querySelectorAll<HTMLElement>(".filter-strip-item").forEach(el => el.remove());
        visibleFilters.forEach((f, index) => {
          const wrapper = document.createElement("span");
          wrapper.className = "filter-strip-item";
          wrapper.dataset.filterSlug = f.slug;
          const link = document.createElement("a");
          link.href = `/filter/${f.slug}/`;
          link.textContent = f.label;
          const sep = document.createElement("span");
          sep.className = "filter-comma";
          sep.textContent = index === visibleFilters.length - 1 ? ". " : ", ";
          wrapper.appendChild(link);
          wrapper.appendChild(sep);
          strip.appendChild(wrapper);
        });
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
