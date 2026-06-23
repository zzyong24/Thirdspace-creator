# 配置化纯-LLM 接入 设计规范

> 目标:让所有"只需 prompt 就能出结果、不涉及 tool 调用"的 AI 节点(AI 论点树等)走一层**与供应商无关的可配置 LLM 接口**,而不是写死 Claude Agent SDK。供应商的 base_url / token / model 三元组独立可配、可换可加,纯配置不改代码。方法论参考 `/Users/zyongzhu/ThirdSpace/03-知识/AI接入/20260621_配置化AI接入设计规范(参考cc-switch).md`。

- **日期**:2026-06-23
- **分支**:`feat/service-contract`(worktree `.worktrees/frontend-implementation`)
- **范围决定(已与用户确认)**:
  1. 聚焦方案:薄抽象层 + 复用现有 `model_configurations` 配置,**不**新建 provider 注册表/预设库/验活探针/管理 UI(留干净接口)。
  2. 密钥:**环境变量间接**(`.env.local`,gitignored),DB 只存 `secretReference`,key 绝不入库/入 git。
  3. 默认路径:**纯-prompt 节点全部改走 Messages API**,不再回落 Claude Agent SDK;无可用凭据时明确抛错。

---

## 1. 背景与现状

当前 8 个 AI 节点全部直接调用 `runClaudeAgent()`(`frontend/src/server/ai/agent-run.ts`,基于 `@anthropic-ai/claude-agent-sdk` + `CLAUDE_CODE_OAUTH_TOKEN` 订阅令牌):

| 节点文件 | taskType | 是否用 tool |
|---|---|---|
| `research-runner.ts` | `research.gather` | ✅ WebSearch/WebFetch |
| `topic-runner.ts` | `topic.generate` | ✅ WebSearch/WebFetch |
| `planning-runner.ts` | `planning.thesis`(AI 论点树) | ❌ 纯 prompt |
| `script-runner.ts` | `script.draft` | ❌ 纯 prompt |
| `copilot-runner.ts` | `copilot.assist` | ❌ 纯 prompt |
| `review-runner.ts` | `review.analyze` | ❌ 纯 prompt |
| `platform-adapt-runner.ts` | `platform.adapt` | ❌ 纯 prompt |
| `material-match-runner.ts` | `material.match` | ❌ 纯 prompt |

已存在一套半成品 model-config:`model_configurations` 表(主键 `(userId, capability)`,字段 `provider / modelName / secretReference / settings / isDefault`)+ `resolveModelForCapability()` + 契约 op `PUT /settings/models/:capability`。但**没有任何节点真的按它路由**,且缺 `base_url` / `api_format`。

`@anthropic-ai/sdk`(普通 Messages API SDK,区别于 agent-sdk)**尚未**作为依赖。

用户提供的 MiniMax 配置指向 `https://api.minimaxi.com/anthropic`(**Anthropic 兼容端点**,`api_format: anthropic`)、`ANTHROPIC_AUTH_TOKEN`(Bearer)、`ANTHROPIC_MODEL: MiniMax-M3`。因此一个 `@anthropic-ai/sdk` 客户端(可配 `baseURL` + `authToken`)即可同时覆盖 MiniMax 与 Anthropic 官方。

---

## 2. 统一接口(供应商无关)

业务节点只依赖此接口,**绝不出现供应商名 if-else**(cc-switch §3.1、§7):

```ts
// frontend/src/server/ai/llm/provider.ts
export interface LlmCompleteOptions {
  schema?: unknown;     // JSON Schema;给定则要求 JSON 输出并健壮解析
  system?: string;      // 可选 system prompt
  maxTokens?: number;   // 默认 4096
  effort?: string;      // 沿用 settings.settings.effort(low|medium|high|...)
}

export interface LlmResult {
  text: string;         // 模型原始文本
  json?: unknown;       // schema 给定且解析成功时填充
}

export interface LlmProvider {
  complete(prompt: string, opts?: LlmCompleteOptions): Promise<LlmResult>;
}
```

调用链:`节点 → resolveLlmConfig(ctx, capability) → providerFactory[apiFormat](config) → .complete()`。

代码落点:**新目录 `frontend/src/server/ai/llm/`**。刻意**不**放进 `src/server/modules/ai/`——那个模块有"禁止 import Agent SDK / 维持 determinism boundary"的验收测试,新 provider 层放外面避免触碰它。

---

## 3. 配置模型(复用并扩展 `model_configurations`)

### 3.1 表结构扩展

`model_configurations` 现有字段保留,**新增两列**:

| 新列 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `baseUrl` | text 可空 | `null` | 空 = 用内置默认端点 |
| `apiFormat` | text(enum) | `'anthropic'` | `anthropic` \| `openai_chat` |

契约 op `PUT /settings/models/:capability` 的 body 增加可选 `baseUrl`、`apiFormat` 字段;`ModelConfigurationResource` 响应同步加这两字段。

