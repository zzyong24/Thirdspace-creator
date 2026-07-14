# SPEC:Pi 受控自主运行时 · 全产品集成(执行自愈 L1+L2 + 记忆层 + 对话式 skill/记忆进化)

- 日期:2026-07-14
- 承接:[2026-07-12 受控自主运行时 SPEC](2026-07-12-controlled-agentic-runtime-design.md)(T-256,已过审;本 SPEC 是它的**落地扩展 + 角色重构**)
- 拍板:用户 2026-07-14 系列拍板(见 §1.2)
- 母任务:BACKLOG T-312(编导式剪辑 + Pi + ChatCut)/ T-314(本 SPEC)/ T-313(点亮 Pi,作切片)
- 调研依据(research-as-asset,全量归档):
  - [Pi 运行时集成](../../research/2026-07-14-pi-runtime-integration-research.md)
  - [Pi 插件与记忆能力](../../research/2026-07-14-pi-plugins-memory-capabilities-research.md)
  - [产品场景 → Pi 适用图](../../research/2026-07-14-pi-product-scenario-map-research.md)
  - [记忆层与 skill 编辑现状](../../research/2026-07-14-memory-layer-and-skill-editing-research.md)
  - [ChatCut 集成评估](../../research/2026-07-14-chatcut-integration-research.md)(否决)
  - [现有剪辑管线缺陷](../../research/2026-07-14-video-editing-pipeline-gaps-research.md)

---

## 0. 一句话

把 **Pi(`@earendil-works/pi-coding-agent` SDK,库级内嵌 sidecar)** 接成编导的**受控执行自愈主管**:该跑的确定性脚本照跑,跑挂了 Pi 读报错自纠(L1);生成不理想时 Pi 提议进化 skill/提示词(L2,走确认门);Pi 接**记忆层**(把现有 14 张本地表包成记忆检索工具 + 会话续 + 跨会话偏好捕捉),并允许用户**通过对话安全地改 skill/记忆**——但**结构化生成留 schema 节点、安全副作用留确定性端口、绝不改 app 源码(L3 排除)**,自由只在推理与编排。

---

## 1. 背景与承接

### 1.1 T-256 已建的地基(不重造)

- **agentic executor 壳**(`backend/src/modules/execution/agentic/`):任务→引擎循环→领域工具注入 + 工具白名单物理隔离(`filterToolsToScope`)+ 步数/预算硬顶(`LoopController`)+ 检查点续跑 + 干跑预览 + 副作用确认门 + abort 贯通。
- **引擎接口按 Pi 形状**(`engine.ts`),`pi-engine.ts` 预留 seam(dynamic import),默认跑 `deterministic-engine.ts` 兜底。
- **三领域工具适配器**(T-256c,`adapters/`):`research`(web.search+web.read 分窗+knowledge.write pending)、`collection`(collect.plan+collect.run,封号纪律在端口)、`material`(material.search+material.organize)。
- **判定规则**`classifyLoopType`:仅 `agentic.*` 任务走引擎,建任务端物理拦截。
- **§6.1 铁律**:引擎每步推理必须回接 model-config。

### 1.2 用户 2026-07-14 拍板(本 SPEC 的约束)

1. **不接 ChatCut**:闭源云 SaaS、素材上云、按 credit 付费,破「本地优先·数据归属用户」宪法([docs/产品定位.md](../../产品定位.md))。转写式剪辑**自建等价**(本地)。
2. **选包 = `pi-coding-agent` SDK**(不是上一份选的裸 `pi-agent-core`):记忆/会话续/skill/extension/MCP 几乎全在 coding-agent 层,且它有可库级嵌入的 `createAgentSession()`。代价:依赖更重(拖 pi-tui/photon-node)+ 须 customTools 盖掉它自带的编码工具。
3. **Pi = 执行自愈主管**:先跑脚本,跑挂了自纠。**不是**把结构化生成节点改成自由文本循环。
4. **自纠错边界 = L1+L2**:任务内自愈(retry/reroute)+ 进化 skill/prompt(走确认门+版本回滚);**排除 L3**(改运行中 app 源码——对分发桌面 app 是签名/安全/稳定性大隐患)。
5. **SPEC 一次全盘想清**(引擎+执行自愈+记忆层+对话编辑+护栏),再拆切片。
6. **字幕修正 = 文本校正非时间回锚**:SRT 时间轴本身对齐,问题是 ASR 认错字(和口播稿对不上),做成 Pi 可调的校正 skill(推翻调研 R3 的 WhisperX 时间对齐判断)。

