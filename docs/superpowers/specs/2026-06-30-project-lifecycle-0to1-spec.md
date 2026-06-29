# CreatorOS 项目制作全生命周期 0→1 规格(字段级·人机协作)

> 状态:约束规格(binding),0→1 完整规划。**无波次、无阶段切分**——整体规划好,经 `/goal` 一次实现到位。
> 依据:对 项目骨架 / 研究+策划 / 脚本+拍摄 / 发布+复盘 的逐字段只读核实。
> 配套:`2026-06-30-page-binding-spec.md`(制作/知识库/素材 控件级)、`2026-06-30-data-source-pipeline-design.md`(真实表现采集)。
> **给实现 Agent 的硬约束**:本规格每个字段都钉死了「来源 / 人的权限 / 展示 / 交互 / 协作基元 / 数据模型 / 验收」。`处置` 非"维持"的即工作项,必须照做并过验收。不许只做一半、不许用桩糊弄、不许造数。

---

## §0 总则:这份规格的脊柱(6 条主线)

逐字段摸完底,真正要做的不是"逐页填坑",是这 6 件横切的事。每个阶段的字段都服务于它们:

- **脊柱-1 统一 Vercel AI SDK + 提示词模板化解耦(AI 架构地基,最高优先)**:① 全部 AI 节点走 **Vercel AI SDK**(ai-worker `modelFor`/`runAgentNode`),**弃 Claude Agent SDK + 旧 LlmCompleter**(选题已迁,其余 7 个 runner 待迁)。② 提示词**不内联代码**——做成 `模板(skill,外置/可版本化/未来服务端可推送) + 上下文注入(定位/风格/knowledge) + 绑定层`,**千万解耦**。见 §3。
- **脊柱-2 CollabField 人机协作(最大缺口)**:当前所有 AI 产物**只能整批采纳/丢弃,不能逐字编辑**;后端有 `replaceStructuredContent`/`createArtifactVersion` 能力但 UI 没接。**这是要补的第一缺口**——见 §2。
- **脊柱-3 统一 AI 步骤日志**:`ai_task_steps` 全套都在,但**只有 `topic.generate` 真用了**;研究/策划/脚本/素材匹配/复盘/校准/发布 8 类 AI 节点只有转圈无日志。统一规范铺开——见 §3。
- **脊柱-4 接通阶段交接缝**:`策划→脚本` 断(`content_outline` 无下游、脚本 AI 上下文不含策划产物)、`脚本→拍摄` 断(制作提词读真账号恒空)。见 §10。
- **脊柱-5 闭合飞轮后半圈**:真实表现全 mock、`CalibrationResult` 回流无录入入口。补真实采集(数据源 spec)+ 回流录入,让"预测 vs 真实 → 修 rubric"跑起来。见 §11。
- **不分类型,只留横/竖屏**:产品只产出**文案 + 结构 + 管素材**,不管用户怎么剪,**不做项目类型分类**。最多保留 `横屏/竖屏`(orientation)一个轻量属性(复用已有 `content_outputs.aspect_ratio` 16:9/9:16),**仅用于喂 AI 让文案/结构适配**(竖屏 hook 前置/时长更短),非分类轴。原 videoType 枚举全链路**砍掉**。
- **平台退回发布层**:平台已是 `publications.platform` 列(已下沉),只需把"立项必填平台"降级 + 统一两个数据源。

全局不变量:严禁假按钮(真/删/标规划中)· 数据要真(禁 fixture 回退、禁 LLM 读数)· 三态诚实 · AI 不直接写领域实体(走 service Port)。

---

## §1 项目骨架:横/竖屏轻量属性 + 阶段机修复

### 1.1 不做类型分类,只留横/竖屏(orientation)
**决策:产品不做项目类型分类轴**(我们只产文案+结构+管素材,不管怎么剪)。原 videoType 枚举全链路**砍掉**。只保留一个轻量的横/竖屏属性,**仅供 AI 适配文案/结构**。

