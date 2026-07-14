# Pi 全产品落点地图 —— 场景 × 运行时 × 是否用 Pi(调研报告)

- 日期:2026-07-14
- 任务:系统盘点 CreatorOS 里所有「多步执行 / 自动化 / 脚本 / AI 编排」场景,判定各自该不该接 Pi(自主多步循环引擎)。母任务 [T-314](../../BACKLOG.md),承接 [T-256 SPEC](../superpowers/specs/2026-07-12-controlled-agentic-runtime-design.md) §2「三种循环各归各位」+ [R1 Pi 接入调研](2026-07-14-pi-runtime-integration-research.md)。
- 判定依据(SPEC §2 判定规则,已落 `classifyLoopType` 纯函数 gate):
  - 能写成确定脚本 / 有硬安全约束(封号·不可逆)且流程固定 → **deterministic**(脚本/端口)。
  - 人每轮在场的对话 → **conversation**(自研 chat-runner,SPEC §7 明确不外包)。
  - 开放式、多步、边做边判断、无固定终点 → **agentic**(交 Pi + 领域工具/护栏)。
- 拍板:待用户(本报告是落点依据,不含最终决策)。

---

## 0. 一句话结论

CreatorOS 真正该接 Pi 的只有**一类**:**开放式自主调研/整理循环**——即 SPEC 已建壳的三领域(`agentic.research` 选题调研 / `agentic.collect` 抓取决策 / `agentic.material` 素材整理)。除此之外,**26 个结构化 AI 节点、定时采集、视频渲染、对话/剪辑 copilot 全都不该塞 Pi**——它们要么是「一跳产物」(结构化 generateObject,受铁律4 约束),要么是确定性脚本(封号/固定管线),要么是人每轮在场的对话循环(自研壁垒)。把这些塞进自主循环 = 引入不确定性、破封号纪律、退化铁律4,是**伪需求**。

---

## 1. 全量场景 × 运行时 × 是否用 Pi(主表)

> 「当前运行时」四类:**det**=确定性脚本/端口 · **struct**=结构化 AI 节点(runAgentNode/generateObject 单发,受铁律4)· **conv**=对话循环(chat/copilot)· **agentic**=自主多步引擎(Pi seam)。

