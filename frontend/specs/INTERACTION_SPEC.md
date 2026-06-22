# CreatorOS 交互契约规格(INTERACTION_SPEC)

> **目的**:补齐 `page-specs.md` 的缺口 —— 它只定义了「组件树 + 视觉还原」,从未定义
> 「每个按钮 / 每个 tab 的动作 + 数据来源(契约 op)+ 状态(空/加载/错误)」。这份文档
> 逐 surface、逐元素把交互契约定死,作为「做真」实现与验收的唯一依据。
>
> **来源**:2026-06-23 对 22 个 surface 的全量只读审计(6 并行 agent)。
> **状态列**:`✅真实`=读写都接真实契约 op;`⚠️部分`=读真写桩/映射桩/无状态;
> `❌桩`=fixture 或写死;`❌未实现`=该功能不存在。
> **流程**:本文档属 orchestrator 08-page-spec 的交互契约补全;经用户 review 后,
> 按文末「缺口 backlog」分波实现,每波跑 gate(typecheck+test+渲染)再合并。

---
## Dashboard 首页 (`/(creator)/page.tsx`)
**数据入口**: `pages.dashboard.get`（route → `createServerClient(ctx).getDashboard()` → DashboardQueryService 组合 6 个 facade）。关键：facade 在 `persistence-client.ts` ~L1722-1773 多数桩成空，只有 publishing/learnings 接真 DB 读。

| 元素 | 类型 | 当前动作 | 数据来源 | 空/加载/错误态 | 状态 |
|---|---|---|---|---|---|
| 问候语「早上好, X!」 | 展示 | 无 | `canonicalDataset.user.displayName`（fixture，非会话用户） | 无 | ⚠️ 用户名取 fixture |
| 副标题「N 条创作建议」 | 展示 | 无 | `vm.suggestions.length`（真 learnings 计数） | 计数为 0 时改文案 | ✅真实 |
| 顶部 5 指标 MetricCard | 卡片 | 无 | `getDashboardMetrics` → `{metrics:[],trend:[]}` 桩（frozen Analytics 无 rollup） | 恒空（不渲染任何卡片） | ❌桩·恒空 |
| 继续创作·项目行 | 卡片行/Link | 跳 `/projects/{id}/{stage}` | `getDashboardSummary` → `{continueCreating:null,...}` 桩 → `zeroContinueCreating()`（projectId="none", title="") | 无专门空态，落到 sentinel 零值 | ❌桩·占位项目 |
| 继续创作·进度条/平台 chip | 展示 | 无 | progressPct=0；平台走 `getProjectPlatforms("none")`→fallback「多平台」 | 无 | ❌桩 |
| 继续创作·「＋新项目」 | Link | 跳 `/projects/new`（拦截模态） | 无 | 无 | ✅真实（导航） |
| 待办事项 列表行 | 卡片行/Link | 跳 `/projects/{id}/{stage}` 或 overview | `getDashboardSummary.todos` → `[]` 桩 | 无空态文案（列表恒空，描述显示「0 项」） | ❌桩·恒空 |
| 热门选题 行 | 列表行 | 无（行本身不可点） | `getTrendingTopics` → `[]` 桩（frozen Knowledge 无读） | 无空态文案（恒空） | ❌桩·恒空 |
| 热门选题·「去选题池」 | Link | 跳 `/topics` | 无 | 无 | ✅真实（导航） |
| 最近发布·行 | 卡片行/Link | 跳 `/publishing` | 真 `publishingService.getRecentPublications`(limit5)，但 `title:r.id`、`views:0`、`engagement:0` 写死；canonical seed 为空 | 无空态文案 | ⚠️ id当标题+0播放（读真值映射桩） |
| 数据概览·2 紧凑 MetricCard | 卡片 | 无 | `vm.dataOverview.metrics` = 同上空 metrics 桩 | 恒空 | ❌桩·恒空 |
| 数据概览·本周播放趋势 ChartFrame | 图表 | 无 | `vm.dataOverview.trend` = `[]` 桩 → summary「本周暂无播放数据」 | 有空态文案（恒触发） | ❌桩·恒空 |
| 创作建议 行 | 卡片 | 无 | 真 `learningsService.getSuggestions`(validated, conf desc, limit3) → title/recommendation/learningType | 无空态文案（有数据则渲染） | ✅真实 |
| 创作建议·CTA | Link | 按 category 跳 `/topics` 或 `/projects/{active}/{stage}` 或 `/projects/new` | category 真，但 active projectId 来自空 continueCreating（="none"） | 无 | ⚠️ CTA 目标依赖桩项目 |
| AI 助手卡·「开始对话」 | Link | 跳 `/?copilot=open` | prompt 为常量 `DASHBOARD_ASSISTANT_PROMPT` 写死 | 无 | ⚠️ prompt 写死（导航真） |

**缺口**: 在 frozen Projects/Analytics/Knowledge index 上补 `getDashboardSummary`/`getDashboardMetrics`/`getTrendingTopics` 真读（继续创作/待办/5 指标/趋势/热门选题现全恒空）；最近发布需 join revision 取标题、join Analytics 取 views/engagement，别再 `title:r.id`+0 播放。

## Projects 项目列表 (`/(creator)/projects/page.tsx`)
**数据入口**: `projects.list`（route page → ProjectsPage → `client.listProjects({pageSize:500})`，过滤 4 个 demo id，createdAt desc，前端分页 10/页）→ `buildProjectsViewModel(realProjects)`。

| 元素 | 类型 | 当前动作 | 数据来源 | 空/加载/错误态 | 状态 |
|---|---|---|---|---|---|
| 项目行·标题/简介/进度/更新时间 | 表格行 | 无（行非整体可点） | 真 `projects.list`（id/title/brief/status/currentStage/progressPct/updatedAt） | 无显式空态（列表为空则渲染空表体） | ✅真实 |
| 项目行·缩略图 label | 展示 | 无 | `thumbnailLabel`：硬编码 id→label 映射，否则 contentCategory 前 4 字；底色 hash(id) | 无 | ⚠️ 缩略图 label/底色写死 |
| 项目行·目标平台 PlatformIcon | 展示 | 无 | `getProjectPlatforms(project.id)`（fixture canonical 查表，非项目真实 target_platforms） | 无 | ⚠️ 平台读 fixture |
| 项目行·「打开」 | Link | 跳 `/projects/{slug}/{currentStage}` | slug 由 id 派生 | 无 | ✅真实（导航） |
| 项目行·「⋯」更多操作 | button | 无（无 onClick handler） | 无 | 无 | ❌未实现 |
| 状态 Tab（7 个）+ 计数 | tab | 无（纯展示，无筛选逻辑/非链接） | 计数被 `targetTotals` 硬覆盖（all:28/active:12/...）→ 不反映真实行数 | 无 | ❌桩·计数写死+不筛选 |
| ViewAndSortControls（列表/网格/排序） | 控件 | 客户端切换（见组件） | 无后端 | 无 | ⚠️ 仅 UI 状态 |
| Pagination | 控件 | 跳 `/projects?page=N` | 真（基于真实 rows.length 计算 totalPages） | 无 | ✅真实 |

**缺口**: 状态 Tab 计数停止用 `targetTotals` 硬覆盖、改按真实 status 聚合并让 Tab 真正筛选；平台改读项目 `project_target_platforms` 而非 fixture `getProjectPlatforms`；行「⋯」菜单接真操作或移除。

## New Project 新建项目 (`/(creator)/projects/new/` + `new-project-form.tsx`)
**数据入口**: route 渲染 `<DashboardPage/>`(同上桩) + `<NewProjectDialog/>`；提交走 `projects.create`（dialog `onCreate` → `client.createProject`）。

| 元素 | 类型 | 当前动作 | 数据来源 | 空/加载/错误态 | 状态 |
|---|---|---|---|---|---|
| 项目名称 输入 | 表单字段 | 受控输入；trim 非空才启用「创建」 | 本地 state | required 校验有；无 loading/error | ✅真实 |
| 一句话描述 Textarea | 表单字段 | 受控输入 | 本地 state | 无 | ✅真实 |
| 目标平台 单选卡（6） | 单选组 | 选 1（存为单元素数组） | 静态 `PLATFORM_OPTIONS` 写死 | 无 | ✅真实（选项静态合理） |
| 内容类型 单选卡（6） | 单选组 | 选模板→映射 contentType | 静态 `CONTENT_TEMPLATE_OPTIONS` 写死 | 无 | ✅真实 |
| 创作模式 单选卡（3） | 单选组 | 选 guided/flexible/freeform | 静态 `CREATION_MODE_OPTIONS` 写死 | 无 | ✅真实 |
| 「创建后进入工作区」勾选 | checkbox | 控制创建后是否跳工作区 | 本地 state | 无 | ✅真实 |
| 「取消」 | button | `onCancel`→关闭（router.back / replace `/projects`） | 无 | 无 | ✅真实 |
| 「创建」 | submit | `client.createProject({title,brief,contentType,creationMode,targetPlatforms})` → `router.refresh()` → 跳 `/projects/{created.id}/research` | 真 `projects.create` | 无 loading/error 态（await 无 try/catch，失败静默） | ⚠️ 写真但无错误/加载态 |
| 关闭 X / 遮罩点击 / Esc | 控件 | 关闭对话框 | 无 | 无 | ✅真实 |

