import {randomUUID} from "node:crypto";
import {afterAll,beforeAll,expect,it} from "vitest";
import {createDb,executionCalls,executionTasks,eq,asc,type Db} from "@creatoros/backend";
import {chatWorkerInputSchema} from "@creatoros/contract/execution-worker";
import {createPersistentTaskService} from "./persistent-task.service";
import {createExecutionCallLedgerService} from "./execution-call-ledger.service";
import {createExecutionCheckpointService} from "./execution-checkpoint.service";

let db:Db,close:()=>Promise<void>;
beforeAll(async()=>{const f=await createDb();db=f.db;close=()=>f.client.close();});
afterAll(async()=>close?.());
const now=()=>"2026-09-22T00:00:00.000Z",budget={maxCalls:70,maxTokens:100000,deadlineMs:300000};
async function fixture(prefixRounds=1){
 const id=randomUUID(),ctx={userId:id,accountId:id,requestId:id,source:"user" as const};
 const input=chatWorkerInputSchema.parse({kind:"chat.run",executionEngine:"pi",contextPolicyVersion:2,recoverMissingFinal:true,
  operationKey:id,capability:"copilot.assist",userId:id,accountId:id,conversationId:id,sourceMessageId:id,system:"继续原任务",messages:[{role:"user",content:"完成报告"}],maxSteps:12,maxOutputTokens:128,tools:[]});
 const tasks=createPersistentTaskService(db,{now}),task=await tasks.enqueue(ctx,{kind:"ai_task",ownerType:"ai_task",ownerId:id,idempotencyKey:id,payload:{aiTaskId:id,modelInput:input}});
 const claim=(await tasks.claimTask({taskId:task.id,workerId:id}))!,ref={executionTaskId:task.id,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
 const ledger=createExecutionCallLedgerService(db,{now,budget}),checkpoints=createExecutionCheckpointService(db,{now});
 const messages:Array<{role:"assistant"|"tool";callId:string}>=[];
 for(let round=0;round<prefixRounds;round++){
  const model=await ledger.reserve(ref,{kind:"model",operationKey:`${id}/model/${round}`,inputDigest:"sha256:"+"a".repeat(64),reservedTokens:32});
  await ledger.start(ref,model.id);
  const tools=Array.from({length:round===0?2:1},(_,i)=>({type:"tool-call",toolCallId:`tool-${round}-${i}`,toolName:"files_read",input:'{"path":"report.html"}'}));
  await ledger.settle(ref,model.id,{status:"settled",usage:{totalTokens:5},providerResult:{content:tools,finishReason:{unified:"tool-calls"},usage:{inputTokens:{total:3},outputTokens:{total:2}},warnings:[]}});
  messages.push({role:"assistant",callId:model.id});
  for(const tool of tools){
   const c=await ledger.reserve(ref,{kind:"tool",operationKey:tool.toolCallId,inputDigest:"sha256:"+"b".repeat(64),reservedTokens:0});
   await ledger.start(ref,c.id);
   await ledger.settle(ref,c.id,{status:"settled",usage:{totalTokens:0},resultText:JSON.stringify({schemaVersion:1,kind:"tool",toolCallId:tool.toolCallId,toolName:tool.toolName,output:{status:"ok",summary:"历史已确认读取",evidence:[],error:null,continuation:null,sideEffect:"none"}})});
   messages.push({role:"tool",callId:c.id});
  }
 }
 await checkpoints.save(ref,{expectedRevision:0,expectedLedgerSequence:messages.length,messages});
 const pending=await ledger.reserve(ref,{kind:"model",operationKey:`${id}/model/${prefixRounds}`,inputDigest:"sha256:"+"c".repeat(64),reservedTokens:128});
 await ledger.start(ref,pending.id);
 await tasks.command(ctx,{taskIds:[task.id],command:"pause",idempotencyKey:"pause"});
 await ledger.settle(ref,pending.id,{status:"unknown"});
 await tasks.acknowledgeControl({taskId:task.id,workerId:id,attempt:ref.attempt});
 const calls=()=>db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,task.id)).orderBy(asc(executionCalls.sequence));
 const row=async()=>(await db.select().from(executionTasks).where(eq(executionTasks.id,task.id)))[0]!;
 return {ctx,task,tasks,ref,ledger,checkpoints,pending,calls,row};
}

