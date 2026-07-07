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
