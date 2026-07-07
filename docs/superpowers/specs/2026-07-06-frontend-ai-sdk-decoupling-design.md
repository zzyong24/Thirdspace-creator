# SPEC — 前端 AI SDK 解耦:AI 逻辑下沉 backend,前端只留 UI(T-163,源 T-145 A1-4)

> 状态:**待过 spec-review gate**(改架构,铁律)· 2026-07-06 · 关联 T-147(桌面化资产保护)/T-134
> 一句话:把「直连 Vercel AI SDK + 26 个 AI runner」从前端包搬进 backend,前端/客户端只留 UI + 薄代理,**prompt / 模型 key / AI 逻辑永不过客户端边界**。

## 1. 问题(核查已剔误报,真实规模)

- **4 条真债**(门卫假阳修掉后的真实数,非当初「30+」):
  1. `frontend/src/app/api/chat/route.ts` — `import {UIMessage} from "ai"` + `streamText` + `toUIMessageStreamResponse`(chat 流式路由)。
  2. `frontend/src/features/copilot/ai-copilot-content.tsx` — `useChat` from `@ai-sdk/react`(**客户端组件**,流式对话 UI)。
  3. `frontend/src/features/copilot/conversation-persistence.ts` — `import type {UIMessage} from "ai"`。
  4. `frontend/src/server/ai/chat-runner.ts` + `chat-tools.ts` — `tool/jsonSchema from "ai"`。
- **26 个 AI runner** 全在 `frontend/src/server/ai/*-runner.ts`(topic/script/positioning/review/planning/knowledge/calibration/reconstruct/research/material/transcribe…)——AI 生成逻辑住在**前端包**。
- **为什么是债(桌面化视角 T-147)**:现在 AI 跑在 Next **server 层**(非浏览器,key 不在前端 bundle)。但桌面化(Tauri)把「前端」整包塞进客户端应用 → **server 层逻辑 + prompt 模板 + 模型 key 可被逆向/提取**。真护城河(T-147)要求 AI 逻辑在**受保护的 backend 进程/sidecar**里,客户端只经边界调用,永不持有 prompt/key。

## 2. 目标

- 26 runner + 4 条 AI SDK 直连**下沉 backend 包**(或独立 ai-service),AI SDK 只在 backend 出现。
- 前端只留:①对话 UI(`useChat` hook,纯渲染 + 流消费)②**薄代理路由**(把流从 backend 转给客户端)。
- 客户端边界外**看不到** prompt 模板、模型 provider/key、runner 逻辑。
- 桌面化时 backend = 受保护 sidecar(接 T-147),前端 = 壳。

## 3. 设计

### 3.1 runner 下沉
- 26 个 `frontend/src/server/ai/*-runner.ts` → `backend/src/modules/ai/runners/`(或就近各领域模块)。它们已走 `dispatch → ai.request(createAITask) → runXxxTask`(live dispatch,memo:ai-task-execution-live-dispatch)——**dispatch seam 已在**,搬的是 runner 实现 + 其 ai-worker 模板调用(`getTemplate/runStructuredNode`)。
- ai-worker(模板 REGISTRY + runStructuredNode)本就是独立包 —— runner 从 backend 调它,天然不经前端。
- 前端 `persistence-client.ts` 里注册 runner 的装配 → 迁到 backend 的 ai 模块装配。

### 3.2 chat 流式(最难:实时流 UX 不能丢)
现状:客户端 `useChat` → `POST /api/chat`(前端路由,`streamText` 流式)→ UIMessage stream。
目标:`streamText` 跑在 backend,但客户端仍拿到实时流。方案:
- **backend 出流式端点**(`/ai/chat/stream`,SSE/ReadableStream),`streamText` + chat-tools 在 backend。
- 前端 `/api/chat` 降级为**薄代理**:鉴权(session cookie)后把请求转发 backend 流式端点,**原样透传流**回 `useChat`。前端路由不再 import `ai`,只转发字节流。
- `useChat`(@ai-sdk/react)留前端(纯客户端 UI 库,不含 prompt/key,消费标准 UIMessage stream)——**这条可留**(它只是流消费 UI,非「AI 逻辑」);`UIMessage` 类型走 contract 共享类型或 backend 导出。
- **判断**:真正要下沉的是 `streamText`/`tool`/`jsonSchema`/prompt(AI 逻辑)。`useChat` 客户端 hook 是 UI,保留合理(边界清:客户端只发消息+渲流,backend 做生成)。
- **⚠️ gate 关切③坐实:backend 现无任何 SSE/流式能力**(grep `text/event-stream`/`ReadableStream`/`streamText` 在 backend 零命中)——**这条是新造能力,非复用,是全链最脆一环**。必须补的设计:
  - **协议**:backend 流式端点用 `streamText().toUIMessageStreamResponse()`(SSE)直出,前端薄代理**原样透传 `Response.body` 字节流**(不缓冲、不解析、保留 SSE 头)。
  - **鉴权落点**:薄代理侧先验 session cookie → 解析 ctx → 转发时带 ctx(header/内部 token)给 backend 流式端点;backend 不再自己碰 cookie。
  - **验收标准**(不能只「单测透传」):真起 backend + 前端,`useChat` 端到端发一条 → 流式逐字回显 → onFinish 落库 conversation/message,与迁移前**逐字节行为一致**;断流/超时/取消路径不崩。

