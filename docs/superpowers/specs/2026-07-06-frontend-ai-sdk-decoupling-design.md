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

### 3.3 边界与契约
- 非流式 AI(26 runner 的 ai_task)已走 dispatch/contract seam —— runner 搬 backend 后,前端经 `ai.request` 起任务不变(边界已对)。
- 流式 chat 加一个 backend 流式端点 + 前端薄代理(唯一新增边界)。
- `conversation-persistence` 的 UIMessage 类型 → contract 或 backend 导出的共享类型,前端不再 `from "ai"`。

### 3.4 桌面化落点(T-147)
- backend 成受保护进程(sidecar / 加密),持有 prompt 模板 + 模型 key;前端 = Tauri 壳只 UI。
- 本 SPEC 只做「解耦」(逻辑搬到边界正确的一侧);**加密/防逆向是 T-147 P4/P6 的事**,不在本 SPEC(但解耦是其前置)。

## 4. 规模与打法
- **大**(26 runner + 流式重构 + 类型迁移)。按铁律「一次 0→1、不分阶段」:一把做完,但用**并行 subagent**分片搬 runner(按领域分组,worktree 隔离防冲突)+ 主 agent 做流式边界 + 验收。
- 搬 runner 是机械迁移(逻辑不变,改包位置 + import),适合并行子代理;流式边界是设计活,主做。

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
**改架构(AI 逻辑归属包边界迁移)——按铁律必须过 spec-review gate(verdict≠FAIL)才准开工**。reviewer 见 orchestrator `prompts/spec-reviewer.md`。过审后拆 Task(按领域分片 runner 迁移 + 流式边界)进 BACKLOG 再开工。
