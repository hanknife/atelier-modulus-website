# Codex Working Rules

Canonical working directory:

```text
/Users/zijianhan/Documents/GitHub/atelier-modulus-website
```

This GitHub clone is the source of truth for the Cloudflare deployment. Do not use `/Users/zijianhan/Documents/模象网站` for new edits unless the user explicitly asks to recover or compare old files from it.

1. Codex owns code, structure, deployment setup, tests, and final review.
2. Translation, polishing, summaries, classification, and batch copywriting must go through `tools/cheap_llm.py` and DeepSeek.
3. Codex should review DeepSeek output for format, tone, and diffs instead of rewriting large text batches directly.
4. Run `npm run build` before launch or deployment handoff.
5. Never commit `.env`, `.env.local`, API keys, or secrets.
6. Keep project content in `src/content/projects` and image assets in `public/images`.
7. Prefer simple static-site changes over databases or server-only features.
8. IBM Plex is the canonical site typeface. Do not replace the `--mono` font stack or typography logic without explicit user approval.
9. The project archive should preserve the Cargo reference behavior: fixed header/footer, same-page index overlays, image-click carousels, and independently scrollable left/right project columns on desktop.
10. Before editing, run `git status --short --branch` and preserve user, GitHub Desktop, or Workbuddy changes.
11. After Codex changes code or project files and `npm run build` passes, Codex should stage the intended files, auto-write a concise commit summary, and commit locally. The owner handles pull and push.
12. Cloudflare Pages deploys from GitHub `main`; local `dist` is build output only and must not be committed.
13. Do not run `git pull` or `git push` unless the user explicitly asks.
