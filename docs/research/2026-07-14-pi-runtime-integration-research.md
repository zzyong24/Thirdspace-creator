# Pi 运行时接入已预留 seam —— 调研报告

- 日期:2026-07-14
- 任务:摸清「把 Pi(`earendil-works/pi`)运行时真正接进 `backend/src/modules/execution/agentic/` 已预留的 seam」到底要做什么
- 拍板依据:SPEC §6 用户 2026-07-12 拍板选 Pi(不做 Pi/OpenCode 实测)。本报告核实该拍板的技术假设是否成立,并给出实现清单。
- 结论(先给):**Pi = 纯 TypeScript/Node npm 包(MIT,71k star,v0.80.7 今日在维护),可库级内嵌进 sidecar,无 native 依赖;§6.1「回接 model-config」硬门可满足(pi-ai 支持自定义 base_url+key,且本仓两种 apiFormat `anthropic`/`openai_chat` pi-ai 都覆盖)。SPEC §6 关键假设全部成立,无拦路石。真正的工作量集中在:zod→typebox 参数转换、把 `ResolvedLlmConfig` 组装成 pi-ai custom provider、用 `shouldStopAfterTurn` 桥接我方 `LoopController`、以及打包 sidecar 时把动态 import 的 pi 及其重 SDK 依赖树 external + 实拷(与 playwright/hyperframes 同款已知坑)。**

相关源码:`backend/src/modules/execution/agentic/{engine,pi-engine,deterministic-engine,agentic-executor,loop-control,tool-scopes}.ts`;LLM 回接 `backend/src/modules/ai-runtime/llm/{resolve,provider}.ts`;打包 `frontend/next.config.ts` + `scripts/desktop/build-sidecar.mjs`。

---

## 1. seam 契约表:engine.ts ↔ Pi(`@earendil-works/pi-agent-core@0.80.7`)逐项映射

Pi 契约取自 npm 包 `dist/*.d.ts`(已下载核实,非文档臆测)。核心类型:`AgentOptions` / `AgentLoopConfig`(在 `types.d.ts`)、`Agent` 类(`agent.d.ts`)、`agentLoop`/`agentLoopContinue`(`agent-loop.d.ts`)。

