# SPEC:复刻闭环补链(拆解要素/归因公式/复盘经验/选题上下文 串回创作)

> 状态:待 spec-review gate。改动性质=**数据归属 + 飞轮结构**(rule 7:须过审 verdict≠FAIL 才准开工)。
> 对应 BACKLOG:T-284(拆 4 切片 T-284a–d)。现状证据:[docs/research/2026-07-13-data-flywheel-linkage-research.md](../../research/2026-07-13-data-flywheel-linkage-research.md)。
> 定位对照:直接服务「品味对齐飞轮为主轴」(见 docs/产品定位.md + 记忆 skill-driven-agent-flywheel-direction)——把「拆解爆款 → 复刻 → 发布 → 复盘 → 再选题」真正接成一个自转的环。合定位。

## 1. 问题(一句话)

选题级数据已串联(拆解/归因产的**新选题**进候选池→选题页),但「拆解 → **复刻/模仿**」的**要素级回流**断了:爆款「为什么爆」的拆解、本账号「可复用公式」、复盘经验,都喂不回 `script.draft` / `topic.generate`。飞轮转了半圈就断。

## 2. 现成方案 / 在仓复用调研(reviewer 必查:别造轮子)

子代理已 codegraph 反证以下机制**已存在**,本 SPEC 一律复用,不新造:
- **candidate.card jsonb 列**(T-147/148):候选卡已有结构化 jsonb,可直接挂拆解要素,**G1 无需新表**。
- **learnings 全链**(schema/learnings.ts + learnings.service.ts):候选→validated 状态机、`getSuggestions`(validated-only)、`evaluateLearning` 晋级入口、`createLearning` 写入——**G2/G3 复用这条管线**,不新建"公式表读回"通道。
- **creative-context readers 声明式注入**(creative-context.ts + persistence-client.ts:2689-2958 + `resolveContextDeps`):加一个 facet reader 即可让新数据进生成中枢,**G1/G4 走这套**,不跨模块直连 repo。
- **topic.attribution 已有读 op** `topics.attributions.list`(transport:14,当前零 FE 调用):**G2 接线它做可见性**,不新写读 op。
结论:四条链全部靠"接线已有件",零新表(G1 用 jsonb 列)、零新 OSS。符合 verify-exists-before-building 铁律。

## 3. 逐链设计

### G1 — 爆款拆解要素回流(最痛,正对"拆解→复刻")

**现状**:`benchmark-teardown-runner.ts` 只取 `teardown.转化选题` → `createCandidate(source=benchmark)`;其余 5 段(钩子拆解/结构拆解/为什么爆/可借鉴点/适配建议)丢弃,host `void` 不建 ai_task(pc:5450)。

**设计**:
1. **落库(复用 jsonb,不新表)**:runner 把 5 段拆解写进它产的那条 benchmark 候选的 `candidate.card.teardown = {钩子拆解, 结构拆解, 为什么爆, 可借鉴点, 适配建议}`。他号拆解**只挂在候选上**,不进本账号 knowledge 库(避免污染"本账号资产";语义也不同:knowledge=原文保真,teardown=AI 分析)。
   - **[gate finding 4] 两步写**:`CreateCandidateInput` 无 card 字段(card 只在 `PatchCandidateInput`,candidate.service.ts:450),故 runner 需 `createCandidate` 拿到 id 后再 `patchCandidate(ctx, id, { card })` 补写(两次调用),拆 Task 时写清。
   - **[gate finding 5] 无 ai_task 轨迹继承**:benchmark-teardown 现状是 `void runBenchmarkTeardown(...)` fire-and-forget(pc:5450),不建 ai_task。G1 沿用此路径写 card,即"这条 card 由哪个 AI 任务写"无轨迹可查——本 SPEC 不改这层(既有事实),仅在此注明。
2. **携带(复刻语义)**:用户把这条 benchmark 转化选题**立项**成 project 时,把 `card.teardown` 复制进 `project.briefDetail.benchmarkRef`(或 project 级 jsonb)——即"这条是复刻自某爆款,原爆款的拆解在此"。
3. **回流(新 facet)**:creative-context 新增 `benchmarkRefBrief` reader(项目态,读 `project.briefDetail.benchmarkRef`),装配成「【对标参照·复刻用】原爆款为什么爆 + 结构拆解 + 可借鉴点」段,注入 `script.draft`(+ `planning.thesis/outline`)。让写文案时能"照这条爆款的结构/钩子逻辑,换我定位重做"。
- **诚实门**:注入段头标注「他号拆解·仅作结构参照,禁照搬原文案」(对齐 benchmark.teardown 的"绝不抄袭"硬约束)。

