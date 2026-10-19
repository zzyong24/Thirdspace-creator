import { describe, expect, it } from "vitest";
import { ENDPOINTS } from "@creatoros/contract";
import { createDb } from "../../db";
import { platformAccounts } from "../../schema/platform-account";
import { platformBindAttempts, platformCollectionRuns } from "../../schema/platform-collection";
import { createPlatformCollectionService } from "./platform-collection.service";
import { createPlatformCollectionTransport, PLATFORM_COLLECTION_OP_IDS } from "./platform-collection.transport";

const at = "2026-09-30T00:00:00.000Z";
const ctx = { userId: "user-a", requestId: "request-a", source: "user" as const, accountId: "acct-a" };

describe("platform collection public transport", () => {
  it("maps all ten public operations without exposing worker proof or page writes", async () => {
    const { db, client } = await createDb();
    try {
      await db.insert(platformAccounts).values({ id: "acct-a", userId: "user-a", platform: "xiaohongshu",
        accountHandle: "A", externalAccountId: "platform-id", createdAt: at, updatedAt: at });
      const service = createPlatformCollectionService({ db, now: () => at });
      const transport = createPlatformCollectionTransport(() => service);
      expect(PLATFORM_COLLECTION_OP_IDS).toHaveLength(10);
      expect(PLATFORM_COLLECTION_OP_IDS).not.toContain("platforms.collections.commitPage");
      const capabilities = await transport.request(ENDPOINTS.listCapabilities,
        { params: undefined, query: undefined, body: undefined }, ctx) as { data: { items: Array<{ platform: string; capability: string; reasonCode: string }> } };
      expect(capabilities.data.items.find(item => item.platform === "xiaohongshu" && item.capability === "bind")?.reasonCode).toBe("SOURCE_UNMAPPED");
      await expect(transport.request(ENDPOINTS.beginBind,
        { params: undefined, query: undefined, body: { platform: "xiaohongshu", clientRequestId: "req" } }, ctx))
        .rejects.toMatchObject({ code: "SOURCE_UNMAPPED" });
      await expect(transport.request(ENDPOINTS.startCollection,
        { params: { accountId: "acct-a" }, query: undefined, body: { capability: "workCatalog", clientRequestId: "req" } }, ctx))
        .rejects.toMatchObject({ code: "SOURCE_UNMAPPED" });
      expect(await db.select().from(platformBindAttempts)).toHaveLength(0);
      expect(await db.select().from(platformCollectionRuns)).toHaveLength(0);
      const works = await transport.request(ENDPOINTS.listWorks,
        { params: { accountId: "acct-a" }, query: {}, body: undefined }, ctx) as { data: { catalogCompleteness: string; total: number } };
      expect(works.data).toMatchObject({ catalogCompleteness: "none", total: 0 });
      const metrics = await transport.request(ENDPOINTS.readMetrics,
        { params: { accountId: "acct-a" }, query: {}, body: undefined }, ctx) as { data: { accountMetrics: unknown[]; workMetrics: unknown[] } };
      expect(metrics.data).toMatchObject({ accountMetrics: [], workMetrics: [] });
    } finally { await client.close(); }
  });
});
