# T-313 点亮 Pi 引擎 —— 实现笔记(备主 agent 复核)

- 日期:2026-07-14
- 任务:T-313(SPEC [2026-07-14-pi-runtime-full-integration-design.md](../superpowers/specs/2026-07-14-pi-runtime-full-integration-design.md) §10 P0 切片)
- 结论:`pi-engine.ts` 已真接 `@earendil-works/pi-coding-agent@0.80.7` 的 `createAgentSession()`,agentic 循环真跑 Pi(默认带确定性兜底)。**三端 tsc 绿 + backend 54 单测绿(pi-engine 11 条)**。真网络 gate-M2(MiniMax 真 key)留主 agent 真机验。

---

## 1. verify-exists:engine.ts 真实契约(以代码为准)

`backend/src/modules/execution/agentic/engine.ts` 的 `AgenticEngineRunInput`(逐字段,SPEC 断言基本一致):
- `goal: string` / `systemPrompt: string`
- `tools: readonly AgenticTool[]`(白名单;上游 `filterToolsToScope` 已物理隔离)
- `llm: EngineLlm`(文本端口,**确定性引擎用**;Pi 不用)
- **`llmConfig?: RawLlmConfig`(本任务新增,engine.ts:113)** —— §6.1 raw config,Pi 自建 provider 用
- `controller: LoopController`(`beginStep()`/`chargeTokens(n)`/`markCompleted/Aborted()`/`terminationReason()`)
- `decideDryRun: (tool) => boolean`
- `onStep: (text, kind?) => Promise<void>`
- `signal: AbortSignal`

`AgenticTool`(engine.ts:51):`name/label/description/effect/parameters(z.ZodTypeAny)/execute(input,{signal,dryRun})/planInput?`。
`AgenticEngineFinal`(engine.ts:113→127 区):`summary/output(Record)/steps(number)/stopReason(string)`。
`AgenticEngine`:`{ readonly name; run(input): Promise<AgenticEngineFinal> }`。

各"已建"组件真实位置(全部核实存在,SPEC §1.1 属实):
- `deterministic-engine.ts`(兜底=实现打样)、`agentic-executor.ts:137` 调 `engine.run`、`loop-control.ts`(LoopController)、`tool-scopes.ts`(filterToolsToScope)、`adapters/{research,collection,material}-adapter.ts`(工具形状)。
- model-config:`backend/src/modules/ai-runtime/llm/provider.ts:7` `ResolvedLlmConfig{apiFormat,baseUrl,model,authStyle,token,settings}`;`resolve.ts:75` `resolveLlmConfig`。
- 装配点:`frontend/src/server/persistence-client.ts:6908`(原 `createDeterministicAgenticEngine()`,已切 Pi)。

**SPEC 断言与代码的出入**:
- 研究报告选低层 `agentLoop`/`pi-agent-core`;SPEC §2 改选 `pi-coding-agent` 的 `createAgentSession`。**按 SPEC 走 coding-agent**(记忆/会话/skill 全在这层)。`AgentSession` **不暴露** `shouldStopAfterTurn`/`beforeToolCall`(那是低层 `Agent`/`AgentLoopConfig`);故 LoopController 桥接改走 **`session.subscribe` 的 `turn_end` 事件 + `session.abort()`**(见 §4)。
- 研究 §3 的 pi-ai `createProvider` 样例**不用**;coding-agent 有更高层的 `ModelRegistry.registerProvider`(pi 自己的 custom-provider 机制),更省事更稳(见 §3)。

---

## 2. headless 可嵌性(决定成败)——结论:可嵌,但必须深导入

- barrel `dist/index.js` **eager 载 TUI**(`modes/interactive/components` + `main.js` + theme)→ headless 不该走它。
- `createAgentSession` 在 `dist/core/sdk.js`;它→`agent-session.js`→`modes/interactive/theme/theme.js`→`@earendil-works/pi-tui` 的 `getCapabilities`。**实测无 TTY(stdin/stdout 非 TTY)深导入 `dist/core/sdk.js` 干净加载(2.6s 首次),`getCapabilities` 不崩、photon-node 不触发。**
- package.json `exports` 只列 `.` + `./rpc-entry` → **深子路径 import 被 exports 挡**;故运行时用 **确定性 fs 定位(T-289 同款,不用 require.resolve——混淆 bundle 会返数字模块 ID)** 找到 `dist/core/` 绝对路径,再 `import(pathToFileURL(...).href)`(`/* webpackIgnore */`)。定位覆盖:直连 symlink + `.pnpm`(scope `/`→`+` 编码)。已验证从 **frontend cwd** 也能经 `../node_modules/.pnpm` 命中(dev + 打包都行)。
- **未退 pi-agent-core 低层方案**(coding-agent SDK 干净可嵌,无需退)。

