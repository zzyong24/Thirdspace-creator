import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { accountGroups } from "../../schema/account-groups";
import type { RequestContext } from "@creatoros/contract";
import {
  candidates, createDb, eq, executionTasks, intelligenceItems,
  intelligenceSources, intelligenceSyncRuns, itemTranscripts, projects,
  sourceSnapshots, topicPromotions, type Db,
} from "../../index";
import { createIntelligenceService } from "../../modules/intelligence/intelligence.service";
import { createCandidateService } from "../../modules/candidate/candidate.service";
import { createProjectRepository, createProjectsService } from "../../modules/projects";
import * as execution from "../../modules/execution";

vi.setConfig({ testTimeout: 180000, hookTimeout: 180000 });
const stamp = "2026-10-20T15:00:00.000Z";
const ctx: RequestContext = { userId: "intake-ports-user", groupId: "intake-ports-group", accountId: null, requestId: "intake-ports", source: "user" };
let opened: Awaited<ReturnType<typeof createDb>>;
let seq = 0;
const deps = { now: () => stamp, nextId: (prefix: string) => `${prefix}-intake-ports-${++seq}` };
beforeEach(async () => {
  opened = await createDb();
  seq = 0;
  await opened.db.insert(accountGroups).values(["intake-ports-group", "intake-ports-other"].map(id => ({ id, userId: ctx.userId, name: id, createdAt: stamp, updatedAt: stamp })));
});
afterEach(async () => { await opened?.client.close(); });
const projectFor = (store: Db) => createProjectsService(createProjectRepository(store), deps);
const candidateFor = (store: Db) => createCandidateService({ db: store, ...deps, projects: projectFor(store), ingestion: { assertRunExists: async () => {} } });
const intelligenceFor = (store: Db) => createIntelligenceService(store, { ...deps, tasks: execution.createPersistentTaskService(store, deps) });

/** 中性存储夹具：真实 item/snapshot/source/run 外键身份，未运行采集、模型或供应商。 */
async function sourceFixture(id = "intake-ports-item") {
  const owner = { userId: ctx.userId, groupId: ctx.groupId!, accountId: null };
  await opened.db.insert(intelligenceSources).values({ ...owner, id: `source-${id}`, type: "rss", platform: "web", displayName: "隔离来源", externalKey: `fixture-${id}`, createdAt: stamp, updatedAt: stamp });
  await opened.db.insert(intelligenceSyncRuns).values({ ...owner, id: `run-${id}`, sourceId: `source-${id}`, executionTaskId: `fixture-source-task-${id}`, trigger: "manual", status: "succeeded_with_items", createdAt: stamp, updatedAt: stamp });
  await opened.db.insert(intelligenceItems).values({ ...owner, id, type: "article", platform: "web", canonicalUrl: `https://example.test/${id}`, canonicalUrlHash: `url-${id}`, title: "来源原标题", capturedAt: stamp, createdAt: stamp, updatedAt: stamp });
  await opened.db.insert(sourceSnapshots).values({ ...owner, id: `snapshot-${id}`, itemId: id, sourceId: `source-${id}`, runId: `run-${id}`, finalUrl: `https://example.test/${id}`, capturedAt: stamp, contentHash: `content-${id}`, safeExtract: "隔离来源正文" });
  return { id, snapshotId: `snapshot-${id}` };
}

it("纯组来源只读真实快照，不补 transcript、不写项目或任务；后补正文摘要按真实版本变化", async () => {
  const source = await sourceFixture();
  const read = () => opened.db.transaction(tx => intelligenceFor(tx as unknown as Db).getProjectIntakeSource(ctx, source.id));
  const first = await read();
  expect(first).toMatchObject({ title: "来源原标题", itemId: source.id, snapshotId: source.snapshotId, bodyAvailable: true, transcriptHash: null });
  expect(await opened.db.select().from(itemTranscripts)).toEqual([]);
  expect(await opened.db.select().from(executionTasks)).toEqual([]);
  expect(await opened.db.select().from(projects)).toEqual([]);
  await opened.db.insert(itemTranscripts).values({ itemId: source.id, userId: ctx.userId, groupId: ctx.groupId!, accountId: null, status: "done", text: "  真实逐字稿  ", updatedAt: stamp });
  const next = await read();
  expect(next.transcriptHash).toBe(`sha256:${createHash("sha256").update("真实逐字稿").digest("hex")}`);
  expect(next.sourceDigest).not.toBe(first.sourceDigest);
  expect(await read()).toEqual(next);
});

