import { describe, it, expect, beforeEach } from "vitest";
import {
  ENDPOINTS,
  listEnvelope,
  type Endpoint,
  type RequestContext,
} from "@creatoros/contract";
import {
  compositeTransport,
  __resetPersistenceForTests,
} from "@/server/persistence-client";
import { canonicalDataset } from "@/fixtures/canonical";
import { ASSET_OP_IDS } from "@creatoros/backend/modules/assets";

// D8 / G7 — the 9 assets ops are registered into the composite (PERSISTED_OPS)
// and round-trip through compositeTransport against the seeded pglite store.
// Proves the module is wired into the same store server reads + the /api/v1 route
// share (foundation §1 registry), and asserts the multi-tenant boundary at the
// dispatch layer: user B cannot see / get user A's seeded assets.

const ep = (id: string, isList = false) =>
  ({ id, isList }) as unknown as Endpoint;
// [T-332 S2] strict 账号门:assets 域 per-account,ctx 必须带 accountId(未选号 →
// AccountRequiredError,SPEC §4.2)。测试号按 userId 派生 → A/B 天然异号,多租户
// (user + account 双维)隔离断言语义保持。
let fixtureAccountId = "";
const ctx = (userId: string, accountId = userId === canonicalDataset.user.id ? fixtureAccountId : `acct-of-${userId}`): RequestContext => ({
  userId,
  requestId: "req-test",
  source: "user",
  accountId,
});

// [T-135] canonical assets seed 已退役(新库/新用户开箱空),原来依赖「启动时 seed 一批
// canonical 素材」的这几条集成测试改成**自建 fixture 素材**——走公开的 upload→complete
// ops 真造一条 asset(与下方 round-trip 测试同一路径),再验 list/get/favorite/usage,
// 验的是「素材 ops 全链 + 多租户边界」而非「seed 存在」。
async function createAsset(
  owner: RequestContext,
  name = "T-135 测试素材",
): Promise<string> {
  const up = (await compositeTransport.request(
    ep("assets.uploads.create"),
    {
      params: undefined,
      query: undefined,
      body: { assetType: "image", mimeType: "image/png", fileSize: 1024 },
    } as never,
    owner,
  )) as { data: { uploadId: string } };
  const done = (await compositeTransport.request(
    ep("assets.uploads.complete"),
    {
      params: { uploadId: up.data.uploadId },
      query: undefined,
      body: { name },
    } as never,
    owner,
  )) as { data: { id: string } };
  return done.data.id;
}

beforeEach(async () => {
  __resetPersistenceForTests();
  const created = await compositeTransport.request(ep("accounts.create"), {
    params: undefined, query: undefined,
    body: {platform:"douyin",accountHandle:"@t1246-owned-fixture",followerBaseline:0},
  } as never, {userId:canonicalDataset.user.id,requestId:"t1246-public-account",source:"user"}) as {data:{id:string}};
  fixtureAccountId = created.data.id;
});