**缺口**: 创建按钮需加 pending/disabled-during-submit 与失败错误提示（当前 `onCreate` await 无 try/catch，网络失败无反馈）。

## Project Overview 项目总览 (`/(creator)/projects/[projectId]/page.tsx` + `project-overview/`)
**数据入口**: route → `resolveProjectIdParam`（`projects.list` 解析 slug）→ `buildProjectOverviewWorkspaceViewModel`（真 `projects.get` + `projects.outputs.list` + `projects.activity.list`；其余 section 真项目 compose 空、demo 项目保 fixture）。Ownership→404。

| 元素 | 类型 | 当前动作 | 数据来源 | 空/加载/错误态 | 状态 |
|---|---|---|---|---|---|
| 标题 + 项目 ID | 展示 | 无 | 真 `projects.get`（title/id） | 读失败回退 fixture VM | ✅真实 |
| 阶段 Stepper（6） | 进度 | 无（此页 stepper 非交互） | 真项目：每阶段 status=pending、progress=0（frozen 无 per-stage 读）；demo：fixture | 真项目恒 pending | ⚠️ 阶段状态真项目恒 pending |
| 整体进度条 | 进度 | 无 | 真 `projects.get.progressPct` | 无 | ✅真实 |
| 「编辑信息」 | button | 无（无 onClick） | 无 | 无 | ❌未实现 |
| 「收藏」(Star) | button island | `client.patchProject({starred})`→refresh；初值 `getProjectById(id).starred`(fixture) | 写真；初值 fixture | pending 禁用 | ⚠️ 写真但初始 starred 读 fixture |
| 「归档」 | button island | `client.archiveProject`→refresh | 真 `projects.archive` | pending 禁用 | ✅真实 |
| 「进入下一步」 | button island | `client.transitionProjectStage({nextStage})`→refresh | 真 transition | terminal review 隐藏；pending 禁用 | ✅真实 |
| 「进入工作台」 | Link | 跳 `/projects/{slug}/{stage}` | 无 | 无 | ✅真实（导航） |
| 项目资产概览（5 stat） | 卡片 | 无 | 真项目→`assetStats:[]` 空（frozen 无资产 rollup 读）；demo→fixture | 真项目恒空（不渲染 stat） | ❌桩/fixture·真项目恒空 |
| 最近文件 列表 | 列表 | 无 | 真项目→`recentFiles:[]` 空；demo→fixture | 有空态「暂无最近文件」 | ❌桩/fixture·真项目恒空 |
| 项目动态 列表 | 列表 | 无 | 真 `projects.activity.list`（eventType→中文标题映射，actor 写死「Zyong Zhu」） | 有空态「暂无项目动态」 | ⚠️ 读真但 actor/文案写死 |
| 项目信息 dl | 展示 | 无 | 真 `projects.get`（类型/模式/开始/目标/状态） | 无 | ✅真实 |
| 输出规划 OutputPlanCard | 卡片 | 无 | **忽略 VM**，直接 `buildContentOutputsForRender(vm.projectId)`(fixture)；平台 `getProjectPlatforms`(fixture) | 无 | ❌fixture（绕过真 outputs） |
| 发布状态 列表 | 列表 | 无 | 真项目→`publishing:[]` 空；demo→fixture | 有空态「项目 X 暂无发布记录」 | ❌桩/fixture·真项目恒空 |
| 里程碑 列表 | 列表 | 无 | 真项目→`milestones:[]` 空；demo→fixture | 有空态「暂无里程碑」 | ❌桩/fixture·真项目恒空 |

**缺口**: OutputPlanCard 应渲染 VM 的真 `outputs`（现绕过 VM 直读 fixture）；补 per-stage status / assetStats / recentFiles / publishing / milestones 的真读 op（真项目现全恒空）；动态 actor 取真实用户而非写死。
# G2 — 项目内工作台(前三步)交互契约审计

## Research 研究/搜集素材 (`/projects/[projectId]/research`)
**数据入口**: `buildResearchWorkspaceViewModel`(真:`projects.get` + `materialLinks.list` + `knowledge.get` + `knowledge.revisions.list`;非真字段回退 fixture selector)

| 元素 | 类型 | 当前动作 | 数据来源 | 空/加载/错误态 | 状态 |
|---|---|---|---|---|---|
| 项目创意标题/摘要 | 展示 | 渲染 idea.title/summary | 真 `projects.get`(brief 空→占位文案) | 整个 VM 在 project READ 抛错时整体回退 fixture("未找到项目") | ✅真实 |
| 定位契合度 Badge | 展示 | 调 `evaluateGate` 出分 | 真(确定性 gate) | 组件内部自管 | ✅真实 |
| AI 搜集素材「帮我搜素材」 | AI触发 | createAITask(`research.gather_material`)→轮询 getTask→listTaskResults→采纳 confirmTask→router.refresh | 真(AdoptCandidateCard 全链路) | idle/running(spinner)/review/done/error(重试)齐全 | ✅真实 |
| 采纳「采纳全部入知识库」 | 采纳 | confirmTask→落 Knowledge | 真(material_list confirm 分支) | 同上;采纳后 refresh 回读 | ✅真实 |
| 研究笔记 列表/编辑/添加 | 输入+写 | createKnowledgeRevision(append-only)→refresh | 真(笔记 body 经 revisions.list 回读) | 空态"暂无研究笔记";无笔记时隐藏添加;**删除无 op(已知缺口)** | ✅真实 |
| 证据收藏「关联证据」 | 写 | createKnowledgeRelation(supports)→refresh | ⚠️ op 真,但 evidence 列表数据仅 fixture(真项目恒空,无 producer) | 空态"暂无证据";"取消关联"按钮 disabled(无 delete op) | ⚠️部分 |
| 资料类型 tabs(全部/文章/…) | 筛选 | 无 onChange,纯展示静态 taxonomy | 静态 fixture sourceTabs | 无(装饰) | ❌桩(故意 inert) |
| 资料收集列表行 | 展示 | 渲染 sources | 真(knowledge 项映射;tags 恒空) | 真项目无料→空列表 | ⚠️部分 |
| 趋势卡片/竞品分析表 | 展示 | 纯展示 | fixture(demo 项目)/真项目恒空 | — | ❌桩 |
| 相关标签 chips | 导航 | Link→`/search?tag=` | fixture/真项目恒空 | 空态"暂无相关标签" | ⚠️部分(导航真,数据桩) |

**缺口**: AI 搜素材+笔记修订真到底;但趋势/竞品/证据/相关标签无真 producer,真项目一律空,且笔记删除/取消关联无契约 op。

## Planning 策划(论点树) (`/projects/[projectId]/planning`)
**数据入口**: `buildPlanningWorkspaceViewModel`(真:`projects.get` + `artifacts.list`(找/建 thesis_tree)+ `artifacts.versions.list` 读 `contentData.nodes`;其余回退 fixture)

| 元素 | 类型 | 当前动作 | 数据来源 | 空/加载/错误态 | 状态 |
|---|---|---|---|---|---|
| 核心论点卡 标题/正文 | 展示 | 渲染 project.title + brief | 真 `projects.get`(brief 空→占位) | project READ 抛错→整体回退 fixture | ✅真实 |
| AI 论点树「帮我搭论点树」 | AI触发 | createAITask(`planning.thesis`)→轮询→采纳 confirmTask(artifact_version 分支 append 新版本)→refresh | 真(AdoptCandidateCard) | idle/running/review/done/error 齐全 | ✅真实 |
| 论点树 4 列结构(核心/支持/证据/反驳) | 展示 | 渲染回读的 thesisTree | 真(采纳写的 ArtifactVersion `contentData.nodes` 回读)/真项目无版本→空/demo→fixture | 每列空态"暂无数据" | ✅真实 |
| 论点树**根节点文案** | 展示 | 固定文本"AI Native Browser 重塑入口" | **硬编码字符串**(与项目无关) | 无 | ❌桩 |
| 策划 5 tabs(内容合同/论点树/…) | 筛选 | PageTabs 无 onChange | 静态 fixture tabs | 无 | ❌桩(装饰) |
| 内容合同 4 卡 + "查看全部" | 展示+按钮 | 渲染 contracts;"查看全部"无 handler | fixture contracts(锁定脚手架) | — | ❌桩 |
| 证据地图 列表 | 展示 | 渲染 evidenceMap | fixture(demo)/真项目恒空(无 producer) | 空态"暂无证据" | ❌桩(真项目空) |
| 关键素材 + "全部素材" | 展示+按钮 | 渲染 keyMaterials;按钮无 handler | fixture/真项目恒空 | 空态"暂无关键素材" | ❌桩(真项目空) |

**缺口**: 核心论点+AI 论点树读写闭环真;但根节点文案硬编码、内容合同/证据地图/关键素材无真 producer(真项目空),tabs/查看全部/全部素材按钮纯装饰。

## Script 脚本分镜 (`/projects/[projectId]/script`)
**数据入口**: `buildScriptViewModel`(fixture selector,**整 VM 来自 fixture**)+ `loadScriptEditorSections`(真:`artifacts.get` + `artifacts.versions.list` 回读当前版本 sections)仅覆盖 sections