it("来源口最新快照排序与显式版本读取保留，异 item 快照及异组/异用户拒绝", async () => {
  const source = await sourceFixture(), other = await sourceFixture("intake-ports-item-other");
  const [old] = await opened.db.select().from(sourceSnapshots).where(eq(sourceSnapshots.id, source.snapshotId));
  await opened.db.insert(sourceSnapshots).values({ ...old!, id: "new-snapshot", capturedAt: "2026-10-20T15:01:00.000Z", contentHash: "new-content", safeExtract: null });
  const service = intelligenceFor(opened.db);
  expect((await service.getProjectIntakeSource(ctx, source.id)).snapshotId).toBe("new-snapshot");
  expect((await service.getProjectIntakeSource(ctx, source.id, source.snapshotId)).snapshotId).toBe(source.snapshotId);
  await expect(service.getProjectIntakeSource(ctx, source.id, other.snapshotId)).rejects.toThrow();
  for (const denied of [{ ...ctx, userId: "foreign-user" }, { ...ctx, groupId: "intake-ports-other" }]) await expect(service.getProjectIntakeSource(denied, source.id)).rejects.toThrow();
});

it("快照 source/run 真实祖先损坏不能仅凭同组 item 读取", async () => {
  const source = await sourceFixture();
  await opened.db.update(sourceSnapshots).set({ runId: "missing-run" }).where(eq(sourceSnapshots.id, source.snapshotId));
  await expect(intelligenceFor(opened.db).getProjectIntakeSource(ctx, source.id)).rejects.toThrow();
  await expect(intelligenceFor(opened.db).getProjectIntakeSource(ctx, source.id, source.snapshotId)).rejects.toThrow();
  expect(await opened.db.select().from(itemTranscripts)).toEqual([]);
});

it("选题 intake 只接受真实事务，锁读与同项目提交幂等且不把候选正文写进项目", async () => {
  const candidate = await candidateFor(opened.db).createCandidate(ctx, { title: "明确选择的选题", card: { oneLiner: "用户已选观点" } });
  const project = await projectFor(opened.db).createProject(ctx, { title: "已有项目", brief: "已有正式资料" });
  await expect(candidateFor(opened.db).getProjectIntakeCandidate(ctx, candidate.id)).rejects.toThrow("事务");
  await expect(candidateFor(opened.db).commitProjectIntakePromotion(ctx, candidate.id, project.id)).rejects.toThrow("事务");
  const read = await opened.db.transaction(tx => candidateFor(tx as unknown as Db).getProjectIntakeCandidate(ctx, candidate.id));
  expect(read).toMatchObject({ candidate: { id: candidate.id, title: candidate.title }, promotion: null });
  const commit = () => opened.db.transaction(tx => candidateFor(tx as unknown as Db).commitProjectIntakePromotion(ctx, candidate.id, project.id));
  const first = await commit();
  expect(await commit()).toEqual(first);
  expect(await opened.db.select().from(topicPromotions)).toHaveLength(1);
  expect((await candidateFor(opened.db).getCandidate(ctx, candidate.id)).status).toBe("promoted");
  expect(await projectFor(opened.db).getProject(ctx, project.id)).toEqual(project);
});

