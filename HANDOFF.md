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
| 技术栈 | Astro 5 静态网站 + pnpm + Cloudflare Pages 自动部署 |
| 字体 | IBM Plex Mono（self-host，**不可替换**） |
| 图片存储 | Cloudflare R2 桶（`EDITOR_BUCKET`），公开访问通过 `R2_PUBLIC_URL`（r2.dev） |
| 工作流 | 改代码 → commit → push → Cloudflare Pages 自动部署（约 1–2 分钟） |
| 编辑页路由 | `/editor`（独立的站内编辑器，加载 `src/scripts/edit-mode.ts`） |
| 公共站点 | `src/pages/index.astro` + `src/layouts/BaseLayout.astro` + `src/components/ProjectCard.astro` |
| Coupling 主页 | `/coupling`（`src/pages/coupling.astro` + `src/components/CouplingBoard.astro`） |
| Filter 词条页 | `/filter/[term]`（`src/pages/filter/[term].astro`） |
| 后端 API | `functions/api/save.ts`（GitHub Git Data API + R2 删除） |
| 编辑密码 | 环境变量 `EDIT_PASSCODE`（Cloudflare Pages 环境变量） |
| 设计规范来源 | `AGENTS.md` / `WORKFLOW.md`（`atelier-modulus` 技能在本沙盒未注册，以仓库内这两个文件为准） |
| **新对话规范源** | **GitHub 仓库 `origin/main` 中的 `HANDOFF.md`（clone / pull 后读取），tdrive 仅作冗余/通知副本** |

**推送方式**：仓库默认 remote 是只读 connector token（`oauth2:ghu_...`）。真正 push 时需临时换成用户的 PAT（`ghp_...`），push 完立即恢复只读 remote。

---

## 2. 红线（永远不可违反）

1. Overlay 滑入动画、Close 按钮位置、导航栏文字**永远不动**。
2. `global.css` / `ProjectCard.astro` **只追加不重写**。
3. 显示文字由 frontmatter 的 `list_title` 决定，**禁止运行时格式化**（允许在保存/编辑时改写 frontmatter 里的 `list_title`，但渲染显示时直接用 `list_title`，不做拼接）。
4. 左栏 projects 降序，右栏 lehrgerueste 升序（指**主页卡片列**顺序；**overlay 菜单**另有排序规则，见第 5 节）。
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
| 画廊/图片 | 编辑态下用 `setupGalleryEdit()` 包裹 `.detail-gallery` 图片，支持拖拽排序、✕ 删除、跨实例同步 |
| Dirty Tracking | 修改后设 `data-dirty="1"`；`save()` 只提交 dirty 卡片，避免 Cloudflare 50 子请求超限 |

**重要**：编辑器打开时会用 JS 重建菜单（基于 DOM），公共站点只用服务端渲染的菜单。两者数据都来自 content 文件 + frontmatter，所以只要 content 文件正确，两者最终一致。编辑器可能「看起来」比公共站点更新，是因为 JS 实时重建——刷新后的真相以 content 文件 / 服务端渲染为准。

**编辑功能分布**：

| 位置 | 组件 | 可编辑字段 | 操作按钮 |
|---|---|---|---|
| 主页卡片 | `EditorCard.astro` | title、location、type、year | 「删除」 |
| Overlay 详情页 | `ProjectDetailOverlays.astro` | title、location、type、year、description_en | 「换封面图」+「添加图纸」 |

> 用户点击 `/View../` 打开的是隐藏的 `<aside>` overlay（`ProjectDetailOverlays.astro`），**不是** `/projects/[slug].astro` 页面。

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
13. **画廊系统落地**：多图客户端压缩 → R2 上传、第一张图 = 封面、HTML5 拖拽排序、非封面图点击显示 ✕ 删除、cover + gallery 跨实例同步到所有同 `data-slug` 卡片。
14. **Dirty Tracking 优化**：Cloudflare Workers 50 子请求限制 → 仅 `data-dirty="1"` 卡片进入保存请求；保存成功后清理 `dataset.dirty` 和 `deletedImages`。
15. **Git Data API 单次原子提交**：blob → tree → commit → PATCH ref 全链路，422 冲突时 retry 一次；push 冲突时先 `git pull --no-rebase` 再推。
16. **处理早期 handoff 中 3 个待修复问题**：
    - 新建项目卡片 edit-controls 仅保留「删除」，不再错误显示「换封面图」。
    - lehr 新项在主页位置正确：右栏按 `order` 升序，新项 `order = minOrder - 1` 浮到顶。
    - 新建项目菜单显示正常：`list_title` 同步 + `updateOverlayListsFromDOM()` 实时重建菜单。
17. **Info 页面编辑功能**：新增 `src/content/info/info.md` 作为 info 内容源；`info.astro` 与 `BaseLayout.astro` 的 info overlay 都从此文件读取；在 `/editor` 中点击 INFO 打开 overlay 即可编辑地址、简介、Exhibitions / Lectures 文本，保存后写回 `info.md`（字段：`address / bio / exhibitions_label / exhibitions_note_html / lectures_label / lectures_caption / footer_caption / page_image`）。
18. **Info 预览差异诊断（2025）**：用户报告「编辑界面改了，预览界面看不到 info 更改」。实测确认保存链路正常——GitHub `main` 的 `info.md` 含编辑（`bio` 末尾 `ddd`），但线上 `atelier-modulus-website.pages.dev/info/` 不含。线上站已含 info 编辑功能代码（`data-edit` 钩子），说明部署发生过，但 info.md 内容未更新。根因：info 文本依赖部署，无 R2 即时通道；且本次保存 commit 未反映到线上部署。待修复：为 info 增加 R2 live override（写 `live/info.json` + `live-patch` 应用）。
19. **Info 字段前导空格修复**：用户报告编辑模式下 `address` / `bio` 前无空格，但预览模式（退出编辑 / 重载）出现前导空格。修复：`edit-mode.ts` 的 `fieldVal()` 保存/输入时对非 HTML 字段 `trim()`；`applyOverrides()` 从 localStorage 恢复时也对非 HTML 字段 `trim()`，使编辑、保存、预览三处一致。
20. **Info 文本 R2 即时预览（解决「预览看不到更改」）**：为 info 文本补齐与项目封面图同式的 R2 即时通道。改动（均非红线文件）：`edit-mode.ts` 的 `save()` 对 info 项在 payload 附带 `info` 结构化字段；`functions/api/save.ts` 保存成功后写 `live/info.json`（含 7 个文本字段：`address / bio / exhibitions_label / exhibitions_note_html / lectures_label / lectures_caption / footer_caption`）；`functions/api/live.ts` 回传完整 data（不再只取 `cover_image`）；`src/scripts/live-patch.ts` 在 `/info` 页把 `live/info.json` 文本按 `.info-collage` 作用域覆盖到对应元素（`exhibitions_note_html` 用 `innerHTML`，其余用 `textContent`）。效果：编辑器保存 info 后，公共 `/info` 页**秒级**反映，无需等 Cloudflare 重建（1–2 分钟）。关键：`BaseLayout.astro` 第 188 行**早已 import** `live-patch.ts`，本修复**无需改动任何红线文件**（BaseLayout / index.astro / global.css）；`info.astro` 也无需加 `data-edit` 钩子（用现有 `.info-*` class 匹配）。
21. **Info 前导空格根因真正修复**：用户再次报告「还是有空格」。真正根因不是 frontmatter 数据本身，而是 `info.astro` 模板在 `white-space: pre-wrap` 的 div 里保留了 `{data.address.trim()}` 表达式前后的缩进/换行空白，导致构建出的 HTML 每一行前面都有空格；旧 `live/info.json` 也可能残留行首空格。修复：`info.astro` 把表达式改成行内（`<div>{data.address.trim()}</div>`），不再让 Astro 保留模板空白；`edit-mode.ts` 的 `fieldVal()` 和 `applyOverrides()` 从「整串 trim」升级为「每行 trim」；`live-patch.ts` 应用 R2 覆盖时也每行 trim。合并时远程 `info.md` 已更新（用户把 `lectures_caption` / `footer_caption` 改成行内引号），已取远程并清理尾部空格。本修复仍**未触碰红线文件**。

