import { getCollection } from "astro:content";

export interface CouplingImageMeta {
  image: string;
  slug: string;
  side: "left" | "right";
}

// Manual overrides for images that appear in multiple projects.
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
 * Resolve each coupling-board image to its owning project (slug + side) so a
 * tile can open the correct detail overlay. Image dimensions are NOT needed
 * here — the board's masonry sizes each tile from its rendered height at
 * runtime (see CouplingBoard.astro).
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
    return { image, slug, side };
  });
}
