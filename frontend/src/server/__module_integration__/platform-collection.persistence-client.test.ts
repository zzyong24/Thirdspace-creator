import { beforeEach, describe, expect, it } from "vitest";
import { ENDPOINTS, type RequestContext } from "@creatoros/contract";
import { compositeTransport, __resetPersistenceForTests } from "@/server/persistence-client";
import { canonicalDataset } from "@/fixtures/canonical";

const ctx: RequestContext = {
  userId: canonicalDataset.user.id, requestId: "platform-collection-test", source: "user",
};

beforeEach(() => __resetPersistenceForTests());

describe("platform collection composite wiring", () => {
  it("exposes local platform adapters and an empty owned catalog", async () => {
    const capabilities = await compositeTransport.request(ENDPOINTS.listCapabilities, {
      params: undefined, query: undefined, body: undefined,
    }, ctx) as {
      data: { items: Array<{ platform: string; capability: string; supported: boolean; reasonCode: string }> };
    };
    expect(capabilities.data.items.find(item => item.platform === "kuaishou" && item.capability === "workCatalog"))
      .toMatchObject({ supported: true, reasonCode: null });
    expect(capabilities.data.items.find(item => item.platform === "xiaohongshu" && item.capability === "workCatalog"))
      .toMatchObject({ supported: true, reasonCode: null });

    const created = await compositeTransport.request(ENDPOINTS.createAccount, {
      params: undefined, query: undefined,
      body: { platform: "douyin", accountHandle: "测试账号" },
    }, ctx) as { data: { id: string } };
    const accountId = created.data.id;
    const scoped = { ...ctx, accountId };
    const works = await compositeTransport.request(ENDPOINTS.listWorks, {
      params: { accountId }, query: { pageSize: 20 }, body: undefined,
    }, scoped) as { data: { catalogCompleteness: string; total: number; items: unknown[] } };
    expect(works.data).toMatchObject({ catalogCompleteness: "none", total: 0, items: [] });
    const metrics = await compositeTransport.request(ENDPOINTS.readMetrics, {
      params: { accountId }, query: { pageSize: 20 }, body: undefined,
    }, scoped) as { data: { accountMetrics: unknown[]; workMetrics: unknown[] } };
    expect(metrics.data).toMatchObject({ accountMetrics: [], workMetrics: [] });
    await expect(compositeTransport.request(ENDPOINTS.startCollection, {
      params: { accountId }, query: undefined,
      body: { capability: "workCatalog", clientRequestId: "scan-1" },
    }, scoped)).rejects.toMatchObject({ code: "SOURCE_UNMAPPED" });
    await expect(compositeTransport.request(ENDPOINTS.listWorks, {
      params: { accountId }, query: { pageSize: 20 }, body: undefined,
    }, { ...ctx, userId: "other-user", accountId })).rejects.toMatchObject({ code: "FORBIDDEN_ACCOUNT" });
  });
});
