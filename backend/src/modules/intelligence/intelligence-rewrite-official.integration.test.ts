import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { appendFileSync } from "node:fs";
import { beforeAll, afterEach, expect, it } from "vitest";
import { z } from "zod";
import { ENDPOINTS, createClient, type RequestContext } from "@creatoros/contract";
import { getOfficialSkillBase, listOfficialSkillBases } from "@creatoros/ai-worker";
import { createDb, eq, executionTasks, executionCalls, intelligenceItems } from "@creatoros/backend";
import { createAccountGroupService, createPlatformAccountService, createPlatformAccountTransport } from "../platform-account";
import { createPersistentTaskService } from "../execution";
import { createSettingsRepository } from "../settings";
import { createEffectiveSkillSnapshotResolver } from "../ai-runtime/effective-skill-snapshot";
import { createIntelligenceService, type IntelligenceAdapterEnvelope } from "./intelligence.service";
import { createIntelligenceTransport } from "./intelligence.transport";
import { runIntelligenceSourceTask } from "./source-sync-runner";
import { runIntelligenceTopicPreviewTask, type TopicPreviewGeneratorPort } from "./topic-preview-runner";
import { createIntelligenceGenerationBridge, type IntelligenceGenerationBridgeDeps } from "./intelligence-generation-bridge";
import { createIntelligenceGenerationBridge as createHistoricalBridge } from "../../../../docs/verification/t1229/historical-generation-bridge";

const cleanups: Array<() => Promise<unknown>> = [];
const generatedText = "先把输入和责任边界说清楚，再选择适合的工具。稳定交付来自可以反复验证的流程。";
const observationPath = new URL("../../../../docs/verification/t1229/official-rewrite-repaired-observation.ndjson", import.meta.url);
beforeAll(async () => {
  await promisify(execFile)(process.execPath, [resolve("../ai-worker/scripts/build.mjs")], { timeout: 180000, maxBuffer: 4 * 1024 * 1024 });
}, 240000);
afterEach(async () => {
  const errors: unknown[] = [];
  for (const cleanup of cleanups.splice(0).reverse()) {
    try { await cleanup(); } catch (error) { errors.push(error); }
  }
  if (errors.length) throw new AggregateError(errors, "隔离正文测试清理未完成");
}, 240000);

