# Codex Working Rules

1. Codex owns code, structure, deployment setup, tests, and final review.
2. Translation, polishing, summaries, classification, and batch copywriting must go through `tools/cheap_llm.py` and DeepSeek.
3. Codex should review DeepSeek output for format, tone, and diffs instead of rewriting large text batches directly.
4. Run `npm run build` before launch or deployment handoff.
5. Never commit `.env`, `.env.local`, API keys, or secrets.
6. Keep project content in `src/content/projects` and image assets in `public/images`.
7. Prefer simple static-site changes over databases or server-only features.
8. IBM Plex is the canonical site typeface. Do not replace the `--mono` font stack or typography logic without explicit user approval.
9. The project archive should preserve the Cargo reference behavior: fixed header/footer, same-page index overlays, image-click carousels, and independently scrollable left/right project columns on desktop.
