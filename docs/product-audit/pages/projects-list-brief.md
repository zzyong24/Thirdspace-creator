# 页面组审计:项目列表 + 项目详情(Brief)

> 审计日期 2026-07-02 · dev server localhost:3000 实测(只读)· 证据全部标 file:line 或 curl 结果。
> 范围:`/projects`、`/projects/[projectId]`(含 brief 立项工作台)、`/projects/new`(列表的直接入口)。
> 阶段子页(research/script/…)不在本组,但「打开」按钮的落点解析问题在此落账(因为链接是本组生成的)。

---

## 一、/projects 项目列表

### 1.1 功能定位

替用户完成:**看到所有创作项目 + 各自处在七步流水线哪一步 + 打开进入对应工作台**。是七步流水线(立项→…→复盘)的项目级入口页。宪法 §4「项目主干」的正门。

现实状态:因为 T-030 把 73 条真实抖音作品导成 `source:imported` 项目,同时旧的 58 条 `dy-proj-*` douyin-real.ts 冻结种子还在库里,这页实际变成了「135 条以已发布历史作品为主(131 条)的作品堆 + 3~4 个创作中项目」,项目管理的任务感被淹没(详见 1.5)。

### 1.2 区块与交互清单

| 元素 | 行为(点了发生什么) | 接线 | 状态 |
|---|---|---|---|
| 状态 tabs(全部/进行中/写稿中/制作中/已发布/复盘中/已归档) | 只切换按钮高亮,**列表不筛选**(页面是 RSC,rows 与 tab 状态零耦合;没传 `value`/`onValueChange`) | 无 —— 纯本地视觉态 | **dead(假交互)** projects-page.tsx:150、status-tabs-bar.tsx:38-51 |
| 视图切换 ▦/☰ | 切 aria-pressed,**渲染不变**(页面只有列表渲染,无网格实现;默认值还是 `grid` 而实际渲染是列表) | 无 | **dead** view-and-sort-controls.tsx:36、view-mode-toggle.tsx:32-39 |
| 排序下拉(最近更新/进度/阶段/标题) | 视觉像下拉(label+▾),点击**无弹层无效果**:radio 全部 `sr-only`,且页面没接 `onSortChange`;实际排序固定 publishedAt/createdAt 倒序 | 无 | **dead** sort-select.tsx:60-80、projects-page.tsx:99-104 |
| 每行「打开」/行菜单「打开」 | 跳 `/projects/{slug}/{currentStage}`,slug = 项目 id 剥掉 `project-` 前缀 | Link → 阶段子页 | **broken(高)** 见疑似 bug #1/#2 |
| 行菜单 ⋯ →「归档」 | `client.archiveProject`(op `projects.archive`)+ `router.refresh()`,行移出列表、tab 计数联动 | contract op `projects.archive`(contract/src/operations/projects.ts:91)→ projects service → projects 表 | works(接线真;写操作未实测,只读纪律) project-row-menu.tsx:52-64 |
| 分页(每页 10 条) | `/projects?page=N` 服务端切片 | page.tsx 读 `?page=` → 内存切片 | works(curl 200) projects-page.tsx:113-123 |
| TopHeader 搜索框(「搜索项目名称、关键词...」) | 它其实是个 **Link 到 /search**,不是输入框 | 导航 | works(但形态误导:看着能输入,点击即跳走) top-header.tsx:492-504 |
| TopHeader「⚙ 筛选」 | 无 onClick | 无 | **dead** top-header.tsx:505-508 |
| TopHeader「＋ 新建项目」 | `/projects/new` 拦截式弹窗 | Link | works(curl 200) top-header.tsx:509-514 |
| 新建项目弹窗「创建」 | `client.createProject`(title/brief/contentType/creationMode/targetPlatforms)→ refresh;勾「创建后进入工作区」(默认勾)→ `router.replace(/projects/{id}/research)` | op `projects.create` → service `createProject` | 接线真;**落点错**:后端初始 `currentStage="brief"`(projects.service.ts:625),却硬跳 research(new-project-dialog.tsx:192)→ 见 bug #3 |
| 新建项目弹窗「取消」/遮罩/× | 关弹窗、表单重置 | 本地 | works new-project-dialog.tsx:134,163 |
| `features/projects/project-toolbar.tsx`(搜索/筛选/新建 工具条组件) | — | **全仓无引用**(只有自身与测试) | **dead code**(整个组件未挂载) |

