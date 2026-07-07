import { describe, it, expect, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { RequestContext } from "@creatoros/contract";

// 素材搜集 runner(L2 创作向重写):节点改 generateObject 绑四类 outputSchema(纯结构化生成,
// 不挂 web search),mock ai-worker 的 runResearchNode(动态 import 的目标)。runner 解析 model
// (resolveModelSpec)→ runResearchNode 拿 {items, categories} → recordCandidate(material_list,
// items 喂采纳路径 + categories 供工作台分类展示)。这里验证:capability 被正确解析、不再给节点
// 传任何 web search 工具(纯结构化)、候选带 items+categories、无素材时不假成功(cancelTask)。
const runResearchNode = vi.fn(
  async (_input: { tools?: unknown }) => ({
    items: [],
    categories: { hooks: [], cases: [], dataPoints: [], quotes: [] },
  }),
);
vi.mock("@creatoros/ai-worker", () => ({
  modelFor: vi.fn(() => ({}) as never),
  runResearchNode,
  // [T-146d] runner 解构 formatUserMaterialFacet(仅当 context 有高优先素材时才调;这些测试无
  // projectMaterials reader → hardBrief 空 → 不实际调用,但解构需该导出存在)。透传实现即可。
  formatUserMaterialFacet: (s: string) => (s ? `【素材】${s}` : ""),
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

const EMPTY_CATEGORIES = { hooks: [], cases: [], dataPoints: [], quotes: [] };

function makeDeps(
  items: MaterialItemLike[],
  apiFormat: "anthropic" | "openai_chat" = "anthropic",
) {
  runResearchNode.mockResolvedValue({
    items,
    categories: EMPTY_CATEGORIES,
  } as never);
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

describe("runGatherMaterial (Vercel SDK + 结构化四类候选)", () => {
  it("解析 research.gather capability,纯结构化生成(不挂工具),落 material_list 候选(items+categories)", async () => {
    const items: MaterialItemLike[] = [
      { title: "钩子：素材一", url: "", source: "", why_relevant: "对定位有用" },
    ];
    const categories = {
      hooks: [{ text: "素材一", why: "对定位有用" }],
      cases: [],
      dataPoints: [],
      quotes: [],
    };
    const { deps, recordCandidate, resolveModelSpec } = makeDeps(items);
    runResearchNode.mockResolvedValue({ items, categories } as never);
    await runGatherMaterial(
      ctx,
      { id: "t1", projectId: "p1", inputData: { topic: "复现 MLA" } },
      deps,
    );
    expect(resolveModelSpec).toHaveBeenCalledWith(ctx, "research.gather");
    expect(runResearchNode).toHaveBeenCalledTimes(1);
    // 纯结构化:不给节点传任何 web search 工具。
    const nodeArg = runResearchNode.mock.calls[0]![0] as { tools?: unknown };
    expect(nodeArg.tools).toBeUndefined();
    expect(recordCandidate).toHaveBeenCalledTimes(1);
    const input = recordCandidate.mock.calls[0]![2];
    expect(input.resultType).toBe("material_list");
    const data = input.resultData as {
      items: unknown[];
      categories: { hooks: unknown[] };
    };
    // items 摊平喂采纳路径 + categories 原样回带供工作台分类展示。
    expect(Array.isArray(data.items)).toBe(true);
    expect(data.items.length).toBe(1);
    expect(data.categories.hooks.length).toBe(1);
  });

  it("非 anthropic 端点也走纯结构化:不挂工具(模型可配,不强依赖某厂商服务端工具)", async () => {
    const items: MaterialItemLike[] = [
      { title: "钩子：素材", url: "", source: "", why_relevant: "w" },
    ];
    const { deps } = makeDeps(items, "openai_chat");
    await runGatherMaterial(
      ctx,
      { id: "t2", projectId: null, inputData: { topic: "x" } },
      deps,
    );
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
