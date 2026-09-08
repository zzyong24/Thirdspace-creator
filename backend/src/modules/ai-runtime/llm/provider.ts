import type { RequestContext } from "@creatoros/contract";

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
  /** 渠道托管配置只允许向日志/API 投影这个统一标签，禁止暴露 opaque provider/model。 */
  displayModelKey?: "channel-managed";
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