it("原57回执+末model unknown：公开resume后新lease可读checkpoint并原键重试，未知费用不伪造0",async()=>{
 const f=await fixture(28),before=await f.calls(),task=await f.row();expect(before).toHaveLength(58);
 await f.tasks.command(f.ctx,{taskIds:[f.task.id],command:"resume",idempotencyKey:"resume"});
 const resumed=(await f.tasks.claimTask({taskId:f.task.id,workerId:"next"}))!,ref={executionTaskId:f.task.id,attempt:resumed.lease.attempt,fenceToken:resumed.lease.fenceToken};
 const state=await f.checkpoints.read(ref);expect(state.recovery).toBe("ready");
 const after=await f.calls();expect(after.slice(0,57)).toEqual(before.slice(0,57));
 expect(after[57]).toEqual({...before[57],status:"superseded",updatedAt:now()});
 expect(after[57]).toMatchObject({totalTokens:null,usage:null,reservedTokens:128,providerResult:null});
 expect(await f.row()).toMatchObject({retryOfCallId:f.pending.id,executionBudget:task.executionBudget,deadlineAt:task.deadlineAt,checkpoint:task.checkpoint});
 const retry=await f.ledger.reserve(ref,{kind:"model",operationKey:f.pending.operationKey,inputDigest:f.pending.inputDigest,reservedTokens:128,retryOfCallId:f.pending.id});
 expect(retry.id).not.toBe(f.pending.id);expect(retry.operationKey).toBe(f.pending.operationKey);
 await f.ledger.start(ref,retry.id);expect((await f.calls()).slice(0,57)).toEqual(before.slice(0,57));
});

it("历史已被checkpoint拦为unknown_result的同一纯model任务可显式恢复",async()=>{
 const f=await fixture();await db.update(executionTasks).set({status:"unknown_result",lastErrorCode:"CHAT_CHECKPOINT_REQUIRES_RECONCILIATION"}).where(eq(executionTasks.id,f.task.id));
 await expect(f.tasks.command(f.ctx,{taskIds:[f.task.id],command:"resume",idempotencyKey:"repair"})).resolves.toMatchObject([{id:f.task.id,status:"queued"}]);
 expect((await f.calls()).at(-1)).toMatchObject({status:"superseded",totalTokens:null,usage:null});
});

it.each(["tool","providerJob","providerResult","resultRef","child","ahead","foreign"])("resume不解开%s未知事实，拒绝时原账本不变",async variant=>{
 const f=await fixture();
 const current=(await f.calls()).at(-1)!;
 const patch=variant==="tool"?{kind:"tool"}:variant==="providerJob"?{providerJob:{jobId:"unconfirmed-external"}}:
  variant==="providerResult"?{providerResult:{content:[]}}:variant==="resultRef"?{resultRef:"external"}:variant==="child"?{parentCallId:(await f.calls())[1]!.id}:
  variant==="ahead"?{startedAttempt:99}:{};
 if(variant!=="foreign") await db.update(executionCalls).set(patch).where(eq(executionCalls.id,current.id));
 await db.update(executionTasks).set({status:"unknown_result"}).where(eq(executionTasks.id,f.task.id));
 const before=await f.calls(),task=await f.row();
 await expect(f.tasks.command(variant==="foreign"?{...f.ctx,accountId:"other"}:f.ctx,{taskIds:[f.task.id],command:"resume",idempotencyKey:"unsafe"})).rejects.toThrow();
 expect(await f.calls()).toEqual(before);expect(await f.row()).toEqual(task);
});

it.each(["lease","frozen-owner","mixed-tool","child-call"])("显式恢复先完整核验%s，不能部分废弃model",async variant=>{
 const f=await fixture(),task=await f.row(),calls=await f.calls();
 if(variant==="mixed-tool")await db.update(executionCalls).set({status:"unknown"}).where(eq(executionCalls.id,calls[1]!.id));
 if(variant==="child-call")await db.update(executionCalls).set({parentCallId:f.pending.id}).where(eq(executionCalls.id,calls[1]!.id));
 await db.update(executionTasks).set({status:"unknown_result",
  ...(variant==="lease"?{leaseOwner:"still-running",leaseExpiresAt:"2026-09-22T01:00:00.000Z"}:{}),
  ...(variant==="frozen-owner"?{payload:{...task.payload as Record<string,unknown>,aiTaskId:"other"}}:{})}).where(eq(executionTasks.id,f.task.id));
 const before=await f.calls(),row=await f.row();
 await expect(f.tasks.command(f.ctx,{taskIds:[f.task.id],command:"resume",idempotencyKey:"unsafe"})).rejects.toThrow();
 expect(await f.calls()).toEqual(before);expect(await f.row()).toEqual(row);
});

it("paused混合未知工具保留既有resume行为，model和工具均不得被废弃",async()=>{
 const f=await fixture(),calls=await f.calls();
 await db.insert(executionCalls).values({...calls[1]!,id:randomUUID(),sequence:f.pending.sequence+1,operationKey:"unknown-file-write",status:"unknown",resultText:null,totalTokens:null,usage:null});
 const before=await f.calls();
 await f.tasks.command(f.ctx,{taskIds:[f.task.id],command:"resume",idempotencyKey:"resume"});
 expect(await f.calls()).toEqual(before);
 const lease=(await f.tasks.claimTask({taskId:f.task.id,workerId:"next"}))!.lease;
 expect((await f.checkpoints.read({executionTaskId:f.task.id,attempt:lease.attempt,fenceToken:lease.fenceToken})).recovery).toBe("requires_reconciliation");
});