| # | 场景 | 当前运行时 | 是否用 Pi | 理由 | file_path 锚点 |
|---|---|---|---|---|---|
| **A. 自动化定时任务(automations / scheduling)** |
| A1 | cron 调度/触发/幂等(node-cron 轮询→产 task+job_run→dispatch) | det | ❌ 保持确定性 | 到点触发/自然日幂等/僵尸 sweep 是纯确定性编排,无「边做边判断」;塞 agent 只增不确定性 | `backend/src/modules/ai-runtime/scheduled-collection-scheduler.ts` |
| A2 | 定时采集执行(self.metrics/comments 抓真数据落库,**不调 LLM**) | det(端口) | ❌ 保持确定性 | 封号纪律(限流/登录态)烤在端口;数值程序化抽取,模型绝不看数字(铁律①);流程固定 | `backend/src/modules/ai-runtime/scheduled-collection-runner.ts` |
| A3 | 每日出题(topic.daily:多依据合并→护栏排序→候选进池) | struct(generateObject)+ det(护栏排序) | ❌ 留结构化 | 出题是「一跳结构化产物」+ 确定性防茧房排序;不是自主循环 | `backend/src/modules/ai-runtime/topic-daily-collector.ts` |
| A4 | 对标他号采集(benchmark:抓他号作品) | det(端口) | ❌ 保持确定性 | 同 A2,采集端口封号纪律 | `backend/src/modules/ai-runtime/benchmark-collector.ts` |
| A5 | 黑马挖掘(darkhorse:按关键词找异常高赞作品) | det/struct | ❌ 保持确定性 | 采集+程序化筛选,固定规则够 | `backend/src/modules/ai-runtime/darkhorse-collector.ts` |
| A6 | 指定收藏夹采集(favorites:按名匹配→拉夹内视频→限量进池) | det(端口) | ❌ 保持确定性 | 采集端口,固定流程 | `backend/src/modules/favorites/`,`backend/src/modules/ai-runtime/scheduled-collection-runner.ts` |
| A7 | **定时采集的「决策层」**(刷哪些作品/够了没/何时停/失败绕) | det(固定规则) | 🟡 **灰区** | SPEC §3 明确点名此处;当前是固定规则。对**固定每日指标刷新**固定规则足够(det);仅当升级为**开放式补采/自适应刷新**才值得 `agentic.collect` 决策(端口仍执行) | `backend/src/modules/execution/agentic/adapters/collection-adapter.ts` |
| **B. 执行层(execution)** |
| B1 | 视频渲染(video.render:素材预处理→模板 HTML→hyperframes 抓帧→ffmpeg) | det(脚本) | ❌ 保持确定性 | 固定管线、纯函数模板、可复现;**塞 Pi 是典型伪需求**(SPEC §7 反例) | `backend/src/modules/execution/video-render/executor.ts` |
| B2 | 数据管线 | det | ❌ 保持确定性 | 无独立 data-pipeline 模块;「数据管线」实体=A2 定时采集,确定性 | (同 A2) |
| B3 | 真作品导入(imported 作品转录→绑 transcript-artifact) | det + struct(transcribe) | ❌ 保持确定性 | 导入=确定性抓取+转录;逐字稿走可配 ASR,不需自主循环 | `backend/src/modules/ai-runtime/transcribe-runner.ts` |
| B4 | 执行层框架(沙箱物化/收割/确认卡/abort/超时) | det(编排) | ❌ 保持确定性 | 脑手分离编排骨架,agentic executor 是它的**一种** executor,框架本身确定性 | `backend/src/modules/execution/run-execution-task.ts`,`executor-registry.ts` |
| **C. AI 节点(26 runner / 结构化单发,runAgentNode + generateObject)** |
| C1 | 定位生成 positioning.generate | struct | ❌ 留结构化 | 单跳结构化产物,铁律4 schema 约束;控制流由管线/用户定,非 agent 决策 | `backend/src/modules/ai-runtime/positioning-runner.ts` |
| C2 | 论点树 planning.thesis / 大纲 planning.outline / 契约 planning.contract | struct | ❌ 留结构化 | 同上,单发 generateObject | `planning-runner.ts` / `planning-outline-runner.ts` / `planning-contract-runner.ts` |
| C3 | 选题生成 topic.generate / 富化 topic.enrich / 归因 topic.attribution | struct | ❌ 留结构化 | 单跳结构化 | `topic-runner.ts` / `topic-enrich-runner.ts` / `topic-attribution-runner.ts` |
| C4 | 脚本起草 script.draft / 脚本评审 script.review | struct | ❌ 留结构化 | 单跳结构化(评审=盲打分产物) | `script-runner.ts` / `script-review-runner.ts` |
| C5 | 四决策 video.decisions(分场/信息卡/B-roll/双语字幕) | struct | ❌ 留结构化 | 一次产 VideoDecisions JSON 过预览确认;非循环 | `backend/src/modules/ai-runtime/video-decisions-runner.ts` |
| C6 | 一稿多平台 publish.platform_adapt | struct | ❌ 留结构化 | 单跳改写 | `platform-adapt-runner.ts` |
| C7 | 复盘 review.analyze(提炼爆款要素→learnings 回流) | struct | ❌ 留结构化 | 见 G(flywheel);单跳提炼+确定性回流,非自主循环 | `backend/src/modules/ai-runtime/review-runner.ts` |
| C8 | 评论 QA 筛选 comment.qa.sift | struct | ❌ 留结构化 | 单跳筛选 | `comment-qa-sift-runner.ts` |
| C9 | 重构 reconstruct.project | struct | ❌ 留结构化 | 单跳 | `reconstruct-runner.ts` |
| C10 | 素材抽取 material.extract / 匹配 material.match / 摘要 | struct | ❌ 留结构化 | 单跳(注意:与 F3 素材**整理循环**不同,后者才是 Pi) | `material-extract-runner.ts` / `material-match-runner.ts` / `material-summary.ts` |
| C11 | 知识蒸馏/分类/关联 knowledge.distill/classify/relate | struct | ❌ 留结构化 | 单跳结构化 | `knowledge-distill-runner.ts` 等 |
| C12 | 收藏夹蒸馏 favorites.distill / 选题偏好蒸馏 | struct | ❌ 留结构化 | 单跳 generateObject 绑 Zod | `favorites-distill-runner.ts` / `topic-preference-distill-runner.ts` |
| C13 | 校准打分 calibration.score / 诊断 calibration.diagnose | struct | ❌ 留结构化 | 单跳(诊断走 runStructuredNode 文本兜底) | `calibration-score-runner.ts` / `calibration-diagnose-runner.ts` |
| C14 | 对标拆解 benchmark.teardown / 封面 cover / 转录 transcribe | struct/det | ❌ 留结构化/确定性 | 单跳产物/确定性 ASR | `benchmark-teardown-runner.ts` / `cover-runner.ts` / `transcribe-runner.ts` |
| C15 | 多模态生图/生视频 asset.generate / 分类 asset.classify | struct(多模态) | ❌ 留结构化 | 单次生成节点,走 model-config 可配;非自主循环 | `asset-generate-runner.ts` / `asset-classify-runner.ts` |
| **D. 对话循环(conversation)** |
| D1 | 编导对话/稿面协作 chat(streamText + 工具循环,T-239/T-263 加固) | conv | ❌ 留自研 copilot | SPEC §7 铁律:领域知识/场景/诚实/工具门是壁垒,**不外包**;人每轮在场 | `backend/src/modules/ai-runtime/chat-runner.ts` |
| D2 | 全局助手 copilot.assist(后台读史→定位 brief→回复) | conv | ❌ 留自研 copilot | 同上,对话循环 | `backend/src/modules/ai-runtime/copilot-runner.ts` |
| D3 | 工具门/HITL 授权(chat-tool-gate)、工具集按 surface 收窄 | conv(护栏) | ❌ 留自研 | 对话循环护栏,自研 | `chat-tool-gate.ts` / `chat-tools.ts` |
| D4 | 环境感知工具(local.read/tools/workspace,T-256a) | det(工具) | ❌ 保持确定性 | A 型确定性读+列,denylist 防护;Pi 循环**调用**它但工具本身确定性 | `local-env-probe.ts` / `chat-tools.ts` |
| **E. 自主循环 —— 调研(Pi seam,已建壳)** |
| E1 | **选题调研(搜→读→判断够不够→再搜或停→综合成候选)** | agentic(Pi seam,当前 stub 引擎) | ✅ **接 Pi(核心落点)** | SPEC §3 点名「最纯自主循环、安全风险低」;边做边决策、无固定终点;工具=web.search+web.read 分窗+knowledge.write(pending) | `backend/src/modules/execution/agentic/adapters/research-adapter.ts`,`agentic/pi-engine.ts` |
| **F. 自主循环 —— 抓取决策 / 素材整理(Pi seam,已建壳)** |
| F2 | **抓取决策(决定刷哪些/何时停/失败重试,真抓走确定性端口)** | agentic(Pi seam) | ✅ **接 Pi(决策层)** | SPEC §3「agent 决策·确定性端口执行」;限流/防封在端口,agent 绕不过。仅在**开放式**采集才启用(区别 A2 固定管线) | `backend/src/modules/execution/agentic/adapters/collection-adapter.ts` |
| F3 | **素材整理(找→评估→再找→组织)** | agentic(Pi seam) | ✅ **接 Pi** | 开放式多步整理;工具=material.search+material.organize | `backend/src/modules/execution/agentic/adapters/material-adapter.ts` |
| **G. 复盘 / flywheel(数据回流校准)** |
| G1 | 复盘提炼(review.analyze)+ learnings 回流下一轮 context | struct + det(回流) | ❌ 留结构化 | 提炼=单跳结构化,回流=确定性 reader 注入 creative-context;非自主循环 | `review-runner.ts`,`creative-context.ts` |
| G2 | 校准循环(打分→诊断→bump rubric) | struct | ❌ 留结构化 | 每步单发结构化 + 人拍板 bump;非无人盯自主循环 | `calibration-score-runner.ts` / `calibration-diagnose-runner.ts` |
| G3 | **复盘式调研**(去搜同类爆款横向对比,若做) | (未建) | 🟡 **灰区** | 若复盘要「主动出去搜同类作品对比」= agentic.research 变体,可接 Pi;当前复盘只吃自有数据=struct | (映射到 E1 research 变体) |
| **H. 对话式剪辑(新方向,T-312)** |
| H1 | 聊天框改片(「挪0.5秒」「别挡脸」等单条指令) | conv(应走 copilot + patch 原语) | ❌ 留对话循环 | 人每轮在场的单步指令=对话循环;渲染走确定性 template。**非自主循环** | `backend/src/modules/execution/video-render/template.ts`(渲染端口) |
| H2 | 剪辑质量/字幕文本校正(ASR 识别错字→对齐口播稿) | (待建,T-312 拍板做成 skill) | 🟡 **灰区/Pi skill** | T-312 拍板:做成 **Pi 可调 skill**;若「批量扫全片→校正→重渲→复检」是多步自适应=Pi;单条校正=对话 | `docs/research/2026-07-14-video-editing-pipeline-gaps-research.md` |
| H3 | 自动布局优化(检测文字重合→调位置→重渲→再检测) | (未建) | 🟡 **灰区** | 若做成「检测-调整-复检」闭环 = 自主循环候选;但更可能确定性(DOM 测量后一次算好),优先确定性解 | `template.ts:690-709`(place 布局) |

