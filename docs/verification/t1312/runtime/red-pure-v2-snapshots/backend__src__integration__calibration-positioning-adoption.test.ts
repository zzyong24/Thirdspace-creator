import { beforeEach, afterEach, it, expect, vi } from "vitest";
import {
  createDb,
  type Db,
  projects,
  contentOutputs,
  predictions,
  positioningStatements,
  creatorProfiles,
  platformAccounts,
  aiTasks,
  aiTaskResults,
  executionTasks,
  eq,
} from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import { createCalibrationPositioningAdoptionService } from "../modules/ai/calibration-positioning-adoption.service";
import { lockPositioningAdoptionAccount } from "../modules/positioning/positioning-write-lock";
import { createProjectsService } from "../modules/projects/projects.service";
import { createProjectRepository } from "../modules/projects/projects.repository";
import { createAiService } from "../modules/ai/ai.service";
import { createCalibrationService } from "../modules/calibration/calibration.service";
import { createPositioningService } from "../modules/positioning/positioning.service";
const ctx: RequestContext = {
  userId: "u",
  accountId: "a",
  requestId: "r",
  source: "user",
};
const now = () => "2026-09-06T00:00:00.000Z";
let seq = 0;
const nextId = (p: string) => `${p}-${++seq}`;
const unused = vi.fn(async (): Promise<never> => {
  throw new Error("UNEXPECTED_PORT");
});
const calibration = (db: Db) =>
  createCalibrationService({
    db,
    now,
    nextId,
    ingestion: { assertRunExists: unused, ensureManualRun: unused },
    learnings: { adjustConfidence: unused },
  });
const positioning = (db: Db) =>
  createPositioningService({
    db,
    now,
    nextId,
    projects: { getProjectSubject: unused },
  });
let failAfterWrite = false;
let f: Awaited<ReturnType<typeof createDb>>,
  ai: ReturnType<typeof createAiService>,
  rubricId: string;