| 元素 | 类型 | 当前动作 | 数据来源 | 空/加载/错误态 | 状态 |
|---|---|---|---|---|---|
| 编辑器正文 textarea(逐段) | 输入 | 改本地 bodies 态→翻 dirty | sections:真(saved/AI草稿版本回读;否则 fixture) | 空态"暂无脚本正文" | ✅真实(读侧) |
| 工具栏格式/标题按钮(加粗等) | toggle | aria-pressed 本地切换,**不影响正文** | 无(纯 UI 态) | 无 | ❌桩(D-008 无富文本框架) |
| 工具栏插入字形(•/引号/链接…) | toggle | 本地 active 切换,无作用 | 无 | 无 | ❌桩 |
| 「保存」按钮 | 写 | createArtifactVersion(contentText + contentData.sections)→refresh | 真(有 artifactId 时);无 artifactId(测试)→仅本地置 saved | saving/dirty(失败回 dirty 可重试)/saved | ✅真实(有损:工具栏格式态不落库,见缺口) |
| 字数/保存状态指示 | 展示 | 由本地 bodies/saveStatus 算 | 本地 | — | ✅真实 |
| AI 分镜脚本「帮我写分镜脚本」 | AI触发 | createAITask(`script.draft`)→轮询→采纳 confirmTask(artifact_version append)→refresh | 真(AdoptCandidateCard) | idle/running/review/done/error 齐全 | ✅真实 |
| 版本记录卡 + 「恢复」 | 写 | restoreArtifact(克隆目标为新当前版本)→refresh | versions 列表:**fixture**;恢复 op:真 | 空态"暂无版本记录";恢复失败静默 | ⚠️部分(列表桩,恢复真) |
| 脚本 6 tabs(大纲/正文/金句…) | 筛选 | PageTabs 无 onChange | 静态 fixture | 无 | ❌桩(装饰) |
| 大纲结构 / AI 写作建议 / 金句 卡 | 展示 | 纯渲染 | **fixture selector**(无真 producer) | 各有空态文案 | ❌桩 |

**缺口**: sections 读 + 保存/AI草稿/恢复写都真,但版本列表/大纲/AI建议/金句全是 fixture(无真 producer 回读);保存只序列化 heading+body,工具栏格式/字幕等富文本态不进 contentData(已知有损映射);根 VM 仍 fixture selector。
# G3 — 项目内工作台交互契约审计（七步后三步）

工作目录：`frontend/`。只读盘点。状态图例：✅真实 / ⚠️部分 / ❌桩 / ❌未实现。

---

## Production 制作/素材匹配 (`/projects/[projectId]/production`)

**数据入口**: route `resolveWiring`(`projects.outputs.list`+`outputs.production.get`) + builder `buildProductionWorkspaceViewModel`(`materialLinks.list`→`assets.get`，mode 取 `outputs.production.get`)

| 元素 | 类型 | 当前动作 | 数据来源 | 空/加载/错误态 | 状态 |
|---|---|---|---|---|---|
| 制作模式卡 真人口播 | 按钮 | 选中 + `outputs.production.put {productionMode: remote_recording}` → refresh | wiring(真) / 无 wiring 退本地 | 卡有 active 态；page 有 loading/error/empty | ✅真实 |
| 制作模式卡 知识演示 | 按钮 | 同上 `screen_capture` | 同上 | — | ✅真实 |
| 制作模式卡 AI 数字人 | 按钮 | disabled「即将上线」装饰 | 无 | — | ❌桩(故意) |
| AI 素材匹配「帮我配素材」 | AI 触发 | `ai.tasks` material.match → 轮询 → 渲染候选 | 真(仅 wiring 在时挂载) | AdoptCandidateCard 自带 running/empty | ✅真实 |
| 素材匹配 采纳全部 | 采纳 | 采纳→material-link(asset/production) | 真 | — | ✅真实 |
| 录制脚本列表 + 导入脚本 | 展示/链接 | 静态行；导入脚本 `href="#"` 无动作 | 真项目空、demo 取 fixture；标题/正文/时长全为 `scriptLineTitle/Body/Duration` 硬编码 | 空行有兜底 | ❌桩 |
| 素材库 分类 tab | tab | 切换 activeCategory 过滤缩略图（本地） | 静态 taxonomy(fixture)；匹配不到则显示全部 | 空「暂无素材」 | ⚠️部分 |
| 素材缩略图 | 展示 | 无交互 | 已配素材真(material.match 落的 link)；缩略图渐变 hash 生成，无真文件/时长 | 空态有 | ⚠️部分 |
| 素材统计(全部/已使用/收藏/下载池) | 展示 | 无 | 假(由 `assets.length*20+8` 等公式编造) | — | ❌桩 |
| 预览 播放/暂停/重置 | 按钮 | 切换本地 `playing` 状态 | 无网络；posterLabel/时长来自 VM(真项目"暂无预览") | — | ❌桩 |
| 预览 16:9 切换 | 按钮 | 无 onClick | 无 | — | ❌未实现 |
| 录制/字幕设置 开关(rec-overlay/sub-ai-generate) | 开关 | 本地翻转 + `outputs.production.put` config patch → refresh | wiring 真 / 无则本地 | — | ✅真实 |
| 其它设置行(分辨率/语言等) | 展示 | 静态值，无 toggle | 静态 fixture descriptors | — | ❌桩 |
| 设备检测/预览字幕效果 | 链接 | `href="#"` 无动作 | 无 | — | ❌未实现 |
| 导出视频 | 按钮 | `productions.exports.create`+`exports.complete` → refresh(dev mock 同步) | wiring 真 / 无则本地 idle→done | exporting 禁用 + done 提示 | ✅真实(mock 渲染) |
| 时间线 片段卡选中 | 按钮 | 本地 setSelectedId | fixture(真项目空) | 空态有 | ❌桩(纯本地选中) |
| 时间线 添加章节/添加新片段 | 按钮 | 本地 append + `productions.segments.create` → refresh | wiring 真 / 无则本地 | — | ✅真实 |

**缺口**: 模式/设置开关/导出/分段/素材匹配已接真契约，但录制脚本、预览播放、素材统计、时间线选中、设备检测/字幕预览/16:9/导入脚本全是装饰桩——制作页"做事"的真路径只覆盖元数据写入，没有真正的录制/剪辑/渲染产物。

---

## Publishing Workspace 项目发布 (`/projects/[projectId]/publishing`)

**数据入口**: route `resolveWiring`(`outputs.publications.list`→platform→pubId map) + builder `buildPublishingWorkspaceViewModel`(`projects.list`+`projects.outputs.list`+`outputs.publications.list`+`publications.revisions.list`)

| 元素 | 类型 | 当前动作 | 数据来源 | 空/加载/错误态 | 状态 |
|---|---|---|---|---|---|
| 顶部页 tab(发布设置/发布记录/平台管理/批量发布) | tab | 本地 setActiveTab；不切换内容区 | 静态 fixture tabs | — | ❌桩(无内容切换) |
| 标题输入框 | 输入 | onBlur/Enter → `publications.revisions.create {title}` → refresh | 真(读 current revision) / 无 pub 则 no-op | 计数本地 | ✅真实 |
| 简介 | 展示 | 只读 div（非可编辑） | 真(current revision.description)/demo fixture | — | ⚠️部分(只读) |
| 封面 + EP01/13min | 展示 | 无；渐变 hash | 假(写死 "AI Native Browser"/EP01) | — | ❌桩 |
| 标签列表(含 ×) | 展示 | × 无动作 | fixture tags | 空「暂无标签」 | ❌桩 |
| 分类/系列 | 展示 | 只读 | fixture/真项目空 | — | ❌桩 |
| 发布选项 开关(评论/草稿/通知) | 开关 | 仅本地翻转 | 硬编码 PUBLISHING_OPTIONS | — | ❌桩 |
| 更多设置(弹幕/转发) | 展示 | 无 | 硬编码 | — | ❌桩 |
| AI 一稿多平台「帮我改多平台」 | AI 触发 | `ai.tasks` publish.platform_adapt → 候选 | 真(仅 wiring 在时) | AdoptCandidateCard 自带态 | ✅真实 |
| 一稿多平台 采纳 | 采纳 | 采纳→建 Publication(+revision) | 真 | — | ✅真实 |
| 平台卡 勾选 | checkbox | 本地 toggle selected | 真 publications 渲染/demo fixture | 空态由 page 兜底 | ⚠️部分 |
| 批量设置时间/默认排期 19:30/立即发布开关 | 展示 | 无 onClick | 硬编码 | — | ❌桩 |
| 确认发布 | 按钮 | 每选中平台 `outputs.publications.create`(缺则建)+`publications.transition {published}` → refresh | wiring 真 / 无则本地翻状态 | done 提示 | ✅真实 |
| 内容日历 cell | 按钮/div | 仅 empty cell 且有 calendarWiring 时 `accounts.calendar.entries.create` → refresh | 7 天数据全硬编码 CALENDAR_DAYS；route 未传 calendarWiring | — | ❌桩(route 未接线 → 永远 inert) |
| 发布前检查 3 行 | 展示 | 无 | 硬编码全 ✓ | — | ❌桩 |
| 右栏 平台预览 + tab | 展示/tab | tab 无 onClick | 写死 "AI Native Browser"/12.3万 | — | ❌桩 |
| 平台指标摘要(累计播放等) | 展示 | 无 | 硬编码 PLATFORM_METRICS | — | ❌桩 |
| 平台对比表 | 展示 | 无 | 硬编码 PLATFORM_COMPARISON | — | ❌桩 |
| 发布清单 / 发布提示 / 评论区 | 展示 | 提示「查看更多」`href="#"` | fixture/硬编码 COMMENTS_TEASER | — | ❌桩 |

