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
