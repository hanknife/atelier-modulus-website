// Filter editing for Atelier Modulus — loaded ONLY on the dedicated management
// pages (/editor/coupling/ and /editor/filter/[slug]/). The public preview pages
// (/coupling/ and /filter/[slug]/) do NOT load this script, so preview and
// management are fully separated URLs.
//
// On /editor/coupling/:
//   Enter edit mode (password prompt) → click tiles to multi-select →
//   "Create Filter" → name dialog → API save → new filter appears in strip.
//
// On /editor/filter/[slug]/:
//   Enter edit mode → click tiles to remove (with confirmation) → "Add Images"
//   to pick from all project images → API save.

const API = "/api/save";
const PASS_KEY = "am_edit_pass";
const EDIT_CLASS = "filter-edit-mode";
const LS_KEY = "am_filter_edit_v1";

// ---- Auth -----------------------------------------------------------------

function getPass() {
  let p = sessionStorage.getItem(PASS_KEY);
  if (!p) {
    p = window.prompt("输入编辑密码") || "";
    if (p) sessionStorage.setItem(PASS_KEY, p);
  }
  return p;
}

function getPassSync() {
  return sessionStorage.getItem(PASS_KEY) || "";
}

// ---- Dialogs (monochrome, same visual language as editor) ----------------

function askText(msg, placeholder = "") {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "am-dialog-overlay";
    overlay.innerHTML =
      '<div class="am-dialog-box" role="alertdialog" aria-modal="true">' +
        '<p class="am-dialog-msg">' + msg + '</p>' +
        '<input class="am-dialog-input" type="text" placeholder="' + placeholder + '" autocomplete="off" />' +
        '<div class="am-dialog-actions">' +
          '<button class="am-dialog-btn am-dialog-cancel" type="button">取消</button>' +
          '<button class="am-dialog-btn am-dialog-ok" type="button">确定</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    const input = overlay.querySelector(".am-dialog-input");
    const ok = overlay.querySelector(".am-dialog-ok");
    const cancel = overlay.querySelector(".am-dialog-cancel");
    const close = (r) => { overlay.remove(); resolve(r == null ? null : r); };
    ok.addEventListener("click", () => close(input.value.trim() || null));
    cancel.addEventListener("click", () => close(null));
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(null); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(null); }, { once: true });
    setTimeout(() => input.focus(), 50);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") close(input.value.trim() || null); });
  });
}

function showDialog(msg) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "am-dialog-overlay";
    overlay.innerHTML =
      '<div class="am-dialog-box" role="alertdialog" aria-modal="true">' +
        '<p class="am-dialog-msg">' + msg + '</p>' +
        '<div class="am-dialog-actions">' +
          '<button class="am-dialog-btn am-dialog-cancel" type="button">取消</button>' +
          '<button class="am-dialog-btn am-dialog-ok" type="button">确定</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    const ok = overlay.querySelector(".am-dialog-ok");
    const cancel = overlay.querySelector(".am-dialog-cancel");
    const close = (result) => { overlay.remove(); resolve(result); };
    ok.addEventListener("click", () => close(true));
    cancel.addEventListener("click", () => close(false));
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(false); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(false); }, { once: true });
    setTimeout(() => ok.focus(), 50);
  });
}

function showAlert(msg) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "am-dialog-overlay";
    overlay.innerHTML =
      '<div class="am-dialog-box" role="alertdialog" aria-modal="true">' +
        '<p class="am-dialog-msg">' + msg + '</p>' +
        '<div class="am-dialog-actions">' +
          '<button class="am-dialog-btn am-dialog-ok" type="button">确定</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    const ok = overlay.querySelector(".am-dialog-ok");
    const close = () => { overlay.remove(); resolve(); };
    ok.addEventListener("click", close);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); }, { once: true });
    setTimeout(() => ok.focus(), 50);
  });
}

// ---- Slug generation -------------------------------------------------------

function slugify(label) {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u4e00-\u9fff\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    || "unnamed";
}

// ---- Local persistence ----------------------------------------------------

function loadFilters() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || "[]");
  } catch (e) {
    return [];
  }
}

function persistFilters(filters) {
  localStorage.setItem(LS_KEY, JSON.stringify(filters));
}

// Get the server-rendered static filters (from CouplingFilterStrip / page data).
// These are embedded as JSON in a <script> tag with id="filter-data".
function getStaticFilters() {
  try {
    const el = document.getElementById("filter-data");
    return el ? JSON.parse(el.textContent || "[]") : [];
  } catch (e) {
    return [];
  }
}