| 我方 engine.ts | 语义 | Pi 对应物(核实自 .d.ts) | 匹配度 / 缺口 |
|---|---|---|---|
| `AgenticEngine.run(input)` | 一次自主循环 | 高层 `new Agent(opts)` + `agent.prompt(goal)` + `agent.waitForIdle()`;或低层 `agentLoop(prompts, context, config, signal, streamFn)`(async 事件流) | ✅ 两条路都行。**推荐走低层 `agentLoop`**——它把 `shouldStopAfterTurn`/`convertToLlm`/`beforeToolCall` 全塞进 `AgentLoopConfig`,一次性拿全我方要的钩子(高层 `Agent` 的 `shouldStopAfterTurn` 不在构造项里,只有低层 loop 有) |
| `AgenticTool`(name/label/description/parameters/effect/execute/planInput) | 领域工具 | `AgentTool<TParameters extends TSchema>` extends `Tool`(`{name, description, parameters}`)+ `{label, execute(toolCallId, params, signal, onUpdate), executionMode?, prepareArguments?}` | ⚠️ **name/label/description/execute 一一对上**;`effect`/`planInput` 是我方私有(Pi 无,保留在闭包里用);**`parameters` 缺口**:Pi 用 **typebox `TSchema`**,我方用 **zod `ZodTypeAny`** → 必须写 zod→typebox 转换(或用 `AgentTool.prepareArguments` shim 兜) |
| `AgenticToolResult`(summary/data/plan) | 工具产出 | `AgentToolResult<T>`(`{content:(Text\|Image)[], details:T, addedToolNames?, terminate?}`) | ⚠️ 形状不同:Pi 的 `content` 是喂回模型的文本/图,`details` 是结构化日志。映射:我方 `summary`→`content:[{type:"text",text:summary}]`,`data`→`details`。`plan`(干跑预告)仍走我方 onStep,不进 Pi content |
| `AgenticToolExecOpts.signal` | abort 透传 | `execute(_, _, signal, _)` 第 3 参 | ✅ 直接对上 |
| `AgenticToolExecOpts.dryRun` | 干跑标记 | Pi 无此概念 | ✅ 无需 Pi 支持:`dryRun` 由 `decideDryRun` 在**闭包内**算好后包进各 tool 的 execute(execute 内部已判 dryRun,见 deterministic-engine)。Pi 只管调 execute |
| `EngineLlm`(prompt→{text,tokensUsed}) | §6.1 每步推理 LLM 端口 | **无直接对应** —— Pi 不吃「文本补全端口」,吃 `Model<Api>`(在 `AgentLoopConfig.model` / `initialState.model`)+ 可选 `StreamFn` | 🔴 **阻抗不匹配(最需注意)**:我方 seam 把 model-config 预包成 `EngineLlm`(文本进出),但 Pi 要做**原生 function-calling**,必须拿到底层 `Model`(pi-ai 对象),不能用文本补全 wrapper。→ pi-engine **绕过 `input.llm`**,改从 model-config 拿 raw `{baseUrl,token,model,apiFormat}` 自建 pi-ai Model(见 §3)。`input.llm` 仅确定性引擎用 |
| `LoopController`(beginStep/chargeTokens/markX) | 步数+token 硬顶 | `AgentLoopConfig.shouldStopAfterTurn(ctx)=>boolean`;`ctx.message.usage`(pi-ai `Usage{input,output,cacheRead,cacheWrite}`)给真 token | ⚠️ **可桥接但非 1:1**:`shouldStopAfterTurn` 每 turn 后调一次 → 在里面 `controller.beginStep()` 记步 + `controller.chargeTokens(ctx.message.usage.input+output)` 记真 token,任一超顶 return true(诚实停)。注意粒度:Pi 的「turn」= 一次 LLM 调用+其工具批,比我方「step」粗;步数硬顶语义要按 turn 重新标定 |
| `decideDryRun(tool)=>boolean` | 每工具干跑决策 | 干跑本身在 execute 闭包(见上);Pi `beforeToolCall(ctx)=>{block?,reason?}` 是**硬否决**门 | ⚠️ 语义分叉:我方 `decideDryRun` 不 block,只置 dryRun 标记 → 走闭包;Pi `beforeToolCall` 用于**硬拒**(denylist/越权),返回 `{block:true,reason}`。二者都要用,但对应不同护栏 |
| `onStep(text,kind)` | 落 ai_task_steps 步骤流 | `agent.subscribe((event,signal)=>...)` 或低层 loop 的 `EventStream`;事件:`tool_execution_start/update/end`、`turn_start/end`、`message_*`、`agent_start/end` | ✅ 事件流 → onStep 映射清晰:`tool_execution_end`→`onStep(tool 结果,"tool")`、`turn_end`→`onStep(思考,"reason")` 等 |
| `signal`(AbortSignal) | abort 贯通 | `agentLoop(..., signal, ...)` 第 4 参;或高层 `agent.abort()` | ✅ 直接透传 signal 给 agentLoop;或 `input.signal.addEventListener("abort",()=>agent.abort())` |
| `AgenticEngineFinal`(summary/output/steps/stopReason) | 最终产物 | Pi 返回 `AgentMessage[]`(loop)或读 `agent.state.messages`;usage 累加自各 turn | ⚠️ 需**收集器**:遍历 final messages/state 汇总成我方 final 形状,stopReason 由 controller 终止原因给(completed/max_steps/budget_exhausted/aborted) |

**契约总评**:形状对齐度高(seam 本就照 Pi 设计),但有 **3 处真活**:① zod→typebox 参数转换;② `EngineLlm` 端口对 Pi 不够用,pi-engine 要拿 raw model-config 自建 pi-ai Model;③ `LoopController` 经 `shouldStopAfterTurn` 桥接、步数语义按 turn 重标定。另有 seam 注释一处**措辞不准**:注释称 `controller ↔ shouldStopAfterTurn`——对,但 `shouldStopAfterTurn` 只在**低层 `AgentLoopConfig`**,高层 `Agent` 构造项没有;实现应走低层 `agentLoop`。

