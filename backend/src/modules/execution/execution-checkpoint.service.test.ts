import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, eq, executionTasks, type Db } from "@creatoros/backend";
import { createPersistentTaskService } from "./persistent-task.service";
import { createExecutionCallLedgerService } from "./execution-call-ledger.service";
import { createExecutionCheckpointService } from "./execution-checkpoint.service";
const ctx = {userId:"checkpoint-user",accountId:"checkpoint-account",requestId:"test",source:"user" as const};
const budget = {maxCalls:10,maxTokens:1000,deadlineMs:60000};
describe("持久检查点与权威调用事实", () => {
  let db:Db; let close:()=>Promise<void>;
  beforeAll(async()=>{const c=await createDb();db=c.db;close=()=>c.client.close();});
  afterAll(async()=>close?.());
  async function fixture(id:string){
    const now=()=>"2026-09-05T00:00:00.000Z";
    const tasks=createPersistentTaskService(db,{now});
    const task=await tasks.enqueue(ctx,{kind:"ai_task",ownerType:"ai_task",ownerId:id,idempotencyKey:id,payload:{}});
    const claim=await tasks.claimTask({taskId:task.id,workerId:"worker"});if(!claim)throw new Error("claim missing");
    const ref={executionTaskId:task.id,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
    const ledger=createExecutionCallLedgerService(db,{now,budget});
    const checkpoints=createExecutionCheckpointService(db,{now});
    async function call(key:string,kind:"model"|"tool"="model",settled=true){
      const call=await ledger.reserve(ref,{operationKey:key,kind,inputDigest:"sha256:"+"a".repeat(64),reservedTokens:20});
      await ledger.start(ref,call.id);
      if(settled)await ledger.settle(ref,call.id,{status:"settled",usage:{totalTokens:kind==="tool"?0:15},resultText:key});
      return call;
    }
    return {task,ref,tasks,ledger,checkpoints,call,now};
  }
  it("同请求并发重投只推进一次，回读只从真实账本重建消息和预算",async()=>{
    const f=await fixture("repeat");const c=await f.call("正文");
    const request={expectedRevision:0,expectedLedgerSequence:1,messages:[{role:"assistant" as const,callId:c.id}]};
    const [a,b]=await Promise.all([f.checkpoints.save(f.ref,request),f.checkpoints.save(f.ref,request)]);
    expect(a.revision).toBe(1);expect(b.revision).toBe(1);
    const state=await f.checkpoints.read(f.ref);
    expect(state.messages).toMatchObject([{role:"assistant",callId:c.id,resultText:"正文"}]);
    expect(state.budget).toEqual(budget);expect(state.knownSpentTokens).toBe(15);expect(state.pendingCalls).toEqual([]);
    expect(state.recovery).toBe("ready");
    await expect(f.checkpoints.save(f.ref,{...request,messages:[]})).rejects.toMatchObject({name:"ConflictError"});
  });
  it("旧版覆盖、遗漏新调用、跨任务或角色伪造、未结算结果均拒绝",async()=>{
    const f=await fixture("truth");const other=await fixture("foreign");const c=await f.call("one");const foreign=await other.call("foreign");
    await expect(f.checkpoints.save(f.ref,{expectedRevision:0,expectedLedgerSequence:1,messages:[{role:"assistant",callId:foreign.id}]})).rejects.toMatchObject({name:"ConflictError"});
    await expect(f.checkpoints.save(f.ref,{expectedRevision:0,expectedLedgerSequence:1,messages:[{role:"tool",callId:c.id}]})).rejects.toMatchObject({name:"ConflictError"});
    await f.checkpoints.save(f.ref,{expectedRevision:0,expectedLedgerSequence:1,messages:[{role:"assistant",callId:c.id}]});
    const pending=await f.call("two","tool",false);
    await expect(f.checkpoints.save(f.ref,{expectedRevision:1,expectedLedgerSequence:1,messages:[{role:"assistant",callId:c.id}]})).rejects.toMatchObject({name:"ConflictError"});
    await expect(f.checkpoints.save(f.ref,{expectedRevision:1,expectedLedgerSequence:2,messages:[{role:"tool",callId:pending.id}]})).rejects.toMatchObject({name:"ConflictError"});
    await expect(f.checkpoints.save(f.ref,{expectedRevision:1,expectedLedgerSequence:2,messages:[]})).rejects.toMatchObject({name:"ConflictError"});
  });
  it("暂停后旧执行不能写；换租约恢复保留消息、预算和未完成调用并要求对账",async()=>{
    const f=await fixture("restart");const c=await f.call("已完成");
    await f.checkpoints.save(f.ref,{expectedRevision:0,expectedLedgerSequence:1,messages:[{role:"assistant",callId:c.id}]});
    const started=await f.call("未完成","tool",false);
    await f.tasks.command(ctx,{taskIds:[f.task.id],command:"pause",idempotencyKey:"pause"});
    await expect(f.checkpoints.save(f.ref,{expectedRevision:1,expectedLedgerSequence:2,messages:[{role:"assistant",callId:c.id}]})).rejects.toMatchObject({name:"ConflictError"});
    await f.tasks.acknowledgeControl({taskId:f.task.id,workerId:"worker",attempt:f.ref.attempt});
    await f.tasks.command(ctx,{taskIds:[f.task.id],command:"resume",idempotencyKey:"resume"});
    const claim=await f.tasks.claimTask({taskId:f.task.id,workerId:"new-worker"});if(!claim)throw new Error("claim missing");
    const fresh={...f.ref,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
    const replacement=createExecutionCheckpointService(db,{now:f.now});
    const state=await replacement.read(fresh);
    expect(state.revision).toBe(1);expect(state.messages[0]?.resultText).toBe("已完成");
    expect(state.recovery).toBe("requires_reconciliation");expect(state.pendingCalls).toMatchObject([{callId:started.id,status:"started"}]);
    expect(state.knownSpentTokens).toBe(15);expect(state.budget).toEqual(budget);
    await expect(f.checkpoints.read(f.ref)).rejects.toMatchObject({name:"ConflictError"});
  });
  it("检查点之后新结算的回执仍可恢复；未知用量不能显示为零或ready",async()=>{
    const f=await fixture("late-receipt");const c=await f.call("待结算","model",false);
    await f.checkpoints.save(f.ref,{expectedRevision:0,expectedLedgerSequence:1,messages:[]});
    await f.ledger.settle(f.ref,c.id,{status:"settled",usage:{},resultText:"真实迟到结果"});
    const state=await f.checkpoints.read(f.ref);
    expect(state.recovery).toBe("requires_reconciliation");expect(state.spentTokens).toBeNull();
    expect(state.uncheckpointedReceipts).toMatchObject([{callId:c.id,resultText:"真实迟到结果"}]);
  });
  it("工具回执必须关闭真实模型调用，多工具未收齐不能宣称ready，历史顺序不可改",async()=>{
    const f=await fixture("tool-dependencies");
    const model=await f.call("model","model",false);
    const providerResult={content:[{type:"tool-call",toolCallId:"t1",toolName:"search",input:'{"query":"one"}'},{type:"tool-call",toolCallId:"t2",toolName:"read",input:'{"url":"https://example.com"}'}],finishReason:{unified:"tool-calls"},usage:{inputTokens:{total:10},outputTokens:{total:5}},warnings:[]};
    await f.ledger.settle(f.ref,model.id,{status:"settled",usage:{totalTokens:15},providerResult});
    const first={role:"assistant" as const,callId:model.id};
    await f.checkpoints.save(f.ref,{expectedRevision:0,expectedLedgerSequence:1,messages:[first]});
    expect((await f.checkpoints.read(f.ref)).recovery).toBe("pending");
    const tool=await f.call("tool","tool",false);
    const receipt={schemaVersion:1,kind:"tool",toolCallId:"t1",toolName:"search",output:{items:["one"]}};
    await f.ledger.settle(f.ref,tool.id,{status:"settled",usage:{totalTokens:0},resultText:JSON.stringify(receipt)});
    const second={role:"tool" as const,callId:tool.id};
    await expect(f.checkpoints.save(f.ref,{expectedRevision:1,expectedLedgerSequence:2,messages:[second,first]})).rejects.toMatchObject({name:"ConflictError"});
    await expect(f.checkpoints.save(f.ref,{expectedRevision:1,expectedLedgerSequence:2,messages:[first,first]})).rejects.toMatchObject({name:"ConflictError"});
    await f.checkpoints.save(f.ref,{expectedRevision:1,expectedLedgerSequence:2,messages:[first,second]});
    expect((await f.checkpoints.read(f.ref)).unresolvedToolCalls).toEqual([{toolCallId:"t2",toolName:"read"}]);
    const tool2=await f.call("tool2","tool",false);
    await f.ledger.settle(f.ref,tool2.id,{status:"settled",usage:{totalTokens:0},resultText:JSON.stringify({...receipt,toolCallId:"t2",toolName:"read"})});
    await f.checkpoints.save(f.ref,{expectedRevision:2,expectedLedgerSequence:3,messages:[first,second,{role:"tool",callId:tool2.id}]});
    expect((await f.checkpoints.read(f.ref)).recovery).toBe("ready");
    await expect(f.checkpoints.save(f.ref,{expectedRevision:0,expectedLedgerSequence:1,messages:[first]})).rejects.toMatchObject({name:"ConflictError"});
    expect((await f.checkpoints.read(f.ref)).revision).toBe(3);
  });
  it("没有模型工具调用的工具结果不能拼成已确认历史",async()=>{
    const f=await fixture("orphan-tool");const c=await f.call("orphan","tool",false);
    await f.ledger.settle(f.ref,c.id,{status:"settled",usage:{totalTokens:0},resultText:JSON.stringify({schemaVersion:1,kind:"tool",toolCallId:"invented",toolName:"search",output:{}})});
    await expect(f.checkpoints.save(f.ref,{expectedRevision:0,expectedLedgerSequence:1,messages:[{role:"tool",callId:c.id}]})).rejects.toMatchObject({name:"ConflictError"});
  });
  it("不能越过较早在途调用保存后续消息，迟到结算后仍能保存完整顺序",async()=>{
    const f=await fixture("late-order");const early=await f.call("early","model",false);const later=await f.call("later");
    await expect(f.checkpoints.save(f.ref,{expectedRevision:0,expectedLedgerSequence:2,messages:[{role:"assistant",callId:later.id}]})).rejects.toMatchObject({name:"ConflictError"});
    await f.ledger.settle(f.ref,early.id,{status:"settled",usage:{totalTokens:15},resultText:"early"});
    await f.checkpoints.save(f.ref,{expectedRevision:0,expectedLedgerSequence:2,messages:[{role:"assistant",callId:early.id},{role:"assistant",callId:later.id}]});
    expect((await f.checkpoints.read(f.ref)).messages.map(message=>message.resultText)).toEqual(["early","later"]);
  });
  it("模型声称工具回合但缺调用信息时要求对账，不作为完整历史保存",async()=>{
    const f=await fixture("missing-protocol");const c=await f.call("bad","model",false);
    await f.ledger.settle(f.ref,c.id,{status:"settled",usage:{totalTokens:15},providerResult:{content:[{type:"text",text:"将查询"}],finishReason:{unified:"tool-calls"},usage:{inputTokens:{total:10},outputTokens:{total:5}},warnings:[]}});
    expect((await f.checkpoints.read(f.ref)).recovery).toBe("requires_reconciliation");
    await expect(f.checkpoints.save(f.ref,{expectedRevision:0,expectedLedgerSequence:1,messages:[{role:"assistant",callId:c.id}]})).rejects.toMatchObject({name:"ConflictError"});
  });
  it("不接受Worker自报预算、SDK状态或浏览器句柄；未知历史结构不覆盖",async()=>{
    const f=await fixture("legacy");
    await expect(f.tasks.saveCheckpoint({taskId:f.task.id,workerId:"worker",attempt:f.ref.attempt,checkpoint:{arbitrary:true}})).rejects.toMatchObject({name:"ConflictError"});
    await expect(f.checkpoints.save(f.ref,{expectedRevision:0,expectedLedgerSequence:0,messages:[],budget:{maxTokens:9999}})).rejects.toThrow();
    await db.update(executionTasks).set({checkpoint:{legacy:"unknown"}}).where(eq(executionTasks.id,f.task.id));
    await expect(f.checkpoints.read(f.ref)).rejects.toMatchObject({name:"ConflictError"});
    await expect(f.checkpoints.save(f.ref,{expectedRevision:0,expectedLedgerSequence:0,messages:[]})).rejects.toMatchObject({name:"ConflictError"});
  });
});