**验收**:立项一条 benchmark 复刻选题 → 该 project 写文案时,dispatch 步骤日志/prompt 里出现原爆款的「为什么爆/结构拆解」;非复刻 project 该段为空(不污染普通创作)。

### G2 — 可复用公式回流

**现状**:`topic.attribution` 的 `reusable_formula`/`structure_formula` 落 `topic_attributions` 表,唯一读 op 零 FE 调用,生成端不读 → 写完即沉。

**设计**:
1. **喂进生成(复用 learnings 管线)**:attribution runner 产出 `reusable_formula` 且有逐字稿依据时,**capture 成一条 learning**(title=公式一句话,insight=why_worked 依据)。这样它走**和 G3 同一条** learnings→creative-context→script.draft/topic 回流路,不新造第二条通道。
   - **[gate finding 3] 溯源走 insight 尾注**:`learnings` 表无 `sourceNote`/`attributionId` 字段(那是 knowledge 模块的字段)。仿 `captureEditDelta`(learnings.service.ts:397 把来源拼进 insight 文本)的惯例,把 `(来源:归因 attributionId=…)` 拼进 `insight` 尾部,不写进不存在的字段。
   - 默认落 `candidate`(不自动 validated;晋级策略见 G3)——因 attribution 是采集 job、无人工采纳步,不能凭 AI 一句话直接进生成(守确认门)。
2. **可见性(接线死读 op)**:把 `topics.attributions.list` 接进复盘/归因页,展示 reusable_formula/why_worked/structure_formula 明细(candidate.card.attributionId 的徽标点开可查),让"本账号可复用公式"看得见。

**验收**:跑一次 attribution → 对应 learning 候选出现在经验库(待裁决);归因页能点开看到公式明细。

### G3 — 复盘经验自转(让飞轮真转起来)

**现状**:learnings 默认 `candidate`,`getSuggestions` 只读 `validated`;candidate→validated 唯一入口 `evaluateLearning` 全靠人点(采纳队列)。两道人工闸 → 人不点=复盘对下次生成影响 0(除 2 条 seed)。

**[gate finding 1/2 打回] 原设计作废**:原拟"按 `confidenceScore≥0.7` 自动晋级"经代码核实是**空转**——`computeConfidence`(learnings.service.ts:299)只在 `evaluateLearning`(人工裁决)里调,`createLearning`/`promoteReviewInsight`/`captureEditDelta` 建 learning 时 `confidenceScore` 硬编码 0;且字段是 0-100 整数,与"0.7"量纲不符。故新 capture 的 learning 置信度恒为 0,阈值门永不触发。**必须换判据**,二选一(待用户拍板):

- **方案 G3-A(真自转·推荐)**:新建一个**真实证据强度**判据替代空转的 confidenceScore——只放行"**有真实数据背书**"的经验:review.insights 的 learning 若来自一条**已发布、有真实 metric_snapshots** 的作品复盘,attribution 的 learning 若有**逐字稿依据 + ≥N 条真实指标**,则该 learning capture 时打 `evidenceStrength=grounded` → 自动 `validated` 进生成;无真实数据背书(纯 AI 推断)→ 留 candidate 人工裁决。判据从既有数据(metric_snapshots / 逐字稿链接)在 capture 时计算,不新建表(加一个派生标志/枚举列)。**守宪法**:只有"扎在真实发布数据上"的经验自动流,凭空推断的仍卡人工门;第一道采纳门不动。
- **方案 G3-B(保守·reviewer 倾向)**:**不自动晋级**,candidate→validated 维持人工;只加"**强提醒 + 一键批量裁决**"(采纳队列显眼提示 + 批量通过按钮)降摩擦。零碰宪法,但飞轮仍需人点(半自动)。

**理由**:第一道门(采纳)已有人在场,第二道门是"额外质检"。G3-A 用"真实数据背书"替代"AI 自评置信度",既让飞轮真转、又不违"AI 产候选走确认门"(只放行有客观数据支撑的,不放行 AI 空想);G3-B 完全不碰门但达不到用户要的"自转"。

**验收(随选定方案定稿)**:G3-A → 采纳一条来自真实发布作品复盘的经验(有 metric_snapshots)→ 无需裁决,下次生成 prompt 出现它;无数据背书的经验仍留 candidate。G3-B → 采纳队列有强提醒 + 批量裁决可一键放行。

### G4 — 选题不裸奔

**现状**:`runTopicGenerateV2` 传 `projectId=null`(topic-task-adapter.ts:193)→ 所有项目态 facet(thesis/contract/outline/brief/materials)结构性拿不到,选题只吃账号态 4 源。