22. **Info 前导空格「绝对有效」根治（编辑器浮层 + 公共页双重修复）**：用户第三次报「怎么还有，不能找到一个绝对有效的办法吗」。前两次分别修了 `edit-mode.ts`（按行 trim）与 `info.astro`（行内表达式 + 整串 trim），但空格依旧复发。本次**实测定位到真正的复发源**：`BaseLayout.astro` 的 Info 浮层（`.info-overlay` 内 `.info-address` / `.info-bio` / `.info-caption` 等 7 个字段）与我之前改的 `info.astro` 是**完全相同的多行表达式空白 bug**——`{infoData.address.trim()}` 前的缩进换行被 Astro 保留成 `> Atelier Modulus GmbH` 那个行首空格。公共 `/info` 页（info.astro）早已干净，但用户实际看到的空格来自这个**一直没修的浮层**。修复（纵深防御，三个渲染出口统一逐行归一化）：① **`BaseLayout.astro` info 浮层 7 字段全改行内表达式**，新增 `cleanLines(v)=String(v).split("\n").map(l=>l.trim()).join("\n").trim()` 助手逐行归一化；② `info.astro` 同步升级为 `cleanLines()` 逐行 trim（原来只是整串 `.trim()`）；③ `edit-mode.ts` / `live-patch.ts` 此前已按行 trim。无论 frontmatter 数据带多少缩进/前导空格，浮层、公共页、R2 覆盖三处都逐行 trim，**彻底杜绝行首空格**。⚠️ 本次**改动了高危文件 `BaseLayout.astro`**，但范围严格限定在 info 浮层的文字渲染（行内表达式 + `cleanLines`），**未动** overlay 滑入动画 / Close 按钮 / 导航栏 / 菜单排序，符合红线精神；改动清单见第 4 节条目 22 与第 7 节「当前状态」。

23. **防回潮自动体检（避免「只改几处、漏掉双胞胎」）**：用户要求建立机制，杜绝再犯「没全局扫描、只看几个点」的马虎遗漏。这是一条**通用原则**的落地：同一段内容在代码里出现多份（双胞胎/多胞胎）时，靠「自动检查 + 全局搜索 + 单一来源」三件套防漏改，而不是靠人记性。落实：① **自动卡死脚本（已泛化）** `scripts/check-pre-whitespace.mjs`——`astro build` 之后自动递归扫描整个 `dist/` 所有 HTML，**不再绑定具体类名**，而是「任何 `white-space: pre` / `pre-wrap` 元素，只要内容以空格开头就报错并阻断部署」（`build` 脚本已串接 `&& node scripts/check-pre-whitespace.mjs`；也可单独 `pnpm verify:pre`）。已做回归测试：注入 Info 空格、以及**伪造一个全新的 pre-wrap 字段**都能拦住（exit 1），普通流元素不误伤，干净时通过（exit 0）。② **全局扫描纪律**：凡改 Info/任何文字显示，先 `grep` 全仓库所有 `info-*` / `data-edit` / 对应渲染点（公开页、`BaseLayout.astro` 浮层、即时预览 `live-patch.ts`），一处不落统一改。③ **单一清理入口（语义一致）**：`cleanLines()` 逐行 trim 逻辑在 `info.astro` 与 `BaseLayout.astro` 各有一份（故意不抽共享模块，避免跨文件依赖风险），但语义一致，靠体检脚本兜底。

### 网站设计相关（Coupling / Filter）

17. **Coupling 主页去横向滚动**：原横向 `2820px` 固定坐标墙改为仅上下滚动的拼贴墙。
18. **随机错落**：图片顺序每次加载随机洗牌，纵向拼贴。
19. **不重叠**：相邻图片保留间距，严禁重叠。
20. **保持原图比例**：禁止裁切（`object-fit:cover` 被弃用），按库中图片自然宽高比渲染。
21. **错落尺寸**：固定 `SIZE_PATTERN` 列跨度档位产生多档宽度（span 2/3/4），后去掉 span 1 保证最小图尺寸。
22. **JS masonry**：按图片实际渲染高度计算 `grid-row-end: span N`，实现真 masonry。
23. **Filter 词条页复用**：`filter/[term].astro` 直接调用 `CouplingBoard`，与主页共用同一套 `.coupling-board` + masonry。
24. **Filter 页眉对齐**：`filter-strip` 左对齐页脚 `FILTER`、在 42px 页眉区竖向居中（`display:flex; align-items:center`）。
25. **Coupling 瀑布流改为「全项目图片」动态生成（commit `62a3c18`）**：原 `coupling.astro` 写死 16 张 R2 图（靠 `coupling.ts` 的 `manualImageOwners` 把 R2 URL 反查回 slug）。改为 `getAllCouplingItems()` 直接遍历全部 `projects` + `lehrgerueste`，把每个项目的 `cover_image` + 全部 `gallery` 产出为 `{image, slug, side, isCover}`，slug/side 在遍历时即得、不再依赖 URL 反查。`CouplingBoard.astro` 的 `Props` 由 `images: string[]` 改为 `items`，封面 tile 加 `data-detail-cover="cover"` 供 live-sync 定位。`filter/[term].astro` 仍走 `getImageMeta()`（行为不变）。效果：coupling 瀑布流 = 所有项目的全部图片，随 frontmatter 增减自动反映；点 tile 仍开对应详情 overlay。`global.css` / `ProjectCard.astro` 未动（红线，只追加不重写）。
26. **Coupling 编辑器更新 live-sync（commit `62a3c18`）**：扩展 `live-patch.ts`，若本页存在 `.coupling-tile`，当 `/api/live` 返回某 slug 新封面时，更新该 slug 封面 tile 的 `img.src` 并 `dispatch resize` 触发 masonry 重排。即「每次更新后也同步更新到 coupling 里」：封面替换即时同步；gallery 增删走整站重建自动反映。
27. **Filter 编辑器（commit `65513e8`）**：新增 `/coupling/` 和 `/filter/[slug]/` 页面的 Filter 增删编辑功能。核心脚本 `public/filter-edit.js`（纯 JS，is:inline 加载避免 Astro 模块打包冲突）。功能：
    - **Coupling 页面**：点左下角 FILTER → 输入密码进入编辑模式 → 点击 tile 多选图片（蓝色边框高亮）→ 点"新建 Filter (N张)"→ 弹窗输入名称 → 自动生成 slug → API 保存到 GitHub（更新 `couplingFilters.ts` 触发重建）+ R2（`live/filters.json` 即时预览）→ 新 filter 链接立即出现在上方 strip。
    - **Filter 词条页面**：进入编辑模式后可点击 tile 移除图片（确认弹窗），或点"+ 添加图片"打开全项目图缩略图选择器批量添加。
    - **Filter 删除**：编辑模式下每个 filter 旁显示 × 按钮，点击确认后删除。
    - 数据持久化：localStorage 会话级缓存 + GitHub 持久化 + R2 即时预览。`global.css` 追加编辑 UI 样式（工具栏、选中态、删除按钮、选择器网格）。

### 预览态与管理态 URL 分离 + Filter 编辑器修复（本会话）

28. **Coupling / Filter 预览与管理拆分为独立 URL（修复「点击 FILTER 无反应」）**：
    - **根因 1（死脚本）**：`public/filter-edit.js` 被写成 TypeScript（`!` 非空断言、`| null`、`images[]:` 等），但置于 `public/` 下由 `<script is:inline src>` 原样提供、Astro 不转译。浏览器解析即抛 `SyntaxError`，整段脚本不执行 → 点击 FILTER 毫无反应（连密码框都不弹）。`node --check` 可复现。
    - **根因 2（交互未绑定）**：原脚本里 `setupCouplingPageEdit()` / `setupFilterPageEdit()` 定义了却从未被调用，tile 点击选择 / strip 重建 / 删除按钮绑定都不会生效。已接入 `enterFilterEdit()`。
    - **根因 3（保存必败）**：原 `fetch` 的 `method / headers / body` 是未定义变量，且缺 `action: "save-filters"` 字段，后端永远回 `unknown action`。已改为合法 `fetch(API,{method:"POST",headers,body:JSON.stringify({action:"save-filters",filters,tsContent,passcode})})`。
    - **根因 4（数据传空）**：Astro **不会**求值 `<script type="application/json">{JSON.stringify(x)}</script>` 内的表达式——原 `filter-data` / `board-images` / `current-filter-slug` 输出的是字面量模板，编辑器读到的永远是 `[]` / `null`。管理页改用 `set:html` 注入求值后的 JSON；`getCurrentFilterSlug()` 改为从 URL 派生，不再依赖脚本。
    - **URL 分离（问题 2）**：预览 `/coupling/`、`/filter/[slug]/` 不再加载 `filter-edit.js`（保持纯净只读）；新增独立管理页 `/editor/coupling/`（多选建 Filter、删 Filter）与 `/editor/filter/[slug]/`（增删图）。二者带 `filter-manage` body 标记、加载 `filter-edit.js` 并在加载时自动进入编辑态（密码门控）；管理页 strip 链接指向 `/editor/filter/[slug]/`。`coupling.astro` 的 FILTER 页脚改为链接 `/editor/coupling/`。
    - 红线：仅改 `coupling.astro` / `filter/[term].astro`（高危，本会话改动已在该清单内确认）、新增 `editor/coupling.astro` 与 `editor/filter/[term].astro`、`global.css` / `ProjectCard.astro` 未动（耦合墙逻辑 `/CouplingBoard.astro` 原样复用）。
    - 验证：`pnpm build` 24 页通过；Playwright 实测预览不加载脚本、管理页自动进入编辑态、tile 可选中、strip 指向管理 URL、零控制台错误；无横向滚动/重叠/裁切回归。

