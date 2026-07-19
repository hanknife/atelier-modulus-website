# Project Workflow

This repository is the canonical source for the Atelier Modulus website:

```text
/Users/zijianhan/Documents/GitHub/atelier-modulus-website
https://github.com/hanknife/atelier-modulus-website
```

Do not edit the older working copy at `/Users/zijianhan/Documents/模象网站` unless the owner explicitly asks to recover something from it.

## Daily Editing Flow

1. Open this repository in GitHub Desktop.
2. Pull from `origin/main` before starting work.
3. Make code, content, and image changes in this local GitHub repository only.
4. Run:

```bash
pnpm install
pnpm build
```

5. Review the site locally with:

```bash
pnpm dev
```

6. If Codex made the change, Codex stages the changed files, writes a concise commit summary, and commits locally.
7. The owner handles pull and push in GitHub Desktop.
8. Let Cloudflare Pages deploy from GitHub.
9. Use Cloudflare preview or dev mode to inspect the deployed result.

## Codex Working Flow

Codex should use this path as the default working directory:

```text
/Users/zijianhan/Documents/GitHub/atelier-modulus-website
```

For each change, Codex should:

1. Check `git status --short --branch`.
2. Avoid overwriting user or Workbuddy changes.
3. Edit only the files needed for the requested change.
4. Run `pnpm build` before deployment handoff.
5. Stage the intended files only.
6. Write a concise commit summary from the actual diff and commit locally.
7. Do not pull or push unless the user explicitly asks.
8. Summarize changed files, commit hash, and verification results.

## Cloudflare Pages Settings

Use these Cloudflare Pages settings:

```text
Framework preset: Astro
Build command: pnpm build
Output directory: dist
Root directory: /
Production branch: main
```

Environment variables belong in Cloudflare settings, not in GitHub:

```text
DEEPSEEK_API_KEY
CHEAP_LLM_MODEL
```

## Content Updates

Project content lives in:

```text
src/content/projects
```

Images live in the Cloudflare R2 bucket (uploaded via the editor's
`/api/save` endpoint), not in the repo. The `/editor` route is where
images are replaced; they are served straight from R2.

For text polishing, translation, summary, and classification, use:

```bash
python tools/cheap_llm.py polish --input content/raw/example.txt --output content/processed/example.md
```

Codex should review DeepSeek output, formatting, and diffs, but should not rewrite large batches of copy directly.

## What Not To Commit

Never commit:

```text
.env
.env.local
node_modules
dist
.astro
.next
.vercel
API keys or secrets
```

