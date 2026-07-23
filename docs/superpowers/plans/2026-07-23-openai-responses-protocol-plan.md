# OpenAI Responses Protocol Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 CreatorOS 把 `openai_responses` 作为可保存、可测试、可执行的正式协议，并以 New API 的 `/v1/responses` 兼容实现为目标。

**Architecture:** `apiFormat` 继续作为协议族开关，不按供应商名分支。`openai_chat` 显式调用 Chat Completions，`openai_responses` 显式调用 Responses；两者共享现有模型配置、密钥和 `baseUrl`，不新增数据库列。设置页、组合根测试连接和 Pi Agent 使用同一枚举，避免一条链保存 Responses、另一条链悄悄退回 Chat。

**Tech Stack:** TypeScript、Zod contract、Vercel AI SDK 6 / `@ai-sdk/openai` 4、`@earendil-works/pi-ai` 0.80、Vitest、Next.js。

---

### Task 1: 打通协议类型与持久化边界

**Files:**
- Modify: `contract/src/resources/settings.ts`
- Modify: `contract/src/operations/settings.ts`
- Modify: `backend/src/modules/settings/settings.repository.ts`
- Modify: `backend/src/modules/settings/settings.service.ts`
- Modify: `backend/src/modules/ai-runtime/llm/provider.ts`
- Modify: `backend/src/modules/execution/agentic/engine.ts`
- Modify: `frontend/src/server/persistence-client.ts`
- Modify: `frontend/src/features/settings/settings-page.tsx`

- [x] **Step 1: 先把契约测试锚定为三种格式**

在现有 settings contract 测试中加入 `openai_responses` 的 PUT body 与 resource parse 用例，预期当前枚举校验失败。

- [x] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @creatoros/contract test -- settings`

Expected: `openai_responses` 被当前二值枚举拒绝。

- [x] **Step 3: 扩展所有公开和内部协议联合类型**

统一改为：

```ts
type ApiFormat = "anthropic" | "openai_chat" | "openai_responses";
```

导入配置时不得把 Responses 降级成 Anthropic，使用显式归一化：

```ts
const apiFormat =
  m.apiFormat === "openai_chat" || m.apiFormat === "openai_responses"
    ? m.apiFormat
    : "anthropic";
```

数据库 `api_format` 已是 `text`，因此不创建迁移。

- [x] **Step 4: 为旧 LLM provider seam 补齐显式占位**

`DEFAULT_FACTORY` 增加 `openai_responses` 键，和未实现的 `openai_chat` 一样诚实抛 `LlmNotImplementedError`，避免 `Record<ApiFormat, ...>` 缺项；实际生产调用仍由 `ai-worker/modelFor` 承担。

- [x] **Step 5: 运行 contract/backend/frontend typecheck**

Run:

```bash
pnpm --filter @creatoros/contract typecheck
pnpm --filter @creatoros/backend typecheck
pnpm --filter creatoros-frontend typecheck
```

Expected: 三条命令 exit 0。

### Task 2: 模型工厂显式区分 Chat 与 Responses

**Files:**
- Modify: `ai-worker/src/runtime/provider-factory.ts`
- Modify: `ai-worker/src/runtime/provider-factory.test.ts`

- [x] **Step 1: 写协议身份失败测试**

新增断言：

```ts
expect(modelFor(chatOfficial).provider).toBe("openai.chat");
expect(modelFor(chatCustom).provider).toBe("creatoros-custom.chat");
expect(modelFor(responsesOfficial).provider).toBe("openai.responses");
expect(modelFor(responsesCustom).provider).toBe("creatoros-custom.responses");
```

这会暴露当前 `provider(model)` 在 `@ai-sdk/openai` 4 中默认变成 Responses 的漂移。

- [x] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @creatoros/ai-worker test -- src/runtime/provider-factory.test.ts`

Expected: 官方 `openai_chat` 实际得到 `openai.responses`，且尚不接受 `openai_responses`。

