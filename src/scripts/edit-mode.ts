// In-page WYSIWYG editor for Atelier Modulus.
// Enters "edit mode" from a floating button, makes card text directly editable,
// allows replacing cover images, and adding/removing project cards. Saving is
// sent to /api/save (Cloudflare Pages Function) which writes back to GitHub.
// The visible site layout is untouched; only data-* hooks and an edit bar are added.

declare global {
  interface Window {
    // Coupling management page reuses the floating edit bar for filter editing.
    amFilterEdit?: {
      enter: () => void;
      exit: () => void;
      create: () => void;
    };
  }
}

const API = "/api/save";
const EDIT_MODE_CLASS = "edit-mode";
const PASS_KEY = "am_edit_pass";

// ---- Custom monochrome dialogs -------------------------------------------
// Replace native confirm() / alert() so every editor interaction stays
// in the site's black-and-white visual language.
function showDialog(msg: string): Promise<boolean> {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "am-dialog-overlay";
    overlay.innerHTML =
      `<div class="am-dialog-box" role="alertdialog" aria-modal="true">
        <p class="am-dialog-msg">${msg}</p>
        <div class="am-dialog-actions">
          <button class="am-dialog-btn am-dialog-cancel" type="button">取消</button>
          <button class="am-dialog-btn am-dialog-ok" type="button">确定</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const ok = overlay.querySelector<HTMLElement>(".am-dialog-ok")!;
    const cancel = overlay.querySelector<HTMLElement>(".am-dialog-cancel")!;

    const close = (result: boolean) => {
      overlay.remove();
      resolve(result);
    };
    ok.addEventListener("click", () => close(true));
    cancel.addEventListener("click", () => close(false));
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(false); });
    document.addEventListener(
      "keydown",
      (e) => { if (e.key === "Escape") close(false); },
      { once: true }
    );
    setTimeout(() => ok.focus(), 50);
  });
}

/** Information-only dialog (single OK button). Replaces native alert(). */
function showAlert(msg: string): Promise<void> {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "am-dialog-overlay";
    overlay.innerHTML =
      `<div class="am-dialog-box" role="alertdialog" aria-modal="true">
        <p class="am-dialog-msg">${msg}</p>
        <div class="am-dialog-actions">
          <button class="am-dialog-btn am-dialog-ok" type="button">确定</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const ok = overlay.querySelector<HTMLElement>(".am-dialog-ok")!;
    const close = () => { overlay.remove(); resolve(); };
    ok.addEventListener("click", close);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
    document.addEventListener(
      "keydown",
      (e) => { if (e.key === "Escape") close(); },
      { once: true }
    );
    setTimeout(() => ok.focus(), 50);
  });
}

type Fm = Record<string, any>;

function getPass(): string {
  let p = sessionStorage.getItem(PASS_KEY);
  if (!p) {
    p = window.prompt("输入编辑密码") || "";
    if (p) sessionStorage.setItem(PASS_KEY, p);
  }
  return p;
}

function parseFm(el: HTMLElement): Fm {
  try {
    return JSON.parse(el.dataset.frontmatter || "{}");
  } catch {
    return {};
  }
}

// ---- Local persistence -----------------------------------------------------
// Keep the editor showing the user's latest edits across reloads, even during
// the 1–2 min Cloudflare rebuild. This only affects the /editor workspace
// (the user's own editing surface); the public site is untouched and is still
// rebuilt from frontmatter. No red lines crossed — on the public site, text
// remains frontmatter-driven; here we merely re-show what the user typed.
const LS_KEY = "am_editor_overrides_v4";

function loadOverrides(): Record<string, any> {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || "{}");
  } catch {
    return {};
  }
}

function collectOverrides(): Record<string, any> {
  const state: Record<string, any> = {};
  // Collect both the editing-surface column cards and the info overlay. The
  // detail overlays are also .project-card and share the same path/slug;
  // including them would overwrite the live edits with stale server frontmatter.
  document.querySelectorAll<HTMLElement>(".project-column .project-card, .info-overlay").forEach((card) => {
    const key = card.dataset.path || card.dataset.slug;
    if (!key) return;
    state[key] = {
      frontmatter: card.dataset.frontmatter,
      isNew: card.dataset.isNew,
      toDelete: card.dataset.toDelete,
      dirty: card.dataset.dirty || undefined,
      deletedImages: card.dataset.deletedImages || undefined,
    };
  });
  return state;
}

function persistOverrides() {
  localStorage.setItem(LS_KEY, JSON.stringify(collectOverrides()));
}

/** Mark a card as having unsaved changes — only dirty cards get sent on save. */
function markDirty(card: HTMLElement) {
  card.dataset.dirty = "1";
}