---

## 2. Pi 的角色定位(核心重构)

编导系统里有**三类活**,Pi 只碰其中两类,且各有边界:

| 活 | 归谁 | Pi 的关系 |
|---|---|---|
| **结构化生成**(立论/脚本/四决策/复盘/校准…26 个 runStructuredNode 节点) | **留 schema 节点**(铁律4:每跳产物 generateObject schema 约束) | Pi **当工具调用**它、**不重写**它。塞进自由循环会退化成自由文本、MiniMax 下崩(调研 R-B 实锤) |
| **脚本/任务执行**(开放式调研/抓取决策/素材整理;失败自纠) | **Pi 跑 + 自愈(L1)** | Pi 的主战场:边做边判、无固定终点、失败读错自纠 |
| **agentic 底座能力**(记忆/MCP/skill) | **Pi 带进来** | 用在上面的循环 + 编导对话里 |

**自纠错边界(硬约束)**:
- **L1 任务内自愈**:某步工具失败 → Pi 换方法/重试/绕路,**步数+预算硬顶**(`LoopController`),**不改任何持久文件**。
- **L2 进化 skill/prompt**:生成不理想 → Pi 提议改 skill/提示词,**走确认门 + 版本回滚 + 范围收窄**(§6),不碰 app 源码。
- **L3 改 app 源码 = 排除**:Pi 永不编辑运行中 app 的 TS 源码/脚本。customTools **不暴露** write/edit/shell 到本机代码;Pi 自带的编码工具(fs write/bash)必须被 customTools **物理盖掉**。

---

## 3. 引擎:嵌 `pi-coding-agent` SDK

### 3.1 内嵌方式

- **库内嵌 in-process**(纯 TS/Node,无 native)。`pi-engine.ts` 的 `createPiAgenticEngine.run()` 落地:走 `createAgentSession()`(而非裸 `agentLoop`——coding-agent SDK 把记忆/会话/skill 封在 session 层)。
- **customTools 盖掉自带编码工具**:session 只暴露我方注入的领域工具(`filterToolsToScope` 已物理隔离)+ 记忆工具 + (可选)MCP 工具;Pi 自带的 fs/bash/edit **不注册 / 显式禁用**(落实 L3 排除)。
- **动态 import + 依赖缺席兜底**:`loadPiCodingAgent()` try/catch,缺席则退 `deterministic-engine`(保留现有全绿路径,不破坏默认)。

### 3.2 §6.1 model-config 回接(硬门,gate-M1)

- **不走 `input.llm`(文本端口对 Pi 不够)**:pi-engine 拿 raw `ResolvedLlmConfig{apiFormat,baseUrl,model,authStyle,token}`(`resolveLlmConfig(ctx,"agentic")`)自建 **pi-ai custom provider**(`createProvider`+`baseUrl`+auth resolver → `createModels().setProvider().getModel()`)。
- **apiFormat 分流**:`"openai_chat"`→`openAICompletionsApi()`;`"anthropic"`→ anthropic-messages API(承载用户 MiniMax `https://api.minimaxi.com/anthropic`)。`authStyle` bearer/x-api-key 经 auth resolver 注入。
- **达标验证**:一条真 MiniMax 循环烧的是用户配的 provider,不是 Pi 自带。**若装好后发现 anthropic custom-baseUrl 不透传我方 baseUrl(只认 KnownProvider)→ 现场核实并绕**(调研 §4 未决①②)。

### 3.3 护栏桥接(复用 LoopController)