- [x] **Step 3: 写最小显式工厂**

```ts
if (spec.apiFormat === "openai_responses") {
  const provider = createOpenAI({
    apiKey: spec.token,
    ...(spec.baseUrl
      ? { baseURL: spec.baseUrl, name: "creatoros-custom" }
      : {}),
  });
  return provider.responses(spec.model);
}

if (spec.baseUrl) {
  return createOpenAICompatible({
    name: "creatoros-custom",
    apiKey: spec.token,
    baseURL: spec.baseUrl,
  }).chatModel(spec.model);
}

return createOpenAI({ apiKey: spec.token }).chat(spec.model);
```

如果当前 `openai-compatible` 版本没有 `chatModel`，保留其 `provider(spec.model)`；它本身只实现 `/chat/completions`，测试仍以 `creatoros-custom.chat` 为锚。

- [x] **Step 4: 保持 embedding 行为**

`openai_responses` 只描述文本生成 wire protocol；embedding 继续复用 OpenAI `/embeddings` 路径，只有 `anthropic` 明确拒绝 embedding。

- [x] **Step 5: 运行 ai-worker 测试与 typecheck**

Run:

```bash
pnpm --filter @creatoros/ai-worker test -- src/runtime/provider-factory.test.ts
pnpm --filter @creatoros/ai-worker typecheck
```

Expected: exit 0，四种 OpenAI 组合的 provider identity 均稳定。

### Task 3: Pi Agent 原生使用 Responses

**Files:**
- Modify: `backend/src/modules/execution/agentic/pi-engine.ts`
- Modify: `backend/src/modules/execution/agentic/pi-engine.test.ts`

- [x] **Step 1: 写映射失败测试**

```ts
expect(piApiForFormat("openai_responses")).toBe("openai-responses");
```

并断言自定义 New API `baseUrl`、Bearer key 和 model id 原样进入注册配置。