function applyOverrides() {
  const state = loadOverrides();
  document.querySelectorAll<HTMLElement>(".project-card, .info-overlay").forEach((card) => {
    const key = card.dataset.path || card.dataset.slug;
    const s = key ? state[key] : undefined;
    if (!s) return;
    if (s.frontmatter) card.dataset.frontmatter = s.frontmatter;
    if (s.isNew) card.dataset.isNew = s.isNew;
    if (s.toDelete) card.dataset.toDelete = s.toDelete;
    if (s.dirty) card.dataset.dirty = s.dirty;
    if (s.deletedImages) card.dataset.deletedImages = s.deletedImages;
    const fm = parseFm(card);
    card.querySelectorAll<HTMLElement>("[data-edit]").forEach((span) => {
      const f = span.dataset.edit;
      if (!f || fm[f] == null) return;
      let val: any = fm[f];
      if (f === "year" && fm.display_date) val = fm.display_date;
      if (span.dataset.editHtml === "true") {
        span.innerHTML = String(val);
      } else {
        span.textContent = String(val)
          .split("\n")
          .map((line) => line.trim())
          .join("\n")
          .trim();
      }
    });
    const img = card.querySelector<HTMLImageElement>("img");
    if (img && fm.cover_image) img.src = fm.cover_image;
    const btn = card.querySelector<HTMLElement>(".project-carousel");
    if (btn && fm.cover_image) {
      try {
        const arr = JSON.parse(btn.dataset.images || "[]");
        arr[0] = fm.cover_image;
        btn.dataset.images = JSON.stringify(arr);
      } catch {
        /* ignore */
      }
    }
    if (s.toDelete === "1") card.style.display = "none";
    // Restore gallery images from frontmatter (handles added/removed/reordered).
    const gallery = card.querySelector<HTMLElement>(".detail-gallery");
    if (gallery && Array.isArray(fm.gallery)) {
      gallery.innerHTML = ""; // clear and rebuild from fm
      const allImages = [fm.cover_image, ...fm.gallery];
      allImages.forEach((url, i) => {
        const wrap = createGalleryImgWrap(url, i === 0);
        gallery.appendChild(wrap);
      });
      initGalleryDragDrop(gallery, card);
    }
  });
}

function yamlVal(v: any): string {
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) {
    if (v.length === 0) return "[]";
    return "[" + v.map((x) => JSON.stringify(String(x))).join(", ") + "]";
  }
  const s = v === null || v === undefined ? "" : String(v);
  if (s === "") return '""';
  // Multiline strings are easiest to read as literal block scalars.
  if (s.includes("\n")) {
    return "|\n" + s.split("\n").map((line) => "  " + line).join("\n");
  }
  if (/[:#\-?\[\]{}&*!|>'"%@`,\n]/.test(s) || /^\s|\s$/.test(s)) return JSON.stringify(s);
  // Strings that look like a number/boolean/null must stay quoted, or YAML
  // will coerce them (e.g. display_date: "2025" -> 2025) and fail the schema.
  if (/^-?\d+(?:\.\d+)?$/.test(s)) return JSON.stringify(s);
  if (/^(?:true|false|null|~|yes|no|on|off)$/i.test(s)) return JSON.stringify(s);
  return s;
}

function fieldVal(el: HTMLElement): string {
  if (el.dataset.editHtml === "true") return el.innerHTML ?? "";
  return (el.innerText ?? "")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();
}

function serializeInfo(fm: Fm): string {
  const fields = [
    "address", "bio", "exhibitions_label", "exhibitions_note_html",
    "lectures_label", "lectures_caption", "footer_caption", "page_image",
  ];
  const lines = ["---"];
  for (const f of fields) {
    if (!(f in fm)) continue;
    lines.push(`${f}: ${yamlVal(fm[f])}`);
  }
  lines.push("---", "", fm.__body ?? "");
  return lines.join("\n");
}

function pickInfoFields(fm: Fm): Record<string, string> {
  const fields = [
    "address", "bio", "exhibitions_label", "exhibitions_note_html",
    "lectures_label", "lectures_caption", "footer_caption",
  ];
  const out: Record<string, string> = {};
  for (const f of fields) {
    if (f in fm) out[f] = String(fm[f] ?? "");
  }
  return out;
}

function serializeFm(fm: Fm): string {
  const fields = [
    "title", "list_title", "year", "location", "type", "status",
    "collaborators", "description_cn", "description_en", "cover_image",
    "gallery", "tags", "category", "display_date", "featured", "order",
  ];
  const lines = ["---"];
  for (const f of fields) {
    if (!(f in fm)) continue;
    const v = fm[f];
    if (f === "list_title" && (v === undefined || v === null || v === "")) continue;
    lines.push(`${f}: ${yamlVal(v)}`);
  }
  lines.push("---", "", fm.__body ?? "Placeholder.");
  return lines.join("\n");
}

// Compress a local image to a web-friendly size before upload so cover-image
// swaps feel instant. Cover images are shown small on the site, so downscaling
// to ~1600px and re-encoding as JPEG (PNG stays PNG) is invisible but makes the
// upload payload a few hundred KB instead of several MB.
async function compressImage(file: File, maxDim = 1600, quality = 0.82): Promise<{ blob: Blob; type: string }> {
  const bitmap = await createImageBitmap(file);
  let { width, height } = bitmap;
  const scale = Math.min(1, maxDim / Math.max(width, height));
  width = Math.max(1, Math.round(width * scale));
  height = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return { blob: file, type: file.type || "image/jpeg" };
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const isPng = file.type === "image/png";
  const outType = isPng ? "image/png" : "image/jpeg";
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("canvas.toBlob failed"))),
      outType,
      isPng ? undefined : quality
    );
  });
  return { blob, type: outType };
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // result is "data:<type>;base64,<data>" — strip the prefix.
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function uploadImage(file: File): Promise<string> {
  let blob: Blob = file;
  let type = file.type || "image/jpeg";
  try {
    const c = await compressImage(file);
    blob = c.blob;
    type = c.type;
  } catch {
    /* fall back to the original file if compression isn't supported */
  }
  const b64 = await blobToBase64(blob);
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "upload",
      filename: file.name,
      data: b64,
      contentType: type,
      passcode: getPass(),
    }),
  });
  const j = (await res.json()) as { url?: string; error?: string };
  if (!j.url) throw new Error(j.error || "upload failed");
  return j.url;
}

