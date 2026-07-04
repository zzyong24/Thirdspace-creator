# 经验归位设计(裁决进复盘 · 已验证库进知识库 · 经验模块退役)

> 状态:⚠️ **CONCERNS(已处置)**(MiniMax spec-review gate,2026-07-04;0 blocker / 1 major / 3 minor,全部内联 [gate-F1..F4]);处置后**可开工 T-118a→b→c**(待用户复审)。作者:Claude(Opus 4.8)。日期:2026-07-04。
>
> **裁决注(2026-07-04,MiniMax reviewer)**:总评「合定位、方向正确、零 schema、复盘→经验→知识库飞轮路径清晰」。1 major + 3 minor 已内联:[gate-F1](major)AI 分析卡 vs 本期经验区 UI 语义边界只列风险未给方案 → 新增 **§D UI 边界设计**明文区分;[gate-F2] T-119 分页补规格(§B);[gate-F3] review.analyze 输出 schema 含 learnings+projectId 需引证/验收(§5);[gate-F4] ExperienceCaptureLink 归宿补验收(§B)。
> 触发:用户在 T-113(知识库+经验合并为双 Tab)后追问「这俩合并从产品上该怎么设计」→ 提出更优:「裁决和经验入库合并到项目复盘板块」。
> 对应 BACKLOG:T-118(经验归位)。关联:[ia-convergence SPEC](2026-07-04-ia-convergence-design.md)(T-113 双 Tab 是本 SPEC 要迭代的前身)、[两阶段项目 SPEC](2026-07-03-two-stage-project-design.md)(复盘阶段)、[产品定位](../../产品定位.md)。

## 0. 用户拍板(2026-07-04,AskUserQuestion 录)

问「经验拆分端态方向对吗(裁决→复盘,累积库→知识库)」→ 用户选 **「裁决进复盘 + 库进知识库(推荐)」**。定论:

- **经验诞生在复盘**,故把它拆两半各归其位:
  1. **经验裁决台**(队列:从本作品复盘提的经验候选,采纳/翻案)→ **进项目复盘板块** `/projects/<id>/review`(in-context)。
  2. **已验证经验累积库**(跨作品方法论)→ **进知识库** `/knowledge` 作**只读「经验」类型**(不在此裁决)。
  3. **经验沉淀独立模块彻底退役**。

## 1. 背景与目标

T-113 把经验沉淀并入 `/knowledge` 作第二个 Tab(裁决台整块搬进 Tab)。用户判断:双 Tab 仍是「两模块一顶帽」,不是真合并。更深的洞察:**经验是复盘的产物**,裁决(判断哪条经验成立)本就是复盘这条作品的动作,不该是一个孤立的顶级模块。

**目标**:让飞轮闭环——复盘一条作品 → **当场**裁决它产出的经验候选 → 采纳的经验回流校准/选题 + 沉进知识库作跨作品复用库。经验不再有独立入口:**在复盘里产、在知识库里存**。

## 2. 宪法对照(合定位)