---

## 2. Pi 事实卡

| 维度 | 事实(已核实) |
|---|---|
| 语言/运行时 | **TypeScript(93.8%)/Node**,纯 JS 包。→ **可库级内嵌进我们的 Node/Next sidecar,无需跨进程**。SPEC §6「库级嵌入最轻」假设成立 |
| 包 | monorepo 发 3 包:`@earendil-works/pi-agent-core`(agent 循环+工具+状态)、`@earendil-works/pi-ai`(统一多 provider LLM API)、`@earendil-works/pi-coding-agent`(CLI,不用)。我们只需前两个 |
| 版本 | 均 `0.80.7`(pi-agent-core 依赖 `pi-ai ^0.80.7`),**v0.80.7 于 2026-07-14 当天发布** |
| 核心 API | `new Agent(AgentOptions)` 高层;`agentLoop(prompts, context, AgentLoopConfig, signal?, streamFn?)` 低层(推荐)。工具 = `AgentTool`(typebox 参数)。事件 = `subscribe`/EventStream。abort = `agent.abort()` 或 loop 的 signal 参 |
| **§6.1 模型回接(硬门)** | ✅ **可满足**。pi-ai 提供 `createProvider({id, auth, models, api})` + `createModels().setProvider(p)` 注册**自定义 OpenAI-compatible / anthropic endpoint**(自带 `baseUrl`)。`KnownProviders` 原生含 **MiniMax(global+China)**。两种 API 我方都用得上:`openAICompletionsApi()`(对应本仓 `apiFormat:"openai_chat"`)与 anthropic-messages API(对应本仓 `apiFormat:"anthropic"`,即用户 MiniMax `https://api.minimaxi.com/anthropic` 那条)。auth 经 `envApiKeyAuth` 或自定义 resolver(`resolve: async()=>({auth:{...}})`)注入 key,可承载我方 `authStyle: bearer\|x-api-key` |
| 依赖树 | pi-agent-core → `pi-ai` + `typebox@1.1.38` + `yaml` + `ignore`(全纯 JS,**无 native addon**)。pi-ai → `openai@6.26.0`、`@anthropic-ai/sdk@0.91.1`、`@aws-sdk/client-bedrock-runtime@3.1048.0`、`@google/genai@1.52.0`、`@mistralai/mistralai@2.2.6`、`typebox`、`http(s)-proxy-agent`、`partial-json`、`@opentelemetry/api`。**各 provider SDK 走 `.lazy` 动态加载**(如 `pi-ai/api/openai-completions.lazy`)——只在真调该 provider 时才 import,不用的家(bedrock/google/mistral)运行时不加载,但仍占 `node_modules` 体积 |
| 打包影响 | 依赖树重(SPEC/pi-engine 注释已诚实记录)。无 native 依赖是关键利好(不像 playwright 有浏览器二进制)。但需按本仓既有动态 import 外置范式处理(见 §4) |
| License | **MIT**(pi-agent-core + pi-ai 均是)。NOTICE 进 app「关于/开源许可」页(SPEC §6/gate-F1 已规划) |
| 维护状态 | **71k star,活跃**,v0.80.7 当天发布。破坏性风险:0.80.x 语义化前(0.x)API 仍可能变,须 **pin 精确版**(`0.80.7`)不用 `^`,升级前跑冒烟 |

---

## 3. 实现 pi-engine.ts 的具体清单

**内嵌方式:库内嵌(in-process),不跨进程**(Pi 是纯 Node 包)。执行器/适配器/护栏零改动,只填 `createPiAgenticEngine`。

