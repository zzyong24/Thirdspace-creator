import type { RequestContext } from "@creatoros/contract";
import { createAnthropicProvider } from "./anthropic-adapter";

export type ApiFormat =
  | "anthropic"
  | "openai_chat"
  | "openai_responses";

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
  openai_responses: () => {
    throw new LlmNotImplementedError("openai_responses 适配器尚未实现");
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
