import { describe, expect, it } from "vitest";
import type { RequestContext } from "@creatoros/contract";
import { createDb } from "../../db";
import { platformAccounts } from "../../schema/platform-account";
import { platformCollectionBindings } from "../../schema/platform-collection";
import { createPlatformCollectionService } from "../../modules/platform-collection";
import { createPeriodicPlatformCollection } from "./periodic";

const now = "2026-09-30T12:00:00.000Z";
const ctx: RequestContext = { userId: "user-periodic", requestId: "periodic-test", source: "ingestion" };

describe("定期采集与真实持久 service 组合", () => {
  it("只为已核验的小红书与快手账号创建独立运行，重复 tick 不复制", async () => {
    const { db, client } = await createDb();
    try {
      for (const [id, platform] of [["xhs", "xiaohongshu"], ["ks", "kuaishou"], ["dy", "douyin"]] as const) {
        await db.insert(platformAccounts).values({ id, userId: ctx.userId, platform, accountHandle: id,
          externalAccountId: `identity-${id}`, createdAt: now, updatedAt: now });
        if (platform !== "douyin") await db.insert(platformCollectionBindings).values({ accountId: id,
          userId: ctx.userId, platform, platformIdentity: `identity-${id}`, scopes: ["workCatalog", "workMetrics"],
          proofSource: "verified-test", verifiedAt: now });
      }
      const ready = (platform: "xiaohongshu" | "kuaishou") => [{ platform, capability: "workCatalog" as const,
        supported: true, authState: "authorized" as const, runtimeState: "ready" as const,
        reasonCode: null, lastVerifiedAt: now }];
      const service = createPlatformCollectionService({ db, now: () => now,
        sourceAdapters: { xiaohongshu: ready("xiaohongshu"), kuaishou: ready("kuaishou") } });
      const resumed: string[] = [];
      const tick = createPeriodicPlatformCollection({
        listAccounts: async () => ({ rows: [
          { id: "xhs", platform: "xiaohongshu", status: "active" },
          { id: "ks", platform: "kuaishou", status: "active" },
          { id: "dy", platform: "douyin", status: "active" },
        ] }),
        latestRun: service.latestRun,
        start: service.start,
        resume: (_scope, run) => { resumed.push(run.accountId); },
        onError: (_id, error) => { throw error; }, now: () => now,
      });
      await tick(ctx);
      await tick(ctx);
      expect(resumed).toEqual(["xhs", "ks", "xhs", "ks"]);
      expect(await service.latestRun({ ...ctx, accountId: "xhs" }, "xhs", "workCatalog"))
        .toMatchObject({ status: "queued", accountId: "xhs" });
      expect(await service.latestRun({ ...ctx, accountId: "ks" }, "ks", "workCatalog"))
        .toMatchObject({ status: "queued", accountId: "ks" });
      expect(await service.latestRun({ ...ctx, accountId: "dy" }, "dy", "workCatalog")).toBeNull();
    } finally { await client.close(); }
  });
});