describe("assets ops registered in the composite transport", () => {
  it("the 11 assets op ids are persistence-backed (not the mock)", async () => {
    // A persisted op called with NO ctx throws AuthenticationError; a mock op
    // would resolve. Use that to assert each id is routed to the real transport.
    for (const id of ASSET_OP_IDS) {
      await expect(
        compositeTransport.request(ep(id), {} as never),
      ).rejects.toThrow();
    }
    // [T-055d] +assets.downloadUrl(下载做真)。[T-219] +assets.commit(截图确认门)。
    // T1246：逐ID核真实视觉模板/组日历/视觉导出/组概览与日报所有者；保原无ctx逐项拒绝。
    expect(ASSET_OP_IDS).toEqual(["assets.visualTemplates.list", "assets.visualTemplates.save", "assets.visualTemplates.remove", "assets.downloadUrl", "assets.fileDownloadUrl", "assets.list", "assets.search", "assets.uploads.create", "assets.uploads.complete", "assets.get", "assets.files.create", "assets.trash", "assets.restore", "assets.commit", "assets.favorite.toggle", "assets.usage.list"]);
  });

  it("[T-135] 开箱空:owner 的 assets.list 初始为空,建一条后可列出(全部本人 + active)", async () => {
    const owner = ctx(canonicalDataset.user.id);
    // 开箱空态:没有任何 canonical 素材 seed。
    const empty = (await compositeTransport.request(
      ep("assets.list", true),
      { params: undefined, query: { page: 1, pageSize: 50 }, body: undefined } as never,
      owner,
    )) as { data: Array<{ id: string }> };
    expect(empty.data).toHaveLength(0);

    // 自建一条素材后可列出,且行属主 = 本人、状态 active。
    const createdId = await createAsset(owner);
    const res = (await compositeTransport.request(
      ep("assets.list", true),
      { params: undefined, query: { page: 1, pageSize: 50 }, body: undefined } as never,
      owner,
    )) as { data: Array<{ id: string; userId: string; status: string }> };
    expect(res.data.length).toBeGreaterThan(0);
    expect(res.data.some((r) => r.id === createdId)).toBe(true);
    for (const row of res.data) {
      expect(row.userId).toBe(canonicalDataset.user.id);
      expect(row.status).toBe("active");
    }
  });

  it("upload→complete round-trips: the new asset is then listable", async () => {
    const owner = ctx(canonicalDataset.user.id);
    const up = (await compositeTransport.request(
      ep("assets.uploads.create"),
      {
        params: undefined,
        query: undefined,
        body: { assetType: "image", mimeType: "image/png", fileSize: 1024 },
      } as never,
      owner,
    )) as { data: { uploadId: string } };
    const done = (await compositeTransport.request(
      ep("assets.uploads.complete"),
      {
        params: { uploadId: up.data.uploadId },
        query: undefined,
        body: { name: "新上传素材" },
      } as never,
      owner,
    )) as { data: { id: string; status: string; currentFileId: string } };
    expect(done.data.status).toBe("active");
    expect(done.data.currentFileId).toBeTruthy();

    const list = (await compositeTransport.request(
      ep("assets.list", true),
      {
        params: undefined,
        query: { page: 1, pageSize: 50 },
        body: undefined,
      } as never,
      owner,
    )) as { data: Array<{ id: string }> };
    expect(list.data.some((r) => r.id === done.data.id)).toBe(true);
  });

  it("multi-tenant: user B cannot list or get user A's assets", async () => {
    // [T-135] 不再依赖 canonical seed:先由 A 自建一条素材,再验 B 看不到/取不到。
    const seededAssetId = await createAsset(ctx(canonicalDataset.user.id));
    // B's list excludes A's assets.
    const bList = (await compositeTransport.request(
      ep("assets.list", true),
      {
        params: undefined,
        query: { page: 1, pageSize: 50 },
        body: undefined,
      } as never,
      ctx("user-intruder"),
    )) as { data: Array<{ id: string }> };
    expect(bList.data.some((r) => r.id === seededAssetId)).toBe(false);

    // B's get of A's asset id → OwnershipError (404, no existence leak).
    await expect(
      compositeTransport.request(
        ep("assets.get"),
        {
          params: { assetId: seededAssetId },
          query: undefined,
          body: undefined,
        } as never,
        ctx("user-intruder"),
      ),
    ).rejects.toThrow();
  });

  it("assets.favorite.toggle flips the persisted isFavorite and is re-readable", async () => {
    const owner = ctx(canonicalDataset.user.id);
    // [T-135] 自建 fixture 素材(不依赖 canonical seed)。
    const assetId = await createAsset(owner);
    const before = (await compositeTransport.request(
      ep("assets.get"),
      { params: { assetId }, query: undefined, body: undefined } as never,
      owner,
    )) as { data: { isFavorite: boolean } };
    const toggled = (await compositeTransport.request(
      ep("assets.favorite.toggle"),
      { params: { assetId }, query: undefined, body: undefined } as never,
      owner,
    )) as { data: { isFavorite: boolean } };
    expect(toggled.data.isFavorite).toBe(!before.data.isFavorite);
    // Persisted: a fresh get reflects the new flag.
    const after = (await compositeTransport.request(
      ep("assets.get"),
      { params: { assetId }, query: undefined, body: undefined } as never,
      owner,
    )) as { data: { isFavorite: boolean } };
    expect(after.data.isFavorite).toBe(!before.data.isFavorite);
  });

  it("assets.usage.list returns the 用料链 edges referencing the asset (用料反查)", async () => {
    const owner = ctx(canonicalDataset.user.id);
    // [T-135] 自建 fixture 素材(不依赖 canonical seed)。
    const assetId = await createAsset(owner);
    // Create a 用料链 edge that references this asset, then reverse-look it up.
    const project = await compositeTransport.request(ep("projects.create"), {
      params:undefined,query:undefined,body:{title:"真实素材用料项目"},
    } as never, owner) as {data:{id:string}};
    const projectId = project.data.id;
    await compositeTransport.request(
      ep("materialLinks.create"),
      {
        params: undefined,
        query: undefined,
        body: {
          projectId,
          entityType: "asset",
          entityId: assetId,
          role: "clip",
          stage: "production",
        },
      } as never,
      owner,
    );
    const usage = (await compositeTransport.request(
      ep("assets.usage.list", true),
      { params: { assetId }, query: undefined, body: undefined } as never,
      owner,
    )) as { data: Array<{ entityId: string; entityType: string }> };
    expect(usage.data.length).toBeGreaterThan(0);
    for (const row of usage.data) {
      expect(row.entityType).toBe("asset");
      expect(row.entityId).toBe(assetId);
    }

    // Multi-tenant: user B sees no usage for A's asset.
    const bUsage = (await compositeTransport.request(
      ep("assets.usage.list", true),
      { params: { assetId }, query: undefined, body: undefined } as never,
      ctx("user-intruder"),
    ).catch(() => ({ data: [] }))) as { data: unknown[] };
    expect(bUsage.data).toHaveLength(0);
  });

  it("[T-548] assets.usage.list 空结果仍返回合法正数 pageSize，项目关联不能被响应校验拦住", async () => {
    const owner = ctx(canonicalDataset.user.id);
    const assetId = await createAsset(owner, "尚未关联项目的成片");
    const raw = await compositeTransport.request(
      ENDPOINTS.listAssetUsage,
      { params: { assetId }, query: undefined, body: undefined },
      owner,
    );

    const parsed = listEnvelope(
      ENDPOINTS.listAssetUsage.response,
    ).parse(raw);
    expect(parsed.data).toHaveLength(0);
    expect(parsed.meta.pageSize).toBeGreaterThan(0);
    expect(parsed.meta.total).toBe(0);
  });
});
