import { createServer } from "node:http";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { beforeAll, afterAll, expect, it, vi } from "vitest";
import { createDb, eq, executionCalls, intelligenceItems, itemTranscripts, sourceSnapshots, type Db } from "@creatoros/backend";
import { INTELLIGENCE_TOPIC_ADAPTED_DRAFT_TEMPLATE as template } from "@creatoros/ai-worker";
import { ENDPOINTS, type RequestContext } from "@creatoros/contract";
import { createPersistentTaskService, type PersistentTaskClaim } from "../execution/persistent-task.service";
import { createIntelligenceGenerationBridge } from "./intelligence-generation-bridge";
import { createIntelligenceService } from "./intelligence.service";
import { runIntelligenceTopicPreviewTask } from "./topic-preview-runner";
import { createCandidateService } from "../candidate/candidate.service";
import { createProjectsService, createProjectRepository } from "../projects";
import { createProjectIntelligenceReferenceService } from "./project-reference.service";
import { assembleCreativeContext } from "../ai-runtime/creative-context";

const ctx: RequestContext = { userId: "t1017-user", accountId: "t1017-account", requestId: "t1017-test", source: "user" };
let db: Db, close: () => Promise<void>, seq = 0;
const deps = { now: () => new Date().toISOString(), nextId: (prefix: string) => `${prefix}-t1017-${++seq}` };
const sourceText = "很多团队把精力放在追逐新模型上，交付却没有变稳定。先看业务输入，再看责任边界，最后选择模型。";
const generatedText = "先把业务输入和责任边界说清楚，再选择适合的模型。工具的能力要放进能够稳定交付的流程里，才有价值。";
const editedText = "我采纳时编辑的正文：先把流程跑通，再选择工具。";
beforeAll(async () => {
  const connection = await createDb(); db = connection.db; close = () => connection.client.close();
  execFileSync(process.execPath, [resolve("../ai-worker/scripts/build.mjs")], { stdio: "pipe" });
}, 30000);
afterAll(async () => close?.());