function makeCardEditable(card: HTMLElement) {
  card.querySelectorAll<HTMLElement>("[data-edit]").forEach((el) => (el.contentEditable = "true"));
  const controls = card.querySelector<HTMLElement>(".edit-controls");
  if (controls) controls.hidden = false;
}

function setEditable(on: boolean) {
  document.querySelectorAll<HTMLElement>("[data-edit]").forEach((el) => (el.contentEditable = on ? "true" : "false"));
  document.querySelectorAll<HTMLElement>(".edit-controls").forEach((el) => (el.hidden = !on));
}

function enterEdit() {
  const pass = getPass();
  if (!pass) return;
  document.body.classList.add(EDIT_MODE_CLASS);
  setEditable(true);
  setupGalleryEdit(); // wrap gallery images, add X buttons, enable drag-drop
  const bar = document.getElementById("edit-bar");
  const toggle = bar?.querySelector<HTMLElement>("#edit-toggle");
  const save = bar?.querySelector<HTMLElement>("#edit-save");
  const nl = bar?.querySelector<HTMLElement>("#edit-new-left");
  const nr = bar?.querySelector<HTMLElement>("#edit-new-right");
  const feCreate = bar?.querySelector<HTMLElement>("#fe-create");
  if (toggle) toggle.textContent = "退出(不保存)";
  if (save) save.hidden = false;
  if (nl) nl.hidden = false;
  if (nr) nr.hidden = false;
  if (feCreate) feCreate.hidden = false;
}

/** Leave edit mode and return to the read-only landing view of the editor.
    The current DOM already holds the saved values, so the landing page shows
    the latest edits immediately (no reload needed). */
function exitEdit() {
  document.body.classList.remove(EDIT_MODE_CLASS);
  setEditable(false);
  // Unwrap gallery images back to their original <img> markup so the landing
  // view and detail overlays render in their normal (non-edit) layout.
  document.querySelectorAll<HTMLElement>(".detail-gallery .gallery-img-wrap").forEach((wrap) => {
    const img = wrap.querySelector("img");
    if (img) wrap.replaceWith(img);
  });
  // Drop cards that were deleted during this session.
  document.querySelectorAll<HTMLElement>('.project-card[data-to-delete="1"]').forEach((c) => c.remove());
  // Rebuild the overlay menus so the editor landing page reflects the latest
  // edits (and the correct lehrgerueste naming format) immediately.
  updateOverlayListsFromDOM();
  // Reset the floating bar to its landing (edit) state.
  const bar = document.getElementById("edit-bar");
  const toggle = bar?.querySelector<HTMLElement>("#edit-toggle");
  const save = bar?.querySelector<HTMLElement>("#edit-save");
  const nl = bar?.querySelector<HTMLElement>("#edit-new-left");
  const nr = bar?.querySelector<HTMLElement>("#edit-new-right");
  const feCreate = bar?.querySelector<HTMLElement>("#fe-create");
  if (toggle) toggle.textContent = "编辑";
  if (save) save.hidden = true;
  if (nl) nl.hidden = true;
  if (nr) nr.hidden = true;
  if (feCreate) feCreate.hidden = true;
}

/** Rebuild the PROJECTS / LEHRGERÜSTE overlay lists from the current DOM so
    edits (new cards, renames, deletions) are visible immediately on the
    editor's landing page without waiting for the Cloudflare rebuild. */
