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

---

# 目标设计与实现方案(怎么做)

> 由 page-spec 设计阶段产出(2026-06-23)。每个 GAP 定义:目标行为 / 数据契约(用哪个 op、是否需新增方法)/ 状态设计 / 验收标准 / 实现步骤 / 需用户拍板的决策。实现照此做、验收照此判。

## Wave 1 — P0(首页 + 复盘)
# CreatorOS P0 缺口 — 目标设计与实现方案

> 设计师文档。定义"怎么做",供实现照做、验收照判。**不改实现代码,只读 + 写此文件。**

## 架构铁律(贯穿所有 GAP)

1. **严禁跨模块直读 repo。** facade 只能调被绑定模块 `service` 的**公开方法**。当前 `projectsService` 公开面只有 mutation + `listOutputIdsByProject`;`analyticsService` 只有 `getPublicationAnalytics/getProjectAnalytics`。要喂 dashboard 必须**在对应模块 service 上新增读方法**(service 内部可调本模块 repo 的 `list/listTasks/listOutputs` 等已存在的 repo 读法),再由 persistence-client 的 facade 转调——这就是 `persistence-client.ts` 既有 ✅ 模式(facade 把 `publishingService.getRecentPublications` 转成 query 期望的形状)。
2. **facade 形状已冻结**(`query-services.service.ts` 的 `DashboardDeps`):`projects.getDashboardSummary(ctx) → {continueCreating, todos}`、`analytics.getDashboardMetrics(ctx) → {metrics, trend}`、`publishing.getRecentPublications(ctx) → PublicationCompactRow[]`、`knowledge.getTrendingTopics(ctx) → TopicRow[]`。**不改 facade 签名**,只把桩体换成真组合。
3. **错误隔离已存在**:`getDashboard` 用 `Promise.all` + try/catch,任一 facade 抛错 → 整页 `scenario:"error"`。因此每个 facade 内部应对"无数据"返回空集而非抛错(空集 → `scenario:"empty"`)。
4. rawMetrics 真实 key(来自 `analytics-review-view-model.ts` 已验证):`plays / likes / comments / shares / favorites / follower_gain / ctr / finish_rate`。

---

### GAP-DASH-1 首页「继续创作 + 待办」

**目标行为**
- **继续创作**卡:展示用户**最近活跃**的非归档项目——标题、当前阶段中文名、进度条(`progressPct`)、"上次更新 X 前"。点击进入该项目当前阶段工作台。无项目时展示 `zeroContinueCreating()` 空卡("开始新的创作")。
- **待办**列表:展示该最近活跃项目下**真实未完成 task**(status ∈ `todo|in_progress|blocked`),每行:任务标题、所属阶段、优先级标记、截止("今天/逾期/无")。最多 5 条,按 `priority` 降序、`dueAt` 升序。空态:"当前没有待办,去挑个选题?"。

**数据契约**
- 真实 op:无现成。`projects.tasks.list`(`projects.tasks.list`)只按单 projectId 查,且 service 未公开。
- **需新增 service 方法**(落 `frontend/src/server/modules/projects/projects.service.ts`,接口 `ProjectsService` + 实现):
  ```ts
  getDashboardSummary(ctx: RequestContext): Promise<{
    continueCreating: {
      projectId: string; projectTitle: string;
      stage: string; progressPct: number; updatedAt: string;
    } | null;
    todos: ReadonlyArray<{
      id: string; title: string; projectId: string; projectTitle: string;
      stage: string; dueAt: string | null; priority: 1|2|3|4|5; status: string;
    }>;
  }>;
  ```
  实现:`repo.list(ctx)` → 过滤 `status !== "archived"` → 按 `updatedAt` desc 取首个 = continueCreating;对该项目 `repo.listTasks(ctx, projectId)` 过滤未完成 → 取 5 条组 todos。**全程本模块 repo,不跨模块。**
- facade(persistence-client ~L1727):把 `getDashboardSummary` 桩改为 `(ctx) => projectsService.getDashboardSummary(ctx)`,再映射到 `DashboardSummary`(字段名已对齐 `continueCreating`/`todos`)。`heading` 固定 "继续创作"。

**状态设计**
- 空(无项目):`continueCreating:null` → composer 用 `zeroContinueCreating()`;`todos:[]`。
- 加载:页面 server component await,SSR 直出;客户端无独立 loading(整页 `loading:false`)。
- 错误:facade 内不吞 → 冒泡到 composer try/catch → 整页 error 态;但"无数据"必须返回空集,不抛。

**验收标准**
- [ ] 继续创作卡的 projectId/标题/阶段/进度 = 用户最近更新的非归档项目,与项目列表页首项一致。
- [ ] 待办每条都能在该项目 `tasks` 表查到且 status 非 done;done 任务不出现。
- [ ] 用户无项目时显示空卡 + 空待办,页面 `scenario:"empty"`,不 500。
- [ ] facade 不直接 import 任何 repository(只调 `projectsService`)。

**实现步骤**
1. `projects.service.ts`:`ProjectsService` 接口加 `getDashboardSummary`;实现里用 `repo.list` + `repo.listTasks`。
2. `projects/index.ts`:无需改(导出的是 service 工厂,方法随接口自动可见)。
3. `persistence-client.ts` ~L1727:`getDashboardSummary` 桩 → 转调真 service + 形状映射。
4. (可选)`projects.service` 单测:多项目排序 + done 过滤 + 跨用户隔离。

**需用户拍板**
- "最近活跃"定义:用 `updatedAt` desc(默认采纳)还是"有未完成 task 的最新项目"?(建议 `updatedAt`,简单且符合"继续创作")。
- 待办是否跨**所有**项目聚合,还是只取继续创作那个项目?(本设计取继续创作项目;若要全局聚合,service 需遍历 `repo.list` 再逐项目 `listTasks`,成本更高——**请确认**)。

---

### GAP-DASH-2 首页「5 指标 + 本周播放趋势」

**目标行为**
- 顶部 5 张指标卡(复用 `MetricCard`):**总播放量 / 总点赞 / 新增粉丝 / 平均完播率 / 总分享**(数字用 `formatCount` 万级格式;`delta:""` `trend:"flat"`——无周期对比源,不造假 +12%)。
- 「本周播放趋势」7 点折线(周一…周日),**series 总和 = 用户全部 publications 真实累计播放**(沿用 `analytics-review-view-model.ts` 的 `TREND_WEIGHTS` 分布法,标注"按形状分摊,非逐日真值")。

**数据契约**
- 现状:**没有"全用户快照"读法**。`analyticsService` 只有按 publicationId / projectId 的快照读。
- **需新增 analytics rollup service 方法**(落 `frontend/src/server/modules/analytics/analytics.service.ts`):
  ```ts
  getDashboardRollup(ctx: RequestContext): Promise<{
    plays:number; likes:number; comments:number; shares:number;
    favorites:number; followerGain:number; ctrAvg:number; finishAvg:number;
    snapshotCount:number;
  }>;
  ```
  实现优选:在 analytics repo 加一个 user-scoped 聚合读(`SELECT ... WHERE userId=ctx.userId`,对每个 publication 取**最新** capturedAt 快照再 sum/avg rawMetrics)。analytics 表已 user-scoped,**这是单模块本地聚合,不跨模块**,优于"遍历 projects→publications→getPublicationAnalytics"(后者要跨 projects/publishing 两模块 fan-out,违背铁律且 N+1)。
- facade(persistence-client ~L1753):`getDashboardMetrics` 桩 → 调 `analyticsService.getDashboardRollup(ctx)`,组装 5 张 `MetricCard` + 用 `TREND_WEIGHTS` 把 `plays` 分摊成 7 点 `trend`。

**状态设计**
- 空(无快照):rollup 全 0 → 返回 `{metrics:[], trend:[]}`(让 composer 判 `isEmpty`),**或** 5 张 "0" 卡——建议**空集**,与 composer 的 empty 判定一致(`metrics.length===0`)。请见拍板。
- 加载:SSR 直出。
- 错误:rollup 抛 → 冒泡到整页 error;无数据返回 0/空集,不抛。

**验收标准**
- [ ] 总播放 = 用户全部 publications **最新快照** `plays` 之和,与抖音创作中心一致。
- [ ] 完播率 = 各快照 `finish_rate` 平均(0–100),格式 `xx.x%`。
- [ ] 趋势 7 点之和 == 总播放(允许四舍五入误差 ≤7)。
- [ ] 无快照 → 5 卡区与趋势区走空态,不显示 fixture 假数。
- [ ] 聚合只读 analytics 本模块 repo。

**实现步骤**
1. `analytics.repository.ts`:加 user-scoped 聚合读(每 publication 取最新快照)。
2. `analytics.service.ts`:加 `getDashboardRollup` 调上面 repo 读。
3. `persistence-client.ts` ~L1753:`getDashboardMetrics` 桩 → 真 rollup + MetricCard/trend 组装(`TREND_WEIGHTS` 可从 review view-model 抽公用或就地复制并注释)。

**需用户拍板**
- 5 个指标选哪 5 个?(本设计:播放/点赞/粉丝/完播/分享。复盘页用的是 7 个。**请确认 5 选哪些**)。
- 每 publication 取**最新**快照还是**累计**?(抖音快照是累计型 → 取最新即累计值,建议"最新"。确认)。
- 无快照时:空态 vs 全 0 卡?(建议空态)。

---

### GAP-DASH-3 首页「最近发布」

**目标行为**
- 列出最近 5 条 publication:**真标题**(不再是 `r.id`)、平台徽标、状态、**真播放数**(不再 0)、互动数、发布时间。点击进对应复盘/发布详情。

**数据契约**
- 标题来源:publication 自身无标题,标题在 **revision**(`publications.revisions.list` / service `listRevisions`),最新 revision 的 `title`。
- 播放/互动来源:`getPublicationAnalytics(ctx, pubId)` 最新快照 `rawMetrics.plays` / (likes+comments+shares)。
- 现成 service 都有(`publishingService.getRecentPublications`、`listRevisions`、`analyticsService.getPublicationAnalytics`),但**组合**它需要 N 次调用。为避免 facade 里 fan-out,**建议新增 publishing service 方法**(因标题归 publishing 所有):
  ```ts
  // publishing.service.ts
  getRecentPublicationsWithTitle(ctx, opts:{limit:number}):
    Promise<Array<PublicationRow & { title: string }>>;
  ```
  实现:`getRecentPublications` 后对每条取 `listRevisions` 首条 title(本模块内)。播放数仍由 facade 层用 `analyticsService.getPublicationAnalytics` 补(analytics 跨模块只能走 facade 各自调 service,**不在 publishing service 里读 analytics**)。
- facade(persistence-client ~L1740):改为
  1. `publishingService.getRecentPublicationsWithTitle(ctx,{limit:5})` 拿 id/title/platform/status/publishedAt;
  2. 对每条 `analyticsService.getPublicationAnalytics(ctx, pubId, 1, 1)` 取最新快照算 `views=plays`、`engagement=likes+comments+shares`;
  3. 映射成 `PublicationCompactRow`。

**状态设计**
- 空(发布种子为空,实际如此):返回 `[]` → composer 判 empty。
- 加载:SSR。
- 错误:facade 内单条 analytics 失败应降级为 `views:0`(不整页崩),但 publishing 主查失败可冒泡。

**验收标准**
- [ ] 标题 = 该 publication 最新 revision 的 title,非 id。
- [ ] views = 该 publication 最新快照 `rawMetrics.plays`,与复盘单作品播放一致。
- [ ] 无 revision 的 publication 标题降级(用 output 标题或 "未命名发布"),不显示裸 id。
- [ ] publishing service 不读 analytics(跨模块组合只在 facade 层)。

**实现步骤**
1. `publishing.service.ts`:加 `getRecentPublicationsWithTitle`(内部 `listRevisions`)。
2. `persistence-client.ts` ~L1740:重写映射,补 analytics 播放,`title:r.id`/`views:0` 删除。

**需用户拍板**
- 标题降级链:revision.title → output.title(需跨 projects 模块,facade 层补)→ "未命名发布"。要不要接 output 标题?(建议接,但需 facade 多调一跳 `projectsService`——**确认**)。

---

### GAP-DASH-4 首页「热门选题」

**目标行为**
- 展示 3–6 个热门选题 `TopicRow{id,title,heat,trend}`:标题 + 热度数 + 涨/跌/平箭头。点击预填新建项目/选题。

