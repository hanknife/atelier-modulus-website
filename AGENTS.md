# Codex Working Rules

Canonical working directory:

```text
/Users/Han/Documents/GitHub/atelier-modulus-website
```

This GitHub clone is the source of truth for the Cloudflare deployment. Do not use `/Users/Han/Documents/模象网站` for new edits unless the user explicitly asks to recover or compare old files from it.

1. Codex owns code, structure, deployment setup, tests, and final review.
2. Translation, polishing, summaries, classification, and batch copywriting must go through `tools/cheap_llm.py` and DeepSeek.
3. Codex should review DeepSeek output for format, tone, and diffs instead of rewriting large text batches directly.
4. Run `pnpm build` before launch or deployment handoff.
5. Never commit `.env`, `.env.local`, API keys, or secrets.
6. Keep project content in `src/content/projects`. Images live in the Cloudflare R2 bucket (uploaded via the editor's `/api/save` endpoint), not in the repo.
7. Prefer simple static-site changes over databases or server-only features.
8. IBM Plex is the canonical site typeface. Do not replace the `--mono` font stack or typography logic without explicit user approval.
8a. **LOCKED**: `--body-size: clamp(15px, 1.1vw, 20px)` is the canonical site-wide font-size. All text — nav, footer, project titles, meta, /View../ — inherits this single variable. Do not change this value without explicit user approval.
9. The project archive should preserve the Cargo reference behavior: fixed header/footer, same-page index overlays, image-click carousels, and independently scrollable left/right project columns on desktop.
10. Before editing, run `git status --short --branch` and preserve user, GitHub Desktop, or Workbuddy changes.
11. After Codex changes code or project files and `pnpm build` passes, Codex should stage the intended files, auto-write a concise commit summary, and commit locally. The owner handles pull and push.
12. Cloudflare Pages deploys from GitHub `main`; local `dist` is build output only and must not be committed.
13. Do not run `git pull` or `git push` unless the user explicitly asks.

14. **Interaction model — dialog-only, zero out-of-band operations (supersedes the user-action parts of rules 11 & 13).** The user works exclusively inside the chat dialog and will NOT perform any operation outside it. This means: no terminal/CLI commands, no hunting through GitHub settings or the connector panel, no creating PATs/tokens, no copying files/bundles, no extracting archives, no manual deploys. **Never suggest, request, or even hint that the user do any such step.** All technical work — code edits, staging, commits, pushes, Cloudflare deploys, file transfers — must be performed by the assistant entirely on its own side. If a needed capability is unavailable in the sandbox (e.g., a write-scoped GitHub token, so push is blocked), resolve it without routing a workaround back to the user: find an alternative path, or state the limitation plainly in the dialog. Do not convert a sandbox constraint into a "please do this on your end" task.
