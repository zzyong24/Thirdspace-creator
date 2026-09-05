import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDb, assets, knowledgeItems, knowledgeAdoptions, assetTagAdoptions, entityTags, aiTasks, eq } from "@creatoros/backend";
import type { RequestContext, AgenticProposal } from "@creatoros/contract";
const interleave = vi.hoisted(() => ({ beforeMappedUpdate: undefined as undefined | (() => Promise<void>) }));
vi.mock("./ai.repository", async original => {
  const actual = await original<typeof import("./ai.repository")>();
  return { ...actual, createAiRepository: (...args: Parameters<typeof actual.createAiRepository>) => {
    const repo = actual.createAiRepository(...args);
    return { ...repo, async updateMappedTaskStatus(...input: Parameters<typeof repo.updateMappedTaskStatus>) {
      await interleave.beforeMappedUpdate?.();
      return repo.updateMappedTaskStatus(...input);
    } };
  } };
});
import { createPersistentTaskService } from "../execution/persistent-task.service";
import { createAiService } from "./ai.service";
import { createAgenticProposalAdoptionService } from "./agentic-proposal-adoption.service";
import { createKnowledgeProposalAdoptionService, prepareKnowledgeProposal } from "../knowledge";
import { createAssetTagProposalService } from "../taxonomy";