**数据契约 — 三选一(建议②)**
- ① candidates:`candidatesService.listCandidates(ctx,{sort:"predictedScore"})` → 取 `predictedScore` 当 heat。语义最贴"选题",已 user-scoped。
- ② audience-signals:`candidatesService.listSignals` 按 `demandTag` 聚合计数当 heat。更像"市场热词"。
- ③ knowledge 热词:knowledge 无热词读法,需新增,成本高。
- **建议采用 ①** candidates(已有 `listCandidates` + `sort:predictedScore`,零新增、语义最准)。`trend` 无周期源 → 一律 `"flat"`(不造假)。
- **需新增 knowledge facade 转接 or 改绑定**:当前 facade key 叫 `knowledge.getTrendingTopics`,但数据来自 candidates。两种做法:
  - (a) 保持 facade key 名,把桩体改为调 `candidatesService.listCandidates` 映射(facade 是组合层,可跨叫——但绑定对象语义错位)。
  - (b) **建议**:在 `query-services` 的 DashboardDeps 里把 `knowledge` 这一项的 provider 换绑到 candidates(persistence-client ~L1769 处,facade 实现体直接调 `candidatesService`,key 名可保留或重命名)。最小改动:就地把 `getTrendingTopics` 桩 `async()=>[]` 改为调 `candidatesService.listCandidates(ctx,{sort:"predictedScore",limit:6,status:"pool"})` 并映射。

**状态设计**
- 空(无 candidate):返回 `[]` → composer empty。
- 加载:SSR。错误:冒泡。

**验收标准**
- [ ] 每个 topic = 一个真实 `pool` 状态 candidate,title 一致,heat = predictedScore(无则 demandCount)。
- [ ] trend 恒 `flat`(无对比源,不造假)。
- [ ] 无 candidate → 该卡空态。

**实现步骤**
1. `persistence-client.ts` ~L1771:`getTrendingTopics` 桩 → 调 `candidatesService.listCandidates`,映射成 `TopicRow`(heat=`predictedScore ?? demandCount`)。
2. 无 service/contract 新增。

**需用户拍板**
- heat 取 `predictedScore` 还是 `demandCount`?(建议 predictedScore 优先,缺则 demandCount)。
- 选 ①candidates 还是 ②audience-signals?(建议 ①)。

---

### GAP-REV-1 复盘「收益分析」tab

**目标行为**
- 在复盘页 `revenue` tab 渲染真实变现:**漏斗**(曝光/线索/转化/收入,带"未归因"诚实桶 `unattributed`)+ 该项目各 output 关联的**产品列表**(名称、tier、当前 offer 价、关联 contentRole)+ 关键数:归因收入 `revenueAttributed`、未归因占比 `unattributedRatio`。

**数据契约**
- 漏斗:`monetization.funnel.get`(service `getFunnel(ctx, query)` → `MonetizationFunnelResource`:`stages[]`/`revenueAttributed`/`unattributed{leadCount,conversionCount,revenue}`/`unattributedRatio`)。项目级可不传 productId(全量),或按 output 维度用 `getFunnelForOutput(ctx, outputId)`。
- 产品:该项目各 output → `monetizationService.listProductsByOutput(ctx, outputId)`(返回 `ContentOutputProductResource[]`,含 productId+contentRole)→ 再 `getProduct` 取名称/tier、`listOffers` 取最新价。
- **需新增 review composition**(落复盘 view-model 侧,与 `analytics-review-view-model.ts` 同目录新增 `monetization-review-view-model.ts`,纯函数,fetch 在 route):
  ```ts
  buildMonetizationReviewViewModel(
    funnel: MonetizationFunnelResource,
    outputProducts: ReadonlyArray<{product:ProductResource; offer:OfferResource|null; contentRole:string|null}>,
  ): RevenueTabViewModel;
  ```
  route(`projects/[projectId]/review/page.tsx`)负责:解析 output ids(`projectsService.listOutputIdsByProject`)→ 逐 output `getFunnelForOutput` 汇总 or 顶层 `getFunnel` → 拼产品。**跨模块组合在 route/server 装配层,逐 service 调,不直读 repo。**

**状态设计**
- 空(无 lead/conversion):漏斗全 0 + "尚无变现数据,关联产品后开始追踪";产品空:"该内容未关联产品"。
- 加载:SSR。错误:tab 内局部 error 卡,不崩整页。

**验收标准**
- [ ] 漏斗 stages 数值 = `monetization.funnel.get` 返回值,且**始终显示未归因桶**(§4.5 诚实口径)。
- [ ] 产品行 = 该项目 output 真实 `outputs.products` 关联,价格 = 最新 offer。
- [ ] 无数据走空态文案,不显示 fixture。

**实现步骤**
1. 新增 `frontend/src/features/review/monetization-review-view-model.ts`(纯函数 builder)。
2. `review/page.tsx`:fetch funnel + output-products,喂 builder,塞进 `revenue` tab。
3. `AnalyticsViewModel` 加 `revenue` 字段(`view-models.ts`)或复用既有 tab 内容槽。

**需用户拍板**
- 漏斗口径:项目级全量 `getFunnel()` 还是按 output 汇总 `getFunnelForOutput`?(建议项目级 `getFunnel` 一跳,简单;output 级更细但 N 次)。
- 收益 tab 是否需要"按产品筛选"下拉?(MVP 可不要)。

---

### GAP-REV-2 复盘「对比分析」tab

**目标行为(待拍板维度,下列为建议方案)**
- 建议:**同项目内多 publication/output 横向对比**——一张表:每行一个发布,列为 播放/完播率/点赞率/分享率/(可选)关联产品转化。高亮最佳/最差,给"复制爆款结构"提示。

**数据契约**
- 数据已全在手:`getProjectAnalytics(ctx, projectId)` 返回该项目全部 publication 的 `MetricSnapshot[]`(每条一个 publicationId)。**无需新增 service**——只需 review builder 把已 fetch 的 snapshots **按 publicationId 分组**(而非现在的全量 aggregate)。
- 标题/平台:配合 `publishingService.listPublications`/`listRevisions`(route 层补)。
- **需新增 builder**(同 `analytics-review-view-model.ts` 文件加导出函数):
  ```ts
  buildComparisonViewModel(
    snapshots: ReadonlyArray<MetricSnapshotDto>,
    labels: Record<string,string>, // publicationId → 标题/平台
  ): ComparisonTabViewModel; // rows[]: {pubId,title,plays,finishRate,likeRate,shareRate}
  ```

**状态设计**
- 空(<2 publication):"至少需 2 个发布才能对比",引导去发布。
- 加载:SSR。错误:tab 局部。

**验收标准**
- [ ] 每行数值 = 对应 publication 快照真值,可与单作品复盘对上。
- [ ] 只有 1 个发布时走空态,不渲染对比表。

**实现步骤**
1. `analytics-review-view-model.ts` 加 `buildComparisonViewModel`(复用 `num`/`formatCount`)。
2. route 补 publication 标题映射。
3. `comparison` tab 接入 + `view-models.ts` 加类型。

**需用户拍板(必须先定)**
- **对比对象**:(A) 同项目内多发布横向对比【建议】 (B) 本项目 vs 用户历史均值 (C) 本周 vs 上周时间对比。**B/C 需新增"全用户均值"或"周期快照"读法,成本高;A 零新增。请拍板。**

---

### GAP-REV-3 复盘「观众分析」三图

**目标行为**
- 三图接真:**年龄分布**(已 seed `audienceSnapshots` `dimensionType:"age"`)、**流量来源**(`dimensionType:"source"`)、**留存曲线**(`retentionPoints`,目前 fixture)。无真数据时显式空态(不静默 fallback fixture)。

**数据契约 — 关键缺口**
- `audienceSnapshots` 已 seed 在 canonical fixture,且 `fixtures/selectors/review.ts` 的 `pickAudienceProfile/pickAudienceSource` 已按 publicationId 过滤读取——**但这是 fixture 读,不是契约 op**。
- **analytics 无 audience 读 op**(`contract/operations/analytics.ts` 只有 publications/projects 快照;service 无 audience 方法)。所以"真实地域/年龄"目前仍来自 fixture canonical,而非 DB 持久层。
- **需新增(若要真持久化)**:
  - contract:`analytics.projects.audience.get`(`GET /analytics/projects/:projectId/audience`,response = audienceSnapshot 资源 list)。
  - analytics service:`getProjectAudience(ctx, projectId): Promise<AudienceSnapshotRow[]>`(repo 已有 `AudienceSnapshotRow` schema,加 user-scoped 读)。
  - review view-model:`buildAnalyticsReviewViewModelFromOp` 增参 `audienceSnapshots`,按 `dimensionType` 分 age/source 覆盖 fixture。
- **MVP 折中(若不新增 contract)**:保留 fixture-selector 读 canonical `audienceSnapshots`(已是 seed 真值),但**明确标注"地域/年龄来自 seed 画像,留存为近似"**,把 GAP-REV-3 降级为"已用 seed 真值,持久化读 op 待补"。

**状态设计**
- 空(该项目无 audience 快照):三图显示"暂无观众画像数据,发布后自动采集",**不** fallback 到 `DEFAULT_AUDIENCE_PROFILE`(当前会静默 fallback,需改成空态)。
- 加载:SSR。错误:tab 局部。

**验收标准**
- [ ] 年龄/来源各段 = 该项目 publication 的 `audienceSnapshots` 真值(percentage),与 seed/DB 一致。
- [ ] 无快照 → 空态,**不显示 DEFAULT_ fixture 默认值**。
- [ ] (若做 contract)走 `analytics.projects.audience.get`,非 fixture import。

**实现步骤(完整版)**
1. contract:`operations/analytics.ts` 加 `getProjectAudience` op + `resources/analytics.ts` 加 `audienceSnapshotResource`。
2. `analytics.service.ts` + repo:加 `getProjectAudience` user-scoped 读。
3. `analytics-review-view-model.ts`:`buildAnalyticsReviewViewModelFromOp` 增 audience 参数,覆盖 fixture。
4. `review/page.tsx`:fetch 新 op 喂入。
5. 空态:移除静默 `DEFAULT_AUDIENCE_*` fallback,改空态分支。

**需用户拍板**
- 走**完整版**(新增 contract+service+repo,真持久化读)还是 **MVP 折中**(继续读 canonical seed fixture,仅标注)?(建议:Wave 1 先 MVP 折中 + 改空态;contract 读 op 排 Wave 2)。
- 留存曲线无 seed 真值,是否接受标注"近似"或干脆隐藏该图?

---

## 跨 GAP 决策汇总(供一次性拍板)

| 决策点 | 建议默认 |
|---|---|
| DASH-1 "最近活跃"定义 | `updatedAt` desc |
| DASH-1 待办范围 | 仅继续创作项目(非全局聚合) |
| DASH-2 选哪 5 指标 | 播放/点赞/粉丝/完播/分享 |
| DASH-2 快照取值 | 每 publication 最新快照(=累计) |
| DASH-2/3 无数据 | 空态(非全 0 卡) |
| DASH-3 标题降级 | revision→output→"未命名发布" |
| DASH-4 数据源 | candidates,heat=predictedScore |
| REV-1 漏斗口径 | 项目级 `getFunnel()` 一跳 |
| REV-2 对比维度(**必拍**) | A 同项目多发布横向(零新增) |
| REV-3 实现深度(**必拍**) | Wave1 MVP 折中(seed)+ 改空态;contract 排 Wave2 |

## Wave 2a — P1(工作台:Overview/Script/Research/Planning)
# P1「工作台」缺口 — 目标设计与实现方案

> 设计师产出（只读代码 + 写设计）。约束：**严禁跨模块直读 repo / fixture**；所有数据走契约 op
> 或新增 service 方法（带签名 + 文件）。读侧整合既有 `*-workspace-data.ts` per-field 降级模式。
>
> 全局事实（已盘点确认）：
> - 契约**无 `project_stages` 读 op** —— 真实 per-stage status 不可读，只能从 `projects.get.currentStage` + `progressPct` 派生。
> - 契约**无 knowledge 删除 / relation 删除 op** —— GAP-RES-1 笔记删除 / 取消关联需新增 op。
> - 可用读 op：`projects.get` / `projects.outputs.list` / `outputs.publications.list`(需 outputId) /
>   `publications.revisions.list` / `materialLinks.list`(query: projectId, role, stage) / `assets.get` /
>   `artifacts.list` / `artifacts.versions.list` / `knowledge.get` / `knowledge.revisions.list` / `knowledge.relations.list`。
> - facade 模式：`src/server/persistence-client.ts`（route 经 `createServerClient(ctx)` 注入会话客户端，read 用户作用域）。

---

### GAP-OVW-1 · Project Overview 资产概览/最近文件/发布状态/里程碑/阶段 stepper/OutputPlanCard