async function setup(personalized: boolean, raceClaim = false) {
  const tag = `case-${++seq}`, itemId = `${tag}-item`, sourceSnapshotId = `${tag}-snapshot`;
  const stamp = deps.now(), url = `https://example.com/${tag}`;
  await db.insert(intelligenceItems).values({ id: itemId, userId: ctx.userId, accountId: ctx.accountId!, type: "article", platform: "example.com", canonicalUrl: url, canonicalUrlHash: tag, title: "真实来源标题", capturedAt: stamp, createdAt: stamp, updatedAt: stamp, availability: "available" });
  await db.insert(sourceSnapshots).values({ id: sourceSnapshotId, userId: ctx.userId, accountId: ctx.accountId!, sourceId: `${tag}-source`, runId: `${tag}-run`, itemId, capturedAt: stamp, finalUrl: url, title: "真实来源标题", contentHash: `${tag}-hash`, privacyClass: "public" });
  await db.insert(itemTranscripts).values({ itemId, userId: ctx.userId, accountId: ctx.accountId!, status: "done", text: sourceText, source: "manual", completedAt: stamp, updatedAt: stamp });
  let currentPositioning = personalized ? { id: "current-positioning", oneLiner: "帮助小团队用好 AI", keywords: ["业务流程"], masterSnapshot: { persona: "务实顾问", field: "AI 落地", audience: "小团队负责人", differentiation: "关注交付", capabilities: ["流程诊断"], facets: { tone: "短句" }, downstreamRules: { privacy: "不披露客户" } } } : null;
  const projects = createProjectsService(createProjectRepository(db), deps);
  const candidate = createCandidateService({ db, ...deps, projects, ingestion: { assertRunExists: async () => {} } });
  let failAdoption = false, failAfterCommit = false;
  const createTopic = vi.fn(async (context, input) => {
    if (failAdoption) throw new Error("fixture-write-failed");
    const result = await candidate.createCandidate(context, input);
    if (failAfterCommit) { failAfterCommit = false; throw new Error("fixture-confirm-response-lost"); }
    return { id: result.id, adoptedTitle: result.title, adoptedDraftContentText: result.card.adaptedDraft?.contentText };
  });
  const getVersion = vi.fn(async () => { throw new Error("不能读取客户端陈旧定位"); });
  const baseTasks = createPersistentTaskService(db, deps);
  let admittedClaim: PersistentTaskClaim | undefined;
  const tasks = { ...baseTasks, enqueue: async (...args: Parameters<typeof baseTasks.enqueue>) => {
    const task = await baseTasks.enqueue(...args);
    if (raceClaim && args[1].kind === "topic_preview") {
      admittedClaim = (await baseTasks.claimTask({ taskId: task.id, workerId: "queue-race-fixture" })) ?? undefined;
      // 在 enqueue 尚未返回、组合层尚未回填 aiTaskId 时模拟 recovery 抢到任务。
      expect(admittedClaim).toBeDefined();
      const target = await intelligence.getTopicPreviewForExecution(ctx, task.id);
      expect(target.transcript.text).toBe(sourceText);
    }
    return task;
  } };
  const intelligence = createIntelligenceService(db, { ...deps, tasks, positioning: { getVersion, getCurrentSnapshot: async () => currentPositioning }, topics: { create: createTopic } });
  const preview = await intelligence.startTopicPreview(ctx, { itemId, sourceSnapshotId, positioningVersionId: "stale-client-positioning", idempotencyKey: `${tag}-preview` });
  // 任务建立以后修改当前定位，模型仍应消费冻结版本。
  currentPositioning = null;
  let responseText = generatedText, responseStatus = 200;
  const requests: Array<Record<string, unknown>> = [];
  const server = createServer((req, res) => {
    let body = ""; req.on("data", chunk => { body += chunk; });
    req.on("end", () => {
      requests.push(JSON.parse(body));
      if (responseStatus !== 200) { res.writeHead(responseStatus, { "content-type": "application/json" }); res.end(JSON.stringify({ error: { message: "fixture failure", type: "server_error" } })); return; }
      const base = { id: tag, object: "chat.completion.chunk", created: 1, model: "fixture" };
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.end(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: { role: "assistant", content: responseText }, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 } })}\n\ndata: [DONE]\n\n`);
    });
  });
  await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
  const skills = vi.fn(async (_context, skillIds: readonly string[]) => ({ snapshotVersion: 1, userId: ctx.userId, accountId: ctx.accountId, resolvedAt: deps.now(), platformPolicyVersion: "1", platformPolicy: "仅生成候选", skills: skillIds.map(skillId => ({ skillId, baseVersion: template.version, overlayRevision: null, overlayVersion: null, effective: { methodSystem: template.system, template: template.template, tools: [], requiredFacets: template.requiredFacets, contextRequirements: [], outputSchema: {}, completionPolicy: null, completionPolicyAdapter: null } })) }));
  const bridge = createIntelligenceGenerationBridge(db, { ...deps, tasks, entryPath: resolve("../ai-worker/dist/intelligence-generation-worker.cjs"), resolveModelSpec: async () => ({ apiFormat: "openai_chat", baseUrl: `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`, model: "fixture", token: "fixture-local-only", displayModelKey: "channel-managed" }), resolveSkillSnapshot: skills });
  const run = (taskId: string) => runIntelligenceTopicPreviewTask(ctx, { taskId, ...(admittedClaim?.task.id === taskId ? { existingClaim: admittedClaim } : {}) }, { tasks, intelligence, generator: bridge.topicPreviewGenerator });
  return { tag, itemId, sourceSnapshotId, preview, tasks, intelligence, candidate, projects, requests, skills, getVersion, createTopic, run, setFailAdoption: (value: boolean) => { failAdoption = value; }, loseAdoptionResponse: () => { failAfterCommit = true; }, emptyNextGeneration: () => { responseText = " \n "; }, failNextGeneration: () => { responseText = ""; responseStatus = 500; }, async cleanup() { await bridge.stop(); server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())); } };
}

it.each([false, true])("[T-1017] 定位 applied=%s：一次纯文本生成→编辑采纳→Project→标准写稿上下文", async personalized => {
  const f = await setup(personalized);
  try {
    await f.run(f.preview.task.id);
    const firstTask = await f.tasks.get(ctx, f.preview.task.id);
    expect(firstTask.status).toBe("succeeded");
    expect(f.requests).toHaveLength(1);
    expect(f.requests[0]).not.toHaveProperty("response_format");
    expect(f.skills).toHaveBeenCalledWith(ctx, ["intelligence.topic-adapted-draft"]);
    expect(f.getVersion).not.toHaveBeenCalled();
    const modelInput = JSON.stringify(f.requests[0]);
    expect(modelInput).toContain(sourceText);
    expect(modelInput).toContain(personalized ? "务实顾问" : "未提供账号定位");
    if (personalized) { expect(modelInput).toContain("不披露客户"); expect(modelInput).toContain("流程诊断"); }
    const detail = await f.intelligence.getItem(ctx, f.itemId);
    const snapshot = detail.transforms.find(t => t.id === f.preview.transform.id)!.outputSnapshot as Record<string, any>;
    expect(snapshot.adaptedDraft.contentText).toBe(generatedText);
    expect(snapshot.personalizationStatus).toBe(personalized ? "applied" : "not_applied");
    expect(snapshot.generationProgress.rewriteDraft.status).toBe("completed");
    expect(snapshot).not.toHaveProperty("decomposition");
    expect(snapshot).not.toHaveProperty("adaptationStrategy");
    const calls = await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId, f.preview.task.id));
    expect(calls).toHaveLength(1); expect(calls[0]?.status).toBe("settled"); expect(calls[0]?.providerResult).not.toBeNull();
    // 网络响应未知的请求重放，定位变化也不能复制提交。
    const replay = await f.intelligence.startTopicPreview(ctx, { itemId: f.itemId, sourceSnapshotId: f.sourceSnapshotId, idempotencyKey: `${f.tag}-preview` });
    expect(replay.task.id).toBe(f.preview.task.id); expect(replay.transform.id).toBe(f.preview.transform.id);
    await f.run(replay.task.id); expect(f.requests).toHaveLength(1);
    f.setFailAdoption(true);
    await expect(f.intelligence.confirmTopic(ctx, f.preview.transform.id, { idempotencyKey: `${f.tag}-adopt`, editedDraftContentText: editedText })).rejects.toThrow("fixture-write-failed");
    expect((await f.tasks.get(ctx, f.preview.task.id)).status).toBe("succeeded");
    f.setFailAdoption(false);
    f.loseAdoptionResponse();
    await expect(f.intelligence.confirmTopic(ctx, f.preview.transform.id, { idempotencyKey: `${f.tag}-adopt`, editedDraftContentText: editedText })).rejects.toThrow("fixture-confirm-response-lost");
    const [confirmed, concurrent] = await Promise.all([
      f.intelligence.confirmTopic(ctx, f.preview.transform.id, { idempotencyKey: `${f.tag}-adopt`, editedDraftContentText: `${editedText}重试时另一个编辑` }),
      f.intelligence.confirmTopic(ctx, f.preview.transform.id, { idempotencyKey: `${f.tag}-adopt-concurrent`, editedDraftContentText: editedText }),
    ]);
    expect(concurrent.topicId).toBe(confirmed.topicId);
    const allTopics = await f.candidate.listCandidates(ctx, { limit: 100, offset: 0 });
    expect(allTopics.rows.filter(topic => topic.card.adaptedDraft && "sourceSnapshotId" in topic.card.adaptedDraft && topic.card.adaptedDraft.sourceSnapshotId === f.sourceSnapshotId)).toHaveLength(1);
    const confirmedAgain = await f.intelligence.confirmTopic(ctx, f.preview.transform.id, { idempotencyKey: `${f.tag}-adopt`, editedDraftContentText: editedText });
    expect(confirmedAgain.topicId).toBe(confirmed.topicId);
    const topic = await f.candidate.getCandidate(ctx, confirmed.topicId);
    expect(topic.title).toBe("真实来源标题"); expect(topic.card.adaptedDraft?.contentText).toBe(editedText);
    expect(topic.card.adaptationStrategy).toBeUndefined();
    const promotion = await f.candidate.promote(ctx, confirmed.topicId);
    const project = await f.projects.getProject(ctx, promotion.projectId);
    const references = createProjectIntelligenceReferenceService(db, { ...deps, projects: { assertExists: async (c, id) => { await f.projects.getProject(c, id); } } });
    await references.attachFromPromotion(ctx, { projectId: promotion.projectId, topicId: confirmed.topicId });
    const contexts = await references.getSourceContexts(ctx, { projectId: promotion.projectId });
    expect(contexts).toHaveLength(1);
    const creative = await assembleCreativeContext(ctx, { projectId: promotion.projectId, topic: project.title }, { positioning: { getPositioningCenter: async () => ({ profile: null, currentStatement: null }) }, brief: { getBriefDetail: async () => ENDPOINTS.getProject.response.shape.briefDetail.parse(project.briefDetail) }, projectIntelligence: { getSourceContexts: async () => contexts.map(c => ({ ...c, sourceSnapshotId: c.snapshot.id, positioningVersionId: c.transform.positioningVersionId, positioningSnapshot: (c.transform.outputSnapshot as Record<string, unknown>)?.positioningSnapshot })) } });
    expect(creative.projectIntelligenceBrief).toContain(editedText);
    expect(creative.projectIntelligenceBrief).toContain("来源拆解和改写策略未生成");
    expect(creative.projectIntelligenceBrief).toContain(sourceText);
    expect(creative.projectIntelligenceBrief).toContain(personalized ? "务实顾问" : "未应用账号定位");
    expect(f.requests).toHaveLength(1);
    // 新尝试真实失败，历史正文与已采纳编辑仍可读取。
    f.failNextGeneration();
    const retry = await f.intelligence.startTopicPreview(ctx, { itemId: f.itemId, sourceSnapshotId: f.sourceSnapshotId, idempotencyKey: `${f.tag}-retry` });
    await f.run(retry.task.id);
    expect((await f.tasks.get(ctx, retry.task.id)).status).not.toBe("succeeded");
    const previous = (await f.intelligence.getItem(ctx, f.itemId)).transforms.find(t => t.id === f.preview.transform.id)!;
    expect((previous.outputSnapshot as Record<string, any>).adaptedDraft.contentText).toBe(generatedText);
    expect((previous.outputSnapshot as Record<string, any>).adoptedDraftContentText).toBe(editedText);
    await expect(f.intelligence.getItem({ ...ctx, accountId: "other-account" }, f.itemId)).rejects.toThrow();
    await db.update(itemTranscripts).set({ text: "来源后来发生了修改" }).where(eq(itemTranscripts.itemId, f.itemId));
    await expect(references.getSourceContexts(ctx, { projectId: promotion.projectId })).rejects.toThrow();
  } finally { await f.cleanup(); }
}, 30000);

it("[T-1017] 排队后逐字稿变化明确失败，不静默换输入、不调用模型", async () => {
  const f = await setup(false);
  try {
    await db.update(itemTranscripts).set({ text: "另一页面更改的来源文案" }).where(eq(itemTranscripts.itemId, f.itemId));
    await f.run(f.preview.task.id);
    expect((await f.tasks.get(ctx, f.preview.task.id)).status).toBe("failed");
    expect(f.requests).toHaveLength(0);
    const transform = (await f.intelligence.getItem(ctx, f.itemId)).transforms[0]!;
    expect(transform.outputSnapshot).not.toHaveProperty("adaptedDraft");
  } finally { await f.cleanup(); }
}, 15000);
it("[T-1017] 模型空正文不能伪造成功，已结算调用只有一次", async () => {
  const f = await setup(false);
  try {
    f.emptyNextGeneration(); await f.run(f.preview.task.id);
    expect((await f.tasks.get(ctx, f.preview.task.id)).status).toBe("failed");
    expect(f.requests).toHaveLength(1);
    const transform = (await f.intelligence.getItem(ctx, f.itemId)).transforms[0]!;
    expect(transform.outputSnapshot).not.toHaveProperty("adaptedDraft");
    await expect(f.intelligence.confirmTopic(ctx, f.preview.transform.id, { idempotencyKey: "cannot-adopt-empty" })).rejects.toThrow();
    expect(f.createTopic).not.toHaveBeenCalled();
  } finally { await f.cleanup(); }
}, 15000);

it.each([["", "改写稿"], ["长".repeat(150), "长".repeat(120)], ['{"angle":"来源格式污染"}', "改写稿"]])("[T-1017] 来源标题 %s 不阻断正文与采纳，也不注入项目核心信息", async (sourceTitle, expectedTitle) => {
  const f = await setup(false);
  try {
    await db.update(intelligenceItems).set({ title: sourceTitle }).where(eq(intelligenceItems.id, f.itemId));
    await f.run(f.preview.task.id);
    expect((await f.tasks.get(ctx, f.preview.task.id)).status).toBe("succeeded");
    const confirmed = await f.intelligence.confirmTopic(ctx, f.preview.transform.id, { idempotencyKey: `${f.tag}-untitled` });
    const topic = await f.candidate.getCandidate(ctx, confirmed.topicId);
    expect(topic.title).toBe(expectedTitle); expect(topic.card.adaptedDraft?.contentText).toBe(generatedText);
    expect(topic.card.oneLiner).toBeUndefined();
    const promotion = await f.candidate.promote(ctx, confirmed.topicId);
    const project = await f.projects.getProject(ctx, promotion.projectId);
    expect(ENDPOINTS.getProject.response.shape.briefDetail.parse(project.briefDetail).coreMessage).toBeUndefined();
    expect(f.requests).toHaveLength(1);
  } finally { await f.cleanup(); }
}, 15000);

it("[T-1017] 排队时 recovery 抢先领取仍能读取已冻结来源并完成正文", async () => {
  const f = await setup(false, true);
  try { await f.run(f.preview.task.id); expect((await f.tasks.get(ctx, f.preview.task.id)).status).toBe("succeeded"); expect(f.requests).toHaveLength(1); }
  finally { await f.cleanup(); }
}, 15000);
