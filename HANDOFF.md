# HANDOFF — Atelier Modulus 编辑器项目上下文

> **用法**：每次新对话开始时，先完整阅读本文件，再开始工作。它能让你无需重新铺垫历史、直接接上上下文。
> **维护**：每次会话结束前，更新「近期修复历史」与「当前状态」两节，并保持「红线」与「坑」准确。改动编辑器持久化逻辑时，按「坑」里的方法升级 `localStorage` key。

---

## 1. 项目事实

| 项 | 值 |
|---|---|
| 仓库路径（沙箱） | `/workspace/atelier-modulus-website` |
| GitHub | `hanknife/atelier-modulus-website`（main 分支） |
| 技术栈 | Astro 静态站点 + pnpm + Cloudflare Pages 自动部署 |
| 字体 | IBM Plex Mono（self-host，**不可替换**） |
| 工作流 | 改代码 → commit → push → Cloudflare 自动部署（约 1–2 分钟） |
| 编辑页路由 | `/editor`（独立的站内编辑器，加载 `src/scripts/edit-mode.ts`） |
| 公共站点 | `src/pages/index.astro` + `src/layouts/BaseLayout.astro` + `src/components/ProjectCard.astro` |

**推送方式**：仓库默认 remote 是只读 connector token（`oauth2:ghu_...`）。真正 push 时需临时换成用户的 PAT（`ghp_...`），push 完立即恢复只读 remote。

---

## 2. 红线（永远不可违反）

1. Overlay 滑入动画、Close 按钮位置、导航栏文字**永远不动**。
2. `global.css` / `ProjectCard.astro` **只追加不重写**。
3. 显示文字由 frontmatter 的 `list_title` 决定，**禁止运行时格式化**（允许在保存/编辑时改写 frontmatter 里的 `list_title`，但渲染显示时直接用 `list_title`，不做拼接）。
4. 左栏 projects 降序，右栏 lehrgerueste 升序（指主页卡片列顺序；**overlay 菜单**另有排序规则，见第 5 节）。
5. 改高危文件（`BaseLayout.astro` / `index.astro` / `global.css`）前，**必须先列出改动清单让用户确认**。

---

## 3. 编辑器与公共站点的关系（关键架构）

| 概念 | 说明 |
|---|---|
| `/editor` 页面 | 用 `EditorCard.astro` 渲染卡片，带 `data-slug` / `data-category` / `data-frontmatter` / `data-is-new` 等钩子 |
| 公共站点页面 | 用 `ProjectCard.astro` 渲染，**不带** `data-frontmatter` / `data-slug`，纯服务端渲染 |
| `edit-mode.ts` | 仅 `/editor` 加载的站内编辑器脚本 |
| `BaseLayout.astro` | 服务端渲染的 overlay 菜单（PROJECTS / LEHRGERÜSTE / INFO），编辑器和公共站点共用 |
| `updateOverlayListsFromDOM()` | 编辑器里实时重建左右 overlay 菜单的函数；从 `.project-column .project-card` 读取 `list_title` 并按规则排序 |
| `localStorage` key | 当前 `am_editor_overrides_v4`，保存未提交的本地编辑；换版本号即可清空脏缓存 |
| 保存流程 | `/api/save`（Cloudflare Function）→ 写回 GitHub（PAT） |

**重要**：编辑器打开时会用 JS 重建菜单（基于 DOM），公共站点只用服务端渲染的菜单。两者数据都来自 content 文件 + frontmatter，所以只要 content 文件正确，两者最终一致。编辑器可能「看起来」比公共站点更新，是因为 JS 实时重建——刷新后的真相以 content 文件 / 服务端渲染为准。

---

## 4. 近期修复历史（按时间）

1. 保存成功后关闭对话框回到编辑页 landing（不再停留编辑态）。
2. 编辑时实时更新 PROJECTS / LEHRGERÜSTE overlay 菜单。
3. 修复菜单重复（详情 overlay 也被当成卡片统计）→ 统计范围限定为 `.project-column .project-card`。
4. 修复 GitHub `tree 422 GitRPC::BadObjectState` → 保存只收列卡片，不含详情 overlay。
5. 新项目 `list_title` 格式：左 `000 New Project`（数字在左），右 `New Project 000`（数字在右）。
6. 排序：左/projects 按 `list_title` **升序**（000 在顶）；右/lehrgerueste 按 `order` **升序**。
7. 编辑器启动即调用 `updateOverlayListsFromDOM()`，使 landing 页菜单排序正确。
8. 右侧 `list_title` 同步规则：`list_title = 去掉标题前导 "000_" 后的项目名 + " 000"`（与 `P-Δ 000` / `Pagoda 000` 一致）。
9. 标题输入同步规则对所有卡片生效（不再限于 `isNew` 新卡）：左 `list_title = title`；右 `list_title = 去前缀(title) + " 000"`。
10. `collectOverrides()` 只收集 `.project-column .project-card`，不再混入详情 overlay 的旧 frontmatter。
11. **全字段 frontmatter 同步**：每次输入把改动的 `data-edit` 字段（title / location / type / year 等）都写回 `card.dataset.frontmatter`——否则刷新后 `applyOverrides()` 会用旧 frontmatter 把可见文字还原。
12. `localStorage` key 从 v1 一路升到 **v4**，每次换持久化逻辑都清掉历史脏缓存。

