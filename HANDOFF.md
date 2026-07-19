# HANDOFF — Atelier Modulus 项目上下文

> **用法**：每次新对话开始时，先完整阅读本文件，再开始工作。它能让你无需重新铺垫历史、直接接上上下文。
> **维护**：每次会话结束前，更新「近期修复历史」与「当前状态」两节，并保持「红线」与「坑」准确。改动编辑器持久化逻辑时，按「坑」里的方法升级 `localStorage` key。
> **范围**：本文件同时覆盖**编辑器**（`/editor`）与**公共站点设计**（主页、coupling、filter 等）两条工作线。

---

## 1. 项目事实

| 项 | 值 |
|---|---|
| 仓库路径（沙箱） | `/workspace/atelier-modulus-website` |
| GitHub | `hanknife/atelier-modulus-website`（main 分支） |
| 技术栈 | Astro 静态站点 + pnpm + Cloudflare Pages 自动部署 |
| 字体 | IBM Plex Mono（self-host，**不可替换**） |
| 工作流 | 改代码 → commit → push → Cloudflare Pages 自动部署（约 1–2 分钟） |
| 编辑页路由 | `/editor`（独立的站内编辑器，加载 `src/scripts/edit-mode.ts`） |
| 公共站点 | `src/pages/index.astro` + `src/layouts/BaseLayout.astro` + `src/components/ProjectCard.astro` |
| Coupling 主页 | `/coupling`（`src/pages/coupling.astro` + `src/components/CouplingBoard.astro`） |
| Filter 词条页 | `/filter/[term]`（`src/pages/filter/[term].astro`） |
| 设计规范来源 | `AGENTS.md` / `WORKFLOW.md`（`atelier-modulus` 技能在本沙盒未注册，以仓库内这两个文件为准） |

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

### 编辑器相关
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

### 网站设计相关（Coupling / Filter）
13. **Coupling 主页去横向滚动**：原横向 `2820px` 固定坐标墙改为仅上下滚动的拼贴墙。
14. **随机错落**：图片顺序每次加载随机洗牌，纵向拼贴。
15. **不重叠**：相邻图片保留间距，严禁重叠。
16. **保持原图比例**：禁止裁切（`object-fit:cover` 被弃用），按库中图片自然宽高比渲染。
17. **错落尺寸**：固定 `SIZE_PATTERN` 列跨度档位产生多档宽度（span 2/3/4），后去掉 span 1 保证最小图尺寸。
18. **JS masonry**：按图片实际渲染高度计算 `grid-row-end: span N`，实现真 masonry。
19. **Filter 词条页复用**：`filter/[term].astro` 直接调用 `CouplingBoard`，与主页共用同一套 `.coupling-board` + masonry。
20. **Filter 页眉对齐**：`filter-strip` 左对齐页脚 `FILTER`、在 42px 页眉区竖向居中（`display:flex; align-items:center`）。

---

## 5. Overlay 菜单排序规则（第 2 条的具体落地）

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
7. **Coupling / Filter 拼贴墙改动坑**：
   - `pkill` 自杀链：关闭预览服务器时要用 `pkill -f "[h]ttp.server"`（中括号避免匹配自身命令行），裸 `pkill -f "http.server"` 会误杀紧随其后的 git 提交链。
   - `CouplingBoard.astro` 曾遗留嵌套双 `<section>` bug，重写时已合并为单个 bound `<section>`；不要再引入双重 wrapper。
   - `global.css` 旧规则（`.coupling-board{width:2820px}`、`tile-1..9` 固定定位等）保留未删，靠追加规则覆盖。不要再「清理」这些旧规则，否则会破坏覆盖关系。
   - 改 `CouplingBoard.astro` 或 `global.css` 的 coupling 规则时，先确认 `pnpm build` 22 页通过，并用 Playwright 检查无横向滚动、无重叠、无裁切。

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
- **Coupling / Filter 状态**：
  - Coupling 主页已改为纵向拼贴墙：无横向滚动、无重叠、保持原图比例、错落尺寸（最小 span 2）、每次加载随机洗牌。
  - Filter 词条页（`/filter/[term]`）已复用 coupling 主页的拼贴墙效果。
  - Filter 页眉 `filter-strip` 已左对齐页脚 `FILTER`、在 42px 页眉区竖向居中。
  - 相关提交：`fce5f47`（页眉对齐）、`668b821`（filter 复用）、`318112e`（最小图）、`6630434`（错落+masonry）、`f08e851`（保比例）、`cae8852`（不重叠）、`c429dc8`（去横向滚动+随机）。
- **tdrive 同步状态**：共享盘 `HANDOFF.md`（dir `fhHShMYZJJKF`，file_id `fCqidVvbsRqN`）是本文件的跨对话副本，按第 9 节协议与仓库保持双向同步；本会话已执行同步（仓库 push + 共享盘 overwrite 上传），三者（仓库工作树 / GitHub remote / tdrive）一致。

---

## 8. 给新会话 agent 的操作清单