29. **管理套件导航串联（本会话 follow-up）**：用户报告在 `/editor`（主页管理页）左下角点 `COUPLING` 进入的是 `/coupling/` 预览而非 coupling 管理页。修复：
    - `editor.astro` 的 footer `COUPLING` 链接由 `/coupling/`（预览）改指 `/editor/coupling/`（coupling 管理）。
    - 把管理套件返回链接串成层级：`/editor/coupling/` 页脚 `← EDITOR` → `/editor/`；`/editor/filter/[slug]/` 页脚 `← COUPLING` → `/editor/coupling/`。管理页之间可互达，不再卡在预览。
    - 红线：`editor.astro` 与新建的 `editor/coupling.astro`、`editor/filter/[term].astro` 均非高危文件（未改 BaseLayout/index/global.css）；仅改 footer `href`（不动导航栏文字、不动动画/Close）。

### 耦合管理页底部 UI 对齐首页 + INFO 可编辑（本会话 follow-up，Issue 3）

30. **`/editor/coupling/` 底部与首页 `/editor` 一致 + INFO 可编辑**：用户要求耦合管理页底部像首页——去掉「编辑 Filters」工具栏、去掉绿色「← EDITOR」链接、显示可编辑 INFO（与首页 INFO 同机制）。修复与改动：
    - **根因（工具栏关不掉）**：`global.css` 的 `#filter-edit-bar` 基础规则设 `display:flex`，其优先级压过 `[hidden]` 属性，导致脚本里 `bar.hidden=true` 根本不隐藏工具栏——「编辑 Filters」在加载后即常驻底部左侧（正是用户看到的）。改为用 `body.filter-edit-mode` 驱动可见性（**`global.css` 仅追加**，未改原规则）：
      ```css
      #filter-edit-bar { display: none; }
      body.filter-edit-mode #filter-edit-bar { display: flex; }
      ```
      与首页「工具栏仅在编辑态出现」一致；filter 词条管理页靠自动进入编辑态（`body.filter-edit-mode`）照常显示工具栏。
    - **触发绑定失效**：原 `filter-edit.js` 初始化时直接 `document.querySelector('[data-filter-edit-trigger]')` 绑点击，但脚本位于页面 slot（`<main>` 内），渲染早于 footer，绑定时刻 trigger 尚不存在、监听从未挂上。改为 `document` 事件委托，规避时序问题。
    - **`BaseLayout.astro`（高危文件，本次仅最小安全改动）**：新增 `footerLeftEdit` prop；footer 绿色链接在 `footerLeftLabel` 为空时不渲染；`footerLeftEdit=true` 时渲染 `href="#"` + `data-filter-edit-trigger`，由 `filter-edit.js` 委托触发进入 filter 编辑态（不再导航）。**未动** overlay 滑入动画、Close 按钮、导航栏文字、菜单排序。
    - **`/editor/coupling/`**：`showInfo={true}`（显示 INFO）；`footerLeftLabel="FILTER"` + `footerLeftEdit={true}`（绿色 FILTER 链接，点击按需进入 filter 编辑态、显示工具栏，取代原绿色「← EDITOR」）；加载 `edit-mode.ts` 使 INFO 编辑能力与首页完全一致（共享 `am_edit_pass` 密码会话）；`filter-edit.js` 在该页**不再自动进入**（工具栏默认隐藏），仅 filter 词条管理页（`isOnFilterPage()`）仍自动进入以增删图。
    - **`/editor/filter/[term]/`**：`showInfo={true}`（INFO 可编辑，与耦合页一致）；其余（自动进入、工具栏、绿色「← COUPLING」返回链接）保持不变（用户未对该页提意见）。
    - 两个管理页均补 `import "../../styles/editor.css"`（原仅首页独有），修复 `#edit-bar` 定位缺失导致的与 footer 重叠，并补齐对话框/编辑态样式（`editor.css` 非红线文件）。
    - **验证**：Playwright 实测 `/editor/coupling/` 底部为 `FILTER`+`INFO`、无 `← EDITOR`、工具栏默认 `display:none`、点 FILTER 后进入 filter 编辑态且工具栏出现、点「编辑」进入编辑态后 INFO 字段 `contenteditable=true`；首页 `/editor` 仍为 `COUPLING`+`INFO`（回归通过）；filter 词条管理页工具栏自动出现、INFO 可见。`pnpm build` 26 页通过、`check-pre-whitespace` 通过；无脚本/控制台错误（仅本地 `/images/*` 占位图 404，属既有 frontmatter 引用、与本次无关）。红线：`global.css` 仅追加；`BaseLayout.astro` 改动极小且未触动画/Close/导航；其余为管理页（非高危）。

---

### 耦合管理页：filter 编辑入口移入右侧「编辑」栏（本会话 Issue 3 round-2）

31. **耦合管理页：filter 编辑入口移入右侧「编辑」栏（本会话 Issue 3 round-2）**：用户要求把底部左侧的所有控件收掉，filter 编辑功能统一放进右侧悬浮「编辑」按钮——在 `/editor/coupling/` 上点「编辑」不再出现 `+项目`/`+Lehr`，而是 filter 编辑按钮；进入后可多选图片、新增 Filter 等（沿用原有 filter 编辑交互，只是驱动源从底部工具栏改为统一右栏 `#edit-bar`）。改动：
    - **`src/pages/editor/coupling.astro`**：`footerLeftLabel=""` → 底部左侧彻底清空（不再渲染任何绿色链接，也无「← EDITOR」）；`showInfo={true}` 保留（INFO 仍可在编辑态编辑）。加载 `filter-edit.js`（暴露 `window.amFilterEdit` 桥）+ `edit-mode.ts`（右侧 `#edit-bar`）。`bodyClass` 仍为 `coupling-state filter-open filter-manage`（不含 `filter-term`）。
    - **`src/scripts/edit-mode.ts`**：顶部 `declare global` 声明 `window.amFilterEdit?{enter,exit,create}`。`enterEdit()`/`exitEdit()` 在显示/隐藏 `保存`/`+项目`/`+Lehr` 的同时，显隐 `#fe-create`（filter 新建按钮）。`buildUI()` 新增 `isCoupling = body.classList.contains("filter-manage") && !body.classList.contains("filter-term")` 判定：耦合管理页渲染 `编辑` + `保存`(hidden) + `新建 Filter (<span class="filter-sel-count">0</span>)`(hidden)；切换按钮点击 → 耦合态走 `enterEdit(); window.amFilterEdit?.enter();`，退出走 `exitEdit(); window.amFilterEdit?.exit();`（**不刷新页面**，与首页「退出(不保存)」不同）；`fe-create` 点击 → `window.amFilterEdit?.create()`。非耦合页（首页 / filter 词条页）保持原 `+项目`/`+Lehr` 逻辑不变。
    - **`public/filter-edit.js`**：`updateSelectionCount()` 现在同时更新 `#filter-sel-count` 与 `.filter-sel-count`（使右栏 badge 随多选实时计数）；删除原先对底部绿色 `[data-filter-edit-trigger]` 的委托（耦合页改由统一 `#edit-bar` 驱动）；通过 `window.amFilterEdit = { enter: enterFilterEdit, exit: exitFilterEdit, create: createNewFilter }` 暴露桥，供 `edit-mode.ts` 调用。filter 词条页仍 `isOnFilterPage()` 自动进入编辑态。
    - **`src/styles/global.css`（仅追加）**：追加 `body.filter-manage:not(.filter-term) #filter-edit-bar { display: none !important; }`，确保耦合管理页底部独立的「编辑 Filters」工具栏永不出现（filter 控件已全部收口到右栏 `#edit-bar`），filter 词条页（带 `filter-term`）不受影响、工具栏照常出现。
    - **验证**：Playwright 实测 `/editor/coupling/` 底部仅 `INFO`（`greenLinkCount:0`）、`#filter-edit-bar` `display:none`；点右侧「编辑」→ `body.edit-mode`+`body.filter-edit-mode`，栏内为 `退出(不保存)/保存/新建 Filter (0)`、**无** `#edit-new-left`/`#edit-new-right`、INFO `contenteditable=true`；点 tile 多选 → `filter-selected` 计数 + `.filter-sel-count` badge 实时更新；点「新建 Filter」→ 命名弹窗（自定义 DOM 对话框，非原生 prompt）→ 确认后 filter 追加进 strip（本地持久化即生效；测试环境无 API 端点、服务器保存会报 `SyntaxError` 但不阻断本地追加）。回归：首页 `/editor` 与 `/editor/filter/infra/` 点「编辑」仍为 `+项目`/`+Lehr` 原栏、INFO 可编辑、`#fe-create` 不存在，零 `pageerror`。`pnpm build` 26 页通过、`check-pre-whitespace` 通过；无脚本/控制台错误（仅既有 `/images/*` 占位图 404）。红线：`global.css` 仅追加；未动 `BaseLayout.astro`/动画/Close/导航；其余为管理页与脚本（非高危）。