### 1.3 数据来源(四桶)

| 数据 | 来源链 | 桶 |
|---|---|---|
| 项目行(标题/brief/状态/阶段/进度/更新时间)+ tab 计数 | page.tsx → `client.listProjects`(op `projects.list`,pageSize 500)→ persistence-client → projects service/repo → `projects` 表 | **real**(139 行:73 imported 真采集 + 58 dy-proj 种子 + 4 demo + 4 手动;demo 4 个被 DEMO_PROJECT_IDS 过滤,页面显 135) |
| 58 条 `dy-proj-*` 行本身 | douyin-real.ts 冻结 fixture → persistence-client seed(persistence-client.ts:4832-4836) | **fixture**(且种子行**缺 `source:"imported"` 与 `platformRef`** —— douyinProjects 数组无这两字段,seed 时只注入 userId;与 T-030 真采集的 73 条大面积同视频重复,实测 40 组重复标题) |
| 「目标平台」列 | `buildProjectsViewModel` → `getProjectPlatforms(project.id)` 读 **静态 canonical fixture** 的 projectTargetPlatforms(fixtures/selectors/index.ts:123、canonical.ts:2468-2473),不读库里的 project_target_platforms 表 | **hardcoded/fixture**(真实项目全空;实测第 1 页 10/10 行该列为空) |
| 「最近更新」相对时间 | `formatCompactUpdatedAt` 以 `FIXED_NOW = 2026-06-13T14:30` 冻结时钟为"现在"(projects-page.tsx:485-491) | **hardcoded**(所有 6-13 之后更新的行显「刚刚」,实测页面 40 处「刚刚」) |
| 封面缩略图文案 | `thumbnailLabel` 死映射 5 个**数据集中不存在**的 id(project-claude-code-guide 等,canonical.ts 中 0 命中)+ 回退 `contentCategory.slice(0,4)`(imported 的 contentCategory=`""` → 空色块) | **hardcoded(死代码 + 空回退)** projects-page.tsx:464-473 |
| owner 头像「我」+「更新时间:」行 | 组件写死 | **hardcoded**(小) projects-page.tsx:237-243 |
| 行内 outputs/primaryOutputId(VM 字段) | `pickOutputsForProject` 读 canonical fixture 的 contentOutputs(fixtures/selectors/index.ts:167-182) | **fixture**(此页未渲染这两字段,暂无害) |

### 1.4 数据流向(写路径)

- 归档:行菜单 → `projects.archive` → projects 表 `archivedAt`/status → refresh 后行消失、已归档计数 +1。
- 新建:弹窗 → `projects.create` → projects + project_stages + project_target_platforms 表(brief 起步)。
- 其余交互(tabs/视图/排序/搜索框)**无写路径也无读路径** —— 都是壳。

### 1.5 设计不合理