| ID | 工作项 | 落点 | 验收 |
|---|---|---|---|
| SKL-01 | 不新增类型枚举;`orientation`(横屏/竖屏)轻量属性,**对齐/复用已有** `content_outputs.aspect_ratio`(16:9 / 9:16),不新建分类表/枚举轴 | `new-project-form.tsx`(一个 toggle)+ 复用 aspect_ratio | 新建可选横/竖屏,落 aspect_ratio;**不引入项目类型枚举** |
| SKL-02 | orientation 注入 AI 上下文(creative-context 一个 facet),让 `script.draft`/`planning.outline` 的文案/结构按横/竖屏适配(竖屏 hook 前置、时长更短) | `creative-context.ts` + 相关 runner | script/outline prompt 含 orientation 提示 |
| SKL-03 | 清理死字段 `content_category`(删或弃用),不再当"项目类型"展示 | schema + `project-overview-*` + fixtures | 无残留"项目类型"假展示 |

### 1.2 平台退回发布层(脊柱-2)
| ID | 工作项 | 落点 | 验收 |
|---|---|---|---|
| SKL-08 | brief gate 的「目标平台≥1」从必填降级为可选 | `projects.service.ts` brief gate + `brief-workbench.tsx` REQUIRED | 不配平台也能完成立项 |
| SKL-09 | 统一平台数据源:以 `project_target_platforms` 为准,或明确 jsonb 只读镜像;消除两源不同步 | service + brief-workbench | 两处平台显示一致 |

### 1.3 阶段机修复
- **七段统一**:`brief→research→planning→script→production→publishing→review`。校正 UI/注释残留的"六阶段"措辞(`project-stage-stepper.tsx` aria-label 等)。`SKL-10`
- **修「进入下一步」语义 bug**:`project-actions.tsx` 点「进入下一步」应先 `transition(当前阶段→completed)`(触发 gate),再点亮下一阶段;当前直接 transition 下一阶段、绕过了 gate。`SKL-11`
- **gate readers 接通核实**:确认 `persistence-client.ts` 给 `createProjectsService` 填了 `gateReadersRef.current`;未接=gate 恒过(除 brief)。要让各阶段交付物 gate 真生效。`SKL-12`
- **stepper 点击前预检**:接 `validateStageGate` 做"完成前"提示缺什么(现未调)。`SKL-13`

---

## §2 CollabField 人机协作体系(脊柱-2·全规格的心脏)

**问题**:AI 填的东西人改不了(只能整批采纳/丢弃,采纳后无编辑入口)。**这违背"AI 填完人要能变更、编辑、感知、查看"的核心诉求。**

**方案**:一套统一的 `<CollabField>` / `<CollabBlock>` 组件契约。AI 产物落库后,**每个结构化字段都是可编辑单元**,带:

- **来源角标**:`AI` / `人` / `AI→人改`(读 `artifact_version.created_by_type` 或字段级 provenance)。
- **可编辑**:行内编辑 → 落库(结构化走 `replaceStructuredContent` 写子表 `thesis_nodes`/`script_sections`;整块走 `createArtifactVersion(created_by_type:"user")` append 人改版本)。
- **AI 重做**:单字段/单块「让 AI 重写这段」→ 起一个 AI 任务(走 §3 范式)只重生成该块,人再采纳。
- **变更历史**:版本链可见可回滚(artifacts 已是 append-only + restore,接出来)。
- **采纳粒度**:候选支持**逐条采纳/编辑/删**(不止整批)——`AdoptCandidateCard` 升级为可编辑候选项。

| ID | 工作项 | 验收 |
|---|---|---|
| COLLAB-01 | `<CollabField>`(单字段)+ `<CollabBlock>`(结构块)组件:来源角标 + 行内编辑落库 + AI 重做 + 历史 | 任一 AI 字段可被人改并落库,刷新回显人改版,角标转"AI→人改" |
| COLLAB-02 | `AdoptCandidateCard` 升级:候选**逐条**可编辑/采纳/删(不止整批) | 8 条 AI 候选可删 3 条、改 1 条文案、再采纳剩余 |
| COLLAB-03 | 接 `replaceStructuredContent`(写当前版本子表)+ `createArtifactVersion(user)` 的前端编辑路径 | 论点树节点、脚本段 人改后落子表/新版本 |
| COLLAB-04 | 结构化 round-trip 不丢:脚本 4 字段(口播/画面/字幕/时长)、论点树节点、金句 emphasis 标记 保存回读不压扁 | 改完保存刷新,4 字段独立回显;金句卡有值;时长 chip 在 |