**现状**：`buildProjectOverviewWorkspaceViewModel`（`project-overview-workspace-data.ts`）已真：`projects.get`(标题/进度/info)、`projects.outputs.list`(outputs)、`projects.activity.list`(动态)。其余 4 区（assetStats/recentFiles/publishing/milestones）真项目恒 `[]`，per-stage status 恒 `pending`，progress=0。OutputPlanCard 绕过 VM 直读 fixture `buildContentOutputsForRender`。

#### 目标行为（分区）

| 分区 | 目标 | 真数据来源 |
|---|---|---|
| 阶段 Stepper | 反映真实推进：当前阶段=current（active），其前=done，其后=pending；整体进度=真 progressPct | `projects.get.currentStage` + `progressPct`（**派生**，无 per-stage op） |
| 资产概览（5 stat） | 真项目展示「关联素材数 / 关联知识数 / 产出数 / 已发布数」等可派生的真计数 | `materialLinks.list`(projectId) 分 entityType 计数 + `projects.outputs.list` 计数 + publications 派生 |
| 最近文件 | 项目关联的素材 + 产物，按更新时间倒序 | `materialLinks.list`(projectId, entityType=asset)→`assets.get` 取 name/type/updatedAt |
| 发布状态 | 每个产物的发布记录（平台 + 状态） | `projects.outputs.list`→逐 output `outputs.publications.list`(outputId)，状态映射 |
| 里程碑 | 真项目暂无 producer → **标注「随阶段推进自动生成」空态**，不造假 | 无 op（保持空态，文案引导） |
| OutputPlanCard | 渲染 **VM 的真 `outputs`**（去掉 `buildContentOutputsForRender` fixture 绕过） | `vm.outputs`（已真，`projects.outputs.list`） |

#### 数据契约（准确 op，全部已存在，无需新增）

- 阶段：`projects.get` → `currentStage`/`progressPct`。
- 资产概览 / 最近文件：`materialLinks.list`（`query: { page, pageSize, projectId }`）→ 对 `entityType==="asset"` 的 link 调 `assets.get`（`params:{assetId}`）取 name/assetType/updatedAt/sizeBytes；对 `entityType==="knowledge"` 计数。
- 发布状态：`projects.outputs.list`(projectId) → 每 output `outputs.publications.list`（`params:{outputId}`）→ 取 platform/status/publishedAt。
- OutputPlanCard：消费 `vm.outputs`（`ContentOutputDto: {id,title,contentType,status}`）。

> 严禁直读 repo：上述全部经 `client.*`（会话注入）。

#### 状态设计（空/加载/错误）

- 每区 per-field try/catch，失败 → `isFixtureProject ? fixtureVm.X : []`（沿用现有降级）。
- 阶段 stepper：真项目恒可派生（current 必有），不再恒 pending。
- 资产概览/最近文件/发布：真项目无料 → 空数组 → 卡片现有空态文案。
- 里程碑：真项目恒空 → 空态文案改为「里程碑将随阶段推进自动生成」（产品决策见下）。
- OutputPlanCard：`vm.outputs` 为空 → 卡片空态（需新增空态，现 fixture 永不空）。

#### 验收标准

1. 真项目 stepper：当前阶段高亮 active、之前 done、之后 pending；整体进度=`progressPct`。
2. 真项目「资产概览」显示非零真计数（当项目有 material-links / outputs 时）。
3. 「最近文件」列出项目真实关联素材（名称/类型来自 `assets.get`），无关联→空态。
4. 「发布状态」列出产物真实发布记录（平台+状态），无→空态。
5. OutputPlanCard 渲染 `vm.outputs`，与产物列表一致；删一个产物后刷新该卡同步。
6. demo 项目行为不变（fixture 内容保留）。

#### 实现步骤（file-level）

1. `project-overview-workspace-data.ts`：
   - 扩 `ProjectOverviewDataClient` 接口加 `listMaterialLinks` / `getAsset` / `listPublications`。
   - 新增 `buildStages(project)`：按 `STAGE_ORDER` 与 `currentStage` 派生 done/active/pending + progressPct（current 用真 progressPct，done=100，pending=0）。替换现有恒 pending 分支。
   - 新增 `loadAssetStats` / `loadRecentFiles`（`materialLinks.list`→`assets.get` fan-out，限 N 条）。
   - 新增 `loadPublishingStatus`（`outputs.list`→逐 output `outputs.publications.list` fan-out）。
   - 各区 per-field try/catch + `isFixtureProject` 降级；`milestones` 保持空（真项目）。
2. `project-overview-page.tsx`：OutputPlanCard 改传 `vm.outputs`，删除对 `buildContentOutputsForRender(vm.projectId)` / `getProjectPlatforms` 的 fixture 调用。
3. OutputPlanCard 组件：加 `outputs.length===0` 空态。
4. route：确认注入 `createServerClient(ctx)`（已是）。
5. `project-overview-workspace-data.test.ts`：补 stub client 覆盖各区真读 + 降级 + demo 不回归。

#### 需用户拍板的产品决策

- **D-OVW-a 资产概览 5 stat 的语义**：用「素材/知识/产出/已发布/动态」计数，还是保留原 5 槽视觉但只填可派生项？（建议：填可派生 4 项 + 1 项标「—」。）
- **D-OVW-b 里程碑**：确认「无 producer，显示引导空态」而非未来补里程碑 op。
- **D-OVW-c 最近文件**含义：仅素材，还是素材+产物+脚本版本混排？（建议先只素材，避免多源排序复杂度。）

---

### GAP-SCR-1 · Script 根 VM fixture（版本列表 / 大纲 / AI建议 / 金句）

**现状**：`loadScriptEditorSections`（`script-editor-data.ts`）已真（`artifacts.get`+`artifacts.versions.list` 回读当前版本 sections）；保存/AI草稿/恢复写都真。但根 `buildScriptViewModel` 仍 fixture selector：版本列表、大纲结构、AI写作建议、金句 4 区桩。

#### 目标行为

| 区 | 目标 | 真来源 |
|---|---|---|
| 版本记录卡 + 恢复 | 列真实版本历史（版本号/时间/摘要），「恢复」点真版本 id | `artifacts.versions.list`(artifactId)（已读 sections，复用同一拉取） |
| 大纲结构 | 从当前版本 sections 的 heading 派生大纲（真），无版本→空态 | 已读 sections（`section.heading` 列表） |
| AI 写作建议 | 无确定性 producer → **标注「AI 生成区」**，引导跑 `script.draft` AI 节点；不留 fixture 桩 | 无 op（空态引导） |
| 金句 | 真项目无 producer → 空态引导（或从 `emphasis:true` 的 section 派生候选金句） | 派生自 sections.emphasis / 否则空态 |

#### 数据契约

- 版本列表：`artifacts.versions.list`（`params:{artifactId}`, `query:{page,pageSize}`）→ map `{id, versionNumber, changeSummary, createdAt}`。**与 `loadScriptEditorSections` 共用同一次 versions 拉取**（避免双读）。
- 恢复：`artifacts.restore`（已真，`body:{versionId}`）。
- 大纲 / 金句：纯前端从已读 sections 派生（heading→大纲节点；emphasis→金句候选）。无新增 op。

#### 状态设计

- 版本列表：真 artifactId → 真列表；无 artifactId（测试/新项目）→ 空态「暂无版本记录」。
- 大纲：sections 为空 → 空态「保存或生成脚本后显示大纲」。
- AI建议：恒空态「点『帮我写分镜脚本』生成」（引导跑 AI 节点）。
- 金句：emphasis 段为空 → 空态。

#### 验收标准

1. 保存一个新版本后，版本记录卡新增一行（真版本号/时间）；「恢复」旧版本生效。
2. 大纲结构反映当前 sections 的 heading（增删段后刷新同步）。
3. AI建议/金句不再显示 fixture 桩文案；无数据时显示引导空态。
4. demo 项目不回归（仍可有 fixture，或一并切空态——见决策）。

#### 实现步骤（file-level）

1. 新建 `script-versions-data.ts`（或扩 `script-editor-data.ts`）：`loadScriptVersions(artifactId)` 复用 versions 拉取 → 返回 `{ sections, versions, outline, pullQuotes }` 一次性派生，page 一次调用拿全部。
2. `script` route：用上面返回的真 `versions/outline/pullQuotes` 覆盖 `buildScriptViewModel` 的对应字段（per-field override，沿用 planning/research 的覆盖模式）。
3. AI建议区组件：删 fixture 文案，改空态引导 + 复用已有「帮我写分镜脚本」入口。
4. 对应 test：stub versions 列表 → 断言版本卡/大纲渲染 + 空态。

#### 需用户拍板

- **D-SCR-a 金句来源**：派生自 `emphasis` 段，还是等未来 AI 节点专门产 pull_quote artifact？（建议先 emphasis 派生 + 空态。）
- **D-SCR-b AI写作建议**：确认「纯空态引导」而非本波接 producer。
- **D-SCR-c demo 项目**：版本列表是否也对 demo 切真（demo 有 artifact 则真，否则保 fixture）。

---

### GAP-RES-1 · Research 趋势/竞品/证据/相关标签无 producer + 笔记删除/取消关联无 op

**现状**：`research-workspace-data.ts` 已真：`projects.get`(idea)、`materialLinks.list`+`knowledge.get`(资料/笔记)、`knowledge.revisions.list`(笔记 body)、`createKnowledgeRelation`(关联证据 写真)。缺口：趋势卡/竞品表/证据列表/相关标签真项目恒空（无 producer）；笔记删除无 op；取消关联（relation delete）无 op，按钮 disabled。

#### 目标行为

| 区 | 设计决策 | 来源 |
|---|---|---|
| 趋势 / 竞品 | **标注「AI 研究产物区」**：无数据→引导跑 `research.gather_material`（已存在的 AI 搜素材节点），不留 fixture | AI research 节点产出（落 Knowledge） |
| 证据收藏 | 同上：证据来自 `knowledge.relations.list`(supports 关系) 真读；列表真，空→引导 | `knowledge.relations.list`（已可读关系，但当前列表数据走 fixture——改真） |
| 相关标签 | 从真知识项 tags 聚合（真项目 tags 现恒空，待 knowledge 落 tag）；空→引导空态 | `knowledge.list`/已读 knowledge 项 tags 聚合 |
| 笔记删除 | **新增 op**：软删/作废笔记 | 需新增 `knowledge.archive`（见下） |
| 取消关联 | **新增 op**：删除 knowledge relation | 需新增 `knowledge.relations.delete`（见下） |

#### 需新增的契约 op（service 方法 + 签名 + 文件）

> 现有 `material-links.ts` 已有 `materialLinks.delete` 的「soft-delete via POST /:id/delete」范式；按同范式给 knowledge 补两个删除 op。

1. **`knowledge.archive`**（笔记删除——软删，沿用 assets.trash 的 active→deleted 范式）
   - 契约：`contract/src/operations/knowledge.ts` 新增
     ```ts
     archiveKnowledge: defineEndpoint({
       id: "knowledge.archive",
       method: "POST",
       path: "/knowledge/:knowledgeId/archive",
       params: knowledgeParams,
       response: knowledgeResource,         // 返回 status=archived 的条目
       fr: ["FR-KNOWLEDGE-ARCHIVE"],
     })
     ```
   - service：`KnowledgeService.archiveKnowledge(ctx: RequestContext, knowledgeId: string): Promise<KnowledgeResource>`（user-scoped，`assertOwnedKnowledge`，状态机 active→archived，append-only 不物理删）。文件：知识模块 service（与现有 create/revisions 同处）。

2. **`knowledge.relations.delete`**（取消关联——软删 relation）
   - 契约：`contract/src/operations/knowledge.ts` 新增
     ```ts
     deleteKnowledgeRelation: defineEndpoint({
       id: "knowledge.relations.delete",
       method: "POST",
       path: "/knowledge/:knowledgeId/relations/:relationId/delete",
       params: z.object({ knowledgeId: id, relationId: id }),
       response: knowledgeRelationResource,
       fr: ["FR-KNOWLEDGE-RELATION-DELETE"],
     })
     ```
   - service：`KnowledgeService.deleteKnowledgeRelation(ctx, knowledgeId, relationId): Promise<KnowledgeRelationResource>`（user-scoped 校验两端归属，软删/置 inactive）。
   - transport / index / registry：两个 op 各加 case（沿用 `material-links` delete 范式）。
   - persistence-client facade：补 `archiveKnowledge` / `deleteKnowledgeRelation` 透传（user-scoped）。

#### 数据契约（读侧改真）

- 证据列表：改读 `knowledge.relations.list`（`params:{knowledgeId}`，对项目 anchor knowledge 取 relationType="supports" 的边）→ 解析目标知识项。当前 fixture 走真。
- 相关标签：从已读 knowledge 项 `tags` 聚合（去重、计数 topN）。

#### 状态设计