function updateOverlayListsFromDOM() {
  // Only use the column cards (EditorCards) as the source of truth. The
  // detail overlays also carry .project-card, so including them would
  // duplicate every entry.
  const cards = Array.from(document.querySelectorAll<HTMLElement>(".project-column .project-card"));
  type Item = { slug: string; category: string; order: number; text: string; side: "left" | "right" };
  const items: Item[] = [];
  for (const card of cards) {
    const fm = parseFm(card);
    const slug = card.dataset.slug;
    if (!slug) continue;
    const category = (fm.category || card.dataset.category || "projects") as string;
    items.push({
      slug,
      category,
      order: Number.isFinite(Number(fm.order)) ? Number(fm.order) : 0,
      text: String(fm.list_title ?? fm.title ?? ""),
      side: category === "lehrgerueste" ? "right" : "left",
    });
  }

  // Project list: sort by the displayed text (list_title) so the leading
  // three-digit number determines the order. This puts "000 New Project" at
  // the top and matches the user's expectation of small-to-large numbering.
  // Lehrgerueste keeps its order-based sort because its numbers appear on
  // the right side of the list_title.
  const projects = items.filter((i) => i.category === "projects").sort((a, b) => a.text.localeCompare(b.text));
  const lehr = items.filter((i) => i.category === "lehrgerueste").sort((a, b) => a.order - b.order);

  const buildNav = (list: Item[], side: "left" | "right") => {
    const frag = document.createDocumentFragment();
    for (const item of list) {
      const a = document.createElement("a");
      a.href = `/?open=${item.slug}&side=${side}`;
      a.dataset.detailSlug = item.slug;
      a.dataset.detailSide = side;
      a.textContent = item.text;
      frag.appendChild(a);
    }
    return frag;
  };

  const projectNav = document.querySelector("#projects-overlay nav");
  if (projectNav) {
    projectNav.innerHTML = "";
    projectNav.appendChild(buildNav(projects, "left"));
  }
  const lehrNav = document.querySelector("#lehrgerueste-overlay nav");
  if (lehrNav) {
    lehrNav.innerHTML = "";
    lehrNav.appendChild(buildNav(lehr, "right"));
  }
}

// ---- Gallery edit: wrap images, X delete button, drag-drop reorder ---------
// Called once when entering edit mode. Wraps every <img> in .detail-gallery
// inside a .gallery-img-wrap div, adds ✕ delete buttons on non-cover images,
// and sets up HTML5 drag-and-drop for reordering.
function setupGalleryEdit() {
  document.querySelectorAll<HTMLElement>(".detail-gallery").forEach((gallery) => {
    const card = gallery.closest<HTMLElement>(".project-card");
    if (!card) return;

    // Wrap each existing bare <img> in a .gallery-img-wrap.
    const imgs = Array.from(gallery.querySelectorAll<HTMLImageElement>("img"));
    imgs.forEach((img, i) => {
      if (img.parentElement?.classList.contains("gallery-img-wrap")) return; // already wrapped
      const wrap = document.createElement("div");
      wrap.className = "gallery-img-wrap" + (i === 0 ? " is-cover" : "");
      wrap.draggable = true;
      img.before(wrap);
      wrap.appendChild(img);
      // X delete button — skip cover (index 0).
      if (i > 0) {
        const btn = document.createElement("span");
        btn.className = "gallery-del-btn";
        wrap.appendChild(btn);
      }
    });

    initGalleryDragDrop(gallery, card);
  });
}

/** Create a single wrapped image element for appending to a gallery. */
function createGalleryImgWrap(src: string, isCover = false): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "gallery-img-wrap" + (isCover ? " is-cover" : "");
  wrap.draggable = true;
  const img = document.createElement("img");
  img.src = src;
  img.alt = "";
  img.loading = "lazy";
  wrap.appendChild(img);
  if (!isCover) {
    const btn = document.createElement("span");
    btn.className = "gallery-del-btn";
    wrap.appendChild(btn);
  }
  return wrap;
}

/** Read current gallery image order from DOM back into frontmatter.
    Also syncs cover image to ALL cards sharing the same slug (overlay + main page). */
function syncGalleryFromDOM(card: HTMLElement) {
  const gallery = card.querySelector<HTMLElement>(".detail-gallery");
  if (!gallery) return;
  const wraps = gallery.querySelectorAll<HTMLImageElement>(".gallery-img-wrap img");
  const urls = Array.from(wraps).map((img) => img.src);
  if (urls.length === 0) return;

  const fm = parseFm(card);
  fm.cover_image = urls[0];
  fm.gallery = urls.slice(1); // everything after first
  card.dataset.frontmatter = JSON.stringify(fm);

  // Update THIS card's visible cover image.
  const cardImg = card.querySelector<HTMLImageElement>("img");
  if (cardImg) cardImg.src = urls[0];

  // Sync carousel data-images (used by the image viewer).
  const carousel = card.querySelector<HTMLElement>(".project-carousel");
  if (carousel) {
    try {
      carousel.dataset.images = JSON.stringify(urls);
    } catch { /* ignore */ }
  }

  // Cross-sync: find ALL other .project-card elements with the same data-slug
  // (e.g. the EditorCard on the main page when editing inside an overlay)
  // and update their cover + frontmatter too.
  const slug = card.dataset.slug;
  if (!slug) return;
  document.querySelectorAll<HTMLElement>(".project-card").forEach((other) => {
    if (other === card || other.dataset.slug !== slug) return;
    other.dataset.frontmatter = JSON.stringify(fm);
    const otherImg = other.querySelector<HTMLImageElement>("img");
    if (otherImg) otherImg.src = urls[0];
    const otherCarousel = other.querySelector<HTMLElement>(".project-carousel");
    if (otherCarousel) {
      try { otherCarousel.dataset.images = JSON.stringify(urls); } catch { /* ignore */ }
    }
  });
}

