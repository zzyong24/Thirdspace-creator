import { beforeEach, afterEach, it, expect } from "vitest";
import {
  createDb,
  aiTasks,
  aiTaskResults,
  executionTasks,
  candidates,
  eq,
  type Db,
} from "@creatoros/backend";
import { createAiService } from "../modules/ai/ai.service";
import { createCandidateService } from "../modules/candidate/candidate.service";
import { createTopicCandidateAdoptionService } from "../modules/ai/topic-candidate-adoption.service";
const ctx = {
  userId: "u",
  accountId: "a",
  requestId: "r",
  source: "user" as const,
};
const now = () => "2026-09-06T00:00:00.000Z";
let n = 0;
const nextId = (p: string) => `${p}-${++n}`;
const unused = async (): Promise<never> => {
  throw new Error("UNUSED");
};
const domain = (db: Db) =>
  createCandidateService({
    db,
    now,
    nextId,
    projects: { createProject: unused },
    ingestion: { assertRunExists: unused },
  });
let f: Awaited<ReturnType<typeof createDb>>,
  fail = false;
let service: ReturnType<typeof createTopicCandidateAdoptionService>;
beforeEach(async () => {
  f = await createDb();
  n = 0;
  fail = false;
  service = createTopicCandidateAdoptionService(
    f.db,
    {
      assertProject: unused,
      createFromAIResult: async (c, r, tx) => {
        const value = await domain(tx as unknown as Db).createFromAIResult(
          c,
          r,
        );
        if (fail) throw new Error("AFTER_WRITE");
        return value;
      },
    },
    now,
  );
});
afterEach(async () => f.client.close());
async function seed(mapped = false) {
  await f.db
    .insert(aiTasks)
    .values({
      id: "task",
      userId: "u",
      accountId: "a",
      taskType: "topic.generate",
      status: "awaiting_confirmation",
      idempotencyKey: "task",
      requestedAt: now(),
      projectId: null,
      inputData: { basis: "comments" },
    });
  await f.db
    .insert(aiTaskResults)
    .values({
      id: "result",
      aiTaskId: "task",
      resultType: "candidate_list",
      resultData: {
        items: [
          { title: "" },
          {
            title: "题目",
            source: "demand",
            contentRole: "信任",
            reason: "理由",
            sourceComments: ["原话"],
          },
        ],
      },
    });
  if (mapped)
    await f.db
      .insert(executionTasks)
      .values({
        id: "exec",
        userId: "u",
        accountId: "a",
        kind: "ai_task",
        ownerType: "ai_task",
        ownerId: "task",
        idempotencyKey: "exec",
        createdAt: now(),
        updatedAt: now(),
        status: "succeeded",
        payload: {
          aiTaskId: "task",
          modelInput: {
            facets: {
              __topicGenerate: JSON.stringify({
                version: 1,
                basis: "comments",
                projectId: null,
              }),
            },
          },
        },
      });
  if (mapped)
    await f.db
      .update(aiTasks)
      .set({ executionTaskId: "exec" })
      .where(eq(aiTasks.id, "task"));
}
it("并发和成功重放不重复，空标题不占旧序号", async () => {
  await seed();
  await Promise.all([
    service.confirmTask(ctx, "task"),
    service.confirmTask(ctx, "task"),
  ]);
  await service.confirmTask(ctx, "task");
  expect(await f.db.select().from(candidates)).toMatchObject([
    {
      aiTaskId: "task#0",
      title: "题目",
      source: "demand",
      contentRole: "trust",
    },
  ]);
});
it("领域写后异常整体回滚", async () => {
  await seed();
  fail = true;
  await expect(service.confirmTask(ctx, "task")).rejects.toThrow("AFTER_WRITE");
  expect(await f.db.select().from(candidates)).toHaveLength(0);
  expect((await f.db.select().from(aiTasks))[0]?.status).toBe(
    "awaiting_confirmation",
  );
});
it("旧部分来源键保留人工编辑", async () => {
  await seed();
  await domain(f.db).createFromAIResult(ctx, {
    aiTaskId: "task#0",
    resultType: "candidate",
    resultData: { title: "人工修改", source: "benchmark" },
  });
  await service.confirmTask(ctx, "task");
  expect(await f.db.select().from(candidates)).toMatchObject([
    { title: "人工修改" },
  ]);
});
it("mapped冻结basis必须匹配原输入，跨账号拒绝", async () => {
  await seed(true);
  await expect(
    service.confirmTask({ ...ctx, accountId: "other" }, "task"),
  ).rejects.toThrow();
  await f.db
    .update(aiTasks)
    .set({ inputData: { basis: "trend" } })
    .where(eq(aiTasks.id, "task"));
  await expect(service.confirmTask(ctx, "task")).rejects.toThrow();
  expect(await f.db.select().from(candidates)).toHaveLength(0);
});
it("真实mapped候选可采纳，删除后成功重投不重建", async () => {
  await seed(true);
  await service.confirmTask(ctx, "task");
  await f.db.delete(candidates);
  await service.confirmTask(ctx, "task");
  expect(await f.db.select().from(candidates)).toHaveLength(0);
});
it("公开confirm使用事务端口", async () => {
  await seed();
  const ai = createAiService({
    db: f.db,
    now,
    nextId,
    topicCandidates: service,
    artifacts: { createVersion: unused },
    knowledge: { createKnowledge: unused },
    candidate: { createFromAIResult: unused, enrichCard: unused },
    learnings: { createLearning: unused },
    publishing: { createPublicationFromDraft: unused },
    materialLinks: { link: unused },
    positioning: { upsertProfile: unused, createStatementVersion: unused },
    calibration: { createDraftPrediction: unused },
  });
  expect((await ai.confirmTask(ctx, "task")).status).toBe("succeeded");
  expect((await ai.confirmTask(ctx, "task")).status).toBe("succeeded");
});