it("选题回执异项目冲突、跨组项目拒绝；失败不改原关系", async () => {
  const candidate = await candidateFor(opened.db).createCandidate(ctx, { title: "测试选题" });
  const first = await projectFor(opened.db).createProject(ctx, { title: "原项目" });
  const second = await projectFor(opened.db).createProject(ctx, { title: "另一项目" });
  const other = await projectFor(opened.db).createProject({ ...ctx, groupId: "intake-ports-other" }, { title: "其它组项目" });
  await expect(opened.db.transaction(tx => candidateFor(tx as unknown as Db).commitProjectIntakePromotion(ctx, candidate.id, other.id))).rejects.toThrow();
  expect(await opened.db.select().from(topicPromotions)).toEqual([]);
  await opened.db.transaction(tx => candidateFor(tx as unknown as Db).commitProjectIntakePromotion(ctx, candidate.id, first.id));
  await expect(opened.db.transaction(tx => candidateFor(tx as unknown as Db).commitProjectIntakePromotion(ctx, candidate.id, second.id))).rejects.toThrow("另一项目");
  expect((await opened.db.select().from(topicPromotions)).map(row => row.projectId)).toEqual([first.id]);
});

it("外层事务失败回滚选题状态和 promotion；已升级但缺回执不擅建第二关联", async () => {
  const candidate = await candidateFor(opened.db).createCandidate(ctx, { title: "回滚选题" });
  const project = await projectFor(opened.db).createProject(ctx, { title: "回滚目标" });
  await expect(opened.db.transaction(async tx => {
    await candidateFor(tx as unknown as Db).commitProjectIntakePromotion(ctx, candidate.id, project.id);
    throw new Error("INTAKE_PORT_ROLLBACK");
  })).rejects.toThrow("INTAKE_PORT_ROLLBACK");
  expect(await opened.db.select().from(topicPromotions)).toEqual([]);
  expect((await candidateFor(opened.db).getCandidate(ctx, candidate.id)).status).toBe("pool");
  await opened.db.update(candidates).set({ status: "promoted" }).where(eq(candidates.id, candidate.id));
  await expect(opened.db.transaction(tx => candidateFor(tx as unknown as Db).getProjectIntakeCandidate(ctx, candidate.id))).rejects.toThrow("关联缺失");
});

async function legacyTask(id: string, patch: Partial<typeof executionTasks.$inferInsert> = {}) {
  await opened.db.insert(executionTasks).values({ id, userId: ctx.userId, groupId: ctx.groupId!, accountId: null, kind: "radar_project_upgrade", ownerType: "item", ownerId: "legacy-item", payload: { itemId: "legacy-item" }, status: "cancelled", idempotencyKey: id, createdAt: stamp, updatedAt: stamp, ...patch });
}

it("旧雷达查找读全 25 条原父身份及 checkpoint，保纯组与零写入", async () => {
  for (let index = 0; index < 25; index++) await legacyTask(`legacy-parent-${String(index).padStart(2, "0")}`, index === 24 ? { checkpoint: { projectId: "original-project" } } : {});
  const before = await opened.db.select().from(executionTasks);
  const lookup = execution.createLegacyRadarProjectLookupService(opened.db);
  const result = await lookup.listForItem(ctx, "legacy-item");
  expect(result).toHaveLength(25);
  expect(result[0]).toMatchObject({ groupId: ctx.groupId, accountId: null, itemId: "legacy-item", projectId: null });
  expect(result[24]?.projectId).toBe("original-project");
  expect(await lookup.listForItem({ ...ctx, groupId: "intake-ports-other" }, "legacy-item")).toEqual([]);
  expect(await lookup.listForItem({ ...ctx, userId: "foreign-user" }, "legacy-item")).toEqual([]);
  expect(await opened.db.select().from(executionTasks)).toEqual(before);
});

it.each(["ownerType", "ownerId", "payload", "checkpoint"] as const)("旧雷达 %s 来源回执损坏必须报冲突，不能当成没有旧项目", async variant => {
  await legacyTask("broken-parent", variant === "ownerType" ? { ownerType: "project" } : variant === "ownerId" ? { ownerId: "wrong-item" } : variant === "payload" ? { payload: { itemId: "wrong-item" } } : { checkpoint: { projectId: 42 } });
  await expect(execution.createLegacyRadarProjectLookupService(opened.db).listForItem(ctx, "legacy-item")).rejects.toThrow("回执");
  expect(await opened.db.select().from(executionTasks)).toHaveLength(1);
});
