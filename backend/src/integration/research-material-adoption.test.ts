import {platformAccounts as originalAccounts,type Db as OwnedFixtureDb} from "@creatoros/backend";
import {createAccountGroupService} from "../modules/platform-account/account-group.service";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import {
  createDb,
  type Db,
  knowledgeItems,
  knowledgeRevisions,
  materialLinks,
  projects,
  aiTasks,
  aiTaskResults,
  executionTasks,
  eq,
} from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import { createResearchMaterialAdoptionService } from "../modules/ai/research-material-adoption.service";
import { createAiService } from "../modules/ai/ai.service";
import { createKnowledgeService } from "../modules/knowledge/knowledge.service";
import { createKnowledgeRepository } from "../modules/knowledge/knowledge.repository";
import { createMaterialLinksService } from "../modules/material-links/material-links.service";
import { createProjectsService } from "../modules/projects/projects.service";
import { createProjectRepository } from "../modules/projects/projects.repository";
const ctx: RequestContext = {
  userId: "u",
  accountId: "a",
  requestId: "r",
  source: "user",
};
const now = () => "2026-09-06T00:00:00.000Z";
let serial = 0;
const nextId = (p: string) => `${p}-${++serial}`;
const unused = vi.fn(async (): Promise<never> => {
  throw new Error("UNEXPECTED_PORT");
});
const knowledge = (db: Db) =>
  createKnowledgeService(createKnowledgeRepository(db, { now, nextId }));
let f: Awaited<ReturnType<typeof createDb>>,
  ai: ReturnType<typeof createAiService>;