1. 读本项目 HANDOFF.md（即本文件）。
2. 对照「红线」「坑」工作，改高危文件前先列清单确认。
3. 改动编辑器持久化/排序/菜单逻辑后，**同时验证编辑器与公共预览、左侧与右侧**，必要时硬刷新两端。
4. 若改了 `localStorage` 相关逻辑或怀疑脏缓存，**升 key 版本**（如 v4→v5）并清空旧数据。
5. 会话结束前更新「近期修复历史」和「当前状态」，保持本文件不过时。
6. push 用临时 PAT，结束恢复只读 remote。
7. **会话开始/被要求时，先跑双向同步校验**（见第 9 节）：用 `search_file` 在 tdrive（dir `fhHShMYZJJKF`，keyword `HANDOFF`）拿到共享盘版的 `file_id` 与 `size`，与仓库版比对；有他对话的「增加」就同步回仓库，有「删减」先问用户。
8. 若本会话改了本文件，结束前把最新版**上传回 tdrive**（删旧传新），保持共享盘 = 仓库最新，供他对话读取。

---

## 9. 双向同步协议（tdrive 共享盘 ↔ 仓库）

**背景**：每个对话跑在独立沙箱，互相看不到对方文件。HANDOFF.md 是跨对话的唯一共享上下文，存两份：仓库 `/workspace/atelier-modulus-website/HANDOFF.md` 与共享盘 tdrive。tdrive 是跨沙箱的 source of truth。

**tdrive 定位（不要硬编码 file_id，每次用 `search_file` 按名查最新）**：
- 根目录 dir_id：`fhHShMYZJJKF`
- 文件名：`HANDOFF`（ext=md）
- 最新 file_id：以 `search_file` 返回为准（本会话为 `fCqidVvbsRqN`）

**同步规则（用户 2025-07-19 指令「要双向」）**：
- 其他对话把改动写入共享盘；本对话负责校验并同步。
- **pull 方向（他对话 → 仓库）**：会话开始/被要求时，`search_file` 拿 tdrive 版 → 与仓库版 diff：
  - tdrive 只**增加**内容（是仓库超集）→ **自动**同步回仓库：覆盖仓库 `HANDOFF.md` → commit → push（PAT）→ 恢复只读 remote。
  - tdrive 有**删减/减少** → **先问用户**，确认后再同步。不得自行删除仓库内容。
  - 两边一致或互不超集 → 不动。
- **push 方向（仓库 → 共享盘）**：本对话改了 HANDOFF.md 后，把最新版上传回 tdrive，保持共享盘 = 仓库最新，供他对话读取。

**tdrive 访问坑（实测 2025-07-19）**：
- `file_download` 返回的预签名 URL 当前会返 `InvalidAccessKeyId`（403）——MCP 的下载 token 在服务端被拒（疑似 token 签名/mint 的 infra 问题，与客户端编码无关）。`search_file` / `file_upload` 正常。
  - 绕过：用 `search_file` 拿 `size`（字节），与仓库版 `wc -c` 比对；size 相同基本可视为一致（同一 markdown 文档字节相同即内容相同概率极高）。
  - 若必须读正文：立即用 `file_download` 拿新 URL 下载（token ~60 分钟有效）；若持续 `InvalidAccessKeyId`，说明下载通道暂不可用，本对话应改用 `search_file` 元数据核对 + 必要时问用户，**不要假装已读正文**。
- 更新共享盘：**用 `file_upload` 的 `conflict_strategy:"overwrite"` 即可覆盖同名文件**（实测会保留同一 file_id `fCqidVvbsRqN`，无需先删）。流程：`file_upload`(dir=`fhHShMYZJJKF`, file_name=`HANDOFF.md`, file_size=字节数, conflict_strategy=`overwrite`) → 拿 URL/headers → `curl -sSL -X PUT -H "Authorization: …" -H "x-cos-security-token: …" -T 文件 URL` → `file_upload_complete`(confirm_key, task_id)。上传用**请求头**鉴权（非 query 串），token 里的 `+` 不会被破坏，可正常上传；这也解释了为何下载（query 串鉴权）会偶发 `InvalidAccessKeyId` 而上传正常。

---

## 10. 网站设计关键决策（Coupling 主页拼贴墙与 Filter 词条页）

### 10.1 背景
原 coupling 主页是固定坐标的绝对定位 + 横向 `2820px` 宽滚动墙（`tile-1..9` 等固定 `left/top/width/height`）。用户要求改为：无左右滚动、随机错落、大小不一、纵向拼贴。

### 10.2 用户决策弧（需求 Q 的迭代反馈）

