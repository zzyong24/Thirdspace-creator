import { describe, it, expect, beforeEach } from "vitest";
import type { Endpoint, RequestContext } from "@creatoros/contract";
import {
  compositeTransport,
  __resetPersistenceForTests,
} from "@/server/persistence-client";
import { canonicalDataset } from "@/fixtures/canonical";
import { PRODUCTION_OP_IDS } from "@creatoros/backend/modules/production";

// Step 4/6 — the 5 production ops are registered into the composite
// (PERSISTED_OPS) and the get → put → segments → export → complete chain
// round-trips through compositeTransport against the seeded pglite store. Proves
// the module is wired into the SAME store server reads + the /api/v1 route share
// (foundation §1 registry) — the FE save path. The completeExport fan-out reaches
// the Projects service (primaryAssetId on the seeded output) over the same store.

const ep = (id: string) => ({ id }) as unknown as Endpoint;
// [T-332 S2] strict 账号门:production 域父锚闭合(content_output ⋈ project 按
// (userId, accountId) strict 过滤,SPEC §3.2)→ ctx 必须带 accountId,且 outputId 必须
// 真实存在于当前号的项目下。测试号按 userId 派生;composite 层 ctx 可信,无需真建账号行。
const ctx = (userId: string, accountId = `acct-of-${userId}`): RequestContext => ({
  userId,
  requestId: "req-test",
  source: "user",
  accountId,
});

beforeEach(() => {
  __resetPersistenceForTests();
});

// [T-332 S2] 原引用的退役 fixture output id(output-ainativebrowser-main)在 seeded 库里
// 并不存在 —— S2 前 ensureProductionForOutput 不做父锚校验才侥幸通过;strict 父锚门下
// 会被正确判 OwnershipError。改走真 op 链现建 project + output(同 publishing 集成测试
// createRealOutput 的 DATA-H03 修法),归属链真实、账号维一致。
async function createRealOutput(owner: RequestContext): Promise<string> {
  const proj = (await compositeTransport.request(
    ep("projects.create"),
    {
      params: undefined,
      query: undefined,
      body: { title: "production 集成测试项目", brief: "" },
    } as never,
    owner,
  )) as { data: { id: string } };
  const output = (await compositeTransport.request(
    ep("projects.outputs.create"),
    {
      params: { projectId: proj.data.id },
      query: undefined,
      body: { title: "production 集成测试作品" },
    } as never,
    owner,
  )) as { data: { id: string } };
  return output.data.id;
}

describe("production ops registered in the composite transport", () => {
  it("the 7 production op ids are persistence-backed (not the mock)", async () => {
    // A persisted op called with NO ctx throws AuthenticationError; a mock op
    // would resolve. Use that to assert each id is routed to the real transport.
    for (const id of PRODUCTION_OP_IDS) {
      await expect(
        compositeTransport.request(ep(id), {} as never),
      ).rejects.toThrow();
    }
    // 素材包导出与剪辑方案确认均已进入 production 持久化注册表。
    expect(PRODUCTION_OP_IDS).toHaveLength(8);
  });

  it("get → put → segment → export → complete round-trips over the shared store", async () => {
    const owner = ctx(canonicalDataset.user.id);
    const OUTPUT_ID = await createRealOutput(owner);

    // GET get-or-creates a drafting production for the real output.
    const got = (await compositeTransport.request(
      ep("outputs.production.get"),
      { params: { outputId: OUTPUT_ID }, query: undefined, body: undefined } as never,
      owner,
    )) as { data: { id: string; status: string; contentOutputId: string } };
    expect(got.data.status).toBe("drafting");
    expect(got.data.contentOutputId).toBe(OUTPUT_ID);
    const productionId = got.data.id;

    // PUT switches the mode (wired-local→backend mode card).
    const put = (await compositeTransport.request(
      ep("outputs.production.put"),
      {
        params: { outputId: OUTPUT_ID },
        query: undefined,
        body: { productionMode: "screen_capture" },
      } as never,
      owner,
    )) as { data: { productionMode: string } };
    expect(put.data.productionMode).toBe("screen_capture");

    // POST a segment (添加章节).
    const seg = (await compositeTransport.request(
      ep("productions.segments.create"),
      {
        params: { productionId },
        query: undefined,
        body: { title: "新章节 1", position: 0, startMs: 0, endMs: 30000 },
      } as never,
      owner,
    )) as { data: { id: string; title: string } };
    expect(seg.data.title).toBe("新章节 1");

    // POST an export (导出视频 phase 1) → queued.
    const exp = (await compositeTransport.request(
      ep("productions.exports.create"),
      {
        params: { productionId },
        query: undefined,
        body: { format: "mp4", resolution: "1080p", aspectRatio: "16:9" },
      } as never,
      owner,
    )) as { data: { id: string; status: string } };
    expect(exp.data.status).toBe("queued");

    // POST complete (导出视频 phase 2) → ready + cross-module primary-asset link。
    // resultAssetId 只作事实落库(fan-out 副作用失败会被吞,SPEC §11),不校验存在性。
    const done = (await compositeTransport.request(
      ep("exports.complete"),
      {
        params: { exportId: exp.data.id },
        query: undefined,
        body: { resultAssetId: "asset-export-e2e" },
      } as never,
      owner,
    )) as { data: { status: string; resultAssetId: string } };
    expect(done.data.status).toBe("ready");
    expect(done.data.resultAssetId).toBe("asset-export-e2e");
  });

  // [T-721] 素材包统一导出:真实 wiring 全链(materialLinks 聚合 → 本地 zip →
  // 一次性对象存储产物 → 签名下载 URL)，不得创建普通素材。空项目(无素材/无稿/无四决策)也要
  // 产出合法包:readme(§5.1② 空态诚实)+ manifest,两个文件;hasDecisions=false。
  it("productions.exports.materials 连续导出不增加素材数，且返回一次性下载 URL", async () => {
    const owner = ctx(canonicalDataset.user.id);
    const OUTPUT_ID = await createRealOutput(owner);
    const got = (await compositeTransport.request(
      ep("outputs.production.get"),
      { params: { outputId: OUTPUT_ID }, query: undefined, body: undefined } as never,
      owner,
    )) as { data: { id: string } };

    const before = (await compositeTransport.request(
      ep("assets.list"),
      {
        params: undefined,
        query: { page: 1, pageSize: 200 },
        body: undefined,
      } as never,
      owner,
    )) as { data: unknown[] };
    const exportOnce = () =>
      compositeTransport.request(
        ep("productions.exports.materials"),
        {
          params: { productionId: got.data.id },
          query: undefined,
          body: undefined,
        } as never,
        owner,
      ) as Promise<{
        data: {
          assetId: string | null;
          downloadUrl: string;
          fileName: string;
          fileCount: number;
          totalBytes: number;
          hasDecisions: boolean;
        };
      }>;
    const res = await exportOnce();
    const second = await exportOnce();
    expect(res.data.assetId).toBeNull();
    expect(second.data.assetId).toBeNull();
    expect(res.data.downloadUrl).toBeTruthy();
    expect(res.data.fileName).toMatch(/\.zip$/);
    expect(res.data.fileCount).toBe(2); // readme + manifest(诚实空态,不塞假素材)
    expect(res.data.totalBytes).toBeGreaterThan(0);
    expect(res.data.hasDecisions).toBe(false);

    const after = (await compositeTransport.request(
      ep("assets.list"),
      {
        params: undefined,
        query: { page: 1, pageSize: 200 },
        body: undefined,
      } as never,
      owner,
    )) as { data: unknown[] };
    expect(after.data).toHaveLength(before.data.length);
  });
});
