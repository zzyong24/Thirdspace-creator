import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import type {
  Endpoint,
  RequestContext,
  Transport,
} from "@creatoros/contract";
import { createCalibrationService } from "./calibration.service";
import { createCalibrationTransport } from "./calibration.transport";
import {
  rubricResource,
  rubricVersionResource,
  predictionResource,
  calibrationResultResource,
} from "./calibration.schema";

// Calibration contract test (Step 4) — for EACH of the 7 op ids, drive the transport
// with a seeded ctx + valid input and assert the op's contract response DTO
// .parse(envelope.data) succeeds (the output validates against the wire shape). The
// peer ports are stubbed (Ingestion run-existence resolves; Learnings no-op). Mirrors
// the monetization contract test.

const NOW = "2026-06-21T00:00:00.000Z";
const ctx: RequestContext = { userId: "user-a", requestId: "r1", source: "user" };

const ep = (id: string) => ({ id }) as unknown as Endpoint;
async function call(
  transport: Transport,
  id: string,
  input: unknown,
): Promise<{ data: unknown }> {
  const res = await transport.request(ep(id), input as never, ctx);
  return res as { data: unknown };
}

function makeTransport(db: Db): Transport {
  let seq = 0;
  const service = createCalibrationService({
    db,
    now: () => NOW,
    nextId: (prefix: string) => `${prefix}-${++seq}`,
    ingestion: { assertRunExists: async () => {} },
    learnings: { adjustConfidence: async () => {} },
  });
  return createCalibrationTransport(() => service);
}

const DIMENSIONS = [
  { key: "hook", label: "hook 强度", weight: 0.4 },
  { key: "persona", label: "人群匹配", weight: 0.3 },
  { key: "cta", label: "CTA 清晰度", weight: 0.3 },
];

async function seedRubric(
  t: Transport,
): Promise<{ rubricId: string; versionId: string }> {
  const r = await call(t, "calibration.rubrics.create", {
    body: { name: "变现加权", dimensions: DIMENSIONS },
  });
  const data = r.data as { id: string; currentVersionId: string };
  return { rubricId: data.id, versionId: data.currentVersionId };
}

async function seedLockedPrediction(t: Transport): Promise<string> {
  const { versionId } = await seedRubric(t);
  const created = await call(t, "calibration.predictions.create", {
    body: {
      subjectType: "content_output",
      subjectId: "output-1",
      rubricVersionId: versionId,
      predictedMetrics: { hook: 10 },
      predictedConversion: { persona: 5, cta: 5 },
      confidence: "high",
    },
  });
  const predId = (created.data as { id: string }).id;
  await call(t, "calibration.predictions.lock", {
    params: { predictionId: predId },
  });
  return predId;
}

describe("calibration contract (each of 7 ops validates against its DTO)", () => {
  let db: Db;
  beforeEach(async () => {
    ({ db } = await createDb());
  });

  it("calibration.rubrics.create → rubricResource (embedded currentVersion, versionNumber 1)", async () => {
    const t = makeTransport(db);
    const r = await call(t, "calibration.rubrics.create", {
      body: { name: "r", dimensions: DIMENSIONS },
    });
    const dto = rubricResource.parse(r.data);
    expect(dto.currentVersion.versionNumber).toBe(1);
    expect(dto.currentVersionId).toBe(dto.currentVersion.id);
  });

  it("calibration.rubrics.bumpVersion → rubricVersionResource (versionNumber 2)", async () => {
    const t = makeTransport(db);
    const { rubricId } = await seedRubric(t);
    const r = await call(t, "calibration.rubrics.bumpVersion", {
      params: { rubricId },
      body: { dimensions: DIMENSIONS, changeSummary: "tuned" },
    });
    const dto = rubricVersionResource.parse(r.data);
    expect(dto.versionNumber).toBe(2);
  });

  it("calibration.rubrics.get → rubricResource", async () => {
    const t = makeTransport(db);
    const { rubricId } = await seedRubric(t);
    const r = await call(t, "calibration.rubrics.get", {
      params: { rubricId },
    });
    expect(() => rubricResource.parse(r.data)).not.toThrow();
  });

  it("calibration.predictions.create → predictionResource (draft, lockedAt null, numeric score)", async () => {
    const t = makeTransport(db);
    const { versionId } = await seedRubric(t);
    const r = await call(t, "calibration.predictions.create", {
      body: {
        subjectType: "content_output",
        subjectId: "output-1",
        rubricVersionId: versionId,
        predictedMetrics: { hook: 10 },
        predictedConversion: { persona: 5, cta: 5 },
        confidence: "high",
      },
    });
    const dto = predictionResource.parse(r.data);
    expect(dto.status).toBe("draft");
    expect(dto.lockedAt).toBeNull();
    expect(typeof dto.predictedScore).toBe("number");
  });

  it("calibration.predictions.lock → predictionResource (locked, lockedAt set)", async () => {
    const t = makeTransport(db);
    const { versionId } = await seedRubric(t);
    const created = await call(t, "calibration.predictions.create", {
      body: {
        subjectType: "content_output",
        subjectId: "o",
        rubricVersionId: versionId,
        predictedMetrics: {},
        predictedConversion: {},
        confidence: "med",
      },
    });
    const predId = (created.data as { id: string }).id;
    const r = await call(t, "calibration.predictions.lock", {
      params: { predictionId: predId },
    });
    const dto = predictionResource.parse(r.data);
    expect(dto.status).toBe("locked");
    expect(dto.lockedAt).not.toBeNull();
  });

  it("calibration.predictions.get → predictionResource", async () => {
    const t = makeTransport(db);
    const predId = await seedLockedPrediction(t);
    const r = await call(t, "calibration.predictions.get", {
      params: { predictionId: predId },
    });
    expect(() => predictionResource.parse(r.data)).not.toThrow();
  });

  it("calibration.results.create → calibrationResultResource (deviation object, ingestionRunId present)", async () => {
    const t = makeTransport(db);
    const predId = await seedLockedPrediction(t);
    const r = await call(t, "calibration.results.create", {
      params: { predictionId: predId },
      body: { ingestionRunId: "run-1", actualMetrics: { hook: 12 } },
    });
    const dto = calibrationResultResource.parse(r.data);
    expect(dto.ingestionRunId).toBe("run-1");
    expect(typeof dto.deviation).toBe("object");
  });
});