- 趋势/竞品/证据/相关标签：真项目无数据 → 统一「AI 研究产物区」引导空态 +「帮我搜素材」CTA。
- 笔记删除：乐观删 → `knowledge.archive` → refresh；pending 禁用；失败回滚 + toast。
- 取消关联：`knowledge.relations.delete` → refresh；按钮从 disabled 变可用。

#### 验收标准

1. `knowledge.archive` / `knowledge.relations.delete` 两 op 在 contract registry 可解析，service user-scoped + ownership。
2. 研究笔记可删（删后列表不再出现，跨用户删 404）。
3. 「取消关联」可用，点击后该证据从列表移除。
4. 趋势/竞品/相关标签真项目显示引导空态，跑 `research.gather_material` 后落 Knowledge → 资料列表回填（已通链路）。
5. demo 不回归。

#### 实现步骤（file-level）

1. `contract/src/operations/knowledge.ts`：加 `archiveKnowledge` + `deleteKnowledgeRelation` 两 endpoint（+ FR 常量）。
2. 知识模块 service + transport + index + registry：实现两方法 + dispatch case（参考 material-links delete + assets.trash）。
3. `frontend/src/server/persistence-client.ts`：facade 透传两 op。
4. `research-workspace-data.ts`：证据列表改读 `knowledge.relations.list`；相关标签从 knowledge tags 聚合；趋势/竞品保持空（真项目）。
5. Research 工作台 island：笔记行加删除按钮（接 `knowledge.archive`）；「取消关联」接 `knowledge.relations.delete`（解除 disabled）。
6. test：service ownership/状态机；FE island 删除/取消关联交互。

#### 需用户拍板

- **D-RES-a 删除语义**：笔记「软删（archived，可恢复）」vs 硬删？（建议软删，与 assets.trash 一致。）
- **D-RES-b 趋势/竞品**：确认「AI 生成区 + 空态引导」而非本波接独立 producer（需要新 AI 节点产趋势/竞品 artifact，成本高）。
- **D-RES-c 相关标签**：tags 聚合的前提是 knowledge 落 tag；当前 gather 落料 tags 恒空——是否同时让 `research.gather_material` 写 tags？（影响标签是否真有数据。）

---

### GAP-PLN-1 · Planning 论点树根节点硬编码 + 内容合同/证据地图/关键素材无 producer

**现状**：`planning-workspace-data.ts` 已真：`projects.get`(coreThesis title/body)、`artifacts.list`/`createArtifact`(找/建 thesis_tree)、`artifacts.versions.list`(读 `contentData.nodes`→thesisTree)。缺口：论点树**根节点文案硬编码**「AI Native Browser 重塑入口」（与项目无关）；内容合同 4 卡 / 证据地图 / 关键素材无 producer（真项目空 / demo fixture）。

#### 目标行为

| 区 | 目标 | 来源 |
|---|---|---|
| 论点树根节点 | 去掉硬编码；根=thesis_tree 的真实 `column==="core"` 节点（AI 采纳写入）；无版本→根用 `project.title`（已是 coreThesis）派生占位，不写死无关字符串 | `loadThesisTree` 返回的 core 列节点 / 否则 `coreThesis` |
| 内容合同 4 卡 | **保留为结构脚手架**（锁定卡），或标注「策划产物，随 AI 生成」；不冒充真数据 | 无 producer（保留 locked scaffolding，标注） |
| 证据地图 | 真项目空 → 引导空态（来自 research 证据/knowledge relations 的未来联动） | 无 producer（空态） |
| 关键素材 | 从 `materialLinks.list`(projectId, stage=planning/research) 派生真关联素材 | `materialLinks.list`（可派生真数据！） |

#### 关键修正：根节点去硬编码

- 现 `loadThesisTree` 已能读真 nodes；硬编码根文案在**渲染层**（page/组件）或 fixture。设计：根节点统一取 `thesisTree` 中 `column==="core"` 的首节点；若 `thesisTree` 为空（真项目未跑 AI），根回落到 `coreThesis.title`（=真 `project.title`），**绝不渲染「AI Native Browser…」常量**。

#### 数据契约

- 根节点/论点树：`artifacts.versions.list` → `loadThesisTree`（已真，复用）。渲染层改为消费 `coreThesis`/`thesisTree.core`，删常量。
- 关键素材（**新接真**）：`materialLinks.list`（`query:{projectId, page, pageSize}`，可加 `stage` 过滤）→ `entityType==="asset"` 项 `assets.get` 取名；`entityType==="knowledge"` 项 `knowledge.get`。复用 research 已有的 fan-out helper 思路。
- 内容合同 / 证据地图：无新增 op（保留 scaffolding / 空态）。

#### 状态设计

- 根节点：真项目无 AI 树 → 显示真 `project.title` 作为核心论点根（非占位常量）。
- 论点树 4 列：各列空态「暂无数据」（已有），跑 `planning.thesis` 后回填（已通链路）。
- 关键素材：真项目无关联→空态「关联素材后显示」；有→真素材行。
- 内容合同：保留 4 锁定卡 + 标「策划脚手架」；证据地图空态引导。

#### 验收标准

1. 真项目论点树根节点显示项目相关文案（`project.title` 或 AI 写入的 core 节点），**不再出现「AI Native Browser 重塑入口」**。
2. 跑 `planning.thesis` 采纳后，根节点/各列来自真 `contentData.nodes`。
3. 关键素材列出项目真实关联素材（来自 material-links），无→空态。
4. 内容合同/证据地图不冒充真数据（locked 标注 / 空态引导）。
5. demo 不回归。

#### 实现步骤（file-level）

1. 渲染层（`planning-workspace-page.tsx` 或论点树组件）：删硬编码「AI Native Browser 重塑入口」常量，根节点改取 `vm.thesisTree` 的 core 列首项 ?? `vm.coreThesis.title`。
2. `planning-workspace-data.ts`：新增 `loadKeyMaterials(projectId, client)`（`materialLinks.list`→`assets.get`/`knowledge.get` fan-out），覆盖 `keyMaterials` 字段（真项目用真，demo 保 fixture）。扩 `PlanningDataClient` 接口加 `listMaterialLinks`/`getAsset`/`getKnowledge`。
3. `evidenceMap` / `contracts`：保持现降级（真项目空 / demo fixture），内容合同卡加「脚手架」标注。
4. test：断言根节点不含硬编码常量；关键素材真读 + 空态;demo 不回归。

#### 需用户拍板

- **D-PLN-a 内容合同 4 卡**：保留 locked 脚手架（标注「规划中」），还是本波接 producer（需新 AI 节点产 content-contract artifact）？（建议保留 + 标注。）
- **D-PLN-b 证据地图**：是否本波从 `knowledge.relations.list`(supports) 联动真证据（与 GAP-RES-1 证据共源），还是先空态？（建议先空态，后续与 research 证据统一。）
- **D-PLN-c 关键素材过滤**：按 `stage` 过滤（planning/research）还是全项目 material-links？

---

## 跨 GAP 汇总

**需新增契约 op（仅 GAP-RES-1）**：`knowledge.archive`、`knowledge.relations.delete`（含 service 方法/transport/registry/facade）。其余 GAP 全部用既有读 op + 派生，无需新 op。

**统一空态策略**：无 producer 的「AI 产物区」（趋势/竞品/AI建议/金句/内容合同/证据地图）一律 **引导空态 + 跑对应 AI 节点 CTA**，禁止 fixture 桩冒充真数据；可派生区（阶段/资产概览/最近文件/发布状态/关键素材/版本列表/大纲）一律接既有读 op 派生。

**派生 vs producer 边界（核心产品决策）**：里程碑、内容合同、趋势、竞品、AI写作建议这几项**无任何 op 可派生**，需用户拍板「本波标注空态引导」还是「排期新 AI producer」。

## Wave 2b — P1(中心:PublishingCenter/Knowledge/Experience/Calibration)
# P1「中心页」缺口 — 目标设计与实现方案 (p1b)

> 设计师文档。只读盘点 + 目标设计,不改实现。契约 op 名取自
> `contract/src/operations/{analytics,knowledge,taxonomy,learnings,calibration}.ts`。
> 路径约定:契约在仓库根 `contract/`(非 `frontend/contract/`);FE helper 在
> `frontend/src/features/*/.*-data.ts`;校准服务在 `frontend/src/server/modules/calibration/`。
> 红线:FE helper 只能经 `client.<op>()` 读写,禁止跨模块直读 repo / persistence-client。

---

### GAP-PUBC-1 — Publishing Center analytics rail 接真 + 诚实空态

**现状**
`buildPublishingCenterViewModelReal`(`frontend/src/features/publishing-center/publishing-center-data.ts`)
表格行已真(projects→outputs→publications + revisions 标题 + `analytics.publications.get` 表现列),
但:
1. analytics rail 四块(`metrics` / `platformComparison` / `trend` / `topContent`)恒取 `fixtureVm.*`(L405-408),无真读路径。
2. `realRows === null || realRows.length === 0` 时**整盘** `return fixtureVm`(L382),零真行被 fixture 掩盖——空态永不出现。

**目标行为**
- rail 四块从「用户全部 publications 的 analytics 快照」真实聚合;**不再读 fixture**。
- 零真行 / 读失败 → **诚实空态**:表格空态文案 + rail 各块各自空态(指标显 `—` / 图表显「暂无数据」),而非回退 fixture。
- demo 项目仍按现有 `DEMO_PROJECT_IDS` 过滤,不进聚合。

**数据契约(准确 op 名;无需新增契约 op)**
- 复用现有真读:`projects.list` → `projects.outputs.list` → `outputs.publications.list`(已在 helper 内 `assembleRealRows`)。
- rail 聚合源:`analytics.publications.get`(id `analytics.publications.get`,`isList`,response `metricSnapshotResource[]`)。
  helper 已有 `resolvePerformance` 单 publication 读;rail 是**对同一组 publication 的横向汇总**——复用同一 op,不新增。
- **复用 `assembleRealRows` 已读到的 publication 列表**,避免二次遍历:把 rail 聚合做成「行内已取的 per-row `rawMetrics`」的二次归并(给 `assembleRealRows` 增加返回 `rawMetrics` 旁路,或新建 `aggregateRail(client, pubs)` 复用同一批 snapshot 读)。
- 平台对比 / 热门内容的「平台」「标题」字段来自已读的 `publication.platform` 与 revision 标题(已有 `resolveRevisionTitle`)。

**rail 四块的真实定义(聚合口径,确定性,无 Date.now/random)**
| 块 | 真实口径 |
|---|---|
| `metrics` 指标卡 | 总播放 = Σ 每 pub 最新 snapshot `plays`;总互动 = Σ(likes+comments+shares+favorites);平均互动率 = 总互动/总播放;已发布数 = status==='published' 行数。delta 留空(`""`,无历史基线不造假)。 |
| `platformComparison` | 按 `publication.platform` 分组,组内 Σplays / Σinteractions / 互动率,降序。空组不出现。 |
| `trend` | **按 snapshot `capturedAt` 的日期** bucket 求和(真实日序),非「总量×权重摊 7 天」。无 snapshot → 空数组。 |
| `topContent` | 按 pub 最新 snapshot `plays` 降序 top N,标题取 revision 标题、平台取 `platform`。 |

**状态设计**
- `realRows === null`(projects 读抛错)→ 仍 `return fixtureVm` 可保留(整页读失败的兜底,与其他 helper 一致),**但建议**改为 `error` VM(`loading:false,error:"读取失败"`)以暴露故障;由用户拍板(见下)。
- `realRows.length === 0`(读成功零行)→ **不再回退 fixture**:返回 `publications:[]` + rail 四块空骨架(`metrics:[]`/`platformComparison:[]`/`trend:[]`/`topContent:[]`),页面/各块渲染既有空态。
- rail 某块聚合失败(snapshot 读全失败)→ 该块空,不影响表格。

**验收标准**
1. 注入 mock client 返回 ≥1 真 publication + snapshot → rail 四块数值 = 聚合结果,且**不等于** fixture 值(快照断言)。
2. 注入 mock client 返回 0 真 publication → `publications` 与 rail 四块全为空数组,页面显示空态,**不含任何 fixture rail 标识串**。
3. `analytics.publications.get` 对每个 pub 抛错 → rail 块降级为空,表格行仍渲染(performance cell「暂无数据」)。
4. demo 项目 publication 不计入任何 rail 聚合。
5. `pnpm verify`(typecheck+test)green。