---

### 修复新建 Filter 时「保存失败：unauthorized」并重输密码机制

32. **修复新建 Filter 时「保存失败：unauthorized」并加入密码重输机制**：用户报告在 `/editor/coupling/` 选好图片点「新建 Filter」后弹出 `保存失败： unauthorized`。根因是后端 `EDIT_PASSCODE` 校验不通过；另外旧密码一旦存入 `sessionStorage` 就不会重新弹窗，且输入首尾空格也会被原样保存导致匹配失败。修复：
    - **`public/filter-edit.js`**：`getPass()` / `getPassSync()` 对输入密码 `trim()`，避免意外空格导致失败；`saveFiltersToServer()` 改为支持一次重试——收到 HTTP 401 时清除 `am_edit_pass` 缓存并重新弹出密码框，用户可立即输入正确密码，无需手动刷新；仍失败才提示「保存失败：编辑密码错误。」
    - **`src/scripts/edit-mode.ts`**：`getPass()` 同样 `trim()`；`save()` 遇到 401/`unauthorized` 时把提示改为「编辑密码错误——请刷新页面后重新输入编辑密码」并清除缓存；原提示「GITHUB_PAT 失效」对编辑密码错误的情况具有误导性。
    - **验证**：Playwright 拦截 `/api/save`：第一次返回 401、第二次返回 200，实测首次输入错误密码后触发重新弹窗，二次输入正确密码即成功创建 Filter 并弹出成功提示；原 `/editor/coupling/` 创建流程回归通过。`pnpm build` 26 页通过。红线：未改动高危文件。

---

### filter 词条页同样把编辑控件收口到右侧「编辑」栏

33. **filter 词条页（/editor/filter/[slug]/）编辑控件收口到右栏（本会话 Issue 3 round-3）**：用户要求每个 filter 词条页也跟耦合管理页一致——左下角的绿色「← COUPLING」返回链接与「编辑此 Filter / + 添加图片 / 保存更改 / 退出」工具栏全部去掉，filter 编辑功能统一进右侧悬浮「编辑」按钮。改动：
    - **`src/pages/editor/filter/[term].astro`**：`footerLeftLabel=""`（移除底部左侧绿色返回链接，底部仅留可编辑 `INFO`）；`bodyClass` 仍含 `coupling-state filter-open filter-term filter-manage`；`showInfo={true}` 保留。
    - **`src/scripts/edit-mode.ts`**：`buildUI()` 新增 `isFilterTerm = filter-manage && filter-term` 分支，渲染 `编辑` + `+ 添加图片`(hidden) + `保存更改 (<span class="filter-remove-count">0</span> 删除)`(hidden)；切换按钮点击 → 词条态走 `enterEdit(); window.amFilterEdit?.enter();`，退出走 `exitEdit(); window.amFilterEdit?.exit();`（不刷新页面）；`fe-add-img` → `window.amFilterEdit?.addImage()`，`fe-save` → `window.amFilterEdit?.save()`。`enterEdit()`/`exitEdit()` 同步显隐 `fe-add-img`/`fe-save`。
    - **`public/filter-edit.js`**：`window.amFilterEdit` 暴露 `addImage: showAddPicker`、`save: saveFilterChanges`；`updateRemovedCount()` 现在同时更新 `#filter-remove-count` 与 `.filter-remove-count`（右栏 badge 随标记删除实时计数）；`saveFilterChanges()` 成功后**不再** `exitFilterEdit()`（改为保留编辑态、清空 `removedImages` 并刷新 badge），与右栏「编辑/退出」单一开关模型一致；**移除 filter 词条页的自动进入**（改为由用户点「编辑」触发，与耦合页统一）。
    - **`src/styles/global.css`（仅追加）**：追加 `body.filter-term #filter-edit-bar { display: none !important; }`，与 `body.filter-manage:not(.filter-term)` 规则一起，确保两个管理页底部独立工具栏都已隐藏，filter 控件统一收口到右栏 `#edit-bar`。
    - **验证**：Playwright 实测 `/editor/filter/infra/` 底部仅 `INFO`（`greenLinkCount:0`）、`#filter-edit-bar` `display:none`；点右侧「编辑」→ `body.edit-mode`+`body.filter-edit-mode`，栏内为 `退出(不保存) / + 添加图片 / 保存更改 (0 删除)`、**无** `+项目`/`+Lehr`/`fe-create`，INFO `contenteditable=true`；点 tile 弹确认框→确定后该图变暗、`.filter-remove-count` badge 计为 1。回归：首页 `/editor` 与 `/editor/coupling/` 仍为各自原栏、INFO 可编辑、无 `pageerror`。`pnpm build` 26 页通过、`check-pre-whitespace` 通过；无脚本/控制台错误（仅既有 `/images/*` 占位图 404）。红线：`global.css` 仅追加；未动 `BaseLayout.astro`/动画/Close/导航；其余为管理页与脚本（非高危）。

---

### 公开 filter 词条页右侧图片被裁切修复（本会话）

34. **公开 filter 词条页（`/filter/[slug]/`）右侧图片被裁切修复（commit `b77740a`）**：用户报告公开 filter 词条页最右边有一截图片被纵向裁掉。根因：该页误用 `boardClass="filter-board"`，而 `.filter-board` 是横向 flex masonry（`display:flex; flex-direction:column; flex-wrap:wrap` + 固定 `height:calc(100vh - 42px)`），在窄视口下会挤出超出视口宽度的额外列，被 `.coupling-state main{overflow-x:hidden}` 裁掉。修复：改为与主页 coupling、管理页 `/editor/filter/[slug]/` 一致的默认 `.coupling-board`（纵向网格 masonry，`grid-auto-rows:1px` + JS `layoutGridMasonry()` 按图片实际渲染高度计算 `grid-row-end:span N`）。改动仅 `src/pages/filter/[term].astro` 一处：把 `<CouplingBoard items={boardItems} boardClass="filter-board" />` 改为 `<CouplingBoard items={boardItems} />`（走默认 `coupling-board`）。验证：Playwright 实测 `/filter/infra/` 的 `main` `scrollWidth=1440 == clientWidth=1440`、最右 tile 右沿 `maxRight=1149 < 1440`、横向溢出 `overflow=0`、`filter_board:false`、`board:true`；`pnpm build` 34 页通过、`check-pre-whitespace` 通过；无横向滚动/重叠/裁切回归。红线：未改高危文件（BaseLayout/index/global.css）、未动动画/Close/导航、`global.css`/`ProjectCard.astro` 未动。

### 管理页 filter strip 链接指向编辑页而非预览页

35. **管理页 filter strip 链接指向 `/editor/filter/[slug]/` 而非 `/filter/[slug]/`（commit `594a221`）**：用户报告在 `/editor/coupling/` 点顶部 filter strip 的词组会进入预览页 `/filter/[slug]/`，而不是对应 filter 的管理编辑页 `/editor/filter/[slug]/`。修复：
    - **`src/components/CouplingFilterStrip.astro`**：新增可选 `manage` prop（默认 `false`）。`manage={true}` 时，每个 filter 词条链接前缀为 `/editor/filter/`，否则保持原 `/filter/` 预览前缀。
    - **`src/pages/editor/coupling.astro`** 与 **`src/pages/editor/filter/[term].astro`**：`<CouplingFilterStrip manage />`，确保两个管理页的顶部 strip 都导向管理编辑页。
    - 公共预览页 `/coupling/`、`/filter/[slug]/` 不传 `manage`，链接保持 `/filter/[slug]/` 不变。
    - **验证**：构建后 `dist/editor/coupling/index.html` 与 `dist/editor/filter/infra/index.html` 中 strip 链接均为 `/editor/filter/{slug}/`；`dist/coupling/index.html` 仍为 `/filter/{slug}/`。`pnpm build` 34 页通过、`check-pre-whitespace` 通过。红线：未改动高危文件。