// Get all available images on this page's coupling board.
// Embedded as JSON in <script id="board-images">.
function getBoardImages() {
  try {
    const el = document.getElementById("board-images");
    return el ? JSON.parse(el.textContent || "[]") : [];
  } catch (e) {
    return [];
  }
}

// Merge static filters + local overrides (newly created/deleted ones).
// Local takes precedence for slugs that exist in both.
function mergedFilters() {
  const staticFilters = getStaticFilters();
  const localFilters = loadFilters();
  // Track which static slugs have been deleted locally.
  const deletedSlugs = new Set(
    localFilters.filter((f) => f.images === "__DELETED__").map((f) => f.slug)
  );
  const result = staticFilters.filter((f) => !deletedSlugs.has(f.slug));
  // Append or update with local additions/edits.
  for (const lf of localFilters) {
    if (lf.images === "__DELETED__") continue; // already handled
    const idx = result.findIndex((r) => r.slug === lf.slug);
    if (idx >= 0) result[idx] = lf;
    else result.push(lf);
  }
  return result;
}

// ---- API calls ------------------------------------------------------------

async function saveFiltersToServer(filters) {
  const pass = getPassSync();
  if (!pass) {
    await showAlert("需要编辑密码");
    return false;
  }
  try {
    // Serialize filters as the content of src/data/couplingFilters.ts so that
    // the next Cloudflare rebuild picks them up automatically.
    const tsContent = buildFiltersTS(filters);
    const res = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "save-filters",
        filters: filters,
        tsContent: tsContent,
        passcode: pass
      })
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      await showAlert("保存失败：" + (data.error || JSON.stringify(data)));
      return false;
    }
    return true;
  } catch (e) {
    await showAlert("保存失败：" + String(e));
    return false;
  }
}

// Build the TypeScript source for src/data/couplingFilters.ts from the current
// filter array so the next Cloudflare rebuild uses it.
function buildFiltersTS(filters) {
  const lines = [
    "export interface CouplingFilter {",
    "  slug: string;",
    "  label: string;",
    "  images: string[];",
    "}",
    "",
    "// Curated coupling filter terms. Each term links to /filter/{slug}/ and shows",
    "// a filtered masonry of the images listed below.",
    "// Auto-generated by the in-page filter editor.",
    "export const couplingFilters = ["
  ];
  for (const f of filters) {
    lines.push("  {");
    lines.push("    slug: " + JSON.stringify(f.slug) + ",");
    lines.push("    label: " + JSON.stringify(f.label) + ",");
    lines.push("    images: " + JSON.stringify(f.images) + ",");
    lines.push("  },");
  }
  lines.push("];");
  lines.push("");
  return lines.join("\n");
}

// ---- Coupling-page selection state ----------------------------------------

const selectedImages = new Set();

function toggleSelectTile(tile) {
  const img = tile.querySelector("img");
  if (!img) return;
  const src = img.src;
  if (selectedImages.has(src)) {
    selectedImages.delete(src);
    tile.classList.remove("filter-selected");
  } else {
    selectedImages.add(src);
    tile.classList.add("filter-selected");
  }
  updateSelectionCount();
}

function updateSelectionCount() {
  document.querySelectorAll("#filter-sel-count, .filter-sel-count").forEach((badge) => {
    badge.textContent = String(selectedImages.size);
  });
}

function clearSelection() {
  selectedImages.clear();
  document.querySelectorAll(".coupling-tile.filter-selected").forEach((t) => t.classList.remove("filter-selected"));
  updateSelectionCount();
}

async function createNewFilter() {
  if (selectedImages.size === 0) {
    await showAlert("请先选择至少一张图片");
    return;
  }
  const name = await askText("给这个 Filter 起个名称：", "例如 Circle-Square-Circle");
  if (!name) return;

  const slug = slugify(name);
  // Check duplicate slug
  const existing = mergedFilters();
  if (existing.some((f) => f.slug === slug)) {
    await showAlert("已存在同名的 Filter（slug: " + slug + "）");
    return;
  }

  const images = Array.from(selectedImages);
  const newFilter = { slug: slug, label: name, images: images };

  // Save locally first (instant UI)
  const local = loadFilters();
  local.push(newFilter);
  persistFilters(local);

  // Try server save
  const ok = await saveFiltersToServer(mergedFilters());
  if (ok) {
    await showAlert(
      "Filter「" + name + "」已创建（" + images.length + " 张图）。\n" +
      "Cloudflare 正在重建（约 1–2 分钟），新 Filter 页面即将可用。"
    );
  } else {
    await showAlert("Filter 已保存到本地浏览器，但服务器保存失败。\n页面刷新后可能会丢失，请联系管理员检查。");
  }

  // Update the filter strip UI immediately
  appendFilterToStrip(newFilter);
  clearSelection();
}

