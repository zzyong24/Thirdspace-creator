# CreatorOS 七步整合设计 spec

> 状态：**已采纳**（2026-06-21，user 确认；见 `orchestrator/DECISION_LOG.md` DEC-012）。分期按 §8。
>   落地时序：① 「变现加权」方向改造（§2.0/§4.4/§6.2）赶在 Wave 2/3 启动前焊进基础模块计划（content_role / metric_key 扩展 / 变现 rubric 维度 / 转化列）；② positioning/monetization/candidate/calibration/platform-account/content-calendar 6 个新模块作为基础 16 模块（Wave 1-4）之后的 Wave 5-7，按 §8 优先级；③ ID 务实续号（不走 C-1 正式冻结仪式）。
> 日期：2026-06-21
> 关联文档：[数据模型](./CreatorOS-data-model.md)、[存储与业务逻辑](./CreatorOS-storage-and-business-logic.md)、[实施计划](./CreatorOS-implementation-plan.md)、[Backend SPEC](../backend/SPEC.md)、[Module Architecture](../backend/MODULE-ARCHITECTURE.md)、[Frontend SPEC](../frontend/SPEC.md)
> 控制工件：`orchestrator/ID_REGISTRY.md`、`orchestrator/DECISION_LOG.md`（截至 DEC-011）

## 0. 文档目的与范围

### 0.1 背景

CreatorOS 现有设计把一个内容选题的生命周期（Research→Planning→Script→Production→Publishing→Review）建得很扎实，但它默认使用者"已经知道自己是谁、要卖什么"。真实使用者是一个**以变现为目标的自媒体创作者**（创业者逻辑：看转化率，不是只看播放量），目标人群是"想用 AI 但不会动手的普通人/老板/职场人"，已有产品：1v1 咨询、工作流定制、知识星球、抖音付费社群。

用一套"七步做自媒体"框架做标尺审计 CreatorOS，发现它在 ③④⑤⑥ 很强，但 **②定位、③选题候选池、⑦变现 是结构性空白**，且整个指标与复盘闭环只面向流量、不面向转化——这与使用者的根本目标背道而驰。

### 0.2 本 spec 要做什么

在**不改动 CreatorOS Project 生命周期主干**的前提下：

1. 前面加一个"定位闸"（`positioning` 模块）。
2. 后面加一个"变现环"（`monetization` 模块）。
3. 中间加一个"选题候选池"（`Candidate` + `AudienceSignal`），并把外部的内容校准闭环（盲预测 + 可进化 rubric）内化进 Reviews/Analytics。
4. 横切补齐：多账号、发布节奏、阶段模板化、AI 阶段接力。
5. 把指标体系从"流量加权"升级为"变现加权"。

### 0.3 不做什么（YAGNI）

- 不重构现有 6 阶段主干，不拆微服务。
- 不引入并行的第二套内容系统（cheat-on-content 等仅作为**能力来源被吸收**，不作为独立系统保留）。
- 不在 ID 基线冻结前落地任何新模块的持久化代码（见 §1）。

---

## 1. 前置条件与整合硬约束（动工前必读）

> 这些来自 `orchestrator/` 控制工件的现状。**违反任意一条都会让新模块撞上既有契约或加重当前 FAIL 的 gate。**

### C-1　先冻结 ID 基线，再开新模块 ID 段
01–09 规格仍处 `needs-user-confirmation`（OPEN-001）。`ID_REGISTRY.md` 明确"确认后不得 renumber"。

**约束**：本 spec 引入的所有新 `FR / ENT / FLOW / PAGE / COMP / API / NFR` ID，必须在 OPEN-001 批量签字、现有 ID 段冻结**之后**，再追加为新段，不得插入现有段中间。本文中所有新 ID 暂以 `FR-2xx / ENT-1xx` 等占位，签字后统一分配。