**实现步骤(file-level)**
1. `frontend/src/features/publishing-center/publishing-center-data.ts`
   - 让 `assembleRealRows` 额外返回每行的最新 `rawMetrics`(或新建 `collectSnapshots(client, pubs)` 复用 `getPublicationAnalytics`),避免二次 N+1。
   - 新增纯函数 `buildRailFromSnapshots(rows)`:产出 `{metrics, platformComparison, trend, topContent}`,口径如上表,全确定性。
   - 改 `buildPublishingCenterViewModelReal`:`realRows.length === 0` 分支返回空 rail VM(删 `return fixtureVm`);非空分支 rail 用 `buildRailFromSnapshots` 替换 `fixtureVm.*`(L405-408)。
2. `frontend/src/features/publishing-center/publishing-center-page.tsx`(及 rail 子组件)
   - 确认 `PublishingMetrics`/`PlatformComparisonChart`/`TrendChart`/`TopContentList` 在空数组下渲染空态(若缺则补「暂无数据」分支)。
3. 测试 `publishing-center-op-backed.test.tsx`:新增「零真行 → 诚实空态」「rail 真聚合 ≠ fixture」用例。
4. 更新 helper 顶部 docstring(去掉「rail 始终 fixture / 零行回退 fixture」表述)。

**需用户拍板的产品决策**
- D1:`realRows === null`(projects 读抛错,非零行)是保留 fixture 兜底还是改 error 态?(建议 error 态,与「去掉掩盖」精神一致。)
- D2:`trend` 时间窗(近 7d / 30d / 全部)与 `topContent` 条数 N(建议 7d + N=5)。
- D3:无任何 snapshot 但有 publication 行时,指标卡显 `0` 还是 `—`?(建议 `—` 表「暂无数据」,区别于真实 0。)

---

### GAP-KN-1 — Knowledge 各区真来源

**现状**
`buildKnowledgeDashboardViewModel`(`frontend/src/features/knowledge/knowledge-data.ts`)已真:
`metrics` 前 4 卡(total/week/snippets/relations,后者 fan-out `knowledge.relations.list`)、
`categories`(按 type tally)、`recent`(`knowledge.list`)。仍 fixture:
`km-memory` 记忆命中率、`memoryInsights`、`unsorted`、`reusableSnippets` 片段列表、
`graphSeries` 图谱、`popularTags` 热门标签。搜索/筛选仅客户端 over 单页 list,`?tag=` 未消费。

**目标行为 — 逐区**

| 区 | 目标来源 | 可否本波做真 |
|---|---|---|
| 记忆命中率 `km-memory` | **无任何契约 read op**(无 memory analytics)。 | ❌ 标「规划中」或移除卡,**不造假**。 |
| 可复用片段 `reusableSnippets` | `knowledge.list` 中 `knowledgeType==='snippet'` 的真实行(已有 snippet 计数,现只缺**列表**)。 | ✅ 真。 |
| 未整理 `unsorted` | `knowledge.list` 中 `status==='draft'`(或无关联/无 revision)的真实行。 | ✅ 真(按 status=draft 口径)。 |
| 记忆洞察 `memoryInsights` | 无专门 op;**用 `knowledge.relations.list` 聚合**产出「高关联条目 / 关联网络」洞察,或暂标规划中。 | ⚠️ 部分(可由 relations 派生轻洞察)。 |
| 知识图谱 `graphSeries` | **新增 composition**:节点 = `knowledge.list` 行,边 = 每行 `knowledge.relations.list` 的关联边(helper 已 fan-out relations 用于计数,**复用同批读**产出 graph series)。 | ✅ 真(复用已有 relations fan-out)。 |
| 热门标签 `popularTags` | **新增 op `taxonomy.tags.list`** + `taxonomy.entityTags.listEntitiesForTag` 计数;或 `listTagsForEntity` 逐条聚合。 | ✅ 真(走 taxonomy 契约)。 |
| 搜索 | 客户端 over 单页 list(可接受),`?q=` 已镜像;**不**改服务端搜索本波。 | — 维持。 |

**数据契约(准确 op 名)**
- 已用:`knowledge.list`、`knowledge.relations.list`。
- **热门标签需引入 taxonomy 契约**(helper 当前未读 taxonomy):
  - `taxonomy.tags.list`(id,`isList`,`tagResource[]`)取标签全集。
  - 计数二选一:
    - A) `taxonomy.entityTags.listEntitiesForTag`(`/tags/:tagId/entities`,`isList`)逐 tag 取 entity 数 → 热门 = entity 数降序。
    - B) 对每个 knowledge 行 `taxonomy.entityTags.listForEntity`(`query:{entityType:'knowledge',entityId}`)聚合 tag 频次。
  - **建议 A**(N=标签数,通常 < 知识条目数,更省读)。
- 图谱/洞察:复用 `knowledge.relations.list`(已在 `countRelations` fan-out,改为同时收集边而非只计数)。
- **无需新增契约 op**;但需在 `KnowledgeDataClient` 接口加 `listTags` / `listEntitiesForTag`(或 `listTagsForEntity`)方法签名:
  ```ts
  listTags(input:{params:undefined; query:{page:number;pageSize:number}; body:undefined}): Promise<unknown>;
  listEntitiesForTag(input:{params:{tagId:string}; query:{page:number;pageSize:number}; body:undefined}): Promise<unknown>;
  ```

**状态设计**
- snippets/unsorted 空 → 各自空态(「暂无可复用片段」「全部已整理」),不回退 fixture。
- 图谱无边 → 既有「暂无数据」文案(已存在)。
- 热门标签:`taxonomy.tags.list` 抛错 → 该区空态,不阻断其余;无标签 → 「暂无标签」。
- `km-memory`:若保留卡,显「规划中」占位且 `delta:""`;建议拍板移除或标注。
- 整体 try/catch → `knowledge.list` 读失败仍整盘回退 fixture(与现有一致)。

**验收标准**
1. mock client 含 snippet/draft 行 → `reusableSnippets`/`unsorted` 列出对应真实行,空集 → 空态。
2. mock client 含带 relations 的多条目 → `graphSeries` 节点数=条目数、边数=relations 总数。
3. mock `taxonomy.tags.list` 返回标签 + entity 计数 → `popularTags` 按计数降序;`?tag=` 链接指向 `/knowledge?tag=<id>` 并被某层消费(本波至少链接成立)。
4. `km-memory` 不再呈现 fixture 数字(占位「规划中」或卡被移除)。
5. `pnpm verify` green。

**实现步骤(file-level)**
1. `frontend/src/features/knowledge/knowledge-data.ts`
   - 扩 `KnowledgeDataClient` 加 taxonomy 两方法签名。
   - `countRelations` → 重构为 `collectRelations` 同时返回 `{count, edges:[{source,target,type}]}`。
   - 新增 `buildGraphSeries(items, edges)`、`buildSnippets(items)`、`buildUnsorted(items)`、`buildPopularTags(client)`(走 taxonomy)。
   - `buildMetrics`:`km-memory` 改占位/移除(按拍板)。
   - 组装时用真值替换 `base.memoryInsights/unsorted/reusableSnippets/graphSeries/popularTags`。
2. `frontend/src/lib/contract-client.server.ts`(若 taxonomy op 未在 client 暴露,确认 `listTags`/`listEntitiesForTag` 已生成;契约已定义,应自动有)。
3. `frontend/src/features/knowledge/knowledge-page.tsx`:确认各区空态分支;`PopularTags` 链接 `?tag=`。
4. 测试 `knowledge-page.test.tsx` / `knowledge-interactions.test.tsx`:补真来源 + 空态用例。

**需用户拍板的产品决策**
- D1:`km-memory` 记忆命中率——移除该卡,还是保留并标「规划中」?(无 read op,必须二选一。)
- D2:`unsorted` 口径 = `status==='draft'`,还是「无 relations 边的条目」?(建议 draft,语义更直接。)
- D3:`memoryInsights` 本波是否由 relations 派生轻洞察,还是整块标「规划中」?
- D4:热门标签计数走方案 A(per-tag entities)还是 B(per-item tags)?(建议 A。)

---

### GAP-EXP-1 — Experience 七步 tab 拉真实阶段经验

**现状**
`buildExperienceWorkspaceViewModel`(`frontend/src/features/experience/experience-data.ts`)已真:
`records`(每条 learning + 真 `learningId`/`validationStatus`)、`discoveries`、`summaryCards` 计数。
七步 tab 在 `experience-interactive-region.tsx` 仅**客户端**按 `recordTabId`(`record.tabId` 或
`CATEGORY_TO_TAB[category]`)过滤同一份 records——**切 tab 不发请求**。右栏
`valueOverview`/`applicationEffect`/`popularExperiences` 全 fixture。
`LEARNING_TYPE_TO_CATEGORY`(data.ts L46-54)**无任何 learningType 映射到 后期剪辑 `edit`**
→ 「后期剪辑」tab 恒空。

**关键事实:`learnings.list` 的筛选能力**
契约 `learnings.list`(`/learnings`)`query: paginationQuery` —— **只有分页,无 learningType / stage 过滤参数**。
因此「每 tab 拉对应阶段」**无法靠 op query 参数实现**;只能:
- (a) 维持单次 `learnings.list` 全量读 + **客户端按 `learningType` 分桶**(当前做法),或
- (b) 扩 `learnings.list` query 加 `learningType?` 过滤参数(契约 + 服务 + repo 三层改动)。
本波**建议 (a)**:tab 切换仍客户端过滤,但**修复 edit 映射缺口**让七桶都能落到真实数据;tab 标签/分类卡改为**真实计数派生**而非 fixture。

**目标行为**
- 七步 tab 每个 = 对真实 learnings 按 `learningType→stage` 的客户端分桶结果(数据本身真)。
- 修复「后期剪辑 `edit`」:为其指定真实 learningType 映射(见拍板)。
- 右栏三块改真:`popularExperiences` = 真 learnings 按 `reuseCount` 降序;`valueOverview` = 真计数(总数/已验证/复用)派生;`applicationEffect` 趋势——无真日序源,标「规划中」或由 reuseCount 分布派生。
- 顶部装饰 `ExperienceTabs`(PageTabs)与下方交互 tab 重复 → 移除或合并(拍板)。

**数据契约(准确 op 名)**
- 读侧:`learnings.list`(现有,全量分页读;**无 stage 过滤**)。
- 写侧(已真,无需改):`learnings.applications.create`(应用)、`learnings.evaluate`(验证/废弃)、`learnings.create`(快速记录)。
- 复用信号:`reuseCount`(`learningResource` 上 server-derived,helper 已读)。
- **若选方案 (b)**:`contract/src/operations/learnings.ts` 给 `listLearnings.query` 加
  `learningType: z.string().optional()` + `validationStatus?`,并在 `frontend/src/server/modules/learnings/*`
  的 service/repo 落 where 过滤——本设计标为**可选增强**,默认不做。

**`edit` 后期剪辑映射方案**
现 `learningType` 枚举出现:strategy/hook/structure/process/failure/conversion_pattern/offer_insight。
无专门「剪辑」类型。三选一(拍板):
1. 新增 learningType 值 `editing`(契约枚举 + 服务 + AI review 产出端都要认),review.analyze 产出该类型 → 真正落 edit 桶。**最干净但跨层**。
2. 把现有某类型(如 `process` 拍摄执行的子集)按内容关键词二分到 edit——脆弱,不建议。
3. 暂认「edit 桶本就可能为空」,UI 显诚实空态「暂无后期剪辑经验」,等 AI 产出 `editing` 类型再填。**最小改动**。
**建议 3 短期 + 1 中期**:本波先让 edit 桶诚实空态(去掉「恒空但无空态」的误导),并预留 `editing` 类型位。

**状态设计**
- 任意 tab 桶为空 → 该 tab **诚实空态**「暂无<该阶段>经验」,不再是无说明的空表。
- 右栏 popularExperiences 空(无 reuseCount>0)→ 「暂无热门经验」。
- `learnings.list` 读失败 → 整盘回退 fixture(与现一致)。

**验收标准**
1. mock learnings 覆盖 6 个 learningType → 对应 6 个非 edit tab 各有行;edit tab 显诚实空态。
2. 顶部 summary/分类计数 = 真实分桶计数(非 fixture 常量)。
3. `popularExperiences` 按 `reuseCount` 降序且只含真实 learning;空 → 空态。
4. 切 tab 不触发网络(确认仍为客户端过滤,符合方案 a)。
5. 若采纳拍板「新增 `editing`」:AI review 产出 editing → 落 edit tab(留作中期验收)。
6. `pnpm verify` green。

**实现步骤(file-level)**
1. `frontend/src/features/experience/experience-data.ts`
   - `LEARNING_TYPE_TO_CATEGORY`:补 `editing: "后期剪辑"`(为未来类型预留);保持未知 → 复盘沉淀兜底。
   - `popularExperiences` / `valueOverview` 改由真 learnings 派生(新增 builder)。
   - `applicationEffect`:标规划中或由 reuseCount 分布派生(拍板)。
