# 配置化纯-LLM 接入 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 6 个纯-prompt AI 节点(AI 论点树等)通过一层「供应商无关、可配置 base_url/token/model」的 Messages-API provider 接口出结果,而不是写死 Claude Agent SDK;配置三级 fallback(DB 行 > .env.local 默认 > 内置默认),密钥只走环境变量。

**Architecture:** 新增 `frontend/src/server/ai/llm/` 层:`LlmProvider.complete(prompt, {schema})` 统一接口 + 工厂按 `apiFormat` 选适配器(`anthropic` 完整、`openai_chat` 留桩)。配置解析 `resolveLlmConfig` 在该层、通过注入的 `getModelConfig` 读取 settings 拥有的 `model_configurations` 行(settings 不反向依赖 ai 层)+ `process.env`。6 个 runner 把 `runClaudeAgent(...)` 换成注入的 `deps.llm(ctx, capability, prompt, opts)`。带 tool 的 `research`/`topic` 节点不动。

**Tech Stack:** TypeScript, Next.js 16 server, `@anthropic-ai/sdk`(新增), pglite+Drizzle, Zod 契约(@creatoros/contract), vitest, pnpm, fish。

**工作目录:** `/Users/zyongzhu/Workbase/Thirdspace-creator/.worktrees/frontend-implementation`(分支 `feat/service-contract`)。所有路径相对该目录。

**Spec:** `docs/superpowers/specs/2026-06-23-configurable-llm-design.md`

---

## File Structure

**新增**
- `frontend/src/server/ai/llm/parse.ts` — 纯函数:`parseJsonLoose` / `extractText` / `buildSystem`
- `frontend/src/server/ai/llm/provider.ts` — 接口/类型 + `getLlmProvider` 工厂 + `createLlmCompleter` + 错误类
- `frontend/src/server/ai/llm/anthropic-adapter.ts` — `createAnthropicProvider` + `buildAnthropicClientOptions`
- `frontend/src/server/ai/llm/resolve.ts` — `resolveLlmConfig`(三级 fallback + token 解析)
- `frontend/src/server/ai/llm/*.test.ts` — 上述各自单测
- `.env.example` — 文档(无密钥)

**修改**
- `frontend/package.json`(+`@anthropic-ai/sdk`)
- `backend/src/schema/settings.ts`(`model_configurations` +`base_url` +`api_format` 列 + DDL)
- `contract/src/resources/settings.ts`(`modelConfigurationResource` +两字段)
- `contract/src/operations/settings.ts`(`putModel` body +两字段)
- `frontend/src/server/modules/settings/settings.repository.ts`(`ModelPutBody` +两字段;`putModel` 写两列)
- `frontend/src/server/modules/settings/settings.service.ts`(`toModelResource` +两字段;新增 `getModelConfig`)
- `frontend/src/server/persistence-client.ts`(构建 `llm` completer + 注入 6 个 runner deps)
- `frontend/src/server/ai/{planning,script,copilot,review,platform-adapt,material-match}-runner.ts`(替换 `runClaudeAgent` 调用 + Deps 加 `llm`)

---

## Task 0: 引入依赖与环境文档

**Files:**
- Modify: `frontend/package.json`
- Create: `.env.example`

- [ ] **Step 1: 安装 `@anthropic-ai/sdk`**

Run（在工作目录根）:
```bash
pnpm --filter creatoros-frontend add @anthropic-ai/sdk
```
Expected: `frontend/package.json` 的 `dependencies` 出现 `"@anthropic-ai/sdk": "^0.x"`;pnpm-lock 更新。

- [ ] **Step 2: 写 `.env.example`(进 git 做文档,无真实密钥)**

Create `.env.example`:
```bash
# 配置化纯-LLM 默认 provider(纯-prompt 节点用)。真实值写进 .env.local(gitignored)。
# 留空则回落到内置默认(api.anthropic.com / claude-opus-4-8 / 需要 ANTHROPIC_API_KEY)。
CREATOROS_LLM_BASE_URL=https://api.minimaxi.com/anthropic
CREATOROS_LLM_API_FORMAT=anthropic
CREATOROS_LLM_MODEL=MiniMax-M3
CREATOROS_LLM_AUTH_STYLE=bearer
CREATOROS_LLM_SECRET_REF=env:MINIMAX_AUTH_TOKEN
# 真实密钥(只放 .env.local):
# MINIMAX_AUTH_TOKEN=sk-...
```

- [ ] **Step 3: 确认 `.env.local` 被 git 忽略**

Run:
```bash
git check-ignore frontend/.env.local .env.local 2>/dev/null; grep -n "env" .gitignore frontend/.gitignore 2>/dev/null
```
Expected: 至少一处 `.gitignore` 含 `.env*.local` 或 `.env.local`(Next.js 模板默认有)。若两个文件都没有,向 `frontend/.gitignore` 追加一行 `.env*.local`。

- [ ] **Step 4: Commit**

```bash
git add frontend/package.json pnpm-lock.yaml .env.example frontend/.gitignore
git commit -m "chore(llm): add @anthropic-ai/sdk dep + .env.example for configurable provider"
```

---

## Task 1: 纯解析助手 `parse.ts`

**Files:**
- Create: `frontend/src/server/ai/llm/parse.ts`
- Test: `frontend/src/server/ai/llm/parse.test.ts`

- [ ] **Step 1: 写失败测试**

Create `frontend/src/server/ai/llm/parse.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { parseJsonLoose, extractText, buildSystem } from "./parse";

describe("parseJsonLoose", () => {
  it("parses a bare JSON object", () => {
    expect(parseJsonLoose('{"a":1}')).toEqual({ a: 1 });
  });
  it("strips ``` fences and leading prose", () => {
    const t = "好的,结果如下:\n```json\n{\"a\":2}\n```\n以上。";
    expect(parseJsonLoose(t)).toEqual({ a: 2 });
  });
  it("tolerates an array payload", () => {
    expect(parseJsonLoose("前缀 [1,2,3] 后缀")).toEqual([1, 2, 3]);
  });
  it("returns undefined when nothing parses", () => {
    expect(parseJsonLoose("没有 json")).toBeUndefined();
    expect(parseJsonLoose("")).toBeUndefined();
  });
});

describe("extractText", () => {
  it("concatenates text blocks, ignores non-text", () => {
    const msg = {
      content: [
        { type: "text", text: "你好" },
        { type: "tool_use", id: "x" },
        { type: "text", text: "世界" },
      ],
    };
    expect(extractText(msg)).toBe("你好世界");
  });
  it("returns '' when no content", () => {
    expect(extractText({})).toBe("");
  });
});

