import Anthropic from "@anthropic-ai/sdk";
import type { LlmProvider, ResolvedLlmConfig } from "./provider";
import { buildSystem, extractText, parseJsonLoose } from "./parse";
import { resolveLlmMaxRetries } from "./retry-policy";

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
  new Anthropic({
    ...buildAnthropicClientOptions(config),
    // Bound the call so a slow/stalled provider fails fast (the task surfaces a
    // readable error) instead of spinning forever. Reasoning models (MiniMax-M3)
    // can take ~40s+, so allow generous headroom but not the SDK's 10-min default.
    timeout: 150000,
    // [T-239b S1] 重试次数可配(env CREATOROS_LLM_MAX_RETRIES,默认 3)—— 原写死 1,
    // MiniMax cancelled 类瞬时故障一次就崩整轮。此路径(旧 @anthropic-ai/sdk)由 SDK 自带
    // 指数退避执行重试;分类/退避语义的精细版在新 AI SDK 路径(recovering-model)。
    maxRetries: resolveLlmMaxRetries(process.env),
  }) as unknown as MessagesClient;

export function createAnthropicProvider(
  config: ResolvedLlmConfig,
  clientFactory: ClientFactory = defaultClientFactory,
): LlmProvider {
  // Lazy: defer client construction to first call so that merely building a
  // provider (getLlmProvider) doesn't trigger the Anthropic SDK's browser-check.
  let client: MessagesClient | undefined;
  const getClient = () => (client ??= clientFactory(config));
  return {
    async complete(prompt, opts = {}) {
      const system = buildSystem(opts.system, opts.schema);
      const message = await getClient().messages.create({
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