2. `frontend/src/features/experience/experience-interactive-region.tsx`
   - 每 tab 空桶渲染诚实空态文案(按 `activeTab` 文案)。
   - 顶部装饰 `ExperienceTabs` 移除或与交互 tab 合并(拍板)。
   - 分类卡计数改读真实分桶。
3. (可选,方案 b/edit-type) `contract/src/operations/learnings.ts` + `frontend/src/server/modules/learnings/*`:加 query 过滤 / `editing` 枚举值。
4. 测试 `experience-page.test.tsx` / `experience-interactions.test.tsx`:补空态 + edit 桶 + 真计数用例。

**需用户拍板的产品决策**
- D1:tab 拉数走方案 (a)客户端分桶[建议] 还是 (b)给 `learnings.list` 加 stage/type query?
- D2:edit 后期剪辑映射——新增 `editing` learningType[中期]、还是本波仅诚实空态[建议]?
- D3:`applicationEffect` 效果趋势图——标「规划中」还是由 reuseCount 分布派生近似?
- D4:顶部装饰 `ExperienceTabs` 移除还是合并进交互 tab?

---

### GAP-CAL-1 — Calibration per-dim 分数持久化 + predictions list + 飞轮按钮

**现状**(`frontend/src/features/calibration/calibration-interactive-region.tsx` +
`frontend/src/server/modules/calibration/`)
- `BlindPredictForm` 的 per-dim 0-5 分数存 `useState scores`,**仅本地**,提交时
  `createPrediction` body 传 `predictedMetrics:{}` / `predictedConversion:{}`(L102-110)——**分数丢弃**。
- 服务端 `deriveScore(dimensions, predictedMetrics, predictedConversion)` 是对这两个 record 的**变现加权和**;
  现入参恒空 → `predictedScore` 恒 0。
- **无 predictions list 读 op**:契约 `calibration.ts` 只有 `create/lock/get/result/rubric*`,无 `predictions.list`;
  repo 无 `listPredictions`。`PredictionRow` 组件需要 prediction 列表才能渲染,但页面无来源。
- 飞轮两按钮 `ReviseFromCalibrationButton` / `AdoptAiPredictionButton` onClick 空(装饰)。

**目标行为**
1. per-dim 分数**真持久化**:写进 `createPrediction` body,服务端 `deriveScore` 据此算 `predictedScore`(非恒 0)。
2. 新增 `calibration.predictions.list` 读 op,页面据此渲染 `PredictionRow` 列表(锁定/回流入口挂真数据)。
3. 飞轮两按钮接真目标行为(或诚实标注规划中)。

**(1) per-dim 分数如何持久化 —— 改 createPrediction body 形状**
契约 `createPrediction.body`(`contract/src/operations/calibration.ts` L63-72)已有
`predictedMetrics: z.record(z.string(), z.unknown()).default({})` 与
`predictedConversion: z.record(...)`。**无需改契约 shape**:把 per-dim 分数塞进 `predictedConversion`
(或 `predictedMetrics`),key=dimension.key、value=0-5 分数。
- 服务 `deriveScore` 已读这两个 record × dimension.weight 求加权和 → 分数自然进入 `predictedScore`。
- **但需对齐口径**:`deriveScore` 对哪些 key 求和?现 `MONETIZATION_DIMENSION_KEYS`(persona/cta/product_path/conversion/altruism)是「变现维度必含」校验,不是求和过滤——确认 `deriveScore` 是「dimensions 全量 × 对应 record 值」加权(读服务确认:它遍历 `dimensions`,对每个 dim 取 record[dim.key])。
- 因此前端只需:`body.predictedConversion = scores`(`Record<dimKey, number>`),`predictedMetrics` 留传播类指标(本波可空或同塞)。
- **决策点**:per-dim 0-5 与 weight 的加权和量纲(0-5 vs 0-1)需在服务 `deriveScore` 与前端对齐;若服务期望 0-1,前端提交前 `score/5` 归一,或服务侧除 5。**建议**:前端原样传 0-5,服务 `deriveScore` 已 × weight(Σweight=1)得 0-5 量纲 `predictedScore`,UI `评分 N` 直接显示。

**(2) 新增 predictions list 读 op**
- **契约**:`contract/src/operations/calibration.ts` 增
  ```ts
  listPredictions: defineEndpoint({
    id: "calibration.predictions.list",
    method: "GET",
    path: "/calibration/predictions",
    query: paginationQuery,          // 仅分页;可选加 subjectId?/status? 过滤
    response: predictionResource,
    isList: true,
    fr: ["FR-CALIB-PRED-LIST"],
  }),
  ```
- **服务** `calibration.service.ts`:加 `listPredictions(ctx, query)` → repo 新增 `listPredictions()`
  (user-scoped select,createdAt desc)。
- **transport** `calibration.transport.ts`:加 GET `/calibration/predictions` case → service.listPredictions。
- **schema/index**:`calibration.schema.ts` 注册 query/response;`index.ts` 导出。
- **FE 数据装配**:新建/扩 server helper(类比其他 `*-data.ts`)调 `client.listPredictions(...)`,
  把列表喂给页面渲染 `PredictionRow[]`。**禁止**前端直读 repo。

**(3) 飞轮两按钮目标行为**
| 按钮 | 目标 |
|---|---|
| `BumpRubricVersionButton`(已真) | 维持:`calibration.rubrics.bumpVersion`。 |
| `ReviseFromCalibrationButton` 据此修正定位/新增选题 | 跨模块:导航到 positioning/选题候选 surface 并携 calibration 偏差上下文。本波**最小**:`router.push('/topics?from=calibration')` 或挂 positioning 写 op(若已存在)。否则诚实标「规划中」+ disabled。 |
| `AdoptAiPredictionButton` 采纳 AI 盲预测 | 走 AI 垂直 `ai.confirm`→`confirmResult`→`calibration.lockPrediction`(§C-3)。本波若 AI review 节点未产 prediction 候选 → 保持 disabled + 「规划中」,**不**做平行 candidate 机。 |

**状态设计**
- predictions list 空 → 「暂无盲预测」空态,`PredictionRow` 不渲染。
- `createPrediction` 后 `router.refresh()` → list 重读回显新 prediction(`predictedScore` 非 0)。
- list 读失败 → 列表区空态 + 错误提示(island 既有 `useMutation` 仅管写,需为读侧加 server-side try/catch 回退空)。
- 飞轮按钮无目标 op 时 disabled + tooltip「规划中」,不留空 onClick 假按钮。

**验收标准**
1. 填 per-dim 分数 + subjectId 提交 → `createPrediction` body 携 `predictedConversion={dimKey:score}`;回显 `PredictionRow` 的 `评分` > 0。
2. `calibration.predictions.list` 返回 N 条 → 渲染 N 个 `PredictionRow`,锁定/回流按钮对应每行真 id。
3. 空预测 → 诚实空态。
4. 锁定/回流仍走 `lockPrediction`/`createResult`(不回归)。
5. 飞轮按钮:有目标则导航/写真,无目标则 disabled+「规划中」(无空 onClick)。
6. 契约/服务/repo/transport 新增 list op 有单测;`pnpm verify` green。

**实现步骤(file-level)**
1. `contract/src/operations/calibration.ts`:加 `listPredictions` 端点(上方 schema)。
2. `frontend/src/server/modules/calibration/`:
   - `calibration.repository.ts` 加 `listPredictions()`(user-scoped,createdAt desc)。
   - `calibration.service.ts` 加 `listPredictions(ctx, query)`。
   - `calibration.transport.ts` 加 GET case;`calibration.schema.ts`/`index.ts` 注册导出。
   - 测试:`calibration.service.test.ts` / `calibration.acceptance.test.ts` 加 list 用例。
3. `frontend/src/features/calibration/calibration-interactive-region.tsx`:
   - `BlindPredictForm.submit`:`predictedConversion: scores`(把本地 `scores` 真写入 body);移除「NOT threaded」注释。
   - 飞轮按钮:`ReviseFromCalibrationButton` 接导航/写 op 或 disabled+tooltip;`AdoptAiPredictionButton` 同。
4. 新建 `frontend/src/features/calibration/calibration-data.ts`(server helper):`client.listPredictions` → 喂列表;页面渲染 `PredictionRow[]`。
5. 计分量纲对齐:读 `deriveScore` 确认 0-5 vs 0-1,前后端统一(见决策)。

**需用户拍板的产品决策**
- D1:per-dim 分数塞 `predictedConversion` 还是 `predictedMetrics`?(建议 predictedConversion——与「变现加权」语义一致,且 `deriveScore` 的变现维度校验在此。)
- D2:per-dim 0-5 量纲——前端归一到 0-1 传,还是服务侧按 0-5 处理?(影响 `predictedScore` 显示量纲。)
- D3:`predictions.list` 是否带 `subjectId?`/`status?` 过滤(只看某内容/只看 locked)?
- D4:`ReviseFromCalibrationButton` 本波接 positioning 真路径,还是 disabled+「规划中」?
- D5:`AdoptAiPredictionButton` 是否等 AI review 产出 prediction 候选后再接(本波先 disabled)?

## Wave 3 — P1尾 + P2(Publishing/Production + 装饰交互)
# CreatorOS 页面交互设计 — P1 尾 + P2 缺口

> 设计师产出（只读代码 + 写设计）。每节给：目标行为 / 数据契约（准确 op 名）/ 状态设计 / 验收标准 / 实现步骤(file-level) / 需用户拍板的产品决策。
> 约束：禁止跨模块直读 repo；FE 一律走 `client.<op>`（typed contract client → `/api/v1` dispatch → user-scoped pglite）。
> 真实 op 来源：`contract/src/operations/*.ts`（注意 contract 在 worktree 根，不在 `frontend/` 下）。

---

## P1 尾

### GAP-PUBW-1 Publishing Workspace 右栏真来源 + calendarWiring 接通

**现状**
- 文件：`frontend/src/features/project-publishing/publishing-interactive-region.tsx`（右栏 `preview-rail`）、route entry `frontend/src/app/(creator)/projects/[projectId]/publishing/page.tsx`。
- 右栏 6 个块全是模块级硬编码常量：`PLATFORM_METRICS`（累计播放 184,203 等）、`PLATFORM_COMPARISON`（触达/转化）、`COMMENTS_TEASER`（@Meng/@Leo 假评论）、`PlatformPreview`（写死「12.3万 2560」）、`PublishChecklist`/`PublishTips`（来自 vm，半真）。
- `CalendarWiring` 类型 + `ContentCalendar` 的 create 逻辑**已写好**，但 route entry 的 `resolveWiring` 只产 `PublishingWiring`，**从不构造 `calendarWiring`**，故 `PublishingWorkspacePage` 未透传 → 内容日历恒 inert（`clickable = Boolean(calendarWiring) && isEmpty` 恒 false）。
- `PublishingWorkspacePage` 自身签名也缺 `calendarWiring` prop（page.tsx L46-53 只有 `wiring`），需要补透传链路 page→island。

**目标行为**
1. 内容日历：空格子可点 → `accounts.calendar.entries.create { plannedAt }` → `router.refresh()`（逻辑已就位，只差 wiring 注入）。
2. 右栏指标/对比：用 publication 的真实指标快照替换 4 个 `PLATFORM_METRICS` 卡 + `PLATFORM_COMPARISON` 表；无数据时显示「暂无指标」空态而非假数字。
3. 预览卡数字（播放/点赞/评论）：用真实快照填充，无数据则隐藏数字行。
4. 评论桩：明确**标注规划中**（无评论 op，见决策）。

**数据契约（准确 op）**
- 日历 wiring 账号：`accounts.list`（op id `accounts.list`，`GET /accounts`，query `{ platform? }`）取首个 active 账号 → `accountId`；`weekStart` 由 server 注入确定性周一 ISO（C-5，禁 wall-clock，可由 `buildPublishingWorkspaceViewModel` 已有的确定性基准 / route 传入固定 anchor）。
- 右栏指标：每个 publication 用 `analytics.publications.get`（op id `analytics.publications.get`，`GET /analytics/publications/:publicationId`，isList，返回 `metricSnapshotResource[]`）。route entry 已有 `resolveWiring` 拿到 `publications: platform→publicationId` map，循环取每平台最新快照。
  - 项目级聚合可用 `analytics.projects.get`（`GET /analytics/projects/:projectId`）。
- 对比表：复用上面 publication 快照按平台聚合（reach=views/曝光，conversion 由快照字段算），不新增 op。
- 评论：**无 op**（contract 无 comments 模块）→ 不做真，标规划中。