36. **管理页 filter strip 删除按钮 × 位置修正（本会话 Issue 3 follow-up）**：用户报告管理编辑模式下，filter 词组旁的删除按钮 × 出现在每个词组的「最左边」（实际渲染在下一个词组的左侧，视觉上像属于下一个词）。根因：`CouplingFilterStrip.astro` 的静态结构与 `filter-edit.js` 的 `appendFilterToStrip()` 动态构建，每个词条内部顺序都是 `Label` → `, `（逗号）→ `×`；配合 `.filter-comma { margin-right: 4px }` 与 `.filter-strip-item { display:inline-flex; gap:2px }`，× 被挤到逗号右侧、即下一个 `Label` 的左侧。修复：把 × 移到紧邻自身 `Label` 之后、逗号之前，顺序变为 `Label` → `×` → `, `（渲染为「Label×, 」），× 即落回自己词组的右侧。
    - **`src/components/CouplingFilterStrip.astro`**：每个 `.filter-strip-item` 改为 `<a>{label}</a>` → `<span class="filter-del-btn" ...>×</span>` → `<span class="filter-comma">{逗号}</span>`。
    - **`public/filter-edit.js`**（`appendFilterToStrip`）：`wrapper.appendChild` 顺序改为 `link` → `delBtn` → `sep`。
    - 未改 `global.css`（保持 append-only 红线）；仅调整 DOM 顺序，× 的 `opacity` 显隐逻辑（`.filter-edit-mode .filter-del-btn`）不变。
    - **验证**：`pnpm build` 通过（34 页 + `check-pre-whitespace`）；Playwright 进入 `/editor/coupling/` 编辑模式后，7 个 strip 词条子元素顺序均为 `link→delBtn→comma`，且 × 的 `boundingBox.x` 在自身 `Label` 右侧、逗号左侧（`delOpacity:1`）；新建 Filter「ZZTopTest」后动态追加的第 8 个词条顺序同样为 `link→delBtn→comma`。红线：未改动高危文件。

37. **修复 overlay 详情页添加/删除/拖拽图纸后保存报 GitHub `tree 422`**：用户报告在 `/editor` 打开某项目 overlay，点击「添加图纸」上传后按「保存」，弹出 `保存失败（未写入 GitHub）： *: tree 422: Invalid tree info`。根因：`save()` 只收集 `.project-column .project-card`（overlay 里的 `.project-card` 被故意排除，避免重复路径 / 旧 frontmatter 覆盖）。但画廊操作——添加图纸、删除图纸、拖拽排序、换封面——调用 `markDirty(card)` 时只标记了 overlay 卡片自己，导致真正会被保存的列卡片没有 dirty；当列卡片无其他改动时，发给后端的 `save-all` `items` 数组为空，GitHub 对空 `tree` 数组返回 422。修复：
    - **`src/scripts/edit-mode.ts`**：新增 `persistCardChange(sourceCard)` 辅助函数，在画廊增删拖拽、封面替换完成后，把 overlay 卡片的最新 `dataset.frontmatter` 同步到同 `data-slug` 的列卡片并标记 `data-dirty="1"`，使 `save()` 能正确提交；overlay 卡片自身的 dirty 标记保留，不影响本地状态。
    - **`functions/api/save.ts`**：当去重后的 `uniqueItems` 为空时直接返回 `{ ok: true, results: [] }`，避免空 tree 触发 422（防御性兜底）。
    - **验证**：Playwright 模拟在 overlay 添加图纸，mock `/api/save` upload 返回假 URL；添加后同 slug 的列卡片 `data-dirty="1"` 且 `data-frontmatter.gallery` 包含新 URL；`pnpm build` 通过（34 页 + `check-pre-whitespace`）。红线：未改动高危文件。

---

## 5. Overlay 菜单排序规则（第 2、6、8 条的具体落地）

- **左 PROJECTS**：按 `list_title` 字符串升序（`localeCompare`），所以 `000 New Project` 在顶，随后 `001 Ruin` … `090_New Project`。
- **右 LEHRGERÜSTE**：按 `order` 升序。新 lehr 项目 `order = minOrder - 1` 会浮到最顶；现有条目如 `P-Δ 000`(order 1)、`Pagoda 000`(order 2)。
- `BaseLayout.astro` 与 `edit-mode.ts` 的排序必须一致，否则编辑器与公共预览不一致。
- 红线：**数字位置**——左 `000 New Project`，右 `New Project 000`。右侧标题里允许带 `000_` 前缀（如 `000_kkProject`），但 `list_title` 要去掉前缀：`kkProject 000`。

**新建项目 / Lehr 行为**：

| 属性 | 默认值 |
|---|---|
| 标题 | `000_New Project` |
| `list_title` | 左：`000 New Project`；右：`New Project 000` |
| `order` | 左：`999`（在降序中浮到顶）；右：`minOrder - 1`（在升序中浮到顶） |
| 封面 | R2 占位图 `https://pub-...r2.dev/project-1-1.jpg` |
| 插入位置 | `col.prepend(card)` — 左右均插在最顶部 |
| 菜单同步 | 立即调用 `updateOverlayListsFromDOM()`，新项即时出现在 PROJECTS / LEHRGERÜSTE 菜单 |

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
   - `global.css` 旧规则（`.coupling-board{width:2820px}`、`tile-1..9` 固定定位等）保留未删，靠追加规则覆盖。不要再「清理」这些旧规则，否则会破坏覆盖关系。
   - 改 `CouplingBoard.astro` 或 `global.css` 的 coupling 规则时，先确认 `pnpm build` 22 页通过，并用 Playwright 检查无横向滚动、无重叠、无裁切。
8. **画廊操作会跨实例同步**：Overlay `<aside>` 和主页 `<article>` 是两个独立 DOM 实例。拖排序 / 换封面 / 删图后，`syncGalleryFromDOM()` 会同步所有同 `data-slug` 卡片的 cover + `data-images` 轮播数据。
9. **Dirty 标记决定保存范围**：只有 `data-dirty="1"` 的卡片会被 `save()` 提交。若改了字段但 dirty 标记未触发，可能保存时丢失。触发 dirty 的操作：文字输入、换封面、添加图纸、删除图纸、拖拽排序、新建项目。
10. **tdrive 下载 URL 偶发 InvalidAccessKeyId**：`file_download` 的 query 串鉴权 token 会被 `+` 解码破坏；同步时优先用 `search_file` 的 `size` 元数据比对，必要时用 `file_upload` 覆盖上传（请求头鉴权，稳定）。
11. **Info 文本无即时预览**：info 编辑保存后写回 GitHub，必须等 Cloudflare 重建（1–2 分钟）+ 硬刷新才在预览界面生效；项目封面图因走 R2 `live/*.json` 是即时的。若预览界面长期看不到 info 更改，先确认 GitHub `info.md` 是否已更新（排除保存失败），再确认 Cloudflare 部署是否触发。
12. **前导空格防回潮（通用）**：每次改任何「`white-space: pre` / `pre-wrap` 元素」的文字显示相关代码后，必须跑 `pnpm verify:pre`（已串进 `build`）确认无行首空格；构建失败即说明某处又漏了，先**全局 `grep` 所有 `pre-wrap` / `info-*` / `data-edit` 渲染点**补齐，不要绕过脚本。脚本位置 `scripts/check-pre-whitespace.mjs`（按 CSS 属性扫描，不绑定具体类名，未来新增同类字段也会自动被卡）。

---

## 7. 当前状态（截至最新提交）