### C-2　新模块必须走 DEC-011 证明的落库样板
现状 `consistency_gate = FAIL`（每个 backend-bearing FR 缺 API + backend TEST）。已验证可跑的路径是 Projects 垂直切片：`@creatoros/contract` op → `HttpTransport` → `/api/v1/dispatch` → Drizzle schema + repository（pglite）→ render。

**约束**：每个新模块从第一天就要：① 在 `@creatoros/contract` 注册 op；② 写 Drizzle schema + repository；③ 加入 `PERSISTED_OPS`；④ 配 service/contract/integration 三类测试。**禁止只做前端 fixtures 层**（否则重演 CODE_RECONCILIATION 的"前端跑前面、后端缺一半"）。

### C-3　选题候选池复用 AI 候选确认流，不造第二套状态机
系统已定（DEC-009）：`submit_candidate` 是 AI 唯一写入口、`confirmResult` 全程 AI-free、`AITaskStatus` 含 `awaiting_confirmation`（FR-063、ENT-049/050）。

**约束**：`Candidate`（选题候选）在概念上等同"AI 产出的待确认候选"。当 Candidate 由 AI 生成（trends/对标/扩展）时，**必须复用 `submit_candidate` → `awaiting_confirmation` → `confirmResult` 机制**，由 AITaskResult 落为正式 Candidate；人工录入的 Candidate 走普通 service 写入。不得为 Candidate 新建平行候选状态机。

### C-4　校准闭环复用 Ingestion 既有契约
已有 `ExternalSource`（令牌隔离）+ `IngestionRun` + `IngestionError` + 双重幂等键 `(source, idempotency_key)` / `(run, record_key)`（FR-047/048/049、FLOW-019/020、NFR-009/010/018）。GAP-005：外部 ingestion 是 backend-only、无 UI owner。

**约束**：盲预测后的"实际指标回收""评论/需求抓取"必须复用 `ExternalSource` + `IngestionRun` 幂等写入，不得新造写路径。新增的 `AudienceSignal` ingestion 通道沿用同一幂等契约。RISK-005 暴露过 `ingestionRunId` 悬空 bug——新通道接入时保证引用的 IngestionRun 真实存在。

### C-5　前端约束
新页面必须：server 外壳 + `*-interactive-region.tsx` island；只用 `ui/*` 原语与现有 AppShell/Sidebar/TopHeader；render/selectors/fixtures 中**禁止 `Date.now` / `Math.random` / `fetch`**（确定性测试）。视觉基线尚未重基线（R2-9），新页面要么等 stage-12 重基线、要么显式标注"暂不纳入视觉门禁"。

### C-6　先对齐 manifest 再动工
`ARTIFACT_MANIFEST.yaml` 的 `16-backend-tdd` / `consistency_gate` 字段滞后于 DEC-010/011。动工前先把 manifest/frontier 与 DECISION_LOG 对齐，避免新模块基于"后端还没开始"的过时假设规划。

---

## 2. 战略对齐：七步 → CreatorOS 模块映射

> 主干原则：**CreatorOS 是唯一真相源；cheat-on-content 等外部工具不作为并行系统保留，其能力被吸收为 CreatorOS 模块能力；TzFilm 抖音抓数退化为 Ingestion 的一个 ExternalSource adapter。**

| 七步 | CreatorOS 承载 | 本 spec 动作 |
|---|---|---|
| ① 认识自己 | `positioning.CreatorProfile` | 新增（轻量，并入 §3） |
| ② 确定定位 | `positioning` 模块 | **新增 §3** |
| ③ 建立选题库 | `Candidate` + `AudienceSignal` + Research/Ingestion | **新增 §5**；吸收 trends/对标/recommend |
| ④ 内容形式/写文案 | Script/Artifacts（已强） | 吸收 seed/钩子模板为 AI 动作（§7.4） |
| ⑤ 发布与运营 | Publishing/Analytics + `PlatformAccount` + `ContentCalendar` | 横切补齐 §7.1 / §7.2 |
| ⑥ 用 AI 提效 | `ai` 模块 + AI 阶段接力协议 | §7.4 |
| ⑦ 连接产品与变现 | `monetization` 模块 | **新增 §4（最高优先级）** |