async function deleteFilter(slug, label) {
  if (!(await showDialog("删除 Filter「" + label + "」？"))) return;
  const local = loadFilters();
  local.push({ slug: slug, label: label, images: "__DELETED__" }); // tombstone
  persistFilters(local);

  const ok = await saveFiltersToServer(mergedFilters());
  if (ok) {
    await showAlert("已删除");
  } else {
    await showAlert("本地已标记删除，但服务器同步失败。");
  }

  // Remove from strip
  document.querySelectorAll(".filter-strip-item").forEach((el) => {
    if (el.dataset.filterSlug === slug) el.remove();
  });
}

// Append a new filter link to the strip (after the last existing one).
// `hrefPrefix` lets the coupling management page point each filter at its own
// edit page (/editor/filter/[slug]/) instead of the public preview.
function appendFilterToStrip(filter, hrefFor) {
  const strip = document.querySelector(".filter-strip");
  if (!strip) return;
  // Check if already present
  if (strip.querySelector('[data-filter-slug="' + filter.slug + '"]')) return;
  // Find position after the last existing <a> to insert new items
  const comma = strip.querySelector(".filter-sep-last");
  if (comma) { comma.remove(); }

  const href = hrefFor ? hrefFor(filter.slug) : ("/filter/" + filter.slug + "/");

  // Build new item
  const wrapper = document.createElement("span");
  wrapper.className = "filter-strip-item";
  wrapper.dataset.filterSlug = filter.slug;

  const link = document.createElement("a");
  link.href = href;
  link.textContent = filter.label;

  const sep = document.createElement("span");
  sep.className = "filter-comma";
  sep.textContent = ", ";

  const delBtn = document.createElement("span");
  delBtn.className = "filter-del-btn";
  delBtn.title = "删除此 Filter";
  delBtn.textContent = "×";

  delBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    await deleteFilter(filter.slug, filter.label);
  });

  wrapper.appendChild(link);
  wrapper.appendChild(sep);
  wrapper.appendChild(delBtn);
  strip.appendChild(wrapper);
}

// Rebuild entire strip from merged data (used on init).
function rebuildStripFromMerged(hrefFor) {
  const filters = mergedFilters();
  // Clear dynamic items (keep server-rendered ones)
  document.querySelectorAll(".filter-strip-item").forEach((el) => el.remove());
  for (const f of filters) {
    appendFilterToStrip(f, hrefFor);
  }
}

// ---- Filter-page removal state --------------------------------------------

const removedImages = new Set();

function isOnFilterPage() {
  return !!document.querySelector(".filter-term");
}

async function removeTileFromFilter(tile) {
  const img = tile.querySelector("img");
  if (!img) return;
  const src = img.src;
  if (!(await showDialog("从 Filter 中移除这张图片？"))) return;
  removedImages.add(src);
  tile.style.opacity = "0.3";
  tile.style.pointerEvents = "none";
  updateRemovedCount();
}

function updateRemovedCount() {
  const badge = document.getElementById("filter-remove-count");
  if (badge) badge.textContent = String(removedImages.size);
}