**缺口**: 真路径=标题改稿/一稿多平台/确认发布(transition)；但右栏全部指标/对比/预览/评论、发布选项开关、内容日历(route 根本没传 calendarWiring，写死 7 天)、页 tab 切换均为装饰桩。

---

## Analytics & Review 复盘分析 (`/projects/[projectId]/review`)

**数据入口**: builder `buildReviewWorkspaceViewModel` → `analytics.projects.get`(MetricSnapshot[]) 经 `buildAnalyticsReviewViewModelFromOp` 装配 metrics/漏斗/趋势；`learnings.list` overlay `aiAnalysis`；reviewsWiring={projectId}

> 关键结构：7 个 tab **共用同一套布局**。tab 切换只把 `TAB_WINDOW` 映射成时间窗(7d/30d/all)，再 `buildAnalyticsReviewViewModel(projectId, window)` 纯客户端重算 metrics+viewsTrend。**没有任何一个 tab 渲染自己独立的内容**——平台/观众/内容/收益/对比/经验 全部显示和"整体表现"一样的指标卡+漏斗+观众图+留存+关键时刻+热门作品。

| 元素 | 类型 | 当前动作 | 数据来源 | 空/加载/错误态 | 状态 |
|---|---|---|---|---|---|
| tab① 整体表现 | tab | window=all → 指标卡/漏斗/趋势 | 真(`analytics.projects.get` rawMetrics 聚合；delta 留空不造假) | page loading/error/empty | ✅真实 |
| tab② 平台表现 | tab | window=30d 重算同一套指标 | fixture 时间窗(对真数据 op 只在 window=all 生效，切窗回 fixture 选择器) | — | ❌桩(无平台维度，仅缩窗) |
| tab③ 观众分析 | tab | window=7d 重算同套指标 | 观众画像/来源/留存全 fixture(audience-breakdown 表，无真 op) | — | ❌桩 |
| tab④ 内容分析 | tab | window=30d 同套 | 无内容维度数据 | — | ❌桩 |
| tab⑤ 收益分析 | tab | window=all 同套 | **无任何收益/变现数据**(尽管已有 monetization 模块) | — | ❌未实现 |
| tab⑥ 对比分析 | tab | window=all 同套 | 无对比维度 | — | ❌未实现 |
| tab⑦ 经验沉淀 | tab | window=all 同套 | 经验只在右栏 InsightCard(learnings)，tab 本身无专属区 | — | ❌桩(经验在右栏,非此 tab) |
| 7 张核心指标卡 | 展示 | 无 | ✅真(rawMetrics 聚合,window=all) | — | ✅真实 |
| 主图 趋势/漏斗 切换 | tab | 切换强调,两图都挂载 | 趋势真(真总量×TREND_WEIGHTS 权重摊到 7 天,非真日序);漏斗真(plays/ctr/收藏 推导) | sr-only summary | ⚠️部分(真总量+近似形状) |
| 播放趋势图 | 图表 | 无 | 总量真、日分布近似(权重) | — | ⚠️部分 |
| 转化漏斗 | 图表 | 无 | 真(曝光=plays/ctr,转化=favorites 代理) | — | ✅真实 |
| 观众画像(环) | 图表 | 无 | fixture 年龄分布(`pickAudienceProfile`,无真 op) | DEFAULT 兜底 | ❌桩 |
| 观众来源(条) | 图表 | 无 | fixture(`pickAudienceSource`) | — | ❌桩 |
| 留存曲线 | 图表 | 无 | fixture(`pickRetentionCurve`) | — | ❌桩 |
| 关键时刻 行选中 | 行 | 本地 setActiveMomentId | fixture keyMoments | — | ❌桩 |
| 热门作品列表 + 查看全部 | 展示 | `data-inert="decorative"` 无动作 | fixture topPublished | — | ❌桩 |
| 右栏 AI 洞察 InsightCard | 展示 | 无 | ✅真(`learnings.list`,validated 优先,真项目空则空卡) | 空态有 | ✅真实 |
| AI 复盘「帮我复盘」 | AI 触发 | `ai.tasks` review.analyze → 候选 | 真 | AdoptCandidateCard 自带态 | ✅真实 |
| 复盘 采纳 | 采纳 | 采纳→Learnings(回喂选题) | 真 | — | ✅真实 |
| 复盘编辑 开始复盘 | 按钮 | `reviews.create {project}` → refresh | reviewsWiring 真 / 无则 inert | — | ✅真实 |
| 复盘编辑 类型 select + 标题/说明 + 添加洞察 | 输入/按钮 | `reviews.insights.create` → refresh | 真(需先 开始复盘) | 标题空 no-op | ✅真实 |
| 完成复盘 | 按钮 | `reviews.complete` → refresh | 真 | — | ✅真实 |
| 添加发布 / 生成复盘报告 | 按钮 | `data-inert="decorative"` disabled | 无(未来波次) | — | ❌未实现(故意) |
| 复盘记录 行选中 | 行 | `reviews.get` 读详情(只读,不 refresh) | 列表 fixture reviewHistory；点开详情真 | 详情 panel 条件渲染 | ⚠️部分(列表桩,详情真) |

**缺口**: 整体表现(指标卡/漏斗/趋势)+右栏(洞察/复盘 CRUD/AI 复盘)是真的；但 7 个 tab 共用一套布局只换时间窗——平台/内容维度无数据,收益/对比 tab 完全未实现(monetization 模块未接入),观众三图+关键时刻+热门作品全 fixture,经验沉淀 tab 无专属内容(经验实际在右栏)。
## Knowledge & Memory 知识库 (`/knowledge`)
**数据入口**: `buildKnowledgeDashboardViewModel()` (server) → `knowledge.list` (real, page1/pageSize200) + `knowledge.relations.list` (fan-out per item); 写侧 `knowledge.create` / `knowledge.revisions.create`. 洞察栏/图谱来自 fixture `buildKnowledgeViewModel()`.

| 元素 | 类型 | 当前动作 | 数据来源 | 空/加载/错误态 | 状态 |
|---|---|---|---|---|---|
| 新建知识 按钮 | 按钮 | 切换内联创建表单 | 客户端 state | — | ✅真实 |
| 创建表单(标题/类型select/内容/保存) | 表单 | `knowledge.create` → `router.refresh()` | `knowledge.create` (POST) | 标题空禁用提交; pending 禁用 | ✅真实 |
| 搜索框 | 搜索 | 按 title/tags 客户端过滤 recent + 镜像 `?q=` | 客户端 over `knowledge.list` 行 | 无匹配显示空行 | ⚠️部分(客户端 over list) |
| 筛选 chips(全部/参考/笔记/片段/记录) | tab/筛选 | 按 type 客户端过滤 recent | 客户端 over list | — | ⚠️部分(客户端,灵感无 chip) |
| 指标卡 知识条目(km-total) | 卡片 | 显示 | `knowledge.list` 计数(真) | — | ✅真实 |
| 指标卡 本周新增(km-week) | 卡片 | 显示 | `knowledge.list` createdAt≤7d(真) | — | ✅真实 |
| 指标卡 复用片段(km-snippets) | 卡片 | 显示 | `knowledge.list` type=snippet(真) | — | ✅真实 |
| 指标卡 知识关联(km-relations) | 卡片 | 显示 | `knowledge.relations.list` 边数聚合(真);null→fixture | — | ⚠️部分(无信号回退 fixture) |
| 指标卡 记忆命中率(km-memory) | 卡片 | 显示 | fixture(无 read op) | — | ❌桩 |
| 知识分类 CategoryPanel | 列表 | 显示(行无 onClick) | `knowledge.list` 按 type tally(真) | 空 list→空数组,honest empty | ✅真实(数据); 行不可点 |
| 最近更新表格 行选择 | 卡片操作 | 选中行→展开「添加修订」表单 | `knowledge.list` recent(真) | 空→"没有匹配的知识条目" | ✅真实 |
| 添加修订表单(选中后) | 表单 | `knowledge.revisions.create` → refresh | POST revisions(真) | 内容空禁用 | ✅真实 |
| 行内 标签 TagChip | 卡片操作 | 无 handler(装饰) | fixture/真行的 tags | — | ❌桩(inert) |
| 热门标签 PopularTags | 卡片操作 | `<Link>` 到 `/knowledge?tag=` | fixture | — | ⚠️部分(链接存在,`?tag=` 未被消费) |
| 记忆洞察 MemoryInsights | 列表 | 显示 | fixture(无 read op) | — | ❌桩 |
| 未整理 UnsortedItems | 列表 | 显示(无 handler) | fixture | — | ❌桩 |
| 可复用片段 ReusableSnippets | 列表 | 显示(无插入 handler) | fixture | — | ❌桩 |
| 知识图谱 KnowledgeGraph 图表 | 图表 | 显示 | fixture graphSeries(无 read) | series 空→"暂无数据" 文案 | ❌桩 |

**缺口**: 指标3卡+分类+最近+创建/修订做真,但记忆命中率/洞察/未整理/片段/图谱/热门标签仍 fixture,搜索与筛选只是客户端 over 单页 list;分类行与标签不可点,`?tag=` 未被消费。

## Assets Center 素材库 (`/assets`)
**数据入口**: server `assets.list`(page1/pageSize200,active-only) + `projects.list`(picker); URL `?type=`/`?q=`/`?page=`/`?pageSize=` 驱动 `deriveGallery`(客户端 over read 页);写侧 uploads.create+complete / assets.get / addAssetFile / trashAsset / materialLinks.create.