### 2.0 贯穿性方向改造（最重要）

**rubric / 指标 / 复盘的优化目标必须从"流量加权"改为"变现加权"。** 预测和评分的对象不是"会有多少播放"，而是"会不会带来精准人群、能不能为某个产品铺路、能不能产生线索/咨询/成交"。否则系统只是更科学地优化了错误的指标。具体落点见 §4.3（指标扩展）、§6.2（rubric 维度）。

---

## 3. 新增模块：`positioning`（七步 ①②）

### 3.1 职责
承载账号级"我是谁 / 帮谁 / 解决什么 / 怎么表达 / 卖什么"，并作为下游选题、评分、变现的**上游约束源**。

### 3.2 实体

| 实体 | 关键字段 | 说明 |
|---|---|---|
| `CreatorProfile` | user_id、persona、领域/赛道、目标人群、差异化、能力清单(jsonb) | 账号自我认知（七步①）。user 级单条或少量。 |
| `PositioningStatement` | profile_id、one_liner（我是谁+帮谁+解决什么+怎么表达）、keywords[3]、product_anchor_ids[]、version_number、created_at | **不可变版本链**（沿用 ArtifactVersion 风格），记录定位演进。定位靠测试迭代，版本化保留。 |
| `PositioningGate`（值对象/服务，非表） | — | 给定一个 Candidate/Project，输出"是否强化主线"的契合度评分 + 理由。 |

### 3.3 关联与机制
- `Project.positioning_statement_id`（FK，可空）：项目锚定的定位版本。
- **闸门机制**：Candidate 晋升为 Project 前、Project 进入 Planning 前，过一次 `PositioningGate`，输出 `positioning_fit`（0–100 + 理由）。不过线的在 UI 标灰/降权（不强制阻断）。
- 定位演进回流：`ReviewInsight` 可触发"建议修正定位"，生成新的 `PositioningStatement` 版本。

### 3.4 前端
- 新增「定位中心」全局页面（Sidebar 第 2 项，排在「项目」前）：展示当前定位、关键词、产品锚、历史版本。
- 在 New Project / Research / Planning / Review 注入「定位契合度」Badge（复用 `StatusBadge`）。

---

## 4. 新增模块：`monetization`（七步 ⑦ · 最高优先级）

### 4.1 职责与设计原则
把"内容 → 信任 → 产品 → 成交"建成一等公民，让系统能回答"哪条内容带来哪笔线索/成交"，把复盘从"看量"升级到"看率"。

三条设计原则（来自抖音→私域变现的现实约束）：

1. **漏损现实**：抖音不能放链接、不能提价、成交在微信/线下且延迟、旅程多触点。归因**天然断链**，目标是"尽量归因 + 诚实留 unattributed 桶"，**不追求 100% 自动归因**。
2. **不重造 SCRM，去集成它**：真正的 Lead 跟进/成交事实跑在外部（飞书问卷、未来企微 SCRM）。**CreatorOS 只拥有「内容 ↔ 暗号/渠道码 ↔ Lead」这层映射**，成交事实经 §C-4 的 `ExternalSource`/Ingestion 拉进来或人工登记。
3. **变现方式会变**：产品与价格解耦，产品可增/可退/可改价而不破坏历史归因。

### 4.2 柔性产品模型（应对"变现方式会变"）

| 实体 | 关键字段 | 说明 |
|---|---|---|
| `Product` | user_id、name、`kind`(柔性，user 自定义)、`tier`(可空标签：引流/入门/核心/高端，仅排序视图用)、delivery_weight(轻↔重)、target_persona、status(active/retired) | **不硬编码类型**。1v1/星球/社群/工作流定制今天有，明天换课程/U盘/SaaS 不改 schema。 |
| `Offer` | product_id、price、有效期、version、说明 | **价格挂 Offer 不挂 Product**。改价/活动只加新 Offer，历史成交记 offer_id+金额快照，不被篡改。 |