const ctx: RequestContext = { userId: "u", accountId: "a", requestId: "r", source: "user" };
describe("公开AI确认入口的自主候选原子采纳", () => {
  let fixture: Awaited<ReturnType<typeof createDb>>;
  let ai: ReturnType<typeof createAiService>;
  let assetTags: ReturnType<typeof createAssetTagProposalService>;
  let failAfterKnowledge = false;
  const now = () => "2026-09-05T12:00:00.000Z";
  beforeEach(async () => {
    fixture = await createDb(); let serial = 0;
    const nextId = (prefix: string) => `${prefix}-${++serial}`;
    const notUsed = vi.fn(async (): Promise<never> => { throw new Error("UNEXPECTED_EXTERNAL_ACTION"); });
    const knowledge = createKnowledgeProposalAdoptionService(fixture.db, now);
    assetTags = createAssetTagProposalService(fixture.db, { now, nextId });
    const adoption = createAgenticProposalAdoptionService(fixture.db, {
      async knowledge(c, p, tx) { const result = await knowledge.adopt(c, p, tx); if (failAfterKnowledge) throw new Error("INJECTED_FAILURE"); return result; },
      assetTagsBatch: (c, p, tx) => assetTags.adoptBatch(c, p, tx),
    }, now);
    ai = createAiService({ db: fixture.db, now, nextId, agenticProposals: adoption,
      artifacts: { createVersion: notUsed }, knowledge: { createKnowledge: notUsed }, candidate: { createFromAIResult: notUsed, enrichCard: notUsed },
      learnings: { createLearning: notUsed }, publishing: { createPublicationFromDraft: notUsed }, materialLinks: { link: notUsed },
      positioning: { upsertProfile: notUsed, createStatementVersion: notUsed }, calibration: { createDraftPrediction: notUsed },
    });
    failAfterKnowledge = false; interleave.beforeMappedUpdate = undefined;
  });
  afterEach(async () => { await fixture.client.close(); });
  const task = () => ai.createTask(ctx, { taskType: "exec.agentic.research", inputData: { goal: "调查" } });
  const knowledgeCandidate = (taskId: string, proposalId = "knowledge-1") => prepareKnowledgeProposal(ctx, { proposalId, title: "候选知识", note: "可回读正文", sourceNote: "https://example.com",
    source: { taskId, toolCallId: "call-knowledge", evidenceRefs: ["https://example.com"] } });
  const record = async (taskId: string, proposals: AgenticProposal[]) => {
    await ai.markRunning(ctx, taskId);
    await ai.recordCandidate(ctx, taskId, { resultType: "agentic_proposals", resultData: { proposals } });
  };
  it("确认前没有领域写入，并发确认/响应重试只产生一份知识", async () => {
    const created = await task(); await record(created.id, [knowledgeCandidate(created.id)]);
    expect(await fixture.db.select().from(knowledgeItems)).toHaveLength(0);
    const results = await Promise.all(Array.from({ length: 10 }, () => ai.confirmTask(ctx, created.id)));
    expect(results.every(r => r.status === "succeeded")).toBe(true);
    expect((await ai.confirmTask(ctx, created.id)).status).toBe("succeeded");
    expect(await fixture.db.select().from(knowledgeItems)).toHaveLength(1);
    expect((await ai.listResults(ctx, created.id))[0]?.resultData).toHaveProperty("adoptionReceipts");
  });
  it("领域写后异常回滚整批、回执和任务状态，可沿原候选重试", async () => {
    const created = await task(); await record(created.id, [knowledgeCandidate(created.id)]); failAfterKnowledge = true;
    await expect(ai.confirmTask(ctx, created.id)).rejects.toThrow("INJECTED_FAILURE");
    expect(await fixture.db.select().from(knowledgeItems)).toHaveLength(0);
    expect(await fixture.db.select().from(knowledgeAdoptions)).toHaveLength(0);
    expect((await ai.getTask(ctx, created.id)).status).toBe("awaiting_confirmation");
    failAfterKnowledge = false; expect((await ai.confirmTask(ctx, created.id)).status).toBe("succeeded");
  });
  it("已取消任务、跨账号及伪造来源不能采纳", async () => {
    const created = await task(); await record(created.id, [knowledgeCandidate("other-parent")]);
    await expect(ai.confirmTask(ctx, created.id)).rejects.toThrow("来源");
    await expect(ai.confirmTask({ ...ctx, accountId: "other" }, created.id)).rejects.toThrow();
    await ai.cancelTask(ctx, created.id);
    await expect(ai.confirmTask(ctx, created.id)).rejects.toThrow("不可采纳");
    expect(await fixture.db.select().from(knowledgeItems)).toHaveLength(0);
  });
  it("混合知识与标签候选在同一事务采纳", async () => {
    const created = await task();
    await fixture.db.insert(assets).values({ id: "asset", userId: ctx.userId, accountId: ctx.accountId!, name: "素材", assetType: "image", createdAt: now(), updatedAt: now() });
    const material: AgenticProposal = { schemaVersion: 1, kind: "asset.tags", proposalId: "tag-1", source: { taskId: created.id, toolCallId: "call-tags", evidenceRefs: ["asset"] }, targets: await assetTags.prepare(ctx, ["asset"]), tag: "示例标签" };
    await record(created.id, [knowledgeCandidate(created.id), material, { ...material, proposalId: "tag-2", tag: "第二标签" }]);
    expect((await ai.confirmTask(ctx, created.id)).status).toBe("succeeded");
    expect(await fixture.db.select().from(knowledgeItems)).toHaveLength(1);
    expect(await fixture.db.select().from(entityTags)).toHaveLength(2);
    expect(await fixture.db.select().from(assetTagAdoptions)).toHaveLength(2);
  });
  it("已映射候选的迟到取消不能覆盖确认成功", async () => {
    const created = await task(); await record(created.id, [knowledgeCandidate(created.id)]);
    const persistent = createPersistentTaskService(fixture.db);
    const execution = await persistent.enqueue(ctx, { kind: "ai_task", ownerType: "ai_task", ownerId: created.id, idempotencyKey: "mapped-fixture", payload: {} });
    const claim = await persistent.claimTask({ taskId: execution.id, workerId: "fixture" });
    if (!claim) throw new Error("missing claim");
    await persistent.finish({ taskId: execution.id, workerId: claim.lease.workerId, attempt: claim.lease.attempt, status: "succeeded" });
    await fixture.db.update(aiTasks).set({ executionTaskId: execution.id }).where(eq(aiTasks.id, created.id));
    let entered!: () => void; let release!: () => void;
    const reached = new Promise<void>(resolve => { entered = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    interleave.beforeMappedUpdate = async () => { entered(); await gate; };
    const cancellation = ai.cancelTask(ctx, created.id);
    const rejected = expect(cancellation).rejects.toThrow("状态已变化");
    await reached;
    expect((await ai.confirmTask(ctx, created.id)).status).toBe("succeeded");
    release(); await rejected;
    expect((await ai.getTask(ctx, created.id)).status).toBe("succeeded");
    expect(await fixture.db.select().from(knowledgeItems)).toHaveLength(1);
    interleave.beforeMappedUpdate = undefined;
  });

});
