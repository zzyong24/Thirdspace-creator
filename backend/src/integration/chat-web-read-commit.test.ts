import { afterEach, beforeEach, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDb, assets, assetFiles, executionCalls, eq, sql, type Db } from "@creatoros/backend";
import { executionEvidence } from "../schema/intelligence";
import { createAssetRepository, createAssetsService, createLocalFsObjectStorage } from "../modules/assets";
import { buildChatTools, type ChatToolDeps } from "../modules/ai-runtime/chat-tools";
import { prepareChatToolDefinitions } from "../modules/ai-runtime/chat-tool-definitions";
import { createChatWebReadTaskToolHost } from "../modules/ai-runtime/chat-web-read-tool-host";
import { createChatHostContextReader } from "../modules/ai/chat-host-context.service";
import { createAiRepository } from "../modules/ai/ai.repository";
import { createChatTurnSubmissionService } from "../modules/ai/chat-turn-submission.service";
import { createPersistentTaskService } from "../modules/execution/persistent-task.service";
import { createExecutionCallLedgerService } from "../modules/execution/execution-call-ledger.service";
import { createExecutionAgenticToolPorts } from "../modules/execution/execution-agentic-tool-ports.service";
import { createExecutionChatWebReadService } from "../modules/execution/execution-chat-web-read.service";

let db: Db, close: () => Promise<void>, root: string, sequence = 0;
const now = () => new Date().toISOString(), budget = { maxCalls: 30, maxTokens: 100000, deadlineMs: 60000 };
const observation = { text: "完整网页证据".repeat(4000), title: "观察标题", finalUrl: "https://example.com/redirect", extractor: "chatgpt-share", extractPath: "ssr", turnCount: 40 };
beforeEach(async () => { const opened = await createDb(); db = opened.db; close = () => opened.client.close(); root = await mkdtemp(join(tmpdir(), "t915-chat-read-")); });
afterEach(async () => { await close(); await rm(root, { recursive: true, force: true }); });

async function fixture(toolCount = 1) {
  const ctx = { userId: "read-user", accountId: `account-${++sequence}`, requestId: "test", source: "user" as const };
  const ids = { now, nextId: (prefix: string) => `${prefix}-${++sequence}` };
  const repo = createAiRepository(db, { ...ctx, ...ids });
  const conversation = await repo.createConversation({ title: "读网页", projectId: null, scope: "global" });
  const message = await repo.createMessage(conversation.id, { role: "user", content: "阅读绑定网页", attachments: [], modelMetadata: {} });
  const tools = (await prepareChatToolDefinitions(buildChatTools(["web.read"], {} as ChatToolDeps), { workerWebRead: true })).definitions;
  const hostContext = { schemaVersion: 1 as const, chatContext: { surface: "topics", webReadUrl: "https://example.com/bound#fragment" }, mediaRoute: null, positioningScratch: false, trustedScriptSources: [], skillSnapshot: { snapshotVersion: 1 as const, userId: ctx.userId, accountId: ctx.accountId, resolvedAt: "fixed", platformPolicyVersion: "1", platformPolicy: "事实", skills: [{ skillId: "chatbox.topic", baseVersion: "1", overlayRevision: null, overlayVersion: null, effective: { methodSystem: "事实", template: "", tools: ["web.read"], requiredFacets: [], contextRequirements: [], outputSchema: null, completionPolicy: null, completionPolicyAdapter: null } }] } };
  const submitted = await createChatTurnSubmissionService(db, { now, assemble: async () => ({ capability: "copilot.assist", system: "按证据回答", messages: [{ role: "user" as const, content: "阅读" }], tools, maxSteps: 6, maxOutputTokens: 128, hostContext }) }).submit(ctx, { conversationId: conversation.id, sourceMessageId: message.id });
  const tasks = createPersistentTaskService(db, { now });
  const claimed = (await tasks.claimTask({ taskId: submitted.executionTaskId, workerId: "test" }))!;
  const ref = { executionTaskId: submitted.executionTaskId, attempt: claimed.lease.attempt, fenceToken: claimed.lease.fenceToken };
  const restoredTools = await createChatWebReadTaskToolHost(createChatHostContextReader(db, { now }))(ctx, {} as never, ref, new AbortController().signal);
  const toolPorts = createExecutionAgenticToolPorts(db, { now, budget, tools: restoredTools });
  const ledger = createExecutionCallLedgerService(db, { now, budget });
  const model = await ledger.reserve(ref, { operationKey: "root", kind: "model", inputDigest: `sha256:${"a".repeat(64)}`, reservedTokens: 128 });
  await ledger.start(ref, model.id);
  await ledger.settle(ref, model.id, { status: "settled", usage: {}, providerResult: { content: Array.from({ length: toolCount }, (_, i) => ({ type: "tool-call" as const, toolCallId: i === 0 ? "read" : `read-${i}`, toolName: "web_read", input: '{"url":"https://other.example/model","offset":0,"maxChars":1000}' })), finishReason: { unified: "tool-calls" }, usage: { inputTokens: { total: 2 }, outputTokens: { total: 3 } }, warnings: [] } });
  const parent = await toolPorts.reserve(ref, { modelCallId: model.id, toolCallId: "read" });
  await toolPorts.start(ref, { callId: parent.callId });
  const storage = createLocalFsObjectStorage({ rootPath: root, publicBaseUrl: "/blob" }, { nextKey: () => `key-${++sequence}` });
  const assetsService = createAssetsService(createAssetRepository(db, ids), async () => storage, ids);
  const service = createExecutionChatWebReadService(db, { now, budget, tools: restoredTools, assets: assetsService, objectStorageForCtx: async () => storage });
  return { ctx, ref, tasks, service, parent, ledger, storage, toolPorts, model };
}