let failLink = false;
let legacyAi: ReturnType<typeof createAiService>;
beforeEach(async () => {
  f = await createDb();
  await seedOwnedKnowledgeAccount(f.db,"u","a");
  await seedOwnedKnowledgeAccount(f.db,"u","other");
  serial = 0;
  failLink = false;
  await f.db
    .insert(projects)
    .values(
      ["project", "foreign"].map((id) => ({
        id,
        userId: "u",
        accountId: id === "project" ? "a" : "other",
        groupId: `grp_legacy_${id === "project" ? "a" : "other"}`,
        title: id,
        creationMode: "manual",
        status: "active",
        currentStage: "brief",
        startedAt: now(),
        createdAt: now(),
        updatedAt: now(),
      })),
    );
  const k = knowledge(f.db),
    links = createMaterialLinksService({ db: f.db, now, nextId });
  const adoption = createResearchMaterialAdoptionService(
    f.db,
    {
      assertProject: async (c, id, tx) => {
        await createProjectsService(
          createProjectRepository(tx as unknown as Db),
          { now, nextId },
        ).listOutputIdsByProject(c, id);
      },
      createKnowledge: (c, input, tx) =>
        knowledge(tx as unknown as Db).createKnowledge(c, input),
      linkKnowledge: async (c, input, tx) => {
        const db = tx as unknown as Db;
        const result = await createMaterialLinksService({
          db,
          now,
          nextId,
          assertProjectOwned: async (context, id) => {
            await createProjectsService(createProjectRepository(db), {
              now,
              nextId,
            }).listOutputIdsByProject(context, id);
          },
          assertKnowledgeOwned: (context, id) =>
            knowledge(db).getKnowledge(context, id),
        }).create(c, input);
        if (failLink) throw new Error("LINK_FAILED");
        return result;
      },
    },
    now,
  );
  const aiDeps: Parameters<typeof createAiService>[0] = {
    db: f.db,
    now,
    nextId,
    researchMaterials: adoption,
    artifacts: { createVersion: unused },
    knowledge: { createKnowledge: (c, i) => k.createKnowledge(c, i) },
    candidate: { createFromAIResult: unused, enrichCard: unused },
    learnings: { createLearning: unused },
    publishing: { createPublicationFromDraft: unused },
    materialLinks: {
      link: async (c, i) => {
        if (failLink) throw new Error("LINK_FAILED");
        return links.create(c, i);
      },
    },
    positioning: { upsertProfile: unused, createStatementVersion: unused },
    calibration: { createDraftPrediction: unused },
  };
  ai = createAiService(aiDeps);
  legacyAi = createAiService({
    ...aiDeps,
    researchMaterials: undefined,
    knowledge: {
      createKnowledge: async (c, input) => {
        if (input.title === "第二条") throw new Error("LEGACY_SECOND_FAILED");
        return k.createKnowledge(c, input);
      },
    },
  });
});
afterEach(async () => {
  await f.client.close();
});
const item = {
  title: "案例：真实候选",
  url: "",
  source: "模型记忆,需核实",
  why_relevant: "可作为讨论角度",
};
async function task(
  items: unknown[] = [item],
  projectId: string | null = "project",
  historicalForeign = false,
) {
  // 旧数据回读族：明确历史未采纳任务，不冒充当前公共创建可越权。
  const input={taskType:"research.gather_material",attemptId:nextId("research-material-attempt"),inputData:{topic:"主题",projectId}};
  let t;
  if(historicalForeign){
    const before=await f.db.select().from(aiTasks);
    await expect(ai.createTask(ctx,input)).rejects.toThrow();
    expect(await f.db.select().from(aiTasks)).toEqual(before);
    expect(await f.db.select().from(knowledgeItems)).toHaveLength(0);expect(await f.db.select().from(materialLinks)).toHaveLength(0);
    const id=nextId("historical-unadopted-task");
    await f.db.insert(aiTasks).values({id,userId:ctx.userId,accountId:ctx.accountId,groupId:`grp_legacy_${ctx.accountId}`,projectId,taskType:input.taskType,status:"queued",inputData:input.inputData,attemptId:input.attemptId,idempotencyKey:id,requestedAt:now()});
    t=await ai.getTask(ctx,id);
  }else t=await ai.createTask(ctx,input);
  await ai.markRunning(ctx, t.id);
  await ai.recordCandidate(ctx, t.id, {
    resultType: "material_list",
    resultData: { items },
  });
  return t;
}
it("并发采纳与成功回执重放仅创建一份知识和链接", async () => {
  const t = await task();
  await Promise.all([ai.confirmTask(ctx, t.id), ai.confirmTask(ctx, t.id)]);
  expect((await ai.confirmTask(ctx, t.id)).status).toBe("succeeded");
  expect(await f.db.select().from(knowledgeItems)).toHaveLength(1);
  expect(await f.db.select().from(materialLinks)).toHaveLength(1);
});
it("链接失败回滚已创建知识和首版", async () => {
  const t = await task();
  failLink = true;
  await expect(ai.confirmTask(ctx, t.id)).rejects.toThrow("LINK_FAILED");
  expect(await f.db.select().from(knowledgeItems)).toHaveLength(0);
  expect(await f.db.select().from(knowledgeRevisions)).toHaveLength(0);
});
it("空候选不可假成功", async () => {
  const t = await task([]);
  await expect(ai.confirmTask(ctx, t.id)).rejects.toThrow();
  expect((await ai.getTask(ctx, t.id)).status).toBe("awaiting_confirmation");
});

