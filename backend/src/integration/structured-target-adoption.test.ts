import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  createDb,
  type Db,
  materialLinks,
  projects,
  assets,
  eq,
} from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import { createStructuredTargetAdoptionService } from "../modules/ai/structured-target-adoption.service";
import { createAiService } from "../modules/ai/ai.service";
import { createCandidateService } from "../modules/candidate/candidate.service";
import { createProjectsService } from "../modules/projects/projects.service";
import { createProjectRepository } from "../modules/projects/projects.repository";
import { createAssetsService } from "../modules/assets/assets.service";
import { createAssetRepository } from "../modules/assets/assets.repository";
import { createMaterialLinksService } from "../modules/material-links/material-links.service";
const ctx: RequestContext = {
  userId: "u",
  accountId: "a",
  requestId: "r",
  source: "user",
};
let fixture: Awaited<ReturnType<typeof createDb>>,
  ai: ReturnType<typeof createAiService>,
  candidates: ReturnType<typeof createCandidateService>;
const now = () => "2026-09-06T00:00:00.000Z";
let n = 0;
const nextId = (p: string) => `${p}-${++n}`;
const unused = vi.fn(async (): Promise<never> => {
  throw new Error("UNUSED");
});
let failAfterWrite = false;
let writes = 0;
let legacyAi: ReturnType<typeof createAiService>;
const candidateService = (db: Db) =>
  createCandidateService({
    db,
    now,
    nextId,
    projects: { createProject: unused },
    ingestion: { assertRunExists: unused },
  });