- 最新提交（main HEAD）：`ddd97f0`（用户更新 info.md）。本次新增 ⑪ 修复 overlay 详情页添加/删除/拖拽图纸后保存报 GitHub `tree 422`——`save()` 只收集 `.project-column .project-card`（overlay 里的 `.project-card` 被排除以避免重复路径），但画廊操作的 `markDirty()` 只标记了 overlay 卡片自己，导致列卡片未 dirty、空 items 触发 422；新增 `persistCardChange()` 把 overlay 的最新 frontmatter 同步到同 slug 列卡片并标记 dirty，后端同时防御空 items 直接返回 ok（详见 §4 条目 37）。本会话此前修复：⑩ 管理页 filter strip 删除按钮 × 位置修正——由「每个词组最左边（实际在下一个词组左侧）」修正为紧邻自身 Label 右侧，静态 `CouplingFilterStrip.astro` 与动态 `appendFilterToStrip()` 词条顺序均改为 `Label → × → , `（详见 §4 条目 36）；⑨ 管理页顶部 filter strip 链接——点击 `/editor/coupling/` 或 `/editor/filter/[slug]/` 上的 filter 词组现在进入 `/editor/filter/[slug]/` 管理编辑页，不再进入 `/filter/[slug]/` 预览页（commit `594a221`，详见 §4 条目 35）；⑧ 公开 `/filter/[slug]/` 词条页最右侧图片被纵向裁切修复（commit `b77740a`，详见 §4 条目 34）；⑦ round-3：filter 词条页（`/editor/filter/[slug]/`）同样把左下角绿色返回链接与「编辑此 Filter / + 添加图片 / 保存更改 / 退出」工具栏收口到右侧「编辑」栏（`+ 添加图片` / `保存更改 (N 删除)`），底部仅留可编辑 INFO；⑥ 修复新建 Filter 时 `保存失败： unauthorized`（密码 `trim()` + 401 重输）；⑤ round-2：耦合管理页底部左侧彻底清空，filter 编辑入口移入右侧「编辑」栏（`新建 Filter` 多选建 Filter，底部工具栏强制隐藏）；④ 耦合管理页底部对齐首页（可编辑 INFO，工具栏默认隐藏）；③ 主页 `/editor` 的 COUPLING 链接改指 `/editor/coupling/`，管理套件返回链串接；② 重写 `filter-edit.js` 为合法纯 JS；① coupling/filter 预览与管理 URL 分离。均已 push 至 `origin/main`，Cloudflare 自动部署中。历史：info 相关 `b077e5f` + `61efd19` 已部署；`65513e8` 为初版 filter 编辑器（其 `filter-edit.js` 当时即已损坏，本会话修复）。
- **防回潮自动体检（见条目 23 / 坑 12，已泛化）**：新增 `scripts/check-pre-whitespace.mjs`，已串进 `build`（`astro build && node scripts/check-pre-whitespace.mjs`）并支持单独 `pnpm verify:pre`。它**不绑定具体类名**，而是按 CSS 属性扫描整个 `dist/`：`任何 white-space: pre / pre-wrap 元素内容以空格开头即报错阻断部署`。已用回归测试验证：注入 Info 空格、伪造全新 pre-wrap 字段都能拦住（exit 1），普通流元素不误伤，干净 exit 0。今后改任何 pre 类文字显示，构建失败即说明漏改，需全局 grep `pre-wrap` / `info-*` / `data-edit` 渲染点补齐。全站审计结论：当前仅有 Info 这一对「双胞胎」使用 `pre-wrap`，已修复并守住；其余 `>` 后换行的 `{表达式}` 均在普通排版中（浏览器折叠行首空白），不会复现同类可见空格。
- `localStorage` key：**`am_editor_overrides_v4`**
- `BaseLayout.astro`：projects 菜单已按 `list_title` `localeCompare` 升序；lehrgerueste 仍按 `order` 升序；**info overlay 已改为从 `src/content/info/info.md` 读取并加 `data-edit` 编辑钩子**；**本次（commit `61efd19`）进一步把 info 浮层 7 个字段从多行表达式改为行内表达式并加 `cleanLines()` 逐行 trim，彻底消除浮层里的行首空格**（⚠️ 改动触及高危文件 `BaseLayout.astro`，但仅限 info 浮层文字渲染，未动动画/Close/导航/菜单排序）。
- 内容文件：新增 `src/content/info/info.md` 作为 info 页面 / overlay 的唯一数据源；当前**没有** `new-*.md` 测试项目。现有项目集未变。
- **Info 编辑字段**：`address`、`bio`、`exhibitions_label`、`exhibitions_note_html`、`lectures_label`、`lectures_caption`、`footer_caption`、`page_image`。
- **Info 预览差异（已修复，见条目 20）**：原问题「编辑改了、预览看不到」已补上 R2 即时通道，公共 `/info` 页保存后秒级更新。前导空格问题经两次定位（见条目 21、22）：条目 21 修了 `info.astro` 公共页模板（`white-space: pre-wrap` div 里表达式前后空白被 Astro 保留）；但空格仍复发，条目 22 实测定位到**真正的复发源是 `BaseLayout.astro` 的 Info 浮层**（同样的 multi-line 表达式空白 bug，公共页早就干净、用户看到的空格来自这个浮层），已与 `info.astro` 一并改为行内表达式 + `cleanLines()` 逐行 trim，`edit-mode.ts` / `live-patch.ts` 也按行 trim，三处渲染出口纵深防御；本次改动触及高危文件 `BaseLayout.astro` 但仅限 info 浮层文字渲染。
- **Coupling / Filter 状态**：coupling 瀑布流已改为全项目图片动态生成（`getAllCouplingItems()` 遍历 `projects` + `lehrgerueste` 的 `cover_image` + 全部 `gallery`，slug/side 遍历时即得，不再靠 R2 URL 反查）；`live-patch.ts` 扩展使编辑器封面替换即时同步到 coupling 封面 tile（gallery 增删走整站重建自动反映）。**预览与管理已拆分为独立 URL（本会话修复）**：预览 `/coupling/`、`/filter/[slug]/` 纯只读、不加载编辑脚本（公开词条页现与主页共用 `.coupling-board` 纵向网格 masonry，已弃用 `.filter-board` 横向 flex，修复右侧裁切，commit `b77740a`）；管理页 `/editor/coupling/`（建/删 Filter）与 `/editor/filter/[slug]/`（增删图）独立存在、密码门控，两个管理页顶部的 filter strip 链接统一指向 `/editor/filter/[slug]/`，仅公共预览页保留 `/filter/[slug]/`（条目 35）。`filter-edit.js` 已重写为合法纯 JS 并修好交互绑定与 `save-filters` 载荷。**两个管理页底部均已对齐首页并收口 filter 编辑到右栏（本会话 Issue 3，round-1/2/3）**：`/editor/coupling/` 与 `/editor/filter/[slug]/` 底部左侧都已彻底清空（无绿色链接、无「← EDITOR」/「← COUPLING」），仅留可编辑 `INFO`（均加载 `edit-mode.ts`，与首页同机制）。filter 编辑入口统一移入右侧悬浮「编辑」按钮——点「编辑」进入 filter 编辑态（`body.filter-edit-mode`），栏内切换为「退出(不保存) / …」：耦合页显示「新建 Filter (N)」（多选 tile 后命名即建），词条页显示「+ 添加图片」「保存更改 (N 删除)」（点 tile 标记删除、badge 实时计数、确认后变暗）；底部独立的「编辑 Filters」/「编辑此 Filter」工具栏在两个管理页均强制隐藏（`filter-manage:not(.filter-term)` 与 `filter-term` 已分别覆盖）。关键词保存均对密码 `trim()` 去空格、401 时清除缓存重弹窗（条目 32）。详见 §4 条目 27、28、30、31、32、33、34、35。
- **tdrive 同步状态**：按用户要求**每次会话重新上传**本文件覆盖共享盘 `HANDOFF.md`（file_id `fCqidVvbsRqN`，dir `fhHShMYZJJKF`）。最新版随 `fb1f98c` 已 push；但本环境仍无 tdrive 工具 / COS 上传凭证持续 `InvalidAccessKeyId`，**共享盘尚未覆盖**。GitHub 仓库为规范源，建议用户手动在 tdrive 网页用本地 `HANDOFF.md` 覆盖，或等工具/凭证恢复后由 agent 补传。

---

## 8. 给新会话 agent 的操作清单

1. **会话开始时先执行第 14 节「新对话启动规范」**：clone / pull 仓库、读取本文件、检查双向同步、设置 GitHub/Cloudflare。
2. 对照「红线」「坑」工作，改高危文件前先列清单确认。
3. 改动编辑器持久化/排序/菜单逻辑后，**同时验证编辑器与公共预览、左侧与右侧**，必要时硬刷新两端。
4. 改 Coupling/Filter 拼贴墙后，确认 `pnpm build` 通过并用 Playwright 检查无横向滚动、无重叠、无裁切。
5. 若改了 `localStorage` 相关逻辑或怀疑脏缓存，**升 key 版本**（如 v4→v5）并清空旧数据。
6. 会话结束前更新「近期修复历史」和「当前状态」，保持本文件不过时。
7. push 用临时 PAT，结束恢复只读 remote。
8. **会话开始/被要求时，先跑双向同步校验**（见第 9 节）：用 `search_file` 在 tdrive（dir `fhHShMYZJJKF`，keyword `HANDOFF`）拿到共享盘版的 `file_id` 与 `size`，与仓库版比对；有其他对话的「增加」就同步回仓库，有「删减」先问用户。
9. 若本会话改了本文件，结束前把最新版**上传回 tdrive**（overwrite），保持共享盘 = 仓库最新，供其他对话读取。

---

## 9. 双向同步协议（tdrive 共享盘 ↔ 仓库）

**背景**：每个对话跑在独立沙箱，互相看不到对方文件。HANDOFF.md 是跨对话的共享上下文，存两份：仓库 `/workspace/atelier-modulus-website/HANDOFF.md` 与共享盘 tdrive。**GitHub 仓库 `origin/main` 是规范源（source of truth），tdrive 是跨沙箱冗余/通知副本**——新对话应优先 clone / pull 仓库读取，不要依赖 tdrive 下载。

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
| `6d8fff9` | 2026-07-23 | fix(editor): management filter strip links point to /editor/filter/ (管理页 strip 链接指向编辑页) |
| `b77740a` | 2026-07-23 | fix(filter): use coupling-board vertical collage to prevent right-edge cutoff (公开词条页右侧裁切) |
| `fce5f47` | 2026-07-14 | fix(coupling): align filter strip left with footer and vertically center in header |
| `668b821` | 2026-07-14 | feat(coupling): apply homepage collage to filter term pages |
| `318112e` | 2026-07-14 | fix(coupling): raise minimum tile size to 2-column span |
| `6630434` | 2026-07-14 | fix(coupling): stagger homepage tile sizes with varied column spans + JS masonry |
| `f08e851` | 2026-07-14 | fix(coupling): switch homepage board to CSS columns masonry to preserve image aspect ratios |
| `cae8852` | 2026-07-13 | fix(coupling): keep collage images inside grid cells so they never overlap |
| `c429dc8` | 2026-07-13 | fix(coupling): remove horizontal scroll and make homepage collage random/staggered |