const suggestion = {
  persona: "AI身份",
  field: "领域",
  audience: "读者",
  differentiation: "区别",
  capabilities: ["写作"],
  oneLiner: "AI一句话",
  keywords: ["一", "二", "三"],
};
beforeEach(async () => {
  f = await createDb();
  seq = 0;
  failAfterWrite = false;
  await f.db
    .insert(platformAccounts)
    .values({
      id: "a",
      userId: "u",
      platform: "douyin",
      accountHandle: "本号",
      createdAt: now(),
      updatedAt: now(),
    });
  await f.db
    .insert(projects)
    .values(
      ["project", "foreign"].map((id) => ({
        id,
        userId: "u",
        accountId: id === "project" ? "a" : "other",
        title: id,
        creationMode: "manual",
        status: "active",
        currentStage: "brief",
        startedAt: now(),
        createdAt: now(),
        updatedAt: now(),
      })),
    );
  await f.db
    .insert(contentOutputs)
    .values(
      ["output", "foreign-output"].map((id) => ({
        id,
        projectId: id === "output" ? "project" : "foreign",
        title: id,
        contentType: "video",
        status: "draft",
        createdAt: now(),
        updatedAt: now(),
      })),
    );
  const c = calibration(f.db),
    p = positioning(f.db);
  const rubric = await c.createRubric(ctx, {
    name: "真实规则",
    dimensions: [{ key: "persona", label: "人群匹配", weight: 1 }],
  });
  rubricId = (await c.getCurrentRubricVersion(ctx, rubric.id)).id;
  const adoption = createCalibrationPositioningAdoptionService(
    f.db,
    {
      assertSubject: async (c, type, id, tx) => {
        if (type !== "content_output")
          throw new Error("UNEXPECTED_SUBJECT_TYPE");
        const projectId = await createProjectsService(
          createProjectRepository(tx as unknown as Db),
          { now, nextId },
        ).getOutputOwnerSummary(c, id);
        if (!projectId) throw new Error("SUBJECT_NOT_OWNED");
      },
      createDraftPrediction: async (c, input, tx) => {
        const result = await calibration(
          tx as unknown as Db,
        ).createDraftPrediction(c, input);
        if (failAfterWrite) throw new Error("AFTER_DOMAIN_WRITE");
        return result;
      },
      lockPositioning: lockPositioningAdoptionAccount,
      upsertProfile: (c, input, tx) =>
        positioning(tx as unknown as Db).upsertProfile(c, input),
      createStatementVersion: async (c, input, tx) => {
        const result = await positioning(
          tx as unknown as Db,
        ).createStatementVersion(c, input);
        if (failAfterWrite) throw new Error("AFTER_DOMAIN_WRITE");
        return result;
      },
    },
    now,
  );
  ai = createAiService({
    db: f.db,
    now,
    nextId,
    calibrationPositioning: adoption,
    artifacts: { createVersion: unused },
    knowledge: { createKnowledge: unused },
    candidate: { createFromAIResult: unused, enrichCard: unused },
    learnings: { createLearning: unused },
    publishing: { createPublicationFromDraft: unused },
    materialLinks: { link: unused },
    positioning: {
      upsertProfile: (c, i) => p.upsertProfile(c, i),
      createStatementVersion: (c, i) => p.createStatementVersion(c, i),
    },
    calibration: {
      createDraftPrediction: (ctx, input) =>
        c.createDraftPrediction(ctx, input),
    },
  });
});
afterEach(async () => {
  await f.client.close();
});
async function task(
  type: "calibration.diagnose" | "positioning.generate",
  subjectId = "output",
) {
  const t = await ai.createTask(ctx, {
    taskType: type,
    attemptId: nextId("adoption-attempt-request"),
    inputData:
      type === "calibration.diagnose"
        ? { subjectType: "content_output", subjectId }
        : {},
  });
  await ai.markRunning(ctx, t.id);
  await ai.recordCandidate(
    ctx,
    t.id,
    type === "calibration.diagnose"
      ? {
          resultType: "calibration_diagnosis",
          resultData: {
            subjectType: "content_output",
            subjectId,
            rubricVersionId: rubricId,
            diagnosis: {
              dimensions: [{ key: "persona", score: 3 }],
              confidence: "med",
            },
          },
        }
      : { resultType: "positioning_profile", resultData: { suggestion } },
  );
  return t;
}
it("诊断并发采纳与回执丢失重放只生成一个真实预测", async () => {
  const t = await task("calibration.diagnose");
  await Promise.all([ai.confirmTask(ctx, t.id), ai.confirmTask(ctx, t.id)]);
  expect((await ai.confirmTask(ctx, t.id)).status).toBe("succeeded");
  expect(await f.db.select().from(predictions)).toHaveLength(1);
});
it("定位成功重放不覆盖人工修改且不追加版本", async () => {
  const t = await task("positioning.generate");
  await ai.confirmTask(ctx, t.id);
  await positioning(f.db).upsertProfile(ctx, {
    ...suggestion,
    persona: "人工身份",
  });
  expect((await ai.confirmTask(ctx, t.id)).status).toBe("succeeded");
  expect((await f.db.select().from(creatorProfiles))[0]?.persona).toBe(
    "人工身份",
  );
  expect(await f.db.select().from(positioningStatements)).toHaveLength(1);
});
it("诊断不存在的真实对象不可采纳", async () => {
  const t = await task("calibration.diagnose", "missing");
  await expect(ai.confirmTask(ctx, t.id)).rejects.toThrow();
  expect(await f.db.select().from(predictions)).toHaveLength(0);
});