beforeEach(async () => {
  fixture = await createDb();
  n = 0;
  failAfterWrite = false;
  writes = 0;
  await fixture.db
    .insert(projects)
    .values(
      ["project", "foreign-project"].map((id) => ({
        id,
        userId: ctx.userId,
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
  await fixture.db
    .insert(assets)
    .values(
      ["asset", "asset-2", "foreign-asset"].map((id) => ({
        id,
        userId: ctx.userId,
        accountId: id === "foreign-asset" ? "other" : "a",
        name: id,
        assetType: "image",
        createdAt: now(),
        updatedAt: now(),
      })),
    );
  candidates = candidateService(fixture.db);
  const links = createMaterialLinksService({ db: fixture.db, now, nextId });
  const adoption = createStructuredTargetAdoptionService(
    fixture.db,
    {
      async enrichCard(c, id, card, tx) {
        const result = await candidateService(tx as unknown as Db).enrichCard(
          c,
          id,
          card,
        );
        if (failAfterWrite) throw new Error("AFTER_DOMAIN_WRITE");
        return result;
      },
      async link(c, input, tx) {
        const txDb = tx as unknown as Db,
          txProjects = createProjectsService(createProjectRepository(txDb), {
            now,
            nextId,
          }),
          txAssets = createAssetsService(
            createAssetRepository(txDb, { now, nextId }),
            unused,
            { now, nextId },
          );
        const result = await createMaterialLinksService({
          db: txDb,
          now,
          nextId,
          assertProjectOwned: async (context, id) => {
            await txProjects.listOutputIdsByProject(context, id);
          },
          assertAssetOwned: async (context, id) => {
            const asset = await txAssets.getAsset(context, id);
            if (asset.status !== "active")
              throw new Error("素材已不可用，请重新选择素材");
            return asset;
          },
        }).create(c, input);
        writes++;
        if (failAfterWrite) throw new Error("AFTER_DOMAIN_WRITE");
        return result;
      },
    },
    now,
  );
  const aiDeps: Parameters<typeof createAiService>[0] = {
    db: fixture.db,
    now,
    nextId,
    structuredTargets: adoption,
    artifacts: { createVersion: unused },
    knowledge: { createKnowledge: unused },
    candidate: {
      createFromAIResult: unused,
      enrichCard: (c, id, card) => candidates.enrichCard(c, id, card),
    },
    learnings: { createLearning: unused },
    publishing: { createPublicationFromDraft: unused },
    materialLinks: { link: (c, input) => links.create(c, input) },
    positioning: { upsertProfile: unused, createStatementVersion: unused },
    calibration: { createDraftPrediction: unused },
  };
  ai = createAiService(aiDeps);
  legacyAi = createAiService({
    ...aiDeps,
    structuredTargets: undefined,
    materialLinks: {
      link: async (c, input) => {
        if (input.entityId === "asset-2")
          throw new Error("LEGACY_SECOND_LINK_FAILED");
        return links.create(c, input);
      },
    },
  });
});
afterEach(async () => {
  await fixture.client.close();
});
async function record(
  taskType: string,
  inputData: Record<string, unknown>,
  resultType: "topic_card" | "material_link_list",
  resultData: Record<string, unknown>,
  projectId?: string,
) {
  const task = await ai.createTask(ctx, {
    taskType,
    inputData: { ...inputData, ...(projectId ? { projectId } : {}) },
  });
  await ai.markRunning(ctx, task.id);
  await ai.recordCandidate(ctx, task.id, { resultType, resultData });
  return task;
}
it("并发确认选题卡且成功重放不覆盖人工改卡", async () => {
  const target = await candidates.createCandidate(ctx, { title: "真实目标" });
  const task = await record(
    "topic.enrich",
    { candidateId: target.id },
    "topic_card",
    { candidateId: target.id, card: { oneLiner: "AI正文" } },
  );
  await Promise.all([
    ai.confirmTask(ctx, task.id),
    ai.confirmTask(ctx, task.id),
  ]);
  await candidates.enrichCard(ctx, target.id, { oneLiner: "人工正文" });
  expect((await ai.confirmTask(ctx, task.id)).status).toBe("succeeded");
  expect((await candidates.getCandidate(ctx, target.id)).card.oneLiner).toBe(
    "人工正文",
  );
});
it("拒绝候选替换原任务目标", async () => {
  const a = await candidates.createCandidate(ctx, { title: "原目标" }),
    b = await candidates.createCandidate(ctx, { title: "其他目标" });
  const task = await record(
    "topic.enrich",
    { candidateId: a.id },
    "topic_card",
    { candidateId: b.id, card: { oneLiner: "不可覆盖" } },
  );
  await expect(ai.confirmTask(ctx, task.id)).rejects.toThrow();
  expect((await candidates.getCandidate(ctx, b.id)).card.oneLiner).not.toBe(
    "不可覆盖",
  );
});
it("素材无项目不能假成功", async () => {
  const task = await record("material.match", {}, "material_link_list", {
    matches: [{ assetId: "asset", role: "clip" }],
  });
  await expect(ai.confirmTask(ctx, task.id)).rejects.toThrow();
  expect(await fixture.db.select().from(materialLinks)).toHaveLength(0);
});

it("素材并发确认及成功重放仅落一条真实边", async () => {
  const task = await record(
    "material.match",
    {},
    "material_link_list",
    {
      matches: [
        { assetId: "asset", role: "clip" },
        { assetId: "asset", role: "clip" },
      ],
    },
    "project",
  );
  await Promise.all([
    ai.confirmTask(ctx, task.id),
    ai.confirmTask(ctx, task.id),
  ]);
  expect((await ai.confirmTask(ctx, task.id)).status).toBe("succeeded");
  expect(await fixture.db.select().from(materialLinks)).toHaveLength(1);
});
it.each(["topic.enrich", "material.match"])(
  "%s 领域写后失败回滚并可恢复",
  async (type) => {
    const target = await candidates.createCandidate(ctx, { title: "真实目标" });
    const task =
      type === "topic.enrich"
        ? await record(type, { candidateId: target.id }, "topic_card", {
            candidateId: target.id,
            card: { oneLiner: "事务正文" },
          })
        : await record(
            type,
            {},
            "material_link_list",
            { matches: [{ assetId: "asset" }] },
            "project",
          );
    failAfterWrite = true;
    await expect(ai.confirmTask(ctx, task.id)).rejects.toThrow(
      "AFTER_DOMAIN_WRITE",
    );
    expect((await ai.getTask(ctx, task.id)).status).toBe(
      "awaiting_confirmation",
    );
    expect(
      (await candidates.getCandidate(ctx, target.id)).card.oneLiner,
    ).not.toBe("事务正文");
    expect(await fixture.db.select().from(materialLinks)).toHaveLength(0);
    failAfterWrite = false;
    expect((await ai.confirmTask(ctx, task.id)).status).toBe("succeeded");
  },
);
it("跨账号确认拒绝且不改真实选题", async () => {
  const target = await candidates.createCandidate(ctx, { title: "真实目标" });
  const task = await record(
    "topic.enrich",
    { candidateId: target.id },
    "topic_card",
    { candidateId: target.id, card: { oneLiner: "不可越权" } },
  );
  await expect(
    ai.confirmTask({ ...ctx, accountId: "other" }, task.id),
  ).rejects.toThrow();
  expect(
    (await candidates.getCandidate(ctx, target.id)).card.oneLiner,
  ).not.toBe("不可越权");
});

it.each(["asset", "project"])(
  "真实事务领域服务拒绝跨账号%s，且没有部分链接",
  async (boundary) => {
    const task = await record(
      "material.match",
      {},
      "material_link_list",
      {
        matches:
          boundary === "asset"
            ? [{ assetId: "asset" }, { assetId: "foreign-asset" }]
            : [{ assetId: "asset" }],
      },
      boundary === "project" ? "foreign-project" : "project",
    );
    await expect(ai.confirmTask(ctx, task.id)).rejects.toThrow();
    expect(writes).toBe(boundary === "asset" ? 1 : 0);
    expect(await fixture.db.select().from(materialLinks)).toHaveLength(0);
    expect((await ai.getTask(ctx, task.id)).status).toBe(
      "awaiting_confirmation",
    );
  },
);
it("第二条真实资产不存在导致第一条已写边回滚", async () => {
  const task = await record(
    "material.match",
    {},
    "material_link_list",
    { matches: [{ assetId: "asset" }, { assetId: "missing" }] },
    "project",
  );
  await expect(ai.confirmTask(ctx, task.id)).rejects.toThrow();
  expect(writes).toBe(1);
  expect(await fixture.db.select().from(materialLinks)).toHaveLength(0);
  expect((await ai.getTask(ctx, task.id)).status).toBe("awaiting_confirmation");
});

it("候选冻结后素材已删除，第二条不可采纳且整批回滚", async () => {
  const task = await record(
    "material.match",
    {},
    "material_link_list",
    { matches: [{ assetId: "asset" }, { assetId: "asset-2" }] },
    "project",
  );
  await fixture.db
    .update(assets)
    .set({ status: "deleted" })
    .where(eq(assets.id, "asset-2"));
  await expect(ai.confirmTask(ctx, task.id)).rejects.toThrow();
  expect(writes).toBe(1);
  expect(await fixture.db.select().from(materialLinks)).toHaveLength(0);
  expect((await ai.getTask(ctx, task.id)).status).toBe("awaiting_confirmation");
});

it("旧任务逐项已采纳边被用户删除后，恢复不会重建该边", async () => {
  const links = createMaterialLinksService({ db: fixture.db, now, nextId });
  const task = await record(
    "material.match",
    {},
    "material_link_list",
    {
      matches: [
        { assetId: "asset", role: "clip" },
        { assetId: "asset-2", role: "clip" },
      ],
    },
    "project",
  );
  await expect(legacyAi.confirmTask(ctx, task.id)).rejects.toThrow(
    "LEGACY_SECOND_LINK_FAILED",
  );
  const [old] = await fixture.db.select().from(materialLinks);
  expect(old?.entityId).toBe("asset");
  await links.delete(ctx, old!.id);
  expect((await ai.confirmTask(ctx, task.id)).status).toBe("succeeded");
  const rows = await fixture.db.select().from(materialLinks);
  expect(rows.map((row) => row.entityId)).toEqual(["asset-2"]);
});