> CollabField 是**横切所有阶段**的:研究素材、论点树、内容合同、结构方案、脚本分镜、发布文案、复盘洞察、校准维度——每一处 AI 产物都套它。

---

## §3 AI 架构地基:Vercel SDK 统一 + 提示词模板化 + 步骤日志(脊柱-1/3)

### 3.0 统一到 Vercel AI SDK(弃 Claude Agent SDK + 旧 LlmCompleter)
选题已迁(ai-worker `modelFor`/`runAgentNode`,按 capability 配模型);其余 runner 还在旧 SDK 上,全部迁过来。

| ID | 工作项 | 验收 |
|---|---|---|
| AISDK-01 | 7 个 inline runner(research / planning ×3 / script / publish / review / calibration)迁到 ai-worker 的 Vercel AI SDK 运行时(`modelFor` + `runAgentNode`),**弃 `runClaudeAgent`(Claude Agent SDK)+ 旧 `LlmCompleter`** | 全 8 节点走同一 SDK + 同一模型网关;按 capability 配模型 |
| AISDK-02 | 研究的 web 搜索:从 Claude Code 订阅的内置 WebSearch 改为 **Vercel SDK 的工具**(tool registry 注册一个 search 工具)或暂置并诚实标"需配检索工具" | 不再依赖 `CLAUDE_CODE_OAUTH_TOKEN`;web 检索经 Vercel SDK tool |

### 3.1 提示词模板化 + 可注入 + 解耦(脊柱-1·为服务端推 skill 铺路)
**铁律:提示词不内联在 runner 代码里。** 每个 AI 能力拆成三层,**解耦**:

```
最终 prompt = 模板(skill) ⊕ 上下文注入(facets) ⊕ 绑定层
   模板/skill:{ id, version, system, instruction, outputSchema, requiredFacets:[positioning,style,knowledge,...] }
              外置(文件/DB),可版本化,未来服务端可推送到客户端
   上下文:creative-context 装配的 facets(定位 / 风格 / knowledge / learnings / orientation / 评论…)
   绑定:bindPrompt(template, context) —— 模板声明要哪些 facet,装配层提供,绑定层注入
```

写文案的例子(这正是你要的解耦):`script.draft` = **写文案 skill 模板** 注入 `{用户定位, 风格, 相关 knowledge, 横/竖屏}` → 最终 prompt。换方法论 = 换模板,不改 runner 代码;A/B 测提示词、服务端热推 skill 都靠这层。

| ID | 工作项 | 验收 |
|---|---|---|
| PROMPT-01 | 建 PromptTemplate / skill 注册表(外置 + 版本化);schema 含 requiredFacets + outputSchema | 提示词集中可查、可版本化,不散落 runner |
| PROMPT-02 | `bindPrompt(template, assembledContext)` 绑定层:模板声明 facet → creative-context 提供 → 注入 | 缺某 facet 报缺,不静默拼空 |
| PROMPT-03 | 8 个 AI 节点的内联 prompt 全改为 template+context 绑定 | 改 skill 模板不动 runner;写文案真结合定位+风格+skill |
| PROMPT-04 | 预留服务端推送接口(模板可被外部源覆盖/更新)的扩展点(不必现在实现远端,但接口留口) | 模板源可插拔(本地→未来远端) |

### 3.2 统一 AI 步骤日志 + 弹窗范式(脊柱-3)
**8 类 AI 节点**(逐个接 AI-STD-01..04 = 弹窗+步骤日志 / 后台真跑 / 关弹窗不杀 / 重开可看):

