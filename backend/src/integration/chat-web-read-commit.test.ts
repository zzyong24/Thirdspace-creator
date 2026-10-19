import {createBrowserSessionsService} from "../modules/browser-sessions";
import {runDurableAgenticTool} from "../../../ai-worker/src/execution/durable-agentic-tool";
import {runChatWebReadInWorker} from "../../../ai-worker/src/execution/chat-web-read-worker";
import {WebReaderLoginRequiredError} from "../../../ai-worker/src/runtime/browser/web-reader";
import type {WorkerPort} from "@creatoros/contract/execution-worker";
import { afterEach, beforeEach, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDb, assets, assetFiles, executionCalls, executionTasks, eq, sql, type Db } from "@creatoros/backend";
import { createExecutionCheckpointService } from "../modules/execution/execution-checkpoint.service";
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
import { createExecutionChatToolPorts } from "../modules/execution/execution-chat-tool-ports.service";

let client:Awaited<ReturnType<typeof createDb>>["client"];
let db: Db, close: () => Promise<void>, root: string, sequence = 0;
const now = () => new Date().toISOString(), budget = { maxCalls: 30, maxTokens: 100000, deadlineMs: 60000 };
const observation = { text: "完整网页证据".repeat(4000), title: "观察标题", finalUrl: "https://example.com/redirect", extractor: "chatgpt-share", extractPath: "ssr", turnCount: 40 } as const;
beforeEach(async () => { const opened = await createDb(); db = opened.db; client=opened.client; close = () => opened.client.close(); root = await mkdtemp(join(tmpdir(), "t915-chat-read-")); });
afterEach(async () => { await close(); await rm(root, { recursive: true, force: true }); });

async function fixture(toolCount = 1, resolveSearch?: (ctx:import("@creatoros/contract").RequestContext)=>Promise<import("../modules/ai-runtime/search/resolve").SearchSpec|null>, startParent = true, readOptions: { refresh?: boolean; offset?: number } = {}) {
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
  const storage = createLocalFsObjectStorage({ rootPath: root, publicBaseUrl: "/blob" }, { nextKey: () => `key-${++sequence}` });
  const assetsService = createAssetsService(createAssetRepository(db, ids), async () => storage, ids);
  const sessions=createBrowserSessionsService({db,now,nextId:ids.nextId,masterKey:Buffer.alloc(32,7)});
  const toolPorts = createExecutionChatToolPorts(db, { now, budget, tools: restoredTools, webRead:{assets:assetsService,objectStorageForCtx:async()=>storage,sessions,resolveSearch} });
  const ledger = createExecutionCallLedgerService(db, { now, budget });
  const model = await ledger.reserve(ref, { operationKey: "root", kind: "model", inputDigest: `sha256:${"a".repeat(64)}`, reservedTokens: 128 });
  await ledger.start(ref, model.id);
  await ledger.settle(ref, model.id, { status: "settled", usage: {}, providerResult: { content: Array.from({ length: toolCount }, (_, i) => ({ type: "tool-call" as const, toolCallId: i === 0 ? "read" : `read-${i}`, toolName: "web_read", input: JSON.stringify({url:"https://other.example/model",offset:0,maxChars:1000,...readOptions}) })), finishReason: { unified: "tool-calls" }, usage: { inputTokens: { total: 2 }, outputTokens: { total: 3 } }, warnings: [] } });
  const parent = await toolPorts.reserve(ref, { modelCallId: model.id, toolCallId: "read" });
  if(startParent)await toolPorts.start(ref, { callId: parent.callId });
  const service=toolPorts.webRead!;
  return { ctx, ref, tasks, service, parent, ledger, storage, toolPorts, model, sessions, assetsService };
}

