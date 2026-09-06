import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { workerPortInputSchemas } from "@creatoros/contract/execution-worker";
import { createDb, type Db } from "@creatoros/backend";
import { createPersistentTaskService } from "./persistent-task.service";
import { createExecutionCallLedgerService } from "./execution-call-ledger.service";
const ctx = {userId: "ledger-user", accountId: "ledger-account", requestId: "test", source: "user" as const};
const input = {operationKey: "generate", kind: "model" as const, inputDigest: "sha256:"+"a".repeat(64), reservedTokens: 20};
describe("T-915 持久调用账本", () => {
  let db: Db; let close: () => Promise<void>;
  beforeAll(async () => {const c = await createDb(); db = c.db; close = () => c.client.close();});
  afterAll(async () => close?.());
  async function fixture(id: string, budget = {maxCalls: 2, maxTokens: 50, deadlineMs: 60000}) {
    const now = () => "2026-09-05T00:00:00.000Z";
    const tasks = createPersistentTaskService(db, {now});
    const task = await tasks.enqueue(ctx, {kind: "ai_task", ownerType: "ai_task", ownerId: id, idempotencyKey: id, payload: {}});
    const claim = await tasks.claimTask({taskId: task.id, workerId: "worker"});
    if (!claim) throw new Error("claim missing");
    const ref = {executionTaskId: task.id, attempt: claim.lease.attempt, fenceToken: claim.lease.fenceToken};
    const ledger = createExecutionCallLedgerService(db, {now, budget});
    return {ref, task, tasks, ledger, now};
  }
  it("并发重复预留只占一次预算，同一次调用只能启动一次，实际缓存用量不重复计入", async () => {
    const f = await fixture("idempotent");
    const [a,b] = await Promise.all([f.ledger.reserve(f.ref,input), f.ledger.reserve(f.ref,input)]);
    expect(a.id).toBe(b.id);
    await f.ledger.start(f.ref,a.id);
    await expect(f.ledger.start(f.ref,a.id)).rejects.toMatchObject({name:"ConflictError"});
    await f.ledger.settle(f.ref,a.id,{status:"settled",usage:{inputTokens:10,outputTokens:5,totalTokens:15,inputTokenDetails:{cacheReadTokens:8}}});
    const state = await f.ledger.inspect(f.ref);
    expect(state.spentTokens).toBe(15); expect(state.reservedTokens).toBe(0); expect(state.calls).toHaveLength(1);
  });
  it("重新创建服务或暂停恢复不能重置预算，旧执行不能启动或结算", async () => {
    const f = await fixture("resume"); const call = await f.ledger.reserve(f.ref,{...input,reservedTokens:40});
    await f.ledger.start(f.ref,call.id);
    await f.ledger.settle(f.ref,call.id,{status:"settled",usage:{totalTokens:40}});
    await f.tasks.command(ctx,{taskIds:[f.task.id],command:"pause",idempotencyKey:"pause"});
    await f.tasks.acknowledgeControl({taskId:f.task.id,workerId:"worker",attempt:f.ref.attempt});
    await f.tasks.command(ctx,{taskIds:[f.task.id],command:"resume",idempotencyKey:"resume"});
    const claim = await f.tasks.claimTask({taskId:f.task.id,workerId:"worker"}); if(!claim) throw new Error("claim missing");
    const fresh = {...f.ref,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
    const replacement = createExecutionCallLedgerService(db,{now:f.now,budget:{maxCalls:999,maxTokens:99999,deadlineMs:999999}});
    await expect(replacement.reserve(fresh,{...input,operationKey:"another"})).rejects.toMatchObject({name:"ConflictError"});
    expect((await replacement.inspect(fresh)).budget?.maxTokens).toBe(50);
    await expect(f.ledger.settle(f.ref,call.id,{status:"settled",usage:{totalTokens:0}})).rejects.toMatchObject({name:"ConflictError"});
  });
  it("未知提交禁止新动作；取消后可同键结算，重复结算不重复计费", async () => {
    const f = await fixture("unknown"); const call = await f.ledger.reserve(f.ref,input); await f.ledger.start(f.ref,call.id);
    await f.ledger.settle(f.ref,call.id,{status:"unknown"});
    await expect(f.ledger.reserve(f.ref,{...input,operationKey:"blind-replay"})).rejects.toMatchObject({name:"ConflictError"});
    await f.tasks.command(ctx,{taskIds:[f.task.id],command:"cancel",idempotencyKey:"cancel"});
    await f.tasks.acknowledgeControl({taskId:f.task.id,workerId:"worker",attempt:f.ref.attempt});
    await f.ledger.settle(f.ref,call.id,{status:"settled",usage:{totalTokens:12}});
    await f.ledger.settle(f.ref,call.id,{status:"settled",usage:{totalTokens:12}});
    expect((await f.ledger.inspect(f.ref)).spentTokens).toBe(12);
    expect((await f.tasks.get(ctx,f.task.id)).status).toBe("cancelled");
  });
  it("已确认结果与用量不能被迟到回执降级或矛盾计量覆盖", async () => {
    const f = await fixture("monotonic"); const call = await f.ledger.reserve(f.ref,input);
    await f.ledger.start(f.ref,call.id);
    await f.ledger.settle(f.ref,call.id,{status:"settled",usage:{},resultRef:"candidate:1",resultText:"已生成正文"});
    expect((await f.ledger.settle(f.ref,call.id,{status:"unknown"})).resultRef).toBe("candidate:1");
    expect((await f.ledger.inspect(f.ref)).calls[0]?.resultText).toBe("已生成正文");
    await expect(f.ledger.settle(f.ref,call.id,{status:"settled",usage:{},resultText:"篡改正文"})).rejects.toMatchObject({name:"ConflictError"});
    expect((await f.ledger.inspect(f.ref)).spentTokens).toBeNull();
    expect((await f.ledger.inspect(f.ref)).reservedTokens).toBe(20);
    await expect(f.ledger.settle(f.ref,call.id,{status:"settled",usage:{totalTokens:0,inputTokens:40}})).rejects.toMatchObject({name:"ConflictError"});
    await expect(f.ledger.settle(f.ref,call.id,{status:"settled",usage:{inputTokens:0,inputTokenDetails:{cacheReadTokens:40}}})).rejects.toMatchObject({name:"ConflictError"});
    await expect(f.ledger.settle(f.ref,call.id,{status:"settled",usage:{totalTokens:10,outputTokenDetails:{reasoningTokens:11}}})).rejects.toMatchObject({name:"ConflictError"});
    await expect(f.ledger.settle(f.ref,call.id,{status:"settled",usage:{totalTokens:0,inputTokens:40,outputTokens:10}})).rejects.toMatchObject({name:"ConflictError"});
    expect((await f.ledger.settle(f.ref,call.id,{status:"settled",usage:{totalTokens:15}})).resultRef).toBe("candidate:1");
    await expect(f.ledger.settle(f.ref,call.id,{status:"settled",usage:{totalTokens:0}})).rejects.toMatchObject({name:"ConflictError"});
    await expect(f.ledger.settle(f.ref,call.id,{status:"settled",usage:{inputTokens:40}})).rejects.toMatchObject({name:"ConflictError"});
    expect((await f.ledger.inspect(f.ref)).spentTokens).toBe(15);
  });
  it("预留后的持久截止时间仍限制启动", async () => {
    const f = await fixture("deadline");
    let stamp = f.now();
    const ledger = createExecutionCallLedgerService(db,{now:()=>stamp,budget:{maxCalls:2,maxTokens:50,deadlineMs:1000}});
    const call = await ledger.reserve(f.ref,input);
    stamp = "2026-09-05T00:00:02.000Z";
    await expect(ledger.start(f.ref,call.id)).rejects.toMatchObject({name:"ConflictError"});
  });
  it("明确拒绝的重试保留操作键并消耗新的调用次数，并发重试去重", async () => {
    const f = await fixture("rejected-retry"); const call = await f.ledger.reserve(f.ref,input);
    await f.ledger.start(f.ref,call.id); await f.ledger.settle(f.ref,call.id,{status:"rejected"});
    const retry = {...input,retryOfCallId:call.id};
    const [a,b] = await Promise.all([f.ledger.reserve(f.ref,retry),f.ledger.reserve(f.ref,retry)]);
    expect(a.id).toBe(b.id); expect(a.id).not.toBe(call.id); expect(a.operationKey).toBe(call.operationKey);
    await f.ledger.start(f.ref,a.id); await f.ledger.settle(f.ref,a.id,{status:"rejected"});
    await expect(f.ledger.reserve(f.ref,{...input,retryOfCallId:a.id})).rejects.toMatchObject({name:"ConflictError"});
  });

  it("实际超额结算保留真值，并阻止已经预留的下一次调用启动", async () => {
    const f = await fixture("overrun");
    const a = await f.ledger.reserve(f.ref,input);
    const b = await f.ledger.reserve(f.ref,{...input,operationKey:"next"});
    await f.ledger.start(f.ref,a.id);
    await f.ledger.settle(f.ref,a.id,{status:"settled",usage:{totalTokens:60}});
    expect((await f.ledger.inspect(f.ref)).spentTokens).toBe(60);
    await expect(f.ledger.start(f.ref,b.id)).rejects.toMatchObject({name:"ConflictError"});
  });
  it("不能使用其他任务的调用ID，操作键不能换输入", async () => {
    const a = await fixture("owner-a"); const b = await fixture("owner-b");
    const call = await a.ledger.reserve(a.ref,input); await a.ledger.start(a.ref,call.id);
    await expect(b.ledger.settle(b.ref,call.id,{status:"settled",usage:{totalTokens:0}})).rejects.toMatchObject({name:"ConflictError"});
    await expect(a.ledger.reserve(a.ref,{...input,inputDigest:"sha256:"+"b".repeat(64)})).rejects.toMatchObject({name:"ConflictError"});
  });

  it("模型原回执约束计量，undefined不能抹掉已知用量，回执不能改写",async()=>{
    const f=await fixture("provider-receipt");const call=await f.ledger.reserve(f.ref,input);await f.ledger.start(f.ref,call.id);
    const providerResult={content:[{type:"text",text:"正文"}],finishReason:{unified:"stop",raw:"stop"},usage:{inputTokens:{total:10,noCache:10},outputTokens:{total:5,text:5}},warnings:[]};
    await expect(f.ledger.settle(f.ref,call.id,{status:"settled",providerResult,usage:{inputTokens:undefined,outputTokens:undefined,totalTokens:0}})).rejects.toMatchObject({name:"ConflictError"});
    await f.ledger.settle(f.ref,call.id,{status:"settled",providerResult,usage:{}});
    expect((await f.ledger.inspect(f.ref)).spentTokens).toBe(15);
    await f.ledger.settle(f.ref,call.id,{status:"unknown"});
    expect((await f.ledger.inspect(f.ref)).calls[0]?.providerResult).toEqual(providerResult);
    await expect(f.ledger.settle(f.ref,call.id,{status:"settled",providerResult:{...providerResult,content:[{type:"text",text:"篡改"}]},usage:{}})).rejects.toMatchObject({name:"ConflictError"});
  });

  it("子模型共用预算、保留父归属且成功父回执不能越过未结算子调用", async () => {
    const f = await fixture("nested-budget");
    const parent = await f.ledger.reserve(f.ref,{...input,kind:"tool",operationKey:"parent",reservedTokens:0});
    await f.ledger.start(f.ref,parent.id);
    const childInput = {...input,parentCallId:parent.id};
    const child = await f.ledger.reserve(f.ref,childInput);
    expect(child).toMatchObject({parentCallId:parent.id});
    await expect(f.ledger.settle(f.ref,parent.id,{status:"settled",usage:{totalTokens:0}})).rejects.toMatchObject({name:"ConflictError"});
    await f.ledger.start(f.ref,child.id);
    await expect(f.ledger.settle(f.ref,child.id,{status:"settled",usage:{totalTokens:15}})).rejects.toMatchObject({name:"ConflictError"});
    const providerResult={content:[{type:"text",text:"内部候选"}],finishReason:{unified:"stop"},usage:{inputTokens:{total:10},outputTokens:{total:5}},warnings:[]};
    await f.ledger.settle(f.ref,child.id,{status:"settled",usage:{},providerResult});
    await f.ledger.settle(f.ref,parent.id,{status:"settled",usage:{totalTokens:0}});
    expect((await f.ledger.reserve(f.ref,childInput)).id).toBe(child.id);
    expect((await f.ledger.inspect(f.ref)).spentTokens).toBe(15);
    await expect(f.ledger.reserve(f.ref,{...childInput,operationKey:"more"})).rejects.toMatchObject({name:"ConflictError"});
    await expect(f.ledger.reserve(f.ref,input)).rejects.toMatchObject({name:"ConflictError"});
  });
  it("父调用必须属于同一任务且已启动；模型不能充当父工具", async () => {
    const f = await fixture("nested-parent"), other = await fixture("nested-other");
    const parent = await other.ledger.reserve(other.ref,{...input,kind:"tool",reservedTokens:0});
    await other.ledger.start(other.ref,parent.id);
    await expect(f.ledger.reserve(f.ref,{...input,parentCallId:parent.id})).rejects.toMatchObject({name:"ConflictError"});
    const model = await f.ledger.reserve(f.ref,input);
    await f.ledger.start(f.ref,model.id);
    await expect(f.ledger.reserve(f.ref,{...input,operationKey:"child",parentCallId:model.id})).rejects.toMatchObject({name:"ConflictError"});
    const local = await fixture("nested-not-started");
    const reserved = await local.ledger.reserve(local.ref,{...input,kind:"tool",reservedTokens:0});
    await expect(local.ledger.reserve(local.ref,{...input,operationKey:"child",parentCallId:reserved.id})).rejects.toMatchObject({name:"ConflictError"});
  });
  it("子调用未知时父不能成功，不能换键或重试来源盲目重发", async () => {
    const f = await fixture("nested-unknown");
    const parent = await f.ledger.reserve(f.ref,{...input,kind:"tool",operationKey:"parent",reservedTokens:0});
    await f.ledger.start(f.ref,parent.id);
    const childInput = {...input,parentCallId:parent.id};
    const child = await f.ledger.reserve(f.ref,childInput); await f.ledger.start(f.ref,child.id);
    await f.ledger.settle(f.ref,child.id,{status:"unknown"});
    await expect(f.ledger.settle(f.ref,parent.id,{status:"settled",usage:{totalTokens:0}})).rejects.toMatchObject({name:"ConflictError"});
    await expect(f.ledger.reserve(f.ref,{...childInput,operationKey:"another"})).rejects.toMatchObject({name:"ConflictError"});
    await expect(f.ledger.reserve(f.ref,{...childInput,retryOfCallId:child.id})).rejects.toMatchObject({name:"ConflictError"});
    expect((await f.ledger.inspect(f.ref)).unknownUsage).toBe(true);
  });

  it("同键不能换父或把顶层调用改成子调用，子工具不能递归", async () => {
    const f=await fixture("nested-identity",{maxCalls:10,maxTokens:500,deadlineMs:60000});
    const a=await f.ledger.reserve(f.ref,{...input,kind:"tool",operationKey:"a",reservedTokens:0});
    const b=await f.ledger.reserve(f.ref,{...input,kind:"tool",operationKey:"b",reservedTokens:0});
    await f.ledger.start(f.ref,a.id); await f.ledger.start(f.ref,b.id);
    const child=await f.ledger.reserve(f.ref,{...input,parentCallId:a.id});
    await expect(f.ledger.reserve(f.ref,{...input,parentCallId:b.id})).rejects.toMatchObject({name:"ConflictError"});
    await expect(f.ledger.reserve(f.ref,input)).rejects.toMatchObject({name:"ConflictError"});
    await expect(f.ledger.reserve(f.ref,{...input,kind:"tool",operationKey:"nested-tool",parentCallId:a.id})).rejects.toMatchObject({name:"ConflictError"});
    await f.ledger.start(f.ref,child.id);
    await expect(f.ledger.reserve(f.ref,{...input,operationKey:"recursive",parentCallId:child.id})).rejects.toMatchObject({name:"ConflictError"});
  });
  it("父关闭和子预留并发，不会留下成功父下的在途子调用", async () => {
    const f=await fixture("nested-race");
    const parent=await f.ledger.reserve(f.ref,{...input,kind:"tool",operationKey:"parent",reservedTokens:0});
    await f.ledger.start(f.ref,parent.id);
    const results=await Promise.allSettled([
      f.ledger.reserve(f.ref,{...input,parentCallId:parent.id}),
      f.ledger.settle(f.ref,parent.id,{status:"settled",usage:{totalTokens:0}}),
    ]);
    expect(results.filter(result=>result.status==="fulfilled")).toHaveLength(1);
    const calls=(await f.ledger.inspect(f.ref)).calls;
    if(calls.find(call=>call.id===parent.id)!.status==="settled")expect(calls).toHaveLength(1);
    else expect(calls).toHaveLength(2);
  });
  it("子模型缺计量阻止父成功，补齐原回执用量后才可完成", async () => {
    const f=await fixture("nested-usage");
    const parent=await f.ledger.reserve(f.ref,{...input,kind:"tool",operationKey:"parent",reservedTokens:0});
    await f.ledger.start(f.ref,parent.id);
    const child=await f.ledger.reserve(f.ref,{...input,parentCallId:parent.id});await f.ledger.start(f.ref,child.id);
    await f.ledger.settle(f.ref,child.id,{status:"settled",usage:{},providerResult:{content:[{type:"text",text:"候选"}],finishReason:{unified:"stop"},usage:{inputTokens:{},outputTokens:{}},warnings:[]}});
    await expect(f.ledger.settle(f.ref,parent.id,{status:"settled",usage:{totalTokens:0}})).rejects.toMatchObject({name:"ConflictError"});
    await f.ledger.settle(f.ref,child.id,{status:"settled",usage:{inputTokens:4,outputTokens:2}});
    await f.ledger.settle(f.ref,parent.id,{status:"settled",usage:{totalTokens:0}});
    expect((await f.ledger.inspect(f.ref)).spentTokens).toBe(6);
  });
  it("明确拒绝子调用可结算父；子重试仍受同一调用次数预算", async () => {
    const f=await fixture("nested-rejected",{maxCalls:3,maxTokens:50,deadlineMs:60000});
    const parent=await f.ledger.reserve(f.ref,{...input,kind:"tool",operationKey:"parent",reservedTokens:0});await f.ledger.start(f.ref,parent.id);
    const request={...input,parentCallId:parent.id};
    const first=await f.ledger.reserve(f.ref,request);await f.ledger.start(f.ref,first.id);await f.ledger.settle(f.ref,first.id,{status:"rejected"});
    const next=await f.ledger.reserve(f.ref,{...request,retryOfCallId:first.id});await f.ledger.start(f.ref,next.id);await f.ledger.settle(f.ref,next.id,{status:"rejected"});
    expect(next.parentCallId).toBe(parent.id);
    await expect(f.ledger.reserve(f.ref,{...request,retryOfCallId:next.id})).rejects.toMatchObject({name:"ConflictError"});
    await f.ledger.settle(f.ref,parent.id,{status:"settled",usage:{totalTokens:0}});
    expect((await f.ledger.inspect(f.ref)).spentTokens).toBe(0);
  });
  it("子调用预留仍受父任务 token 限额限制", async () => {
    const f=await fixture("nested-token");
    const parent=await f.ledger.reserve(f.ref,{...input,kind:"tool",operationKey:"parent",reservedTokens:31});await f.ledger.start(f.ref,parent.id);
    await expect(f.ledger.reserve(f.ref,{...input,parentCallId:parent.id})).rejects.toMatchObject({name:"ConflictError"});
    expect((await f.ledger.inspect(f.ref)).calls).toHaveLength(1);
  });
  it("取消禁止新子调用和启动，但已执行子模型可保留真实迟到回执", async () => {
    const f=await fixture("nested-cancel",{maxCalls:4,maxTokens:100,deadlineMs:60000});
    const parent=await f.ledger.reserve(f.ref,{...input,kind:"tool",operationKey:"parent",reservedTokens:0});await f.ledger.start(f.ref,parent.id);
    const child=await f.ledger.reserve(f.ref,{...input,parentCallId:parent.id});await f.ledger.start(f.ref,child.id);
    const reserved=await f.ledger.reserve(f.ref,{...input,operationKey:"reserved",parentCallId:parent.id});
    await f.tasks.command(ctx,{taskIds:[f.task.id],command:"cancel",idempotencyKey:"cancel"});
    await expect(f.ledger.start(f.ref,reserved.id)).rejects.toMatchObject({name:"ConflictError"});
    await expect(f.ledger.reserve(f.ref,{...input,operationKey:"new",parentCallId:parent.id})).rejects.toMatchObject({name:"ConflictError"});
    await f.ledger.settle(f.ref,child.id,{status:"settled",usage:{},providerResult:{content:[],finishReason:{unified:"stop"},usage:{inputTokens:{total:4},outputTokens:{total:2}},warnings:[]}});
    expect((await f.ledger.inspect(f.ref)).spentTokens).toBe(6);
  });
  it("恢复租约不能直接继续旧 attempt 的父工具", async () => {
    const f=await fixture("nested-old-parent",{maxCalls:4,maxTokens:100,deadlineMs:60000});
    const parent=await f.ledger.reserve(f.ref,{...input,kind:"tool",operationKey:"parent",reservedTokens:0});await f.ledger.start(f.ref,parent.id);
    const child=await f.ledger.reserve(f.ref,{...input,parentCallId:parent.id});
    await f.tasks.command(ctx,{taskIds:[f.task.id],command:"pause",idempotencyKey:"pause"});
    await f.tasks.acknowledgeControl({taskId:f.task.id,workerId:"worker",attempt:f.ref.attempt});
    await f.tasks.command(ctx,{taskIds:[f.task.id],command:"resume",idempotencyKey:"resume"});
    const claim=await f.tasks.claimTask({taskId:f.task.id,workerId:"worker"});if(!claim)throw new Error("claim missing");
    const ref={...f.ref,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
    await expect(f.ledger.start(ref,child.id)).rejects.toMatchObject({name:"ConflictError"});
    await expect(f.ledger.reserve(ref,{...input,operationKey:"fresh",parentCallId:parent.id})).rejects.toMatchObject({name:"ConflictError"});
  });

  it("现有模型端口严格拒绝 Worker 自报父 ID", () => {
    expect(workerPortInputSchemas.reserveGenerationCall.safeParse({operationKey:"x/model/1",request:{},parentCallId:"forged"}).success).toBe(false);
    expect(workerPortInputSchemas.reserveCall.safeParse({operationKey:"x",maxOutputTokens:10,parentCallId:"forged"}).success).toBe(false);
  });

  it("父已有子调用不能伪装成未执行拒绝，禁止重试整棵调用树", async () => {
    const f=await fixture("nested-parent-reject",{maxCalls:6,maxTokens:100,deadlineMs:60000});
    const parent=await f.ledger.reserve(f.ref,{...input,kind:"tool",operationKey:"parent",reservedTokens:0});await f.ledger.start(f.ref,parent.id);
    const child=await f.ledger.reserve(f.ref,{...input,parentCallId:parent.id});
    await expect(f.ledger.settle(f.ref,parent.id,{status:"rejected"})).rejects.toMatchObject({name:"ConflictError"});
    await f.ledger.start(f.ref,child.id);
    await f.ledger.settle(f.ref,child.id,{status:"settled",usage:{},providerResult:{content:[],finishReason:{unified:"stop"},usage:{inputTokens:{total:1},outputTokens:{total:1}},warnings:[]}});
    await expect(f.ledger.settle(f.ref,parent.id,{status:"rejected"})).rejects.toMatchObject({name:"ConflictError"});
    await expect(f.ledger.reserve(f.ref,{...input,kind:"tool",operationKey:"parent",reservedTokens:0,retryOfCallId:parent.id})).rejects.toMatchObject({name:"ConflictError"});
    await f.ledger.settle(f.ref,parent.id,{status:"unknown"});
    expect((await f.ledger.inspect(f.ref)).calls.find(call=>call.id===parent.id)?.status).toBe("unknown");
  });

  it("存量账本升级保留原调用，重复执行迁移安全", async () => {
    const connection=await createDb();
    try {
      const tasks=createPersistentTaskService(connection.db);
      const task=await tasks.enqueue(ctx,{kind:"ai_task",ownerType:"ai_task",ownerId:"legacy",idempotencyKey:"legacy",payload:{}});
      const claim=await tasks.claimTask({taskId:task.id,workerId:"worker"});if(!claim)throw new Error("claim missing");
      const ref={executionTaskId:task.id,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
      const ledger=createExecutionCallLedgerService(connection.db,{budget:{maxCalls:2,maxTokens:50,deadlineMs:60000}});
      const original=await ledger.reserve(ref,input);
      // 独立内存库还原旧表形状后运行正式迁移，绝不访问用户数据库。
      await connection.client.exec("ALTER TABLE execution_calls DROP COLUMN parent_call_id");
      const migration=readFileSync(new URL("../../../drizzle/0084_execution_call_parent.sql",import.meta.url),"utf8");
      await connection.client.exec(migration);await connection.client.exec(migration);
      expect((await ledger.inspect(ref)).calls).toEqual([original]);
      expect((await ledger.reserve(ref,input)).id).toBe(original.id);
    } finally { await connection.client.close(); }
  });

});
