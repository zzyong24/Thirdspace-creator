import { describe, it, expect } from "vitest";
import { z } from "zod";
import { MockLanguageModelV4 } from "ai/test";
import type { LanguageModelV4GenerateResult } from "@ai-sdk/provider";
import { toToolSet, type ToolDef } from "./tool-registry";
import { runAgentNode } from "./agent-runtime";

const FINAL: LanguageModelV4GenerateResult = {
  content: [{ type: "text", text: "完成" }],
  finishReason: { unified: "stop", raw: undefined },
  usage: {
    inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: 1, text: 1, reasoning: undefined },
  },
  warnings: [],
};

describe("toToolSet", () => {
  it("把 ToolDef 包成 ToolSet(按名注册,execute 保留)", async () => {
    let called = "";
    const search: ToolDef<{ q: string }, { hits: string[] }> = {
      name: "search_hotspots",
      description: "搜当下与定位相关的热点;入参 q=检索词。",
      inputSchema: z.object({ q: z.string() }),
      execute: async ({ q }) => {
        called = q;
        return { hits: [`热点:${q}`] };
      },
    };

    const set = toToolSet([search]);
    expect(Object.keys(set)).toContain("search_hotspots");
    expect(set.search_hotspots).toBeTruthy();

    // execute 真的保留并能跑(领域逻辑由它桥到 service port)。
    const out = await (search.execute({ q: "MLA" }) as Promise<{ hits: string[] }>);
    expect(out.hits[0]).toContain("MLA");
    expect(called).toBe("MLA");
  });

  it("ToolSet 能喂给 runAgentNode(类型 + 运行兼容)", async () => {
    const set = toToolSet([
      {
        name: "noop",
        description: "占位工具。",
        inputSchema: z.object({}),
        execute: () => ({ ok: true }),
      },
    ]);
    const model = new MockLanguageModelV4({ doGenerate: async () => FINAL });
    const res = await runAgentNode({
      model,
      system: "s",
      prompt: "p",
      tools: set,
    });
    expect(res.steps.length).toBeGreaterThanOrEqual(1);
  });
});