| 元素 | 类型 | 当前动作 | 数据来源 | 空/加载/错误态 | 状态 |
|---|---|---|---|---|---|
| 工具栏 搜索框 | 搜索 | 提交导航 `?q=` → 服务端重读 | `assets.list` 行 + 客户端 substring | 清空恢复全量 | ⚠️部分(无服务端 q 参,客户端 over 页) |
| 上传素材 按钮 | 上传 | 真 file input → `uploads.create`+`uploads.complete` → refresh | 真两阶段上传(仅 metadata,无字节 PUT) | pending 禁用 | ⚠️部分(元数据真,字节未传) |
| 类型窄栏(全部/图片/视频/音频/文档/字幕) | 筛选 | `<Link>` `?type=` → 服务端重读重导 | `assets.list` 真计数 | — | ✅真实 |
| 类型窄栏 计数 | 表格列 | 显示 | `assets.list` 真 tally | — | ✅真实 |
| 存储空间卡 | 卡片 | 进度条显示 | fixture `vm.storage`(buildAssetsViewModel) | — | ❌桩 |
| 画廊结果计数「共 N 个素材」 | 表格列 | 显示 | 真 filtered count | — | ✅真实 |
| 素材卡 选择 | 卡片操作 | 选中→驱动右侧详情面板 | `assets.list` 真行 | — | ✅真实 |
| 分页(页码/下一页) | 分页 | 导航 `?page=`/`?pageSize=` → 服务端重读 | 真 `assets.list` 分页 | — | ✅真实 |
| 每页条数 select(12/24/48/60/100) | 分页 | 导航 pageSize 回第1页 | 真 | — | ✅真实 |
| 详情:下载 | 卡片操作 | `assets.get`(确认所有权);jsdom 下 no-op 导航 | `assets.get`(真 op);签名 URL mock | pending 禁用 | ⚠️部分(op 真,实际下载 mock/no-op) |
| 详情:复制链接 | 卡片操作 | `assets.get` → clipboard 写 mock URL | `assets.get`(真);URL 为 `mock://` | clipboard 缺失 catch | ⚠️部分(URL 为 mock) |
| 详情:收藏 | 卡片操作 | `assets.files.create`(代理收藏,无专用字段) | `addAssetFile`(真 op,语义代理) | pending 禁用 | ⚠️部分(无 favorite 字段,借 file 版本) |
| 详情:更多→移入回收站 | 卡片操作 | `assets.trash`(active→deleted) → refresh | 真 op | pending 禁用 | ✅真实 |
| 详情:附到项目 | 卡片操作 | `materialLinks.create`(asset→project 用料链) → refresh | 真 op | projects 空→无选项 | ✅真实 |
| 详情:用料历史 UsageHistory | 表格列 | 显示 | fixture `vm.usageHistory` | — | ❌桩 |
| 媒体缩略图 | 卡片操作 | 确定性 token 渲染(无真文件) | 派生 token | — | ❌桩(无真预览) |

**缺口**: list/分页/类型筛选/选择/trash/附到项目做真,但上传只传元数据(字节未上)、下载/复制链接走 mock URL、收藏借 file-version 代理、存储卡+用料历史+缩略图仍 fixture;搜索无服务端参数(客户端 over 页)。

## Publishing Center 发布中心 (`/publishing`)
**数据入口**: server `buildPublishingCenterViewModelReal(ctx)` 遍历 `projects.list`→`projects.outputs.list`→`outputs.publications.list`(过滤 DEMO 项目),表现列接 `analytics.publications.get`(`resolvePerformance`),标题接 `publications.revisions.list`;**零真行或读失败→整盘回退 fixture**;analytics rail 始终 fixture. 写侧 `publications.transition`. 分页客户端 PAGE_SIZE=6.

| 元素 | 类型 | 当前动作 | 数据来源 | 空/加载/错误态 | 状态 |
|---|---|---|---|---|---|
| 内容类型 tabs(全部/视频/图文/音频) | tab | 客户端过滤表 + 计数 + 复位页 | 真行(count 真);tab 标签 fixture | — | ✅真实(count 真) |
| 工具栏 搜索框 | 搜索 | 客户端过滤(标题/项目/平台)+ 镜像 `?q=` | 客户端 over 真行 | — | ⚠️部分(客户端) |
| 筛选 chips(全部/近7天/近30天/待优化) | 筛选 | 客户端 predicate(REFERENCE_DATE=2026-06-20 固定) | 客户端 over 真行 | — | ⚠️部分(参考日期硬编码) |
| 全选 checkbox | 表格操作 | 选/反选当前页可见行 | 客户端 | — | ✅真实(交互) |
| 行 checkbox | 表格操作 | 加入/移除选择集 | 客户端 | — | ✅真实(交互) |
| 已选计数 | 表格列 | 显示 selectedIds.size | 客户端 | — | ✅真实 |
| 批量发布 | 表格操作 | 逐行 `publications.transition`→published → refresh | 真 op | 无非 published 行→no-op;选0禁用 | ✅真实 |
| 批量下架 | 表格操作 | 逐行 transition→removed | 真 op | 仅对 published 行 | ✅真实 |
| 修改时间 | 表格操作 | 逐行 transition→scheduled(仅 draft;时间未带) | 真 op(仅 status,无 scheduledAt) | 仅对 draft 行 | ⚠️部分(只改状态,不带时间) |
| 表格列 内容(标题+缩略图) | 表格列 | 显示 | 标题=`publications.revisions.list`真;缩略图=派生 token | — | ⚠️部分(标题真,缩略图桩) |
| 表格列 项目 | 表格列 | 显示 | `projects.list`真 | — | ✅真实 |
| 表格列 平台 | 表格列 | 显示 + PlatformIcon | publication.platform 真 | — | ✅真实 |
| 表格列 发布时间 | 表格列 | 显示 | publishedAt/scheduledAt/createdAt 真 | — | ✅真实 |
| 表格列 状态 | 表格列 | StatusBadge | publication.status 真(映射) | — | ✅真实 |
| 表格列 表现(播放/互动) | 表格列 | 显示 | `analytics.publications.get` rawMetrics 真;无快照→"暂无数据" | 无快照中性"暂无数据" | ✅真实 |
| 行 查看 操作 | 卡片操作 | `<Link>` 到 `/projects/[projectId]` (D3) + 标记 active | projectId 真 | 无 projectId→`/projects` | ✅真实 |
| 分页(上/下/页码) | 分页 | 客户端切片(PAGE_SIZE=6) | 客户端 over 真行(VM pagination 字段忽略) | — | ⚠️部分(客户端分页,非服务端) |
| AnalyticsRail:指标卡×N | 卡片 | 显示 | fixture metrics(无 read) | — | ❌桩 |
| AnalyticsRail:平台对比 | 图表 | 显示 | fixture platformComparison | — | ❌桩 |
| AnalyticsRail:趋势图 | 图表 | 显示 | fixture trend | — | ❌桩 |
| AnalyticsRail:热门内容 | 列表 | 显示 | fixture topContent | — | ❌桩 |

**缺口**: 发布表 7 列(含表现列 analytics 真、标题 revision 真)、批量发布/下架、查看深链全做真,但整条 analytics rail(指标/平台对比/趋势/热门)仍 fixture、缩略图派生桩、修改时间只改状态不带排期时间、搜索/筛选/分页均客户端 over 真行;零真行时整盘静默回退 fixture(空态被掩盖)。
## Experience Center 经验中心 (`/experience`)
**数据入口**: route `experience/page.tsx` → `buildExperienceWorkspaceViewModel()` (REAL `learnings.list`) + `projects.list` (apply targets); 退化时 `buildExperienceViewModel()` fixture

七步 tab 说明:七个 tab 都由同一个客户端 `useState(activeTab)` 控制,**只是对同一份 records 列表按 `recordTabId`(record.tabId 或 category→tab 映射)做客户端过滤** —— 切 tab **不发任何网络请求**,不拉取 tab 专属内容。tab 标签/分类卡来自 fixture(无真实来源);records 行本身来自真实 learnings。