### 3.2 解析优先级(三级 fallback,取第一个非空值)

依 cc-switch §1.4(注意跳过空字符串占位符,不能只判断 key 是否存在):

1. **该 capability 的 DB 行**(用户在设置里改过的)→ `{ provider, baseUrl, modelName, apiFormat, secretReference, settings }`
2. **`.env.local` 默认 provider**(用户填 MiniMax 处),读自:
   - `CREATOROS_LLM_BASE_URL`
   - `CREATOROS_LLM_API_FORMAT`
   - `CREATOROS_LLM_MODEL`
   - `CREATOROS_LLM_AUTH_STYLE`(`bearer` | `x-api-key`)
   - `CREATOROS_LLM_SECRET_REF`(如 `env:MINIMAX_AUTH_TOKEN`)
3. **内置默认**:`api.anthropic.com` / `claude-opus-4-8` / `anthropic` 格式 / `x-api-key` / `env:ANTHROPIC_API_KEY`

`secretReference`(形如 `env:MINIMAX_AUTH_TOKEN`)在 **complete() 调用时**从 `process.env` 解析出真实 token,**绝不入库、绝不入 git、绝不 log**。

解析结果类型:

```ts
export interface ResolvedLlmConfig {
  apiFormat: "anthropic" | "openai_chat";
  baseUrl: string | null;     // null → 适配器用内置默认端点
  model: string;
  authStyle: "bearer" | "x-api-key";
  token: string;              // 已从 secretReference 解析出的真实值
  settings: Record<string, unknown>;
}
```

若 token 解析为空 → `resolveLlmConfig` 抛 `LlmCredentialError("capability X 无可用 LLM 凭据:请在 .env.local 设置 <secretRef 指向的变量>")`。

### 3.3 `.env.local`(gitignored)样例

把用户的 MiniMax 配置翻译过来:

```bash
CREATOROS_LLM_BASE_URL=https://api.minimaxi.com/anthropic
CREATOROS_LLM_API_FORMAT=anthropic
CREATOROS_LLM_MODEL=MiniMax-M3
CREATOROS_LLM_AUTH_STYLE=bearer
CREATOROS_LLM_SECRET_REF=env:MINIMAX_AUTH_TOKEN
MINIMAX_AUTH_TOKEN=sk-cp-...    # 真实密钥,只在这里
```

同时提供 `.env.example`(无密钥)进 git 做文档。确认 `.env.local` 在 `.gitignore` 中(Next.js 默认忽略)。

---

## 4. 适配器(工厂按 `apiFormat` 选,非按供应商名)

```ts
// frontend/src/server/ai/llm/factory.ts
const FACTORY: Record<string, (cfg: ResolvedLlmConfig) => LlmProvider> = {
  anthropic: (cfg) => createAnthropicProvider(cfg),
  openai_chat: (cfg) => createOpenAiChatProvider(cfg), // 本轮留桩
};
```

### 4.1 `anthropic` 适配器(本轮完整实现)

```ts
// frontend/src/server/ai/llm/anthropic-adapter.ts
import Anthropic from "@anthropic-ai/sdk";

export function createAnthropicProvider(cfg: ResolvedLlmConfig): LlmProvider {
  const client = new Anthropic({
    baseURL: cfg.baseUrl ?? undefined,
    ...(cfg.authStyle === "bearer"
      ? { authToken: cfg.token }       // Authorization: Bearer(MiniMax)
      : { apiKey: cfg.token }),        // x-api-key(Anthropic 官方)
  });
  return {
    async complete(prompt, opts = {}) {
      const sys = buildSystem(opts.system, opts.schema);
      const msg = await client.messages.create({
        model: cfg.model,
        max_tokens: opts.maxTokens ?? 4096,
        ...(sys ? { system: sys } : {}),
        messages: [{ role: "user", content: prompt }],
      });
      const text = extractText(msg);     // 拼接 content 里的 text block
      return opts.schema
        ? { text, json: parseJsonLoose(text) }
        : { text };
    },
  };
}
```

- 新增依赖:`@anthropic-ai/sdk`(加到 `frontend/package.json`)。
- 一个客户端同时覆盖 MiniMax `/anthropic` 端点(`authToken`=Bearer)与 Anthropic 官方(`apiKey`=x-api-key),靠 `authStyle` 区分。

### 4.2 `openai_chat` 适配器(本轮留桩)

注册进工厂但函数体抛 `LlmNotImplementedError("openai_chat 适配器尚未实现")`,留 TODO。以后接 DeepSeek/通义/Kimi 等 OpenAI 兼容端点 = 实现这一个函数 + 改配置,不动业务。

### 4.3 结构化输出(schema)