it.each(["calibration.diagnose", "positioning.generate"] as const)(
  "%s 领域写后故障回滚全部数据并可重放",
  async (type) => {
    const t = await task(type);
    failAfterWrite = true;
    await expect(ai.confirmTask(ctx, t.id)).rejects.toThrow(
      "AFTER_DOMAIN_WRITE",
    );
    expect(await f.db.select().from(predictions)).toHaveLength(0);
    expect(await f.db.select().from(creatorProfiles)).toHaveLength(0);
    expect(await f.db.select().from(positioningStatements)).toHaveLength(0);
    expect((await ai.getTask(ctx, t.id)).status).toBe("awaiting_confirmation");
    failAfterWrite = false;
    expect((await ai.confirmTask(ctx, t.id)).status).toBe("succeeded");
  },
);
it("真实跨账号subject拒绝，预测不落库", async () => {
  const t = await task("calibration.diagnose", "foreign-output");
  await expect(ai.confirmTask(ctx, t.id)).rejects.toThrow();
  expect(await f.db.select().from(predictions)).toHaveLength(0);
});
it("两个定位任务并发首次采纳只有一个母版且版本连续", async () => {
  const a = await task("positioning.generate"),
    b = await task("positioning.generate");
  await Promise.all([ai.confirmTask(ctx, a.id), ai.confirmTask(ctx, b.id)]);
  expect(await f.db.select().from(creatorProfiles)).toHaveLength(1);
  expect(
    (await f.db.select().from(positioningStatements))
      .map((s) => s.versionNumber)
      .sort(),
  ).toEqual([1, 2]);
});
it("普通人工版本与AI版本使用同一账号锁且均保留", async () => {
  await positioning(f.db).upsertProfile(ctx, suggestion);
  const t = await task("positioning.generate");
  await Promise.all([
    ai.confirmTask(ctx, t.id),
    positioning(f.db).createStatementVersion(ctx, {
      oneLiner: "人工版本",
      keywords: ["甲", "乙", "丙"],
      productAnchorIds: [],
    }),
  ]);
  expect(
    (await f.db.select().from(positioningStatements))
      .map((s) => s.versionNumber)
      .sort(),
  ).toEqual([1, 2]);
});
it("内部规则版本读遵守账号归属", async () => {
  expect((await calibration(f.db).getRubricVersion(ctx, rubricId)).id).toBe(
    rubricId,
  );
  await expect(
    calibration(f.db).getRubricVersion(
      { ...ctx, accountId: "other" },
      rubricId,
    ),
  ).rejects.toThrow();
});

it("诊断候选目标篡改拒绝", async () => {
  const t = await task("calibration.diagnose");
  const [result] = await f.db
    .select()
    .from(aiTaskResults)
    .where(eq(aiTaskResults.aiTaskId, t.id));
  await f.db
    .update(aiTaskResults)
    .set({
      resultData: {
        ...(result!.resultData as object),
        subjectId: "foreign-output",
      },
    })
    .where(eq(aiTaskResults.id, result!.id));
  await expect(ai.confirmTask(ctx, t.id)).rejects.toThrow("目标");
  expect(await f.db.select().from(predictions)).toHaveLength(0);
});
it.each([false, true])("映射诊断校验冻结规则来源，篡改=%s", async (tamper) => {
  const t = await task("calibration.diagnose");
  const executionId = nextId("exec");
  await f.db
    .insert(executionTasks)
    .values({
      id: executionId,
      userId: "u",
      accountId: "a",
      kind: "ai_task",
      ownerType: "ai_task",
      ownerId: t.id,
      idempotencyKey: executionId,
      payload: {
        aiTaskId: t.id,
        modelInput: {
          facets: {
            __calibrationDiagnosis: JSON.stringify({
              subjectType: "content_output",
              subjectId: "output",
              rubricVersionId: tamper ? "different" : rubricId,
              rubricKeys: ["persona"],
            }),
          },
        },
      },
      createdAt: now(),
      updatedAt: now(),
    });
  await f.db
    .update(aiTasks)
    .set({ executionTaskId: executionId })
    .where(eq(aiTasks.id, t.id));
  if (tamper) {
    await expect(ai.confirmTask(ctx, t.id)).rejects.toThrow("冻结");
    expect(await f.db.select().from(predictions)).toHaveLength(0);
  } else expect((await ai.confirmTask(ctx, t.id)).status).toBe("succeeded");
});