**状态设计**
- 右栏指标改为 props 驱动：`PlatformMetricsSummary({ metrics })` / `PlatformComparison({ rows })` / `PlatformPreview({ preview, stats })`。route 把快照装配进 `PublishingViewModel`（扩展 `preview.stats` + 新增 `vm.platformMetrics` / `vm.platformComparison`）。
- 三态：有快照 → 真值；空 → 「暂无指标，发布后回填」骨架；指标读失败 → 整块降级到空态（不抛）。
- 日历：`calendarWiring?` 为空 → 维持 inert（已实现），不需要客户端兜底假态。

**验收标准**
- AC1 route 在项目有 active 账号时透传 `calendarWiring={accountId, weekStart}`；空格子 `data-clickable="true"`，点击发 `accounts.calendar.entries.create` 且 refresh 后该天计数变化。
- AC2 `PLATFORM_METRICS` / `PLATFORM_COMPARISON` / `COMMENTS_TEASER` 三个硬编码常量从 island 删除或仅作空态占位；右栏数字 100% 来自 `analytics.*` 快照或显示空态。
- AC3 预览卡的「12.3万 / 2560 / 1.2万」改为快照或隐藏。
- AC4 评论块带可见「规划中」标注（tooltip 或角标），无假 @用户名。
- AC5 无网络读时（test viewModel 注入）右栏渲染不变 / 空态确定，SSR 确定性不破。

**实现步骤(file-level)**
1. `frontend/src/app/(creator)/projects/[projectId]/publishing/page.tsx`：新增 `resolveCalendarWiring(resolvedId)` → `client.listAccounts({query:{page:1,pageSize:1}})` 取首账号 → 返回 `{accountId, weekStart: <确定性周一>}`；加进 `Promise.all`；传给 `PublishingWorkspacePage`。
2. 同文件：扩展 `resolveWiring` 后续装配右栏快照，或新增 `resolveRightRail()` 循环 `client.getPublicationAnalytics({params:{publicationId}})`，把结果折叠进 viewModel（经 `buildPublishingWorkspaceViewModel` 或 route 内合并）。
3. `frontend/src/features/project-publishing/publishing-workspace-page.tsx`：`PublishingWorkspacePageProps` 增 `calendarWiring?: CalendarWiring`；透传给 `<PublishingInteractiveRegion calendarWiring=…>`。
4. `publishing-interactive-region.tsx`：`PlatformMetricsSummary`/`PlatformComparison`/`PlatformPreview` 改 props 驱动 + 空态；删 3 个硬编码常量；评论块加规划中标注。
5. `frontend/src/types/view-models.ts`（PublishingViewModel）：增 `platformMetrics`/`platformComparison`/`preview.stats` 字段（可空）。
6. `frontend/src/features/project-publishing/publishing-workspace-data.ts`：装配快照→viewModel 的 selector 改造。

**需用户拍板**
- D-PUBW-a 评论区：**确认标规划中**（无 comments op），还是先删除该块？建议保留并标「规划中」。
- D-PUBW-b `weekStart` anchor 用哪个确定性基准（项目 createdAt 当周周一？还是固定 fixture anchor 2026-06-某周一）？
- D-PUBW-c 「转化率」公式定义（metricSnapshot 哪两字段相除）需产品给口径，否则只渲染 reach、隐藏 conversion。

---

### GAP-PRD-1 Production 工作台:哪些做真 / 哪些标规划中

**现状**
- 文件：`frontend/src/features/production/production-interactive-region.tsx`。
- **已做真**：模式选择（`outputs.production.put`）、素材匹配 island、导出（`productions.exports.create` + `exports.complete`）、时间线添加章节（`productions.segments.create`）、录制/字幕 toggle（`outputs.production.put` 的 recordingConfig/subtitleConfig）。
- **仍是桩**：
  - 录制脚本面板 `RecordingScriptPanel`：标题/正文/时长来自硬编码 `scriptLineTitle/Body/Duration(index)`，仅 timestamp 来自 vm；「导入脚本」`href="#"`。
  - 素材统计 `AssetLibraryPanel`：`totalCount = assets.length*20+8`、`usedCount = *4+4`、`starredCount=+8`、`poolCount=+4` — **编造公式**。
  - 预览 `PreviewPanel`：play/pause 纯本地 state，无真实媒体。
  - 「设备检测」`settingsActionFor('recording')` 仅文本 link，无 handler。

**目标行为（做真/规划中 分流）**
| 子块 | 决策 | 理由 |
|---|---|---|
| 素材统计（全部/已使用/收藏/下载池） | **做真** | 有 op 支撑，编造公式最伤信任 |
| 录制脚本正文 | **做真**（读真 script，去掉 index 文案） | 脚本已落库（B3/B4），不应再 hardcode |
| 导入脚本按钮 | 做真链接或移除 | 一行改动 |
| 预览播放器 | **标规划中** | 真实视频渲染/媒体管线是重活 |
| 设备检测 | **标规划中** | 浏览器设备枚举非本期 |
| 剪辑本身（时间线拖拽真渲染） | **标规划中** | 明确：剪辑暂不做 |

**数据契约（准确 op）**
- 素材统计「全部」：`assets.list`（`GET /assets`，query `paginationQuery`）的真实计数（与 Assets 中心同源；按 pageSize 大值读一页计数）。
- 「已使用」：`materialLinks.list`（op id `materialLinks.list`，`GET /material-links`，query `{ ...pagination, projectId }`）按当前项目过滤 entityType=asset 的 link 数。
- 「收藏 / 下载池」：**无对应字段/op**（收藏在 Assets 端是借用 `assets.files.create` 的 hack，见 GAP-AST-1）→ **删除这两个统计**或标规划中（建议删，避免再编造）。
- 录制脚本：读项目脚本产物。脚本 artifact 走 `artifacts.*`（`contract/src/operations/artifacts.ts`）或已有的 script 读链（B3/B4 已落库，production VM selector 应已能取到真 scriptLines —— 把 `scriptLineTitle/Body` 的 index 文案换成 vm 里的真值字段）。
- 导出已真，无需动。

**状态设计**
- `AssetLibraryPanel` 统计行改 props：`{ allCount, usedCount }`（route/selector 注入），删收藏/下载池或标灰「规划中」。
- `RecordingScriptPanel`：直接渲染 `viewModel.scriptLines[].text/title`，删 `scriptLineTitle/Body/Duration` 三个 index 函数。空脚本 → 已有「暂无脚本行」空态。
- 预览/设备检测：加 `data-planned="true"` + 可见「规划中」徽标，按钮 `aria-disabled`。

**验收标准**
- AC1 素材统计「全部/已使用」来自 `assets.list` / `materialLinks.list` 真计数；「收藏/下载池」删除或带规划中标注，无 `*20+8` 类公式残留。
- AC2 录制脚本正文来自真实脚本产物，无 `index===0?"开场 Hook"` 类硬编码。
- AC3 预览播放器 + 设备检测带显式「规划中」标注，不假装可用。
- AC4 「剪辑暂不做」在 UI 有一处说明（时间线区角标或 tooltip）。

**实现步骤(file-level)**
1. `production-interactive-region.tsx`：`AssetLibraryPanel` 统计改 props；删/标 收藏+下载池；删素材编造公式。
2. 同文件：`RecordingScriptPanel` 用 vm 真值，删 3 个 index 文案函数；导入脚本 link 指向 Assets/script 编辑器或移除。
3. 同文件：`PreviewPanel` + recording 组「设备检测」加规划中徽标 + `aria-disabled`；时间线区加「剪辑能力规划中」说明。
4. `frontend/src/features/production/production-workspace-page.tsx` + route `frontend/src/app/(creator)/projects/[projectId]/production/page.tsx`：注入 `allCount`/`usedCount`（`client.listAssets` + `client.listMaterialLinks({query:{projectId}})`）。
5. `frontend/src/fixtures/selectors`（production selector）：scriptLines 取真脚本字段。

**需用户拍板**
- D-PRD-a 收藏/下载池统计：**删除** 还是 **标规划中保留**？建议删（无字段支撑）。
- D-PRD-b 预览播放器是否本期完全标规划中（确认剪辑/媒体管线不做）。

---

## P2（装饰/低频）—— 每条给「做真 / 标规划中」建议 + 理由

### GAP-PRJ-1 Projects 列表

**现状**：`frontend/src/features/projects/projects-page.tsx`。
- Tab 真计数已算好（`counts` from `vm.rows`），但 L335-346 `targetTotals` 硬覆盖成 28/12/6/4/5/1/0 —— **真计数被假总数覆盖**。
- 行「⋯」按钮（`project-row-action`，L289-297）：无 `onClick`，纯装饰。
- 缩略图：`thumbnailLabel` 用 id→写死中文标签 map（fixture）；`coverBgClass` 哈希渐变。
- 平台：`row.platforms` 来自 vm，基本真（`PlatformIcon`）。

**建议：做真**（计数+菜单是高价值低成本；缩略图标规划中）。
- **做真**：① 删 `targetTotals` 覆盖，tab count 用真 `counts`。② 「⋯」菜单加 handler：归档 = `archiveProject`（op id `projects.archive`，`POST /projects/:projectId/archive`）；打开 = 复用 `workspaceHrefForRow` 导航。
- **标规划中 / 保留**：缩略图（无真实封面 asset 关联 op 直供列表行；保留确定性渐变占位即可，不算「假」）。

**数据契约**：`projects.archive`（归档）、`projects.list`（计数源，已读）。菜单需 client 岛（`projects-page.tsx` 现为 Server Component）→ 抽 `ProjectRowMenu` client 子组件，调 `client.archiveProject` 后 `router.refresh()`。
**状态设计**：菜单 open/close 本地 state；归档 pending 用 `useTransition`；乐观从列表移除或直接 refresh。计数无 `targetTotals` 后随真数据浮动。
**验收**：① tab 计数 = 真实项目分布（删除硬覆盖）；② 「⋯」弹菜单含「打开/归档」，归档后行消失且「已归档」tab +1；③ 缩略图占位带说明无假数据声明。
**实现步骤**：(1) 删 `projects-page.tsx` L335-346 `targetTotals` 循环。(2) 新建 `frontend/src/features/projects/project-row-menu.tsx`（client，DropdownMenu + archive handler）。(3) `ProjectListItem` 用该菜单替换裸 button。
**需拍板**：D-PRJ-a 「⋯」菜单除归档/打开外是否加「重命名」(`projects.patch`)？ D-PRJ-b 真计数会让设计稿的「28」对不上，确认接受真数。

---

### GAP-NEW-1 New Project：createProject loading/错误态

**现状**：`frontend/src/features/projects/new-project-form.tsx` 的 `handleSubmit` 仅 `onCreate(values)` 后本地 reset，**无 loading/错误**。实际 `createProject` 调用在父级 dialog（`onCreate` 回调里），表单本身不知 pending。

**建议：做真**（高频入口，成本低）。
- 目标：Create 按钮在提交期间 disabled + spinner；失败显示内联错误且不 reset 表单（不丢用户输入）。
**数据契约**：`createProject`（op id `projects.create`，`POST /projects`，body `{title, brief, contentType?, creationMode?, targetPlatforms?}`）。表单 values 已含全部字段。
**状态设计**：把 `onCreate` 签名改为 `=> Promise<void>`；表单内 `status: 'idle'|'submitting'|'error'`，`errorMsg`。submitting 时 disable Create+Cancel；error 时保留 values（不调 reset）、显示 `role="alert"`。成功才 reset。
**验收**：① 提交中按钮 disabled+「创建中…」；② 注入 reject 时显示错误文案且表单值保留；③ 成功后 reset + 关闭（父级）。
**实现步骤**：(1) `new-project-form.tsx`：`onCreate: (v)=>void|Promise<void>`；`handleSubmit` await + try/catch + status state；FormFooter 加 pending/error props。(2) 父 dialog（`components/overlays/new-project-dialog.tsx`）让 `onCreate` 真正 `await client.createProject` 并把 reject 冒泡。
**需拍板**：D-NEW-a 创建成功后 enterAfterCreate 勾选时导航到哪个 stage（默认首阶段 research/planning？）。

---

### GAP-SRCH-1 Global Search：结果类型 tab / 话题 chips / 侧栏筛选 inert

**现状**：`frontend/src/features/search/search-page.tsx`。
- `ResultTypeTabs`（项目/知识/素材/视频，count 已重算为真）— 但 `data-pressed` 恒 index===0，**无 onClick**（注释自承 §290 decorative）。
- 话题 chips `FILTER_CHIPS`（AI/教程/…）`§291 decorative`，无 handler。
- 侧栏 `SearchFilters`（type/stage/tag facet）`§294 decorative`，count 来自 vm。
- search op：`searchOperations = {}`（空），搜索只走 composed `pages.search.get`（page DTO），**无独立 facet op**。

