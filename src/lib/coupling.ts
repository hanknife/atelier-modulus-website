import { getCollection } from "astro:content";
import sizeOf from "image-size";

export interface CouplingImageMeta {
  image: string;
  width: number;
  height: number;
  slug: string;
  side: "left" | "right";
}

// Manual overrides for images that appear in multiple projects.
const manualImageOwners: Record<string, string> = {
  "/images/project-1-1.jpg": "ruin",
  "/images/project-1-2.jpg": "pagoda-000",
  "/images/project-1-3.jpg": "pagoda-000",
  "/images/project-2-1.jpg": "black-room",
  "/images/project-2-2.jpg": "the-world-we-live-in-000",
  "/images/project-2-3.jpg": "the-world-we-live-in-000",
  "/images/project-3-1.jpg": "computing-hut-02",
  "/images/project-3-2.jpg": "computing-hut-02",
  "/images/project-3-3.jpg": "computing-hut-02",
  "/images/cargo-p-delta.png": "archive-pavilion",
  "/images/cargo-p-delta-01.png": "archive-pavilion",
  "/images/cargo-p-delta-02.png": "archive-pavilion",
  "/images/cargo-p-delta-03.png": "archive-pavilion",
  "/images/cargo-xiaobo.png": "courtyard-house",
  "/images/cargo-xiaobo-02.png": "courtyard-house",
  "/images/cargo-xiaobo-03.png": "courtyard-house"
};

/**
 * Build display metadata for a list of coupling board images.
 * Reads dimensions at build time and resolves each image to its owning
 * project (slug + side) so tiles can open the correct detail overlay.
 */
export async function getImageMeta(images: string[]): Promise<CouplingImageMeta[]> {
  const projects = (await getCollection("projects")).sort(
    (a, b) => a.data.order - b.data.order
  );
  const bySlug = Object.fromEntries(
    projects.map((p) => [p.id.replace(/\.mdx?$/, ""), p])
  );

  return images.map((image) => {
    const filePath = new URL(`../../public${image}`, import.meta.url).pathname;
    const dims = sizeOf(filePath) || { width: 1, height: 1 };
    const width = dims.width ?? 1;
    const height = dims.height ?? 1;
    const ownerSlug = manualImageOwners[image];
    const owner = ownerSlug ? bySlug[ownerSlug] : undefined;
    const slug = owner ? owner.id.replace(/\.mdx?$/, "") : "";
    const side: "left" | "right" =
      owner && owner.data.category === "lehrgerueste" ? "right" : "left";
    return { image, width, height, slug, side };
  });
}