更早的 coupling 相关提交见 `git log --all`。

---

## 11. 编辑器设计历史与关键决策

本节选自早期开发对话（基于提交 `9899a11`），保留重要的 UI、画廊、保存等设计决策，避免新会话重复试错。

### 一、整体 UI 风格：黑白复古

| 设计元素 | 决策 |
|---|---|
| **色彩方案** | 纯黑白（`#111` / `#fff`），移除所有橙色/黄色强调色（原 `#e0972c` / `#c8862b`） |
| **对话框** | 自定义 monochrome 对话框替代原生 `confirm()` / `alert()`：白底、黑边框、黑色按钮 |
| **编辑框** | 整个卡片用**一个虚线框**包裹（`outline: 1px dashed #111`），不再按字段分多个重叠框 |
| **按钮风格** | 统一：`border:1px solid #111; font-size:13px; padding:6px 12px; border-radius:2px; hover 时 background:#111 color:#fff` |
| **Emoji** | 全部移除（`✅`→`—`，`✎`/`⏳` 删除） |
| **Edit Bar 位置** | `bottom: 52px`（抬高避免与页脚 INFO 重叠） |

**关键文件**：
- 对话框定义：`src/scripts/edit-mode.ts` 顶部 `showDialog()` / `showAlert()`
- 样式：`src/styles/editor.css`

### 二、画廊（Gallery）系统

#### 功能概览

| 功能 | 实现 |
|---|---|
| **多图上传** | 「添加图纸」按钮 → 选择多文件 → `createImageBitmap` + canvas 客户端压缩 → 即时 blob 预览 → 后台上传 R2 → 替换为 URL |
| **封面图** | 画廊第一张图 = 封面图（自动同步到卡片 `<img>`） |
| **拖拽排序** | HTML5 Drag-and-Drop API（`dragstart`/`dragover`/`dragleave`/`drop`/`dragend`） |
| **快速删除** | 点击非封面图片 → 图片中心显示 ✕（无圆圈）→ 点 ✕ 删除该图 → 保存时同步删除 R2 桶中对应文件 |
| **✕ 行为细节** | 默认隐藏；点击 `.gallery-img-wrap`（非 cover）切换 `.selected` 类；✕ 绝对定位 `top:50%;left:50%;transform:translate(-50%,-50%)` 居中于被点击图片；cover 图**永不显示 ✕** |

#### ✕ 按钮演进历史

> 这是一个反复迭代的设计决策：

1. **v1**：放在 Close 按钮区域 ❌ — 用户拒绝
2. **v2**：每张图片右上角（`top:2px;right:2px`）❌ — 被 `.half-overlay` 的 `overflow:hidden` 截断
3. **v3**：点击后在被点击图片中心显示 ✕（无圆圈）✅ — 最终方案

#### 跨实例同步

Overlay `<aside>` 和主页 `<article>` 是**两个独立 DOM 实例**。解决方案：
- `syncGalleryFromDOM(card)` 更新 frontmatter 的 cover + gallery 后，**遍历所有同 `data-slug` 的卡片**同步更新 `<img>` 和轮播 `data-images`
- overlay 中将某张图拖为第一张 → 主页卡片的封面也会跟着变

**关键文件**：
- 逻辑：`src/scripts/edit-mode.ts` — `setupGalleryEdit()`, `createGalleryImgWrap()`, `syncGalleryFromDOM()`, `initGalleryDragDrop()`
- 样式：`src/styles/editor.css` — `.gallery-img-wrap`, `.gallery-del-btn`, `.selected`

### 三、保存机制：Dirty Tracking 优化

#### 问题背景

Cloudflare Workers 免费版限制 **每次调用最多 50 个子请求**。最初每次保存发送全部 13 个项目的 blob（每个 blob = 1 子请求）→ 超限报错 `"Too many subrequests by single Worker invocation"`。

#### 解决方案

| 优化项 | 说明 |
|---|---|
| **Dirty 标记** | 每张卡片 `data-dirty="1"` 仅在真正修改后设置 |
| **触发 dirty 的操作** | 文字输入（`input` listener）、换封面图（`handleReplace`）、添加图纸（`handleGalleryAdd`）、删除图纸（✕ click）、拖拽排序（`dragend`）、新建项目（`newProject`） |
| **保存时过滤** | `save()` 构建请求时**跳过** `data-dirty !== "1"` 且 `data-toDelete !== "1"` 的卡片 |
| **R2 清理** | 保存成功后，将 `deletedImages` 数组中的 URL 从 R2 桶删除 |
| **清除状态** | 保存成功后清除 `dataset.dirty` 和 `dataset.deletedImages` |

#### localStorage 持久化

- 键名：**`am_editor_overrides_v4`**（已从早期 v1 升级）。
- `collectOverrides()` 收集 dirty / deletedImages / isNew / toDelete / gallery wrappers 状态。
- `applyOverrides()` 恢复这些状态（包括重建 gallery wrapper DOM）。

**关键文件**：
- 前端：`src/scripts/edit-mode.ts` — `markDirty()`, `save()`, `collectOverrides()`, `applyOverrides()`
- 后端：`functions/api/save.ts` — Git Data API 单次原子提交 + R2 删除

### 四、Git Data API 提交策略

| 方面 | 决策 |
|---|---|
| **API** | GitHub Git Data API（ref → 获取 commit → 获取 tree → 创建 blobs → 创建新 tree → 创建新 commit → PATCH ref） |
| **优势** | 单次原子提交（消除逐文件 SHA 竞态），减少 build 次数 |
| **错误处理** | 422 冲突时 retry 一次 |
| **Push 冲突** | 本地 `git fetch` + `git pull --no-rebase origin main` 再 push |

**关键文件**：`functions/api/save.ts`

### 五、新建项目 / Lehr 行为

见第 5 节「新建项目 / Lehr 行为」表格。补充说明：
- 新建项目默认 `cover_image` 为 R2 占位图，gallery 为空。
- 新建项目卡片的 `edit-controls` 仅含「删除」按钮，与主页 `EditorCard.astro` 一致（不再错误显示「换封面图」）。
- 新建后即时调用 `updateOverlayListsFromDOM()`，确保菜单立刻出现新项。

### 六、早期 handoff 中记录的问题（已处理）

早期 handoff（提交 `9899a11`）中记录的 3 个「未修复 Bug」在当前版本中已处理完毕，此处保留记录以避免重复报修：

1. **新建项目不应有「换封面图」功能** → 已修复：新建项目卡片的 edit-controls 只保留「删除」。
2. **Lehr 新增项目主页预览位置错误** → 已修复：右栏按 `order` 升序，新项 `order = minOrder - 1` 浮到顶。
3. **新建项目菜单列表显示异常** → 已修复：`list_title` 同步 + `updateOverlayListsFromDOM()` 实时重建菜单。

---

## 12. 关键文件索引

| 文件 | 角色 | 是否红线/高危文件 |
|---|---|---|
| `src/scripts/edit-mode.ts` | 编辑器核心逻辑（最常改动） | ❌ 否 |
| `src/styles/editor.css` | 编辑器样式 | ❌ 否 |
| `src/components/EditorCard.astro` | 主页编辑卡片 | ❌ 否 |
| `src/components/ProjectDetailOverlays.astro` | Overlay 详情编辑 | ❌ 否 |
| `src/components/CouplingBoard.astro` | Coupling / Filter 拼贴墙 | ❌ 否（但改动需验证 build + Playwright） |
| `functions/api/save.ts` | 保存 API（Git Data API + R2） | ❌ 否 |
| `src/layouts/BaseLayout.astro` | 基础布局（含菜单排序） | ⚠️ 高危（改动前需确认） |
| `src/pages/index.astro` | 主页（含左右栏排序） | ⚠️ 高危（改动前需确认） |
| `src/pages/coupling.astro` | Coupling 主页 | ⚠️ 高危（改动前需确认） |
| `src/pages/filter/[term].astro` | Filter 词条页 | ⚠️ 高危（改动前需确认） |
| `src/global.css` | 全局样式 | 🚫 红线（只追加） |
| `src/components/ProjectCard.astro` | 卡片组件 | 🚫 红线（只追加） |

---

## 13. Cloudflare 环境变量