### 3.3 边界与契约(⚠️ gate 关切②修正:runner 分两类,边界不都对)
**核实(2026-07-06,gate 关切②坐实)**:26 runner 分**两类**,迁移工作量/回归面差很多:
- **A. 后台队列类**(transcribe/reconstruct/asset-generate/topic/planning/calibration/script/review/platform-adapt/material…):经 `persistence-client` 里 `void runXxx` → `ai.tasks.create` **dispatch seam** 起 ai_task。**这批边界已对**,搬 backend = 机械迁移(改包位置 + import),前端经 `ai.request` 起任务不变。
- **B. 在线同步类**(**5 条**:`knowledge/classify`、`knowledge/distill`、`knowledge/relate`、`knowledge/comment-sift`、`chat`):在前端 route 里**直接 `await runXxx(...)` 同步调**,**不走 dispatch seam**。搬 backend 需**新建同步跨包调用边界**(RPC/端口/新契约 op)—— 这是**设计活、有回归面**,不是机械搬。
- `conversation-persistence` 的 UIMessage 类型 → contract 或 backend 导出的共享类型,前端不再 `from "ai"`。

### 3.5 B 类同步 runner 的新边界(gate 关切②)
5 条同步 runner 搬 backend,给每条设计同步调用边界:
- 走既有 **dispatch/contract 机制的同步变体**:加同步 op(如 `knowledge.classify`/`knowledge.distill` 等 contract endpoint,backend transport 同步返回结果),前端 route 从「直接 import runner」改「经 client 调该 op」。或
- 若某条本就该异步(如 distill 可后台化)→ 改走 ai_task dispatch(归 A 类)。逐条判。
- **chat 见 §3.2**(流式,单独处理,最重)。
- **这批不适合「纯机械并行 subagent」**——每条要设计边界 + 迁测,主 agent 主导(见 §4 修正)。

### 3.4 桌面化落点(T-147)
- backend 成受保护进程(sidecar / 加密),持有 prompt 模板 + 模型 key;前端 = Tauri 壳只 UI。
- 本 SPEC 只做「解耦」(逻辑搬到边界正确的一侧);**加密/防逆向是 T-147 P4/P6 的事**,不在本 SPEC(但解耦是其前置)。

## 4. 规模与打法(gate 关切②修正:非全机械,分层)
- **大**(26 runner + 5 条同步边界 + chat 流式新造 + 类型迁移)。按铁律「一次 0→1、不分阶段」,但**分层不同打法**(不是一律「机械并行 subagent」):
  1. **A 类后台队列 runner(~21 条)** = 机械迁移(改包位置+import,dispatch 边界已对)→ **并行 subagent 分片搬**(worktree 隔离),每条迁测跟着走。
  2. **B 类同步 runner(4 条 knowledge/comment-sift)** = 每条要**设计新同步边界**(§3.5)→ **主 agent 主导 or 逐条谨慎 subagent**(非纯机械并行,会踩新边界的协同)。
  3. **chat 流式(1 条,最脆)** = **主 agent 做**(§3.2 新造 SSE 端点 + 薄代理 + 端到端验收)。
- **拆 Task 粒度按此分层**,别把 B/chat 当 A 的机械粒度切(gate 关切②:低估回归)。

## 5. 测试
- 每个 runner 迁后其既有测试跟着迁 + 绿(行为不变)。
- 流式:backend 流式端点单测 + 前端薄代理转发测(流字节透传)。
- 边界守卫:`boundary-scan` 重收 baseline —— 前端包不再有 `from "ai"`/`@ai-sdk`(除 `@ai-sdk/react` 的 useChat UI,若保留则白名单标注)。
- 全链回归:chat 流式端到端(客户端发→backend 生成→流回)+ 26 runner 的 ai_task dispatch 不破。

## 6. 不做(YAGNI / 划界)
- 加密 / 防逆向(T-147 P4/P6)。
- `useChat`(@ai-sdk/react)客户端 UI hook 的替换(它是 UI 非 AI 逻辑,保留;仅白名单标注)。
- 模型 provider 抽象重写(model-config 已在,不动)。

## 7. Gate
**改架构 → 必须过 spec-review gate(verdict≠FAIL)才准开工。**

**首审(2026-07-06)= CONCERNS,3 项处置进度:**
- **① 动机与 [D4] 冲突 → ✅ 已解**:gate 依 SPEC 里误记的 [D4]「接受可逆向」判动机悬空;用户 2026-07-06 澄清「prompt 可改 ≠ 接受可逆向,要保护」,**[D4] 已更正**(见桌面总纲 §5.5),逻辑下沉保护动机成立,T-163 归 T-147 保护套件。
- **② 「边界已对」对同步 runner 证伪 → ✅ 本版处置**:§3.3 区分 A 后台队列(机械搬)/ B 5 条同步(knowledge×4+chat,需新同步边界)+ §3.5 给 B 类设计边界 + §4 打法分层(非一律机械并行)。
- **③ chat 流式是新造能力 → ✅ 本版处置**:§3.2 坐实 backend 无 SSE、补协议(toUIMessageStreamResponse 透传)+ 鉴权落点 + 端到端验收标准。

**下一步**:本改版**重过 gate**;≠FAIL 后按 §4 分层拆 Task(A 并行 / B 主导 / chat 主做)进 BACKLOG 开工。