**建议：tab 做真（纯客户端锚点，零后端）；chips + 侧栏 facet 移除或标规划中**。
- 理由：结果已分组渲染，type tab 只需做**客户端「跳到/高亮该组」锚点 + 该组折叠**，无需后端 facet。话题 chips / 侧栏 facet 需要后端聚合（无 op）→ 移除或标规划中，避免 inert 装饰。
**数据契约**：tab 无需 op（客户端 scrollIntoView + 组可见性）。facet 若做真需新增 `search.facets` op（不在本期，故移除）。
**状态设计**：`SearchInteractiveRegion` 已是 client 岛；可将 ResultTypeTabs 提为 client，`activeType` state 控制哪个 `SectionCard` 展开/置顶；或最简：点 tab `scrollIntoView` 到对应 section。
**验收**：① 点击 type tab 高亮 + 滚动/筛选到该组；② 话题 chips 与侧栏 facet 要么移除、要么带「规划中」标注（不可保留无声 inert）；③ 真 count 不变。
**实现步骤**：(1) 抽 `frontend/src/features/search/result-type-tabs.tsx`（client，onClick→active+scroll）。(2) `search-page.tsx`：删 `FILTER_CHIPS` 与 `SearchFilters` 或加规划中徽标。(3) 注释 §290/§291/§294 同步更新。
**需拍板**：D-SRCH-a 话题 chips / 侧栏 facet：**移除** 还是 **标规划中保留**？建议移除（最干净，无 op）。 D-SRCH-b type tab 用「滚动锚点」还是「只显示该组」语义。

---

### GAP-SET-1 Settings：8 tab 装饰 / 系统设置只本地 / 导入导出删除 inert

**现状**：`frontend/src/features/settings/settings-interactive-region.tsx`。
- **已做真**：偏好（`patchPreferences`）、模型配置（`putModel`）。账户身份只读（昵称/邮箱 readOnly，注释指明 PATCH /me 缺口）。
- **只本地**：`SystemSettingsCard`（主题/密度/语言/通知）—— 纯 useState，无持久化 op。
- **inert**：导入/导出按钮 `aria-disabled`；删除账户 switch 仅本地 arm，按钮恒 inert（注释指明无 account-delete REST）。
- 「8 tab」：当前页非 tab 布局而是卡片堆叠，主/侧两列。（若指设计稿 8 个设置分类 tab，现实现折叠为卡片。）

**建议：系统设置部分做真，其余标规划中**。
| 子块 | 决策 | 理由 |
|---|---|---|
| 主题/密度/语言 | 系统设置 **做真**（持久化到 preferences） | 有 `patchPreferences`，且高频影响体验 |
| 桌面通知 toggle | 标规划中 | 需通知系统/权限，重 |
| 账户昵称/邮箱编辑 | 标规划中（已标，保留） | 无 PATCH /me op |
| 导入/导出 | 标规划中（已标，保留） | 文件包导出是重活 |
| 删除账户 | 标规划中（已标，保留） | 无 delete REST + 30天窗口 |

- 「做真」细节：`patchPreferences` body 有 `defaultHome/defaultCreationMode/defaultVisibility/autosaveEnabled/fileNamingRule/analyticsEnabled`，**无 theme/density/locale 字段**。→ 若要持久化主题需新增 preferences 字段（contract 改动）或借 `settings.models`/local-storage。建议：**主题/密度先用 localStorage 持久化（真持久，非 inert）**，语言已在 identity 真值显示。
**数据契约**：`settings.preferences.patch`（已用）；主题/密度无 contract 字段 → localStorage（前端真持久）或拍板加字段。
**状态设计**：系统设置 from `localStorage` 读初值 + 写回；其余 inert 块统一加「规划中」徽标（导入/导出/删除已有 tooltip，补可见 badge）。
**验收**：① 主题/密度切换刷新后保持（localStorage 或 server）；② 导入/导出/删除/通知 带显式「规划中」标注；③ 偏好/模型保持已做真行为。
**实现步骤**：(1) `settings-interactive-region.tsx` `SystemSettingsCard`：lazy init from localStorage + onChange 写回 + 主题真正切 `<html>` class（接现有 theme provider 若有）。(2) inert 块补「规划中」`Badge`。
**需拍板**：D-SET-a 主题持久化用 **localStorage** 还是为此**扩 preferences contract**？建议 localStorage（本期不动 contract）。 D-SET-b 是否本期就要 8-tab 分类导航，还是维持卡片堆叠。

---

### GAP-COP-1 Copilot Dashboard：推荐指令/最近任务/继续/快捷/智能推荐 fixture 无 onClick

**现状**：`frontend/src/features/copilot/ai-copilot-content.tsx`。
- **已做真**：PromptComposer（`createConversation`+`createMessage`+轮询 `listMessages`，真 Claude）。
- **桩**：`vm.recommendedCommands`/`recentTasks`/`continuingTasks`/`quickEntries`/`smartRecommendations` 全来自 `buildCopilotViewModel()` fixture，按钮均无 `onClick`（仅推荐指令/智能推荐勉强可填 prompt，但当前也无 handler）。

**建议：低成本部分做真（指令/智能推荐填入 composer），任务列表标规划中**。
| 子块 | 决策 | 理由 |
|---|---|---|
| 推荐指令 / 智能推荐 chip | **做真**：点击 → 填入 composer prompt | 零后端，复用已真的 composer，立即有用 |
| 快捷入口 | **做真**：点击 → 导航对应路由 | 纯路由跳转，零后端 |
| 最近任务 / 继续任务 | **标规划中** | 需真实任务列表 op（见下），fixture 无来源 |
| 「查看全部 →」link | 做真（导航）或标规划中 | 路由存在则做真 |

- 任务列表「做真」可行性：`projects.tasks.list`（op id `projects.tasks.list`，`GET /projects/:projectId/tasks`）是**项目级**任务，非全局；Copilot dashboard 需要跨项目聚合 → 无单一全局 tasks op。AI 任务结果有 `ai.tasks.results.list`（见 `ai.ts`）。→ 真聚合成本高，**标规划中**。
**数据契约**：做真部分无需新 op（填 prompt = `setPrompt`；快捷入口 = `next/link`）。任务列表若做真需新增全局 tasks 聚合 op（不在本期）。
**状态设计**：推荐指令/智能推荐 button `onClick={()=>setPrompt(cmd.title)}`；快捷入口换成 `<Link href>`；任务卡加「规划中」徽标。
**验收**：① 点推荐指令/智能推荐 → composer 填入对应文本；② 快捷入口跳转真实路由；③ 最近/继续任务带「规划中」标注，无假进度误导。
**实现步骤**：(1) `ai-copilot-content.tsx`：recommendedCommands/smartRecommendations button 加 `onClick=setPrompt`；quickEntries 换 Link（vm 加 href 或映射表）；recentTasks/continuingTasks 加规划中徽标。
**需拍板**：D-COP-a 任务列表确认**标规划中**（无全局 tasks op），还是接受「仅当前项目」范围用 `projects.tasks.list`？ D-COP-b 快捷入口 6 项各自目标路由确认。

---

### GAP-AST-1 Assets：上传仅 metadata 无字节 / 下载走 mock:// / 存储卡+用料历史桩

**现状**：`frontend/src/features/assets/asset-upload-button.tsx`、`assets-interactive-region.tsx`、`assets-page.tsx`。
- **上传**：`createUpload`（metadata triplet）+ `completeUpload`（name）已真持久 metadata，但**不传字节**（注释自承「no byte-upload op this wave」）。
- **下载/复制链接**：`getAsset` 真调，但实际 URL 是 `mock://object-storage/signed/${assetId}`，无真实字节。
- **收藏**：借 `assets.files.create` 注册一个 `favorites/${id}` storageKey（hack，无真实收藏字段）。
- **存储卡** `StorageUsageCard`：`vm.storage` 来自 `buildAssetsViewModel()` fixture（usedBytes/totalBytes 假）。
- **用料历史** `usageHistory`：来自 `viewModel.usageHistory`（fixture 假），未接 `materialLinks.list`。
- **已做真**：类型筛选、搜索、分页、附到项目（`materialLinks.create`）、回收站（`trashAsset`）。

**建议：用料历史做真；上传字节/下载/存储卡 标规划中；收藏 重审**。
| 子块 | 决策 | 理由 |
|---|---|---|
| 用料历史 | **做真**：接 `materialLinks.list` | 有 op，且与「附到项目」闭环，价值高 |
| 上传（字节存储） | **标规划中**：保留 metadata 真，字节标规划中 | 文件字节存储是重活（明确建议标规划中） |
| 下载 / 复制链接 | **标规划中** | 依赖真实对象存储；现 mock:// 标「规划中」 |
| 存储卡数字 | 标规划中 或 弱真（用 metadata fileSize 求和近似） | 真实容量配额无 op；可用已读 assets 的 `fileSizeBytes` 求和当「已用」近似 |
| 收藏 | **标规划中**（移除 hack 或标注） | 无收藏字段，`assets.files.create` hack 误导 |

**数据契约**：
- 用料历史：`materialLinks.list`（`GET /material-links`，query `{...pagination, projectId}`）。注意 query **要求 projectId**（`paginationQuery.extend({ projectId: id })`）→ 资产中心是全局视图，无单一 projectId。**缺口**：无「按 assetId 反查所有 link」的 op。
  - 选项 A：选中某 asset 时，遍历用户项目 `projects.list` → 各项目 `materialLinks.list({projectId})` 过滤 entityId===assetId（N 次读，重）。
  - 选项 B（推荐）：**新增 op** `materialLinks.list` 支持 `entityId` 过滤 或新增 `assets.usage.list`（`GET /assets/:assetId/usage`）→ 干净。需后端配合，本期可先标规划中，待 op 落地再接。
- 存储「已用」近似：复用 `assets.list` 已读 rows 的 `fileSizeBytes` 求和（前端聚合，非编造），「总量」无 op → 固定配额文案或标规划中。
**状态设计**：用料历史 props 化，空态「该素材暂未被任何项目引用」；上传成功 toast 注明「已登记素材信息（文件字节存储规划中）」；下载/复制/收藏 加规划中徽标。
**验收**：① 用料历史接真 link（或明确标规划中 + 给出待新增 op 名）；② 上传后 metadata 真持久且 UI 注明字节存储规划中；③ 下载/复制/收藏带规划中标注，不假装下载成功；④ 存储卡「已用」= 真 fileSize 求和 或 标规划中，无 fixture 假 GB。
**实现步骤**：(1) `assets-page.tsx`：若走选项 A，route 聚合 usageHistory；存储已用改 `rows.reduce(fileSizeBytes)`。(2) `assets-interactive-region.tsx`：download/copyLink/favorite handler 旁加规划中徽标传入 `AssetDetailPanel`。(3) `asset-upload-button.tsx`：成功后注明 metadata-only。(4) （若选项 B）记录待新增 op `assets.usage.list` / `materialLinks.list?entityId`。
**需拍板**：
- D-AST-a 用料历史：本期**接选项 A（N 次读，重但无需后端）** 还是 **标规划中等新增 `assets.usage.list` op（选项 B，干净）**？建议 B + 暂标规划中。
- D-AST-b 文件字节上传/下载：**确认本期标规划中**（重活，需真实对象存储）。
- D-AST-c 收藏：**移除** hack 还是标规划中保留？建议移除（无字段，hack 误导）。
- D-AST-d 存储卡「已用」用 fileSize 求和近似 还是整卡标规划中？

---

## 汇总：做真 vs 规划中

| GAP | 做真 | 标规划中 |
|---|---|---|
| PUBW-1 | calendarWiring 接通、右栏指标/对比/预览(analytics.*) | 评论区 |
| PRD-1 | 素材统计(全部/已使用)、录制脚本正文 | 预览播放器、设备检测、剪辑、收藏/下载池统计 |
| PRJ-1 | tab 真计数、⋯菜单(归档/打开) | 缩略图封面 |
| NEW-1 | createProject loading/错误态 | — |
| SRCH-1 | type tab(客户端锚点) | 话题 chips、侧栏 facet（建议移除） |
| SET-1 | 系统设置(主题/密度, localStorage) | 通知、账户编辑、导入/导出、删除账户 |
| COP-1 | 推荐指令/智能推荐(填prompt)、快捷入口(导航) | 最近/继续任务列表 |
| AST-1 | 用料历史(materialLinks.list,选项B待op)、存储已用近似 | 字节上传/下载、收藏、存储总量 |

**重活一律标规划中**：文件字节存储/下载、视频剪辑与媒体管线、真实对象存储、账户删除 REST、跨项目任务聚合、后端 facet 聚合。