| 元素 | 类型 | 当前动作 | 数据来源 | 空/加载/错误态 | 状态 |
|---|---|---|---|---|---|
| Tab「全部」 | tab(client filter) | setActiveTab('all') → 显示全部 records | records=真实 learnings.list;tab 标签=fixture | 空 learnings→空表;读失败→fixture VM | ⚠️部分(交互真,标签 fixture) |
| Tab「选题策划」 | tab(client filter) | 过滤 recordTabId==='topic' | 同上(category 映射 strategy) | 无独立空态 | ⚠️部分 |
| Tab「脚本结构」 | tab(client filter) | 过滤 'script' | 同上(hook/structure) | — | ⚠️部分 |
| Tab「拍摄执行」 | tab(client filter) | 过滤 'shoot' | 同上(process) | — | ⚠️部分 |
| Tab「后期剪辑」 | tab(client filter) | 过滤 'edit' | 同上(无 learningType 映射到 edit→该 tab 恒空) | 恒空 | ⚠️部分(数据无来源) |
| Tab「互动运营」 | tab(client filter) | 过滤 'engage' | 同上(conversion_pattern/offer_insight) | — | ⚠️部分 |
| Tab「复盘沉淀」 | tab(client filter) | 过滤 'review' | 同上(failure + 未知类型兜底) | — | ⚠️部分 |
| 顶部 ExperienceTabs(PageTabs) | tab(装饰) | 纯展示,无 onClick(与下方交互 tab 重复) | fixture tabs | 无 | ❌桩(装饰) |
| AI 洞察总结 4 卡 | 展示 | 总数/已验证/复用率/待改进数值真,delta/trend/tone=fixture | `learnings.list` 计数 | 0 learnings→0 值 | ⚠️部分 |
| 最近发现列表 | 展示 | top4 非废弃 learning,effectLabel=置信度 | `learnings.list` | 空→空列表;失败→fixture | ✅真实(读) |
| 经验库分类 6 卡 | 展示 | 静态计数卡 | fixture | 无 | ❌桩 |
| 记录表「应用经验」 | 按钮 | `createLearningApplication({learningId,projectId})`→refresh | 真实 op;projectId=projects.list[0] | applyTargets 空→按钮隐藏;pending→disabled | ✅真实 |
| 记录表「验证」 | 按钮 | `evaluateLearning(validated)`→refresh | 真实 op | candidate 才显示;pending disabled | ✅真实 |
| 记录表「废弃」 | 按钮 | `evaluateLearning(discarded)`→refresh | 真实 op | 同上 | ✅真实 |
| 右栏 价值概览 | 展示 | 静态 | fixture | 无 | ❌桩 |
| 右栏 应用效果图 | 图表 | 静态 trend | fixture | 无 | ❌桩 |
| 右栏 热门经验 | 展示 | 静态 | fixture | 无 | ❌桩 |
| 右栏 快速记录按钮 | 按钮 | `createLearning({title:label,insight:""})`→refresh | 真实 op | pending disabled | ✅真实(但 title=固定标签,insight 空) |

**缺口**: 写侧三件套(应用/验证/废弃/快速记录)+记录表/最近发现读侧已真,但七步 tab 仅是无网络的客户端分类过滤、tab 标签/分类卡/整条右栏(价值概览/效果图/热门)全 fixture,且 edit tab 无 learningType 映射恒空。

## Global Search 全局搜索 (`/search`)
**数据入口**: route `search/page.tsx` → `pages.search.get`(REAL,session ctx)→ `globalSearchPageToViewModel`;无 session 退化 `buildSearchViewModel()` fixture

| 元素 | 类型 | 当前动作 | 数据来源 | 空/加载/错误态 | 状态 |
|---|---|---|---|---|---|
| 页内搜索输入(sr-only 镜像) | 表单 | 输入→`router.replace(/search?q=)`;Enter→`router.push` 重跑服务端读 | URL `?q=` → `pages.search.get` | Suspense fallback 隐藏避免双节点 | ✅真实 |
| 结果类型 tab(项目/知识/素材/视频) | tab | **无 onClick,注释明确 decorative/inert** | count 来自实际分组长度(真) | 首项硬编码 pressed | ❌桩(装饰) |
| 话题筛选 chips(AI/教程/…6个) | 按钮 | **无 handler,inert** | 静态 FILTER_CHIPS | 无 | ❌桩(装饰) |
| 项目结果卡 | 链接 | next/link → `/projects/<id>` | `pages.search.get` projects | op 已过滤,空→无卡 | ✅真实(链接) |
| 知识结果行 | 链接 | link → `/knowledge`(无详情路由) | op knowledge | — | ✅真实(链接到列表) |
| 素材缩略图 | 链接 | link → `/assets` | op assets | 渐变色由 id 派生 | ⚠️部分(缩略图占位,无真图) |
| 视频缩略图 | 链接 | link → `/publishing`;时长由 token 伪造 | op videos | duration 是确定性假值 | ⚠️部分(缩略图+时长占位) |
| 各分组「查看全部」 | 链接 | → /projects//knowledge//assets//publishing | 静态 | 无 | ✅真实 |
| 侧栏 筛选(类型/阶段/标签) | 列表 | **inert,无 apply handler** | op filters(label/count 真) | 无 | ❌桩(装饰) |
| 侧栏 快捷操作 | 链接 | a href 跳转 | op quickActions + 本地 href 映射 | 无 | ✅真实(链接) |
| 侧栏 搜索历史 | 链接 | link → `/search?q=<query>` 重跑读+服务端追加历史行 | op history | 空→「暂无搜索历史」 | ✅真实 |
| 侧栏 搜索技巧 | 展示 | 静态 | op tips(实为静态串) | 无 | ❌桩(装饰) |

**缺口**: 输入/历史/结果链接读侧做真(`pages.search.get`),但结果类型 tab、话题 chips、侧栏筛选三组 facet 全部 inert 装饰(无过滤回写),素材/视频缩略图为派生占位图、无真实媒体。

## Settings 设置 (`/settings`)
**数据入口**: route `settings/page.tsx` → `settings.get`(REAL,account 卡)→ session 退化 → fixture;偏好/模型走 island 写 op

| 元素 | 类型 | 当前动作 | 数据来源 | 空/加载/错误态 | 状态 |
|---|---|---|---|---|---|
| 顶部 8 tab(账户/偏好/通知/外观/集成/存储/数据/关于) | tab | PageTabs,纯导航无内容切换 | 静态 SETTINGS_TABS | 无 | ❌桩(装饰) |
| 账户 昵称/邮箱输入 | 表单 | `readOnly`(PATCH /me 缺口) | `settings.get`(真) | 读失败→session→fixture | ⚠️部分(读真,只读不可改) |
| 账户「已验证」徽章/计划 chip | 展示 | 装饰 inert | 静态;时区/语言 chip=真 identity | 无 | ⚠️部分 |
| 偏好 默认主页/创作模式/可见性(Select) | 表单 | optimistic + `patchPreferences`→refresh | fixture 初值 + 写真 op | pending→disabled | ✅真实(写) |
| 偏好 自动保存/使用分析(Switch) | 开关 | `patchPreferences`→refresh | 同上 | pending disabled | ✅真实(写) |
| 系统 主题/密度/语言(Select) | 表单 | **仅本地 setState,无 op** | fixture/identity locale | 无持久化 | ❌桩(local-only) |
| 系统 桌面通知(Switch) | 开关 | **仅本地 setState** | fixture | 无 | ❌桩(local-only) |
| 存储空间 进度+分布 | 展示 | 静态 | fixture | 无 | ❌桩 |
| 模型 提供商/模型(Select) | 表单 | `putModel`(capability=script 全量 upsert)→refresh | fixture 初值 + 写真 op | pending disabled | ✅真实(写) |
| 模型 温度(number) | 表单 | onBlur→`putModel` | 同上 | pending disabled | ✅真实(写) |
| 其他 导入/导出按钮 | 按钮 | `aria-disabled`,inert(无路由) | 静态 | 无 | ❌未实现 |
| 其他 删除账户 Switch+按钮 | 开关+按钮 | switch 仅 arm 本地 flag;按钮恒 inert + tooltip(REST 缺口) | 静态 | tooltip 说明缺口 | ❌未实现 |

**缺口**: account 读真、偏好/模型写真(patchPreferences/putModel),但 8 tab 纯装饰、系统设置(主题/密度/语言/通知)只本地 state 不持久、存储全 fixture、账户编辑+导入导出+删除账户因 PATCH /me 与删除 REST 缺口全部 inert。

## Copilot 全局助手 (`src/features/copilot/`,无独立路由)
**数据入口**: 挂载于 `components/overlays/ai-copilot-dialog.tsx` 全局浮层;composer 走 REAL conversation/message ops;dashboard 卡走 `buildCopilotViewModel` fixture

| 元素 | 类型 | 当前动作 | 数据来源 | 空/加载/错误态 | 状态 |
|---|---|---|---|---|---|
| 提示输入 textarea | 表单 | 受控 setState | 本地 | 无 | ✅真实 |
| 提交按钮(↑) | 按钮 | `ensureConversation`→`createMessage`→轮询 `listMessages`(真 Claude 异步回复) | REAL conversation/message ops | empty/thinking→disabled;思考中→spinner;80×3s 超时→提示文案;catch→超时态 | ✅真实 |
| 建议动作 chips | 按钮 | onClick→`setPrompt(label)`(仅填充输入) | fixture vm.chips | 无 | ⚠️部分(仅填充) |
| 清空按钮 | 按钮 | `setPrompt("")` | 本地 | empty→disabled | ✅真实 |
| 推荐指令卡 + 查看所有 | 按钮 | **无 onClick/导航** | fixture | 无 | ❌桩 |
| 最近任务 + 查看全部 | 展示/按钮 | inert | fixture | 无 | ❌桩 |
| 继续任务卡(进度条) | 展示 | inert | fixture | 无 | ❌桩 |
| 快捷入口(6 图标) | 按钮 | **无 onClick** | fixture | 无 | ❌桩 |
| 智能推荐 items | 按钮 | **无 onClick** | fixture | 无 | ❌桩 |

**缺口**: 核心对话(提交→真 Claude 轮询)已做真且有完整 thinking/timeout/error 态,但 chips 仅填充输入,整个 CopilotDashboard(推荐指令/最近任务/继续任务/快捷入口/智能推荐)全是 fixture 装饰、无任何 onClick 行为。
# 七步整合设计 · 6 surface 交互契约审计 (G6)