- 强化「以作品为中心」的复盘→经验→回流飞轮(§定位飞轮),经验裁决回到它诞生的上下文,合定位。
- 知识库统一为「可复用认知库」(观点/证据/金句/问答/**经验**),减少并列顶级模块,合定位。
- **数据归属不变**:`learnings` 表不动(仍持 candidate/validated/discarded + projectId);仅**消费面/入口**迁移(裁决 UI 去复盘、已验证读 UI 去知识库)。故本 SPEC 属「IA 结构调整」需过 gate,但**不涉及数据归属迁移/schema 变更**。

## 3. 现网事实(已勘查)

- 经验组件已切分:`experience-interactive-region.tsx` 导出 `AdjudicationQueue`(裁决队列,candidate,采纳/不采→`evaluateLearning`,inline 编辑)、`ValidatedLibrary`(已验证库,按 learningType 分组折叠)、`ExperienceCaptureLink`(Copilot 记录入口)。**两块可各自搬迁**。
- 经验产出:`review-runner`(`review.analyze`/`review.insights`)经 `runStructuredNode` 产 `{ learnings:[…] }` → `recordCandidate` 落 `learning_list` 候选;AI 任务带 `projectId`(per-work)。
- `learnings` 契约有 `projectId` + `validationStatus`(candidate/validated/discarded),可据此过滤。
- 复盘板块(T-116 后)= 单一视图(核心指标/趋势/漏斗/热门/评论/预测vs实际/AI 分析),AI 分析已读本项目 `review.analyze` 结果 + 诚实空态 +「帮我复盘」CTA。
- 知识库(T-113 后)= `/knowledge` 双 Tab(知识库 | 经验沉淀);经验 Tab 挂 `ExperiencePage`(整套裁决台)。

## 4. 设计

### §A 裁决进复盘 · T-118a

复盘板块 `/projects/<id>/review` 新增 **「本期经验」区**(建议置于 AI 分析卡下方或与之并列):

- 渲染**本作品的 candidate learnings**:复用既有 `AdjudicationQueue` 组件(采纳/不采→`evaluateLearning`、inline 编辑),数据 = `learnings.list`(**additive query 过滤** `projectId=<当前项目>` + `validationStatus=candidate`)。
- 空态诚实:本作品还没产经验候选 → 「点『帮我复盘』让编导从本期评论/指标提经验」+ 复用 T-116 的「帮我复盘」CTA(走既有 Copilot `review.analyze`)。
- **闭环**(顺带补 T-116 留的缺口):`review.analyze` 产的 `learning_list` 候选带 projectId → 落 candidate learnings → 本区读出裁决;采纳(evaluate→validated)后回流校准/选题(既有 `learnings.applications`/`calibration.suggestions` 链不动)+ 进知识库已验证库(§B 读同一表)。
- `review-workspace-data.ts` 装配层加读 candidate learnings(项目级)。

### §B 已验证经验进知识库 · T-118b

`/knowledge` 从双 Tab 收敛为**单一知识库视图**,经验作**只读一等类型**:

- **退役**经验 Tab(T-113 的 `knowledge-workspace-tabs` 双页签);`/knowledge` 回归单一库视图。
- 知识库读模型(`knowledge-data.ts` `buildKnowledgeDashboardViewModel`)**额外读** validated learnings(`learnings.list` validationStatus=validated,跨作品),合并进:
  - **左栏 CategoryPanel** 加「经验」分类(计数=validated learnings 数),与观点/证据/金句/问答并列。
  - **中栏「最近更新」** 混排:知识卡 + 经验条目按更新时间倒序,每条带类型 chip;**经验条目只读**(不带采纳/翻案,那是复盘的活),点开看详情/来源作品。
- **不在知识库裁决**:知识库只读展示已验证经验;所有裁决动作只在复盘。
- **[gate-F2] 分页规格(T-119 落此)**:「最近更新」混排(知识卡 + validated 经验)按 `updatedAt` 倒序,**10 条/页**(与项目列表 T-096 范式一致,最新在前);知识卡与经验条目共用同一分页上下文(不分开翻页)。若 `knowledge.list`/`learnings.list` 缺 page/pageSize,加 additive query(不改归属)。
- **[gate-F4] `ExperienceCaptureLink`(Copilot 手录一条经验)归宿**:并入知识库「记一条」入口(与已验证库同处)。**验收**:T-118b 后该入口指向 `/knowledge`,手录一条经验直接落 `learningType=experience` 的 validated 条目(手录=用户亲判,不经 candidate 裁决态);经验独立页的旧 CaptureLink 随 ExperiencePage 壳退役清除。

### §C 经验模块退役 · T-118c

- `/experience` 路由**保持 301** 到 `/knowledge`(T-113 已建;由指向 `?tab=experience` 改为指向 `/knowledge`,因 Tab 退役)。
- sidebar 经验 nav 已在 T-113 删,不动。
- 清理:`experience-page.tsx` / `experience-interactive-region.tsx` 中 `AdjudicationQueue` 迁往复盘后,`ValidatedLibrary` 迁往知识库读层;`ExperiencePage` 壳退役(或降级为薄封装);全仓清指向经验独立模块的残留跳转。
- 复盘页读 learnings 的既有区(analytics-review 里若有经验区)与 §A 统一,不重复。

### §D UI 边界设计(复盘板块「AI 分析卡」vs「本期经验区」)· [gate-F1]

复盘板块内两个语义邻近的区,必须让用户一眼分清「AI 只读要点摘要」与「可裁决的经验候选」:

| | AI 分析卡(T-116,已有) | 本期经验区(T-118a,新增) |
|---|---|---|
| **标题** | 「AI 要点 · 本期复盘摘要」 | 「本期经验 · 可采纳沉淀」 |
| **副标题(数据源标注)** | 「来源:帮我复盘生成的要点」 | 「来源:本作品复盘提炼、待你裁决」 |
| **数据源** | `review.analyze` 结果(`readProjectReviewInsights`,只读摘要) | candidate learnings(`learnings.list` projectId+candidate,可裁决) |
| **动作** | 无(只读) | 采纳 / 不采 / inline 编辑(`evaluateLearning`) |
| **空态** | 「本条视频还没生成 AI 复盘要点 → 帮我复盘」 | 「本条视频还没有可裁决的经验候选 → 帮我复盘(复盘会同时产要点 + 经验候选)」 |

- **视觉分隔**:两区用不同底色/分隔线明确切开(不并排贴在一起造成「一个区」的错觉);位置上「本期经验区」紧随 AI 分析卡但有明确区块标题分界。
- **一次「帮我复盘」两产**:review.analyze 一次跑既产 AI 要点(填 AI 分析卡)又产经验候选(填本期经验区)——同源不同消费,UI 上标清各自来源。
- **T-118a 验收加一条**:用户能清楚区分「AI 要点摘要(只读)」与「本期经验候选(可裁决)」——测试锁两区标题/data-slot 不同 + 经验区有采纳按钮、AI 卡无。

## 5. 数据与契约

- **零 schema / 零数据归属变更**。`learnings` 表(candidate/validated/discarded + projectId)不动。
- **契约 additive**(纯读过滤,不改归属→不需单独 gate,随实现):`learnings.list` 加可选 `projectId` + `validationStatus` query(与 T-116 给 `ai.tasks.list` 加过滤同款),backend repo/service/transport 三层下推;用户归属门始终最外层。
- 若 `learnings.list` 已支持这些过滤,则零契约改动,纯前端消费面迁移。
- **[gate-F3] review.analyze 闭环的契约前提**:§A 的闭环依赖「`review.analyze` 产的 `learning_list` 候选带 `projectId` 且落成 candidate learnings」。实现前**先核实**:`review-runner` 的 outputSchema/`recordCandidate` 是否已给 learnings 带上 task 的 `projectId`(勘查显 AI 任务带 projectId,但需坐实 recordCandidate 有把它写进 learning 行)。**若未带**,T-118a 随手补上(recordCandidate 传 projectId,非新 schema——learnings 表已有 projectId 列)。**T-118a 验收硬条件**:对某项目触发 `review.analyze` 后,`learnings.list(projectId=X, validationStatus=candidate)` 能**非空读出**(闭环落地验证,而非纸面声称)。

## 6. 切片(拆 BACKLOG Task 预告)

过 gate 后按此拆(每切片一条 BACKLOG,引用本 SPEC):

- **T-118a 裁决进复盘**:复盘板块加「本期经验」区(复用 `AdjudicationQueue` + candidate learnings 项目级读 + 空态 CTA);`learnings.list` additive projectId+validationStatus 过滤(若缺);验收:复盘页显本作品经验候选、采纳→validated、无候选诚实空态。
- **T-118b 已验证进知识库**:`/knowledge` 退役双 Tab、经验作只读类型进 CategoryPanel + 最近更新混排(validated learnings);验收:知识库经验分类计数真、最近更新混排、经验条目只读。**T-119 分页**在此落(最近更新 10/页)。
- **T-118c 退役清算**:`/experience` 301 指向调整、`ExperiencePage` 壳退役、死链清扫;验收:无经验独立模块残留入口、旧路由 301 不 500。

## 7. 验收标准

- 复盘板块能看到并裁决**本作品**的经验候选;采纳后 validated 经验出现在知识库经验类型。
- `/knowledge` 单一库视图,经验为只读一等类型(分类 + 最近更新混排 + 分页),**无裁决动作**。
- `/experience` 301 到 `/knowledge`,不 500;经验独立模块无残留可点入口。
- **零 schema / 零数据归属变更**;全套测试(contract/backend/frontend)绿 + typecheck 0。

## 8. 风险与开放问题

- **R1(中)**:知识库读模型混入 validated learnings,需保证类型 chip / 计数 / 分页正确,且经验条目只读(不误挂裁决动作)。切片 T-118b 用测试锁「经验条目无采纳按钮」。
- **R2(低)**:复盘板块经验区与 T-116 的 AI 分析卡语义邻近(都关经验)——AI 分析=**要点摘要**(readProjectReviewInsights),本期经验区=**可裁决的经验候选**;二者数据源不同(review.analyze 结果 vs candidate learnings),需在 UI 上区分清楚(标题/位置),避免用户混淆。
- **OQ1**:采纳的经验回流校准(`calibration.suggestions`)入口现状在经验页,迁复盘后是否要在复盘板块给「已回流」提示?默认复用既有回流链,复盘板块显回流状态徽章;若体验不足再单议。
- **OQ2**:`ExperienceCaptureLink`(手录一条经验)归宿——并入知识库「记一条」还是复盘板块?倾向知识库(与已验证库同处),实现时定。
