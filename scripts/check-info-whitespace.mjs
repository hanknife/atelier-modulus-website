// Guard: fail the build if any Info text field renders with a leading space.
//
// Why this exists: the Info leading-whitespace bug (a stray space before
// "Atelier Modulus GmbH" etc.) recurred because the same text is rendered in
// several places (public /info page, the editor's Info overlay, the R2 live
// override) and a manual fix touched only some of them. This script does the
// "global scan" automatically: after `astro build`, it checks every generated
// HTML file for an Info field whose content starts with a space, and exits
// non-zero (blocking deploy) if one is found.
//
// Detection rule: an element whose class contains one of the known Info
// fields, immediately followed by `>` then a space and a non-`<` character.
// This distinguishes real leading content whitespace (`> Atelier`) from
// harmless whitespace between tags (`> <div`).

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const DIST = "dist";
const FIELDS = [
  "info-address",
  "info-bio",
  "info-caption", // also matches info-caption-lecture
  "chip-exhibitions",
  "chip-lectures",
  "info-note",
];

// class="...info-X..."> <non-< char>  -> leading space inside content
const RE = new RegExp(
  `class="[^"]*(?:${FIELDS.join("|")})[^"]*"[^>]*> ([^<])`,
  "g"
);

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (p.endsWith(".html")) yield p;
  }
}

if (!statSync(DIST, { optional: true })) {
  console.error(`[check-info-whitespace] no ${DIST}/ found — run \`astro build\` first.`);
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
    console.error(`[check-info-whitespace] LEADING SPACE in ${file}`);
    console.error(`    …${snippet}…`);
  }
}

if (failures > 0) {
  console.error(`\n[check-info-whitespace] FAILED: ${failures} file(s) with leading Info whitespace.`);
  process.exit(1);
}

console.log("[check-info-whitespace] OK: no leading whitespace in any Info field.");