1. **装依赖(pin 精确版)**:
   `pnpm --filter @creatoros/backend add @earendil-works/pi-agent-core@0.80.7 @earendil-works/pi-ai@0.80.7`
   ⚠️ pi-ai 精确 pin `@anthropic-ai/sdk@0.91.1`,本仓用 `^0.105.0`;pnpm 会装两份隔离副本(不冲突,增体积)。跑 `pnpm dedupe` 前先确认没把本仓 `ai@7.0.4` dedupe 破坏(MEMORY:ai 须 pin 7.0.4)。

2. **model-config → pi-ai Model(§6.1 回接,核心)**:
   - 在 persistence-client 装配 `buildStreamFn`(或直接建 Model),**不走 `input.llm`**,改调 `resolveLlmConfig(ctx, "agentic")`(或相应 capability)拿 `ResolvedLlmConfig{apiFormat, baseUrl, model, authStyle, token, settings}`。
   - 据 `apiFormat` 分流:`"openai_chat"` → `openAICompletionsApi()`;`"anthropic"` → pi-ai anthropic-messages API。用 `createProvider({id:"creatoros-user", auth:{apiKey:{name,resolve:async()=>({auth: authStyle==="bearer" ? {token} : {apiKey:token}})}}, models:[{id:model, api, provider, baseUrl, ...}], api})` + `createModels().setProvider(p)` + `getModel("creatoros-user", model)`。
   - 把该 Model 塞 `AgentLoopConfig.model`(或 `initialState.model`)。streamFn 默认走 pi-ai `models.streamSimple`;需自定义时才提供 `StreamFn:(model,ctx,opts)=>AssistantMessageEventStream`。
   - 达标验证:一次真 MiniMax 循环烧的是用户配的 provider(base_url+key),不是 Pi 自带。

3. **工具适配 `toPiAgentTool(AgenticTool)=>AgentTool`**:
   - name/label/description 直传;`parameters` = **zod→typebox 转换**(装 `zod-to-json-schema` 转 JSON Schema,再喂 typebox `Type.Unsafe`/或直接用 typebox 重写各 adapter 的 schema;最省事:用 `AgentTool.prepareArguments` 做运行时 shim + 一个宽松 typebox `Type.Object({},{additionalProperties:true})`,校验仍在我方 zod `safeParse`)。
   - `execute:(toolCallId, params, signal, onUpdate)` 包我方 `tool.execute(params, {signal, dryRun: decideDryRun(tool)})`,把结果 map 成 `{content:[{type:"text",text:result.summary}], details:result.data}`。

4. **护栏桥接**:
   - `AgentLoopConfig.shouldStopAfterTurn(ctx)`:`if(!controller.beginStep()) return true; if(!controller.chargeTokens(ctx.message.usage.input+ctx.message.usage.output)) return true; return controller.terminationReason()!=null`。步数硬顶按 turn 重标定。
   - `AgentLoopConfig.beforeToolCall(ctx)`:硬否决门(denylist/越权)→ `{block:true,reason}`;放行返回 undefined。工具白名单已由 `filterToolsToScope` 在**上游物理隔离**(只把在册工具塞 `tools`),此处是纵深防御。
   - abort:`agentLoop(prompts, ctx, config, input.signal, streamFn)` 直接透传 `input.signal`。

5. **事件流 → onStep**:订阅 loop 的 `EventStream`(或 `agent.subscribe`),`for await (const ev of stream)`:`tool_execution_end`→`input.onStep(summary,"tool")`、`turn_end`→`input.onStep(思考摘要,"reason")`、`agent_end`→收尾。

6. **收集 final**:遍历返回的 `AgentMessage[]` / `agent.state` 汇总 `summary`/`output`/`steps=controller.stepsUsed()`/`stopReason=controller.terminationReason()`,返回 `AgenticEngineFinal`。

7. **切引擎**:persistence-client 把 `AgenticExecutorDeps.engine` 从 `createDeterministicAgenticEngine()` 换成 `createPiAgenticEngine({buildStreamFn / buildModel})`。**其余(dispatch/沙箱/确认卡/白名单/步骤流)零改动**。

---

## 4. 风险与未决

