import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db, projects, contentOutputs } from "@creatoros/backend";
import {
  successEnvelope,
  type Endpoint,
  type RequestContext,
  type Transport,
} from "@creatoros/contract";
import { createProductionService } from "./production.service";
import { createProductionTransport } from "./production.transport";
import {
  productionResource,
  productionSegmentResource,
  exportRecordResource,
} from "./production.schema";

// Step 4 — drive each production op through the transport against a real pglite db
// and assert the envelope `data` validates against the op's contract response DTO
// (foundation §5.4). Confirms record configs, non-null id coercion (queued export
// resultAssetId → ""), enum coercion, and the exports.complete happy path
// producing a DTO whose status parses as "ready".

const ctx: RequestContext = {
  userId: "user-1",
  requestId: "req-1",
  source: "user",
  accountId: "acct-1", // [T-332 S2] 父锚 strict 门
};
const NOW = "2026-06-21T04:00:00.000Z";

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

const ep = (id: string) => ({ id }) as unknown as Endpoint;

let db: Db;
let transport: Transport;

beforeEach(async () => {
  ({ db } = await createDb());
  let seq = 0;
  const service = createProductionService({
    db,
    now: () => NOW,
    nextId: (prefix: string) => `${prefix}-${++seq}`,
  });
  transport = createProductionTransport(() => service);
  await seedOutput(db, "output-1", "user-1", "acct-1"); // [T-332 S2] 父锚种子
});

async function call(id: string, input: unknown) {
  return transport.request(ep(id), input as never, ctx);
}

async function productionId(): Promise<string> {
  const res = await call("outputs.production.get", {
    params: { outputId: "output-1" },
  });
  return (res as { data: { id: string } }).data.id;
}

describe("production.transport — contract conformance", () => {
  it("outputs.production.get → productionResource (get-or-create)", async () => {
    const res = await call("outputs.production.get", {
      params: { outputId: "output-1" },
    });
    const parsed = successEnvelope(productionResource).parse(res);
    expect(parsed.data.status).toBe("drafting");
    expect(parsed.data.contentOutputId).toBe("output-1");
    expect(parsed.data.startedAt).toBeNull();
  });

  it("outputs.production.put → productionResource", async () => {
    await productionId();
    const res = await call("outputs.production.put", {
      params: { outputId: "output-1" },
      body: { productionMode: "screen_capture", recordingConfig: { overlay: true } },
    });
    const parsed = successEnvelope(productionResource).parse(res);
    expect(parsed.data.productionMode).toBe("screen_capture");
    expect(parsed.data.recordingConfig).toEqual({ overlay: true });
  });

  it("outputs.production.editingPlan.confirm → productionResource with durable revision", async () => {
    await productionId();
    const res = await call("outputs.production.editingPlan.confirm", {
      params: { outputId: "output-1" },
      body: {
        expectedRevision: 0,
        plan: {
          sourceTaskId: "ai-task-1",
          sourceRenderTaskId: null,
          confirmedAt: NOW,
          decisions: { scenes: [{ id: "scene-1" }] },
          renderProps: { meta: { title: "测试片" } },
          inventory: [
            { assetId: "asset-broll-1", label: "项目录屏", kind: "video" },
          ],
        },
      },
    });
    const parsed = successEnvelope(productionResource).parse(res);
    expect(parsed.data.recordingConfig).toMatchObject({
      videoEditingPlan: {
        revision: 1,
        sourceTaskId: "ai-task-1",
        decisions: { scenes: [{ id: "scene-1" }] },
        inventory: [
          { assetId: "asset-broll-1", label: "项目录屏", kind: "video" },
        ],
      },
    });
  });

  it("[T-881] outputs.production.editingPlan.broll.remove → 写后读不再含被删素材", async () => {
    await productionId();
    await call("outputs.production.editingPlan.confirm", {
      params: { outputId: "output-1" },
      body: {
        expectedRevision: 0,
        plan: {
          sourceTaskId: "ai-task-1",
          confirmedAt: NOW,
          excludedAssetIds: [],
          decisions: {
            scenes: [],
            broll: [{ assetId: "asset-remove", sceneIdx: 0, at: 0, durationSec: 2 }],
            direction: { motionThesis: "旧方向" },
          },
          renderProps: {
            broll: [{ file: "asset-remove", at: 0, durationSec: 2 }],
            direction: { motionThesis: "旧方向" },
          },
          inventory: [{ assetId: "asset-remove", label: "待删除" }],
        },
      },
    });
    const removed = await call("outputs.production.editingPlan.broll.remove", {
      params: { outputId: "output-1" },
      body: { expectedRevision: 1, assetId: "asset-remove" },
    });
    const parsed = successEnvelope(productionResource).parse(removed);
    expect(parsed.data.recordingConfig).toMatchObject({
      videoEditingPlan: {
        revision: 2,
        excludedAssetIds: ["asset-remove"],
        decisions: { broll: [] },
        renderProps: { broll: [] },
        inventory: [],
      },
    });

    const reread = await call("outputs.production.get", {
      params: { outputId: "output-1" },
    });
    expect(successEnvelope(productionResource).parse(reread).data.recordingConfig)
      .toEqual(parsed.data.recordingConfig);
  });

  it("productions.segments.create → productionSegmentResource", async () => {
    const pid = await productionId();
    const res = await call("productions.segments.create", {
      params: { productionId: pid },
      body: { title: "新章节 1", position: 0, startMs: 0, endMs: 30000 },
    });
    const parsed = successEnvelope(productionSegmentResource).parse(res);
    expect(parsed.data.title).toBe("新章节 1");
    expect(parsed.data.scriptSectionId).toBeNull();
  });

  it("productions.exports.create → exportRecordResource (queued, coerced asset id)", async () => {
    const pid = await productionId();
    const res = await call("productions.exports.create", {
      params: { productionId: pid },
      body: { format: "mp4", resolution: "1080p", aspectRatio: "16:9" },
    });
    const parsed = successEnvelope(exportRecordResource).parse(res);
    expect(parsed.data.status).toBe("queued");
    expect(parsed.data.resultAssetId).toBe("pending");
    expect(parsed.data.completedAt).toBeNull();
  });

  it("exports.complete → exportRecordResource with status ready", async () => {
    const pid = await productionId();
    const created = await call("productions.exports.create", {
      params: { productionId: pid },
      body: { format: "mp4", resolution: "1080p", aspectRatio: "16:9" },
    });
    const exportId = (created as { data: { id: string } }).data.id;
    const res = await call("exports.complete", {
      params: { exportId },
      body: { resultAssetId: "asset-result-1" },
    });
    const parsed = successEnvelope(exportRecordResource).parse(res);
    expect(parsed.data.status).toBe("ready");
    expect(parsed.data.resultAssetId).toBe("asset-result-1");
    expect(parsed.data.completedAt).not.toBeNull();
  });
});