**设计**:出题 dispatch 在**有项目上下文**时(项目内选题面 / chat scoped 到某 project)透传真 `projectId` 给 `assembleCreativeContext`,让选题站在该项目已有的策划/立项沉淀之上;**账号态选题会(无 project)保持 null**(此时本就无项目态数据,行为正确)。纯 plumbing,核实各 dispatch 调用点能拿到 projectId。

**验收**:在一个已走过立项/策划的 project 内出题 → 选题 reason 体现项目态约束(如遵守立项核心信息);账号态选题会行为不变。

## 4. 关键决策(reviewer 重点审 + 用户 SPEC review 可推翻)

- **决策 A(G1 落库位置)**:他号拆解要素挂 **candidate.card jsonb + project.briefDetail**,**不进 knowledge 库**。理由=避免污染本账号资产 + 语义不同 + 零新表。**备选**=新建 benchmark_teardowns 表(更规范但更重)。推荐前者。
- **决策 B(G3 晋级策略)**:【gate 打回原方案】原"confidenceScore 阈值自动晋级"空转作废(见 §3.G3)。改为二选一:**G3-A**(真实数据背书才自动晋级,守宪法+真自转,推荐)/ **G3-B**(不自动晋级,强提醒+批量裁决,零碰宪法)。**用户 2026-07-13 拍板 = G3-A**(用"客观真实数据"而非"AI 自评"做判据,不违确认门本意;凭空 AI 推断仍走人工门)。

## 5. 影响面 / 风险

- G1 改 benchmark-teardown-runner + creative-context + brief 携带链;风险=复刻 ref 携带链断则 facet 恒空(加单测覆盖立项携带)。
- G2/G3 动 learnings 写入/晋级;风险=自动晋级阈值太松→低质经验污染生成(阈值可配 + 数据背书条件双保险 + 归因可见性让用户能查)。
- G4 动 topic dispatch 传参;风险最低(账号态保持 null 即回归安全)。
- 全程守铁律②(AI 产候选走确认门,除 G3 明确放开的第二道闸)、多模型可配、诚实门(他号拆解禁照搬)。

## 6. 拆切片(SPEC → Task,进 BACKLOG T-284a–d,各 0→1)

- **T-284a(G1)**:teardown 5 段落 candidate.card + 立项携带 briefDetail.benchmarkRef + creative-context `benchmarkRefBrief` facet → script.draft/planning(诚实门段头)。
- **T-284b(G2)**:attribution reusable_formula → capture learning(candidate)+ 归因页接线 `topics.attributions.list` 展示公式。
- **T-284c(G3)**:learnings candidate→validated 置信度自动晋级(阈值可配,默认 0.7 + 数据背书条件)+ 低置信仍人工裁决 + 单测。
- **T-284d(G4)**:topic.generate dispatch 项目上下文透传 projectId(账号态保持 null)。
四切片相互独立、可各自验收;非阶段化减法。

## 7. spec-review gate 记录

- **审查**:2026-07-13,跨模型 reviewer(Sonnet,与本会话 Opus 异构;review_mode=cross-model 同族,非 MiniMax 但满足模型多样性)。product+architect 角色,codegraph/读码核实。
- **verdict:CONCERNS**(6 findings,全部代码实证)。处置:
  - finding 1/2(blocker/major,G3 confidenceScore 空转 + 碰宪法)→ **接受**,原 G3 方案作废,改 G3-A/G3-B 待用户选(§3.G3、§4.B)。
  - finding 3(G2 sourceNote 混模块)→ **接受**,改 insight 尾注(§3.G2)。
  - finding 4(G1 create+patch 两步)→ **接受**,已注明(§3.G1)。
  - finding 5(G1 无 ai_task 轨迹)→ **接受**,风险注明(§3.G1)。
  - finding 6(G3 验收依赖空信号)→ **接受**,验收随 G3 方案定稿(§3.G3)。
- **决策 A**:reviewer 接受(candidate.card+briefDetail,不进 knowledge)→ **采纳**。
- **决策 B**:reviewer 判"退备选";用户目标是自转 → 摆 G3-A(真数据背书自动晋级)/ G3-B(不自动、强提醒批量裁决)由用户拍板。
- **可开工**:T-284a(G1)/T-284b(G2)/T-284d(G4)gate 已清(minor 已 fold)。**T-284c(G3):用户 2026-07-13 拍板选定 G3-A**(有真实数据背书才自动晋级),方案已定,可开工。
- **交接**:现状/预期效果 + 前后对比图见 [docs/research/2026-07-13-data-flywheel-linkage-handoff.md](../../research/2026-07-13-data-flywheel-linkage-handoff.md)(用户将由其他 agent 接手实现)。
