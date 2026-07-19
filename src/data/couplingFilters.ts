export interface CouplingFilter {
  slug: string;
  label: string;
  images: string[];
}

// Curated coupling filter terms. Each term links to /filter/{slug}/ and shows
// a filtered masonry of the images listed below.
//
// The image sets are placeholders — add or remove entries as the coupling
// vocabulary grows. Each entry is an R2 URL (images live in the R2 bucket,
// not in the repo).
export const couplingFilters: CouplingFilter[] = [
  {
    slug: "circle-square-circle",
    label: "Circle-Square-Circle",
    images: [
      "https://pub-e0d304e4d3564adbb6c3cbf768403529.r2.dev/cargo-p-delta.png",
      "https://pub-e0d304e4d3564adbb6c3cbf768403529.r2.dev/cargo-p-delta-01.png",
      "https://pub-e0d304e4d3564adbb6c3cbf768403529.r2.dev/cargo-p-delta-02.png",
      "https://pub-e0d304e4d3564adbb6c3cbf768403529.r2.dev/project-1-1.jpg",
      "https://pub-e0d304e4d3564adbb6c3cbf768403529.r2.dev/project-1-2.jpg"
    ]
  },
  {
    slug: "among-the-trees",
    label: "Among the Trees",
    images: [
      "https://pub-e0d304e4d3564adbb6c3cbf768403529.r2.dev/cargo-xiaobo.png",
      "https://pub-e0d304e4d3564adbb6c3cbf768403529.r2.dev/cargo-xiaobo-02.png",
      "https://pub-e0d304e4d3564adbb6c3cbf768403529.r2.dev/cargo-xiaobo-03.png",
      "https://pub-e0d304e4d3564adbb6c3cbf768403529.r2.dev/project-2-1.jpg",
      "https://pub-e0d304e4d3564adbb6c3cbf768403529.r2.dev/project-2-2.jpg"
    ]
  }
];