// ---- Drag-drop reorder -----------------------------------------------
function initGalleryDragDrop(gallery: HTMLElement, card: HTMLElement) {
  let dragSrc: HTMLElement | null = null;

  gallery.addEventListener("dragstart", (e) => {
    dragSrc = (e.target as HTMLElement).closest<HTMLElement>(".gallery-img-wrap") ?? null;
    if (dragSrc) dragSrc.classList.add("dragging");
    e.dataTransfer!.effectAllowed = "move";
  });

  gallery.addEventListener("dragend", () => {
    if (dragSrc) dragSrc.classList.remove("dragging");
    dragSrc = null;
    gallery.querySelectorAll<HTMLElement>(".gallery-img-wrap").forEach((el) => el.classList.remove("drag-over"));
    syncGalleryFromDOM(card);
    markDirty(card);
    persistOverrides();
  });

  gallery.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer!.dropEffect = "move";
    const target = (e.target as HTMLElement).closest<HTMLElement>(".gallery-img-wrap");
    if (target && target !== dragSrc) {
      target.classList.add("drag-over");
    }
  });

  gallery.addEventListener("dragleave", (e) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>(".gallery-img-wrap");
    if (target) target.classList.remove("drag-over");
  });

  gallery.addEventListener("drop", (e) => {
    e.preventDefault();
    const target = (e.target as HTMLElement).closest<HTMLElement>(".gallery-img-wrap");
    if (!target || !dragSrc || target === dragSrc) return;
    target.classList.remove("drag-over");

    // Insert before or after depending on pointer position.
    const rect = target.getBoundingClientRect();
    const midX = rect.left + rect.width / 2;
    if ((e as DragEvent).clientX < midX) {
      target.before(dragSrc);
    } else {
      target.after(dragSrc);
    }
  });
}

function newProject(side: "left" | "right") {
  if (!document.body.classList.contains(EDIT_MODE_CLASS)) enterEdit();
  const category = side === "left" ? "projects" : "lehrgerueste";
  const slug = "new-" + Date.now();

  // Order strategy:
  // - Left column (projects) is sorted descending on the homepage/editor,
  //   so give new projects a very high order to float to the top.
  // - Right column (lehrgerueste) is sorted ascending. To make new lehr
  //   projects appear at the top like the left side, give them an order
  //   below the current minimum so they sort first after reload as well.
  let order: number;
  if (side === "left") {
    order = 999;
  } else {
    const col = document.querySelectorAll<HTMLElement>(".project-column")[1];
    const existingOrders = Array.from(col?.querySelectorAll<HTMLElement>(".project-card") ?? [])
      .map((c) => {
        const n = Number(parseFm(c).order);
        return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
      })
      .filter((n) => n !== Number.POSITIVE_INFINITY);
    const minOrder = existingOrders.length ? Math.min(...existingOrders) : 1;
    order = minOrder - 1;
  }

  const fm: Fm = {
    title: "000_New Project",
    list_title: side === "left" ? "000 New Project" : "New Project 000",
    year: new Date().getFullYear(), location: "",
    type: "", status: "Draft", collaborators: [], description_cn: "", description_en: "",
    cover_image: "https://pub-e0d304e4d3564adbb6c3cbf768403529.r2.dev/project-1-1.jpg", gallery: [], tags: [], category,
    display_date: "", featured: false, order, __body: "",
  };
  const card = document.createElement("article");
  card.className = `project-card project-card-${side}`;
  card.dataset.slug = slug;
  card.dataset.path = `src/content/projects/${slug}.md`;
  card.dataset.category = category;
  card.dataset.frontmatter = JSON.stringify(fm);
  card.dataset.isNew = "1";
  card.innerHTML = `
    <figure>
      <button class="project-carousel" type="button" data-images="[]" aria-label="new">
        <img src="${fm.cover_image}" alt="new" loading="lazy" />
      </button>
      <figcaption class="project-meta">
        <strong><span data-edit="title">${fm.title}</span></strong>
        <span class="project-facts">
          <span data-edit="location">${fm.location}</span><br />
          <span data-edit="type">${fm.type}</span><br />
          <span data-edit="year">${fm.year}</span>
          <a class="view-link" href="#">/View../</a>
        </span>
      </figcaption>
    </figure>
    <div class="edit-controls">
      <button type="button" data-role="delete-card">删除</button>
    </div>`;
  const cols = document.querySelectorAll<HTMLElement>(".project-column");
  const col = cols[side === "left" ? 0 : 1];
  if (col) {
    // Insert every new project at the top of its column so the editing
    // surface behaves consistently (newest first on both sides).
    col.prepend(card);
  }
  makeCardEditable(card);
  markDirty(card); // new cards always need saving
  persistOverrides();
  // Update the overlay menus so the new project is visible immediately,
  // whether the user opens the menu before or after editing the title.
  updateOverlayListsFromDOM();
}

