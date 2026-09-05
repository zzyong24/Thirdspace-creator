import { describe, it, expect, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { prepareResearchGatherContext } from "./research-runner";
const HERE = dirname(fileURLToPath(import.meta.url));
const ctx = {
  userId: "u",
  accountId: "a",
  requestId: "r",
  source: "user" as const,
};
describe("research prepare 真实上下文", () => {
  it("保留定位、主题、切入角度及第一手素材优先，不调用模型", async () => {
    const listProjectMaterials = vi.fn(async () => [
      {
        name: "资料.pdf",
        priority: "high" as const,
        extractStatus: "done",
        materialSummary: { keyPoints: ["核心卖点"], facts: ["真实事实"] },
      },
    ]);
    const positioning = {
      getPositioningCenter: async () => ({
        profile: null,
        currentStatement: { oneLiner: "真实定位", keywords: ["真实关键词"] },
      }),
    };
    const facets = await prepareResearchGatherContext(
      ctx,
      { projectId: "p", inputData: { topic: "主题", angle: "切入" } },
      {
        positioning,
        projectMaterials: { listProjectMaterials },
        assertProject: async () => {},
      },
    );
    expect(facets.positioning).toContain("真实定位");
    expect(facets.positioning).toContain("真实关键词");
    expect(facets.topic).toBe("主题");
    expect(facets.angle).toContain("切入");
    expect(facets.userMaterial).toContain("核心卖点");
    expect(facets.userMaterial).toContain("最高优先");
    expect(listProjectMaterials).toHaveBeenCalledWith(ctx, "p");
    expect(facets.searchResults).toBe("");
    expect(facets.groundingNote).toContain("模型记忆");
  });
  it("无项目不读取项目素材，定位缺失保持诚实兜底", async () => {
    const listProjectMaterials = vi.fn(async () => []);
    const facets = await prepareResearchGatherContext(
      ctx,
      { projectId: null, inputData: {} },
      {
        positioning: {
          getPositioningCenter: async () => ({
            profile: null,
            currentStatement: null,
          }),
        },
        projectMaterials: { listProjectMaterials },
      },
    );
    expect(listProjectMaterials).not.toHaveBeenCalled();
    expect(facets.positioning).toContain("尚未设置定位");
    expect(facets.userMaterial).toBe("");
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
    expect(
      offenders,
      `unexpected Claude Agent SDK refs: ${offenders.join(", ")}`,
    ).toEqual([]);
  });
});
