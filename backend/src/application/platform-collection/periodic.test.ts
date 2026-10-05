import { describe, expect, it, vi } from "vitest";
import type { CollectionRunResource, RequestContext } from "@creatoros/contract";
import { createPeriodicPlatformCollection } from "./periodic";

const ctx: RequestContext = { userId: "user-a", requestId: "periodic", source: "ingestion" };
const time = "2026-09-30T12:00:00.000Z";
function run(accountId: string, status: CollectionRunResource["status"], startedAt = time): CollectionRunResource {
  return { attemptId: `run-${accountId}`, accountId, capability: "workCatalog", status,
    generation: 1, committedPages: 0, completeCatalogGeneration: null,
    reasonCode: null, startedAt, updatedAt: startedAt };
}

describe("小红书与快手定期采集", () => {
  it("只调度活跃的两平台账号，每号独立写入并恢复作品目录", async () => {
    const accounts = [
      { id: "xhs", platform: "xiaohongshu", status: "active" },
      { id: "ks", platform: "kuaishou", status: "active" },
      { id: "dy", platform: "douyin", status: "active" },
      { id: "old", platform: "xiaohongshu", status: "archived" },
    ];
    const start = vi.fn(async (scope: RequestContext, input: { accountId: string }) => run(input.accountId, "queued"));
    const resume = vi.fn();
    const tick = createPeriodicPlatformCollection({
      listAccounts: async () => ({ rows: accounts }), latestRun: async () => null,
      start, resume, onError: vi.fn(), now: () => time,
    });
    await tick(ctx);
    expect(start.mock.calls.map(([scope, input]) => [scope.accountId, input.accountId])).toEqual([["xhs", "xhs"], ["ks", "ks"]]);
    expect(resume).toHaveBeenCalledTimes(2);
  });

  it("重启后恢复排队任务，六小时内不重复采集，需重连账号暂停", async () => {
    const start = vi.fn(async (_scope: RequestContext, _input: { accountId: string; capability: "workCatalog"; clientRequestId: string }) => run("new", "queued"));
    const resume = vi.fn();
    const latest = new Map([
      ["queued", run("queued", "queued")],
      ["fresh", run("fresh", "complete")],
      ["auth", run("auth", "needsAuth", "2026-09-29T00:00:00.000Z")],
      ["stale", run("stale", "complete", "2026-09-29T00:00:00.000Z")],
    ]);
    const tick = createPeriodicPlatformCollection({
      listAccounts: async () => ({ rows: [...latest.keys()].map(id => ({ id, platform: "xiaohongshu", status: "active" })) }),
      latestRun: async (_scope, id) => latest.get(id) ?? null,
      start, resume, onError: vi.fn(), now: () => time,
    });
    await tick(ctx);
    expect(start).toHaveBeenCalledTimes(1);
    expect(start.mock.calls[0]?.[1]).toMatchObject({ accountId: "stale", capability: "workCatalog" });
    expect(resume.mock.calls.map(([, item]) => item.accountId)).toEqual(["queued", "new"]);
  });

  it("一个账号失败不会阻断其他账号，并限制失败重试频率", async () => {
    const start = vi.fn(async (_scope: RequestContext, input: { accountId: string }) => {
      if (input.accountId === "bad") throw new Error("source changed");
      return run(input.accountId, "queued");
    });
    const onError = vi.fn();
    const tick = createPeriodicPlatformCollection({
      listAccounts: async () => ({ rows: ["bad", "good"].map(id => ({ id, platform: "kuaishou", status: "active" })) }),
      latestRun: async () => null, start, resume: vi.fn(), onError, now: () => time,
    });
    await tick(ctx);
    await tick(ctx);
    expect(start.mock.calls.map(([, input]) => input.accountId)).toEqual(["bad", "good", "good"]);
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