### 4.3 归因层（业界标准打法 · 渐进式）

> 行业共识：**确定性手段（暗号/渠道码/问卷）+ 概率模型（多触点 time-decay）+ 诚实 unattributed 桶** 三者混用（即隐私新政后的主流归因思路）。

| 实体 | 关键字段 | 说明 / 分期 |
|---|---|---|
| `Lead` | user_id、source(`survey`/`manual`/`entry_code`/`wecom`)、survey_source?、entry_code_id?、attributed_content_id?、attribution_method、attribution_confidence(high/med/low)、status | 线索=人，内容与成交之间的桥。**P0：飞书问卷 ingest + 人工登记**。 |
| `ConversionEvent` | lead_id、product_id、offer_id?、event_type(`profile_visit`/`follow`/`lead`/`inquiry`/`signup`/`purchase`/`repurchase`)、value、occurred_at | **挂在 Lead 上，不被迫直接绑一条内容**。经 Ingestion 或人工登记。 |
| `EntryCode` | code、绑 content_output_id 或 campaign、type(暗号/关键词/渠道活码/专属问卷) | 私域版 UTM。**P1：暗号/关键词；P2：企微渠道活码**。 |
| `Touchpoint`（可选） | lead_id、content_output_id、occurred_at | 记录 Lead 多次内容触点，喂 time-decay 归因。**P2**。 |
| `AttributionModel`（配置） | type(`time_decay`/`position_based`/`last_touch`)、参数 | **默认 time-decay**（创作者旅程多触点，禁用 last-touch 误导）。 |

### 4.4 内容绑定：意图层 vs 实绩层（回答"内容关联怎么连"）
- **意图层（创作时声明·计划）**：`ContentOutput.content_role`（`traffic`流量/`trust`信任/`conversion`转化）+ 关联表 `ContentOutputProduct`（这条内容为哪个产品铺路）。
- **实绩层（测量·会漏）**：`Lead.attributed_content_id` + `attribution_method`/`confidence`，`ConversionEvent` 经 Lead 回溯到内容。
- 二者分开：意图是你的计划，实绩是市场的回答，差距本身就是复盘洞察。

### 4.5 量化口径（回答"怎么量化变现"）：三层 + 诚实漏损
- **个体高置信**：有暗号/问卷/自报的 Lead → 精确归因到内容，算 `revenue_attributed`（带 confidence）。
- **聚合相关性**：归不了因的大多数 → 按周期 lift（这批"信任内容"发布后咨询/成交量怎么动；`content_role` 配比 vs 线索/成交曲线）。
- **诚实 unattributed 桶**：明确 X% 成交无法归因，**不强行 100% 分配**。
- 指标：每条内容→lead/咨询/成交数+归因营收(带置信)；每产品→漏斗+ROI；每周期→内容类型对转化贡献。

### 4.6 指标体系扩展（变现加权的物理基础）
- `MetricValue.metric_key` 在现有 views/likes/comments/shares/followers_gained/ctr/completion_rate 之上新增：`profile_visit`、`cta_click`、`private_message`、`lead`、`inquiry`、`conversion`、`revenue`。
- `AudienceSnapshot.dimension_type` 新增 `intent`、`paying`。
- `Learning.learning_type` 新增 `conversion_pattern`、`offer_insight`。

### 4.7 前端
- 新增「变现 / 漏斗中心」全局页面（Sidebar 变现项）：跨内容线索来源归因、产品挂载、成交漏斗、ROI、unattributed 占比。
- 「转化/线索」提升为 `Publishing Center` 的 `PublicationPerformanceRow` 与 Dashboard `SummaryMetrics` 的一等指标列（与播放量并列）。
- Review 的 `ConversionFunnel` 升级为可下钻到 `ConversionEvent`。
- **P0 录入交互**：飞书问卷结果列表 + 手工"登记一条线索/成交"表单（关联内容、置信度自选）。