> 只读盘点。工作树:`.worktrees/frontend-implementation/frontend`。
> 通用模式:所有变更走 `useMutation()` seam → `client.<op>()` (真实契约 op, composite transport SQL) → `router.refresh()`;`pending` 守卫并发。读侧均 Server Component 默认 `client.<list/get>()`,有 `viewModel?` 测试缝。

---

## Positioning 定位中心 (`/positioning`)
**数据入口**: Server `client.getPositioningCenter()` → `pages.positioning.get` (真实 SQL)

| 元素 | 类型 | 当前动作 | 数据来源 | 空/加载/错误态 | 状态 |
|---|---|---|---|---|---|
| 当前定位 (一句话/关键词/产品锚) | 只读展示 | 渲染 `currentStatement`/`keywords`/`productAnchors` | `pages.positioning.get` | 空时整页走 empty-state CTA;oneLiner 缺省「尚未填写定位陈述」 | ✅真实 |
| 账号画像表单 5 字段 (人设/领域/人群/差异化/能力) | 表单 | `client.upsertProfile({body})` → refresh | `positioning.profile.upsert` | 无 loading 文案,`pending` 禁用按钮;无 error UI | ✅真实 |
| 「创建定位」(空态 CTA) | 按钮/表单 | 同 upsertProfile (profile=null) | `positioning.profile.upsert` | 是空态本身 | ✅真实 |
| 保存新版本定位 (oneLiner+3关键词+锚) | 表单 | `client.createStatement({body})` → 历史追加新 version | `positioning.statements.create` | 客户端校验:3 关键词非空 + oneLiner 非空才可提交;无 error UI | ✅真实 |
| 历史版本 timeline | 只读展示 | 渲染 `history` (version desc),AI 建议 badge | `pages.positioning.get` (内含 statements) | 服务端组合顺序 | ✅真实 |

**缺口**: 全真,仅缺 loading/error 态文案(失败静默,只靠 `pending` 禁用)。

---

## Monetization 变现/漏斗中心 (`/monetization`)
**数据入口**: Server `listProducts` + `listLeads` + `getFunnel` → `products.list` / `leads.list` / `monetization.funnel.get` (真实 SQL)

| 元素 | 类型 | 当前动作 | 数据来源 | 空/加载/错误态 | 状态 |
|---|---|---|---|---|---|
| 转化漏斗 stages (7级 profile_visit→repurchase) | 只读展示 | 渲染 `funnel.stages[].count` | `monetization.funnel.get` | 无单独空态 | ✅真实 |
| 未归因桶 + 占比 (诚实漏损) | 只读展示 | 渲染 `unattributed.{leadCount,conversionCount,revenue}` + `unattributedRatio` | `monetization.funnel.get` | 永远显示(§4.5),不强分配 | ✅真实 |
| 已/未归因营收 | 只读展示 | 渲染 `revenueAttributed` / `unattributed.revenue` | `monetization.funnel.get` | — | ✅真实 |
| 新建产品 (名称+类型) | 表单 | `client.createProduct({body})` → refresh | `products.create` | name+kind 非空校验;无 error UI | ✅真实 |
| 产品列表 | 只读展示 | 渲染 `products` | `products.list` | `product-empty-state`「还没有产品…」 | ✅真实 |
| 退役产品 | 按钮 | `client.retireProduct({params})` | `products.retire` | status=retired 时禁用 | ✅真实 |
| 新增 Offer (新价格) | 输入+按钮 | `client.createOffer({params,body:{price}})` (append-only) | `products.offers.create` | 价格非数/负数静默不发 | ✅真实 |
| 链接内容 (内容 id) | 输入+按钮 | `client.linkOutputProduct({params,body:{contentRole:'conversion'}})` | `outputs.product.link` | 空 id 静默不发 | ✅真实 |
| 登记线索/成交 | 表单 | `client.createLead`,有金额再 `client.createConversion` | `leads.create` + `conversions.create` | source 固定 manual;金额可空;无 error UI | ✅真实 |
| 线索列表 (来源/归因内容) | 只读展示 | 渲染 `leads` | `leads.list` | `lead-empty-state`「还没有线索…」 | ✅真实 |
| 归因置信度 select (高/中/低) | 表单输入 | 仅随 createLead 提交(attributed 非空时) | 本地 state | — | ✅真实 |
| Lead 状态流转 select (new/qualified/won/lost) | select | `client.patchLead({body:{status}})` | `leads.patch` | 同值不发 | ✅真实 |

**缺口**: 读写全真;漏斗/产品/线索/成交均真契约。`conversion-column.tsx` 是孤儿组件(仅自带 test 引用,未挂到页面)。

---

## Calibration 校准/盲预测 (`/calibration`)
**数据入口**: Server `client.getRubric({rubricId:"rubric-canonical"})` → `calibration.rubrics.get` (真实 SQL,canonical seed)

| 元素 | 类型 | 当前动作 | 数据来源 | 空/加载/错误态 | 状态 |
|---|---|---|---|---|---|
| Rubric 名称 + 版本 badge | 只读展示 | 渲染 `rubric.name` / `currentVersion.versionNumber` | `calibration.rubrics.get` | rubric=null 走 empty-state「先创建 Rubric」(但页面无创建 Rubric 控件) | ⚠️部分 |
| per-dim 0-5 打分 select (6维锚点) | 表单输入 | **仅本地 `scores` state** — 注释明示「NOT threaded into createPrediction」 | 本地 state(dim 来自真 rubric,回退 DEFAULT_DIMENSIONS) | — | ❌桩(分数不落库) |
| 盲预测提交 (内容 id + 信心) | 表单 | `client.createPrediction({body})`,但 `predictedMetrics:{}`/`predictedConversion:{}` 空,**不含 per-dim 分** | `calibration.predictions.create` | subjectId 非空校验;**无 list op → 创建后无任何回显** | ⚠️部分 |
| 评分维度展示 (权重+锚点) | 只读展示 | 渲染 `currentVersion.dimensions` | `calibration.rubrics.get` | — | ✅真实 |
| 新建评分维度版本 | 按钮 | `client.bumpRubricVersion({body:DEFAULT_DIMENSIONS})` | `calibration.rubrics.versions.bump` | 写死 DEFAULT_DIMENSIONS + 固定 changeSummary | ⚠️部分 |
| 据此修正定位/新增选题 | 按钮 | onClick 空函数 | 无 | — | ❌未实现(装饰) |
| 采纳 AI 盲预测 | 按钮 | onClick 空函数 | 无 | — | ❌未实现(装饰) |
| 预测列表 / 锁定预测 / 回流校准 (`PredictionRow`) | 组件 | `lockPrediction` / `createResult` 已实现 | `calibration.predictions.lock` / `.results.create` | — | ❌未挂载(组件存在,页面不渲染) |

**缺口**: 盲预测核心闭环断裂 — per-dim 打分只活在本地、createPrediction 不带分数也无 list op 回显、PredictionRow(锁定/回流)已写好却未挂上页面,飞轮两按钮纯装饰。

---

## Platform Accounts 平台账号 (`/accounts`)
**数据入口**: Server `client.listAccounts()` → `accounts.list` (真实 SQL)

| 元素 | 类型 | 当前动作 | 数据来源 | 空/加载/错误态 | 状态 |
|---|---|---|---|---|---|
| 新增账号 (平台 select+handle+密钥引用+涨粉基线) | 表单 | `client.createAccount({body})` → refresh | `accounts.create` | handle 非空校验;密钥仅引用串(非明文,§7.1);无 error UI | ✅真实 |
| 平台筛选 tabs (全部/6 平台) | tab 筛选 | **客户端本地 filter** over 已 hydrate rows | 本地 state(无网络) | — | ✅真实(纯前端筛选,设计如此) |
| 账号列表行 | 只读展示 | 渲染 `accounts`,密钥脱敏为「已配置/未配置」badge | `accounts.list` | `account-empty-state`「还没有账号…」 | ✅真实 |
| 归档 | 按钮 | `client.archiveAccount({params})` | `accounts.archive` | status=archived 时禁用 | ✅真实 |
| 保存涨粉基线 | 输入+按钮 | `client.updateAccount({body:{followerBaseline}})` | `accounts.update` | 非整数/负/同值不发 | ✅真实 |

**缺口**: 全真,仅缺 loading/error 文案。

---

## Content Calendar 内容日历 (`/calendar`)
**数据入口**: Server 取首个 active account → `listCalendar` + `getCadence` + `getCadenceAttainment` → `accounts.calendar.list` / `accounts.cadence.get` / `accounts.cadence.attainment` (真实 SQL,确定性窗口 2026-06-22~07-20)

| 元素 | 类型 | 当前动作 | 数据来源 | 空/加载/错误态 | 状态 |
|---|---|---|---|---|---|
| 发布频率 select (每日/周/双周/月/自定义) + 保存节奏 | 表单 | `client.upsertCadence({body:{frequency,preferredSlots}})` | `accounts.cadence.upsert` | preferredSlots 透传旧值;无 error UI | ✅真实 |
| 节奏达成率 badge (% + 已发/预期) | 只读展示 | 渲染 `attainment.{attainmentRatio,publishedCount,expectedCount}` | `accounts.cadence.attainment` | attainment=null 时不渲染 | ✅真实 |
| 断更 banner「已断更 N 天」 | 只读展示 | `attainment.isLagging` 时渲染 `gapDays` | `accounts.cadence.attainment` | — | ✅真实 |
| 新增计划 (plannedAt ISO + 备注) | 表单 | `client.createEntry({params:{accountId},body})` | `accounts.calendar.entries.create` | plannedAt 非空校验;手填 ISO 串(无日期选择器) | ✅真实 |
| 日历条目列表 (按 status: planned/published/missed) | 只读展示 | 渲染 `entries`,真实 status enum(C-2) | `accounts.calendar.list` | `calendar-entry-empty`「这个窗口还没有排期…」 | ✅真实 |
| 标记已发布 | 按钮 | `client.transitionEntry({body:{status:'published'}})` | `accounts.calendar.entries.transition` | status=published 时禁用 | ✅真实 |
| 改期/备注 保存 | 输入+按钮 | `client.updateEntry({body})` | `accounts.calendar.entries.update` | 无变更不发 | ✅真实 |
| 删除条目 | 按钮 | `client.deleteEntry({params})` | `accounts.calendar.entries.delete` | — | ✅真实 |

