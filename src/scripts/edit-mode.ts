// In-page WYSIWYG editor for Atelier Modulus.
// Enters "edit mode" from a floating button, makes card text directly editable,
// allows replacing cover images, and adding/removing project cards. Saving is
// sent to /api/save (Cloudflare Pages Function) which writes back to GitHub.
// The visible site layout is untouched; only data-* hooks and an edit bar are added.

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
const LS_KEY = "am_editor_overrides_v1";

function loadOverrides(): Record<string, any> {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || "{}");
  } catch {
    return {};
  }
}

function collectOverrides(): Record<string, any> {
  const state: Record<string, any> = {};
  document.querySelectorAll<HTMLElement>(".project-card").forEach((card) => {
    const key = card.dataset.path || card.dataset.slug;
    if (!key) return;
    state[key] = {
      frontmatter: card.dataset.frontmatter,
      isNew: card.dataset.isNew,
      toDelete: card.dataset.toDelete,
      deletedImages: card.dataset.deletedImages || undefined,
    };
  });
  return state;
}

function persistOverrides() {
  localStorage.setItem(LS_KEY, JSON.stringify(collectOverrides()));
}

function applyOverrides() {
  const state = loadOverrides();
  document.querySelectorAll<HTMLElement>(".project-card").forEach((card) => {
    const key = card.dataset.path || card.dataset.slug;
    const s = key ? state[key] : undefined;
    if (!s) return;
    if (s.frontmatter) card.dataset.frontmatter = s.frontmatter;
    if (s.isNew) card.dataset.isNew = s.isNew;
    if (s.toDelete) card.dataset.toDelete = s.toDelete;
    if (s.deletedImages) card.dataset.deletedImages = s.deletedImages;
    const fm = parseFm(card);
    card.querySelectorAll<HTMLElement>("[data-edit]").forEach((span) => {
      const f = span.dataset.edit;
      if (!f || fm[f] == null) return;
      let val: any = fm[f];
      if (f === "year" && fm.display_date) val = fm.display_date;
      span.textContent = String(val);
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
  if (/[:#\-?\[\]{}&*!|>'"%@`,\n]/.test(s) || /^\s|\s$/.test(s)) return JSON.stringify(s);
  // Strings that look like a number/boolean/null must stay quoted, or YAML
  // will coerce them (e.g. display_date: "2025" -> 2025) and fail the schema.
  if (/^-?\d+(?:\.\d+)?$/.test(s)) return JSON.stringify(s);
  if (/^(?:true|false|null|~|yes|no|on|off)$/i.test(s)) return JSON.stringify(s);
  return s;
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
  if (toggle) toggle.textContent = "退出(不保存)";
  if (save) save.hidden = false;
  if (nl) nl.hidden = false;
  if (nr) nr.hidden = false;
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
  const fm: Fm = {
    title: "新项目", list_title: "", year: new Date().getFullYear(), location: "",
    type: "", status: "Draft", collaborators: [], description_cn: "", description_en: "",
    cover_image: "https://pub-e0d304e4d3564adbb6c3cbf768403529.r2.dev/project-1-1.jpg", gallery: [], tags: [], category,
    display_date: "", featured: false, order: 999, __body: "",
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
      <label class="edit-replace-img">换封面图<input type="file" accept="image/*" data-role="replace-image" hidden /></label>
      <button type="button" data-role="delete-card">删除</button>
    </div>`;
  const cols = document.querySelectorAll<HTMLElement>(".project-column");
  const col = cols[side === "left" ? 0 : 1];
  col?.appendChild(card);
  makeCardEditable(card);
  persistOverrides();
}

async function handleReplace(card: HTMLElement, file: File) {
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

  persistOverrides();
}

let saving = false; // guard against double-click / rapid re-saves

async function save() {
  if (saving) return; // already in flight
  const pass = getPass();
  if (!pass) return;
  saving = true;
  const cards = Array.from(document.querySelectorAll<HTMLElement>(".project-card"));

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
    if (card.dataset.toDelete === "1") {
      items.push({ action: "delete", path });
    } else {
      const fm = parseFm(card);
      card.querySelectorAll<HTMLElement>("[data-edit]").forEach((span) => {
        const field = span.dataset.edit;
        const val = span.textContent ?? "";
        if (!field) return;
        if (field === "year") {
          const yr = parseInt(val, 10);
          if (!isNaN(yr)) fm.year = yr;
          else fm.display_date = val;
        } else {
          fm[field] = val;
        }
      });
      items.push({ action: "save", path, content: serializeFm(fm), cover: fm.cover_image, deletedImages: JSON.parse(card.dataset.deletedImages || "[]") });
    }
  }

  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "save-all", items, passcode: pass }),
  });

  done();

  let data: any;
  try { data = await res.json(); } catch { data = {}; }

  if (!res.ok || !data.ok) {
    const errs: string[] = data.errors ?? [JSON.stringify(data)];
    done();
    await showAlert(
      "保存失败（未写入 GitHub）：\n" +
        errs.join("\n") +
        "\n\n多半是 Cloudflare 后台的 GITHUB_PAT 失效了——去 Settings → Environment variables 把它更新成有效的 token，重新部署后再试。"
    );
    return;
  }

  persistOverrides();
  // Clear deletion queue — images already removed from R2.
  document.querySelectorAll<HTMLElement>(".project-card").forEach((card) => {
    delete card.dataset.deletedImages;
  });
  done();
  await showAlert(
    "已保存 — Cloudflare 正在重新构建（约 1–2 分钟）。\n" +
      "构建完成后刷新本页，主站和编辑器里就能看到更新。"
  );
}

function buildUI() {
  const bar = document.createElement("div");
  bar.id = "edit-bar";
  bar.innerHTML = `
    <button id="edit-toggle">编辑</button>
    <button id="edit-save" hidden>保存</button>
    <button id="edit-new-left" hidden>+ 项目</button>
    <button id="edit-new-right" hidden>+ Lehr</button>`;
  document.body.appendChild(bar);

  bar.querySelector<HTMLElement>("#edit-toggle")!.addEventListener("click", async () => {
    if (document.body.classList.contains(EDIT_MODE_CLASS)) {
      if (await showDialog("退出编辑？未保存的修改将丢失。")) window.location.reload();
    } else {
      enterEdit();
    }
  });
  bar.querySelector<HTMLElement>("#edit-save")!.addEventListener("click", () => save());
  bar.querySelector<HTMLElement>("#edit-new-left")!.addEventListener("click", () => newProject("left"));
  bar.querySelector<HTMLElement>("#edit-new-right")!.addEventListener("click", () => newProject("right"));

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
    if (el.closest(".project-card")) {
      clearTimeout(persistTimer);
      persistTimer = window.setTimeout(persistOverrides, 400);
    }
  });
}

applyOverrides();
buildUI();