| 问题 | 严重度 | 说明/建议 |
|---|---|---|
| 筛选/排序/视图三件套全是假的 | 高 | 用户最直接的"怪":点 tab 数字在但列表不动、排序像下拉点不开、视图切换无变化。要么接真(tab→URL 参数过滤、sort→重排序、grid→实现或删),要么先撤下来。 |
| 131 条已发布历史作品淹没 3~4 个创作中项目 | 高 | 「项目」页的任务是管理创作进行时;导入历史作品(飞轮记忆)更像「作品库」。建议默认 tab 为「进行中」或把 imported 归到独立视图/页;当前默认全部+发布时间倒序 = 打开先看到一屏历史作品。 |
| dy-proj 种子与真采集 imported 双份并存 | 高 | 同一条视频两行、发布时间相近排在一起,重复感极强(40 组重复)。宪法 §7 明说「替换所有 mock/seed」—— dy-proj 种子该退役或迁移合并。 |
| tab 语义映射混乱 | 中 | `mapProjectRowToTab`:paused→「复盘中」(?),completed→「已发布」,从不产出 drafting/production → 「写稿中/制作中」恒 0(明明有 currentStage 可分桶却按 status 分)。projects-page.tsx:358-373 |
| 阶段标签口径与详情页不一致 | 中 | 列表 STAGE_LABELS:research→「复盘中」(与 review 撞名!)、publishing→「已发布」+descriptor「等待素材」(projects-page.tsx:379-397);详情页同一 stage 叫「选题调研/渠道发布」(project-overview-page.tsx:275-283)。同一实体两套词,还自相矛盾。 |
| 搜索框是个假输入框 | 中 | TopHeader 的"搜索框"是 Link,获得焦点即离开本页去 /search;项目列表本身无法按名过滤。 |
| imported 空字段的占位体验 | 中 | 未命名作品/brief="抖音作品"/contentCategory="" → 标题重复「未命名作品」、缩略图空块、副标题无信息。导入管线该补标题截断/首帧封面。 |
| 更新时间双重显示 | 低 | owner 行和「最近更新」列显示同一值(projects-page.tsx:243,293-298)。 |
| 每页固定 10 条不可调 | 低 | 「每页显示 10 条」是纯文案,135 条要翻 14 页。 |

### 1.6 疑似 bug(带证据)

1. **「打开」链接剥 `project-` 前缀 → 阶段页身份解析失败(高)**
   `projectRouteSlug` 把 `project-8639205b-417` 剥成 `8639205b-417`(projects-page.tsx:480-483);阶段页 `resolveProjectIdParam` 只按「精确 id」或「标题 slug」匹配(review/page.tsx:86-108),中文标题 slug 不可能等于 uuid 尾巴 → 解析失败原样传参 → 页面退化。
   实测:列表实际渲染的 href 全是剥前缀形态(`/projects/8639205b-417/review` 等);`curl /projects/8639205b-417/review` 渲染 `data-project-id="8639205b-417"`(未解析)、不含该项目真标题,而 `/projects/project-8639205b-417/review` 含真标题。overview 型 URL `/projects/18f58d87-143` 更是主内容区整块空白(shell 流出后 notFound,HTTP 仍 200)。
   只有 `dy-proj-*`(不带前缀)和 demo 特例 `ai-native-browser` 能正常解析 —— **恰好真实项目全坏、fixture 项目全好**。
2. **brief 阶段项目「打开」→ 404(高)**
   新建项目初始 `currentStage="brief"`(backend/src/modules/projects/projects.service.ts:625),而 app 路由不存在 `[projectId]/brief/`(find 结果只有 planning/production/publishing/research/review/script);`curl /projects/project-18f58d87-143/brief` → **404**。brief 工作台实际挂在 overview 路由(`/projects/[id]`),但列表「打开」和 stepper 链接模板都是 `/{stage}` 直拼。
3. **新建项目落点错阶段(中)**
   创建后 `router.replace(/projects/{id}/research)`(new-project-dialog.tsx:192)但项目在 brief;用户跳过了必填的立项工作台,research 页还会因 brief gate 无法推进。
4. **冻结时钟 FIXED_NOW → 相对时间全错(中)**
   `FIXED_NOW=2026-06-13`,`diffMs<=0` 一律「刚刚」(projects-page.tsx:485-493);库里 updatedAt 多为 6-21/6-30/7-02 → 实测整页 40 处「刚刚」。今天(7-02)看什么都是刚刚。
5. **dy-proj 种子缺 source/platformRef → 「真机反馈#1/#2」修复对它失效(中)**
   fixture 行无 `source`/`platformRef` 字段(douyin-real.ts douyinProjects;seed 只注 userId,persistence-client.ts:4833-4835),dispatch 实测返回 `source:"manual"`、`platformRef:{platform:"",externalId:""}`;`row.source==="imported"` 的所有分支(已发布 tab 归类/「历史作品」descriptor/publishedAt 排序)对这 58 行全不生效,靠 status=completed 兜底才凑对了一半(descriptor 显「数据复盘中」而非「历史作品」)。

