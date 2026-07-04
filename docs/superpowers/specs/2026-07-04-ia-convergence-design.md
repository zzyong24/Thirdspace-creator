# IA 收敛设计(校准集成 + 知识库/经验合并 + 任务中心改名)

> 状态:草稿(待 spec-review gate)。作者:Claude(Opus 4.8)。日期:2026-07-04。
> 触发:用户 2026-07-04 三条 IA 指令 —— 「把校准集成到项目流程,不需要单独加模块」「把知识库和经验沉淀合并」「把任务中心改成自动化」。
> 对应 BACKLOG:T-112(校准集成)/ T-113(知识库+经验合并)/ T-114(任务中心改名)。
> 关联真值:[产品定位](../../产品定位.md)、[稿面工作台重做 SPEC](2026-07-02-draft-workbench-redesign.md)、[AI 进 Copilot 收敛 SPEC](2026-07-04-ai-into-copilot-convergence.md)。

## 0. 用户拍板(2026-07-04,录)

三处设计岔口经 AskUserQuestion 由用户裁决:

1. **知识库 + 经验沉淀合并** → 用户「你建议怎么实现」授权我定:**以「知识库」为主,经验沉淀并入为一个 tab;knowledge / learnings 两张表不动,只合并导航 + 页面外壳**(方案 A:改动最小、可逆、不动数据归属)。
2. **校准去独立模块后入口** → 用户「你建议怎么实现」授权我定:**删独立 `/calibration` 中心页 + 导航项;校准能力只走稿面盲预测(`blind-predict-row`)+ Copilot 对话诊断(`calibration.diagnose` 深链)**(方案 A:现有挂载已覆盖,独立中心冗余)。
3. **任务中心 → 自动化** → 用户明确:**纯改名**(导航项 + 页标题 + 相关文案「任务中心」→「自动化」;`/automations` 路由与功能范围不变)。

## 1. 背景与目标

现网侧栏 `PRIMARY_NAV`(`frontend/src/components/shell/sidebar.tsx` L67-86)有四个相关顶级项:校准 `/calibration`、知识库 `/knowledge`、任务中心 `/automations`、经验沉淀 `/experience`。问题:

- **校准是独立顶级模块**,但校准=对一条作品做盲预测/诊断,天然属于**作品创作流程**;而稿面已挂 `blind-predict-row`(T-055 B2)、Copilot 已深链 `calibration.diagnose`(T-103a/c),独立 `/calibration` 中心页与之**重复**,违「校准集成进项目流程」的意图。
- **知识库与经验沉淀是两个并列顶级模块**,但二者本质都是「沉淀下来、可复用的认知」(知识库=知识卡/弹药/金句;经验沉淀=复盘裁决出的经验条目)。并列两个入口分散注意力,应合并为单一「知识库」。
- **「任务中心」命名**与其真实职能(定时采集/自动化作业)不符,用户要求对齐为「自动化」。

**目标**:侧栏顶级项从四项收敛为两项(知识库、自动化),校准退役为项目内能力,IA 更聚焦;**零数据迁移、零后端 schema 变更**。

## 2. 宪法对照(是否合定位)

- 校准集成进作品流程 = 强化「以作品为中心的创作编排」主线,合定位。
- 知识库+经验合并 = 单一「认知复用」入口,减少并列模块的认知负担,合定位(飞轮的「沉淀→复用」环收口到一处)。
- 任务中心改名 = 术语对齐(诚实/一致性),合定位。
- **数据归属不变**:knowledge / learnings / scheduled_job / calibration 各表与 op 全部保留;本 SPEC 只动**前端 IA(路由 + 导航 + 页面外壳)+ UI 文案**,不改契约/后端/数据模型。故本 SPEC 属「IA 变更」需过 spec-review gate,但**不涉及数据归属迁移**。

## 3. 变更设计

### §A 校准集成(退役独立模块)· T-112

**删除**:
- 侧栏 nav 项 `calibration`(`sidebar.tsx:75`)。
- 路由页 `frontend/src/app/(creator)/calibration/page.tsx`。
- 校准中心专属前端件:`features/calibration/calibration-data.ts`(`loadCalibrationWorkbench`)、`features/calibration/calibration-interactive-region.tsx`(`CalibrationWorkbench`)及其专属子件/测试。
- `shell-router.tsx` 中 `/calibration` 的 CONTENT_FILL_ROUTES 条目 + 页标题配置(L77 一带)。

**保留(校准能力的真正落点,不动)**:
- 稿面 `features/draft-workbench/blind-predict-row.tsx`(盲预测入口,挂发布包区)。
- Copilot `calibration.diagnose` 深链(`copilot-deeplink.ts` 表面 + blind-predict-row 预填话术)。
- 后端/worker:`calibration-diagnose-runner.ts` / `calibration-score-runner.ts` 及 `calibration.predictions.*` / `calibration.rubrics.get` op(盲预测/诊断/评分链路仍用)。
- `calibration.suggestions.*`(回流对照)——已被经验页消费(见 §B),不受影响。

**退役后遗留处置**:
- `calibration.overview` op(仅校准中心页消费)→ 前端消费点删除后该 op 变为无前端调用;**后端 op 保留不删**(降低回滚成本,零 schema 动),仅前端停止调用。
- **rubric 查看**:校准中心页曾展示维度 rubric;rubric 为固定 `rubric-canonical`,盲预测/诊断 runner 仍读它,**无需 UI 编辑入口**(现状即固定),退役中心页不丢能力。
- **死链清扫**:全仓 grep `"/calibration"`,凡指向该路由的 `href`/`Link`/深链跳转,改指向稿面盲预测入口或直接移除(**gate 项:退役后不得残留指向 `/calibration` 的可点入口**)。

