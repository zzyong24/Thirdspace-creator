import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import { createPersistentTaskService } from "./persistent-task.service";
import { createExecutionCallLedgerService } from "./execution-call-ledger.service";
const ctx = {userId: "ledger-user", accountId: "ledger-account", requestId: "test", source: "user" as const};
const input = {operationKey: "generate", kind: "model" as const, inputDigest: "sha256:"+"a".repeat(64), reservedTokens: 20};
describe("T-915 持久调用账本", () => {
  let db: Db; let close: () => Promise<void>;
  beforeAll(async () => {const c = await createDb(); db = c.db; close = () => c.client.close();});
  afterAll(async () => close?.());
  async function fixture(id: string) {
    const now = () => "2026-09-05T00:00:00.000Z";
    const tasks = createPersistentTaskService(db, {now});
    const task = await tasks.enqueue(ctx, {kind: "ai_task", ownerType: "ai_task", ownerId: id, idempotencyKey: id, payload: {}});
    const claim = await tasks.claimTask({taskId: task.id, workerId: "worker"});
    if (!claim) throw new Error("claim missing");
    const ref = {executionTaskId: task.id, attempt: claim.lease.attempt, fenceToken: claim.lease.fenceToken};
    const ledger = createExecutionCallLedgerService(db, {now, budget: {maxCalls: 2, maxTokens: 50, deadlineMs: 60000}});
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

});
