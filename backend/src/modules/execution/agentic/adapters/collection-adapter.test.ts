import { describe, it, expect } from "vitest";
import {
  createCollectionTools,
  type CollectionPorts,
} from "./collection-adapter";

// [T-256c] 抓取决策适配器:agent 决策(collect.plan 列目标)· 确定性端口执行(collect.run 限流采集)。

const noSig = new AbortController().signal;
function toolsOf(over: Partial<CollectionPorts> = {}) {
  const runs: string[] = [];
  const ports: CollectionPorts = {
    async listTargets() {
      return {
        targets: [
          { id: "old", label: "老作品", lastCollectedAt: "2026-01-01T00:00:00.000Z" },
          { id: "new", label: "新作品", lastCollectedAt: "2026-07-01T00:00:00.000Z" },
        ],
      };
    },
    async runCollection({ targetId }) {
      runs.push(targetId);
      return { ok: true, itemsNew: 3, itemsUpdated: 1 };
    },
    ...over,
  };
  const byName = Object.fromEntries(
    createCollectionTools(ports).map((t) => [t.name, t]),
  );
  return { byName, runs };
}

describe("createCollectionTools", () => {
  it("两工具 + 副作用等级(plan 只读,run writeback)", () => {
    const { byName } = toolsOf();
    expect(Object.keys(byName).sort()).toEqual(["collect.plan", "collect.run"]);
    expect(byName["collect.plan"]!.effect).toBe("none");
    expect(byName["collect.run"]!.effect).toBe("writeback");
  });

  it("collect.plan:列目标(纯读)", async () => {
    const { byName } = toolsOf();
    const r = await byName["collect.plan"]!.execute({}, { signal: noSig, dryRun: false });
    expect((r.data as { targets: unknown[] }).targets.length).toBe(2);
  });

  it("collect.run:planInput 挑最久未采(决策),端口执行采集", async () => {
    const { byName, runs } = toolsOf();
    const run = byName["collect.run"]!;
    const input = run.planInput!("goal", {
      "collect.plan": {
        targets: [
          { id: "old", lastCollectedAt: "2026-01-01T00:00:00.000Z" },
          { id: "new", lastCollectedAt: "2026-07-01T00:00:00.000Z" },
        ],
      },
    });
    expect((input as { targetId: string }).targetId).toBe("old"); // 最久未采
    const r = await run.execute(input, { signal: noSig, dryRun: false });
    expect(r.summary).toContain("新增 3");
    expect(runs).toEqual(["old"]);
  });

  it("collect.run:干跑只出计划不采(限流端口不被触达)", async () => {
    const { byName, runs } = toolsOf();
    const r = await byName["collect.run"]!.execute({ targetId: "old" }, { signal: noSig, dryRun: true });
    expect(r.plan).toBeTruthy();
    expect(runs.length).toBe(0);
  });

  it("collect.run:端口报未登录 → 诚实跳过(needs_reconnect,非崩)", async () => {
    const { byName } = toolsOf({
      async runCollection() {
        return { ok: false, needsLogin: true };
      },
    });
    const r = await byName["collect.run"]!.execute({ targetId: "old" }, { signal: noSig, dryRun: false });
    expect(r.summary).toContain("需重新登录");
    expect((r.data as { needsLogin: boolean }).needsLogin).toBe(true);
  });
  it("提交回执不伪装完成或新增作品，下一次透传 runId 轮询", async () => {
    let seen: unknown;
    const { byName } = toolsOf({ async runCollection(input) {
      seen = input;
      return { ok: false, pending: true, runId: "run-1", taskId: "task-1", status: "running" };
    } });
    const result = await byName["collect.run"]!.execute({ targetId: "target", runId: "run-1" }, { signal: noSig, dryRun: false });
    expect(seen).toEqual({ targetId: "target", runId: "run-1" });
    expect(result).toMatchObject({ hasEvidence: false, data: { pending: true, runId: "run-1", taskId: "task-1" } });
    expect(result.data).not.toHaveProperty("itemsNew");
  });

  it("分页目标保留下一页位置，不把当前页当作全部来源", async () => {
    const { byName } = toolsOf({ async listTargets(input) {
      expect(input).toEqual({ limit: 20, offset: 20 });
      return { targets: [], nextOffset: 40, total: 100 };
    } });
    const result = await byName["collect.plan"]!.execute({ offset: 20 }, { signal: noSig, dryRun: false });
    expect(result.data).toEqual({ targets: [], nextOffset: 40, total: 100 });
  });

});