- [x] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @creatoros/backend test -- src/modules/execution/agentic/pi-engine.test.ts`

Expected: 当前二分逻辑错误返回 `openai-completions`。

- [x] **Step 3: 改成穷举协议映射**

```ts
export function piApiForFormat(apiFormat: RawLlmConfig["apiFormat"]): string {
  if (apiFormat === "anthropic") return "anthropic-messages";
  if (apiFormat === "openai_responses") return "openai-responses";
  return "openai-completions";
}
```

Pi 0.80.7 已内建 `openai-responses`，不新增依赖。

- [x] **Step 4: 跑 Pi 聚焦测试**

Run: `pnpm --filter @creatoros/backend test -- src/modules/execution/agentic/pi-engine.test.ts`

Expected: exit 0。

### Task 3B: 桌面 sidecar 保证 Pi Responses 依赖随包

**Files:**
- Modify: `frontend/scripts/desktop/build-sidecar.mjs`
- Modify: `frontend/scripts/desktop/build-sidecar.test.mjs`

- [x] **Step 1: 扩展 Pi 依赖闭包说明和 HARD 自检**

保留 OpenAI SDK，并在 sidecar 组装后真导入
`openai-responses.lazy.js`、`openai-completions.lazy.js`、
`anthropic-messages.lazy.js`，任一缺失就阻断打包。

- [x] **Step 2: 增加构建脚本回归锚并验证语法**

Run:

```bash
node --check frontend/scripts/desktop/build-sidecar.mjs
pnpm --filter creatoros-frontend exec vitest run scripts/desktop/build-sidecar.test.mjs
```

Expected: 脚本语法通过，4 tests passed。

### Task 4: 设置 UI 与“测试连接”走真实 `/responses`

**Files:**
- Modify: `frontend/src/features/settings/model-provider-presets.ts`
- Modify: `frontend/src/features/settings/model-provider-presets.test.ts`
- Modify: `frontend/src/features/settings/settings-interactive-region.tsx`
- Modify: `frontend/src/features/settings/settings-interactive-region.test.tsx`
- Modify: `frontend/src/server/settings-model-test-wrap.ts`
- Modify: `frontend/src/server/settings-model-test-wrap.test.ts`

- [x] **Step 1: 写 UI 与探测失败测试**

测试接口格式下拉存在：

```ts
{ value: "openai_responses", label: "OpenAI Responses" }
```

测试连接请求必须是：

```ts
expect(url).toBe("https://api.example.com/v1/responses");
expect(JSON.parse(init.body as string)).toMatchObject({
  model: "test-model",
  input: "ping",
  max_output_tokens: 1,
});
```

- [x] **Step 2: 运行聚焦测试确认失败**

Run:

```bash
pnpm --filter creatoros-frontend test -- src/server/settings-model-test-wrap.test.ts
pnpm --filter creatoros-frontend test -- src/features/settings/model-provider-presets.test.ts src/features/settings/settings-interactive-region.test.tsx
```

Expected: Responses 选项和 `/responses` 分支缺失。

- [x] **Step 3: 增加可选协议并修正预设说明**

设置页显示三种格式；删除“Responses 是 Codex 专用、本产品用不上”的过时注释。OpenAI 官方预设使用 `openai_responses`，其它现有供应商保持原协议；“自定义”允许用户手选 Responses，以适配 New API。

- [x] **Step 4: 增加 Responses 最小探测**

```ts
if (spec.apiFormat === "openai_responses") {
  url = `${trimBase(spec.baseUrl ?? OPENAI_DEFAULT)}/responses`;
  body = {
    model: spec.model,
    input: "ping",
    max_output_tokens: 1,
  };
}
```

只根据真实 HTTP 成功与否报告，不伪造兼容结果、不回退 `/chat/completions`。

- [x] **Step 5: 跑 frontend 聚焦测试与 typecheck**

Run:

```bash
pnpm --filter creatoros-frontend test -- src/server/settings-model-test-wrap.test.ts src/features/settings/model-provider-presets.test.ts src/features/settings/settings-interactive-region.test.tsx
pnpm --filter creatoros-frontend typecheck
```

Expected: exit 0。

### Task 5: 全链回归、门卫和台账收口

**Files:**
- Modify: `BACKLOG.md`
- Generated: `PROJECT.md`

- [x] **Step 1: 运行协议相关回归**

Run:

```bash
pnpm --filter @creatoros/contract test
pnpm --filter @creatoros/ai-worker test
pnpm --filter @creatoros/backend test -- src/modules/ai-runtime/llm/provider.test.ts src/modules/execution/agentic/pi-engine.test.ts
pnpm --filter creatoros-frontend test -- src/server/settings-model-test-wrap.test.ts src/features/settings/model-provider-presets.test.ts src/features/settings/settings-interactive-region.test.tsx
```

Expected: exit 0。

- [x] **Step 2: 运行四包 typecheck 与架构门卫**

Run:

```bash
pnpm --filter @creatoros/contract typecheck
pnpm --filter @creatoros/ai-worker typecheck
pnpm --filter @creatoros/backend typecheck
pnpm --filter creatoros-frontend typecheck
node orchestrator/process/boundary-scan.mjs
```

Expected: 无新增错误、无新增边界违规。

- [x] **Step 3: 更新 T-471 与项目记忆**

把 `BACKLOG.md` 的 T-471 改成 ✅，记录测试证据，然后执行：

```bash
node orchestrator/process/pmem.mjs sync
node orchestrator/process/reconcile.mjs
codegraph index --force
codegraph query piApiForFormat -j
```

Expected: reconcile 无本任务新增失败，新建的 Responses 映射可由 codegraph 查询到。

- [x] **Step 4: 只提交 T-471 文件**

保留进入本分支前就存在的 T-470 修改，不把它误归为 T-471；提交信息：

```bash
git commit -m "feat: support OpenAI Responses protocol"
```
