export interface CouplingFilter {
  slug: string;
  label: string;
  images: string[];
}

// Curated coupling filter terms. Each term links to /filter/{slug}/ and shows
// a filtered masonry of the images listed below.
//
// The image sets are placeholders — add or remove entries as the coupling
// vocabulary grows. Each image is a path under /public/images.
export const couplingFilters: CouplingFilter[] = [
  {
    slug: "circle-square-circle",
    label: "Circle-Square-Circle",
    images: [
      "/images/cargo-p-delta.png",
      "/images/cargo-p-delta-01.png",
      "/images/cargo-p-delta-02.png",
      "/images/project-1-1.jpg",
      "/images/project-1-2.jpg"
    ]
  },
  {
    slug: "among-the-trees",
    label: "Among the Trees",
    images: [
      "/images/cargo-xiaobo.png",
      "/images/cargo-xiaobo-02.png",
      "/images/cargo-xiaobo-03.png",
      "/images/project-2-1.jpg",
      "/images/project-2-2.jpg"
    ]
  }
];