---

## 2. 分组结论

### 2.1 该接 Pi(真自主循环)—— 只有一类三领域

| 场景 | 落点 | 优先级 | 备注 |
|---|---|---|---|
| E1 选题调研 | `research-adapter.ts`(壳已建) | **P0** | SPEC gate-M2 达标线就是它;最纯、风险最低,先点亮这条 |
| F3 素材整理 | `material-adapter.ts`(壳已建) | P1 | 开放式整理,安全风险低 |
| F2 抓取决策 | `collection-adapter.ts`(壳已建) | P1 | 仅**开放式补采**启用;固定每日采集仍走 A2 确定性 |

**共性**:开放式、多步、边做边判断、无固定终点、安全约束可由端口兜住。**三领域壳(T-256b/c)+ Pi 引擎(T-314 真活)已就绪**,只差 `deps.engine` 切 `createPiAgenticEngine` + 真机验一条 MiniMax 循环。gate-M2:不达标退 `material.gather` 结构化多发(SPEC 留门)。

### 2.2 留确定性 / copilot(不接 Pi)

- **确定性脚本/端口**:A1 cron 调度、A2/A4/A5/A6 定时采集(封号纪律)、B1 视频渲染、B3 真作品导入、B4 执行框架、D4 环境感知工具。**理由**:流程固定 / 有硬安全约束 / 可复现。B1 视频渲染是 SPEC §7 明列的「别塞 agent」反例。
- **结构化 AI 节点(26 个)**:C1–C15 全部。**理由**:都是「一跳产物 + 铁律4 schema 约束」,控制流由管线/用户决定而非 agent 边做边决策。**塞 Pi = 退化回自由文本、破 schema 约束、MiniMax 下崩**(MEMORY: ai-nodes-structured-cross-model)。
- **对话循环**:D1 chat / D2 copilot / D3 工具门 / H1 单条改片指令。**理由**:SPEC §7 铁律——领域知识/诚实/工具门是垂类壁垒,不外包;人每轮在场。
- **复盘/校准**:G1/G2。**理由**:单发结构化 + 人拍板,非无人盯循环。

