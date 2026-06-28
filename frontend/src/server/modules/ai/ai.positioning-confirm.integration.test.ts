import { describe, it, expect, beforeEach, vi } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import { createAiService, type AiArtifactsPort } from "./ai.service";
import {
  createPositioningService,
  type PositioningService,
} from "@/server/modules/positioning/positioning.service";

// 定位生成采纳真落库 (Plan Phase A / OQ2). The unit ai.service.test mocks the positioning
// port; THIS integration test wires the REAL positioningService as the AI module's
// positioning port and asserts the end-to-end 采纳 path actually writes to the DB:
//   recordCandidate(positioning_profile) → confirmTask → upsertProfile + a NEW
//   PositioningStatement version tagged created_by_type:'ai' + ai_task_id = the task id.
// This is the source the audit said was missing (the 定位中心 could only USE positioning,
// never have an AI generate one). Deterministic clock/ids, pglite db.

const NOW = "2026-06-21T00:00:00.000Z";
const ctx: RequestContext = { userId: "user-a", requestId: "r1", source: "user" };

function makeWiredService(db: Db) {
  let seq = 0;
  const nextId = (prefix: string) => `${prefix}-${++seq}`;
  // The REAL positioning service — the AI port forwards to it (no cross-module repo).
  const positioningService: PositioningService = createPositioningService({
    db,
    now: () => NOW,
    nextId,
    projects: { getProjectSubject: vi.fn(async () => ({ title: "", brief: "" })) },
  });
  const port: AiArtifactsPort = { createVersion: vi.fn(async () => ({})) };
  const ai = createAiService({
    db,
    now: () => NOW,
    nextId,
    artifacts: port,
    knowledge: { createKnowledge: vi.fn(async () => ({ id: "k-new" })) },
    candidate: {
      createFromAIResult: vi.fn(async () => ({ id: "cand-new" })),
      enrichCard: vi.fn(async () => ({ id: "cand-new" })),
    },
    learnings: { createLearning: vi.fn(async () => ({ id: "learn-new" })) },
    publishing: {
      createPublicationFromDraft: vi.fn(async () => ({ id: "pub-new" })),
    },
    materialLinks: { link: vi.fn(async () => ({ id: "mlink-new" })) },
    // The seam under test: forward to the real positioning service.
    positioning: {
      upsertProfile: (c, input) => positioningService.upsertProfile(c, input),
      createStatementVersion: (c, input) =>
        positioningService.createStatementVersion(c, input),
    },
    calibration: {
      createDraftPrediction: vi.fn(async () => ({ id: "pred-new" })),
    },
  });
  return { ai, positioningService };
}

describe("positioning.generate 采纳真落库 (integration, OQ2)", () => {
  let db: Db;
  beforeEach(async () => {
    ({ db } = await createDb());
  });

  it("confirmTask on a positioning_profile writes a CreatorProfile + an AI PositioningStatement (created_by_type:'ai', ai_task_id) into the real positioning store", async () => {
    const { ai, positioningService } = makeWiredService(db);

    const task = await ai.createTask(ctx, {
      taskType: "positioning.generate",
      inputData: {},
    });
    await ai.recordCandidate(ctx, task.id, {
      resultType: "positioning_profile",
      resultData: {
        suggestion: {
          persona: "硬核 AI 科普人",
          field: "AI 工程",
          audience: "一线开发者",
          differentiation: "论文到代码",
          capabilities: ["拆解", "演示", "复盘"],
          oneLiner: "把最新 AI 论文翻译成你今晚就能跑的代码",
          keywords: ["论文", "代码", "工程化"],
        },
      },
    });

    const done = await ai.confirmTask(ctx, task.id);
    expect(done.status).toBe("succeeded");

    // 1) the 5-facet profile is really persisted.
    const profile = await positioningService.getProfile(ctx);
    expect(profile).not.toBeNull();
    expect(profile!.persona).toBe("硬核 AI 科普人");
    expect(profile!.field).toBe("AI 工程");
    expect(profile!.capabilities).toEqual(["拆解", "演示", "复盘"]);

    // 2) a NEW statement version is really persisted, tagged created_by_type:'ai' +
    //    ai_task_id = this task — read it back from the 定位中心 page DTO.
    const center = await positioningService.getPositioningCenter(ctx);
    expect(center.currentStatement).not.toBeNull();
    expect(center.currentStatement!.oneLiner).toBe(
      "把最新 AI 论文翻译成你今晚就能跑的代码",
    );

    const { rows } = await positioningService.listStatements(ctx, {
      limit: 10,
      offset: 0,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.createdByType).toBe("ai");
    expect(rows[0]!.aiTaskId).toBe(task.id);
    expect(rows[0]!.keywords).toEqual(["论文", "代码", "工程化"]);
    expect(rows[0]!.versionNumber).toBe(1);
  });
});
