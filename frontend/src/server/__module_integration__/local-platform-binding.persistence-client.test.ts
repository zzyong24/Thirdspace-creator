import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { rm } from "node:fs/promises";
import { ENDPOINTS, type RequestContext } from "@creatoros/contract";
import { canonicalDataset } from "@/fixtures/canonical";

const stub = vi.hoisted(() => ({ sequence: 0, repeatXhsIdentity: false,
  root: `/tmp/creatoros-platform-binding-${process.pid}` }));
vi.mock("@creatoros/ai-worker/platform/xhs-browser-source", () => ({
  xhsProfilePaths: (_root: string, userId: string, bindAttemptId: string, identity?: string) => ({
    temporary: `${stub.root}/${userId}/pending/${bindAttemptId}`,
    permanent: identity ? `${stub.root}/${userId}/accounts/${identity}` : null,
  }),
  loginXhsCreator: async (directory: string) => {
    const { mkdir } = await import("node:fs/promises");
    await mkdir(directory, { recursive: true });
    if (!stub.repeatXhsIdentity) stub.sequence += 1;
    return { platformIdentity: `account_000${stub.sequence}`, displayName: "测试账号",
      redId: null, source: "/api/galaxy/user/info" };
  },
  promoteXhsProfile: async (temporary: string, permanent: string) => {
    const { mkdir, rename } = await import("node:fs/promises");
    const { dirname } = await import("node:path");
    await mkdir(dirname(permanent), { recursive: true });
    await rename(temporary, permanent);
  },
  collectXhsCreatorCatalog: async (_directory: string, identity: string) => {
    const observedAt = new Date().toISOString();
    const page = { requestCursor: null, nextCursor: null, reportedTotal: 1, observedAt,
      responseDigest: `sha256:${identity}`,
      records: [{ externalId: `note_${identity.slice(-4)}`, title: "真实页替身作品", kind: "video",
        publishedAt: observedAt, visibility: { visibility: "unknown",
          source: "/api/galaxy/v2/creator/note/user/posted", observedAt },
        source: "/api/galaxy/v2/creator/note/user/posted", observedAt,
        counts: { view_count: 0, likes: 3, comments_count: null, collected_count: 2, shared_count: 1 } }] };
    const scan = { pages: [page], terminalEvidence: { kind: "platformHasMoreFalse",
      source: "/api/galaxy/v2/creator/note/user/posted", observedAt } };
    return [scan, scan];
  },
}));
vi.mock("@creatoros/ai-worker/platform/kuaishou-browser-source", () => ({
  kuaishouProfilePaths: (_root: string, userId: string, bindAttemptId: string, identity?: string) => ({
    temporary: `${stub.root}/${userId}/kuaishou/pending/${bindAttemptId}`,
    permanent: identity ? `${stub.root}/${userId}/kuaishou/accounts/${identity}` : null,
  }),
  loginKuaishouCreator: async (directory: string) => {
    const { mkdir } = await import("node:fs/promises");
    await mkdir(directory, { recursive: true });
    stub.sequence += 1;
    return { platformIdentity: `ks_000${stub.sequence}`, displayName: "快手测试账号",
      kwaiId: null, followerCount: 0, source: "/rest/cp/creator/pc/home/infoV2" };
  },
  promoteKuaishouProfile: async (temporary: string, permanent: string) => {
    const { mkdir, rename } = await import("node:fs/promises");
    const { dirname } = await import("node:path");
    await mkdir(dirname(permanent), { recursive: true });
    await rename(temporary, permanent);
  },
  readKuaishouCreatorIdentity: async (_directory: string, identity: string) => ({
    platformIdentity: identity, displayName: "快手测试账号", kwaiId: null, followerCount: 0,
    source: "/rest/cp/creator/pc/home/infoV2",
  }),
  collectKuaishouCreatorCatalog: async (_directory: string, identity: string) => {
    const observedAt = new Date().toISOString();
    const page = { requestCursor: null, nextCursor: null, reportedTotal: 1,
      observedAt, responseDigest: `sha256:${identity}`,
      works: [{ externalId: `work_${identity.slice(-4)}`, title: "快手作品", kind: "video",
        publishedAt: observedAt, playCount: 0, likeCount: 4, commentCount: null,
        source: "/rest/cp/works/v2/video/pc/photo/list", observedAt }] };
    return { first: [page], second: [page], identity: { platformIdentity: identity,
      displayName: "快手测试账号", kwaiId: null, followerCount: 0,
      source: "/rest/cp/creator/pc/home/infoV2" } };
  },
}));

import { compositeTransport, __resetPersistenceForTests } from "@/server/persistence-client";
const ctx: RequestContext = { userId: canonicalDataset.user.id, requestId: "platform-test", source: "user" };
beforeEach(() => { __resetPersistenceForTests(); stub.sequence = 0; stub.repeatXhsIdentity = false; });
afterAll(async () => { await rm(stub.root, { recursive: true, force: true }); });