### 4.8 模块内分期
- **P0（先做）**：柔性 `Product`/`Offer` + `Lead`/`ConversionEvent` + 飞书问卷 Ingestion adapter + 手工登记 + 默认 time-decay `AttributionModel` + §4.5 三层口径 + §4.6 指标扩展。
- **P1**：`EntryCode`（暗号/关键词）。
- **P2**：企微渠道活码 Ingestion + `Touchpoint` 多触点归因。

---

## 5. 选题情报层：`Candidate` + `AudienceSignal`（七步 ③）

### 5.1 问题
现状"每个选题 = 一个重 Project"，缺 Project 之上的轻量候选层；最高价值的"客户问题/评论区需求"不是一等输入（D-001 还把评论降级为备注占位）。

### 5.2 实体

| 实体 | 关键字段 | 说明 |
|---|---|---|
| `Candidate` | user_id、title、angle、source(`trend`/`benchmark`/`demand`/`idea`)、content_role、product_anchor_id?、positioning_fit、predicted_score、demand_count、status(`pool`/`promoted`/`dropped`)、ai_task_id? | Project 之上的轻量选题。AI 生成的走 §C-3 候选确认流。 |
| `AudienceSignal` | user_id、source(`comment`/`dm`/`consultation`/`review`)、raw_text、demand_tag、paying_intent、linked_candidate_id?、ingestion_run_id | **一等需求输入**。经 Ingestion 写入（含 TzFilm 抖音评论）。`Candidate.demand_count` 由它聚合。 |
| `TopicPromotion`（动作记录） | candidate_id、project_id、promoted_at | 候选→Project 的晋升记录（类比 `promoteReviewInsight`）。 |

### 5.3 吸收的外部能力（落为 AI 动作 / Ingestion adapter）
- `cheat-trends`（热点源）→ 批量生成 `Candidate`（走候选确认流）。
- `cheat-learn-from`（对标拆 pattern）→ 生成 `Candidate` + 写入 `Learning`。
- `cheat-recommend`（rubric 排序）→ 按**变现加权 rubric**（§6.2）对 `Candidate` 排序，取 top N。
- `cheat-seed`（一次深挖一个选题）→ Candidate → `promote` → Project（Research 阶段）。

### 5.4 机制
- 每个 Candidate 自动过 `PositioningGate`（§3.3）+ 标 `content_role`/`product_anchor_id`——**选题第一步就被定位与变现双重过滤**。
- `Candidate → promote → Project`：只有决定要做的才开重量级 Project，候选池保持廉价。

### 5.5 前端
- 新增「选题候选池」页面（作为 Projects 页前置 Tab 或独立 `/topics`）：卡片化收集、按 predicted_score/positioning_fit/demand_count 排序、「晋升为 Project」按钮。
- 新增「评论区 & 客户问题」采集面板（`AudienceQuestionsCard`）：把 `AudienceSignal` 一键转 Candidate。

---

## 6. 校准闭环：`Prediction` + `Rubric`（强化七步 ⑤，吸收 cheat 核心）

### 6.1 问题
现状只有事后 `MetricSnapshot→Review→ReviewInsight→Learning` 的复盘链，缺 cheat 最值钱的两件事：**发布前的不可变盲预测**、**随复盘进化的量化 rubric**。`Learning.confidence_score` 是静态字段，不随效果自动演进。

### 6.2 实体