| 节点 taskType | 阶段 | 执行子模式 | 现状 | 处置 |
|---|---|---|---|---|
| `research.gather_material` | 研究 | runClaudeAgent(真 web 搜索) | 弹窗✅日志❌ | 补步骤日志 + CollabField 候选 |
| `planning.thesis` / `.contract` / `.outline` | 策划 | LlmCompleter(无 web) | 弹窗✅日志❌ | 补步骤日志 + 块级 CollabField |
| `script.draft` | 脚本 | LlmCompleter | 弹窗✅日志❌ | 补步骤日志 + 4 字段 CollabField |
| `material.match` | 拍摄 | 真 Claude | **内联卡·非弹窗**·日志❌ | 接 `<AiTaskDialog>` + 逐条采纳 |
| `publish.platform_adapt` | 发布 | LlmCompleter | 弹窗✅日志❌ | 补步骤日志 + 文案 CollabField |
| `review.analyze` | 复盘 | LLM(指标 mock) | 弹窗✅日志❌ | 补步骤日志 + 真实指标 grounding(待 §11) |
| `calibration.diagnose` | 校准 | LLM 逐维盲评 | 弹窗✅日志❌(同构 island) | 补步骤日志 |

| ID | 工作项 | 验收 |
|---|---|---|
| AISTD-01 | 抽 `useAiTask`/`<AiTaskDialog>` 复用件(封装 create→poll getTask+listTaskSteps→步骤日志→采纳→关不杀→重开) | 选题已用的那套抽成复用件 |
| AISTD-02 | 7 类 inline runner(`frontend/src/server/ai/*-runner.ts`)逐个 `recordStep` 上报阶段事件(读人设/装上下文/生成/解析…) | 每个 AI 节点弹窗里有分步日志,非单条转圈 |
| AISTD-03 | 8 类 AI 节点入口全接 `<AiTaskDialog>`(尤其 material.match 从内联卡迁过来) | 任一 AI 功能:点→弹窗+日志→关→后台续→重开可看 |

> 注:研究/策划等走的是 `frontend/src/server/ai/` inline runner(非 ai-worker);`recordStep` 接 `ai.service.recordStep`(已存在)即可,无需迁 ai-worker。

---

## §4 研究阶段(字段级 + 协作)

目标:为这条选题搜集事实弹药 + 竞品/趋势背景 + 沉淀笔记证据。

| 字段 | 来源 | 人的权限 | 协作基元 | 数据模型 | 处置 |
|---|---|---|---|---|---|
| AI 搜集素材 | AI(真 web) | 逐条采纳/编辑/删 | ①AI候选→人采纳(升级逐条) | `ai_task_results`→`knowledge_items`+`material_links` | 补步骤日志 + COLLAB-02 逐条 |
| 研究笔记 | 人 | 增删改(真 CRUD) | ④纯人填 | `knowledge_items(note)`+`knowledge_revisions` | 维持;补"从 0 新建独立 note"(现只能挂 notes[0]) |
| 证据收藏 | 人 | 关联/取消 | ④纯人填 | `knowledge_relations(supports)` | 维持 |
| 趋势与背景(3 卡) | **桩·无 producer** | — | — | 无表 | **做真**:`research.background` AI 节点(基于定位+采集)或采集喂;否则**删/标规划中**。禁假卡 |
| 竞品分析表 | **桩·假优劣势** | — | — | 无表 | **做真**:`research.competitor` AI 节点产结构化竞品(可 CollabField 编辑)落 artifact;否则删。**当前按威胁等级查常量的假优劣势必须去掉** |
| 相关标签 | **桩** | — | — | 无表 | 删 或 接 `taxonomy.tags` 真标签 |
| 资料类型 tab 过滤 | 纯前端 no-op | — | — | — | 接真过滤 或 标说明 |

---

## §5 策划阶段(字段级 + 协作)

目标:把研究的料收敛成"论点树 → 内容合同 → 结构方案",给脚本当蓝图。

| 字段 | 来源 | 人的权限 | 协作基元 | 数据模型 | 处置 |
|---|---|---|---|---|---|
| 论点树(核心/支撑/证据/反驳) | AI | **节点级编辑**(增删改) | ②AI草稿→人编辑 | `thesis_tree` artifact `content_data.nodes` + 子表 `thesis_nodes` | COLLAB-03 接 `replaceStructuredContent` 写子表;节点可改 |
| 内容合同(4 卡) | AI 草稿+人采纳 | **逐卡编辑** | ②AI草稿→人编辑 | `content_contract` artifact `content_data.cards` | 逐卡 CollabField;去掉"采纳前永远脚手架"——空态诚实 |
| 结构方案 | AI | 块级编辑 | ②AI草稿→人编辑 | `content_outline` artifact `content_data` | CollabField + **§10 接通到脚本** |
| 证据地图 | **桩** | — | — | 无表 | 删 或 由论点树证据列派生(别独立造假 confidence%) |
| 关键素材 | 真(material_links) | 只读(增删在研究/料库) | — | `material_links(planning|research)` | 维持 |
| 5 子页签 | 桩(锁死导航) | — | — | — | 接真视图切换 或 删多余页签 |