it("冻结URL优先；观察不创建素材；complete创建真实pending并保留原窗口", async () => {
  const f = await fixture();
  expect(await f.service.prepare(f.ref, { callId: f.parent.callId })).toMatchObject({ url: "https://example.com/bound", observation: null });
  await f.service.observe(f.ref, { callId: f.parent.callId, observation });
  expect(await db.select().from(assets)).toHaveLength(0);
  const result = await f.service.complete(f.ref, { callId: f.parent.callId });
  expect(result.data).toMatchObject({ kind: "web.read", asset: { sourceUrl: "https://example.com/bound", title: observation.title, turnCount: 40 }, window: { offset: 0, length: 1000, total: observation.text.length }, hasMore: true });
  expect(result.sideEffect).toBe("committed");
  expect(await db.select().from(assets)).toMatchObject([{ status: "pending" }]);
  expect(await db.select().from(assetFiles)).toMatchObject([{ extractedText: observation.text, extractStatus: "done", mediaMetadata: { sourceUrl: "https://example.com/bound" } }]);
  expect(await f.service.complete(f.ref, { callId: f.parent.callId })).toEqual(result);
});

it("同调用完整事实幂等，异正文/标题/抽取诊断/最终来源拒绝", async () => {
  const f = await fixture(), raw = { callId: f.parent.callId, observation };
  const results = await Promise.all([f.service.observe(f.ref, raw), f.service.observe(f.ref, raw)]);
  expect(results[0]).toEqual(results[1]); expect(await db.select().from(executionEvidence)).toHaveLength(1);
  for (const patch of [{ text: "其他正文" }, { title: "其他标题" }, { extractPath: "dom" }, { finalUrl: "https://other.example/" }, { turnCount: 1 }]) {
    await expect(f.service.observe(f.ref, { callId: f.parent.callId, observation: { ...observation, ...patch } })).rejects.toThrow();
  }
});

it("非法观察、跨任务与取消后的新观察拒绝", async () => {
  const f = await fixture(), other = await fixture();
  await expect(f.service.observe(f.ref, { callId: other.parent.callId, observation })).rejects.toThrow();
  for (const patch of [{ text: "" }, { text: "x".repeat(2 * 1024 * 1024 + 1) }, { finalUrl: "file:///private/a" }, { finalUrl: "https://u:p@example.com/" }, { turnCount: -1 }, { sourceUrl: "https://fake.example" }]) {
    await expect(f.service.observe(f.ref, { callId: f.parent.callId, observation: { ...observation, ...patch } })).rejects.toThrow();
  }
  await f.tasks.command(f.ctx, { taskIds: [f.ref.executionTaskId], command: "cancel", idempotencyKey: "cancel" });
  await expect(f.service.observe(f.ref, { callId: f.parent.callId, observation })).rejects.toThrow();
  expect(await db.select().from(executionEvidence)).toHaveLength(0);
});