| 实体 | 关键字段 | 说明 |
|---|---|---|
| `Rubric` + `RubricVersion` | 维度定义、权重、version_number（不可变版本链） | 评分公式。**维度按变现加权**：hook 强度、利他性、人群匹配、CTA 清晰度、为产品铺路程度——而非播放量预估。 |
| `Prediction` | content_output_id 或 publication_id、rubric_version_id、predicted_metrics、predicted_conversion、confidence、locked_at | 发布前写死的盲预测。**创建后锁定不可改**（DB 约束 + 沿用 ArtifactVersion 不可变范式，等价 cheat-predict 的 hook）。 |
| `CalibrationResult` | prediction_id、actual_metrics、deviation、created_at | 预测 vs 实际偏差，自动喂回更新 rubric 与 `Learning.confidence_score`。 |

### 6.3 闭环
`Score(rubric) → Blind-Predict(锁死) → Publish → Retro(T+N 经 Ingestion 抓数+抓评论) → CalibrationResult → RubricVersion bump / 更新 Learning → 下一个 Candidate 排序`。

### 6.4 归属
`calibration` 可作为独立模块，或并入 `reviews` + `learnings`。Prediction 的实际指标回收复用 §C-4 的 Ingestion 契约。

### 6.5 前端
- 新增「数据回流任务」：发布后 N 天自动在 Dashboard `TodoCard` 生成"回来看 XX 的数据"，直达该 Project 的 Review。
- Review 增加「复盘沉淀」动作：一键 `PromoteToExperience` + 提示"是否据此修正定位/新增选题"，形成飞轮。

---

## 7. 横切增强

### 7.1 多账号 / 矩阵号　`PlatformAccount`
新增实体 `PlatformAccount`（platform、account_handle、secret_reference、follower_baseline）。`Publication.account_id`、`ProjectTargetPlatform.account_id`、`MetricSnapshot`（经 Publication）归到账号。**理由**：多账号涨粉/转化归因、矩阵号运营是创业者标配；现有 `account_reference` string 撑不住。

### 7.2 发布节奏 / 内容日历　`ContentCalendar`
新增 `ContentCalendarEntry`（account_id、planned_at、content_output_id? / candidate_id?、status `planned`/`published`/`missed`）+ `PublishingCadence`（account_id、frequency、preferred_slots）。**理由**：⑤运营现在只有孤立 `scheduled_at`，答不了断更/节奏达成率。

### 7.3 阶段模板化（解决 6 阶段焊死）
把 `OutputStage` 的固定四段改为**按 content_type 可配置的 `StageTemplate`**。图文/音频/口播跳过/简化"Production 导出"段，且不计入进度分母。**理由**：现在图文 Output 的 Production 永远空转却计进度，进度语义失真；未来加阶段需改 schema 迁移全表。
> 注：这是对主干的"配置化"而非"重构"，需评估对已落库 Projects 切片的迁移成本，**可放 P2**。

### 7.4 AI 阶段接力协议（七步⑥连续性）
- 定义产品级「AI 阶段接力协议」：让全局 Copilot 与各页 AI 卡**共享当前 Project + 阶段 + 定位上下文**，跨阶段记住上一步。（现 `AGENT-PROTOCOL.md` 只覆盖开发期 agent，不覆盖产品内 AI——这是盲区。）
- `AITask.task_type` 显式化为 `AICapability` 枚举绑定阶段+用途：`research_summarize` / `topic_generate` / **`topic_score`**(对齐 rubric 盲预测) / `script_draft` / **`platform_adapt`**(一稿多平台改写) / `conversion_copy` / `review_analyze`。
- 各页 AI 建议卡补「采纳→落地」交互（Apply 按钮）：建议直接插入正文/生成下一步任务。
- 吸收 `cheat-seed` 的"一次深挖一个选题"+ 结果导向钩子模板，作为 Script/Planning 的 AI 动作。

