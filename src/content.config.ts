import { defineCollection, z } from "astro:content";

const projects = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    year: z.number(),
    location: z.string(),
    type: z.string(),
    status: z.string(),
    collaborators: z.array(z.string()).default([]),
    description_cn: z.string(),
    description_en: z.string(),
    cover_image: z.string(),
    gallery: z.array(z.string()).default([]),
    tags: z.array(z.string()).default([]),
    display_date: z.string().optional(),
    featured: z.boolean().default(false),
    order: z.number().default(999)
  })
});

export const collections = { projects };