`schema` 给定时:用 `buildSystem` 在 system 里追加"仅输出符合此结构的 JSON,不要解释",再用 `parseJsonLoose`(剥 ```json 围栏 / 取首个 `{`..最后 `}` 子串 → `JSON.parse`)健壮解析。**不**依赖各家是否支持 strict structured-output(MiniMax-M3 支持情况未知),与现有 `planning-runner` 的解析方式一致。解析失败时 `json` 留 `undefined`,节点照旧能拿到 `text` 走自己的兜底逻辑。

---

## 5. 6 个纯-prompt 节点迁移

每个 runner 把:

```ts
const text = await runClaudeAgent(prompt, {});
```

换成:

```ts
import { getLlmProvider } from "@/server/ai/llm/provider";
// ...
const provider = await getLlmProvider(ctx, "<capability>");
const { text, json } = await provider.complete(prompt, { schema, effort });
```

`getLlmProvider(ctx, capability)` = `resolveLlmConfig` + `factory`。涉及文件与各自 capability:

| runner | capability 字符串 |
|---|---|
| `planning-runner.ts` | `planning.thesis` |
| `script-runner.ts` | `script.rewrite` |
| `copilot-runner.ts` | `copilot.assist` |
| `review-runner.ts` | `review.insights` |
| `platform-adapt-runner.ts` | `script.rewrite`(平台改写复用) |
| `material-match-runner.ts` | `copy.generate` |

各节点本就从 text 里 parse JSON,改动极小:把 `runClaudeAgent` 一行替换,JSON 解析可改用返回的 `json`(若已解析)或保留各自原解析。

**`research-runner.ts` + `topic-runner.ts` 不动**——它们要 WebSearch/WebFetch,继续走 Claude Agent SDK。这是"纯 prompt 走可配置 LLM,带 tool 的留 agent"的明确分界。

---

## 6. 默认/错误行为

用户选定"全改走 Messages API、不再回落 Agent-SDK"。因此 capability 解析不出任何可用 token 时:

- `resolveLlmConfig` 抛 `LlmCredentialError`,节点不 catch → task 标记 `failed`,失败消息可读(指明该设哪个环境变量),**不静默、不偷偷走别的路**。
- 用户已有 MiniMax token,填进 `.env.local` 即全部 6 个节点生效。

---

## 7. 测试

- **单元 — 解析链**:DB 行 > env 默认 > 内置默认,取第一个非空(空字符串占位符要跳过);token 为空时抛 `LlmCredentialError`。
- **单元 — 适配器**:`authStyle=bearer` → 建带 `authToken` 的客户端;`x-api-key` → 建带 `apiKey` 的;`baseUrl` 透传;`openai_chat` 抛未实现。
- **单元 — schema 解析**:`parseJsonLoose` 能剥围栏、容忍前后缀文字、失败返回 undefined。
- **节点确定性**:仿现有 `FakeAgentRunner`,提供 `FakeLlmProvider`(可注入固定返回);节点测试在无 token 时注入 fake → 不打真实 API、CI 绿。
- **不破坏既有验收**:`ai` 模块"禁 Agent-SDK import"验收仍通过(provider 层不在该模块内);契约 `registry.test.ts` 不新增路由(仅扩 body 字段,SPEC §13 不变)。

---

## 8. 文件清单

**新增**
- `frontend/src/server/ai/llm/provider.ts`(接口 + `getLlmProvider` + `resolveLlmConfig` + 错误类型)
- `frontend/src/server/ai/llm/factory.ts`
- `frontend/src/server/ai/llm/anthropic-adapter.ts`
- `frontend/src/server/ai/llm/openai-adapter.ts`(桩)
- `frontend/src/server/ai/llm/parse.ts`(`parseJsonLoose` / `extractText` / `buildSystem`)
- `frontend/src/server/ai/llm/fake-provider.ts`(测试用)
- 各 `*.test.ts`
- `.env.example`(文档)

**修改**
- `frontend/package.json`(加 `@anthropic-ai/sdk`)
- `backend` 的 `model_configurations` db-schema(+`baseUrl`,+`apiFormat`)
- `contract/src/operations/settings.ts`(`PUT /settings/models/:capability` body + 资源类型加两字段)
- 设置模块 service:`resolveModelForCapability` → 返回含 `baseUrl/apiFormat`(或新增 `resolveLlmConfig` 复用它)
- 6 个 runner 文件(替换 `runClaudeAgent` 调用)

---

## 9. 本轮不做(留干净接口)

- `openai_chat` 完整适配器(留桩,接口已就位)
- 供应商预设表(cc-switch §4)
- 验活双探针(`/v1/models` + 流式首 chunk,cc-switch §5)
- 设置页《供应商管理》+《测试连接》按钮
- 多-provider 注册表 + `current` 指针(本轮用 per-capability 行 + env 默认替代,够用且更简单)

这些都不阻塞当前目标,且本设计的接口/工厂结构能让它们后续纯增量接入,不回头改业务层。