---

## §6 脚本阶段(字段级 + 协作)

目标:把蓝图写成可拍的分镜脚本(口播/画面/字幕/时长 4 字段)。

| 字段 | 来源 | 人的权限 | 协作基元 | 数据模型 | 处置 |
|---|---|---|---|---|---|
| 分镜行·口播 | AI 草稿 | 逐行可编辑 | ②AI草稿→人编辑 | `artifact_version.content_data.sections[].口播` | COLLAB-04 拆回独立字段(现压成一段) |
| 分镜行·画面 | AI 草稿 | 逐行可编辑 | ② | 同上 `.画面` | 同上 |
| 分镜行·字幕 | AI 草稿 | 逐行可编辑 | ② | 同上 `.字幕` | 同上 |
| 分镜行·时长 | AI 草稿 | 可编辑 | ② | `.startSeconds/.时长` | 修 round-trip:startSeconds 保存回读不丢(现恒 null,timecode chip 消失) |
| 金句 | 系统派生(emphasis 段) | 可标记/采纳 | ③人标→系统收 | `sections[].emphasis` | 修 round-trip:emphasis 保存不丢(现金句卡恒空) |
| 整篇草稿 | AI 草稿 | 可编辑 | ② | `content_text` | 维持(可编辑+落库) |
| 版本记录 | 系统 | 恢复 | — | `artifact_versions` | 维持(restore 真) |
| 工具栏(加粗等) | 桩(无 rich-text) | — | — | — | 删 或 接最小富文本;现纯装饰 |
| AI 写作建议 | 桩·诚实空 | — | — | 无 | 做真(`script.suggest`)或维持诚实空 |

上游:脚本 AI 上下文要含**策划产物**(见 §10),现仅 positioning+learnings。

---

## §7 拍摄阶段(字段级 + 协作)—— 不做编辑器,做"拍摄有章可循"

**产品边界(已定)**:制作**不做视频编辑器**。砍/降级编辑器肌肉,做实"提词+素材就位+分镜清单+拍摄设定"。详见 `page-binding-spec.md` PROD-01..24。

**该做实(拍摄有章可循)**:
| 字段 | 来源 | 协作 | 处置 |
|---|---|---|---|
| 录制脚本提词 | 脚本阶段 artifact | 只读提词 | **§10 接通**:真账号现恒空,接"读本项目脚本 current version→scriptLines" |
| AI 素材匹配→用料链 | AI | 逐条采纳/调整 | 接 `<AiTaskDialog>` + COLLAB-02 逐条 + 缩略图真字节(ASSET-05) |
| 分镜章节清单 | 人填(真落库) | 增删改 | 修读侧 PROD-24:`production_segments` 落库后回显(补 `segments.list` 读 op + 读侧读它);填 `script_section_id` 溯源 |
| 录制/字幕设定(开关) | 人填(真落库) | 开关 | 维持;死值行(分辨率等)标"示例"或接真 |

**该砍/降级(编辑器肌肉)**:预览播放(PROD-11/12/13)、导出渲染(PROD-20/21)、剪辑时间线(PROD-22/23)→ 诚实标"规划中"或移除,**去掉假成功/假播放/假导出文案**。

---

## §8 发布阶段(字段级 + 协作)—— 平台落地层

目标:一稿多平台适配 + 真发布。平台 = `publications.platform`(已下沉,正确)。

