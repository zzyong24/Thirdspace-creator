import { describe, it, expect, beforeEach, vi } from "vitest";
import { createDb, type Db, projects, contentOutputs } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import {
  createProductionService,
  type ProductionService,
} from "./production.service";
import { ConflictError } from "./production.errors";

// Step 3 — service unit tests over a real pglite repo. The service threads
// ctx.userId into a user-scoped repo via repoFor(ctx) and enforces the SPEC §12
// state machines + the §11 completeExport cross-module fan-out:
//   1. status machine valid path: drafting→recording stamps startedAt; the rest
//      of the chain (recording→editing→rendering→ready) each succeed.
//   2. status machine invalid: a skip (drafting→editing) and a backward step
//      (editing→recording) each throw ConflictError.
//   3. requestExport yields a queued ExportRecord with resultAssetId null.
//   4. completeExport happy path: the stubbed peer seams each fire exactly once
//      with ctx; the returned DTO is ready with completedAt set.
//   5. completeExport idempotency: a second call does NOT re-fan-out and returns
//      the already-ready row.

const NOW = "2026-06-21T03:00:00.000Z";
const ctx: RequestContext = {
  userId: "user-a",
  requestId: "req-a",
  source: "user",
  accountId: "acct-a", // [T-332 S2] 父锚 strict 门
};

// [T-332 S2] 父锚种子:production 的读写都要经 content_output → project 的 strict 门,
// 测试先种宿主 project + content_output(带号),再操作 production。
async function seedOutput(
  db: Db,
  outputId: string,
  userId: string,
  accountId: string,
): Promise<void> {
  const projectId = `proj-of-${outputId}`;
  await db
    .insert(projects)
    .values({
      id: projectId,
      userId,
      accountId,
      title: "宿主项目",
      brief: "",
      briefDetail: {},
      contentCategory: "",
      source: "manual",
      platformRef: {},
      creationMode: "guided",
      status: "active",
      currentStage: "production",
      progressPct: 0,
      starred: false,
      startedAt: NOW,
      targetCompletedAt: null,
      completedAt: null,
      archivedAt: null,
      createdAt: NOW,
      updatedAt: NOW,
    })
    .onConflictDoNothing();
  await db
    .insert(contentOutputs)
    .values({
      id: outputId,
      projectId,
      title: "宿主产出",
      contentType: "video",
      format: "",
      aspectRatio: "",
      targetDurationSeconds: 0,
      status: "drafting",
      contentRole: null,
      primaryAssetId: null,
      createdAt: NOW,
      updatedAt: NOW,
    })
    .onConflictDoNothing();
}


let db: Db;
let setPrimaryOutputAsset: ReturnType<typeof vi.fn>;
let searchIndexAsset: ReturnType<typeof vi.fn>;
let recordExportActivity: ReturnType<typeof vi.fn>;

function makeService(): ProductionService {
  let seq = 0;
  return createProductionService({
    db,
    now: () => NOW,
    nextId: (prefix: string) => `${prefix}-${++seq}`,
    setPrimaryOutputAsset: setPrimaryOutputAsset as never,
    searchIndexAsset: searchIndexAsset as never,
    recordExportActivity: recordExportActivity as never,
  });
}

let service: ProductionService;

beforeEach(async () => {
  ({ db } = await createDb());
  setPrimaryOutputAsset = vi.fn(() => Promise.resolve());
  searchIndexAsset = vi.fn(() => Promise.resolve());
  recordExportActivity = vi.fn(() => Promise.resolve());
  service = makeService();
  await seedOutput(db, "output-1", "user-a", "acct-a"); // [T-332 S2] 父锚种子
});