- `shouldStopAfterTurn(ctx)`:`controller.beginStep()` 记步 + `controller.chargeTokens(ctx.message.usage.input+output)` 记真 token,任一超顶 return true;步数按 **turn** 重标定(Pi turn 比我方 step 粗)。
- `beforeToolCall(ctx)`:硬否决门(denylist/越权)→ `{block,reason}`。工具白名单已上游物理隔离,此处纵深防御。
- 事件流 → `onStep`:`tool_execution_end`→步骤流、`turn_end`→思考摘要。
- abort:`input.signal` 透传 session。

### 3.4 打包(已知坑,复用 T-254c 机制)

- `frontend/next.config.ts` `serverExternalPackages` 加 pi 包(coding-agent + pi-ai + 真用到的 provider SDK:openai / @anthropic-ai/sdk)。
- `scripts/desktop/build-sidecar.mjs` **实拷**(Next tracing 对动态 import 给残缺版;复用 playwright/hyperframes 的「覆盖 Next-traced 残缺版」机制)。
- **pi-tui / photon-node 处理**:headless sidecar **不需要 TUI**;评估把 tui 相关子路径 external 掉 / 不实拷(只带 SDK 真用到的模块),控体积。
- **打包版必隔离验证**(dev/单测≠分发跑通,MEMORY:verify-through-real-call-path)。
- 依赖:pi-ai pin `@anthropic-ai/sdk@0.91.1` vs 本仓 `^0.105.0`,pnpm 隔离装两份(别强 dedupe);**ai 须 pin 7.0.4 不破 dedupe**;pi 包 **pin 精确版**(0.x 前语义化)。

---

## 4. 执行自愈(L1)

- **闭环**:Pi 跑 agentic 任务 → 某工具失败(端口报错:超时/HTTP/needLogin/限流)→ Pi 读结构化错 → 自纠(换目标/重试/降级/绕路)→ 步数预算内继续,超顶诚实停。
- **端口安全不可绕**(封号纪律):抓取仍走 ingestion 确定性端口(限流/防封/登录态烤在端口),Pi 只给 `targetId` 绕不过速率(T-256c 已建)。
- **副作用门**:产物写 out/ 沙箱 → 既有 manifest → `awaiting_confirmation`;发布/删除强制干跑门。
- **自纠 ≠ 无限绕**:`LoopController` 步数/预算硬顶 + 检查点续跑(参数只能调低、续跑不重置预算)。

---

## 5. 记忆层

### 5.1 现状(调研 R-C 实锤)

- **14+ 张结构化表**全在本地 pglite(`~/.creatoros/db`,桌面 = `<appDataDir>/db`):projects/artifacts/learnings/positioning(creator_profiles)/predictions/calibration/metric_snapshots/benchmark/topic_preferences/ai_conversations+ai_messages。本地优先成立,**可当 Pi 长期记忆素材源**。
- **跨会话记忆 = 半有**:会话内逐条持久可恢复;但**新会话只喂账号级 brief**(定位/learnings/信号/知识/账号画像),**记不得上次对话里说的偏好/纠正**。纯聊天说过的话,不经采纳门沉淀就不留存。
- **注意**:全局 ThirdSpace vault 是**产品外**个人库,别混进产品记忆。

### 5.2 设计

1. **memory-tool(读)**:把现有 14 表包成 Pi 的**记忆检索工具**(复用现有 Context 层 `chat-context.ts`/`creative-context.ts` 的 reader 组合,**不新建 store**)。Pi 循环内可查:该账号定位/历史爆款要素/已验证 learnings/选题偏好/复盘结论。
2. **会话续(有风险,受控)**:pi-coding-agent 的 JSONL SessionManager 指向 `<appDataDir>/pi-sessions/`(本地优先)。**默认粒度 = 每项目一会话**(用户点出的风险:跨项目共享会话易串味);跨会话只续**同项目**上下文。压缩(auto-compaction)内置白拿。
3. **跨会话偏好捕捉(补缺口)**:编导对话里用户随口的偏好/纠正 → 经**采纳门**蒸馏进结构化表(creator_profiles.downstreamRules / learnings / topic_preferences),下次新会话经 brief 自然带回。**不做**「把整段聊天当长期记忆无差别喂回」(噪声+隐私)。
4. **长期语义记忆**:Pi 不自带,由 memory-tool 提供检索;向量检索(现只服务 UI)后续可接创作侧(灰区,不在本 SPEC 强做)。