it("素材提交成功但父账本结算失败，重试不重写字节或重复素材", async () => {
  const f = await fixture(); await f.service.observe(f.ref, { callId: f.parent.callId, observation });
  await db.execute(sql.raw("CREATE FUNCTION fail_read_settle() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.kind = 'tool' AND NEW.status = 'settled' THEN RAISE EXCEPTION 'injected settlement failure'; END IF; RETURN NEW; END; $$;"));
  await db.execute(sql.raw("CREATE TRIGGER fail_read_settle BEFORE UPDATE ON execution_calls FOR EACH ROW EXECUTE FUNCTION fail_read_settle();"));
  await expect(f.service.complete(f.ref, { callId: f.parent.callId })).rejects.toThrow();
  const [asset] = await db.select().from(assets); expect(asset).toBeTruthy();
  await db.execute(sql.raw("DROP TRIGGER fail_read_settle ON execution_calls;"));
  f.storage.putObject = async () => { throw new Error("不能重写字节"); };
  const result = await f.service.complete(f.ref, { callId: f.parent.callId });
  expect(result.data).toMatchObject({ asset: { id: asset!.id } });
  expect(await db.select().from(assets)).toHaveLength(1);
});

it("保存观察后取消，不能借观察继续创建素材", async () => {
  const f = await fixture(); await f.service.observe(f.ref, { callId: f.parent.callId, observation });
  await f.tasks.command(f.ctx, { taskIds: [f.ref.executionTaskId], command: "cancel", idempotencyKey: "cancel" });
  await expect(f.service.complete(f.ref, { callId: f.parent.callId })).rejects.toThrow();
  expect(await db.select().from(assets)).toHaveLength(0);
});

it("并发完成返回同一持久回执，不因窗口随机标记产生冲突", async () => {
  const f = await fixture();
  await f.service.observe(f.ref, { callId: f.parent.callId, observation });
  const results = await Promise.all([f.service.complete(f.ref, { callId: f.parent.callId }), f.service.complete(f.ref, { callId: f.parent.callId })]);
  expect(results[0]).toEqual(results[1]);
  expect(await db.select().from(assets)).toHaveLength(1);
});

it("观察持久内容被改动，拒绝提交素材", async () => {
  const f = await fixture();
  await f.service.observe(f.ref, { callId: f.parent.callId, observation });
  await db.update(executionEvidence).set({ title: "被改动" }).where(eq(executionEvidence.originCallId, f.parent.callId));
  await expect(f.service.complete(f.ref, { callId: f.parent.callId })).rejects.toThrow("持久网页观察与原调用不符");
  expect(await db.select().from(assets)).toHaveLength(0);
});

it("回执丢失后原素材已删除，返回真实错误且不复活素材", async () => {
  const f = await fixture();
  await f.service.observe(f.ref, { callId: f.parent.callId, observation });
  await db.execute(sql.raw("CREATE FUNCTION fail_deleted_settle() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.kind = 'tool' AND NEW.status = 'settled' THEN RAISE EXCEPTION 'injected settlement failure'; END IF; RETURN NEW; END; $$;"));
  await db.execute(sql.raw("CREATE TRIGGER fail_deleted_settle BEFORE UPDATE ON execution_calls FOR EACH ROW EXECUTE FUNCTION fail_deleted_settle();"));
  await expect(f.service.complete(f.ref, { callId: f.parent.callId })).rejects.toThrow();
  const [asset] = await db.select().from(assets);
  await db.update(assets).set({ status: "deleted" }).where(eq(assets.id, asset!.id));
  await db.execute(sql.raw("DROP TRIGGER fail_deleted_settle ON execution_calls;"));
  f.storage.putObject = async () => { throw new Error("不能复活素材"); };
  const result = await f.service.complete(f.ref, { callId: f.parent.callId });
  expect(result).toMatchObject({ status: "error", sideEffect: "committed", data: { asset: null } });
  expect(await db.select().from(assets)).toMatchObject([{ id: asset!.id, status: "deleted" }]);
});


it("五个并发网页观察共享 8 MiB 预算，不能分别检查后越界", async () => {
  const f = await fixture(5);
  const parents = [f.parent];
  for (let i = 1; i < 5; i++) {
    const parent = await f.toolPorts.reserve(f.ref, { modelCallId: f.model.id, toolCallId: `read-${i}` });
    await f.toolPorts.start(f.ref, { callId: parent.callId });
    parents.push(parent);
  }
  const page = { ...observation, text: "x".repeat(2 * 1024 * 1024) };
  const results = await Promise.allSettled(parents.map(parent => f.service.observe(f.ref, { callId: parent.callId, observation: page })));
  expect(results.filter(result => result.status === "fulfilled")).toHaveLength(4);
  expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
  const rows = await db.select().from(executionEvidence);
  expect(rows.reduce((total, row) => total + row.byteLength, 0)).toBe(8 * 1024 * 1024);
  expect(await db.select().from(assets)).toHaveLength(0);
});