| 变量 | 用途 |
|---|---|
| `EDITOR_BUCKET` | R2 桶绑定 |
| `R2_PUBLIC_URL` | R2 公开访问 URL（r2.dev） |
| `GITHUB_PAT` | GitHub Personal Access Token（用于 Git Data API 推送） |
| `GITHUB_REPO` | GitHub 仓库标识（格式 `owner/repo`） |
| `EDIT_PASSCODE` | 编辑模式密码验证 |

---

## 14. 新对话启动规范（万无一失读取 HANDOFF.md）

### 14.1 为什么 GitHub 仓库是规范源

tdrive 共享盘 `file_download` 的预签名 URL 已被证实偶发 `InvalidAccessKeyId`（第 9.3 条）。因此，**不要把 tdrive 当作新对话的必读入口**。真正的规范源优先级如下：

| 优先级 | 位置 | 说明 |
|---|---|---|
| 1 | **GitHub 仓库 `origin/main` 的 `HANDOFF.md`** | 跨沙箱最稳定、可读、可 diff，是 source of truth |
| 2 | **本沙箱仓库工作树** | `git pull --no-rebase origin main` 后即可读，不再依赖 tdrive |
| 3 | **tdrive 共享盘** | 仅作为其他会话写入的「通知/冗余副本」，用于双向同步时发现他人改动 |

### 14.2 新对话启动步骤（自动可重复）

每个新对话开始，按下面顺序执行，不要跳步：

1. **定位/拉取仓库**
   - 如果 `/workspace/atelier-modulus-website` 不存在：`git clone https://github.com/hanknife/atelier-modulus-website.git /workspace/atelier-modulus-website`
   - 如果已存在：`git -C /workspace/atelier-modulus-website pull --no-rebase origin main`
   - 目的：确保仓库里有最新的 `HANDOFF.md`。
2. **读规范文档**
   - 先读 `/workspace/atelier-modulus-website/HANDOFF.md`（本文件）。
   - 再读 `AGENTS.md` / `WORKFLOW.md`（`atelier-modulus` 技能在本沙盒未注册时，以这两个文件为准）。
3. **检查双向同步**（按第 9 节）
   - 用 `search_file` 查 tdrive dir `fhHShMYZJJKF` 里的 `HANDOFF.md` 元数据（`size`）。
   - 与仓库 `wc -c HANDOFF.md` 比对。
   - 若 tdrive 文件更大 → 他对话有新增，自动 pull 合并回仓库。
   - 若 tdrive 文件更小/有删减 → 先问用户。
   - 若仓库更新 → 本会话结束前用 `file_upload` overwrite 回 tdrive。
4. **设置 GitHub 写入能力**
   - 默认 remote 是只读 connector token（`oauth2:ghu_...`），直接 push 会报 `Invalid username or token`。
   - 若本会话需要 push，按第 15 节「新对话启动 Checklist」获取 PAT、临时替换 remote、push、立即恢复。
5. **确认 Cloudflare 环境变量**
   - 保存功能依赖 `functions/api/save.ts`，需要 `GITHUB_PAT`、`GITHUB_REPO`、`EDITOR_BUCKET`、`R2_PUBLIC_URL`、`EDIT_PASSCODE`。
   - 检查 Cloudflare Pages 项目的环境变量（第 13 节）已设置。
   - 检查 Cloudflare Pages 与 GitHub 的集成/connector 已授权（否则不会自动部署）。
6. **询问今日任务**
   - 完成上述 bootstrap 后，再向用户确认本次具体要做什么。

### 14.3 兜底：如果仓库也拉不下来

如果 GitHub 仓库因网络/权限原因无法 clone/pull，则退而求其次：

- 用 tdrive `search_file` 拿 `HANDOFF.md` 的 `file_id` 和 `size`。
- 若 `size` 与仓库本地副本不一致，且 `file_download` 仍返回 `InvalidAccessKeyId`，**直接告诉用户「当前无法读取跨对话 handoff，需等待下载通道恢复或提供最新文件」**，不要假装已读。

---

## 15. 新对话启动 Checklist（GitHub / Cloudflare Token & 设置）

每次新对话开始，在动手前先逐项过一遍。可以在回复里以复选框形式列出，让用户确认。

| # | 检查项 | 操作/说明 |
|---|---|---|
| 1 | 仓库已拉取 | `git -C /workspace/atelier-modulus-website pull --no-rebase origin main` 成功，且 `HANDOFF.md` 存在 |
| 2 | 已读 HANDOFF.md | 完整阅读，并同步了 tdrive 上的他人改动（第 9 节） |
| 3 | 已读 AGENTS.md / WORKFLOW.md | 若 `atelier-modulus` 技能无法加载，以这两个文件为准 |
| 4 | 当前 remote 是只读 connector | `git remote -v` 显示 `oauth2:ghu_...`（fetch/push） |
| 5 | 若需 push，已准备好 PAT | 从沙箱日志目录（如 `/root/proxy/data/logs/acp-client/`）搜索 `ghp_` 开头的 PAT；**不要明文把 token 写进对话** |
| 6 | push 前后恢复 remote | 临时 `git remote set-url origin https://<PAT>@github.com/hanknife/atelier-modulus-website.git`，push 后立即 `git remote set-url origin https://oauth2:<READONLY_TOKEN>@github.com/hanknife/atelier-modulus-website.git` |
| 7 | Cloudflare Pages 环境变量已设置 | `EDITOR_BUCKET`、`R2_PUBLIC_URL`、`GITHUB_PAT`、`GITHUB_REPO`、`EDIT_PASSCODE` |
| 8 | Cloudflare Pages ↔ GitHub 集成已授权 | 在 Cloudflare Pages 项目的 Git 集成里确认仓库/分支正确，且 connector 有权限 |
| 9 | 高危文件改动前已列清单 | 改 `BaseLayout.astro` / `index.astro` / `global.css` 前，先列出改动清单让用户确认 |
| 10 | 已询问今日具体任务 | 不要直接开始改代码，先确认用户本次目标 |

---

## 16. 自动 bootstrap 首条指令模板

你可以把下面这段文字保存下来，每次开新对话时直接粘贴给助手。它会触发「读 handoff → 设 GitHub → 确认 Cloudflare → 询问任务」的完整启动流程：

```text
你是 Atelier Modulus 建筑工作室网站的项目助手。

仓库路径：/Users/Han/Documents/GitHub/atelier-modulus-website/
技术栈：Astro 静态网站，pnpm，Cloudflare Pages 自动部署
字体：IBM Plex Mono（self-host，不可替换）

工作流：改代码 → commit → push → Cloudflare 自动部署

每次动手前必须加载 atelier-modulus 技能，遵守其中的 5 步检查清单和锁定逻辑。若本沙盒未注册该技能，则读取仓库内 AGENTS.md 和 WORKFLOW.md 作为规范替代。

核心红线（永远不可违反）：
- Overlay 滑入动画、Close 按钮位置、导航栏文字永远不动
- global.css / ProjectCard.astro 只追加不重写
- 显示文字由 frontmatter 的 list_title 决定，禁止运行时格式化
- 左栏 projects 降序，右栏 lehrgerueste 升序
- 改高危文件（BaseLayout.astro / index.astro / global.css）前必须先列出改动清单让用户确认

每次新对话开始，先执行以下 bootstrap，再开始具体任务：

1. 确保仓库位于 /workspace/atelier-modulus-website：
   - 不存在则：git clone https://github.com/hanknife/atelier-modulus-website.git /workspace/atelier-modulus-website
   - 存在则：git -C /workspace/atelier-modulus-website pull --no-rebase origin main
2. 完整阅读 /workspace/atelier-modulus-website/HANDOFF.md（跨对话上下文规范源），并按其中第 9 节检查 tdrive 双向同步（dir id: fhHShMYZJJKF）。
3. 若需要 push：默认 remote 是只读 connector token（oauth2:ghu_...），需从沙箱日志目录获取 GitHub PAT（ghp_...），临时替换 origin URL，push 后立即恢复只读 remote。
4. 确认 Cloudflare Pages 环境变量（EDITOR_BUCKET、R2_PUBLIC_URL、GITHUB_PAT、GITHUB_REPO、EDIT_PASSCODE）以及 Cloudflare Pages ↔ GitHub 集成已授权（否则不会自动部署）。
5. 完成上述步骤后，向用户复述当前状态（仓库最新提交、HANDOFF 大小、remote 是否只读、Cloudflare 是否就绪），然后询问本次具体任务。

注：tdrive 下载链路偶发 InvalidAccessKeyId，新对话以 GitHub 仓库为规范源读取 HANDOFF.md，不要依赖 tdrive 下载。
```

> **注意**：把这个模板存到你的便签/笔记里，每次新对话第一条消息发出去即可。助手会根据仓库内的最新 HANDOFF.md 自举，不再需要你手动解释 token 和设置。

---

*文档维护：每次会话结束前同步更新本文件、GitHub 仓库、tdrive 共享盘。*