### 5.3 记忆护栏

- 记忆**写**一律经采纳门(零直写);**读**收窄到当前任务/项目作用域(防跨项目串味)。会话续文件本地、不上云、随项目删除。

---

## 6. 对话式 skill/记忆进化(L2,飞轮)

### 6.1 可行性(底座基本齐,调研 R-C)

- 本产品 **skill = prompt(非代码)**:`skill_config_overrides` 热更 + **版本历史/一键回滚已建**;经验走 `learning.capture` 确认门已在;Pi 的 skill(SKILL.md 渐进披露)与 Anthropic Skills 同构。**只差对话入口**(`skill.evolve` diff 卡,T-087 早设计完整、被用户暂停 → 本 SPEC 复活)。

### 6.2 设计

- **对话入口**:编导对话里用户说「以后立论都别用反问开头」→ Pi 生成 skill/template 的 **diff 提案卡** → 用户确认 → 写 `skill_config_overrides`(带版本)。
- **记忆编辑**:用户说「记住我的受众是宝妈」→ Pi 提议写 creator_profiles/topic_preferences 的 diff → 确认 → 落库。

### 6.3 护栏(改 skill/记忆 = 改行为,最高风险;仓内全现成)

1. **采纳门零直写**:Pi 只出**提案 diff**,用户确认才落。
2. **版本回滚**:每次改写版本链,一键回滚(已建)。
3. **范围收窄**:只准改 **system/template 文案**;**tools/schema 禁改**(改了会破铁律4/工具契约)。
4. **注入防护**:复用 local-env-probe 范式(白名单/denylist),防对话内容注入误改。
5. **干跑门 + 作用域绑定**:改动先干跑预览影响;learning 绑 projectId/reviewId 锚点防污染扩散。
6. **MiniMax 乱改兜底**:提案质量差 → 用户拒 → 不落;弱模型下 skill 进化默认更保守。

---

## 7. 场景落点地图

| 场景 | 运行时 | 用 Pi? | 理由 |
|---|---|---|---|
| `agentic.research` 选题调研 | Pi 引擎 | ✅ **P0** | 最纯开放循环,gate-M2 验收锚,ROI 最高风险最低 |
| `agentic.material` 素材整理 / `agentic.collect` 开放抓取 | Pi 引擎 | ✅ P1 | 同引擎复用 |
| 26 个 runStructuredNode(定位/脚本/四决策/复盘/校准) | schema 节点 | ❌ | 一跳产物+铁律4,Pi 当工具调、不重写 |
| 视频渲染 / 定时固定采集 / 真作品导入 | 确定性脚本 | ❌(但**失败可交 Pi L1 自愈**) | 封号/确定性在端口(SPEC §7 反例);仅**失败诊断**可升 Pi |
| 编导对话 / 聊天框单条改片 | copilot | ❌ | 人每轮在场,产品壁垒 |
| 记忆检索 / 对话改 skill·记忆 | Pi + 门 | ✅(§5/§6) | 底座能力,非跑循环 |
| 定时采集决策层 / 复盘横向调研 / 字幕·剪辑校正 skill / 自动布局 | 灰区 | ⚠️ 逐个点亮 | 要不要升「自适应」用户按需定,默认不上防过度 agent 化 |

---

## 8. 控制模型(护栏总表,复用 T-256b)

工具白名单物理隔离 · 步数/预算硬顶 · 检查点续跑 · 干跑预览 · 副作用确认门(none/writeback/publish/delete)· abort 贯通 · 端口安全不可绕 · 记忆读写门 · skill 采纳门+版本回滚+范围收窄 · 注入防护。**§6.1 引擎推理回接 model-config = 硬门(gate-M1)。**

---

## 9. 边界(防走样)

