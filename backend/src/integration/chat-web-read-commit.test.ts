import {createBrowserSessionsService} from "../modules/browser-sessions";
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
const observation = { text: "完整网页证据".repeat(4000), title: "观察标题", finalUrl: "https://example.com/redirect", extractor: "chatgpt-share", extractPath: "ssr", turnCount: 40 };
beforeEach(async () => { const opened = await createDb(); db = opened.db; client=opened.client; close = () => opened.client.close(); root = await mkdtemp(join(tmpdir(), "t915-chat-read-")); });
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
  const storage = createLocalFsObjectStorage({ rootPath: root, publicBaseUrl: "/blob" }, { nextKey: () => `key-${++sequence}` });
  const assetsService = createAssetsService(createAssetRepository(db, ids), async () => storage, ids);
  const sessions=createBrowserSessionsService({db,now,nextId:ids.nextId,masterKey:Buffer.alloc(32,7)});
  const toolPorts = createExecutionChatToolPorts(db, { now, budget, tools: restoredTools, webRead:{assets:assetsService,objectStorageForCtx:async()=>storage,sessions} });
  const ledger = createExecutionCallLedgerService(db, { now, budget });
  const model = await ledger.reserve(ref, { operationKey: "root", kind: "model", inputDigest: `sha256:${"a".repeat(64)}`, reservedTokens: 128 });
  await ledger.start(ref, model.id);
  await ledger.settle(ref, model.id, { status: "settled", usage: {}, providerResult: { content: Array.from({ length: toolCount }, (_, i) => ({ type: "tool-call" as const, toolCallId: i === 0 ? "read" : `read-${i}`, toolName: "web_read", input: '{"url":"https://other.example/model","offset":0,"maxChars":1000}' })), finishReason: { unified: "tool-calls" }, usage: { inputTokens: { total: 2 }, outputTokens: { total: 3 } }, warnings: [] } });
  const parent = await toolPorts.reserve(ref, { modelCallId: model.id, toolCallId: "read" });
  await toolPorts.start(ref, { callId: parent.callId });
  const service=toolPorts.webRead!;
  return { ctx, ref, tasks, service, parent, ledger, storage, toolPorts, model, sessions };
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