### 2.3 灰区(待用户定,取决于要不要升级形态)

| 场景 | 灰在哪 | 建议判定 |
|---|---|---|
| A7 定时采集决策层 | 固定每日刷新 vs 开放式自适应补采 | 固定刷新留 det;**若要「自适应补采」才启 F2 Pi 决策** |
| G3 复盘式调研 | 只吃自有数据 vs 主动出去搜同类对比 | 若加「横向搜同类爆款」= 复用 E1 research 引擎(不新建) |
| H2 字幕/剪辑校正 skill | 单条校正(对话)vs 批量扫全片自适应校正(循环) | T-312 已拍板做成 **Pi 可调 skill**;单条走对话,批量自适应走 Pi |
| H3 自动布局优化 | 一次算好(确定性 DOM 测量)vs 检测-调整-复检闭环(循环) | **优先确定性解**(template.ts 补 DOM 测量);闭环化才考虑 Pi |

---

## 3. 优先级建议(给 T-314 SPEC)

1. **P0 先点亮 E1 选题调研 Pi 循环**——壳全就绪,只差引擎切换+真机验;是 gate-M2 的验收锚,ROI 最高、风险最低。
2. **P1 再开 F3 素材整理 / F2 开放式抓取决策**——同一引擎复用,增量小。
3. **灰区按用户诉求点亮**:H2 字幕校正 skill(T-312 已定方向)、A7/G3 视是否要「自适应」形态而定,**默认先不做**(避免过度 agent 化)。
4. **红线(别做)**:26 个结构化节点、视频渲染、定时固定采集、对话循环——**任何「让 Pi 接管」的提议都是伪需求**,判定规则 `classifyLoopType` 已在建任务端物理挡住(`agentic.*` 才走引擎)。

---

## 附:运行时判定的代码真源(单一真值)

- 判定规则纯函数 gate:`backend/src/modules/execution/agentic/loop-type.ts`(`classifyLoopType` / `assertLoopType`,register+create 双门)。
- 三领域工具白名单:`backend/src/modules/execution/agentic/tool-scopes.ts`(`AGENTIC_TASK_TOOL_SCOPES`)。
- Pi 引擎 seam:`backend/src/modules/execution/agentic/{engine,pi-engine,deterministic-engine}.ts`;接入清单见 [R1 报告](2026-07-14-pi-runtime-integration-research.md) §3。
