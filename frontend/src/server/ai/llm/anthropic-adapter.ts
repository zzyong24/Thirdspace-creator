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