async function handleReplace(card: HTMLElement, file: File) {
  markDirty(card);
  const img = card.querySelector<HTMLImageElement>("img");
  const carousel = card.querySelector<HTMLElement>(".project-carousel");
  // The cover that was on the card before this swap — used to roll back on failure.
  const originalCover = parseFm(card).cover_image;

  // 1) Instant local preview. createObjectURL is synchronous, so the cover
  //    appears the moment the file is picked — no waiting on the network.
  //    We only touch the live DOM here; frontmatter keeps the original URL so a
  //    mid-upload reload can never strand a dead blob: URL in storage.
  const previewUrl = URL.createObjectURL(file);
  if (img) img.src = previewUrl;
  if (carousel) {
    try {
      const arr = JSON.parse(carousel.dataset.images || "[]");
      arr[0] = previewUrl; // keep the carousel in sync so looping still starts on the new cover
      carousel.dataset.images = JSON.stringify(arr);
    } catch {
      /* ignore */
    }
  }

  // Swap the temporary preview for a final URL everywhere it shows up.
  const swap = (url: any) => {
    if (img && img.src === previewUrl) img.src = url;
    if (carousel) {
      try {
        const arr = JSON.parse(carousel.dataset.images || "[]");
        if (arr[0] === previewUrl) arr[0] = url;
        carousel.dataset.images = JSON.stringify(arr);
      } catch {
        /* ignore */
      }
    }
    const fm = parseFm(card);
    fm.cover_image = url;
    card.dataset.frontmatter = JSON.stringify(fm);
  };

  // 2) Upload in the background; swap to the real R2 URL when it lands.
  try {
    const url = await uploadImage(file);
    URL.revokeObjectURL(previewUrl);
    swap(url);
    persistOverrides();
  } catch (e) {
    URL.revokeObjectURL(previewUrl);
    swap(originalCover);
    await showAlert("封面图上传失败：" + (e as Error).message);
  }
}

// ---- Gallery (multi-image) upload -----------------------------------------
// Appends new images to .detail-gallery, uploads each to R2 in background,
// and updates the frontmatter gallery array.
async function handleGalleryAdd(card: HTMLElement, files: File[]) {
  const gallery = card.querySelector<HTMLElement>(".detail-gallery");
  if (!gallery) return;

  // 1) Instant local preview — append one wrapped <img> per file immediately.
  for (const file of files) {
    const url = URL.createObjectURL(file);
    const wrap = createGalleryImgWrap(url, false);
    gallery.appendChild(wrap);
    // Re-init drag-drop on the new element (it already has draggable=true).
  }

  // 2) Upload each image in background; swap blob → R2 URL on success.
  const wraps = Array.from(gallery.querySelectorAll<HTMLElement>(".gallery-img-wrap"))
    .slice(-files.length); // the ones we just added
  for (let i = 0; i < wraps.length; i++) {
    const wrap = wraps[i];
    const img = wrap.querySelector<HTMLImageElement>("img")!;
    const blobUrl = img.src;
    try {
      const r2Url = await uploadImage(files[i]);
      img.src = r2Url;
      URL.revokeObjectURL(blobUrl);
      syncGalleryFromDOM(card);
    } catch (e) {
      wrap.remove(); // failed upload → remove wrapper
      URL.revokeObjectURL(blobUrl);
      syncGalleryFromDOM(card);
      await showAlert("图纸上传失败：" + (e as Error).message);
    }
  }

  markDirty(card);
  persistOverrides();
}

let saving = false; // guard against double-click / rapid re-saves