**缺口**: 排期/节奏/达成全真;无真正「日历格」视图(纯列表),plannedAt 靠手填 ISO 串无日期控件;窗口为固定常量非当前周;无账号切换器(只读首个 active)。

---

## Topics 选题候选池 (`/topics`)
**数据入口**: Server `listCandidates({sort})` + `listAudienceSignals` → `candidates.list` / `audienceSignals.list` (真实 SQL,`?sort=` URL state)

| 元素 | 类型 | 当前动作 | 数据来源 | 空/加载/错误态 | 状态 |
|---|---|---|---|---|---|
| AI 选题会「帮我出选题」 | AI island | `AdoptCandidateCard` taskType=`topic.generate` → 真 AI 任务 + 轮询 | AI 任务总线 (真 Claude) | 含 running 文案;采纳→入选题池 | ✅真实 |
| 采纳全部入选题池 | 按钮 | 经 AdoptCandidateCard 采纳流 → 落 Candidate | AI confirm 流 | — | ✅真实 |
| 新增候选 (标题+角度) | 表单 | `client.createCandidate({body:{source:'idea'}})` | `candidates.create` | title 非空校验;source 固定 idea(C-3) | ✅真实 |
| 候选排序 select (预测变现/定位契合/需求热度) | select | `router.push(/topics?sort=)` → 服务端重读 | URL state → `candidates.list` | 同值不导航 | ✅真实 |
| 候选卡 (标题/来源/3 指标) | 只读展示 | 渲染 `predictedScore`/`positioningFit`/`demandCount` | `candidates.list` | `candidate-empty-state`「还没有候选选题…」 | ✅真实 |
| 晋升为 Project | 按钮 | `client.promoteCandidate` → 成功跳 `/projects/:id` | `candidates.promote` | status=promoted 时禁用 | ✅真实 |
| 丢弃 | 按钮 | `client.patchCandidate({body:{status:'dropped'}})` | `candidates.patch` | status=dropped 时禁用 | ✅真实 |
| 受众信号列表 (评论/私信/咨询/评价) | 只读展示 | 渲染 `signals`,脱敏 demandTag | `audienceSignals.list` | `audience-signal-empty-state` | ✅真实 |
| 一键转 Candidate | 按钮 | `client.linkSignalToCandidate({body:{}})` (omit candidateId→spawn demand) | `audienceSignals.linkToCandidate` | 已转候选时换 badge | ✅真实 |
| 选题流转小结 (候选池/已晋升/已丢弃计数) | 只读展示 | client 端聚合 candidates 计数 | `candidates.list` (派生) | 空时「暂无数据」 | ✅真实(装饰统计) |

**缺口**: 全真且含真 AI 选题节点 + 受众信号转候选;成熟度最高的 surface。

---

## 总览

| Surface | 读侧 | 写侧 | 结论 |
|---|---|---|---|
| Positioning | ✅真实 | ✅真实 | ✅真实(缺 error 态) |
| Monetization | ✅真实(漏斗/产品/线索/成交全真) | ✅真实 | ✅真实(conversion-column 孤儿) |
| Calibration | ⚠️rubric 真,predictions 无 list | ⚠️createPrediction 不带分;PredictionRow 未挂;飞轮装饰 | ⚠️部分(盲预测闭环断裂) |
| Platform Accounts | ✅真实 | ✅真实 | ✅真实 |
| Content Calendar | ✅真实(排期/节奏/达成全真) | ✅真实 | ✅真实(无日历格视图/无账号切换) |
| Topics | ✅真实(+真 AI 节点) | ✅真实 | ✅真实(成熟度最高) |

**唯一显著桩点**:Calibration 校准页 — per-dim 0-5 打分只本地 state、createPrediction 不携带分数、无 predictions list op 故创建后零回显、已写好的 PredictionRow(锁定/回流校准)未挂载页面、「据此修正定位/采纳 AI 盲预测」两按钮 onClick 空函数纯装饰。其余 5 个 surface 读写均接真实契约 op。

---

# 缺口 Backlog(按优先级,做真路线图)

> 已成熟(`✅真实`,本轮不动):Positioning 定位、Monetization 变现、Platform Accounts
> 平台账号、Content Calendar 内容日历、Topics 选题 —— 读写两侧均接真实 SQL。

## P0 — 用户直接撞见的核心假数据(最高优先)

| ID | Surface | 缺口 | 做真方案 |
|---|---|---|---|
| GAP-DASH-1 | Dashboard | `getDashboardSummary` facade 桩 → 继续创作/待办恒空 | persistence-client facade 接真:继续创作=最近活跃项目+其当前阶段;待办=真任务 |
| GAP-DASH-2 | Dashboard | `getDashboardMetrics` facade 桩 → 顶部5指标+本周趋势恒空 | 从用户 publications 的 analytics 快照 rollup:总播放/点赞/粉丝等 + 近7日趋势 |
| GAP-DASH-3 | Dashboard | `getRecentPublications` 映射桩(`title:r.id`,`views:0`) | join publication→output/revision 取真标题 + analytics 快照取真播放 |
| GAP-DASH-4 | Dashboard | `getTrendingTopics` facade 桩 → 热门选题恒空 | 接 candidates/audience-signals 或知识热词 |
| GAP-REV-1 | Review | 收益分析 tab **未实现**(monetization 未接入) | 接 `monetization/funnel` + outputs.products |
| GAP-REV-2 | Review | 对比分析 tab **未实现** | 项目间/历史快照对比 |
| GAP-REV-3 | Review | 观众分析三图全 fixture | 接真实地域 audienceSnapshots(已 seed) |

## P1 — 各 surface 读侧仍桩(逐个做真)

| ID | Surface | 缺口 |
|---|---|---|
| GAP-OVW-1 | Project Overview | 资产概览/最近文件/发布状态/里程碑真项目恒空;OutputPlanCard 绕过 VM 读 fixture;stepper 恒 pending |
| GAP-SCR-1 | Script | 根 VM 仍 fixture:版本列表/大纲/AI建议/金句桩 |
| GAP-PUBC-1 | Publishing Center | analytics rail(指标/平台对比/趋势/热门)全 fixture;零真行时静默回退 fixture 掩盖空态 |
| GAP-KN-1 | Knowledge | 记忆命中率/洞察/未整理/片段/图谱/热门标签 fixture;搜索仅客户端 |
| GAP-EXP-1 | Experience | 七步 tab 仅客户端分类过滤(切 tab 不拉数);右栏价值/效果图/热门 fixture;后期剪辑 tab 无映射恒空 |
| GAP-CAL-1 | Calibration | per-dim 盲预测分数只本地;createPrediction 不携带;无 predictions list op;飞轮两按钮 onClick 空 |
| GAP-RES-1 | Research | 趋势/竞品/证据/相关标签无 producer(真项目空);笔记删除/取消关联无 op |
| GAP-PLN-1 | Planning | 论点树根节点硬编码;内容合同/证据地图/关键素材无 producer |
| GAP-PUBW-1 | Publishing Workspace | 右栏指标/对比/预览/评论桩;calendarWiring 未传→日历恒 inert |
| GAP-PRD-1 | Production | 录制脚本/预览/素材统计(编造公式)/时间线/设备检测桩 |

## P2 — 装饰/次要(纯 UI 或低频)

| ID | Surface | 缺口 |
|---|---|---|
| GAP-PRJ-1 | Projects | 状态 Tab 计数被 targetTotals 硬覆盖;行「⋯」无 handler;平台/缩略图 fixture |
| GAP-NEW-1 | New Project | createProject 无 loading/错误态(失败静默) |
| GAP-SRCH-1 | Global Search | 结果类型 tab/话题 chips/侧栏筛选全 inert;缩略图占位 |
| GAP-SET-1 | Settings | 8 tab 装饰;系统设置(主题/密度/通知)只本地;导入/导出/删除账户 inert |
| GAP-COP-1 | Copilot | Dashboard(推荐指令/最近任务/继续/快捷/智能推荐)全 fixture 无 onClick |
| GAP-AST-1 | Assets | 上传仅 metadata 无字节;下载/复制走 mock:// ;存储卡+用料历史桩 |

## 实现波次建议
- **Wave 1(P0)**:Dashboard 4 个 facade 做真 + Review 观众/收益/对比 → 直接消灭用户撞见的假数据。
- **Wave 2(P1)**:各工作台/中心读侧做真(Overview/Script/PublishingCenter/Knowledge/Experience/Calibration)。
- **Wave 3(P1 尾 + P2)**:Research/Planning/Publishing/Production 的 producer 缺口 + 装饰交互补真/明确标注「规划中」。
