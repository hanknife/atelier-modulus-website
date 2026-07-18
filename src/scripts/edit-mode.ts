// In-page WYSIWYG editor for Atelier Modulus.
// Enters "edit mode" from a floating button, makes card text directly editable,
// allows replacing cover images, and adding/removing project cards. Saving is
// sent to /api/save (Cloudflare Pages Function) which writes back to GitHub.
// The visible site layout is untouched; only data-* hooks and an edit bar are added.

const API = "/api/save";
const EDIT_MODE_CLASS = "edit-mode";
const PASS_KEY = "am_edit_pass";

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

async function uploadImage(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const b64 = btoa(binary);
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "upload",
      filename: file.name,
      data: b64,
      contentType: file.type || "image/jpeg",
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

function newProject(side: "left" | "right") {
  if (!document.body.classList.contains(EDIT_MODE_CLASS)) enterEdit();
  const category = side === "left" ? "projects" : "lehrgerueste";
  const slug = "new-" + Date.now();
  const fm: Fm = {
    title: "新项目", list_title: "", year: new Date().getFullYear(), location: "",
    type: "", status: "Draft", collaborators: [], description_cn: "", description_en: "",
    cover_image: "/images/project-1-1.jpg", gallery: [], tags: [], category,
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
}

async function handleReplace(card: HTMLElement, file: File) {
  try {
    const url = await uploadImage(file);
    const fm = parseFm(card);
    fm.cover_image = url;
    card.dataset.frontmatter = JSON.stringify(fm);
    const img = card.querySelector("img");
    if (img) img.src = url;
  } catch (e) {
    alert("封面图上传失败：" + (e as Error).message);
  }
}

async function save() {
  const pass = getPass();
  if (!pass) return;
  const cards = Array.from(document.querySelectorAll<HTMLElement>(".project-card"));
  const errors: string[] = [];
  for (const card of cards) {
    let res: Response;
    if (card.dataset.toDelete === "1") {
      res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", path: card.dataset.path, passcode: pass }),
      });
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
      const content = serializeFm(fm);
      res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", path: card.dataset.path, content, passcode: pass }),
      });
    }
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        const j = (await res.json()) as { error?: string };
        if (j.error) msg = j.error;
      } catch {
        /* ignore */
      }
      errors.push(`${card.dataset.path ?? "?"}: ${msg}`);
    }
  }
  if (errors.length) {
    alert(
      "保存失败（未写入 GitHub）：\n" +
        errors.join("\n") +
        "\n\n多半是 Cloudflare 后台的 GITHUB_PAT 失效了——去 Settings → Environment variables 把它更新成有效的 token，重新部署后再试。"
    );
    return;
  }
  alert("已保存，正在重新构建…");
  window.location.reload();
}

function buildUI() {
  const bar = document.createElement("div");
  bar.id = "edit-bar";
  bar.innerHTML = `
    <button id="edit-toggle">✎ 编辑</button>
    <button id="edit-save" hidden>保存</button>
    <button id="edit-new-left" hidden>+ 项目</button>
    <button id="edit-new-right" hidden>+ Lehr</button>`;
  document.body.appendChild(bar);

  bar.querySelector<HTMLElement>("#edit-toggle")!.addEventListener("click", () => {
    if (document.body.classList.contains(EDIT_MODE_CLASS)) {
      if (confirm("退出编辑？未保存的修改将丢失。")) window.location.reload();
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
  });

  document.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    if (t.matches('button[data-role="delete-card"]')) {
      const card = t.closest<HTMLElement>(".project-card");
      if (card && confirm("删除这个项目？")) {
        card.dataset.toDelete = "1";
        card.style.opacity = "0.3";
      }
    }
  });
}

buildUI();
