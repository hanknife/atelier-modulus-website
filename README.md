# Atelier Modulus Static Site

Astro static website for an architecture studio portfolio. It replaces the Cargo site with a maintainable content system, local assets, and a small DeepSeek helper for low-cost text work.

## Visual Rules

The site uses IBM Plex as its canonical typeface through the global `--mono` font stack in `src/styles/global.css`. Do not change this font system unless the project owner explicitly asks for it.

The project archive follows the Cargo reference: fixed header and footer links, same-page index overlays for navigation, image-click carousels, and independently scrollable left/right project columns on desktop.

## Local Development

```bash
npm install
npm run dev
npm run build
```

`npm run dev` starts the local Astro server. `npm run build` runs Astro checks and generates the static site in `dist`.

## Add A Project

1. Add images to `public/images`, for example `public/images/my-project-cover.jpg`.
2. Create `src/content/projects/my-project.md`.
3. Fill the frontmatter fields:

```md
---
title: "My Project"
year: 2026
location: "City, Country"
type: "Residential"
status: "Built"
collaborators:
  - "Collaborator Name"
description_cn: "中文项目简介。"
description_en: "English project description."
cover_image: "/images/my-project-cover.jpg"
gallery:
  - "/images/my-project-01.jpg"
tags:
  - "housing"
featured: true
order: 4
---

Longer project note goes here.
```

The project list and detail route are generated automatically.

## Replace Images

Put optimized `.jpg`, `.png`, or `.webp` files in `public/images`. Reference them with root-relative paths such as `/images/project-cover.jpg`. Keep covers around 1600px wide for a good balance of quality and speed.

## DeepSeek Cheap LLM Helper

Copy `.env.example` to `.env` and add your key:

```bash
DEEPSEEK_API_KEY=your_key_here
CHEAP_LLM_MODEL=deepseek-v4-flash
```

Run text tasks through the helper:

```bash
python tools/cheap_llm.py polish --input content/raw/example.txt --output content/processed/example.md
python tools/cheap_llm.py translate --target zh-en --input content/raw/example.txt --output content/processed/example.en.md
python tools/cheap_llm.py summarize --input content/raw/example.txt --output content/processed/example.summary.md
python tools/cheap_llm.py classify --input content/raw/example.txt --output content/processed/example.json
```

Do not store real API keys in code, docs, or commits.

## Cloudflare Pages

1. Connect this repository in Cloudflare Pages.
2. Set build command to `npm run build`.
3. Set output directory to `dist`.
4. Add environment variables in Cloudflare, especially `DEEPSEEK_API_KEY` only if text tooling is needed in that environment.

## Vercel

1. Import the repository in Vercel.
2. Use the Astro framework preset or set build command to `npm run build`.
3. Set output directory to `dist`.
4. Add secrets in Vercel Environment Variables, never in the repo.

## Cargo Reference Notes

The original Cargo page uses a white field, IBM Plex typography, blue/red/green link accents, image-first project cards, fixed corner navigation, expandable same-page indexes, clickable image galleries, and two independently scrollable desktop project columns. This implementation keeps those cues while rebuilding the portfolio as a static Astro site.