---

## 5. Overlay 菜单排序规则（第 2、6、8 条的具体落地）

- **左 PROJECTS**：按 `list_title` 字符串升序（`localeCompare`），所以 `000 New Project` 在顶，随后 `001 Ruin` … `090_New Project`。
- **右 LEHRGERÜSTE**：按 `order` 升序。新 lehr 项目 `order = minOrder - 1` 会浮到最顶；现有条目如 `P-Δ 000`(order 1)、`Pagoda 000`(order 2)。
- `BaseLayout.astro` 与 `edit-mode.ts` 的排序必须一致，否则编辑器与公共预览不一致。
- 红线：**数字位置**——左 `000 New Project`，右 `New Project 000`。右侧标题里允许带 `000_` 前缀（如 `000_kkProject`），但 `list_title` 要去掉前缀：`kkProject 000`。

---

## 6. 常见坑（新会话务必先看）

1. **Cloudflare 缓存**：保存后约 1–2 分钟才重建完成；编辑器 JS 包也被 Cloudflare 缓存。改完 `edit-mode.ts` 后，用户必须**硬刷新编辑器**（Cmd/Ctrl+Shift+R）才能拿到新脚本。
2. **localStorage 脏数据**：详情 overlay 与列卡片共享 slug，overlay 的 `data-frontmatter` 是旧的服务端值。历史上它污染过 localStorage，导致刷新回退到旧状态。已用「只收集列卡片」+「升 key 版本」解决。再遇到「刷新后回退」，优先怀疑 localStorage，直接升 key 版本（v4→v5→…）。
3. **`title` 与 `list_title` 要一起同步**：只改 `list_title` 不改 `title` 会让 localStorage 存旧 title，刷新即回退。
4. **编辑器 ≠ 公共预览**：编辑器靠 JS 实时重建菜单，公共站点靠服务端渲染。若两处不一致，以 content 文件 / 服务端渲染为真相；先确认 content 文件对，再让用户硬刷新两端。
5. **红线文件需确认**：改 `BaseLayout.astro` / `index.astro` / `global.css` 前先列清单给用户。
6. **README/文档**：除非用户明确要求，不要主动创建 `*.md` 文档（本 HANDOFF.md 是用户明确要求维护的例外）。

---

## 7. 当前状态（截至最新提交）

- 最新提交：见 `git log --oneline -1`（本文件本身也是一次提交）
- `localStorage` key：**`am_editor_overrides_v4`**
- `BaseLayout.astro`：projects 菜单已按 `list_title` `localeCompare` 升序；lehrgerueste 仍按 `order` 升序。
- 内容文件：当前**没有** `new-*.md` 测试项目（用户已通过编辑器删除并保存）。现有项目为原始集：
  `ruin`(001)、`the-pillar`(005)、`fangyuan-tower`(012)、`threshold-school`(018)、
  `black-room`(022)、`coupling-studies-02`+`computing-hut-02/03`(024)、`nautilus`(030)、
  `the-world-we-live-in-000`、右侧 `pagoda-000`(lehr)、`the-world-we-live-in-000`(lehr)、`archive-pavilion`(lehr) 等。
- 注意：新增测试项目后，记得在「当前状态」里登记其 slug、`title`、`list_title`、左右归属，便于后续会话核对。

---

## 8. 给新会话 agent 的操作清单

1. 读本项目 HANDOFF.md（即本文件）。
2. 对照「红线」「坑」工作，改高危文件前先列清单确认。
3. 改动编辑器持久化/排序/菜单逻辑后，**同时验证编辑器与公共预览、左侧与右侧**，必要时硬刷新两端。
4. 若改了 `localStorage` 相关逻辑或怀疑脏缓存，**升 key 版本**（如 v4→v5）并清空旧数据。
5. 会话结束前更新「近期修复历史」和「当前状态」，保持本文件不过时。
6. push 用临时 PAT，结束恢复只读 remote。