---

## 二、/projects/[projectId] 项目详情(总览 + Brief 立项工作台)

### 2.1 功能定位

两态一页:
- **stage=brief**:渲染 **BriefWorkbench 立项工作台**(结构化 Brief 表单 + 保存 + 进入选题调研)——宪法 §5「每个项目必须有 Brief」的落点,七步①。
- **其他 stage**:项目总览 —— 七阶段 stepper + 进度、资产/最近文件/动态(主列)、项目信息/输出规划/发布状态/里程碑(侧列);imported 主行动改「查看复盘」。空态处理成熟(主列全空 → 单张「这步该干嘛」引导卡,不摆一排 0)。

### 2.2 区块与交互清单

| 元素 | 行为 | 接线 | 状态 |
|---|---|---|---|
| BriefWorkbench「保存 Brief」 | title+briefDetail 整体落库 + refresh;dirty/已保存态、错误就地显示 | `client.patchProject`(op `projects.patch`) | works(链路真,写未实测) brief-workbench.tsx:152-186 |
| BriefWorkbench「进入选题调研」 | 必填(名称/受众/目标/形式/核心信息)校验 → 先存后 `transitionProjectStage(brief)`,后端 gate 复校,409 原因如实显示 | op `projects.stage.transition`(contract/src/operations/projects.ts:99) | works(链路真) brief-workbench.tsx:190-214 |
| Brief 画幅(横/竖屏)、平台 chips、各输入框 | 本地表单态,随保存落库 | 同上 | works |
| 收藏 ★ | `patchProject {starred:!starred}` + refresh | op 真;**初值读 fixture**:`getProjectById(projectId)?.starred ?? false` 来自 fixtures/canonical(project-overview-page.tsx:47,355)→ 真实项目永远 false → 点亮不了、每次都发 true、**无法取消收藏** | **broken(中)** project-actions.tsx:101-109 |
| 归档 | `archiveProject` + refresh(留在原页) | op `projects.archive` | works(接线真) project-actions.tsx:111-119 |
| 进入下一步(outline 次级钮) | `transitionProjectStage(currentStage)`,gate 409 原因显示在按钮下 | op 真 | works project-actions.tsx:121-136 |
| 主按钮「进入工作台 / 查看复盘」 | `/projects/{slug}/{stage}`,slug 同样剥 `project-` 前缀(project-overview-page.tsx:399-405) | Link | **broken(高)**:真实项目跳过去的阶段页身份丢失(同列表 bug #1);imported「查看复盘」实测落到 fixture 退化的 review 页 |
| StageGuidanceCard「进入工作台/查看复盘」 | 同上剥前缀模板 | Link | **broken(同上)** project-overview-page.tsx:225-249 |
| 七阶段 stepper(总览卡内) | 纯展示:page 未传 `projectId` → `navigable=false`,不可点(project-overview-page.tsx:367-377、project-stage-stepper.tsx:103-106) | 无 | 展示 only(与 A6「stepper 可点」的 workspace header 版不一致;若接上 projectId,brief 段 href 仍是 404 模板) |
| TopHeader(project-overview 模式)「分享」 | 无 onClick | 无 | **dead** top-header.tsx:418-423 |
| TopHeader「更多」⋯ | 无 onClick | 无 | **dead** top-header.tsx:424-426 |
| TopHeader 主钮「进入工作台 →」 | `pathname + / + identity.stage`;identity 来自 shell-router **fixture 查找**,真实项目查不到 → `stage` 固定回退 `"research"`(shell-router.tsx:236) | Link | **broken(中)**:真实项目无论在哪个阶段都跳 research(id 部分因取自 pathname 反而是对的) |
| 侧列 4 卡(信息/产出/发布/里程碑) | 展示;空态文案 | 读 op(见 2.3) | works(读侧) |

### 2.3 数据来源(四桶)

| 数据 | 来源链 | 桶 |
|---|---|---|
| 标题/阶段/进度/项目信息/briefDetail/source | `projects.get`(page.tsx → buildProjectOverviewWorkspaceViewModel,project-overview-workspace-data.ts:204-223) | **real**(curl 实测返回真 DTO) |
| 产出列表(输出规划卡) | `projects.outputs.list` | **real**(curl 实测) |
| 项目动态 | `projects.activity.list`(事件→固定文案映射) | **real**(curl 实测,imported 有 project_created 等事件) |
| 阶段 stepper 状态 | `projects.stages.list`,缺行回退 currentStage 推导 | **real**(curl 实测 imported 全 7 段 completed/in_progress) |
| 资产概览 5 stat + 最近文件 | `materialLinks.list` + 逐条 `assets.get`(用料链) | **real**(真实项目多为 0 → 主列切引导卡,诚实) |
| 发布状态卡 | 逐产出 `outputs.publications.list` | **real** |
| 里程碑卡 | **无 producer、无读 op**,恒 `[]`(project-overview-workspace-data.ts:435-437);空态文案「里程碑将随阶段推进自动生成」承诺了不存在的自动机制 | **planned(未标注)** —— 软性假承诺文案 |
| 收藏初值 starred | `getProjectById`(**静态 canonical fixture**) | **fixture 泄漏**(唯一混进真实页的 fixture 读) |
| 动态 actor「Zyong Zhu」 | 组件常量 `PROJECT_OWNER_DISPLAY_NAME`(project-overview-page.tsx:811) | **hardcoded**(非会话用户名) |
| demo 项目(4 个)的资产/文件/发布/里程碑 rollups | fixture curated(isFixtureProject 分支,workspace-data.ts:227,268-289) | **fixture**(按设计保留,demo 已从列表隐藏,影响小) |
| 无 session / 未知 id 回退 | `buildProjectOverviewViewModel` fixture(「未找到项目」;fixtures/selectors/project-overview.ts:39-42) | **fixture**(兜底) |
| /projects/new 直接访问的背景页 | `<DashboardPage />` 无 viewModel = fixture 默认仪表盘(app/(creator)/projects/new/page.tsx:22-27) | **fixture**(弹窗背景泄漏) |

### 2.4 数据流向(写路径)

- Brief 保存:`projects.patch`(title+briefDetail jsonb)→ projects 表。
- 阶段推进:`projects.stage.transition` → project_stages 状态机 + gate(brief gate 校验必填,SKL-11 卡待补落 needs_review)。
- 收藏:`projects.patch {starred}`(但读侧断,见 bug)。
- 归档:`projects.archive`。
- 全部走「island → client.* → dispatch → service → SQL → router.refresh()」,符合确认门架构;**AI 不在此页产写**(brief 的 3 个 AI 补全按钮明确不放假按钮,诚实但见 2.5)。

### 2.5 设计不合理

| 问题 | 严重度 | 说明/建议 |
|---|---|---|
| 立项工作台零 AI,纯手填 5 个必填 | 中 | 宪法 §5.5「产品是编导不是表单填写机」「AI 出草稿人审改」;BriefWorkbench 注释明说 3 个 AI runner(补受众/校验目标/推荐指标)延后不放(brief-workbench.tsx:12-13)。诚实无假按钮 ✓,但当前体验与宪法定位有实距离,且页面未标注「AI 补全规划中」,用户不知道会有。 |
| 一页两态(brief↔总览)无路由区分 | 中 | brief 工作台挂在总览路由,导致外部所有 `/{stage}` 链接模板对 brief 都是 404(bug #2 根因);要么加 `/brief` 路由重定向到总览,要么链接生成统一走一个 helper。 |
| 三处「进入工作台」落点各自为政 | 高 | 页主按钮(剥前缀,身份丢)、StageGuidanceCard(同)、TopHeader(fixture 回退 research)——同一意图三个实现三种坏法。应统一为单一 href builder(用完整 id + 真 stage)。 |
| 里程碑空态承诺自动生成 | 低 | 无任何 producer;按宪法「诚实标规划中」应改文案或标注规划中。 |
| stepper aria-label「项目六阶段」但渲染 7 段 | 低 | brief 加入后文案未更新(project-stage-stepper.tsx:165;page 注释也说 six-stage)。 |
| 头部「分享/更多」装饰按钮 | 低 | 无功能不如撤;或按 Wave-3 惯例标注。 |
| imported 长标题即整条文案 | 中 | 导入管线把抖音正文+hashtags 全塞 title(60~200 字),详情页靠 truncate 兜住溢出(page 注释自认 3000px 溢出教训),根治该在导入侧截断/分离 title 与 caption。 |

### 2.6 疑似 bug(带证据)

1. **主按钮/引导卡 href 剥前缀 → 真实项目工作台身份丢失(高)** —— 同列表 bug #1,证据:project-overview-page.tsx:399-405 + curl 对比(`8639205b-417/review` 无真标题 vs `project-8639205b-417/review` 有)。
2. **收藏读 fixture 永 false → 无法点亮/无法取消(中)** —— project-overview-page.tsx:355(`getProjectById` 来自 `@/fixtures/canonical`)+ project-actions.tsx:106(`!starred` 恒发 true)。VM(真读)根本不含 starred 字段。
3. **TopHeader 进入工作台对真实项目恒跳 research(中)** —— shell-router.tsx:236 `stage: project?.currentStage ?? "research"`,project 只查 canonicalDataset;CurrentProjectProvider 只灌 title 不灌 stage(projects/[projectId]/layout.tsx:78-84)。
4. **未知/未解析 id 的 overview 200 空页(中)** —— notFound 在 shell 流出后触发,HTTP 200 + 主区空白(curl `/projects/18f58d87-143`:len 63KB,主区仅 scrollbar CSS)。用户看到的是"页面坏了"而不是 404。
5. **slug 解析与 layout 标题提升 pageSize=100 < 139 行(低-中)** —— [projectId]/page.tsx:89、layout.tsx:57 都 `pageSize:100`;第 101+ 条项目 slug 解析/真标题提升失效(当前 139 条已越界)。
6. **[projectId]/page.tsx 的 resolveProjectIdParam 用单例 canonical client 而非 session client(低)** —— page.tsx:35,86 用 `client`(canonical ctx),同文件下面的正式读却用 `createServerClient(session.ctx)`;layout.tsx:55 又用 session client。跨用户场景下拿别人的项目列表做 slug 匹配(读侧最终仍 404,无泄漏,但口径不一)。

---

## 三、待对齐点(供全局对齐分析)

1. **阶段中文名两套且互相矛盾**:列表 research=「复盘中」/publishing=「已发布·等待素材」 vs 详情 research=「选题调研」/publishing=「渠道发布」。全局应锁一份 STAGE_LABELS。
2. **项目 URL 形态不统一**:完整 id(`project-xxx`)、剥前缀 slug(`xxx`)、标题 slug(`ai-native-browser`)三形态并存,解析器各页复制粘贴(page/layout/6 个阶段页至少 8 份 slugifyTitle/resolveProjectIdParam 拷贝),pageSize 上限也各写各的。
3. **「已发布作品」的归属**:项目列表、作品库(/works,T-030)、发布中心三处都承载已发布内容;dy-proj 种子 vs imported 采集双源并存待清算(宪法 §7「替换所有 mock/seed」)。
4. **imported 项目 status 口径**:真采集 imported 是 `status:"active"+progress100+completedAt:null`,dy-proj 种子是 `status:"completed"`;两种"已发布历史作品"状态字段不同,全靠前端 if 兜。建议后端归一。
5. **FIXED_NOW 冻结时钟**:mock-store 时代遗产(fixtures/canonical FIXED_NOW → store.ts:4),真库时代所有相对时间都该换 `Date.now()`(仅测试注入固定时钟)。
6. **fixture 选择器仍是列表 VM 的装配层**:`buildProjectsViewModel` 混装真行 + fixture 平台/产出(fixtures/selectors/index.ts:109-132)——「读侧做真」只做了行本身,列级字段还挂在 canonical 上。
7. **确认门/诚实原则执行不均**:brief 工作台零假按钮(好),但同页 TopHeader 分享/更多、列表 tabs/排序/视图是假的;「装饰交互补真/标规划中」(Wave-3)在这组页面未覆盖 shell 与列表控件。
