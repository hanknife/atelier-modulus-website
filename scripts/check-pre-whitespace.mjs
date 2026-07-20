// Guard: fail the build if any pre-formatted text element renders with a
// leading space.
//
// Why this exists (general, not Info-specific): a class of bug where text is
// rendered inside a `white-space: pre` / `pre-wrap` element using a multiline
// template expression (`<div>\n  {value}\n</div>`); Astro preserves the
// indentation/newline as a visible leading space. The same text is often
// rendered in several places (public page, editor overlay, live override) and
// a manual fix can touch only some of them — exactly what happened with the
// Info page.
//
// This guard makes the check GENERIC: instead of a fixed list of class names,
// it scans every generated HTML file for ANY element whose inline style uses
// `white-space: pre` / `pre-wrap` and whose content starts with a space, and
// exits non-zero (blocking deploy) if one is found. So it catches the bug
// wherever it appears, now and in the future.
//
// Detection rule: an element with `white-space: pre(-wrap)` whose text content
// (right after `>`) begins with a space and a non-`<` character. This
// distinguishes real leading content whitespace (`> Atelier`) from harmless
// whitespace between tags (`> <div`).

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const DIST = "dist";
// Any element styled with white-space: pre or pre-wrap, followed by `> <space><non-<`.
const RE = /style="[^"]*white-space:\s*pre(-wrap)?[^"]*"[^>]*> ([^<])/g;

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (p.endsWith(".html")) yield p;
  }
}

if (!statSync(DIST, { optional: true })) {
  console.error(`[check-pre-whitespace] no ${DIST}/ found — run \`astro build\` first.`);
  process.exit(1);
}

let failures = 0;
for (const file of walk(DIST)) {
  const html = readFileSync(file, "utf8");
  RE.lastIndex = 0;
  const m = RE.exec(html);
  if (m) {
    failures++;
    const idx = m.index;
    const snippet = html.slice(Math.max(0, idx - 40), idx + 30).replace(/\n/g, " ");
    console.error(`[check-pre-whitespace] LEADING SPACE in ${file}`);
    console.error(`    …${snippet}…`);
  }
}

if (failures > 0) {
  console.error(`\n[check-pre-whitespace] FAILED: ${failures} pre-formatted element(s) with leading whitespace.`);
  process.exit(1);
}

console.log("[check-pre-whitespace] OK: no leading whitespace in any pre-formatted element.");