async function readWorks(accountId: string) {
  const result = await compositeTransport.request(ENDPOINTS.listWorks, {
    params: { accountId }, query: { pageSize: 20 }, body: undefined,
  }, { ...ctx, accountId }) as { data: { catalogCompleteness: string; total: number; items: Array<{ externalId: string }> } };
  return result.data;
}

describe("本机平台绑定与受信采集组合", () => {
  it("扫码核验后两个账号各写自己的完整目录和指标，错号读拒绝", async () => {
    const accounts: string[] = [];
    for (const clientRequestId of ["scan-one", "scan-two"]) {
      const bound = await compositeTransport.request(ENDPOINTS.beginBind, {
        params: undefined, query: undefined,
        body: { platform: "xiaohongshu", clientRequestId },
      }, ctx) as { data: { status: string; accountId: string } };
      expect(bound.data.status).toBe("bound");
      accounts.push(bound.data.accountId);
    }
    expect(accounts[0]).not.toBe(accounts[1]);
    for (const [index, accountId] of accounts.entries()) {
      let works = await readWorks(accountId!);
      for (let retry = 0; retry < 80 && works.catalogCompleteness !== "verifiedComplete"; retry++) {
        await new Promise((resolve) => setTimeout(resolve, 25));
        works = await readWorks(accountId!);
      }
      expect(works.catalogCompleteness).toBe("verifiedComplete");
      expect(works.total).toBe(1);
      expect(works.items[0]?.externalId).toBe(`note_000${index + 1}`);
    }
    const metrics = await compositeTransport.request(ENDPOINTS.readMetrics, {
      params: { accountId: accounts[0] }, query: { pageSize: 100 }, body: undefined,
    }, { ...ctx, accountId: accounts[0] }) as { data: { workMetrics: Array<{ metricKey: string; value: number | null }> } };
    expect(metrics.data.workMetrics.some((metric) => metric.metricKey === "view_count" && metric.value === 0)).toBe(true);
    await expect(compositeTransport.request(ENDPOINTS.listWorks, {
      params: { accountId: accounts[0] }, query: { pageSize: 20 }, body: undefined,
    }, { ...ctx, accountId: accounts[1] })).rejects.toMatchObject({ code: "FORBIDDEN_ACCOUNT" });
  });
  it("快手扫码后自动采集作品、真零播放与账号粉丝指标", async () => {
    const bound = await compositeTransport.request(ENDPOINTS.beginBind, {
      params: undefined, query: undefined,
      body: { platform: "kuaishou", clientRequestId: "scan-ks" },
    }, ctx) as { data: { status: string; accountId: string } };
    expect(bound.data.status).toBe("bound");
    const accountId = bound.data.accountId;
    let works = await readWorks(accountId);
    for (let retry = 0; retry < 80 && works.catalogCompleteness !== "verifiedComplete"; retry++) {
      await new Promise((resolve) => setTimeout(resolve, 25));
      works = await readWorks(accountId);
    }
    expect(works.catalogCompleteness).toBe("verifiedComplete");
    expect(works.items[0]?.externalId).toBe("work_0001");
    let metrics: { accountMetrics: Array<{ metricKey: string; value: number | null }>;
      workMetrics: Array<{ metricKey: string; value: number | null }> } = { accountMetrics: [], workMetrics: [] };
    for (let retry = 0; retry < 80; retry++) {
      const result = await compositeTransport.request(ENDPOINTS.readMetrics, {
        params: { accountId }, query: { pageSize: 100 }, body: undefined,
      }, { ...ctx, accountId }) as { data: typeof metrics };
      metrics = result.data;
      if (metrics.accountMetrics.length && metrics.workMetrics.length) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    expect(metrics.accountMetrics.some((metric) => metric.metricKey === "follower_count" && metric.value === 0)).toBe(true);
    expect(metrics.workMetrics.some((metric) => metric.metricKey === "play_count" && metric.value === 0)).toBe(true);
  });

  it("小红书同一平台身份重扫复用原账号，不产生第二个工作区", async () => {
    const first = await compositeTransport.request(ENDPOINTS.beginBind, {
      params: undefined, query: undefined,
      body: { platform: "xiaohongshu", clientRequestId: "first-bind" },
    }, ctx) as { data: { accountId: string } };
    for (let retry = 0; retry < 80; retry++) {
      if ((await readWorks(first.data.accountId)).catalogCompleteness === "verifiedComplete") break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    stub.repeatXhsIdentity = true;
    const second = await compositeTransport.request(ENDPOINTS.beginBind, {
      params: undefined, query: undefined,
      body: { platform: "xiaohongshu", clientRequestId: "repeat-bind" },
    }, ctx) as { data: { accountId: string } };
    expect(second.data.accountId).toBe(first.data.accountId);
  });
});