async function save() {
  if (saving) return; // already in flight
  const pass = getPass();
  if (!pass) return;
  saving = true;
  // Collect the editing surface: column cards plus the info overlay. The detail
  // overlays are read-only previews that share the same data-path; including
  // them has caused duplicate-path / stale-content saves on GitHub.
  const cards = Array.from(document.querySelectorAll<HTMLElement>(".project-column .project-card, .info-overlay"));

  // Instant feedback + disable to prevent double-submit.
  const saveBtn = document.querySelector<HTMLElement>("#edit-save");
  const origText = saveBtn?.textContent ?? "保存";
  if (saveBtn) { saveBtn.textContent = "保存中…"; (saveBtn as HTMLButtonElement).disabled = true; }
  const done = () => { saving = false; if (saveBtn) { saveBtn.textContent = origText; (saveBtn as HTMLButtonElement).disabled = false; } };

  // Build the batch payload: one item per card, sent in a SINGLE request.
  // The server processes them sequentially so GitHub SHA conflicts are
  // impossible — no retries needed, no 409s, and only 1 network round-trip
  // from the client (vs. N round-trips before).
  const items: Array<{ action: string; path: string; content?: string; cover?: string; deletedImages?: string[] }> = [];
  for (const card of cards) {
    const path = card.dataset.path ?? "?";
    // Only send cards that changed (dirty) or are marked for deletion.
    const isDirty = card.dataset.dirty === "1";
    const isDeleted = card.dataset.toDelete === "1";
    if (!isDirty && !isDeleted) continue;

    if (isDeleted) {
      items.push({ action: "delete", path });
    } else {
      const fm = parseFm(card);
      card.querySelectorAll<HTMLElement>("[data-edit]").forEach((span) => {
        const field = span.dataset.edit;
        const val = fieldVal(span);
        if (!field) return;
        if (field === "year") {
          const yr = parseInt(val, 10);
          if (!isNaN(yr)) fm.year = yr;
          else fm.display_date = val;
        } else {
          fm[field] = val;
        }
      });
      const isInfo = path.startsWith("src/content/info");
      items.push({
        action: "save",
        path,
        content: isInfo ? serializeInfo(fm) : serializeFm(fm),
        cover: fm.cover_image ?? "",
        deletedImages: JSON.parse(card.dataset.deletedImages || "[]"),
        ...(isInfo ? { info: pickInfoFields(fm) } : {}),
      });
    }
  }

  // A slug may be dirty in both the column card and the detail overlay.
  // Although we now only collect column cards above, keep a final safety
  // deduplication by path in case the selector ever changes.
  const deduped = new Map<string, (typeof items)[number]>();
  for (const item of items) {
    if (!item.path || (item.action !== "save" && item.action !== "delete")) continue;
    deduped.set(item.path, item);
  }
  const uniqueItems = Array.from(deduped.values());

  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "save-all", items: uniqueItems, passcode: pass }),
  });

  done();

  let data: any;
  try { data = await res.json(); } catch { data = {}; }

  if (!res.ok || !data.ok) {
    const errs: string[] = data.errors ?? [JSON.stringify(data)];
    done();
    const errText = errs.join("\n");
    let hint: string;
    if (errText.includes("tree 422") || errText.includes("BadObjectState")) {
      hint = "\n\n刷新后重新编辑一次即可。若反复出现，请把截图和当时改了哪几个项目告诉我。";
    } else if (res.status === 401 || res.status === 403 || errText.includes("unauthorized")) {
      hint = "\n\n多半是 Cloudflare 后台的 GITHUB_PAT 失效了——去 Settings → Environment variables 把它更新成有效的 token，重新部署后再试。";
    } else {
      hint = "\n\n请截图完整错误信息发给我。";
    }
    await showAlert("保存失败（未写入 GitHub）：\n" + errText + hint);
    return;
  }

  persistOverrides();
  // Clear dirty flags + deletion queue — everything saved.
  document.querySelectorAll<HTMLElement>(".project-column .project-card, .info-overlay").forEach((card) => {
    delete card.dataset.dirty;
    delete card.dataset.deletedImages;
  });
  done();
  await showAlert(
    "已保存 — 此页面的编辑后预览已更新，Cloudflare 正在重新构建（约 1–2 分钟）。\n" +
      "构建完成后刷新本页，主站和编辑器里就能看到更新。"
  );
  // Return to the editor's landing view (read-only) so the page no longer
  // looks like the in-edit state. The DOM already holds the latest edits.
  exitEdit();
}