it("冻结URL优先；观察不创建素材；complete创建真实pending并保留原窗口", async () => {
  const f = await fixture();
  expect(await f.service.prepare(f.ref, { callId: f.parent.callId })).toMatchObject({ url: "https://example.com/bound", observation: null });
  await f.service.observe(f.ref, { callId: f.parent.callId, observation });
  expect(await db.select().from(assets)).toHaveLength(0);
  const result = await f.service.complete(f.ref, { callId: f.parent.callId });
  expect(result.data).toMatchObject({ kind: "web.read", asset: { sourceUrl: "https://example.com/bound", finalUrl: observation.finalUrl, title: observation.title, turnCount: 40 }, window: { offset: 0, length: 1000, total: observation.text.length }, hasMore: true });
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
  for (const patch of [{ text: "" }, { text: "x".repeat(2 * 1024 * 1024 + 1) }, { finalUrl: "file:///private/a" }, { finalUrl: "javascript:alert(1)" }, { finalUrl: "data:text/html,test" }, { finalUrl: "https://u:p@example.com/" }, { turnCount: -1 }, { sourceUrl: "https://fake.example" }]) {
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


it("保存观察后租约过期，新 Worker 恢复原父调用且旧 Worker 不能继续写", async () => {
  const f = await fixture();
  await f.service.observe(f.ref, { callId: f.parent.callId, observation });
  await db.update(executionTasks).set({ leaseExpiresAt: "2000-01-01T00:00:00.000Z" }).where(eq(executionTasks.id, f.ref.executionTaskId));
  const report = await f.tasks.recoverExpiredLeases();
  expect(report).toMatchObject({ requeued: 1, unknownResult: 0 });
  const claimed = (await f.tasks.claimTask({ taskId: f.ref.executionTaskId, workerId: "replacement" }))!;
  const ref = { ...f.ref, attempt: claimed.lease.attempt, fenceToken: claimed.lease.fenceToken };
  expect(ref.attempt).toBeGreaterThan(f.ref.attempt);
  const checkpoint = await createExecutionCheckpointService(db).read(ref);
  expect(checkpoint.recovery).not.toBe("requires_reconciliation");
  expect(checkpoint.replayableWebReadToolCallIds).toEqual([f.parent.callId]);
  await expect(f.service.observe(f.ref, { callId: f.parent.callId, observation })).rejects.toThrow();
  await expect(f.service.complete(ref, { callId: f.parent.callId })).rejects.toThrow("网页调用未取得当前执行权");
  expect(await f.service.restore(ref, { callId: f.parent.callId })).toEqual({ callId: f.parent.callId, status: "started" });
  const result = await f.service.complete(ref, { callId: f.parent.callId });
  expect(result.status).toBe("ok");
  expect(await db.select().from(assets)).toHaveLength(1);
  expect(await db.select().from(executionEvidence)).toHaveLength(1);
});

it.each(["missing", "tampered", "unknown", "cancelled"])("恢复不能越过无事实或不确定状态：%s", async (mode) => {
  const f = await fixture();
  if (mode !== "missing") await f.service.observe(f.ref, { callId: f.parent.callId, observation });
  if (mode === "tampered") await db.update(executionEvidence).set({ fullText: "损坏" }).where(eq(executionEvidence.originCallId, f.parent.callId));
  if (mode === "unknown") await db.update(executionCalls).set({ status: "unknown" }).where(eq(executionCalls.id, f.parent.callId));
  if (mode === "cancelled") await f.tasks.command(f.ctx, { taskIds: [f.ref.executionTaskId], command: "cancel", idempotencyKey: "stop-before-recover" });
  await expect(f.service.restore(f.ref, { callId: f.parent.callId })).rejects.toThrow();
  await db.update(executionTasks).set({ leaseExpiresAt: "2000-01-01T00:00:00.000Z" }).where(eq(executionTasks.id, f.ref.executionTaskId));
  const report = await f.tasks.recoverExpiredLeases();
  expect(report.requeued).toBe(0);
  const [task] = await db.select().from(executionTasks).where(eq(executionTasks.id, f.ref.executionTaskId));
  expect(task!.status).toBe(mode === "cancelled" ? "cancelled" : "unknown_result");
  expect(await db.select().from(assets)).toHaveLength(0);
});

it("素材已提交但回执未写入，新租约恢复只完成原回执", async () => {
  const f = await fixture();
  await f.service.observe(f.ref, { callId: f.parent.callId, observation });
  await db.execute(sql.raw("CREATE FUNCTION fail_recovered_settle() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.kind = 'tool' AND NEW.status = 'settled' THEN RAISE EXCEPTION 'injected settlement failure'; END IF; RETURN NEW; END; $$;"));
  await db.execute(sql.raw("CREATE TRIGGER fail_recovered_settle BEFORE UPDATE ON execution_calls FOR EACH ROW EXECUTE FUNCTION fail_recovered_settle();"));
  await expect(f.service.complete(f.ref, { callId: f.parent.callId })).rejects.toThrow();
  const [asset] = await db.select().from(assets);
  await db.execute(sql.raw("DROP TRIGGER fail_recovered_settle ON execution_calls;"));
  await db.update(executionTasks).set({ leaseExpiresAt: "2000-01-01T00:00:00.000Z" }).where(eq(executionTasks.id, f.ref.executionTaskId));
  expect((await f.tasks.recoverExpiredLeases()).requeued).toBe(1);
  const claimed = (await f.tasks.claimTask({ taskId: f.ref.executionTaskId, workerId: "replacement" }))!;
  const ref = { ...f.ref, attempt: claimed.lease.attempt, fenceToken: claimed.lease.fenceToken };
  f.storage.putObject = async () => { throw new Error("不能重写原素材"); };
  await f.service.restore(ref, { callId: f.parent.callId });
  expect(await f.service.complete(ref, { callId: f.parent.callId })).toMatchObject({ status: "ok", data: { asset: { id: asset!.id } } });
  expect(await db.select().from(assets)).toHaveLength(1);
});


it("聊天读取会话使用冻结 URL，真实加密存储 CAS 保护人工新登录", async () => {
 const f=await fixture();
 expect(await f.service.readSession(f.ref,{callId:f.parent.callId})).toEqual({domain:"example.com",stateJson:null,revision:null});
 const state=(value:string)=>JSON.stringify({cookies:[{name:"session",value,domain:".example.com",path:"/"}],origins:[]});
 expect((await f.service.saveSession(f.ref,{callId:f.parent.callId,revision:null,stateJson:state("first")})).saved).toBe(true);
 const original=await f.service.readSession(f.ref,{callId:f.parent.callId});
 expect(original.stateJson).toBe(state("first"));
 await f.sessions.saveState(f.ctx,"example.com",state("human"));
 expect((await f.service.saveSession(f.ref,{callId:f.parent.callId,revision:original.revision,stateJson:state("stale")})).saved).toBe(false);
 expect(await f.sessions.getState(f.ctx,"example.com")).toBe(state("human"));
 await expect(f.service.saveSession(f.ref,{callId:f.parent.callId,revision:null,stateJson:JSON.stringify({cookies:[{name:"session",value:"bad",domain:".other.example",path:"/"}],origins:[]})})).rejects.toThrow();
 await f.tasks.command(f.ctx,{taskIds:[f.ref.executionTaskId],command:"cancel",idempotencyKey:"stop-session"});
 await expect(f.service.readSession(f.ref,{callId:f.parent.callId})).rejects.toThrow();
 await expect(f.service.saveSession(f.ref,{callId:f.parent.callId,revision:null,stateJson:state("cancelled")})).rejects.toThrow();
});


it("宿主停止阻止新保存，但已结算回执可在停止后重放", async () => {
 const f=await fixture();await f.service.observe(f.ref,{callId:f.parent.callId,observation});
 const signal=AbortSignal.abort();
 await expect(f.service.complete(f.ref,{callId:f.parent.callId},signal)).rejects.toThrow();
 await expect(f.service.readSession(f.ref,{callId:f.parent.callId},signal)).rejects.toThrow();
 expect(await db.select().from(assets)).toHaveLength(0);
 const result=await f.service.complete(f.ref,{callId:f.parent.callId});
 expect(await f.service.complete(f.ref,{callId:f.parent.callId},signal)).toEqual(result);
});


it("读取会话版本期间宿主停止，不能继续保存迟到登录态", async () => {
 const f=await fixture(),controller=new AbortController();
 const original=f.sessions.getStateVersioned.bind(f.sessions);
 f.sessions.getStateVersioned=async(...args)=>{const result=await original(...args);controller.abort();return result;};
 await expect(f.service.saveSession(f.ref,{callId:f.parent.callId,revision:null,stateJson:JSON.stringify({cookies:[],origins:[]})},controller.signal)).rejects.toThrow();
 expect(await f.sessions.getState(f.ctx,"example.com")).toBe(null);
});

it("Worker 自报素材结果不能替代宿主命名提交端口", async () => {
 const f=await fixture();
 await expect(f.toolPorts.settle(f.ref,{callId:f.parent.callId,status:"settled",output:{status:"ok",summary:"伪素材",evidence:[],data:{kind:"web.read",asset:{id:"fake"}},error:null,continuation:null,sideEffect:"committed"}})).rejects.toThrow("聊天工具结果必须由宿主实际执行确认");
 expect(await db.select().from(assets)).toHaveLength(0);
 await expect(f.service.prepare(f.ref,{callId:f.parent.callId,url:"https://other.example/"})).rejects.toThrow();
 await f.service.observe(f.ref,{callId:f.parent.callId,observation});
 const result=await f.service.complete(f.ref,{callId:f.parent.callId});
 expect(result.status).toBe("ok");
 expect(await f.toolPorts.settle(f.ref,{callId:f.parent.callId,status:"settled",output:result})).toMatchObject({callId:f.parent.callId,status:"settled"});
});


it.each(["document-lock", "document-insert", "session-version", "session-cas"])("最后写入前的内部数据库等待期间停止：%s", async mode => {
 const f=await fixture(),controller=new AbortController();
 if(mode.startsWith("document"))await f.service.observe(f.ref,{callId:f.parent.callId,observation});
 const transaction=client.transaction.bind(client);let matched=false,sessionReads=0;
 client.transaction=((callback:Parameters<typeof client.transaction>[0])=>transaction(async(tx)=>{
  const query=tx.query.bind(tx);
  tx.query=(async(...args:Parameters<typeof tx.query>)=>{
   const result=await query(...args),statement=String(args[0]);
   if(mode==="document-lock" && statement.includes('from "pending_document_commits"') && statement.includes('for update')){matched=true;controller.abort();}
   if(mode==="document-insert" && statement.startsWith('insert into "assets"')){matched=true;controller.abort();}
   if(mode==="session-cas" && statement.startsWith('insert into "browser_sessions"')){matched=true;controller.abort();}
   // 第一次为外层 findState，第二次为 saveStateVersioned 内部读取。
   if(mode==="session-version" && statement.includes('from "browser_sessions"') && ++sessionReads===2){matched=true;controller.abort();}
   return result;
  }) as typeof tx.query;
  return callback(tx);
 })) as typeof client.transaction;
 let failed=false;
 try {
  if(mode.startsWith("document"))await f.service.complete(f.ref,{callId:f.parent.callId},controller.signal);
  else await f.service.saveSession(f.ref,{callId:f.parent.callId,revision:null,stateJson:JSON.stringify({cookies:[],origins:[]})},controller.signal);
 }catch {failed=true;}finally{client.transaction=transaction;}
 expect(matched).toBe(true);expect(failed).toBe(true);
 expect(await db.select().from(assets)).toHaveLength(0);
 expect(await f.sessions.getState(f.ctx,"example.com")).toBe(null);
});

it("网页登录失败取消后仍结算冻结域，重复回执不能变成成功素材",async()=>{
  const f=await fixture();await f.tasks.command(f.ctx,{taskIds:[f.ref.executionTaskId],command:"cancel",idempotencyKey:"cancel-fail"});
  const result=await f.service.fail(f.ref,{callId:f.parent.callId,failure:{kind:"needs_login"}});
  expect(result).toMatchObject({status:"blocked",sideEffect:"none",error:{code:"needs_login",retryable:false},data:{kind:"web.read",asset:null,needLogin:{domain:"example.com"},text:null,window:null,hasMore:false}});
  expect(await f.service.fail(f.ref,{callId:f.parent.callId,failure:{kind:"read_error",code:"transient",message:"迟到错误"}})).toEqual(result);
  expect(await db.select().from(assets)).toHaveLength(0);
});
it("HTTP 失败保留备用来源与原卡片语义，运行时缺失保持独立恢复状态",async()=>{
  const f=await fixture(),alternates=[{title:"备用",url:"https://other.example/source",snippet:"可核验来源"}];
  const result=await f.service.fail(f.ref,{callId:f.parent.callId,failure:{kind:"http_blocked",status:403,message:"HTTP 403",alternates}});
  expect(result).toMatchObject({status:"error",sideEffect:"none",data:{httpStatus:403,loginSuggested:true,alternates,asset:null,hasMore:false}});
  const other=await fixture();expect(await other.service.fail(other.ref,{callId:other.parent.callId,failure:{kind:"browser_runtime_unavailable"}})).toMatchObject({status:"blocked",error:{code:"permission",retryable:false},data:{recoveryState:"browser_runtime_unavailable",asset:null}});
});
it("已有成功观察拒绝失败降级，已提交成功仅重放原结果",async()=>{
  const f=await fixture(),failure={callId:f.parent.callId,failure:{kind:"read_error",code:"transient",message:"迟到超时"}};
  await f.service.observe(f.ref,{callId:f.parent.callId,observation});
  await expect(f.service.fail(f.ref,failure)).rejects.toThrow();
  const success=await f.service.complete(f.ref,{callId:f.parent.callId});
  expect(await f.service.fail(f.ref,failure)).toEqual(success);expect(await db.select().from(assets)).toHaveLength(1);
});
it("失败与观察并发只有一种事实落库，失败已结算后不能上传正文",async()=>{
  const f=await fixture();const results=await Promise.allSettled([f.service.fail(f.ref,{callId:f.parent.callId,failure:{kind:"needs_login"}}),f.service.observe(f.ref,{callId:f.parent.callId,observation})]);
  expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);
  const [parent]=await db.select().from(executionCalls).where(eq(executionCalls.id,f.parent.callId));
  expect(await db.select().from(executionEvidence)).toHaveLength(parent!.status==="settled"?0:1);
  expect(await db.select().from(assets)).toHaveLength(0);
});
it("失败请求拒绝伪造成功字段、跨调用、旧 fence 与取消后损坏上下文",async()=>{
  const f=await fixture(),other=await fixture(),raw={callId:f.parent.callId,failure:{kind:"needs_login"}};
  await expect(f.service.fail(f.ref,{...raw,assetId:"fake"})).rejects.toThrow();
  await expect(f.service.fail(f.ref,{callId:other.parent.callId,failure:{kind:"needs_login"}})).rejects.toThrow();
  await expect(f.service.fail({...f.ref,fenceToken:"stale"},raw)).rejects.toThrow();
  await f.tasks.command(f.ctx,{taskIds:[f.ref.executionTaskId],command:"cancel",idempotencyKey:"cancel-bad-context"});
  const [task]=await db.select().from(executionTasks).where(eq(executionTasks.id,f.ref.executionTaskId));
  const payload=structuredClone(task!.payload) as any;payload.hostContext.chatContext.webReadUrl="https://forged.example";
  await db.update(executionTasks).set({payload}).where(eq(executionTasks.id,f.ref.executionTaskId));
  await expect(f.service.fail(f.ref,raw)).rejects.toThrow();
});

async function seedCache(f:Awaited<ReturnType<typeof fixture>>){
 const asset=await f.assetsService.createGeneratedAsset(f.ctx,{assetType:"document",name:"正文·已有网页",bytes:new TextEncoder().encode(observation.text),mimeType:"text/plain",pending:true});
 await f.assetsService.mergeAiAnnotation(f.ctx,asset.id,{sourceUrl:"https://example.com/bound"});
 return asset;
}
it.each(["observe","cache"])("真实 %s 提交后 ACK 丢失，Worker 回读原事实且只保存一份素材",async point=>{
 const f=await fixture(1,undefined,false);if(point==="cache")await seedCache(f);
 let reads=0,byteReads=0,observes=0,caches=0,prepares=0;
 const get=f.storage.getObject.bind(f.storage);f.storage.getObject=async(...args)=>{byteReads++;return get(...args);};
 const signal=new AbortController().signal;
 const call=async(port:WorkerPort,raw:unknown)=>{
  if(port==="prepareChatWebRead"){prepares++;return f.service.prepare(f.ref,raw,signal);}
  if(port==="readChatWebReadCache"){caches++;const result=await f.service.cache(f.ref,raw,signal);if(point==="cache")throw new Error("已提交缓存但 ACK 丢失");return result;}
  if(port==="observeChatWebRead"){observes++;await f.service.observe(f.ref,raw,signal);throw new Error("已提交观察但 ACK 丢失");}
  if(port==="completeChatWebRead")return f.service.complete(f.ref,raw,signal);
  throw new Error("不应重新执行或结算普通失败");
 };
 const result=await runDurableAgenticTool({modelCallId:f.model.id,toolCallId:"read"},{signal,call:async(port,raw)=>{
  if(port==="reserveAgenticTool")return f.toolPorts.reserve(f.ref,raw);
  if(port==="startAgenticTool")return f.toolPorts.start(f.ref,raw);
  if(port==="settleAgenticTool")return f.toolPorts.settle(f.ref,raw);
  throw new Error("非预期的持久工具端口");
 },execute:()=>runChatWebReadInWorker(f.parent.callId,signal,{call,readDocument:async()=>{reads++;return observation;},searchers:async()=>[],hasSession:async()=>false})});
 expect(result.status).toBe("ok");expect(prepares).toBe(2);expect(caches).toBe(1);expect(reads).toBe(point==="observe"?1:0);expect(observes).toBe(point==="observe"?1:0);
 if(point==="cache")expect(byteReads).toBe(1);
 expect(await db.select().from(assets)).toHaveLength(1);expect(await db.select().from(assetFiles)).toHaveLength(1);expect(await db.select().from(executionEvidence)).toHaveLength(1);
 expect(await f.service.prepare(f.ref,{callId:f.parent.callId})).toMatchObject({output:result});
 const [parent]=await db.select().from(executionCalls).where(eq(executionCalls.id,f.parent.callId));expect(parent?.status).toBe("settled");
});
it.each(["cancel","fence"])("观察 ACK 丢失后 %s 使回读失效，禁止继续创建素材",async point=>{
 const f=await fixture(),signal=new AbortController().signal;let completions=0,reads=0;
 const call=async(port:WorkerPort,raw:unknown)=>{
  if(port==="prepareChatWebRead")return f.service.prepare(f.ref,raw,signal);
  if(port==="readChatWebReadCache")return f.service.cache(f.ref,raw,signal);
  if(port==="observeChatWebRead"){
   await f.service.observe(f.ref,raw,signal);
   if(point==="cancel")await f.tasks.command(f.ctx,{taskIds:[f.ref.executionTaskId],command:"cancel",idempotencyKey:"ack-cancel"});
   else await db.update(executionTasks).set({fenceToken:"new-fence"}).where(eq(executionTasks.id,f.ref.executionTaskId));
   throw new Error("ACK lost");
  }
  if(port==="completeChatWebRead")completions++;
  throw new Error("禁止继续动作");
 };
 await expect(runChatWebReadInWorker(f.parent.callId,signal,{call,readDocument:async()=>{reads++;return observation;},searchers:async()=>[],hasSession:async()=>false})).rejects.toMatchObject({outcome:"unknown_result"});
 expect(reads).toBe(1);expect(completions).toBe(0);expect(await db.select().from(assets)).toHaveLength(0);expect(await db.select().from(executionEvidence)).toHaveLength(1);
});
it("缓存命中原子修复文件和父回执，无新增素材或浏览器会话",async()=>{
 const f=await fixture(),asset=await seedCache(f);
 f.service.readSession=async()=>{throw new Error("不能读取浏览器会话");};
 const result=await f.service.cache(f.ref,{callId:f.parent.callId});
 expect(result).toMatchObject({status:"hit",output:{status:"ok",data:{fromCache:true,asset:{id:asset.id,extractor:"cached"},window:{length:1000,total:observation.text.length}}}});
 expect(await db.select().from(assets)).toHaveLength(1);
 expect(await db.select().from(executionEvidence)).toMatchObject([{metadata:{kind:"chat.web.read.cache",assetId:asset.id}}]);
 expect(await db.select().from(assetFiles)).toMatchObject([{extractedText:observation.text,extractStatus:"done"}]);
 if(result.status!=="hit")throw new Error("预期缓存命中");
 expect(await f.service.complete(f.ref,{callId:f.parent.callId})).toEqual(result.output);
 expect(await f.service.prepare(f.ref,{callId:f.parent.callId})).toMatchObject({observation:null,output:result.output});
});
it("缓存结算回滚同时撤销证据和文件修复，再试只提交一次",async()=>{
 const f=await fixture();await seedCache(f);
 await db.execute(sql.raw("CREATE FUNCTION fail_cache_parent() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.kind = 'tool' AND NEW.status = 'settled' THEN RAISE EXCEPTION 'cache parent failed'; END IF; RETURN NEW; END; $$;"));
 await db.execute(sql.raw("CREATE TRIGGER fail_cache_parent BEFORE UPDATE ON execution_calls FOR EACH ROW EXECUTE FUNCTION fail_cache_parent();"));
 await expect(f.service.cache(f.ref,{callId:f.parent.callId})).rejects.toThrow();
 expect(await db.select().from(executionEvidence)).toHaveLength(0);expect(await db.select().from(assetFiles)).toMatchObject([{extractedText:null}]);
 await db.execute(sql.raw("DROP TRIGGER fail_cache_parent ON execution_calls;"));
 expect(await f.service.cache(f.ref,{callId:f.parent.callId})).toMatchObject({status:"hit"});expect(await db.select().from(assets)).toHaveLength(1);
});
it("缓存回执已持久后素材变化或取消只重放，不读字节或重建素材",async()=>{
 const f=await fixture(),asset=await seedCache(f),request={callId:f.parent.callId};
 const result=await f.service.cache(f.ref,request);
 await db.update(assets).set({status:"deleted"}).where(eq(assets.id,asset.id));
 f.storage.getObject=async()=>{throw new Error("不应再读字节");};
 await f.tasks.command(f.ctx,{taskIds:[f.ref.executionTaskId],command:"cancel",idempotencyKey:"cache-cancel"});
 expect(await f.service.cache(f.ref,request)).toEqual(result);expect(await db.select().from(assets)).toMatchObject([{status:"deleted"}]);
});
it("缓存未命中不结算父调用；有新观察不转用另一份缓存",async()=>{
 const f=await fixture();expect(await f.service.cache(f.ref,{callId:f.parent.callId})).toEqual({status:"miss"});
 await f.service.observe(f.ref,{callId:f.parent.callId,observation});await seedCache(f);
 expect(await f.service.cache(f.ref,{callId:f.parent.callId})).toEqual({status:"miss"});
 expect(await db.select().from(executionEvidence)).toMatchObject([{metadata:{kind:"chat.web.read"}}]);
});

it("超出单页预算的缓存不修复或新增素材，不结算成功",async()=>{
 const f=await fixture();const asset=await f.assetsService.createGeneratedAsset(f.ctx,{assetType:"document",name:"超限",bytes:new TextEncoder().encode("x".repeat(2*1024*1024+1)),mimeType:"text/plain",pending:true});
 await f.assetsService.mergeAiAnnotation(f.ctx,asset.id,{sourceUrl:"https://example.com/bound"});
 await expect(f.service.cache(f.ref,{callId:f.parent.callId})).rejects.toThrow("2 MiB");
 expect(await db.select().from(executionEvidence)).toHaveLength(0);expect(await db.select().from(assetFiles)).toMatchObject([{extractedText:null}]);
});
it("缓存父回执写入等待后停止，正文修复与缓存证据一并回滚",async()=>{
 const f=await fixture();await seedCache(f);const controller=new AbortController();let matched=false;
 const transaction=client.transaction.bind(client);
 client.transaction=((callback:any)=>transaction(async(tx:any)=>{
  const query=tx.query.bind(tx);tx.query=async(text:string,...args:any[])=>{const result=await query(text,...args);if(!matched && /update "execution_calls"/i.test(text)){matched=true;controller.abort();}return result;};return callback(tx);
 })) as typeof client.transaction;
 try{await expect(f.service.cache(f.ref,{callId:f.parent.callId},controller.signal)).rejects.toThrow();expect(matched).toBe(true);}finally{client.transaction=transaction;}
 expect(await db.select().from(executionEvidence)).toHaveLength(0);expect(await db.select().from(assetFiles)).toMatchObject([{extractedText:null}]);
 const [parent]=await db.select().from(executionCalls).where(eq(executionCalls.id,f.parent.callId));expect(parent!.status).toBe("started");
});

it("搜索配置仅经当前网页父调用返回，不进入任务与工具账本",async()=>{
 let owner:any;const config={provider:"tavily",baseUrl:null,model:"",token:"fixture-private-search-token"};
 const f=await fixture(1,async ctx=>{owner=ctx;return config;});
 expect(await f.service.resolveSearch(f.ref,{callId:f.parent.callId})).toEqual({configured:config});expect(owner).toMatchObject({userId:f.ctx.userId,accountId:f.ctx.accountId});
 const persisted=JSON.stringify({tasks:await db.select().from(executionTasks),calls:await db.select().from(executionCalls),evidence:await db.select().from(executionEvidence)});expect(persisted).not.toContain(config.token);
 const other=await fixture();await expect(f.service.resolveSearch(f.ref,{callId:other.parent.callId})).rejects.toThrow();
 await expect(f.service.resolveSearch(f.ref,{callId:f.parent.callId,provider:"forged",accountId:"other"})).rejects.toThrow();
});
it("搜索配置读取期间取消后不能返回密钥，未装配和读取故障不伪装未配置",async()=>{
 const controller=new AbortController();const f=await fixture(1,async()=>{controller.abort();return {provider:"tavily",baseUrl:null,model:"",token:"fixture-private"};});
 await expect(f.service.resolveSearch(f.ref,{callId:f.parent.callId},controller.signal)).rejects.toThrow();
 const missing=await fixture();await expect(missing.service.resolveSearch(missing.ref,{callId:missing.parent.callId})).rejects.toThrow();
 const failed=await fixture(1,async()=>{throw new Error("config read failed");});await expect(failed.service.resolveSearch(failed.ref,{callId:failed.parent.callId})).rejects.toThrow("config read failed");
});

it("T-957 显式刷新跳过旧页缓存，新事实提交后同调用仍幂等",async()=>{
 const f=await fixture(1,undefined,true,{refresh:true}),old=await seedCache(f);
 expect(await f.service.cache(f.ref,{callId:f.parent.callId})).toEqual({status:"miss"});
 expect(await db.select().from(executionEvidence)).toHaveLength(0);
 const updated={...observation,text:"迁移后的完整新正文".repeat(300)};
 await f.service.observe(f.ref,{callId:f.parent.callId,observation:updated});
 const result=await f.service.complete(f.ref,{callId:f.parent.callId});
 expect(result.data).toMatchObject({window:{total:updated.text.length}});
 expect(await f.service.cache(f.ref,{callId:f.parent.callId})).toEqual({status:"hit",output:result});
 const stored=await db.select().from(assets);expect(stored).toHaveLength(2);expect(stored.find(a=>a.id===old.id)?.status).toBe("pending");
});
it("T-957 后续翻窗即使重复 refresh 也复用正文，不重新抓取",async()=>{
 const f=await fixture(1,undefined,true,{refresh:true,offset:1000});await seedCache(f);
 expect(await f.service.cache(f.ref,{callId:f.parent.callId})).toMatchObject({status:"hit",output:{data:{fromCache:true,window:{offset:1000}}}});
});

it("T-957 Worker 网页失败不泄漏原异常，保留真实失败分类",async()=>{
 const f=await fixture();
 const output=await f.service.fail(f.ref,{callId:f.parent.callId,failure:{kind:"read_error",code:"transient",message:"内部规则第15条 MODEL_SCHEMA_ERROR sk-secret-canary"}});
 expect(output).toMatchObject({status:"error",error:{code:"transient"},summary:"这次网页读取未完成，可稍后重试或换一个公开来源。"});
 expect(JSON.stringify(output)).not.toContain("MODEL_SCHEMA_ERROR");expect(JSON.stringify(output)).not.toContain("sk-secret-canary");
});

async function nextPage(f: Awaited<ReturnType<typeof fixture>>, offset: number, refresh = false, withLaterRefresh = false, startParent = true) {
 const key=`page-${++sequence}`;
 const model=await f.ledger.reserve(f.ref,{operationKey:key,kind:"model",inputDigest:`sha256:${"b".repeat(64)}`,reservedTokens:128});
 await f.ledger.start(f.ref,model.id);
 const content=[{type:"tool-call",toolCallId:key,toolName:"web_read",input:JSON.stringify({url:"https://example.com/bound",offset,maxChars:1000,refresh})}];
 if(withLaterRefresh)content.push({type:"tool-call",toolCallId:`${key}-refresh`,toolName:"web_read",input:JSON.stringify({url:"https://example.com/bound",offset:0,maxChars:1000,refresh:true})});
 await f.ledger.settle(f.ref,model.id,{status:"settled",usage:{},providerResult:{content,finishReason:{unified:"tool-calls"},usage:{inputTokens:{total:2},outputTokens:{total:3}},warnings:[]}});
 const parent=await f.toolPorts.reserve(f.ref,{modelCallId:model.id,toolCallId:key});
 if(startParent)await f.toolPorts.start(f.ref,{callId:parent.callId});
 return {...parent,modelId:model.id,modelToolCallId:key,refreshId:`${key}-refresh`};
}

it.each([false,true])("T-957 分页固定本任务前页证据，忽略之后更新的账号缓存（首读缓存=%s）",async cached=>{
 const f=await fixture();
 let first;
 if(cached){await seedCache(f);const hit=await f.service.cache(f.ref,{callId:f.parent.callId});if(hit.status!=="hit")throw Error("未命中");first=hit.output;}
 else{await f.service.observe(f.ref,{callId:f.parent.callId,observation});first=await f.service.complete(f.ref,{callId:f.parent.callId});}
 const fresh=await f.assetsService.createGeneratedAsset(f.ctx,{assetType:"document",name:"另一个任务刷新",bytes:new TextEncoder().encode("新版本".repeat(9000)),mimeType:"text/plain",pending:true});
 await f.assetsService.mergeAiAnnotation(f.ctx,fresh.id,{sourceUrl:"https://example.com/bound"});
 await db.update(assets).set({createdAt:"2099-01-01T00:00:00.000Z"}).where(eq(assets.id,fresh.id));
 const parent=await nextPage(f,1000,true);
 const hit=await f.service.cache(f.ref,{callId:parent.callId});
 expect(hit).toMatchObject({status:"hit",output:{sideEffect:"none",evidence:[{entityId:first.evidence[0]!.entityId,version:first.evidence[0]!.version}],data:{window:{offset:1000,length:1000,total:observation.text.length}}}});
 if(hit.status!=="hit")throw Error("未命中");
 expect((hit.output.data as {text:string}).text).toContain(observation.text.slice(1000,2000));
 if(cached)expect(hit.output.data).not.toHaveProperty("asset.finalUrl");
 else expect(hit.output.data).toHaveProperty("asset.finalUrl",observation.finalUrl);
 expect(await db.select().from(executionEvidence)).toHaveLength(1);
 expect(await f.service.cache(f.ref,{callId:parent.callId})).toEqual(hit);
});

it("T-957 九页连续读取不把同一份全文重复计入证据预算",async()=>{
 const f=await fixture(),large={...observation,text:"a".repeat(1024*1024)};
 await f.service.observe(f.ref,{callId:f.parent.callId,observation:large});
 await f.service.complete(f.ref,{callId:f.parent.callId});
 for(let page=1;page<=8;page++){
  const parent=await nextPage(f,page*1000);
  const hit=await f.service.cache(f.ref,{callId:parent.callId});
  expect(hit).toMatchObject({status:"hit",output:{data:{window:{offset:page*1000,total:large.text.length}}}});
  if(hit.status!=="hit")throw Error("未命中");
  expect((JSON.stringify(hit.output.data).match(/沿用本任务已读正文版本/g)??[])).toHaveLength(1);
 }
 expect(await db.select().from(executionEvidence)).toHaveLength(1);
 expect(await db.select().from(assets)).toHaveLength(1);
});

it("T-957 同模型回合较晚刷新先完成，较早分页仍读取原版本",async()=>{
 const f=await fixture();await f.service.observe(f.ref,{callId:f.parent.callId,observation});
 const original=await f.service.complete(f.ref,{callId:f.parent.callId});
 const page=await nextPage(f,1000,false,true);
 const fresh=await f.toolPorts.reserve(f.ref,{modelCallId:page.modelId,toolCallId:page.refreshId});await f.toolPorts.start(f.ref,{callId:fresh.callId});
 await f.service.observe(f.ref,{callId:fresh.callId,observation:{...observation,text:"较晚刷新".repeat(5000)}});
 await f.service.complete(f.ref,{callId:fresh.callId});
 const hit=await f.service.cache(f.ref,{callId:page.callId});
 expect(hit).toMatchObject({status:"hit",output:{evidence:[{entityId:original.evidence[0]!.entityId}],data:{window:{total:observation.text.length}}}});
 expect(await db.select().from(executionEvidence)).toHaveLength(2);
});

it("T-957 完整持久工具调用分页与 ACK 丢失恢复不重读网页或新增素材",async()=>{
 const f=await fixture();await f.service.observe(f.ref,{callId:f.parent.callId,observation});
 await f.service.complete(f.ref,{callId:f.parent.callId});
 const page=await nextPage(f,1000,false,false,false),signal=new AbortController().signal;let executions=0;
 const result=await runDurableAgenticTool({modelCallId:page.modelId,toolCallId:page.modelToolCallId},{signal,
  call:async(port,raw)=>{
   if(port==="reserveAgenticTool")return f.toolPorts.reserve(f.ref,raw);
   if(port==="startAgenticTool")return f.toolPorts.start(f.ref,raw);
   if(port==="settleAgenticTool")return f.toolPorts.settle(f.ref,raw);
   throw Error("非预期端口");
  },
  execute:async()=>{executions++;return runChatWebReadInWorker(page.callId,signal,{
   call:async(port,raw)=>{
    if(port==="prepareChatWebRead")return f.service.prepare(f.ref,raw,signal);
    if(port==="readChatWebReadCache"){await f.service.cache(f.ref,raw,signal);throw Error("分页已结算 ACK 丢失");}
    throw Error("不应写新观察或新素材");
   },readDocument:async()=>{throw Error("不应重新访问网页");},searchers:async()=>{throw Error("不应搜索");},hasSession:async()=>{throw Error("不应读取会话");},
  });},
 });
 expect(result).toMatchObject({status:"ok",sideEffect:"none",data:{window:{offset:1000,length:1000}}});
 expect(executions).toBe(1);expect(await db.select().from(executionEvidence)).toHaveLength(1);expect(await db.select().from(assets)).toHaveLength(1);
});

it.each([false,true])("T-957 分页拒绝被修改的原正文，不能悄悄回退另一份缓存（缓存=%s）",async cached=>{
 const f=await fixture();
 if(cached){await seedCache(f);await f.service.cache(f.ref,{callId:f.parent.callId});}
 else{await f.service.observe(f.ref,{callId:f.parent.callId,observation});await f.service.complete(f.ref,{callId:f.parent.callId});}
 await db.update(executionEvidence).set({fullText:"篡改"}).where(eq(executionEvidence.originCallId,f.parent.callId));
 const parent=await nextPage(f,1000);
 await expect(f.service.cache(f.ref,{callId:parent.callId})).rejects.toThrow();
 const [call]=await db.select().from(executionCalls).where(eq(executionCalls.id,parent.callId));
 expect(call!.status).toBe("started");
 expect(await db.select().from(executionEvidence)).toHaveLength(1);
});

it("T-957 分页不读取另一账号证据或素材",async()=>{
 const first=await fixture();await first.service.observe(first.ref,{callId:first.parent.callId,observation});
 await first.service.complete(first.ref,{callId:first.parent.callId});
 const other=await fixture(1,undefined,true,{offset:1000});
 expect(await other.service.cache(other.ref,{callId:other.parent.callId})).toEqual({status:"miss"});
 await expect(first.service.cache(first.ref,{callId:other.parent.callId})).rejects.toThrow();
 expect(await db.select().from(executionEvidence)).toHaveLength(1);
});

it("T-957 分页取消不结算，新第一页刷新后再翻页使用新版本",async()=>{
 const f=await fixture();await f.service.observe(f.ref,{callId:f.parent.callId,observation});await f.service.complete(f.ref,{callId:f.parent.callId});
 const fresh=await nextPage(f,0,true),updated={...observation,text:"本任务重新读取".repeat(4000)};
 expect(await f.service.cache(f.ref,{callId:fresh.callId})).toEqual({status:"miss"});
 await f.service.observe(f.ref,{callId:fresh.callId,observation:updated});const first=await f.service.complete(f.ref,{callId:fresh.callId});
 const page=await nextPage(f,1000);
 const hit=await f.service.cache(f.ref,{callId:page.callId});
 expect(hit).toMatchObject({status:"hit",output:{evidence:[{entityId:first.evidence[0]!.entityId}],data:{window:{total:updated.text.length}}}});
 const cancelled=await nextPage(f,2000);const controller=new AbortController();controller.abort();
 await expect(f.service.cache(f.ref,{callId:cancelled.callId},controller.signal)).rejects.toThrow();
 const [call]=await db.select().from(executionCalls).where(eq(executionCalls.id,cancelled.callId));expect(call!.status).toBe("started");
 expect(await db.select().from(executionEvidence)).toHaveLength(2);
});

it("T-957 跨域登录墙经 Worker 和真实宿主结算保留实际域，ACK 丢失不改域或访问新会话",async()=>{
 const f=await fixture();let settlements=0,reads=0;
 const signal=new AbortController().signal,ports:WorkerPort[]=[];
 const output=await runChatWebReadInWorker(f.parent.callId,signal,{
  call:async(port,raw)=>{
   ports.push(port);
   if(port==="prepareChatWebRead")return f.service.prepare(f.ref,raw,signal);
   if(port==="readChatWebReadCache")return f.service.cache(f.ref,raw,signal);
   if(port==="failChatWebRead"){const result=await f.service.fail(f.ref,raw);if(settlements++===0)throw Error("ACK 丢失");return result;}
   throw Error("不应读取或写入新域的会话");
  },
  readDocument:async()=>{reads++;throw new WebReaderLoginRequiredError(" Destination.Example.org ");},
  searchers:async()=>{throw Error("不应搜索");},hasSession:async()=>{throw Error("不应查询会话");},
 });
 expect(output).toMatchObject({status:"blocked",data:{needLogin:{domain:"destination.example.org"}}});
 expect(reads).toBe(1);expect(settlements).toBe(2);
 expect(ports).not.toContain("readChatWebSession");
 expect(await f.service.fail(f.ref,{callId:f.parent.callId,failure:{kind:"needs_login",domain:"another.example"}})).toEqual(output);
 expect(await db.select().from(assets)).toHaveLength(0);
});

it("T-957 旧登录失败载荷兼容原域",async()=>{
 const f=await fixture();
 expect(await f.service.fail(f.ref,{callId:f.parent.callId,failure:{kind:"needs_login"}})).toMatchObject({data:{needLogin:{domain:"example.com"}}});
});

it.each(["../private","https://example.com","example.com/path","exam\nple.com","a".repeat(254)])("T-957 登录提示拒绝非法域名 %s",async domain=>{
 const f=await fixture();
 await expect(f.service.fail(f.ref,{callId:f.parent.callId,failure:{kind:"needs_login",domain}})).rejects.toThrow();
 const [call]=await db.select().from(executionCalls).where(eq(executionCalls.id,f.parent.callId));expect(call!.status).toBe("started");
});


it("T-957 跨域最终来源保留至续页，篡改来源后拒绝继续",async()=>{
 const f=await fixture(),redirected={...observation,finalUrl:"https://docs.example.org/new#chapter"};
 await f.service.observe(f.ref,{callId:f.parent.callId,observation:redirected});
 const first=await f.service.complete(f.ref,{callId:f.parent.callId});
 expect(first.data).toHaveProperty("asset.finalUrl",redirected.finalUrl);
 const next=await nextPage(f,1000);
 expect(await f.service.cache(f.ref,{callId:next.callId})).toHaveProperty("output.data.asset.finalUrl",redirected.finalUrl);
 await db.update(executionEvidence).set({sourceUrl:"https://altered.example.org/"}).where(eq(executionEvidence.originCallId,f.parent.callId));
 const later=await nextPage(f,2000);
 await expect(f.service.cache(f.ref,{callId:later.callId})).rejects.toThrow("持久网页观察与原调用不符");
});

it.each([401,403,404,429,500,503])("T-957 HTTP %i 真实宿主结算与重放保持准确登录建议和普通文案",async status=>{
 const f=await fixture();
 const input={callId:f.parent.callId,failure:{kind:"http_blocked" as const,status,message:"fixture raw internal",alternates:[]}};
 const result=await f.service.fail(f.ref,input);
 expect(result).toMatchObject({status:"error",sideEffect:"none",data:{httpStatus:status,loginSuggested:status===401||status===403,asset:null}});
 expect(JSON.stringify(result)).not.toMatch(/fixture raw internal|material\.gather|如实告诉用户/);
 expect(await f.service.fail(f.ref,input)).toEqual(result);
 expect(await db.select().from(assets)).toHaveLength(0);
});