## 3. §6.1 model-config 回接(确切写法,装了才知道)

**不用** pi-ai `createProvider`;用 coding-agent 的 `ModelRegistry.registerProvider(name, config)`:
```
config = { name, api, baseUrl, apiKey, authHeader?, streamSimple?, models:[{id,name,api,reasoning,input,cost,contextWindow,maxTokens}] }
```
- `api`:`anthropic`→`"anthropic-messages"`;`openai_chat`→`"openai-completions"`(`piApiForFormat`)。
- `baseUrl`:**registerProvider 定义 models 时必需**;`baseUrl===null`(anthropic 官方)→ 补 `https://api.anthropic.com`(openai 补 `.../v1`)。model.baseUrl = config.baseUrl 透传(applyProviderConfig)。
- **authStyle 分流(§6.1 auth resolver 的确切写法)**:
  - `bearer` **且** apiFormat=anthropic(relay/MiniMax)→ `authHeader:true` → pi 注入 `Authorization: Bearer <token>`(实测 `getApiKeyAndHeaders` 返回 `{apiKey, headers:{Authorization:"Bearer k"}}`)。
  - `x-api-key`(anthropic 官方)→ 不置 authHeader → anthropic api 默认用 apiKey 发 `x-api-key`。
  - openai_chat → 不置 authHeader(openai api 默认 Bearer,置了会双 Authorization)。
- **anthropic custom-baseUrl 透传(SPEC §12 未决③)= 成立**:实测 custom provider(api=anthropic-messages,dead baseUrl)`session.prompt` 真发 HTTP 到该 baseUrl(报 `Connection error`),证明 pi 内建 anthropic-messages api **对 custom provider 生效** + baseUrl/bearer 真透传。→ 生产真烧用户 provider(gate-M1 机制通;真成功需真 key)。
- 纯函数 `buildPiProviderRegistration(llmConfig, opts)` 导出,单测锚定 3 分支。

## 4. LoopController 桥接 + customTools 盖自带工具(L3)

**L3 物理排除(SPEC §9 硬约束)= 可验证**:`createAgentSession({ noTools:"builtin", excludeTools:["read","bash","edit","write","ls","grep","find"], customTools })`。
- ⚠️ **是 `"builtin"` 不是 `"all"`**:`"all"` 会连 customTools 一起禁掉(实测 getAllTools=[]);`"builtin"` 才是"禁自带编码工具、留 customTools"。
- 单测 `pi-engine.test.ts` 断言:真 `createAgentSession` 后 `getAllTools()` = `["web.search"]`,`read/bash/edit/write/...` **均不在**工具注册表(不是靠提示词)。→ Pi 物理写不到 app 源码。

**LoopController 桥接**:`session.subscribe` 的 `turn_end` 事件带 `message.usage{input,output}`(实测)。每 `turn_end`:`beginStep()`(超顶→`session.abort()`+stopReason max_steps)+ `chargeTokens(usage.input+output)`(超顶→abort+budget_exhausted)。**abort 异步 → ≤1 turn 余量**(turn 比 step 粗,研究已警;单测断言 `steps ≤ maxSteps+1`,绝不无限绕)。

**customTools 映射**:zod `parameters` → `z.toJSONSchema(schema,{io:"input",unrepresentable:"any"})` 去 `$schema` = 纯 JSON Schema(pi `validateToolArguments` 走**非-TypeBox 分支**校验+coerce)。**关键坑**:默认 `io:"output"` 会把带 `.default()` 的字段塞进 `required` → pi 拒合法调用;`io:"input"` 修正。**权威校验仍在 execute 内我方 zod `safeParse`**(应用 default/transform/strip),不合法回错给模型(可重试)。`executionMode:"sequential"`(配合限流端口,SPEC §12 未决④拍板顺序)。