| 字段 | 来源 | 人的权限 | 协作基元 | 数据模型 | 处置 |
|---|---|---|---|---|---|
| 多平台 标题 | AI 草稿 | 可编辑(真·已做) | ②AI草稿→人编辑 | `publication_revisions.title` | 维持 |
| 多平台 正文/简介 | AI 草稿 | **当前只读→改为可编辑** | ② | `publication_revisions.description` | 接编辑落 revision(现只读 div,commit 固定传 "") |
| 多平台 标签 | AI | **当前只读→可增删** | ② | `publication_revisions.platform_tags` jsonb | 标签 ×/添加做真(现 × 是装饰) |
| 封面 | **桩(渐变块)** | 选/传 | ③ | `publication_revisions.cover_asset_id` | 接 AI `coverIdea`(现采纳时被丢)+ 选素材封面;否则诚实空 |
| 平台 | AI 默认四端 | 勾选参与 + 手动加平台 | ① | `publications.platform` | 补"手动加平台"(现只能 AI 采纳建) |
| 发布状态 | 系统状态机 | 确认发布 | — | `publications.status` | 维持;`platform-publisher` 仍是 MockPublisher(真适配器 = 后续,诚实标"模拟发布") |
| 排期时间 | **桩(写死 19:30)** | 选时间 | ④ | `publications.scheduled_at` | 接真 time picker 落 scheduled_at;去掉假"批量设置时间" |
| 发布选项/检查清单/提示 | **桩(写死)** | — | — | 无列 | 做真(加列+校验)或**删/标规划中**;现检查清单写死全✓是误导 |
| 内容日历 | 桩展示+真写空格 | 点空格新增 | — | `platform_account_calendar_entries` | 维持空格新增;格子内容做真或诚实空 |
| 右栏指标/对比 | **桩(mock)** | 只读 | — | `metric_snapshots` | 待 §11 真采集;现诚实空态保持,转化口径定义 |

---

## §9 复盘阶段(字段级 + 协作)—— 飞轮闭环的收口

目标:作品发布后,真实表现 → 对照盲预测 → AI 诊断 → 沉淀经验 → 回流。

| 字段 | 来源 | 人的权限 | 协作基元 | 数据模型 | 处置 |
|---|---|---|---|---|---|
| 复盘记录/洞察 | 人填 | 增删改 | ④ | `reviews`+`review_insights` | 维持;`evidence/priority` 接 UI;"生成复盘报告"桩按钮做真或删 |
| AI 复盘诊断 | AI | 采纳→编辑 | ②/① | `review.analyze`→`learnings` | 补步骤日志 + **真实指标 grounding**(现指标 mock) |
| 经验 learning | AI 草稿+人采纳 | **编辑文本 + 改 validationStatus + 采纳/评估** | ②AI草稿→人编辑 | `learnings`(+`evaluate`/`applications` contract 已齐) | 接前端编辑/评估控件(现只读;后端能力齐) |
| 校准·维度评分 | AI 盲评 | 锁前可调? | ②(盲预测语义:锁后只读) | `predictions.predicted_conversion.dimensions` | 补步骤日志;`predicted_score` 恒 0 修(维度分铺平)或文案说明以维度分为主 |
| 校准·编导诊断/预测表现 | AI | 只读 | — | `predictions.predicted_metrics` | 维持(诚实 null 不编造) |
| 锁定预测 | 人 | 锁(不可逆) | — | `predictions.status/locked_at` | 维持(盲预测语义对) |
| **回流对照 CalibrationResult** | **seed 写死·生产无触发** | **录入真实数据入口** | ③人触发/系统采集→对照 | `calibration_results`(op/service/repo 全实现,**无调用方**) | **§11 接通**:补"录入真实表现/回流"入口 → `calibration.results.create`,让"预测 vs 真实 → 偏差 → 修 rubric"跑起来 |
| rubric 自进化 | Learning→建议→采纳 bump | 采纳 | ③ | `rubric_versions`(轨 B contract 齐) | 接前端"采纳建议 bump 版本"控件 |

---

## §10 阶段交接缝(脊柱-4)

| ID | 断点 | 接法 | 验收 |
|---|---|---|---|
| SEAM-01 | 策划→脚本:`content_outline` 无下游 | 脚本 dispatch 给 `script.draft` 注入 outline+contract+thesis reader(现仅 positioning+learnings) | AI 写脚本时上下文含策划论点树/结构方案 |
| SEAM-02 | 策划→脚本:脚本读侧不读 outline | 脚本编辑器"大纲"读 `content_outline` artifact(或并存) | 脚本页大纲来自策划结构方案 |
| SEAM-03 | 脚本→拍摄:制作提词真账号恒空 | 制作读侧读"本项目脚本 artifact current version → scriptLines"(去掉写死 `[]`) | 制作页提词显真脚本行 |
| SEAM-04 | 拍摄章节→脚本溯源 | `production_segments.script_section_id` 真填(现写死 null) | 章节能溯源到脚本段 |
| SEAM-05 | 选题→Brief→项目 | 已通(维持) | — |