- 引擎自由**限在推理/编排**;副作用只经确定性端口+确认门;raw 浏览器/shell/**app 源码写**不暴露给 Pi(L3 排除)。
- 结构化生成不外包(铁律4);对话主链留 copilot(壁垒)。
- 不用 Claude Agent SDK(Pi 是 MIT 第三方,与对话链 Vercel AI SDK 并存,铁律1 不违背)。NOTICE(MIT)进关于页。
- 数据全本地(会话续/记忆/skill override 都落 appDataDir,不上云)——护城河 = 越用越准的本地飞轮。

---

## 10. 切片(拆 Task,过审 + 用户审后落 BACKLOG)

- **T-313** 点亮 Pi 引擎(核心):`pi-engine.ts` 真接 `createAgentSession` + customTools 盖编码工具 + §6.1 model-config 回接 + LoopController 桥接 + 装依赖 + 切 `deps.engine`(留确定性兜底)+ 打包 external/实拷 + **真机验一条 `agentic.research` MiniMax 循环(gate-M2)**。
- **T-315** memory-tool(读):把 14 表经 Context 层包成 Pi 记忆检索工具 + 作用域收窄。
- **T-316** 会话续(受控):pi-coding-agent JSONL SessionManager → appDataDir,默认每项目一会话。
- **T-317** 跨会话偏好捕捉:对话偏好经采纳门 → creator_profiles/learnings/topic_preferences。
- **T-318** 对话式 skill/记忆进化(复活 T-087 skill.evolve diff 卡 + §6 护栏全套)。
- **T-319** MCP client 接入(装 `pi-mcp-adapter`,复用现有 MCP 工具;可选,按需)。
- **T-320** 字幕文本校正 skill + 文字重合真测高(剪辑质量,独立于 Pi 可先做;字幕=文本校正非时间回锚)。

**顺序**:T-313 先(点亮+gate-M2 达标)→ T-315/316(记忆读+会话续)→ T-317/318(偏好捕捉+对话进化)→ T-319/320 按需。gate-M2 不达标 → 该子类退 material.gather 结构化多发(SPEC 留门)。

---

## 11. 验收

- 三端 typecheck + 单测(pi-engine 映射/customTools 盖编码工具/LoopController 桥接/memory-tool 作用域/skill 采纳门+范围收窄+注入防护 纯函数)。
- **gate-M1**:§6.1 回接真触发(一条循环烧用户 provider,非 Pi 自带)。
- **gate-M2**:MiniMax 弱模型下一条真选题调研循环「多步不崩/不无限绕/产出可用候选」;不达标退确定性(留门)。
- **打包隔离验**:分发版真跑一条 agentic 循环 + 一次记忆检索 + 一次 skill 进化提案(dev/单测≠分发)。
- L3 排除验证:customTools 确实盖掉 Pi 自带 fs/bash,Pi 无法写 app 源码。

---

## 12. 风险与未决

| 风险 | 评级 | 缓解 |
|---|---|---|
| pi-coding-agent 依赖重(pi-tui/photon-node)打包胀/难 | 中 | headless 只用 SDK,external/不实拷 TUI;隔离验证 |
| customTools 能否**完全**盖掉自带编码工具 | 中(L3 安全关键) | 装好后现场核实 session 只跑注入工具;盖不干净则不启用、退壳 |
| §6.1 anthropic custom-baseUrl 透传 | 中 | 装好现场核实;不透传则用 openai_chat 分流或 KnownProvider |
| 会话续跨项目串味 | 中(用户点出) | 默认每项目一会话;记忆读收窄作用域 |
| 对话改 skill 被注入/误改/污染扩散 | 中-高 | §6 护栏全套(采纳门零直写+范围收窄+注入防护+作用域绑定) |
| gate-M2 MiniMax 弱模型不达标 | 中(产品非技术) | 留门退 material.gather |
| ai@7.0.4 dedupe / @anthropic-ai/sdk 双版本 | 低 | pin 精确版,别强 dedupe |

**未决(装好包后现场核实)**:pi-ai auth resolver 对 bearer 的确切写法;anthropic custom-baseUrl 透传;customTools 覆盖自带工具的完整性;pi-tui 能否从打包剔除;turn 内并行工具是否关成 sequential 配合限流端口。
