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
 * Build display metadata for a list of coupling board images.
 * Each `image` is now an R2 URL (images were migrated out of the repo into
 * the R2 bucket). Dimensions are read from the remote URL at build time; if
 * that fails we fall back to 1×1 so the build never breaks.
 */
async function readDims(url: string): Promise<{ width: number; height: number }> {
  try {
    const res = await fetch(url);
    if (!res.ok) return { width: 1, height: 1 };
    const buf = new Uint8Array(await res.arrayBuffer());
    const d = sizeOf(buf);
    return { width: d.width ?? 1, height: d.height ?? 1 };
  } catch {
    return { width: 1, height: 1 };
  }
}

export async function getImageMeta(images: string[]): Promise<CouplingImageMeta[]> {
  const projects = (await getCollection("projects")).sort(
    (a, b) => a.data.order - b.data.order
  );
  const bySlug = Object.fromEntries(
    projects.map((p) => [p.id.replace(/\.mdx?$/, ""), p])
  );

  return Promise.all(
    images.map(async (image) => {
      const { width, height } = await readDims(image);
      const ownerSlug = manualImageOwners[image];
      const owner = ownerSlug ? bySlug[ownerSlug] : undefined;
      const slug = owner ? owner.id.replace(/\.mdx?$/, "") : "";
      const side: "left" | "right" =
        owner && owner.data.category === "lehrgerueste" ? "right" : "left";
      return { image, width, height, slug, side };
    })
  );
}