describe("production.service — status machine (Step 3)", () => {
  it("drafting → recording stamps startedAt; the rest of the chain succeeds", async () => {
    await service.getProduction(ctx, "output-1"); // ensures a drafting row

    const recording = await service.updateProduction(ctx, "output-1", {
      status: "recording",
    });
    expect(recording.status).toBe("recording");
    expect(recording.startedAt).toBe(NOW);

    const editing = await service.updateProduction(ctx, "output-1", {
      status: "editing",
    });
    expect(editing.status).toBe("editing");
    const rendering = await service.updateProduction(ctx, "output-1", {
      status: "rendering",
    });
    expect(rendering.status).toBe("rendering");
    const ready = await service.updateProduction(ctx, "output-1", {
      status: "ready",
    });
    expect(ready.status).toBe("ready");
  });

  it("rejects a skip (drafting → editing) with ConflictError", async () => {
    await service.getProduction(ctx, "output-1");
    await expect(
      service.updateProduction(ctx, "output-1", { status: "editing" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("rejects a backward step (editing → recording) with ConflictError", async () => {
    await service.getProduction(ctx, "output-1");
    await service.updateProduction(ctx, "output-1", { status: "recording" });
    await service.updateProduction(ctx, "output-1", { status: "editing" });
    await expect(
      service.updateProduction(ctx, "output-1", { status: "recording" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("updates mode/config without a status change", async () => {
    await service.getProduction(ctx, "output-1");
    const updated = await service.updateProduction(ctx, "output-1", {
      productionMode: "screen_capture",
      recordingConfig: { overlay: true },
    });
    expect(updated.productionMode).toBe("screen_capture");
    expect(updated.recordingConfig).toEqual({ overlay: true });
    expect(updated.status).toBe("drafting"); // unchanged
  });

  it("原子确认剪辑方案只窄写 videoEditingPlan，并用 revision 拒绝旧页面覆盖", async () => {
    await service.getProduction(ctx, "output-1");
    await service.updateProduction(ctx, "output-1", {
      recordingConfig: { overlay: true, unrelated: { keep: 1 } },
    });
    const first = await service.confirmEditingPlan(ctx, "output-1", {
      expectedRevision: 0,
      plan: {
        sourceTaskId: "ai-task-1",
        confirmedAt: NOW,
        decisions: { scenes: [{ id: "s1" }] },
        renderProps: { meta: { title: "成片" } },
      },
    });
    expect(first.recordingConfig).toMatchObject({
      overlay: true,
      unrelated: { keep: 1 },
      videoEditingPlan: { revision: 1, sourceTaskId: "ai-task-1" },
    });
    await expect(
      service.confirmEditingPlan(ctx, "output-1", {
        expectedRevision: 0,
        plan: {
          sourceTaskId: "stale",
          confirmedAt: NOW,
          decisions: {},
          renderProps: {},
        },
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("production.service — export lifecycle (Step 3)", () => {
  it("requestExport yields a queued ExportRecord with resultAssetId null", async () => {
    const prod = await service.getProduction(ctx, "output-1");
    const exp = await service.requestExport(ctx, prod.id, {
      format: "mp4",
      resolution: "1080p",
      aspectRatio: "16:9",
    });
    expect(exp.status).toBe("queued");
    expect(exp.resultAssetId).toBeNull();
    expect(exp.bitrate).toBe(8_000_000);
    expect(exp.completedAt).toBeNull();
  });

  it("completeExport drives queued → ready and fans out to each peer once", async () => {
    const prod = await service.getProduction(ctx, "output-1");
    const exp = await service.requestExport(ctx, prod.id, {
      format: "mp4",
      resolution: "1080p",
      aspectRatio: "16:9",
    });
    const done = await service.completeExport(ctx, exp.id, {
      resultAssetId: "asset-result-1",
    });
    expect(done.status).toBe("ready");
    expect(done.resultAssetId).toBe("asset-result-1");
    expect(done.completedAt).toBe(NOW);

    expect(setPrimaryOutputAsset).toHaveBeenCalledTimes(1);
    expect(setPrimaryOutputAsset).toHaveBeenCalledWith(ctx, {
      outputId: "output-1",
      assetId: "asset-result-1",
    });
    expect(searchIndexAsset).toHaveBeenCalledTimes(1);
    expect(searchIndexAsset).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ entityType: "asset", entityId: "asset-result-1" }),
    );
    expect(recordExportActivity).toHaveBeenCalledTimes(1);
  });

  it("completeExport is idempotent — a second call does not re-fan-out", async () => {
    const prod = await service.getProduction(ctx, "output-1");
    const exp = await service.requestExport(ctx, prod.id, {
      format: "mp4",
      resolution: "1080p",
      aspectRatio: "16:9",
    });
    await service.completeExport(ctx, exp.id, { resultAssetId: "asset-result-1" });
    const second = await service.completeExport(ctx, exp.id, {
      resultAssetId: "asset-result-2",
    });
    // second call returns the already-ready row (original asset id stays).
    expect(second.status).toBe("ready");
    expect(second.resultAssetId).toBe("asset-result-1");
    // fan-out ran ONCE total across both calls.
    expect(setPrimaryOutputAsset).toHaveBeenCalledTimes(1);
    expect(searchIndexAsset).toHaveBeenCalledTimes(1);
    expect(recordExportActivity).toHaveBeenCalledTimes(1);
  });
});

// ── [T-366b] 素材包统一导出(exportMaterials 服务层胶水) ────────────────────────

describe("production.service — exportMaterials (T-366b)", () => {
  const enc = new TextEncoder();

  function makeWiring() {
    const storeDownloadArtifact = vi.fn(
      async (_c: RequestContext, _input: { name: string; bytes: Uint8Array }) => ({
        url: "http://localhost/blob/zip?token=t",
        fileName: "素材包.zip",
      }),
    );
    const wiring = {
      resolveProjectIdByOutput: vi.fn(async (_c: RequestContext, outputId: string) =>
        outputId === "output-1" ? "proj-of-output-1" : null,
      ),
      storeDownloadArtifact,
      ports: {
        listMaterialAssets: vi.fn(async () => [
          { assetId: "a-clip", role: "clip" },
        ]),
        getAssetName: vi.fn(async () => "粗剪.mp4"),
        getAssetBytes: vi.fn(async () => ({ bytes: enc.encode("clip-bytes") })),
        getScriptText: vi.fn(async () => "口播稿全文"),
        getVideoDecisions: vi.fn(async () => null),
        getProjectTitle: vi.fn(async () => "宿主项目"),
      },
    };
    return { wiring, storeDownloadArtifact };
  }

  function makeServiceWithWiring(wiring: unknown): ProductionService {
    let seq = 0;
    return createProductionService({
      db,
      now: () => NOW,
      nextId: (prefix: string) => `${prefix}-${++seq}`,
      materialExport: wiring as never,
    });
  }

  it("聚合 → zip 只落一次性对象 → 签名下载 URL，不创建普通素材", async () => {
    const { wiring, storeDownloadArtifact } = makeWiring();
    const svc = makeServiceWithWiring(wiring);
    const prod = await svc.getProduction(ctx, "output-1");
    const res = await svc.exportMaterials(ctx, prod.id);
    expect(res.assetId).toBeNull();
    expect(res.downloadUrl).toContain("token=t");
    expect(res.hasDecisions).toBe(false); // 没跑四决策 → 诚实 false
    // 素材 + 口播稿 + readme + manifest = 4 个文件。
    expect(res.fileCount).toBe(4);
    const stored = storeDownloadArtifact.mock.calls[0]![1];
    expect(stored.name).toMatch(/^素材包-宿主项目-\d{8}\.zip$/);
    expect(stored.bytes.length).toBe(res.totalBytes);
  });

  it("连续导出两次都返回一次性下载，不产生可回流的 assetId", async () => {
    const { wiring, storeDownloadArtifact } = makeWiring();
    const svc = makeServiceWithWiring(wiring);
    const prod = await svc.getProduction(ctx, "output-1");
    const first = await svc.exportMaterials(ctx, prod.id);
    const second = await svc.exportMaterials(ctx, prod.id);
    expect(first.assetId).toBeNull();
    expect(second.assetId).toBeNull();
    expect(storeDownloadArtifact).toHaveBeenCalledTimes(2);
  });

  it("未接线 materialExport → UnsupportedOperationError(诚实拒,不静默空包)", async () => {
    const prod = await service.getProduction(ctx, "output-1");
    await expect(service.exportMaterials(ctx, prod.id)).rejects.toThrow(
      /not implemented/,
    );
  });

  it("output → 项目反查失败 → 404 语义(OwnershipError),不硬造空包", async () => {
    const { wiring } = makeWiring();
    wiring.resolveProjectIdByOutput = vi.fn(async () => null);
    const svc = makeServiceWithWiring(wiring);
    const prod = await svc.getProduction(ctx, "output-1");
    await expect(svc.exportMaterials(ctx, prod.id)).rejects.toMatchObject({
      name: "OwnershipError",
    });
  });

  it("跨用户 productionId → OwnershipError(所有权门在聚合之前)", async () => {
    const { wiring } = makeWiring();
    const svc = makeServiceWithWiring(wiring);
    await expect(
      svc.exportMaterials(ctx, "production-of-someone-else"),
    ).rejects.toMatchObject({ name: "OwnershipError" });
    expect(wiring.ports.listMaterialAssets).not.toHaveBeenCalled();
  });
});