---

## §11 飞轮闭环(脊柱-5)—— 让"预测→真实→进化"跑起来

依赖 `data-source-pipeline-design.md`(采集自己作品真实表现)。闭环接线:

| ID | 工作项 | 验收 |
|---|---|---|
| FLY-01 | 真实表现采集落 `metric_snapshots`(经数据源管线,替 mock ingestion / seed) | 发布后 N 天,作品真实播放/赞/评入库 |
| FLY-02 | 回流录入:复盘/校准页加"拉取/录入真实表现 → 对照盲预测"入口 → `calibration.results.create` | 真实用户能看到 预测分 vs 真实分 vs 偏差(现恒空) |
| FLY-03 | 偏差 → rubric 自修正:`CalibrationResult` 偏差信号驱动 `learnings.calibrationSuggestions` → bump rubric | 系统性偏差能转成 rubric 建议 |
| FLY-04 | 轨 A 维持:learnings→选题/脚本(已真闭环) | 复盘经验真进下一轮选题 prompt |

---

## §12 桩字段处置总表(每个都有判决)

| 桩 | 判决 |
|---|---|
| 研究 趋势卡 / 竞品表(假优劣势) / 相关标签 | 做真(AI 节点/采集)或删;**假优劣势必去** |
| 策划 证据地图 / 5 子页签 | 删或派生自真数据 |
| 脚本 工具栏装饰 / AI 写作建议 | 删/接最小富文本 / 做真或诚实空 |
| 拍摄 预览播放 / 导出渲染 / 剪辑轨 | 标"规划中"/移除(不做编辑器) |
| 发布 封面 / 标签编辑 / 排期 / 发布选项 / 检查清单 / 提示 | 做真(封面/标签/排期)/ 删或标(选项/清单/提示) |
| 复盘 生成复盘报告按钮 / 真实指标 / CalibrationResult | §9/§11 做真 |

---

## §13 数据模型 + 契约 op 总览(新增/改)

- **改**:`projects` +`video_type`;`publication_revisions` description/tags 可写;`production_segments.script_section_id` 真填。
- **新 op**:`productions.segments.list`(PROD-24 读);脚本/策划交接 reader(组合根注入,非新表);`research.background`/`research.competitor` AI 节点(可选);CollabField 复用 `replaceStructuredContent`/`createArtifactVersion`(已有)。
- **接通已有但无调用方**:`calibration.results.create`、`learnings.evaluate`/`applications.create`、`calibration.suggestions.adopt`。
- **采集**:见数据源 spec(`metric_snapshots` 真写入)。

---

## §14 全局验收(每条可勾选)

- [ ] **不做项目类型分类**;只留横/竖屏(复用 aspect_ratio)喂 AI 适配;平台只在发布层、立项不强制
- [ ] **全部 AI 走 Vercel AI SDK**(无 Claude Agent SDK / 旧 LlmCompleter);按 capability 配模型
- [ ] **提示词模板化解耦**:模板(skill,可版本化/可推送)+ 上下文注入 + 绑定;写文案真结合 定位+风格+skill,换模板不改 runner
- [ ] **每个 AI 产物字段人都能逐字编辑并落库**(CollabField),来源角标准确,可"让 AI 重做这段",可回滚
- [ ] **8 类 AI 节点全有步骤日志 + 弹窗 + 后台续跑 + 重开可看**
- [ ] 阶段交接缝全通:策划产物进脚本上下文 + 脚本进拍摄提词 + 章节溯源脚本
- [ ] 飞轮后半圈通:真实表现采集 → 预测对照 → 偏差 → rubric 修正(轨 A 已通)
- [ ] 桩字段无一漏判:做真 / 删 / 标规划中,全站零"假成功/假数据/假优劣势"
- [ ] round-trip 不丢结构:脚本 4 字段独立 + 金句有值 + 时长 chip 在
