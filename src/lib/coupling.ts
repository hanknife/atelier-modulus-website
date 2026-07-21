import { getCollection } from "astro:content";

export interface CouplingImageMeta {
  image: string;
  slug: string;
  side: "left" | "right";
  // true for the project's cover_image tile (the first image), false for
  // gallery images. Used by live-patch to target only the cover tile when a
  // cover image is swapped in the editor.
  isCover: boolean;
}

// Manual overrides for images that appear in multiple projects.
// Keyed by R2 URL. Used by the curated /filter pages, which pass a flat list
// of image URLs and need each one mapped back to its owning project.
const manualImageOwners: Record<string, string> = {
  "https://pub-e0d304e4d3564adbb6c3cbf768403529.r2.dev/project-1-1.jpg": "ruin",
  "https://pub-e0d304e4d3564adbb6c3cbf768403529.r2.dev/project-1-2.jpg": "pagoda-000",
  "https://pub-e0d304e4d3564adbb6c3cbf768403529.r2.dev/project-1-3.jpg": "pagoda-000",
  "https://pub-e0d304e4d3564adbb6c3cbf768403529.r2.dev/project-2-1.jpg": "black-room",
  "https://pub-e0d304e4d3564adbb6c3cbf768403529.r2.dev/project-2-2.jpg": "the-world-we-live-in-000",
  "https://pub-e0d304e4d3564adbb6c3cbf768403529.r2.dev/project-2-3.jpg": "the-world-we-live-in-000",
  "https://pub-e0d304e4d3564adbb6c3cbf768403529.r2.dev/project-3-1.jpg": "computing-hut-02",
  "https://pub-e0d304e4d3564adbb6c3cbf768403529.r2.dev/project-3-2.jpg": "computing-hut-02",
  "https://pub-e0d304e4d3564adbb6c3cbf768403529.r2.dev/project-3-3.jpg": "computing-hut-02",
  "https://pub-e0d304e4d3564adbb6c3cbf768403529.r2.dev/cargo-p-delta.png": "archive-pavilion",
  "https://pub-e0d304e4d3564adbb6c3cbf768403529.r2.dev/cargo-p-delta-01.png": "archive-pavilion",
  "https://pub-e0d304e4d3564adbb6c3cbf768403529.r2.dev/cargo-p-delta-02.png": "archive-pavilion",
  "https://pub-e0d304e4d3564adbb6c3cbf768403529.r2.dev/cargo-p-delta-03.png": "archive-pavilion",
  "https://pub-e0d304e4d3564adbb6c3cbf768403529.r2.dev/cargo-xiaobo.png": "courtyard-house",
  "https://pub-e0d304e4d3564adbb6c3cbf768403529.r2.dev/cargo-xiaobo-02.png": "courtyard-house",
  "https://pub-e0d304e4d3564adbb6c3cbf768403529.r2.dev/cargo-xiaobo-03.png": "courtyard-house"
};

/**
 * Resolve a flat list of image URLs (the curated /filter pages) to coupling
 * items. Each URL is mapped back to its owning project (slug + side) via the
 * manual owner map so a tile can open the correct detail overlay.
 */
export async function getImageMeta(images: string[]): Promise<CouplingImageMeta[]> {
  const projects = (await getCollection("projects")).sort(
    (a, b) => a.data.order - b.data.order
  );
  const bySlug = Object.fromEntries(
    projects.map((p) => [p.id.replace(/\.mdx?$/, ""), p])
  );

  return images.map((image) => {
    const ownerSlug = manualImageOwners[image];
    const owner = ownerSlug ? bySlug[ownerSlug] : undefined;
    const slug = owner ? owner.id.replace(/\.mdx?$/, "") : "";
    const side: "left" | "right" =
      owner && owner.data.category === "lehrgerueste" ? "right" : "left";
    return { image, slug, side, isCover: true };
  });
}

/**
 * Build every coupling item directly from the projects collection: for each
 * project (both `projects` and `lehrgerueste`) emit the cover image plus all
 * gallery images, tagged with its owning slug + side. This is the single
 * source of truth for the /coupling/ waterfall — it always reflects the
 * current frontmatter, so adding, replacing, or reordering project images
 * shows up here automatically on the next build. No URL→slug lookup table is
 * needed because the owner is known while we iterate the collection.
 */
export async function getAllCouplingItems(): Promise<CouplingImageMeta[]> {
  const projects = (await getCollection("projects")).sort(
    (a, b) => a.data.order - b.data.order
  );
  const items: CouplingImageMeta[] = [];
  for (const p of projects) {
    const slug = p.id.replace(/\.mdx?$/, "");
    const side: "left" | "right" =
      p.data.category === "lehrgerueste" ? "right" : "left";
    const cover = p.data.cover_image;
    if (typeof cover === "string" && cover.length > 0) {
      items.push({ image: cover, slug, side, isCover: true });
    }
    for (const g of p.data.gallery ?? []) {
      if (typeof g === "string" && g.length > 0) {
        items.push({ image: g, slug, side, isCover: false });
      }
    }
  }
  return items;
}