// Show a picker modal with all board images not currently in this filter.
// User clicks to add; added images appear at the bottom of the board.
async function showAddPicker() {
  const currentFilterSlug = getCurrentFilterSlug();
  if (!currentFilterSlug) return;

  const currentFilters = mergedFilters();
  const current = currentFilters.find((f) => f.slug === currentFilterSlug);
  if (!current) return;

  const allImages = getBoardImages();
  const currentSet = new Set(current.images);
  const available = allImages.filter((img) => !currentSet.has(img));

  if (available.length === 0) {
    await showAlert("所有图片都已在当前 Filter 中了");
    return;
  }

  // Create picker overlay
  const overlay = document.createElement("div");
  overlay.className = "am-dialog-overlay filter-picker-overlay";
  // Show a grid of thumbnails
  const thumbs = available.slice(0, 60).map((url) =>
    '<img class="picker-thumb" src="' + url + '" data-src="' + url + '" alt="" loading="lazy" />'
  ).join("");

  overlay.innerHTML =
    '<div class="am-dialog-box filter-picker-box" role="dialog" aria-modal="true">' +
      '<p class="am-dialog-msg">点击选择要添加的图片（已选：<span id="picker-count">0</span>）</p>' +
      '<div class="picker-grid">' + thumbs + '</div>' +
      '<div class="am-dialog-actions">' +
        '<button class="am-dialog-btn am-dialog-cancel" type="button">取消</button>' +
        '<button class="am-dialog-btn am-dialog-ok" type="button">添加选中</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);

  const pickerSet = new Set();
  const countEl = overlay.querySelector("#picker-count");
  const grid = overlay.querySelector(".picker-grid");

  grid.addEventListener("click", (e) => {
    const thumb = e.target.closest(".picker-thumb");
    if (!thumb) return;
    const src = thumb.dataset.src;
    if (pickerSet.has(src)) {
      pickerSet.delete(src);
      thumb.classList.remove("picker-selected");
    } else {
      pickerSet.add(src);
      thumb.classList.add("picker-selected");
    }
    countEl.textContent = String(pickerSet.size);
  });

  const ok = overlay.querySelector(".am-dialog-ok");
  const cancel = overlay.querySelector(".am-dialog-cancel");
  const closeFn = (add) => {
    overlay.remove();
    if (add && pickerSet.size > 0) {
      // Add selected images to the filter
      const updated = current.images.concat(Array.from(pickerSet));
      current.images = updated;
      // Persist locally
      const local = loadFilters();
      const idx = local.findIndex((l) => l.slug === currentFilterSlug);
      if (idx >= 0) local[idx] = current;
      else local.push(current);
      persistFilters(local);
      // Server save
      saveFiltersToServer(mergedFilters()).then((okSaved) => {
        if (okSaved) {
          // Refresh the board visually by appending new tiles
          appendNewTilesToBoard(pickerSet);
          clearRemovedState();
        }
      });
    }
  };
  ok.addEventListener("click", () => closeFn(true));
  cancel.addEventListener("click", () => closeFn(false));
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeFn(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeFn(false); }, { once: true });
}

function getCurrentFilterSlug() {
  // Derive the slug from the management URL (/editor/filter/[slug]/).
  const m = location.pathname.match(/\/filter\/([^/]+)\/?$/);
  return m ? m[1] : null;
}

function appendNewTilesToBoard(newSrcs) {
  const board = document.querySelector(".coupling-board");
  if (!board) return;
  const SIZE_PATTERN = [4, 3, 2, 3, 4, 2, 4, 3, 2, 3, 2, 4, 3, 2, 3, 2];
  const existing = board.querySelectorAll(".coupling-tile");
  let startIdx = existing.length;
  for (const src of newSrcs) {
    const size = SIZE_PATTERN[startIdx % SIZE_PATTERN.length];
    const fig = document.createElement("figure");
    fig.className = "coupling-tile tile-" + (startIdx + 1) + " size-" + size;
    fig.dataset.size = String(size);
    fig.dataset.detailCover = ""; // gallery image, not cover
    const img = document.createElement("img");
    img.src = src;
    img.alt = "";
    img.loading = "lazy";
    fig.appendChild(img);
    board.appendChild(fig);
    startIdx++;
  }
  // Trigger masonry relayout
  window.dispatchEvent(new Event("resize"));
}

async function saveFilterChanges() {
  const slug = getCurrentFilterSlug();
  if (!slug) return;
  const filters = mergedFilters();
  const f = filters.find((x) => x.slug === slug);
  if (!f) return;

  // Apply removals
  if (removedImages.size > 0) {
    f.images = f.images.filter((img) => !removedImages.has(img));
  }

  // Persist
  const local = loadFilters();
  const idx = local.findIndex((l) => l.slug === slug);
  if (idx >= 0) local[idx] = f;
  else local.push(f);
  persistFilters(local);

  // Server
  const ok = await saveFiltersToServer(mergedFilters());
  if (ok) {
    await showAlert("Filter 已更新，Cloudflare 正在重建（1–2 分钟）。");
    exitFilterEdit();
  } else {
    await showAlert("保存失败，更改仅在本地生效。");
  }
}

function clearRemovedState() {
  removedImages.clear();
  document.querySelectorAll(".coupling-tile").forEach((t) => {
    t.style.opacity = "";
    t.style.pointerEvents = "";
  });
  updateRemovedCount();
}

// ---- Mode enter/exit ------------------------------------------------------