### 7.5 工程债（来自后端审计，随相关模块落地时一并修）
- **并发版本号**：`(artifact_id, version_number)` 等序号在行锁/序列下分配，补并发测试（现 TDD-PLAN 缺）。
- **循环外键插入顺序**：`Artifact.current_version_id` ↔ `ArtifactVersion.artifact_id` 等，明确首版本插入顺序与临时 NULL 策略（用 deferred constraint）。
- **多态外键孤儿**：`EntityTag`/`ProjectActivity`/`AITaskReference`/`Notification`/`SearchDocument` 增 `cleanupOrphans` job + 实体软删除时发 domain event 标记失效。

---

## 8. 落地优先级与分期

> 按对使用者北极星（变现）的影响排序。前三项决定系统把用户推向"量"还是"率"。

| 阶段 | 内容 | 依赖 |
|---|---|---|
| **P0** | §4 `monetization` 的 P0 子集（柔性 Product/Offer + Lead/ConversionEvent + 飞书问卷 ingest + 手工登记 + §4.6 指标扩展）+ §6 校准闭环 & 变现加权 rubric | C-1 ID 冻结、C-2 落库样板 |
| **P1/P2** | §4.8 归因升级（EntryCode 暗号→企微渠道活码→Touchpoint 多触点） | P0 Lead/ConversionEvent |
| **P0** | §5 `Candidate` + `AudienceSignal`（复用 C-3 候选流、C-4 Ingestion） | 同上 |
| **P1** | §3 `positioning` + 全局契合度闸 | P0 的 product/rubric |
| **P1** | §7.1 `PlatformAccount` + §7.2 `ContentCalendar` | — |
| **P2** | §7.3 阶段模板化（迁移成本高）+ §7.4 AI 接力协议 + §7.5 工程债 | 评估对已落库切片影响 |

---

## 9. 验收（七步闭合自检）

整合完成后，系统应能回答以下问题——每条对应一个七步缺口的闭合：

1. ②　"这条选题符合我的账号定位吗？"——`PositioningGate` 给分。
2. ③　"我有多少条按变现潜力排序的待选选题？最近用户在评论里反复问什么？"——`Candidate` 排序 + `AudienceSignal` 聚合。
3. ④　"AI 能基于我的定位和这条选题直接出一版结果导向的口播稿吗？"——`script_draft` + 定位上下文。
4. ⑤　"我这周该发什么？哪个账号断更了？"——`ContentCalendar` + `PlatformAccount`。
5. ⑤校准　"我发布前预测准不准？我的判断标准在进化吗？"——`Prediction` vs `CalibrationResult` → `RubricVersion`。
6. ⑦　"哪条内容带来了最多咨询/成交？这条内容为哪个产品铺路？"——`ConversionEvent` + `ContentOutputProduct`。
7. 方向　"系统在帮我优化播放量，还是转化率？"——指标与 rubric 均为变现加权（§2.0 / §4.4 / §6.2）。

---

## 附录 A：被吸收的外部能力映射

| 外部来源 | 原能力 | 落为 CreatorOS 的 | 备注 |
|---|---|---|---|
| cheat-on-content | cheat-trends | `Candidate`(source=trend) 生成 | 走候选确认流 |
| cheat-on-content | cheat-learn-from | `Candidate`(source=benchmark) + `Learning` | — |
| cheat-on-content | cheat-recommend | `Candidate` 按变现 rubric 排序 | §6.2 |
| cheat-on-content | cheat-seed | Candidate→promote→Project | §5.3 |
| cheat-on-content | cheat-predict（不可变盲预测） | `Prediction` | §6.2，DB 锁定 |
| cheat-on-content | cheat-score / rubric bump | `Rubric`/`RubricVersion`/`CalibrationResult` | 变现加权 |
| cheat-on-content | cheat-persona | `AudienceSnapshot` + `CreatorProfile` | — |
| cheat-on-content | cheat-retro / data-refresh | Ingestion + `CalibrationResult` | 复用 ExternalSource |
| TzFilm 抖音工具 | 抖音抓数 + 抓评论 | `ExternalSource` adapter → MetricSnapshot / `AudienceSignal` | §C-4 幂等 |