it("跨账号项目拒绝且知识和链接均为零", async () => {
  const t = await task([item], "foreign",true);
  await expect(ai.confirmTask(ctx, t.id)).rejects.toThrow();
  expect(await f.db.select().from(knowledgeItems)).toHaveLength(0);
  expect(await f.db.select().from(materialLinks)).toHaveLength(0);
});
it("无项目生成素材仍可采纳为独立知识", async () => {
  const t = await task([item], null);
  await ai.confirmTask(ctx, t.id);
  expect(await f.db.select().from(knowledgeItems)).toHaveLength(1);
  expect(await f.db.select().from(materialLinks)).toHaveLength(0);
});
it("成功后用户归档知识并删除边，回执重放不重建", async () => {
  const t = await task();
  await ai.confirmTask(ctx, t.id);
  const [k] = await f.db.select().from(knowledgeItems),
    [link] = await f.db.select().from(materialLinks);
  await knowledge(f.db).archiveKnowledge(ctx, k!.id);
  await createMaterialLinksService({ db: f.db, now, nextId }).delete(
    ctx,
    link!.id,
  );
  await ai.confirmTask(ctx, t.id);
  expect(
    (await f.db.select().from(knowledgeItems)).map((k) => k.status),
  ).toEqual(["archived"]);
  expect(await f.db.select().from(materialLinks)).toHaveLength(0);
});
it("真实旧部分采纳journal保留用户归档删除，恢复只新增未采纳项", async () => {
  const t = await task([item, { ...item, title: "第二条" }]);
  await expect(legacyAi.confirmTask(ctx, t.id)).rejects.toThrow(
    "LEGACY_SECOND_FAILED",
  );
  const [k] = await f.db.select().from(knowledgeItems),
    [link] = await f.db.select().from(materialLinks);
  await knowledge(f.db).archiveKnowledge(ctx, k!.id);
  await createMaterialLinksService({ db: f.db, now, nextId }).delete(
    ctx,
    link!.id,
  );
  await ai.confirmTask(ctx, t.id);
  expect(
    (await f.db.select().from(knowledgeItems)).map((k) => [k.title, k.status]),
  ).toEqual([
    [item.title, "archived"],
    ["第二条", "active"],
  ]);
  expect(await f.db.select().from(materialLinks)).toHaveLength(1);
});
async function map(t: { id: string }, grounding = "model_memory") {
  const id = nextId("execution");
  await f.db
    .insert(executionTasks)
    .values({
      id,
      userId: "u",
      accountId: "a",
      kind: "ai_task",
      ownerType: "ai_task",
      ownerId: t.id,
      idempotencyKey: id,
      payload: {
        aiTaskId: t.id,
        modelInput: {
          facets: {
            __researchGather: JSON.stringify({
              topic: "主题",
              projectId: "project",
              grounding,
            }),
          },
        },
      },
      createdAt: now(),
      updatedAt: now(),
    });
  await f.db
    .update(aiTasks)
    .set({ executionTaskId: id })
    .where(eq(aiTasks.id, t.id));
}
it("冻结为model_memory，模型自报来源不能升级成web", async () => {
  const t = await task([
    { ...item, url: "https://claimed.example/", source: "模型声称已验证" },
  ]);
  await map(t);
  await ai.confirmTask(ctx, t.id);
  const [row] = await f.db.select().from(knowledgeItems);
  expect(row).toMatchObject({
    sourceType: "ai",
    sourceNote: "模型生成，未联网核实",
    sourceUrl: null,
    sourceMetadata: { grounding: "model_memory", taskId: t.id },
  });
  const result = await knowledge(f.db).getKnowledge(ctx, row!.id);
  expect(result.sourceType).toBe("ai");
  expect(await f.db.select().from(knowledgeRevisions)).toHaveLength(1);
});
it("无合法冻结来源不可采纳", async () => {
  const t = await task();
  await map(t, "web");
  await expect(ai.confirmTask(ctx, t.id)).rejects.toThrow("冻结");
  expect(await f.db.select().from(knowledgeItems)).toHaveLength(0);
});

async function seedOwnedKnowledgeAccount(db:OwnedFixtureDb,userId:string,accountId:string){
 const stamp="2026-06-21T00:00:00.000Z";
 await db.insert(originalAccounts).values({id:accountId,userId,platform:'douyin',accountHandle:accountId,createdAt:stamp,updatedAt:stamp}).onConflictDoNothing();
 await createAccountGroupService({db,now:()=>stamp,nextId:prefix=>`${prefix}-${accountId}-fixture`}).ensureLegacyGroups({userId,requestId:'original-knowledge-fixture',source:'user'});
}
