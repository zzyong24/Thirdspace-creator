import { describe, it, expect } from "vitest";
import { createMaterialTools, type MaterialPorts } from "./material-adapter";

// [T-256c] 素材整理适配器:agent 决策(search)· 端口执行(organize,可逆整理,铁律②)。

const noSig = new AbortController().signal;
function toolsOf(over: Partial<MaterialPorts> = {}) {
  const organized: Array<{ ids: string[]; tag: string }> = [];
  const ports: MaterialPorts = {
    async searchMaterials() {
      return {
        items: [
          { id: "a1", title: "图1", kind: "image" },
          { id: "a2", title: "图2", kind: "image" },
        ],
      };
    },
    async organizeMaterials({ assetIds, tag }) {
      organized.push({ ids: assetIds, tag });
      return { affected: assetIds.length };
    },
    ...over,
  };
  const byName = Object.fromEntries(
    createMaterialTools(ports).map((t) => [t.name, t]),
  );
  return { byName, organized };
}

describe("createMaterialTools", () => {
  it("两工具 + 副作用等级(search 只读,organize writeback)", () => {
    const { byName } = toolsOf();
    expect(Object.keys(byName).sort()).toEqual([
      "material.organize",
      "material.search",
    ]);
    expect(byName["material.search"]!.effect).toBe("none");
    expect(byName["material.organize"]!.effect).toBe("writeback");
  });

  it("material.search:纯读搜素材", async () => {
    const { byName } = toolsOf();
    const r = await byName["material.search"]!.execute({ query: "封面" }, { signal: noSig, dryRun: false });
    expect((r.data as { items: unknown[] }).items.length).toBe(2);
  });

  it("material.organize:只执行明确的模型决策，确定性回退不编造标签", async () => {
    const { byName, organized } = toolsOf();
    const org = byName["material.organize"]!;
    expect(org.planInput).toBeUndefined();
    const input = { assetIds: ["a1", "a2"], tag: "夏日主题" };
    const r = await org.execute(input, { signal: noSig, dryRun: false });
    expect(r.summary).toContain("2 个素材");
    expect(organized).toEqual([{ ids: ["a1", "a2"], tag: "夏日主题" }]);
  });

  it("material.organize:干跑只出计划不写", async () => {
    const { byName, organized } = toolsOf();
    const r = await byName["material.organize"]!.execute(
      { assetIds: ["a1"], tag: "x" },
      { signal: noSig, dryRun: true },
    );
    expect(r.plan).toBeTruthy();
    expect(organized.length).toBe(0);
  });
});