**其他**:`setAutoRetryEnabled(false)`(pi 自带 auto-retry 会不受预算约束绕圈 + 报错不及时浮现;retry 交我方端口/预算)。LLM 报错(末条 assistant `stopReason:"error"`)→ 诚实标 `llm_error`(不假 completed)。abort:`input.signal`→`session.abort()`。final:`getLastAssistantText()` + `getSessionStats().tokens`。

## 5. 改了哪些文件 + 验证

| 文件 | 改动 |
|---|---|
| `backend/.../agentic/engine.ts` | +`RawLlmConfig` 类型 + `AgenticEngineRunInput.llmConfig?`(结构类型,不 import ai 层) |
| `backend/.../agentic/agentic-executor.ts` | deps +`resolveLlmConfig?`;run 里 `await` 后注入 `input.llmConfig` |
| `backend/.../agentic/pi-engine.ts` | **全实现**(fs 定位深导入 + §6.1 registerProvider + customTools + LoopController 桥接 + 事件→onStep + abort + llm_error + 退兜底) |
| `backend/.../agentic/pi-engine.test.ts` | 新增 11 条(provider 映射纯函数 / zodToPiParameters / 退兜底×2 / 真 SDK:L3 排除 / faux 循环 / 步数硬顶 / 生产 api 路径+llm_error) |
| `backend/package.json` + `pnpm-lock.yaml` | +`@earendil-works/pi-coding-agent@0.80.7` +`@earendil-works/pi-ai@0.80.7`(pin) |
| `frontend/src/server/persistence-client.ts` | 引擎切 `createPiAgenticEngine({fallback:deterministic})` + 3 executor 传 `resolveLlmConfig`(**保留确定性兜底**) |
| `frontend/next.config.ts` | `serverExternalPackages` +4 pi 包(标注 build-sidecar 需实拷,打包本身留主 agent) |

验证:backend `tsc --noEmit` 绿;`vitest run agentic/` **54 绿**;frontend `next typegen && tsc` 我方两文件 0 error(其余全 pre-existing vitest/next 模块解析噪声);`ai@7.0.4` importers 未动(pnpm-lock diff 确认,dedupe 未破);pi 包 pin 精确 0.80.7。

## 6. 卡点 / 未决(留主 agent)

1. **gate-M2 真网络未验**:无 MiniMax key + 任务禁起 dev/碰打包 app。需主 agent 真机跑一条 `agentic.research` MiniMax 循环(多步不崩/不无限绕/产出可用候选);不达标退 material.gather(SPEC 留门)。
2. **打包实拷未做**(SPEC §3.4,任务明确留主 agent):`build-sidecar.mjs` 须**实拷完整** `@earendil-works/pi-coding-agent`+`pi-ai`+`pi-agent-core`+`pi-tui`+`photon-node`+真用到的 provider SDK(openai / @anthropic-ai/sdk),含 `dist` 全树(pi-engine 深导入 `dist/core/*.js`,Next tracing 对 file-URL import 会漏)。复用 playwright/hyperframes「覆盖 Next-traced 残缺版」机制。**打包版必隔离验证**。
3. **node engine 警告**:pi 包 `engines.node>=25`,本机/sidecar 跑 v22 —— 仅 advisory(纯 JS 包,单测/probe 全跑通);若打包 node 版本 <25 观察运行时。
4. **photon-node(wasm)/pi-tui 打包**:headless 未触发 photon(仅 image 工具用);sdk.js 链路只拉 pi-tui `getCapabilities`(纯探测,已验无 TTY 安全)。打包实拷需带上但运行时不 eager 加载 TUI(深导入绕开 barrel)。
5. **turn 粒度余量**:步数硬顶按 turn 重标定,abort 异步 ≤1 turn 余量(已单测锚 `≤maxSteps+1`);若产品要精确到步,需低层 `Agent` 的 `shouldStopAfterTurn`(coding-agent 未暴露,得下沉 pi-agent-core,不在本切片)。
6. **未接**:记忆层(T-315)/会话续(T-316)/偏好捕捉(T-317)/skill 进化(T-318)—— 本切片只点亮引擎;`sessionManager: inMemory()`(会话不落盘,待 T-316 指 appDataDir)。

## 7. 打包实拷落地(T-313 收尾,子代理 2026-07-14 补)