function enterFilterEdit() {
  const pass = getPass();
  if (!pass) return;
  document.body.classList.add(EDIT_CLASS);

  // Wire up tile selection / removal + strip links for the active page type.
  // (These were defined but never invoked in the original script — without
  // this call the edit interactions would never attach.)
  if (isOnFilterPage()) {
    setupFilterPageEdit();
  } else {
    setupCouplingPageEdit();
  }

  const bar = document.getElementById("filter-edit-bar");
  if (bar) bar.hidden = false;
}

function exitFilterEdit() {
  document.body.classList.remove(EDIT_CLASS);
  clearSelection();
  clearRemovedState();
  // Restore tile visuals
  document.querySelectorAll(".coupling-tile.filter-selected").forEach((t) =>
    t.classList.remove("filter-selected")
  );

  const bar = document.getElementById("filter-edit-bar");
  if (bar) bar.hidden = true;
}

// ---- Setup per page type --------------------------------------------------

function setupCouplingPageEdit() {
  // Make tiles clickable for selection (suppress detail-open behavior)
  const board = document.querySelector(".coupling-board");
  if (!board) return;

  board.addEventListener("click", (e) => {
    if (!document.body.classList.contains(EDIT_CLASS)) return;
    const tile = e.target.closest(".coupling-tile");
    if (tile) {
      e.stopPropagation();
      e.preventDefault();
      toggleSelectTile(tile);
    }
  }, true); // capture phase to intercept before overlay handler

  // Show delete buttons on existing filters in strip
  document.querySelectorAll(".filter-strip-item .filter-del-btn").forEach((btn) => {
    btn.style.display = "";
  });

  rebuildStripFromMerged((slug) => "/editor/filter/" + slug + "/");
}

function setupFilterPageEdit() {
  const board = document.querySelector(".coupling-board");
  if (!board) return;

  // Point the strip at each filter's management page so navigating filters
  // from within management stays in management.
  rebuildStripFromMerged((slug) => "/editor/filter/" + slug + "/");

  board.addEventListener("click", (e) => {
    if (!document.body.classList.contains(EDIT_CLASS)) return;
    const tile = e.target.closest(".coupling-tile");
    if (tile) {
      e.stopPropagation();
      e.preventDefault();
      removeTileFromFilter(tile);
    }
  }, true);
}

// ---- Build toolbar --------------------------------------------------------

function buildUI() {
  const isFilter = isOnFilterPage();

  const bar = document.createElement("div");
  bar.id = "filter-edit-bar";
  bar.hidden = true;

  if (isFilter) {
    bar.innerHTML =
      '<span class="filter-edit-label">编辑此 Filter</span>' +
      '<button id="fe-add-img" type="button">+ 添加图片</button>' +
      '<button id="fe-save" type="button">保存更改 (<span id="filter-remove-count">0</span> 删除)</button>' +
      '<button id="fe-exit" type="button">退出</button>';
  } else {
    bar.innerHTML =
      '<span class="filter-edit-label">编辑 Filters</span>' +
      '<button id="fe-create" type="button">新建 Filter (<span id="filter-sel-count">0</span>)</button>' +
      '<button id="fe-exit" type="button">退出</button>';
  }

  document.body.appendChild(bar);

  bar.querySelector("#fe-exit").addEventListener("click", () => {
    exitFilterEdit();
  });

  if (isFilter) {
    bar.querySelector("#fe-add-img").addEventListener("click", showAddPicker);
    bar.querySelector("#fe-save").addEventListener("click", saveFilterChanges);
  } else {
    bar.querySelector("#fe-create").addEventListener("click", createNewFilter);
  }
}

// ---- Init -----------------------------------------------------------------

buildUI();

// The two management pages use filter editing differently:
//  - /editor/filter/[slug]/ (filter-term page) needs the toolbar immediately
//    to add/remove images, so it auto-enters edit mode on load.
//  - /editor/coupling/ uses the unified right-side #edit-bar (from edit-mode.ts)
//    for filter controls. The bottom-left #filter-edit-bar is hidden by CSS,
//    and edit-mode.ts calls window.amFilterEdit.enter/exit/create.
if (isOnFilterPage()) {
  setTimeout(() => enterFilterEdit(), 150);
}

// Expose hooks so the coupling management page's unified edit bar can drive
// filter editing from the same floating toolbar as INFO editing.
window.amFilterEdit = {
  enter: enterFilterEdit,
  exit: exitFilterEdit,
  create: createNewFilter
};
