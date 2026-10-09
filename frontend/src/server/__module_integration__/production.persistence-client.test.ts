import { describe, it, expect, beforeEach } from "vitest";
import type { Endpoint, RequestContext } from "@creatoros/contract";
import {
  compositeTransport,
  __resetPersistenceForTests,
} from "@/server/persistence-client";
import { canonicalDataset } from "@/fixtures/canonical";
import { PRODUCTION_OP_IDS } from "@creatoros/backend/modules/production";
import { productionOperations } from "../../../../contract/src/operations/production";

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

// 正式上传/完成端口与同一隔离库；对象字节及媒体探测由原 mock storage 提供。
async function createResultAsset(owner: RequestContext): Promise<string> {
  const upload = (await compositeTransport.request(ep("assets.uploads.create"), {
    params: undefined, query: undefined,
    body: { assetType: "video", mimeType: "video/mp4", fileSize: 1024 },
  } as never, owner)) as { data: { uploadId: string } };
  const completed = (await compositeTransport.request(ep("assets.uploads.complete"), {
    params: { uploadId: upload.data.uploadId }, query: undefined,
    body: { name: "制作导出中性测试视频" },
  } as never, owner)) as { data: { id: string } };
  return completed.data.id;
}

async function readPrimaryAsset(owner: RequestContext, outputId: string): Promise<string | null> {
  const output = (await compositeTransport.request(ep("outputs.get"), {
    params: { outputId }, query: undefined, body: undefined,
  } as never, owner)) as { data: { primaryAssetId: string | null } };
  return output.data.primaryAssetId;
}

describe("production ops registered in the composite transport", () => {
  it("all production op ids are persistence-backed (not the mock)", async () => {
    // A persisted op called with NO ctx throws AuthenticationError; a mock op
    // would resolve. Use that to assert each id is routed to the real transport.
    for (const id of PRODUCTION_OP_IDS) {
      await expect(
        compositeTransport.request(ep(id), {} as never),
      ).rejects.toThrow();
    }
    // 契约与后端独立登记逐项相等，不能用自比较或过期数量掩盖新增操作遗漏。
    const contractIds = Object.values(productionOperations).map(operation => operation.id);
    expect(new Set(PRODUCTION_OP_IDS).size).toBe(PRODUCTION_OP_IDS.length);
    expect(new Set(contractIds).size).toBe(contractIds.length);
    expect([...PRODUCTION_OP_IDS].sort()).toEqual([...contractIds].sort());
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

    // POST complete → ready，并从正式输出读回同owner真实结果资产。
    const resultAssetId = await createResultAsset(owner);
    const done = (await compositeTransport.request(
      ep("exports.complete"),
      {
        params: { exportId: exp.data.id },
        query: undefined,
        body: { resultAssetId },
      } as never,
      owner,
    )) as { data: { status: string; resultAssetId: string } };
    expect(done.data.status).toBe("ready");
    expect(done.data.resultAssetId).toBe(resultAssetId);
    expect(await readPrimaryAsset(owner, OUTPUT_ID)).toBe(resultAssetId);
  });

  it("不存在或异账号结果被拒绝后，原导出仍可正常完成且重放不改绑", async () => {
    const owner = ctx(canonicalDataset.user.id);
    const outputId = await createRealOutput(owner);
    const production = (await compositeTransport.request(ep("outputs.production.get"), {
      params: { outputId }, query: undefined, body: undefined,
    } as never, owner)) as { data: { id: string } };
    const exported = (await compositeTransport.request(ep("productions.exports.create"), {
      params: { productionId: production.data.id }, query: undefined,
      body: { format: "mp4", resolution: "1080p", aspectRatio: "16:9" },
    } as never, owner)) as { data: { id: string; status: string } };
    expect(exported.data.status).toBe("queued");
    const complete = (resultAssetId: string) => compositeTransport.request(ep("exports.complete"), {
      params: { exportId: exported.data.id }, query: undefined, body: { resultAssetId },
    } as never, owner) as Promise<{ data: { status: string; resultAssetId: string } }>;

    await expect(complete("asset-export-does-not-exist")).rejects.toThrow("Asset not found");
    expect(await readPrimaryAsset(owner, outputId)).toBeNull();
    const foreign = ctx(owner.userId, "acct-production-result-other");
    const foreignAssetId = await createResultAsset(foreign);
    await expect(complete(foreignAssetId)).rejects.toThrow("Asset not found");
    expect(await readPrimaryAsset(owner, outputId)).toBeNull();

    const resultAssetId = await createResultAsset(owner);
    const completed = await complete(resultAssetId);
    expect(completed.data.status).toBe("ready");
    expect(completed.data.resultAssetId).toBe(resultAssetId);
    expect(await readPrimaryAsset(owner, outputId)).toBe(resultAssetId);

    const otherOwnedAssetId = await createResultAsset(owner);
    expect(otherOwnedAssetId).not.toBe(resultAssetId);
    expect((await complete(otherOwnedAssetId)).data.resultAssetId).toBe(resultAssetId);
    expect(await readPrimaryAsset(owner, outputId)).toBe(resultAssetId);
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