describe("buildSystem", () => {
  it("returns undefined with neither system nor schema", () => {
    expect(buildSystem(undefined, undefined)).toBeUndefined();
  });
  it("passes a plain system through", () => {
    expect(buildSystem("你是助手", undefined)).toBe("你是助手");
  });
  it("appends a JSON instruction when schema is given", () => {
    const s = buildSystem(undefined, { type: "object" });
    expect(s).toContain("JSON");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run:
```bash
pnpm --filter creatoros-frontend exec vitest run src/server/ai/llm/parse.test.ts
```
Expected: FAIL（`Cannot find module './parse'`）。

- [ ] **Step 3: 实现 `parse.ts`**

Create `frontend/src/server/ai/llm/parse.ts`:
```ts
import "server-only";

// Robustly pull a JSON value (object OR array) out of model text: strip ``` fences /
// leading prose / trailing notes, then slice the outermost {...} or [...] and JSON.parse.
// Returns undefined when nothing parses — callers fall back to their own handling.
export function parseJsonLoose(text: string): unknown {
  if (!text) return undefined;
  let body = text.trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(body);
  if (fence?.[1]) body = fence[1].trim();
  const candidates: Array<[number, number]> = [];
  const obj: [number, number] = [body.indexOf("{"), body.lastIndexOf("}")];
  const arr: [number, number] = [body.indexOf("["), body.lastIndexOf("]")];
  if (obj[0] !== -1 && obj[1] > obj[0]) candidates.push(obj);
  if (arr[0] !== -1 && arr[1] > arr[0]) candidates.push(arr);
  // Prefer whichever delimiter appears first in the text.
  candidates.sort((a, b) => a[0] - b[0]);
  for (const [start, end] of candidates) {
    try {
      return JSON.parse(body.slice(start, end + 1));
    } catch {
      /* try next */
    }
  }
  return undefined;
}

// Concatenate the `text` blocks of an Anthropic Messages response (ignore tool_use etc).
export function extractText(message: unknown): string {
  const content = (message as { content?: unknown })?.content;
  if (!Array.isArray(content)) return "";
  return content
    .filter(
      (b): b is { type: "text"; text: string } =>
        !!b &&
        typeof b === "object" &&
        (b as { type?: unknown }).type === "text" &&
        typeof (b as { text?: unknown }).text === "string",
    )
    .map((b) => b.text)
    .join("");
}

// Compose the system prompt: caller system + (when a schema is requested) a terse
// "JSON only" instruction. We DON'T rely on provider-native structured output — many
// OpenAI/Anthropic-compatible endpoints (e.g. MiniMax) don't support strict mode.
export function buildSystem(
  system: string | undefined,
  schema: unknown | undefined,
): string | undefined {
  const parts: string[] = [];
  if (system && system.trim()) parts.push(system.trim());
  if (schema !== undefined) {
    parts.push("只输出符合所需结构的 JSON,不要解释、不要代码块包裹。");
  }
  return parts.length ? parts.join("\n\n") : undefined;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run:
```bash
pnpm --filter creatoros-frontend exec vitest run src/server/ai/llm/parse.test.ts
```
Expected: PASS（10 个断言全绿）。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/server/ai/llm/parse.ts frontend/src/server/ai/llm/parse.test.ts
git commit -m "feat(llm): parseJsonLoose/extractText/buildSystem helpers"
```

---

## Task 2: 接口、工厂、completer `provider.ts`

**Files:**
- Create: `frontend/src/server/ai/llm/provider.ts`
- Test: `frontend/src/server/ai/llm/provider.test.ts`

- [ ] **Step 1: 写失败测试**

Create `frontend/src/server/ai/llm/provider.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import type { RequestContext } from "@creatoros/contract";
import {
  getLlmProvider,
  createLlmCompleter,
  LlmNotImplementedError,
  type ResolvedLlmConfig,
} from "./provider";

const ctx: RequestContext = { userId: "u1", requestId: "r1", source: "user" };

const anthropicCfg: ResolvedLlmConfig = {
  apiFormat: "anthropic",
  baseUrl: "https://api.minimaxi.com/anthropic",
  model: "MiniMax-M3",
  authStyle: "bearer",
  token: "tok",
  settings: {},
};

describe("getLlmProvider", () => {
  it("builds an anthropic provider exposing complete()", () => {
    const p = getLlmProvider(anthropicCfg);
    expect(typeof p.complete).toBe("function");
  });
  it("throws LlmNotImplementedError for openai_chat (stub)", () => {
    expect(() =>
      getLlmProvider({ ...anthropicCfg, apiFormat: "openai_chat" }),
    ).toThrow(LlmNotImplementedError);
  });
});

describe("createLlmCompleter", () => {
  it("resolves config then delegates to the provider's complete", async () => {
    const fakeProviderResult = { text: "hi", json: undefined };
    // Inject a resolver that returns a config whose apiFormat routes to a fake.
    const completer = createLlmCompleter(async () => anthropicCfg, {
      anthropic: () => ({ complete: async () => fakeProviderResult }),
    });
    const out = await completer(ctx, "planning.thesis", "prompt");
    expect(out).toEqual(fakeProviderResult);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run:
```bash
pnpm --filter creatoros-frontend exec vitest run src/server/ai/llm/provider.test.ts
```
Expected: FAIL（`Cannot find module './provider'`）。

- [ ] **Step 3: 实现 `provider.ts`**

Create `frontend/src/server/ai/llm/provider.ts`:
```ts
import "server-only";
import type { RequestContext } from "@creatoros/contract";
import { createAnthropicProvider } from "./anthropic-adapter";

export type ApiFormat = "anthropic" | "openai_chat";

// The resolved, ready-to-call provider config (token already pulled from env).
export interface ResolvedLlmConfig {
  apiFormat: ApiFormat;
  baseUrl: string | null; // null → adapter uses its built-in default endpoint
  model: string;
  authStyle: "bearer" | "x-api-key";
  token: string;
  settings: Record<string, unknown>;
}

export interface LlmCompleteOptions {
  schema?: unknown;
  system?: string;
  maxTokens?: number;
  effort?: string;
}

export interface LlmResult {
  text: string;
  json?: unknown;
}

export interface LlmProvider {
  complete(prompt: string, opts?: LlmCompleteOptions): Promise<LlmResult>;
}

// What a runner is handed (deps.llm). Bundles resolve + factory + complete.
export type LlmCompleter = (
  ctx: RequestContext,
  capability: string,
  prompt: string,
  opts?: LlmCompleteOptions,
) => Promise<LlmResult>;

export type LlmConfigResolver = (
  ctx: RequestContext,
  capability: string,
) => Promise<ResolvedLlmConfig>;

export class LlmCredentialError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmCredentialError";
  }
}

export class LlmNotImplementedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmNotImplementedError";
  }
}

// Factory keyed by api_format — NOT by provider name (cc-switch §3.2). Adding a new
// protocol family = add one entry, never an `if (provider === ...)` in business code.
type ProviderFactory = Record<
  ApiFormat,
  (config: ResolvedLlmConfig) => LlmProvider
>;

const DEFAULT_FACTORY: ProviderFactory = {
  anthropic: (config) => createAnthropicProvider(config),
  openai_chat: () => {
    // Stub: registered so the seam exists; implement when an OpenAI-compatible
    // endpoint is actually wired (cc-switch §4.2 逃生舱).
    throw new LlmNotImplementedError("openai_chat 适配器尚未实现");
  },
};

export function getLlmProvider(
  config: ResolvedLlmConfig,
  factory: Partial<ProviderFactory> = DEFAULT_FACTORY,
): LlmProvider {
  const make = factory[config.apiFormat];
  if (!make) {
    throw new LlmNotImplementedError(`未知 api_format: ${config.apiFormat}`);
  }
  return make(config);
}

// Bind a resolver (DB row + env) into the single function runners call. The optional
// `factory` arg (Partial — a fake may only register the formats it tests) is a test
// seam to inject fake providers without hitting the network.
export function createLlmCompleter(
  resolve: LlmConfigResolver,
  factory: Partial<ProviderFactory> = DEFAULT_FACTORY,
): LlmCompleter {
  return async (ctx, capability, prompt, opts) => {
    const config = await resolve(ctx, capability);
    return getLlmProvider(config, factory).complete(prompt, opts);
  };
}
```

> NOTE: this imports `./anthropic-adapter` (Task 3). Until Task 3 lands the test fails to import — that's why Task 3 immediately follows. If running strictly task-by-task, create a 1-line placeholder `anthropic-adapter.ts` exporting `export function createAnthropicProvider(){throw new Error("todo")}` to get Task 2's test green, then replace it fully in Task 3. (The Task 2 test injects its own factory, so it never calls the real adapter.)

- [ ] **Step 4: 跑测试确认通过**

Run:
```bash
pnpm --filter creatoros-frontend exec vitest run src/server/ai/llm/provider.test.ts
```
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/server/ai/llm/provider.ts frontend/src/server/ai/llm/provider.test.ts
git commit -m "feat(llm): provider interface + apiFormat factory + completer"
```

---

## Task 3: Anthropic 适配器 `anthropic-adapter.ts`

**Files:**
- Create: `frontend/src/server/ai/llm/anthropic-adapter.ts`
- Test: `frontend/src/server/ai/llm/anthropic-adapter.test.ts`

- [ ] **Step 1: 写失败测试(测纯的「客户端选项构造」+ complete 映射,不打网络)**

Create `frontend/src/server/ai/llm/anthropic-adapter.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import {
  buildAnthropicClientOptions,
  createAnthropicProvider,
} from "./anthropic-adapter";
import type { ResolvedLlmConfig } from "./provider";

const base: ResolvedLlmConfig = {
  apiFormat: "anthropic",
  baseUrl: "https://api.minimaxi.com/anthropic",
  model: "MiniMax-M3",
  authStyle: "bearer",
  token: "tok-123",
  settings: {},
};

describe("buildAnthropicClientOptions", () => {
  it("bearer → authToken + baseURL passthrough", () => {
    const o = buildAnthropicClientOptions(base);
    expect(o).toEqual({
      baseURL: "https://api.minimaxi.com/anthropic",
      authToken: "tok-123",
    });
  });
  it("x-api-key → apiKey, null baseUrl omits baseURL", () => {
    const o = buildAnthropicClientOptions({
      ...base,
      authStyle: "x-api-key",
      baseUrl: null,
    });
    expect(o).toEqual({ apiKey: "tok-123" });
  });
});

describe("createAnthropicProvider.complete (injected client)", () => {
  it("calls messages.create with model+system, parses JSON when schema given", async () => {
    const calls: unknown[] = [];
    const fakeClient = {
      messages: {
        create: async (args: unknown) => {
          calls.push(args);
          return { content: [{ type: "text", text: '```json\n{"k":9}\n```' }] };
        },
      },
    };
    const p = createAnthropicProvider(base, () => fakeClient);
    const out = await p.complete("写点东西", { schema: { type: "object" } });
    expect(out.text).toContain('"k":9');
    expect(out.json).toEqual({ k: 9 });
    const arg = calls[0] as { model: string; system?: string; max_tokens: number };
    expect(arg.model).toBe("MiniMax-M3");
    expect(arg.system).toContain("JSON");
    expect(arg.max_tokens).toBe(4096);
  });

  it("omits json when no schema", async () => {
    const fakeClient = {
      messages: {
        create: async () => ({ content: [{ type: "text", text: "纯文本" }] }),
      },
    };
    const p = createAnthropicProvider(base, () => fakeClient);
    const out = await p.complete("hi");
    expect(out).toEqual({ text: "纯文本" });
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run:
```bash
pnpm --filter creatoros-frontend exec vitest run src/server/ai/llm/anthropic-adapter.test.ts
```
Expected: FAIL（模块缺失 / 函数未定义）。

- [ ] **Step 3: 实现 `anthropic-adapter.ts`**

Create `frontend/src/server/ai/llm/anthropic-adapter.ts`:
```ts
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { LlmProvider, ResolvedLlmConfig } from "./provider";
import { buildSystem, extractText, parseJsonLoose } from "./parse";

// The options object handed to `new Anthropic(...)`. Pure + exported so the auth/baseURL
// mapping is unit-testable without constructing a real client or touching the network.
export interface AnthropicClientOptions {
  baseURL?: string;
  authToken?: string; // Authorization: Bearer (MiniMax /anthropic & most relays)
  apiKey?: string; // x-api-key (Anthropic 官方)
}

export function buildAnthropicClientOptions(
  config: ResolvedLlmConfig,
): AnthropicClientOptions {
  const opts: AnthropicClientOptions = {};
  if (config.baseUrl) opts.baseURL = config.baseUrl;
  if (config.authStyle === "bearer") opts.authToken = config.token;
  else opts.apiKey = config.token;
  return opts;
}

// Minimal shape of the Anthropic client we use — lets tests inject a fake.
interface MessagesClient {
  messages: { create: (args: unknown) => Promise<unknown> };
}

type ClientFactory = (config: ResolvedLlmConfig) => MessagesClient;

const defaultClientFactory: ClientFactory = (config) =>
  new Anthropic(buildAnthropicClientOptions(config)) as unknown as MessagesClient;

export function createAnthropicProvider(
  config: ResolvedLlmConfig,
  clientFactory: ClientFactory = defaultClientFactory,
): LlmProvider {
  const client = clientFactory(config);
  return {
    async complete(prompt, opts = {}) {
      const system = buildSystem(opts.system, opts.schema);
      const message = await client.messages.create({
        model: config.model,
        max_tokens: opts.maxTokens ?? 4096,
        ...(system ? { system } : {}),
        messages: [{ role: "user", content: prompt }],
      });
      const text = extractText(message);
      return opts.schema !== undefined
        ? { text, json: parseJsonLoose(text) }
        : { text };
    },
  };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run:
```bash
pnpm --filter creatoros-frontend exec vitest run src/server/ai/llm/anthropic-adapter.test.ts src/server/ai/llm/provider.test.ts
```
Expected: PASS（adapter + provider 全绿;若 Task 2 用过占位 adapter,此时换成真实实现后 provider 测试仍绿）。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/server/ai/llm/anthropic-adapter.ts frontend/src/server/ai/llm/anthropic-adapter.test.ts
git commit -m "feat(llm): anthropic adapter (configurable baseURL + bearer/x-api-key)"
```

---

## Task 4: 配置存储扩展(DB 列 + 契约 + 仓库)

**Files:**
- Modify: `backend/src/schema/settings.ts`
- Modify: `contract/src/resources/settings.ts:35-44`
- Modify: `contract/src/operations/settings.ts:38-52`
- Modify: `frontend/src/server/modules/settings/settings.repository.ts`
- Modify: `frontend/src/server/modules/settings/settings.service.ts:87-100`
- Test: `frontend/src/server/modules/settings/settings.repository.integration.test.ts`（追加用例）

- [ ] **Step 1: 写失败测试(repo 往返带新列)**

在 `frontend/src/server/modules/settings/settings.repository.integration.test.ts` 末尾追加（沿用该文件已有的 `createDb` / ctx 模式;若现有用例已 import 这些,复用即可）:
```ts
  it("putModel persists baseUrl + apiFormat and getModel reads them back", async () => {
    const { db } = await createDb();
    const repo = createSettingsRepository(db, deps);
    const ctx = { userId: "user-canonical", requestId: "rq", source: "user" } as const;
    await repo.putModel(ctx, "planning.thesis", {
      provider: "minimax",
      modelName: "MiniMax-M3",
      baseUrl: "https://api.minimaxi.com/anthropic",
      apiFormat: "anthropic",
      secretReference: "env:MINIMAX_AUTH_TOKEN",
    });
    const row = await repo.getModel(ctx, "planning.thesis");
    expect(row?.baseUrl).toBe("https://api.minimaxi.com/anthropic");
    expect(row?.apiFormat).toBe("anthropic");
  });

  it("putModel defaults apiFormat to 'anthropic' and baseUrl to null when omitted", async () => {
    const { db } = await createDb();
    const repo = createSettingsRepository(db, deps);
    const ctx = { userId: "user-canonical", requestId: "rq", source: "user" } as const;
    await repo.putModel(ctx, "copy.generate", {
      provider: "anthropic",
      modelName: "claude-opus-4-8",
    });
    const row = await repo.getModel(ctx, "copy.generate");
    expect(row?.apiFormat).toBe("anthropic");
    expect(row?.baseUrl ?? null).toBeNull();
  });
```
> 若文件顶部没有 `createSettingsRepository` / `createDb` / `deps` 的 import 或定义,照该文件既有第一个用例的写法补齐(不要新造模式)。

- [ ] **Step 2: 跑测试确认失败**

Run:
```bash
pnpm --filter creatoros-frontend exec vitest run src/server/modules/settings/settings.repository.integration.test.ts
```
Expected: FAIL（`baseUrl`/`apiFormat` 不存在 / 类型报错）。

- [ ] **Step 3a: 加 DB 列**

在 `backend/src/schema/settings.ts` 的 `modelConfigurations` 表定义(第 31-40 行)里,在 `isDefault` 行**之前**加两列:
```ts
  baseUrl: text("base_url"),
  apiFormat: text("api_format").notNull().default("anthropic"),
```
并在同文件 `SETTINGS_DDL` 的 `CREATE TABLE IF NOT EXISTS model_configurations (...)`(第 70-79 行)里,`is_default` 行**之前**加:
```sql
  base_url TEXT,
  api_format TEXT NOT NULL DEFAULT 'anthropic',
```
> pglite 是进程内重建库(每次启动重跑 DDL),`CREATE TABLE` 加列即生效,无需 ALTER。

- [ ] **Step 3b: 确认没有第二处表定义需要同步**

Run:
```bash
grep -rn "model_name\|base_url\|model_configurations" frontend/src/server/modules/settings/settings.db-schema.ts frontend/src/server/modules/ai/ai.db-schema.ts
```
Expected: 这两文件只是 **re-export** `@creatoros/backend`(无独立列清单)。若发现独立 `pgTable("model_configurations", {...})` 列清单,在那里也加同样两列。

- [ ] **Step 3c: 契约资源 + PUT body + ModelPutBody**

`contract/src/resources/settings.ts` 的 `modelConfigurationResource`(第 35-44 行),在 `settings:` 行**之前**加:
```ts
  baseUrl: z.string().nullable(),
  apiFormat: z.enum(["anthropic", "openai_chat"]),
```
`contract/src/operations/settings.ts` 的 `putModel` body(第 43-49 行),在 `settings:` 行**之前**加:
```ts
      baseUrl: z.string().optional(),
      apiFormat: z.enum(["anthropic", "openai_chat"]).optional(),
```
`frontend/src/server/modules/settings/settings.repository.ts` 的 `ModelPutBody` interface(约第 37 行),加两个可选字段:
```ts
  baseUrl?: string;
  apiFormat?: "anthropic" | "openai_chat";
```
并在同文件 `putModel`(约第 156 行)写入这两列。找到构造插入值/`onConflictDoUpdate` 的对象,补:
```ts
      baseUrl: body.baseUrl ?? null,
      apiFormat: body.apiFormat ?? "anthropic",
```
（插入和 `set:` 更新两处都要带上;参照该方法里 `secretReference`/`settings` 已有的写法。）

- [ ] **Step 3d: service 的 `toModelResource` 带出新字段**

`frontend/src/server/modules/settings/settings.service.ts` 的 `toModelResource`(第 87-100 行),在 `settings:` 行**之前**加:
```ts
    baseUrl: row.baseUrl ?? null,
    apiFormat: (row.apiFormat as "anthropic" | "openai_chat") ?? "anthropic",
```

- [ ] **Step 4: 跑测试确认通过 + 契约测试**

Run:
```bash
pnpm --filter creatoros-frontend exec vitest run src/server/modules/settings/settings.repository.integration.test.ts
pnpm --filter @creatoros/contract exec vitest run tests/registry.test.ts
```
Expected: repo 往返 PASS;registry PASS（只扩字段没动路由,SPEC §13 不变)。

- [ ] **Step 5: Commit**

```bash
git add backend/src/schema/settings.ts contract/src/resources/settings.ts contract/src/operations/settings.ts frontend/src/server/modules/settings/settings.repository.ts frontend/src/server/modules/settings/settings.service.ts frontend/src/server/modules/settings/settings.repository.integration.test.ts
git commit -m "feat(settings): model_configurations gains baseUrl + apiFormat"
```

---

## Task 5: 配置解析 `resolve.ts` + service 读 `getModelConfig`

**Files:**
- Modify: `frontend/src/server/modules/settings/settings.service.ts`(加 `getModelConfig`)
- Create: `frontend/src/server/ai/llm/resolve.ts`
- Test: `frontend/src/server/ai/llm/resolve.test.ts`

- [ ] **Step 1: service 暴露整行读 `getModelConfig`**

在 `settings.service.ts` 的 `SettingsService` interface(第 46-65 行)加:
```ts
  getModelConfig(
    ctx: RequestContext,
    capability: string,
  ): Promise<ModelConfigurationResource | null>;
```
在 `createSettingsService` 返回对象里(`resolveModelForCapability` 旁)加实现:
```ts
    async getModelConfig(ctx, capability) {
      const row = await repoForCtx(ctx).getModel(ctx, capability);
      return row ? toModelResource(row) : null;
    },
```

- [ ] **Step 2: 写失败测试(三级 fallback + token 解析 + 报错)**

Create `frontend/src/server/ai/llm/resolve.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import type { RequestContext } from "@creatoros/contract";
import { resolveLlmConfig } from "./resolve";
import { LlmCredentialError } from "./provider";

const ctx: RequestContext = { userId: "u1", requestId: "r1", source: "user" };
const noRow = async () => null;

describe("resolveLlmConfig — tier 1 DB row", () => {
  it("uses the DB row when its secretReference resolves non-empty", async () => {
    const cfg = await resolveLlmConfig(ctx, "planning.thesis", {
      getModelConfig: async () => ({
        id: "m1",
        userId: "u1",
        capability: "planning.thesis",
        provider: "minimax",
        modelName: "MiniMax-M3",
        baseUrl: "https://api.minimaxi.com/anthropic",
        apiFormat: "anthropic",
        secretReference: "env:MINIMAX_AUTH_TOKEN",
        settings: { effort: "high" },
        isDefault: false,
      }),
      env: { MINIMAX_AUTH_TOKEN: "tok-db" },
    });
    expect(cfg).toEqual({
      apiFormat: "anthropic",
      baseUrl: "https://api.minimaxi.com/anthropic",
      model: "MiniMax-M3",
      authStyle: "bearer", // custom baseUrl → bearer
      token: "tok-db",
      settings: { effort: "high" },
    });
  });
});

describe("resolveLlmConfig — tier 2 env default", () => {
  it("falls back to CREATOROS_LLM_* when no usable DB row", async () => {
    const cfg = await resolveLlmConfig(ctx, "planning.thesis", {
      getModelConfig: noRow,
      env: {
        CREATOROS_LLM_BASE_URL: "https://api.minimaxi.com/anthropic",
        CREATOROS_LLM_API_FORMAT: "anthropic",
        CREATOROS_LLM_MODEL: "MiniMax-M3",
        CREATOROS_LLM_AUTH_STYLE: "bearer",
        CREATOROS_LLM_SECRET_REF: "env:MINIMAX_AUTH_TOKEN",
        MINIMAX_AUTH_TOKEN: "tok-env",
      },
    });
    expect(cfg.token).toBe("tok-env");
    expect(cfg.model).toBe("MiniMax-M3");
    expect(cfg.authStyle).toBe("bearer");
  });
  it("skips an empty-string token (first_non_empty) and goes to built-in", async () => {
    const cfg = await resolveLlmConfig(ctx, "planning.thesis", {
      getModelConfig: noRow,
      env: {
        CREATOROS_LLM_SECRET_REF: "env:MINIMAX_AUTH_TOKEN",
        MINIMAX_AUTH_TOKEN: "", // empty placeholder → skip
        ANTHROPIC_API_KEY: "tok-builtin",
      },
    });
    expect(cfg.token).toBe("tok-builtin");
    expect(cfg.baseUrl).toBeNull();
    expect(cfg.model).toBe("claude-opus-4-8");
    expect(cfg.authStyle).toBe("x-api-key");
  });
});

describe("resolveLlmConfig — tier 3 + error", () => {
  it("uses built-in default when only ANTHROPIC_API_KEY is set", async () => {
    const cfg = await resolveLlmConfig(ctx, "copy.generate", {
      getModelConfig: noRow,
      env: { ANTHROPIC_API_KEY: "k" },
    });
    expect(cfg.apiFormat).toBe("anthropic");
    expect(cfg.authStyle).toBe("x-api-key");
  });
  it("throws LlmCredentialError when no tier yields a token", async () => {
    await expect(
      resolveLlmConfig(ctx, "copy.generate", { getModelConfig: noRow, env: {} }),
    ).rejects.toBeInstanceOf(LlmCredentialError);
  });
});
```

- [ ] **Step 3: 跑测试确认失败**

Run:
```bash
pnpm --filter creatoros-frontend exec vitest run src/server/ai/llm/resolve.test.ts
```
Expected: FAIL（`Cannot find module './resolve'`）。

- [ ] **Step 4: 实现 `resolve.ts`**

Create `frontend/src/server/ai/llm/resolve.ts`:
```ts
import "server-only";
import type { RequestContext } from "@creatoros/contract";
import type { ModelConfigurationResource } from "@creatoros/contract";
import {
  LlmCredentialError,
  type ApiFormat,
  type ResolvedLlmConfig,
} from "./provider";

export interface ResolveDeps {
  getModelConfig: (
    ctx: RequestContext,
    capability: string,
  ) => Promise<ModelConfigurationResource | null>;
  env: Record<string, string | undefined>;
}

// "env:FOO" → env.FOO ; trims; returns "" for missing/blank (cc-switch first_non_empty:
// an empty-string placeholder must be SKIPPED, not treated as present).
function resolveSecret(
  secretRef: string | undefined,
  env: Record<string, string | undefined>,
): string {
  if (!secretRef) return "";
  const m = /^env:(.+)$/.exec(secretRef.trim());
  if (!m) return "";
  return (env[m[1]] ?? "").trim();
}

// For the anthropic family: a custom baseUrl (relay / MiniMax) authenticates with a
// Bearer token; the official endpoint (no baseUrl) uses x-api-key.
function deriveAuthStyle(baseUrl: string | null): "bearer" | "x-api-key" {
  return baseUrl ? "bearer" : "x-api-key";
}

export async function resolveLlmConfig(
  ctx: RequestContext,
  capability: string,
  deps: ResolveDeps,
): Promise<ResolvedLlmConfig> {
  const { env } = deps;

  // Tier 1 — the per-capability DB row (user-configured).
  const row = await deps.getModelConfig(ctx, capability);
  if (row) {
    const token = resolveSecret(row.secretReference, env);
    if (token) {
      const baseUrl = row.baseUrl ?? null;
      return {
        apiFormat: row.apiFormat,
        baseUrl,
        model: row.modelName,
        authStyle: deriveAuthStyle(baseUrl),
        token,
        settings: row.settings ?? {},
      };
    }
  }

  // Tier 2 — the .env.local default provider.
  const envToken = resolveSecret(env.CREATOROS_LLM_SECRET_REF, env);
  if (envToken) {
    const baseUrl = env.CREATOROS_LLM_BASE_URL?.trim() || null;
    const apiFormat = (env.CREATOROS_LLM_API_FORMAT?.trim() ||
      "anthropic") as ApiFormat;
    const authStyle =
      env.CREATOROS_LLM_AUTH_STYLE?.trim() === "x-api-key"
        ? "x-api-key"
        : env.CREATOROS_LLM_AUTH_STYLE?.trim() === "bearer"
          ? "bearer"
          : deriveAuthStyle(baseUrl);
    return {
      apiFormat,
      baseUrl,
      model: env.CREATOROS_LLM_MODEL?.trim() || "claude-opus-4-8",
      authStyle,
      token: envToken,
      settings: {},
    };
  }

  // Tier 3 — built-in default: Anthropic official Messages API.
  const builtinToken = (env.ANTHROPIC_API_KEY ?? "").trim();
  if (builtinToken) {
    return {
      apiFormat: "anthropic",
      baseUrl: null,
      model: "claude-opus-4-8",
      authStyle: "x-api-key",
      token: builtinToken,
      settings: {},
    };
  }

  throw new LlmCredentialError(
    `capability "${capability}" 无可用 LLM 凭据:请在 .env.local 设置 CREATOROS_LLM_SECRET_REF 指向的变量(如 MINIMAX_AUTH_TOKEN)或 ANTHROPIC_API_KEY`,
  );
}
```
> 若 `ModelConfigurationResource` 不能从 `@creatoros/contract` 顶层 import,改为从 `@creatoros/contract`(resources 桶)对应导出路径 import;用 `grep -rn "ModelConfigurationResource" contract/src/index.ts` 确认导出点。

- [ ] **Step 5: 跑测试确认通过**

Run:
```bash
pnpm --filter creatoros-frontend exec vitest run src/server/ai/llm/resolve.test.ts
```
Expected: PASS（6 用例全绿）。

- [ ] **Step 6: Commit**

```bash
git add frontend/src/server/modules/settings/settings.service.ts frontend/src/server/ai/llm/resolve.ts frontend/src/server/ai/llm/resolve.test.ts
git commit -m "feat(llm): resolveLlmConfig 三级 fallback + settings.getModelConfig"
```

---

## Task 6: 在 persistence-client 构建 completer 并注入 6 个 runner

**Files:**
- Modify: `frontend/src/server/persistence-client.ts`

> 本任务只接线 + 让 6 个 runner 的 Deps 接受 `llm`,runner 内部替换在 Task 7。先让编译通过(注入了但 runner 暂时没用 `llm` 不报错,因为多一个 dep 字段无妨)。为避免一次性破坏编译,Task 6 与 Task 7 顺序紧邻。

- [ ] **Step 1: 引入 completer 工厂**

在 `persistence-client.ts` 顶部 import 区(约第 147-152 行 runner import 旁)加:
```ts
import { createLlmCompleter } from "@/server/ai/llm/provider";
import { resolveLlmConfig } from "@/server/ai/llm/resolve";
```

- [ ] **Step 2: 在 `settingsService` 建好之后(约第 2148 行 `createSettingsTransport` 之后)构建 completer**

```ts
  // 纯-prompt 节点的可配置 LLM completer:resolveLlmConfig 读 settings 拥有的
  // model_configurations 行(注入 getModelConfig,settings 不反向依赖 ai 层)+ process.env。
  const llmCompleter = createLlmCompleter((ctx, capability) =>
    resolveLlmConfig(ctx, capability, {
      getModelConfig: (c, cap) => settingsService.getModelConfig(c, cap),
      env: process.env,
    }),
  );
```

- [ ] **Step 3: 把 `llm: llmCompleter` 加进 6 个 runner 调用的 deps 对象**

在以下 6 处 `void runXxx(ctx, {...}, { ai: aiService, positioning: ..., learnings: ... })` 的 deps 对象里各加一行 `llm: llmCompleter,`:
- `runScriptDraft`（约 1315）
- `runPlanningThesis`（约 1339）
- `runReviewAnalyze`（约 1358）
- `runPlatformAdapt`（约 1381）
- `runMaterialMatch`（约 1405）
- `runCopilotAssist`（约 1445）

例(planning):
```ts
            {
              ai: aiService,
              positioning: positioningReader,
              learnings: learningsReader,
              llm: llmCompleter,
            },
```

- [ ] **Step 4: 类型检查(此时 6 个 Deps 还没声明 `llm`,预期报错——下一任务修)**

Run:
```bash
pnpm --filter creatoros-frontend exec tsc --noEmit
```
Expected: 报 6 处 “`llm` 不在 XxxDeps 上” 类型错误。这是预期的——Task 7 给每个 Deps 加 `llm` 后即消。**不要在此 commit**(留到 Task 7 末尾一起,保持每次 commit 可编译)。

---

## Task 7: 迁移 6 个 runner(`runClaudeAgent` → `deps.llm`)

**Files:**
- Modify: `frontend/src/server/ai/planning-runner.ts`
- Modify: `frontend/src/server/ai/script-runner.ts`
- Modify: `frontend/src/server/ai/copilot-runner.ts`
- Modify: `frontend/src/server/ai/review-runner.ts`
- Modify: `frontend/src/server/ai/platform-adapt-runner.ts`
- Modify: `frontend/src/server/ai/material-match-runner.ts`
- Test: `frontend/src/server/ai/planning-runner.test.ts`（新建,作为样板)

**统一迁移规则(6 个 runner 同构):**
1. 删 `import { runClaudeAgent } from "./agent-run";`(若同时 import 了 `parseJsonArray`,保留它:`import { parseJsonArray } from "./agent-run";`)。
2. 在 `XxxDeps` interface 加:`llm: import("@/server/ai/llm/provider").LlmCompleter;`(或顶部具名 import `LlmCompleter` 后写 `llm: LlmCompleter;`)。
3. 把发起 LLM 调用的 helper 改成接收一个已绑定的 `complete`,在 entrypoint `runXxx(ctx, task, deps)` 里构造:
   ```ts
   const complete = (prompt: string, opts?: import("@/server/ai/llm/provider").LlmCompleteOptions) =>
     deps.llm(ctx, "<capability>", prompt, opts);
   ```
   并把 `complete` 传进 helper。
4. helper 内部 `const text = await runClaudeAgent(P, { allowedTools: [] });` → `const { text } = await complete(P, { schema: true });`(需要 JSON 的节点传 `{ schema: true }` 触发 `parseJsonLoose`;copilot 纯文本回复传 `{}` 或省略)。

各 runner 的 capability(与 seed catalog 对齐):

| runner | capability | helper(发起调用处) | schema? |
|---|---|---|---|
| planning-runner | `planning.thesis` | `draftThesisTree`(115) | 是 |
| script-runner | `script.rewrite` | `draftStoryboard`(68) | 是 |
| copilot-runner | `copilot.assist` | entrypoint 内联(69) | 否(纯文本) |
| review-runner | `review.insights` | `analyzeReview`(54) | 是 |
| platform-adapt-runner | `script.rewrite` | `adaptDrafts`(80) | 是 |
| material-match-runner | `copy.generate` | `matchMaterials`(58) | 是 |

- [ ] **Step 1: 样板 — 写 planning-runner 的失败测试**

Create `frontend/src/server/ai/planning-runner.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import type { RequestContext } from "@creatoros/contract";
import { runPlanningThesis } from "./planning-runner";

const ctx: RequestContext = { userId: "u1", requestId: "r1", source: "user" };

function makeDeps(llmText: string) {
  const recordCandidate = vi.fn(async () => undefined);
  const llm = vi.fn(async () => ({ text: llmText }));
  return {
    deps: {
      ai: {
        markRunning: vi.fn(async () => undefined),
        recordCandidate,
        cancelTask: vi.fn(async () => undefined),
      } as never,
      positioning: { getPositioningBrief: async () => "" } as never,
      learnings: { getLearningsBrief: async () => "" } as never,
      llm,
    },
    recordCandidate,
    llm,
  };
}

describe("runPlanningThesis with injected llm", () => {
  it("calls deps.llm with planning.thesis capability and records a candidate", async () => {
    const tree =
      '{"core":{"title":"核心","summary":"展开"},"branches":[{"column":"support","title":"s","summary":"x"}]}';
    const { deps, recordCandidate, llm } = makeDeps(tree);
    await runPlanningThesis(
      ctx,
      { id: "t1", projectId: "p1", inputData: { artifactId: "a1" } },
      deps,
    );
    expect(llm).toHaveBeenCalledWith(
      ctx,
      "planning.thesis",
      expect.any(String),
      expect.objectContaining({ schema: true }),
    );
    expect(recordCandidate).toHaveBeenCalledTimes(1);
  });
});
```
> 注:`positioning`/`learnings` 的具体 reader 形状以该 runner 现用的 `ContextDeps` 为准;若 `assembleCreativeContext` 需要更多字段,按 `creative-context.ts` 的 `ContextDeps` 补 `as never` 桩即可(测试只关心 llm 被正确调用 + 落 candidate)。

- [ ] **Step 2: 跑测试确认失败**

Run:
```bash
pnpm --filter creatoros-frontend exec vitest run src/server/ai/planning-runner.test.ts
```
Expected: FAIL（当前 `runPlanningThesis` 仍调 `runClaudeAgent`,`deps.llm` 未被调用 / 类型缺 `llm`)。

- [ ] **Step 3: 改 planning-runner**

`frontend/src/server/ai/planning-runner.ts`:
- 删第 9 行 `import { runClaudeAgent } from "./agent-run";`。
- 顶部加:`import type { LlmCompleteOptions, LlmCompleter } from "@/server/ai/llm/provider";`。
- `PlanningDeps`(第 23-25 行)加 `llm: LlmCompleter;`:
  ```ts
  export interface PlanningDeps extends ContextDeps {
    ai: AiService;
    llm: LlmCompleter;
  }
  ```
- `draftThesisTree`(第 115 行)签名加一个 `complete` 参数,并替换调用:
  ```ts
  type Complete = (prompt: string, opts?: LlmCompleteOptions) => Promise<{ text: string }>;

  async function draftThesisTree(
    context: CreativeContext,
    complete: Complete,
  ): Promise<ThesisTree> {
    const { text } = await complete(buildThesisPrompt(context), { schema: true });
    const obj = parseJsonObject(text);
    // ...(其余解析逻辑不变)
  ```
- entrypoint `runPlanningThesis`(第 207 行附近)调用处:
  ```ts
    const tree = await draftThesisTree(context, (prompt, opts) =>
      deps.llm(ctx, "planning.thesis", prompt, opts),
    );
  ```

- [ ] **Step 4: 跑 planning 测试确认通过**

Run:
```bash
pnpm --filter creatoros-frontend exec vitest run src/server/ai/planning-runner.test.ts
```
Expected: PASS。

- [ ] **Step 5: 按同构规则改其余 5 个 runner**

对 `script-runner` / `copilot-runner` / `review-runner` / `platform-adapt-runner` / `material-match-runner` 套用上面「统一迁移规则」与表格:

- **script-runner**:`ScriptDeps` 加 `llm`;`draftStoryboard(context)` → `draftStoryboard(context, complete)`,内部 `const { text } = await complete(buildScriptPrompt(context), { schema: true });`;entrypoint 传 `(p,o)=>deps.llm(ctx,"script.rewrite",p,o)`。保留 `parseJsonArray` import。
- **copilot-runner**:`CopilotDeps` 加 `llm`;entrypoint 第 69 行 `const reply = await runClaudeAgent(prompt, { allowedTools: [] });` → `const { text: reply } = await deps.llm(ctx, "copilot.assist", prompt);`(纯文本,不传 schema)。
- **review-runner**:`ReviewDeps` 加 `llm`;`analyzeReview(context)` → `analyzeReview(context, complete)`,内部 `const { text } = await complete(buildReviewPrompt(context), { schema: true });`;entrypoint 传 `(p,o)=>deps.llm(ctx,"review.insights",p,o)`。保留 `parseJsonArray`。
- **platform-adapt-runner**:`PlatformAdaptDeps` 加 `llm`;`adaptDrafts(...)`(80)多接一个 `complete` 参数,内部第 85 行 `const text = await runClaudeAgent(<prompt>, { allowedTools: [] });` → `const { text } = await complete(<prompt>, { schema: true });`;entrypoint 传 `(p,o)=>deps.llm(ctx,"script.rewrite",p,o)`。保留 `parseJsonArray`。
- **material-match-runner**:`MaterialMatchDeps` 加 `llm`;`matchMaterials(...)`(58)多接 `complete`,内部第 62 行 `const text = await runClaudeAgent(buildMatchPrompt(context, topic), { allowedTools: [] });` → `const { text } = await complete(buildMatchPrompt(context, topic), { schema: true });`;entrypoint 传 `(p,o)=>deps.llm(ctx,"copy.generate",p,o)`。保留 `parseJsonArray`。

每个 runner 顶部都加:`import type { LlmCompleteOptions, LlmCompleter } from "@/server/ai/llm/provider";`(copilot 只需 `LlmCompleter`)。helper 的 `Complete` 类型可复用 `(prompt: string, opts?: LlmCompleteOptions) => Promise<{ text: string }>`。

- [ ] **Step 6: 全量类型检查(Task 6 的 6 处类型错误现在应清零)**

Run:
```bash
pnpm --filter creatoros-frontend exec tsc --noEmit
```
Expected: 0 error。若仍报 `runClaudeAgent` 未使用 import,删掉对应 runner 顶部残留的 import。

- [ ] **Step 7: 跑 ai 模块验收(确认没破坏「禁 Agent-SDK import」等不变量)**

Run:
```bash
pnpm --filter creatoros-frontend exec vitest run src/server/modules/ai/ai.acceptance.test.ts src/server/ai
```
Expected: PASS。`agent-run.ts` 仍被 research/topic 两个 runner 使用,未删除。

- [ ] **Step 8: Commit(Task 6 + 7 一起,保证可编译)**

```bash
git add frontend/src/server/persistence-client.ts frontend/src/server/ai/planning-runner.ts frontend/src/server/ai/planning-runner.test.ts frontend/src/server/ai/script-runner.ts frontend/src/server/ai/copilot-runner.ts frontend/src/server/ai/review-runner.ts frontend/src/server/ai/platform-adapt-runner.ts frontend/src/server/ai/material-match-runner.ts
git commit -m "feat(llm): route 6 pure-prompt nodes through configurable provider (was Agent SDK)"
```

---

## Task 8: 全量验证 + 手动冒烟

**Files:** 无(验证 + 文档)

- [ ] **Step 1: 全量 verify**

Run:
```bash
pnpm verify
```
Expected: typecheck + contract(契约测试)+ frontend(全部 vitest)全绿。若 `pnpm verify` 脚本名不同,用 `cat package.json | grep -A2 scripts` 找到等价的全量校验脚本。

- [ ] **Step 2: 配置 `.env.local` 接 MiniMax(真实冒烟前置)**

Create/edit `frontend/.env.local`(**绝不 commit**;用户提供的真实 token):
```bash
CREATOROS_LLM_BASE_URL=https://api.minimaxi.com/anthropic
CREATOROS_LLM_API_FORMAT=anthropic
CREATOROS_LLM_MODEL=MiniMax-M3
CREATOROS_LLM_AUTH_STYLE=bearer
CREATOROS_LLM_SECRET_REF=env:MINIMAX_AUTH_TOKEN
MINIMAX_AUTH_TOKEN=<用户的真实 sk-... token>
```
确认:`git status` 不出现 `frontend/.env.local`。

- [ ] **Step 3: 起 dev,手动触发 AI 论点树**

Run:
```bash
pnpm --filter creatoros-frontend dev
```
打开任一项目 → 策划阶段 → 触发「AI 论点树」生成 → 等候 → 应出现真实 MiniMax 生成的论点树草稿候选(核心论点 + 支撑/证据/反驳分支),可采纳。浏览器控制台 0 报错。
- 验证「走的是 MiniMax 而非订阅」:临时把 `MINIMAX_AUTH_TOKEN` 改成无效值重试 → 任务应 failed 且日志含可读的 `LlmCredentialError`/上游 401(证明确实打的是配置端点)。改回有效值恢复。

- [ ] **Step 4: 记录高价值事件(全局 CLAUDE.md 要求)**

Run:
```bash
SKILL=/Users/zyongzhu/.claude/skills/thirdspace-vault/scripts/thirdspace-vault.mjs
node "$SKILL" record-agent-event --cwd "$PWD" --summary "CreatorOS 接入配置化纯-LLM 层,6 个纯-prompt 节点改走可配置 Messages API(MiniMax/Anthropic),密钥走 .env.local" --decision "聚焦方案+env 间接+全改 Messages API" --reason "永不写死单一供应商(cc-switch 方法论);带 tool 的 research/topic 仍走 Agent SDK"
```

- [ ] **Step 5: 合并(走既有 worktree→main 流程)**

按本项目既有惯例把 `feat/service-contract` 合回 `main`(此前各 wave 均如此)。确认 `.env.local` 不在变更集中。

---

## 验证清单(Self-Review 对照 spec)

- [x] §2 统一接口 → Task 2 `provider.ts`
- [x] §3.1 表扩 baseUrl/apiFormat → Task 4
- [x] §3.2 三级 fallback 取非空 → Task 5 `resolve.ts`(含空串跳过用例)
- [x] §3.3 `.env.local` 契约 → Task 0 `.env.example` + Task 8 真实填值
- [x] §4.1 anthropic 适配器(bearer/x-api-key 双路)→ Task 3
- [x] §4.2 openai_chat 留桩 → Task 2 工厂抛 `LlmNotImplementedError`
- [x] §4.3 schema → `buildSystem` + `parseJsonLoose` → Task 1
- [x] §5 6 节点迁移 + research/topic 不动 → Task 6/7
- [x] §6 无凭据明确抛错 → `LlmCredentialError`(Task 5)
- [x] §7 测试(解析链/适配器/schema/节点确定性/不破坏 ai 验收)→ Task 1-7
- [x] §8 文件清单 → File Structure 一致
- [x] §9 不做项(预设/验活/管理 UI/注册表)→ 未列入任何 task