**证实 §6 未决②的假设**:重建的 sidecar `.pnpm` 里 pi 树 **0 个**(pi-coding-agent / openai / chalk / debug / ws 全无)—— Next standalone tracing 对 `serverExternalPackages` + file-URL 深导入的 pi 整棵树完全没拖进来。已在 `build-sidecar.mjs` 加 `bundlePiEngine()`(照 playwright/gsap 三件套)。

**依赖闭包(build 时算,不硬编码版本名)**:从源 `.pnpm` 的 pi-coding-agent 条目 BFS 走 pnpm symlink 依赖图 → 收全可达 entry。pi 版本一升 peer-suffix 目录名全变,硬编码会静默失配,故自适应算。

**L3 剪枝(省 ~91MB)**:装 0.80.7 现场核实——pi-ai 的 provider api 全走 `*.lazy.js`(compat.js 静态只引 lazy shim),具体 provider `.js` 运行时才动态 import;CreatorOS 的 `piApiForFormat` 只产 `anthropic-messages` / `openai-completions` 两种 api → bedrock/google/mistral **永不被 import**。故剪掉这三个 provider 顶包(连带独占传递依赖 @smithy/@aws-sdk/@google/genai/@mistralai/@protobufjs/google-auth-library 等)。**openai + @anthropic-ai/sdk 必留**(两格式各需一)。剪枝安全网 = 自检真深导入 sdk.js,剪多了 import 崩 → build 失败。

- **闭包**:61 entry(全量 218 → 剪 157;去重 61 包)。~90MB(verbatimSymlinks 共享依赖只存一份;若 dereference 会既撑大又断深传递解析链)。
- **拷法**:逐 entry `cpSync(verbatimSymlinks:true)` 进 `SIDECAR_RUNTIME/node_modules/.pnpm/<entry>`(保 `../../<dep>@ver` 相对链,整份闭包同 `.pnpm/` 内自洽解析);目标 = pi-engine `locatePiCoreDir()` 的 root② `../node_modules/.pnpm/...` 分支。
- **photon-node wasm**:`photon_rs_bg.wasm`(1.9MB)纯文件,verbatim 已覆盖 + 硬自检文件在。
- **HARD 自检**:sidecar node deep-import sdk.js + model-registry/auth-storage/session-manager,断言 `createAgentSession` 是函数 + 三注册表在 → `PI-SELFCHECK-OK`。假通过零容忍。

**验证结果**:
- `build-sidecar` 单跑:实拷 61 entry + photon wasm 到位 + 深导入自检 `PI-SELFCHECK-OK`。
- `pnpm desktop:package`(**`CREATOROS_SKIP_SMOKE=1`**——step 2.5 冒烟真起 sidecar 且未隔离 DB dir,会与 51661 上正跑的打包 app 抢同一 PGlite 单写者库,任务硬禁,故跳过运行时冒烟):`CreatorOS.app` + `.dmg` **成功 bundle**;仅在**其后**的 updater 签名步失败(`no private key / TAURI_SIGNING_PRIVATE_KEY`)—— 与 pi 无关,是既有「未签名/占位」P6 边界(需用户证书)。
- 文件级:`CreatorOS.app/Contents/Resources/sidecar.tar.gz`(315MB)内含 `pi-coding-agent/dist/core/sdk.js` + pi-ai/compat.js + pi-agent-core/pi-tui + openai + @anthropic-ai/sdk@0.91.1 + typebox + photon wasm。
- **import 级(用打包产物的 node)**:解压 tarball 到 scratch,`server.app/Contents/MacOS/creatoros-server`(+DYLD_LIBRARY_PATH→lib/libnode.127.dylib)深导入 sdk.js → `createAgentSession=function` + ModelRegistry/AuthStorage/SessionManager 全在;两运行时 provider api（anthropic-messages / openai-completions）`streamSimple=function` → `PACKAGED-IMPORT-SMOKE-OK`。

**改动**:`frontend/scripts/desktop/build-sidecar.mjs` +`readlinkSync` import + `bundlePiEngine()` 函数 + main() 里在 `bundleRenderDeps()` 后调用。**未 commit**(留主 agent 复核)。

**留主 agent**:运行时验(启 app 真跑一条 `agentic.research` 循环,证打包版 Pi 引擎不再退兜底、真接上 model-config provider)。updater 签名是既有独立问题(配 `TAURI_SIGNING_PRIVATE_KEY`),与本切片无关。