### §B 知识库 + 经验沉淀合并(Tabs)· T-113

**目标形态**:`/knowledge` 成为单一入口,页面顶部加 **Tabs 两页签**:
- **Tab「知识库」(默认)**= 现有知识库视图(CategoryPanel / RecentKnowledgeTable / InsightRail / KnowledgeGraph),原样迁入,零改动。
- **Tab「经验沉淀」**= 现有经验裁决台(`experience-interactive-region.tsx` 的 `AdjudicationQueue` / `ValidatedLibrary` / 回流表单),连同其数据装配 `experience-data.ts` 一起迁入,原样复用。

**实现方式(改动最小)**:
- `/knowledge` 路由页改为:server 端并行装配 `buildKnowledgeDashboardViewModel()` + `buildExperienceWorkspaceViewModel()`,把两个 VM 传给一个新的 Tabs 外壳组件(client);Tab 内容分别渲染既有的知识库岛与经验岛。**两岛内部逻辑、数据源 op(knowledge.* / learnings.* / calibration.suggestions.*)、交互(evaluate/patch/回流/应用到项目)全部不动**。
- Tab 状态用 URL query `?tab=knowledge|experience` 承载(可深链、SSR 友好、刷新保持),默认 `knowledge`。
- **删除**侧栏 nav 项 `experience`(`sidebar.tsx:84`)。
- **保留** `/experience` 路由但改为 **301/重定向** 到 `/knowledge?tab=experience`(防旧链接/书签/复盘页引导失效;复盘页对经验的**数据**读取走 `learnings.list`,不受影响,但其中若有指向 `/experience` 的**跳转链接**需改指向 `/knowledge?tab=experience`)。
- `shell-router.tsx:340` 经验页标题配置并入知识库(或移除,若知识库走 default 头)。

**命名**:合并后 Tab 标签用「知识库」/「经验沉淀」;经验 Tab 内部沿用现有「经验裁决台」区块标题不强改(降风险,可后续单议)。

### §C 任务中心 → 自动化(纯改名)· T-114

纯字符串改名,**逐处**(无逻辑变更):
- 侧栏 nav label:`sidebar.tsx:82` 「任务中心」→「自动化」。
- 页标题:`automations-page.tsx:58` 「任务中心」→「自动化」。
- 引导文案(8 处):`knowledge-comment-backflow.tsx:213`、`analytics-review-page.tsx:115/456`、`analytics-review-interactive-region.tsx:774/863`、`automations-island.tsx`(注释 L4/L180,注释可选改)、`persistence-client.ts:894`(注释可选改)。**面向用户的可见文案必改;代码注释可一并对齐**。
- 路由 `/automations`、数据 op `scheduledJobs.list`、功能范围**不变**。

## 4. 切片(拆 BACKLOG Task 预告)

过 gate 后按此拆条(每切片一条 BACKLOG,状态 📋 引用本 SPEC):

- **切片 1 · T-114 任务中心→自动化(纯改名)**:改 nav label + 页标题 + 可见引导文案;更新受影响测试(断言「任务中心」的地方改「自动化」);typecheck + 相关 vitest 绿。**无依赖,可先做(风险最低)**。
- **切片 2 · T-112 校准退役**:删 nav 项 + `/calibration` 路由 + calibration-data/interactive-region + shell-router 条目;全仓清 `/calibration` 死链;保留盲预测/诊断链路;更新/删除受影响测试;typecheck + vitest 绿。
- **切片 3 · T-113 知识库+经验合并**:`/knowledge` 加 Tabs 外壳(server 双 VM 装配 + client Tabs + query 承载);删 experience nav 项;`/experience` → 301;清指向 `/experience` 的跳转链接;更新受影响测试(新增 Tab 切换断言 + 深链断言);typecheck + vitest 绿。

## 5. 验收标准

- 侧栏顶级项从「校准/知识库/任务中心/经验沉淀」四项 → 收敛为「知识库/自动化」两项(+ 其余不相关项不动)。
- `/calibration` 无可点入口,访问旧路由不 500(301 或移除);稿面盲预测 + Copilot 诊断照常可用。
- `/knowledge` 双 Tab 切换正常,两 Tab 内容/交互与原页一致;`/experience` 301 到 `/knowledge?tab=experience`;`?tab=` 深链 + 刷新保持。
- 「任务中心」可见文案全站改为「自动化」;`/automations` 功能不变。
- **零后端/契约/schema 变更**;全套测试(contract/backend/frontend/ai-worker/mcp-server)绿;typecheck 0 err。

## 6. 风险与开放问题

- **R1(低)**:知识库并入经验 Tab 后,单页装配两套 VM,SSR 负载略增;经验 Tab 懒装配可缓解(先做同步装配,压测超阈再改懒加载)。
- **R2(低)**:`/calibration` 退役若有未清的深链,会致点击 404 → 由切片 2 的死链清扫兜底(gate 项)。
- **R3(可延后)**:经验 Tab 内部「经验裁决台」标题与外层「经验沉淀」Tab 标签双名并存,不强统一(避免扩大改面);若后续要统一术语再单议。
- **OQ1**:合并后是否要在稿面/复盘给「校准回流对照」一个轻入口?现状回流对照在经验 Tab(`calibration.suggestions`)已有承载,**默认不新增**;若用户测试反馈要更近的入口再排。