function buildUI() {
  const bar = document.createElement("div");
  bar.id = "edit-bar";

  // On the dedicated Coupling management page, the floating edit bar becomes
  // the filter-editing control surface instead of the generic +项目/+Lehr
  // buttons. INFO editing still works because enterEdit() still runs.
  const isCoupling =
    document.body.classList.contains("filter-manage") &&
    !document.body.classList.contains("filter-term");

  if (isCoupling) {
    bar.innerHTML = `
      <button id="edit-toggle">编辑</button>
      <button id="edit-save" hidden>保存</button>
      <button id="fe-create" hidden>新建 Filter (<span class="filter-sel-count">0</span>)</button>`;
  } else {
    bar.innerHTML = `
      <button id="edit-toggle">编辑</button>
      <button id="edit-save" hidden>保存</button>
      <button id="edit-new-left" hidden>+ 项目</button>
      <button id="edit-new-right" hidden>+ Lehr</button>`;
  }
  document.body.appendChild(bar);

  bar.querySelector<HTMLElement>("#edit-toggle")!.addEventListener("click", async () => {
    if (document.body.classList.contains(EDIT_MODE_CLASS)) {
      if (await showDialog("退出编辑？未保存的修改将丢失。")) {
        if (isCoupling) {
          // Coupling page: leave both filter-edit and generic edit modes without
          // a full page reload (filter creation saves immediately; only unsaved
          // INFO text would be lost, and the dialog already warned the user).
          exitEdit();
          window.amFilterEdit?.exit();
        } else {
          window.location.reload();
        }
      }
    } else {
      if (isCoupling) {
        enterEdit();
        window.amFilterEdit?.enter();
      } else {
        enterEdit();
      }
    }
  });
  bar.querySelector<HTMLElement>("#edit-save")!.addEventListener("click", () => save());

  if (isCoupling) {
    bar.querySelector<HTMLElement>("#fe-create")!.addEventListener("click", () => {
      window.amFilterEdit?.create();
    });
  } else {
    bar.querySelector<HTMLElement>("#edit-new-left")!.addEventListener("click", () => newProject("left"));
    bar.querySelector<HTMLElement>("#edit-new-right")!.addEventListener("click", () => newProject("right"));
  }

  document.addEventListener("change", (e) => {
    const t = e.target as HTMLElement;
    if (t.matches('input[data-role="replace-image"]')) {
      const input = t as HTMLInputElement;
      const card = input.closest<HTMLElement>(".project-card");
      const file = input.files?.[0];
      if (file && card) handleReplace(card, file);
    }
    if (t.matches('input[data-role="add-gallery"]')) {
      const input = t as HTMLInputElement;
      const card = input.closest<HTMLElement>(".project-card");
      const files = input.files;
      if (files && files.length > 0 && card) {
        handleGalleryAdd(card, Array.from(files));
        input.value = ""; // reset so re-selecting same files works
      }
    }
  });

document.addEventListener("click", async (e) => {
    const t = e.target as HTMLElement;
    if (t.matches('button[data-role="delete-card"]')) {
      const card = t.closest<HTMLElement>(".project-card");
      if (card && await showDialog("删除这个项目？")) {
        card.dataset.toDelete = "1";
        // Remove immediately — don't just fade it.
        card.style.display = "none";
        persistOverrides();
      }
    }

    // Click a gallery image → show ✕ on that image, hide on others.
    if (
      document.body.classList.contains(EDIT_MODE_CLASS) &&
      t.closest(".gallery-img-wrap") &&
      !t.matches(".gallery-del-btn")
    ) {
      const wrap = t.closest<HTMLElement>(".gallery-img-wrap")!;
      if (wrap.classList.contains("is-cover")) return; // cover has no X
      // Deselect all others, select this one.
      document.querySelectorAll(".gallery-img-wrap.selected").forEach((w) => w.classList.remove("selected"));
      wrap.classList.add("selected");
      return; // don't fall through to del-btn handler
    }

    // Click the ✕ delete button on a gallery image wrapper.
    if (t.matches(".gallery-del-btn")) {
      const wrap = t.parentElement; // .gallery-img-wrap
      if (!wrap) return;
      const img = wrap.querySelector<HTMLImageElement>("img");
      const deletedUrl = img?.src ?? "";
      wrap.remove();
      const card = wrap.closest<HTMLElement>(".project-card");
      if (card) {
        syncGalleryFromDOM(card);
        markDirty(card);
        // Track this URL for R2 cleanup on save.
        if (deletedUrl && !deletedUrl.startsWith("blob:")) {
          const deleted = JSON.parse(card.dataset.deletedImages || "[]") as string[];
          deleted.push(deletedUrl);
          card.dataset.deletedImages = JSON.stringify(deleted);
        }
        persistOverrides();
      }
    }
  });

  // Persist text edits live (debounced) so a reload before rebuild still shows them.
  let persistTimer: number | undefined;
  document.addEventListener("input", (e) => {
    const el = e.target as HTMLElement;
    const card = el.closest<HTMLElement>("[data-path]");
    if (!card) return;
    markDirty(card);

    // Sync the frontmatter with the edited field so localStorage (and the
    // post-save persist) always reflects the latest edits. Without this, a
    // refresh would re-apply stale frontmatter and revert the visible text.
    const field = el.dataset.edit;
    if (field) {
      const fm = parseFm(card);
      const nextVal = fieldVal(el);

      if (field === "title") {
        fm.title = nextVal;
        if (card.dataset.category === "lehrgerueste") {
          const projectName = nextVal.replace(/^\d+_/, "");
          fm.list_title = projectName ? `${projectName} 000` : "";
        } else {
          fm.list_title = nextVal;
        }
      } else if (field === "year") {
        const yr = parseInt(nextVal, 10);
        if (!isNaN(yr)) fm.year = yr;
        else fm.display_date = nextVal;
      } else {
        fm[field] = nextVal;
      }

      card.dataset.frontmatter = JSON.stringify(fm);
    }

    // Update the overlay menus in real time as the user edits project titles.
    updateOverlayListsFromDOM();

    clearTimeout(persistTimer);
    persistTimer = window.setTimeout(persistOverrides, 400);
  });
}

applyOverrides();
buildUI();
// Rebuild the overlay menus as soon as the editor loads so the PROJECTS list
// is sorted by its leading three-digit number (000 at the top) — instead of
// showing the server-rendered order-based sort where the new project sinks to
// the bottom. Matches the preview and the user's expectation.
updateOverlayListsFromDOM();
