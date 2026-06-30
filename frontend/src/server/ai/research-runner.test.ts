import { describe, it, expect, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { RequestContext } from "@creatoros/contract";

// 素材搜集 runner 迁 Vercel SDK 后:不再 import agent-run 的 runClaudeAgent(Claude Agent SDK),
// 改 mock ai-worker 的 runResearchNode(动态 import 的目标)。runner 解析 model(resolveModelSpec)
// → anthropic 时挂 provider 内置 web search → runResearchNode 拿 items → recordCandidate
// (material_list)。这里验证:capability 被正确解析、anthropic 路径挂上 web search 工具、
// 非 anthropic 路径不引第三方搜索、无素材时不假成功(cancelTask)。
const runResearchNode = vi.fn(
  async (_input: { tools?: unknown }) => ({ items: [], steps: [] }),
);
const anthropicWebSearchTools = vi.fn(() => ({ web_search: "WEBSEARCH_TOOL" }));
vi.mock("@creatoros/ai-worker", () => ({
  modelFor: vi.fn(() => ({}) as never),
  runResearchNode,
  anthropicWebSearchTools,
}));

import { runGatherMaterial } from "./research-runner";

const HERE = dirname(fileURLToPath(import.meta.url));
const ctx: RequestContext = { userId: "u1", requestId: "r1", source: "user" };

interface MaterialItemLike {
  title: string;
  url: string;
  source: string;
  why_relevant: string;
}

function makeDeps(
  items: MaterialItemLike[],
  apiFormat: "anthropic" | "openai_chat" = "anthropic",
) {
  runResearchNode.mockResolvedValue({ items, steps: [] } as never);
  const recordCandidate = vi.fn(
    async (
      _ctx: RequestContext,
      _taskId: string,
      _input: { resultType: string; resultData: Record<string, unknown> },
    ) => undefined,
  );
  const cancelTask = vi.fn(async () => undefined);
  const resolveModelSpec = vi.fn(async () => ({
    apiFormat,
    baseUrl: apiFormat === "anthropic" ? null : "https://relay.example/v1",
    model: apiFormat === "anthropic" ? "claude-opus-4-8" : "deepseek-chat",
    token: "k",
  }));
  return {
    deps: {
      ai: {
        markRunning: vi.fn(async () => undefined),
        recordCandidate,
        recordStep: vi.fn(async () => undefined),
        cancelTask,
      } as never,
      positioning: {
        getPositioningCenter: async () => ({
          profile: null,
          currentStatement: null,
        }),
      } as never,
      resolveModelSpec,
    },
    recordCandidate,
    cancelTask,
    resolveModelSpec,
  };
}

describe("runGatherMaterial (Vercel SDK + anthropic 内置 web search)", () => {
  it("解析 research.gather capability,anthropic 路径挂 web search,落 material_list 候选", async () => {
    const items: MaterialItemLike[] = [
      { title: "素材一", url: "u1", source: "s1", why_relevant: "对定位有用" },
    ];
    const { deps, recordCandidate, resolveModelSpec } = makeDeps(items);
    await runGatherMaterial(
      ctx,
      { id: "t1", projectId: "p1", inputData: { topic: "复现 MLA" } },
      deps,
    );
    expect(resolveModelSpec).toHaveBeenCalledWith(ctx, "research.gather");
    // anthropic 路径:web search 工具被构造并传入节点。
    expect(anthropicWebSearchTools).toHaveBeenCalledTimes(1);
    expect(runResearchNode).toHaveBeenCalledTimes(1);
    const nodeArg = runResearchNode.mock.calls[0]![0] as {
      tools?: { web_search?: unknown };
    };
    expect(nodeArg.tools?.web_search).toBe("WEBSEARCH_TOOL");
    expect(recordCandidate).toHaveBeenCalledTimes(1);
    const input = recordCandidate.mock.calls[0]![2];
    expect(input.resultType).toBe("material_list");
    const recorded = (input.resultData as { items: unknown[] }).items;
    expect(Array.isArray(recorded)).toBe(true);
    expect(recorded.length).toBe(1);
  });

  it("非 anthropic 端点:不挂内置 web search(不擅自引第三方搜索)", async () => {
    anthropicWebSearchTools.mockClear();
    const items: MaterialItemLike[] = [
      { title: "素材", url: "u", source: "s", why_relevant: "w" },
    ];
    const { deps } = makeDeps(items, "openai_chat");
    await runGatherMaterial(
      ctx,
      { id: "t2", projectId: null, inputData: { topic: "x" } },
      deps,
    );
    expect(anthropicWebSearchTools).not.toHaveBeenCalled();
    const nodeArg = runResearchNode.mock.calls.at(-1)![0] as {
      tools?: unknown;
    };
    expect(nodeArg.tools).toBeUndefined();
  });

  it("无可解析素材 → cancelTask(不落候选,不假成功)", async () => {
    const { deps, recordCandidate, cancelTask } = makeDeps([]);
    await runGatherMaterial(
      ctx,
      { id: "t3", projectId: "p1", inputData: { topic: "x" } },
      deps,
    );
    expect(recordCandidate).not.toHaveBeenCalled();
    expect(cancelTask).toHaveBeenCalledTimes(1);
  });
});

// 门卫(产品定位 §9 铁律1):frontend AI composition 层下绝无 Claude Agent SDK import。
// 参考 backend ai.acceptance 的 determinism-boundary 扫描思路:逐源文件断言不出现
// `from "@anthropic-ai/claude-agent-sdk"`。这是「去掉全仓最后一个 Claude Agent SDK 依赖」
// 的回归锁:任何人重新 import 它都会让本断言失败。
describe("门卫:frontend AI 层无 Claude Agent SDK import", () => {
  it("src/server/ai/ 下没有任何 @anthropic-ai/claude-agent-sdk import", () => {
    const offenders: string[] = [];
    for (const f of readdirSync(HERE)) {
      if (!f.endsWith(".ts") && !f.endsWith(".tsx")) continue;
      // 排除本测试文件自身(它在断言里写了该字符串)。
      if (f === "research-runner.test.ts") continue;
      const src = readFileSync(join(HERE, f), "utf8");
      if (/from\s+["']@anthropic-ai\/claude-agent-sdk["']/.test(src)) {
        offenders.push(f);
      }
      // 也抓住通过变量 specifier 动态 import 的旧写法(agent-run 曾用 sdkSpecifier 绕开打包器)。
      if (/["']@anthropic-ai\/claude-agent-sdk["']/.test(src)) {
        offenders.push(`${f} (literal specifier)`);
      }
    }
    expect(offenders, `unexpected Claude Agent SDK refs: ${offenders.join(", ")}`).toEqual([]);
  });
});