| 风险 | 评级 | 说明 / 缓解 |
|---|---|---|
| **打包 sidecar 里能否跑** | 中(已知坑,有先例) | Pi 走**动态 import**(pi-engine 已用 `import(/*webpackIgnore*/ specifier)`,同 video-render `resolveHyperframesCli`)。必须 ① 把 `@earendil-works/pi-agent-core`+`@earendil-works/pi-ai`(及其 `openai` 等真用到的 SDK)加进 `frontend/next.config.ts` 的 `serverExternalPackages`(现有列表已含 playwright/hyperframes/ai/@ai-sdk/*,加两项即可);② 打包时 `scripts/desktop/build-sidecar.mjs` **实拷**这些包到 sidecar(Next tracing 对动态 import 会漏/给 .pnpm 残缺版——该脚本 T-254c 已为 playwright/hyperframes 建了「覆盖 Next-traced 残缺版」机制,pi 复用同一机制)。MEMORY「desktop-packaging-sidecar-playwright」「verify-through-real-call-path」正是这条。**打包版必隔离验证**(dev/单测≠分发跑通) |
| native 依赖 | 低(利好) | pi 依赖树**全纯 JS,无 native addon**(不像 playwright 的浏览器二进制)。这是最大利好,打包比 playwright 简单 |
| 依赖体积 / SDK 冗余 | 低-中 | pi-ai 拖 openai/bedrock/google/mistral/anthropic 5 家 SDK;`.lazy` 保证运行时只加载真用的家,但 `node_modules`/打包体积增(bedrock+google 尤大)。可评估 external 时只实拷真用到的家(openai 或 anthropic) |
| `@anthropic-ai/sdk` 版本双份 | 低 | pi-ai pin `0.91.1` vs 本仓 `^0.105.0`;pnpm 隔离装两份不冲突,仅增体积。别强 dedupe 到单版(可能破 pi-ai 或本仓 ai runtime) |
| 版本漂移(0.x) | 中 | 0.80.x 仍前语义化版,API 可能变;**pin 精确版**,升级前跑真机冒烟(一条 MiniMax 循环)。71k star + 日更 = 活跃但快 |
| 步数语义按 turn 重标定 | 低 | Pi「turn」比我方「step」粗;`maxSteps` 硬顶要按 turn 语义重设缺省值,否则一个 turn 内多工具会突破直觉。单测锚定 |
| §6.1 gate-M2 达标线 | 中(产品风险非技术) | SPEC §8/§9:MiniMax 弱模型下真循环须「多步不崩/不无限绕/产出可用候选」。技术接通≠达标;接完须按 gate-M2 真机验一条 MiniMax 调研循环,**不达标退回 material.gather 结构化多发**(SPEC 已留门) |

**未决(须装好包后现场核实)**:① pi-ai custom provider 对 `authStyle:"bearer"`(MiniMax relay)的 auth 注入确切写法(`createProvider` auth resolver 返回结构);② anthropic-messages custom-baseUrl provider 是否原样透传我方 `baseUrl`(还是只认 KnownProvider MiniMax);③ zod→typebox 选型(转换库 vs 各 adapter 直接改写 typebox schema);④ turn 内并行工具(`toolExecution:"parallel"`)是否要关成 `"sequential"` 以配合限流端口。

---

## 5. SPEC §6 假设复核

| SPEC §6 假设 | 是否成立 | 证据 |
|---|---|---|
| Pi 是 MIT | ✅ | pi-agent-core + pi-ai npm `license: MIT` |
| 库级嵌入最轻(可 in-process 进 Node sidecar) | ✅ | 纯 TS/Node 包,无 native,`import()` 即用。**不需要跨进程/子进程**(SPEC 未假设 Python,也确非 Python) |
| 默认 4 工具契合白名单 | ✅(不受影响) | Pi core 不预置工具,`tools` 全由我方注入 = 天然契合工具白名单物理隔离 |
| §6.1 引擎回接 model-config(自定义 base_url+key) | ✅ | pi-ai `createProvider`+`baseUrl`+auth resolver 支持自定义 endpoint;MiniMax 原生 KnownProvider;两种 apiFormat 均覆盖。**该引擎不淘汰** |
| 集成=executor 一种,dispatch/沙箱/确认卡/步骤流零改动 | ✅ | seam 设计已隔离;只填 pi-engine + 切 `deps.engine` |

**无站不住的假设**,无需替代路径。唯一需修正的是 seam 内部一处**实现措辞**(非 SPEC 假设):`EngineLlm` 文本端口对 Pi 不够用,pi-engine 须拿 raw `ResolvedLlmConfig` 自建 pi-ai Model——这不改 SPEC 结论,只是 §3 已给出的实现细节。

---

## 附:关键 Pi 类型(核实自 `dist/*.d.ts`,存档备查)

```ts
// pi-agent-core types.d.ts
type StreamFn = (model: Model<Api>, context: Context, options?: SimpleStreamOptions)
  => AssistantMessageEventStream | Promise<AssistantMessageEventStream>;

interface AgentLoopConfig extends SimpleStreamOptions {
  model: Model<any>;
  convertToLlm: (messages: AgentMessage[]) => Message[] | Promise<Message[]>;
  transformContext?: (m, signal?) => Promise<AgentMessage[]>;
  getApiKey?: (provider: string) => Promise<string|undefined>|string|undefined;
  shouldStopAfterTurn?: (ctx: ShouldStopAfterTurnContext) => boolean | Promise<boolean>;
  prepareNextTurn?: (ctx) => AgentLoopTurnUpdate | undefined | Promise<...>;
  beforeToolCall?: (ctx: BeforeToolCallContext, signal?) => Promise<BeforeToolCallResult|undefined>;
  afterToolCall?:  (ctx: AfterToolCallContext, signal?) => Promise<AfterToolCallResult|undefined>;
  // + getSteeringMessages / getFollowUpMessages / toolExecution ...
}
interface BeforeToolCallResult { block?: boolean; reason?: string; }
interface ShouldStopAfterTurnContext { message: AssistantMessage; toolResults: ToolResultMessage[]; context: AgentContext; newMessages: AgentMessage[]; }

interface AgentTool<TParameters extends TSchema = TSchema, TDetails = any> extends Tool<TParameters> {
  label: string;
  prepareArguments?: (args: unknown) => Static<TParameters>;
  execute: (toolCallId: string, params: Static<TParameters>, signal?: AbortSignal, onUpdate?: AgentToolUpdateCallback<TDetails>) => Promise<AgentToolResult<TDetails>>;
  executionMode?: ToolExecutionMode;
}
interface Tool<TParameters extends TSchema = TSchema> { name: string; description: string; parameters: TParameters; } // typebox
interface AgentToolResult<T> { content: (TextContent|ImageContent)[]; details: T; addedToolNames?: string[]; terminate?: boolean; }

// pi-ai types.d.ts
interface Usage { input: number; output: number; cacheRead: number; cacheWrite: number; cacheWrite1h?: number; /* +reasoning */ }
// AssistantMessage.usage: Usage  ← 真 token 来源(喂 controller.chargeTokens)

agentLoop(prompts: AgentMessage[], context: AgentContext, config: AgentLoopConfig, signal?: AbortSignal, streamFn?: StreamFn): EventStream<AgentEvent, AgentMessage[]>;
```

pi-ai 自定义 OpenAI-compatible provider(§6.1 落地样例):
```ts
import { createModels, createProvider, envApiKeyAuth } from '@earendil-works/pi-ai';
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy';
const provider = createProvider({
  id: 'creatoros-user',
  auth: { apiKey: envApiKeyAuth('User Key', ['CREATOROS_...']) }, // 或自定义 resolve 承载 token/authStyle
  models: [{ id: model, name: model, api: 'openai-completions', provider: 'creatoros-user', baseUrl, reasoning:false, input:['text'], cost:{...}, contextWindow, maxTokens }],
  api: openAICompletionsApi(),
});
const models = createModels(); models.setProvider(provider);
const m = models.getModel('creatoros-user', model)!;
```