it.each(["official-null", "overlay-object", "legacy-frozen-object", "whitespace", "unknown", "wrong-owner", "wrong-fence", "stopped"] as const)("[T1229] 真实官方纯文本契约 %s：公共账号与来源→逐字稿→原任务生成正文", async mode => {
  const opened = await createDb();
  cleanups.push(() => opened.client.close());
  const db = opened.db, tag = randomUUID();
  let seq = 0;
  const now = () => new Date().toISOString();
  const nextId = (prefix: string) => `${prefix}-t1229-${tag}-${++seq}`;
  const base: RequestContext = { userId: `t1229-${tag}`, requestId: "t1229-official", source: "user" };
  const groups = createAccountGroupService({ db, now, nextId });
  const group = await groups.create(base, { name: "隔离正文账号组", idempotencyKey: "group" });
  const accounts = createPlatformAccountService({ db, now, nextId });
  const account = await createClient(ENDPOINTS, createPlatformAccountTransport(() => accounts), { ...base, groupId: group.id })
    .createAccount({ params: undefined, query: undefined, body: { platform: "douyin", accountHandle: "隔离正文账号", idempotencyKey: "account" } });
  const member = await groups.forAccount(base, account.id);
  const currentGroup = await groups.get(base, group.id);
  const ctx: RequestContext = { ...base, accountId: account.id, groupId: member.groupId, groupVersion: currentGroup.version, membershipVersion: member.version };
  const tasks = createPersistentTaskService(db, { now });
  const intelligence = createIntelligenceService(db, { tasks, now, nextId });
  const created = await createClient(ENDPOINTS, createIntelligenceTransport(() => intelligence), ctx)
    .createIntelligenceSource({ params: undefined, query: undefined, body: { collectionId: null, type: "rss", config: { type: "rss", url: "https://example.test/t1229-feed.xml" }, monitorEnabled: false, runInitial: true, idempotencyKey: "source" } });
  if (!created.run || !created.task) throw new Error("隔离来源未建立原运行和任务");
  const url = `https://example.test/t1229-${tag}`;
  const sourceText = "团队先确认业务输入和责任边界，再选择工具，通过可重复的验收保持交付稳定。";
  const envelope: IntelligenceAdapterEnvelope = {
    adapterStatus: "succeeded_with_items", upstreamEvidence: { adapter: "rss", responseShape: "isolated-content", capturedAt: now(), listValid: true },
    items: [{ type: "article", platform: "example.com", externalId: null, canonicalUrl: url, authorId: null, authorName: "隔离作者", title: "隔离来源", summary: null, coverUrl: null, publishedAt: null, durationMs: null,
      metrics: { likeCount: 0, commentCount: 0, collectCount: 0, shareCount: 0, followerCount: null, metricSource: "isolated", qualityFlags: [] },
      snapshot: { finalUrl: url, title: "隔离快照", contentHash: `sha256:${createHash("sha256").update(sourceText).digest("hex")}`, safeExtract: sourceText, storageRef: null, retentionUntil: null, privacyClass: "public" } }],
    checkpoint: null, errorCode: null, safeDiagnostics: { returnedCount: 1 },
  };
  await runIntelligenceSourceTask(ctx, { sourceId: created.source.id, runId: created.run.id, taskId: created.task.id }, { tasks, intelligence, now, adapter: { run: async () => envelope } });
  expect((await intelligence.getRun(ctx, created.run.id)).run).toMatchObject({ status: "succeeded_with_items", newCount: 1, failedCount: 0 });
  const [item] = await db.select().from(intelligenceItems);
  if (!item) throw new Error("来源未产生真实作品");
  await intelligence.uploadManualTranscript(ctx, { itemId: item.id, inputMode: "paste", text: sourceText });
  const detail = await intelligence.getItem(ctx, item.id);
  const snapshot = detail.snapshots[0];
  if (!snapshot) throw new Error("作品缺少真实来源快照");
  const preview = await intelligence.startTopicPreview(ctx, { itemId: item.id, sourceSnapshotId: snapshot.id, idempotencyKey: "preview" });
  expect(preview.transform.outputSnapshot).toMatchObject({ generationMode: "rewrite_only", personalizationStatus: "not_applied" });
  expect(preview.task).toMatchObject({ ownerType: "transform", ownerId: item.id, userId: ctx.userId, accountId: ctx.accountId, groupId: ctx.groupId });
  const [queuedTask] = await db.select().from(executionTasks).where(eq(executionTasks.id, preview.task.id));
  expect(queuedTask?.payload).toMatchObject({ transformId: preview.transform.id, itemId: item.id, sourceSnapshotId: snapshot.id });
  expect((await intelligence.getTopicPreviewForExecution(ctx, preview.task.id)).transformId).toBe(preview.transform.id);

  // 真实官方注册表与真实组 overlay repository；不制造输出契约。
  expect(getOfficialSkillBase("intelligence.topic-adapted-draft")?.outputSchema).toBeNull();
  const repository = createSettingsRepository(db, { now, nextId });
  const usesObject = mode === "overlay-object" || mode === "legacy-frozen-object";
  const overlaySchema = { type: "object", properties: { draft: { type: "string" } }, required: ["draft"], additionalProperties: false };
  if (usesObject) {
    await repository.putAccountSkillOverlay(ctx, { skillId: "intelligence.topic-adapted-draft", expectedRevision: null, observedBaseVersion: getOfficialSkillBase("intelligence.topic-adapted-draft")!.baseVersion, overlay: { outputSchema: overlaySchema } });
  }
  const overlays = { listBySkillIds: (context: RequestContext, ids: readonly string[]) => repository.listAccountSkillOverlays(context, ids) };
  const realResolver = createEffectiveSkillSnapshotResolver({ officialSkills: { get: getOfficialSkillBase, list: listOfficialSkillBases, platformPolicy: () => ({ version: "t1229-isolated-policy-v1", text: "仅生成候选，不执行外部操作。" }) }, accountOverlays: overlays, groupOverlays: overlays, now });
  const resolved: Array<{ skillId: string; baseVersion: string; schemaNull: boolean; ownerMatches: boolean }> = [];
  let requestCount = 0;
  const requestProtocols: Array<{ stream: boolean; responseFormat: boolean }> = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", () => {
      let input: Record<string, unknown>;
      try { input = JSON.parse(body); } catch { res.writeHead(400); res.end(); return; }
      if (req.method !== "POST" || req.url !== "/v1/chat/completions" || input.model !== "t1229-local-fixture" || !Array.isArray(input.messages)) { res.writeHead(400); res.end(); return; }
      requestCount++;
      requestProtocols.push({ stream: input.stream === true, responseFormat: "response_format" in input });
      if (mode === "unknown") { res.destroy(); return; }
      const responseText = mode === "whitespace" ? " \n " : generatedText;
      const completion = { id: tag, created: 1, model: "t1229-local-fixture" };
      const usage = { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 };
      if (input.stream === true) {
        res.writeHead(200, { "content-type": "text/event-stream" });
        res.end(`data: ${JSON.stringify({ ...completion, object: "chat.completion.chunk", choices: [{ index: 0, delta: { role: "assistant", content: responseText }, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ ...completion, object: "chat.completion.chunk", choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage })}\n\ndata: [DONE]\n\n`);
      } else {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ...completion, object: "chat.completion", choices: [{ index: 0, message: { role: "assistant", content: responseText }, finish_reason: "stop" }], usage }));
      }
    });
  });
  await new Promise<void>((done, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", done); });
  cleanups.push(async () => { server.closeAllConnections(); await new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done())); });
  const bridgeDeps: IntelligenceGenerationBridgeDeps = { tasks, now, entryPath: resolve("../ai-worker/dist/intelligence-generation-worker.cjs"),
    resolveModelSpec: async () => ({ apiFormat: "openai_chat", baseUrl: `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`, model: "t1229-local-fixture", token: "t1229-local-only", displayModelKey: "channel-managed" }),
    resolveSkillSnapshot: async (context, ids) => {
      const actual = await realResolver(context, ids);
      resolved.push(...actual.skills.map(skill => ({ skillId: skill.skillId, baseVersion: skill.baseVersion, schemaNull: skill.effective.outputSchema === null, ownerMatches: actual.userId === context.userId && actual.accountId === context.accountId && actual.groupId === context.groupId })));
      return actual;
    },
  };
  const bridge = createIntelligenceGenerationBridge(db, bridgeDeps);
  cleanups.push(() => bridge.stop());
  const historical = mode === "legacy-frozen-object" ? createHistoricalBridge(db, bridgeDeps) : null;
  if (historical) cleanups.push(() => historical.stop());
  let existingClaim: Awaited<ReturnType<typeof tasks.claimTask>> = null;
  if (mode === "wrong-owner" || mode === "wrong-fence" || mode === "stopped") {
    existingClaim = await tasks.claimTask({ taskId: preview.task.id, workerId: `negative-${mode}`, leaseSeconds: 300 });
    if (!existingClaim) throw new Error("合法原任务未领取");
    const target = await intelligence.getTopicPreviewForExecution(ctx, preview.task.id);
    const before = await db.select().from(executionTasks).where(eq(executionTasks.id, preview.task.id));
    const stopped = mode === "stopped" ? createIntelligenceGenerationBridge(db, bridgeDeps) : null;
    if (stopped) { await stopped.stop(); cleanups.push(() => stopped.stop()); }
    await expect((stopped ?? bridge).topicPreviewGenerator.generate(mode === "wrong-owner" ? { ...ctx, userId: "foreign-user" } : ctx, target, async () => {}, mode === "wrong-fence" ? { ...existingClaim, lease: { ...existingClaim.lease, fenceToken: "stale-fence" } } : existingClaim)).rejects.toThrow();
    expect(await db.select().from(executionTasks).where(eq(executionTasks.id, preview.task.id))).toEqual(before);
    expect(await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId, preview.task.id))).toHaveLength(0);
    expect(requestCount).toBe(0);
  }
  let schemaRefusal = false, errorClass: string | null = null;
  const generator: TopicPreviewGeneratorPort = { async generate(...args) {
    try {
      if (historical) {
        const result = await historical.topicPreviewGenerator.generate(...args);
        const [old] = await db.select().from(executionTasks).where(eq(executionTasks.id, preview.task.id));
        const frozen = (old!.payload as Record<string, unknown>).intelligenceGeneration;
        expect(frozen).not.toHaveProperty("input.intelligenceText");
        expect(frozen).toHaveProperty("input.skillSnapshot.skills.0.effective.outputSchema", overlaySchema);
        expect(requestCount).toBe(1);
        const replay = await bridge.topicPreviewGenerator.generate(...args);
        expect(replay).toEqual(result);
        const [replayed] = await db.select().from(executionTasks).where(eq(executionTasks.id, preview.task.id));
        expect((replayed!.payload as Record<string, unknown>).intelligenceGeneration).toEqual(frozen);
        expect(requestCount).toBe(1);
        return replay;
      }
      return await bridge.topicPreviewGenerator.generate(...args);
    }
    catch (error) {
      schemaRefusal = error instanceof z.ZodError && error.issues.some(issue => issue.message === "结构化任务缺少冻结输出契约");
      errorClass = error instanceof z.ZodError ? "ZodError" : "other";
      throw error;
    }
  } };
  await runIntelligenceTopicPreviewTask(ctx, { taskId: preview.task.id, ...(existingClaim ? { existingClaim } : {}) }, { tasks, intelligence, generator });
  const task = await tasks.get(ctx, preview.task.id);
  const [raw] = await db.select().from(executionTasks).where(eq(executionTasks.id, task.id));
  const calls = await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId, task.id));
  const payload = raw?.payload as Record<string, unknown> | undefined;
  const output = (await intelligence.getItem(ctx, item.id)).transforms.find(transform => transform.id === preview.transform.id)?.outputSnapshot as Record<string, unknown>;
  const observation = { caseMode: mode, taskId: task.id, transformId: preview.transform.id, sourceRunId: created.run.id, sourceTaskId: created.task.id, mode: output.generationMode, taskStatus: task.status, runtimeStatus: task.runtimeStatus, errorCode: task.errorCode, attempt: task.attempt, frozenPresent: Boolean(payload?.intelligenceGeneration), callCount: calls.length, requestCount, schemaRefusal, errorClass, resolved, bindingMatches: raw?.ownerType === "transform" && raw?.ownerId === item.id && payload?.transformId === preview.transform.id && payload?.itemId === item.id && payload?.sourceSnapshotId === snapshot.id && preview.transform.aiTaskId === raw?.id && raw?.userId === ctx.userId && raw?.accountId === ctx.accountId && raw?.groupId === ctx.groupId };
  appendFileSync(observationPath, JSON.stringify(observation) + "\n");
  console.info("T1229_OFFICIAL_OBSERVATION", JSON.stringify(observation));

  expect(resolved).not.toHaveLength(0);
  expect(resolved.every(skill => skill.schemaNull === !usesObject && skill.ownerMatches)).toBe(true);
  if (mode === "whitespace" || mode === "unknown") {
    expect(task.status).not.toBe("succeeded");
    expect(output).not.toHaveProperty("adaptedDraft");
    expect(calls).toHaveLength(1); expect(requestCount).toBe(1);
    expect(calls[0]?.status).toBe(mode === "unknown" ? "unknown" : "settled");
    if (mode === "unknown") {
      expect(raw?.status).toBe("unknown_result");
      await runIntelligenceTopicPreviewTask(ctx, { taskId: preview.task.id }, { tasks, intelligence, generator });
      expect(requestCount).toBe(1);
      expect(await db.select().from(executionTasks).where(eq(executionTasks.id, preview.task.id))).toEqual([raw]);
    }
    return;
  }
  // 合法任务必须完成；RED/GREEN 均保留成功断言，不以预期拒绝代替功能。
  expect(task.status).toBe("succeeded");
  expect((output.adaptedDraft as { contentText: string }).contentText).toBe(generatedText);
  expect(calls).toHaveLength(1);
  expect(calls[0]?.status).toBe("settled");
  expect(calls[0]?.providerResult).not.toBeNull();
  expect(requestCount).toBe(1);
  expect(requestProtocols).toEqual([{ stream: true, responseFormat: false }]);
  const replay = await intelligence.startTopicPreview(ctx, { itemId: item.id, sourceSnapshotId: snapshot.id, idempotencyKey: "preview" });
  expect(replay.task.id).toBe(task.id); expect(replay.transform.id).toBe(preview.transform.id);
  await runIntelligenceTopicPreviewTask(ctx, { taskId: replay.task.id }, { tasks, intelligence, generator });
  expect(requestCount).toBe(1);
  expect(await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId, task.id))).toEqual(calls);
  expect(await db.select().from(executionTasks).where(eq(executionTasks.id, task.id))).toEqual([raw]);
}, 1200000);