| # | 用户反馈 | 采纳的决策 |
|---|----------|------------|
| 1 | 去掉横向滚动 | 改为**仅上下滚动**，图片墙宽度 = 视口宽 |
| 2 | 随机、错落、大小不一 | 图片顺序每次加载**随机洗牌**（Fisher–Yates），纵向拼贴墙 |
| 3 | 有些图片相互重叠 | 相邻图片间**必须保留间距，严禁重叠** |
| 4 | 很多图片被裁切 / 原始比例变了 | **保持原图宽高比**，禁止裁切（`object-fit:cover` 被用户拒绝） |
| 5 | 没有错落感，都差不多大 | 固定 `SIZE_PATTERN` 列跨度档位，产生多档宽度（等面积放大/缩小） |
| 6 | 有些图片太小 | **最小图限制**：`SIZE_PATTERN` 去掉 span-1 档，最小为 `span 2` |
| 7 | 将 coupling 效果应用到 filter 各词条 | Filter 词条页直接复用 `CouplingBoard` 与同一套 `.coupling-board` 样式 |
| 8 | filter 页眉文字没左对齐 / 没竖向居中 | `.filter-open .filter-strip` 左对齐页脚 `FILTER`、在 42px 页眉区 `display:flex; align-items:center` |

### 10.3 最终实现方案（Coupling 主页）

- **布局**：CSS Grid
  ```css
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  grid-auto-rows: 1px;
  grid-auto-flow: row dense;
  column-gap: 20px;
  row-gap: 0;
  ```
- **错落**：`.coupling-tile` 按 `data-size`（`span 2/3/4`）跨列；
  `SIZE_PATTERN = [4, 3, 2, 3, 4, 2, 4, 3, 2, 3, 2, 4, 3, 2, 3, 2]`（16 项，对应 16 张图）。
- **真 masonry**：JS `layoutMasonry()` 量每张 `img` 实际渲染高度 → `tile.style.gridRowEnd = "span " + (Math.ceil(h) + 20)`，保证**无裁切、无重叠、保持比例**。
- **洗牌**：`DOMContentLoaded` 时对 `.coupling-board` 与 `.filter-board` 的 tile 随机重排 `className` / 顺序。
- **关键文件**：`src/components/CouplingBoard.astro`（承载 board + 洗牌 + masonry 脚本）；`src/styles/global.css` 末尾**追加** `.coupling-state` 作用域规则（`append-only`，未重写原始 `.coupling-board{width:2820px}` 等旧规则，靠更高特异性 / 靠后顺序覆盖）。

### 10.4 Filter 词条页复用（commit `668b821`）

- **决策**：将 coupling 主页的拼贴墙效果**完整复用**到 `/filter/[term]` 各词条页。
- **做法**：`src/pages/filter/[term].astro` 直接 `<CouplingBoard images={filter.images} />`，去掉原先的 `cols` 计算与 `--term-cols` 注入，走与主页完全相同的 `.coupling-board` Grid + JS masonry。
- **保留项**：词条页眉逗号分隔链接、左下角 `× REMOVE`（`footerLeftLabel="× REMOVE"`、`footerLeftHref="/coupling/"`）仍固定在左下角（`left: var(--pad-x)` = 8px）。

### 10.5 Filter 页眉对齐（commit `fce5f47`）

- **问题**：filter 点开后，页眉 `filter-strip` 文字既没左对齐页脚 `FILTER` 单词，也没在页眉区竖向居中。
- **决策（用户确认改动清单后实施）**：在 `global.css` 末尾追加
  ```css
  .filter-open .filter-strip {
    top: 0;
    left: var(--pad-x);
    height: var(--chrome-top);
    display: flex;
    align-items: center;
  }
  ```
  覆盖原 `.filter-open .filter-strip { display: block }`（source line 447）。同级特异性下靠后规则生效 → 左对齐页脚 `FILTER` 并在 42px 页眉区竖向居中。

### 10.6 验证方式（已通过）

- `pnpm build`（`astro check` + build）22 页通过。
- Playwright（headless chromium，1280 / 1440 / 1920）实测：
  - 无横向滚动
  - 无重叠（`overlap: 0`）
  - 无裁切（渲染宽高比 vs 自然宽高比 `diff: 0`）
  - 错落（3~4 档宽度）
  - filter 页 `REMOVE` 仍左下角（left:8）
  - 词条页眉逗号链接保留

### 10.7 相关提交（按时间倒序）

| hash | 日期 | 说明 |
|------|------|------|
| `fce5f47` | 2026-07-14 | fix(coupling): align filter strip left with footer and vertically center in header |
| `668b821` | 2026-07-14 | feat(coupling): apply homepage collage to filter term pages |
| `318112e` | 2026-07-14 | fix(coupling): raise minimum tile size to 2-column span |
| `6630434` | 2026-07-14 | fix(coupling): stagger homepage tile sizes with varied column spans + JS masonry |
| `f08e851` | 2026-07-14 | fix(coupling): switch homepage board to CSS columns masonry to preserve image aspect ratios |
| `cae8852` | 2026-07-13 | fix(coupling): keep collage images inside grid cells so they never overlap |
| `c429dc8` | 2026-07-13 | fix(coupling): remove horizontal scroll and make homepage collage random/staggered |

更早的 coupling 相关提交见 `git log --all`。
