import {randomUUID} from "node:crypto";
import {afterAll,beforeAll,expect,it} from "vitest";
import {streamText} from "ai";
import {MockLanguageModelV4} from "ai/test";
import {createDurableStreamModel} from "@creatoros/ai-worker/durable-stream";
import {createDb,executionCalls,executionTasks,eq,asc,type Db} from "@creatoros/backend";
import {chatWorkerInputSchema,type ExecutionRef} from "@creatoros/contract/execution-worker";
import {createPersistentTaskService} from "./persistent-task.service";
import {createExecutionCallLedgerService} from "./execution-call-ledger.service";
import {createExecutionGenerationPorts} from "./execution-generation-ports.service";
import {createExecutionWorkerOutcomeService} from "./execution-worker-outcome.service";
import {createExecutionCheckpointService} from "./execution-checkpoint.service";
import {createExecutionChatFallbackService} from "./execution-chat-fallback.service";

let db:Db,close:()=>Promise<void>;
beforeAll(async()=>{const f=await createDb();db=f.db;close=()=>f.client.close();});
afterAll(async()=>close());
async function fixture(prepareReplay=true){
 const id=randomUUID(),ctx={userId:id,accountId:id,requestId:id,source:"user" as const};
 const now=()=>"2026-09-22T00:00:00.000Z",budget={maxCalls:20,maxTokens:100000,deadlineMs:300000};
 const tasks=createPersistentTaskService(db,{now}),ledger=createExecutionCallLedgerService(db,{now,budget}),
  generation=createExecutionGenerationPorts(db,{now,budget}),outcomes=createExecutionWorkerOutcomeService(db,{now}),checkpoints=createExecutionCheckpointService(db,{now});
 const input=chatWorkerInputSchema.parse({kind:"chat.run",executionEngine:"pi",operationKey:id,capability:"copilot.assist",userId:id,accountId:id,conversationId:id,sourceMessageId:id,system:"fixture",messages:[{role:"user",content:"fixture"}],maxSteps:3,maxOutputTokens:128,tools:[]});
 const task=await tasks.enqueue(ctx,{kind:"ai_task",ownerType:"ai_task",ownerId:id,idempotencyKey:id,payload:{aiTaskId:id,modelInput:input}});
 let ref!:ExecutionRef;
 const claim=async()=>{const c=await tasks.claimTask({taskId:task.id,workerId:id});expect(c).not.toBeNull();ref={executionTaskId:task.id,attempt:c!.lease.attempt,fenceToken:c!.lease.fenceToken};return ref;};
 await claim();
 const calls=()=>db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,task.id)).orderBy(asc(executionCalls.sequence));
 const row=async()=>(await db.select().from(executionTasks).where(eq(executionTasks.id,task.id)))[0]!;
 let providerCalls=0;
 const provider=new MockLanguageModelV4({doStream:async()=>{
  if(++providerCalls===2)throw Object.assign(Error("fixture paused model"),{name:"AbortError"});
  return {stream:new ReadableStream({start(c){
   c.enqueue({type:"stream-start",warnings:[]});c.enqueue({type:"text-start",id:"t"});c.enqueue({type:"text-delta",id:"t",delta:"真实候选"});c.enqueue({type:"text-end",id:"t"});
   c.enqueue({type:"finish",finishReason:{unified:"stop",raw:"stop"},usage:{inputTokens:{total:1,noCache:1,cacheRead:0,cacheWrite:0},outputTokens:{total:1,text:1,reasoning:0}}});c.close();
  }})};
 }});
 type Ports=Parameters<typeof createDurableStreamModel>[0]["ports"];
 const requests=new Map<string,Parameters<Ports["reserve"]>[0]>();
 const ports:Ports={reserve:async request=>{requests.set(request.operationKey,request);return generation.reserveGenerationCall(ref,request);},
  start:async callId=>{await ledger.start(ref,callId);},settle:async(callId,value)=>{await generation.settleGenerationCall(ref,{callId,...value});}};
 const wrap=(fingerprints?:Parameters<typeof createDurableStreamModel>[0]["replayFingerprints"])=>createDurableStreamModel({model:provider,operationKey:id,ports,replayFingerprints:fingerprints});
 const run=async(model:ReturnType<typeof wrap>,prompt:string)=>{
  const errors:unknown[]=[];const result=streamText({model,prompt,maxOutputTokens:128,maxRetries:0,onError:e=>{errors.push(e.error);}});
  await result.consumeStream();return errors;
 };
 const initial=wrap();expect(await run(initial,"prefix")).toEqual([]);
 const prefix=(await calls())[0]!;
 await checkpoints.save(ref,{expectedRevision:0,expectedLedgerSequence:1,messages:[{role:"assistant",callId:prefix.id}]});
 expect(await run(initial,"tail")).toMatchObject([{errorCode:"MODEL_RESULT_UNKNOWN"}]);
 const tail=(await calls()).at(-1)!;expect(tail.status).toBe("unknown");
 if(prepareReplay){
  await tasks.command(ctx,{taskIds:[task.id],command:"pause",idempotencyKey:"pause"});
  await tasks.acknowledgeControl({taskId:task.id,workerId:id,attempt:ref.attempt});
  await tasks.command(ctx,{taskIds:[task.id],command:"resume",idempotencyKey:"resume"});await claim();
  expect((await row()).retryOfCallId).toBe(tail.id);
 }else await outcomes.recordFailure(ref,{outcome:"unknown_result",errorCode:"CHAT_MODEL_REQUEST_REPLAY_MISMATCH"});
 const before=await calls(),beforeTask=await row(),request=requests.get(tail.operationKey)!;
 const mismatch=async()=>{
  const state=await checkpoints.read(ref);
  expect(await run(wrap(state.modelReplayFingerprints),"changed-prefix")).toMatchObject([{errorCode:"CHAT_MODEL_REQUEST_REPLAY_MISMATCH"}]);
  await outcomes.recordFailure(ref,{outcome:"unknown_result",errorCode:"CHAT_MODEL_REQUEST_REPLAY_MISMATCH"});
 };
 const legacy=async()=>{await mismatch();
  // 精确模拟旧版recordFailure已清空的任务指针；原调用/检查点/费用不改。
  await db.update(executionTasks).set({retryOfCallId:null}).where(eq(executionTasks.id,task.id));
 };
 return {id,ctx,task,tasks,ledger,generation,outcomes,checkpoints,calls,row,claim,before,beforeTask,tail,request,wrap,run,mismatch,legacy,ref:()=>ref,providerCalls:()=>providerCalls};
}

it("回放mismatch保留已授权根模型锚和原账本，严格摘要错误不能被忽略",async()=>{
 const f=await fixture();await f.mismatch();
 expect(await f.row()).toMatchObject({status:"unknown_result",retryOfCallId:f.tail.id,lastErrorCode:"CHAT_MODEL_REQUEST_REPLAY_MISMATCH"});
 expect(await f.calls()).toEqual(f.before);expect(f.providerCalls()).toBe(2);
});

it.each(["startup","resume"])("旧版丢锚通过%s沿原task恢复：真实SDK回放前缀，尾仅调用一次",async path=>{
 const f=await fixture();await f.legacy();
 if(path==="startup")expect((await f.tasks.recoverExpiredLeases({includeSafeUnknownResults:true,taskId:f.task.id})).requeued).toBe(1);
 else await f.tasks.command(f.ctx,{taskIds:[f.task.id],command:"resume",idempotencyKey:"repair"});
 expect(await f.row()).toMatchObject({retryOfCallId:f.tail.id,checkpoint:f.beforeTask.checkpoint,executionBudget:f.beforeTask.executionBudget,deadlineAt:f.beforeTask.deadlineAt});
 await f.claim();const state=await f.checkpoints.read(f.ref()),model=f.wrap(state.modelReplayFingerprints);
 expect(await f.run(model,"prefix")).toEqual([]);expect(f.providerCalls()).toBe(2);
 expect(await f.run(model,"tail")).toEqual([]);expect(f.providerCalls()).toBe(3);
 const after=await f.calls();expect(after).toHaveLength(3);expect(after.slice(0,2)).toEqual(f.before);
 expect(after[2]).toMatchObject({operationKey:f.tail.operationKey,retryOfCallId:f.tail.id,inputDigest:f.tail.inputDigest,reservedTokens:f.tail.reservedTokens,status:"settled"});
 const replay=f.wrap((await f.checkpoints.read(f.ref())).modelReplayFingerprints);
 expect(await f.run(replay,"prefix")).toEqual([]);expect(await f.run(replay,"tail")).toEqual([]);
 expect(f.providerCalls()).toBe(3);expect(await f.calls()).toEqual(after);
});

it.each(["prefix-id","prefix-missing","receipt","owner","active-lease","expired-lease","foreign-call","unknown-tool","successor","providerJob","child","operation-key","unknown-error"])("丢锚%s缺少完整物理证明时不授重试权",async variant=>{
 const f=await fixture();await f.legacy();const row=await f.row();
 if(variant==="prefix-id"||variant==="prefix-missing")await db.update(executionTasks).set({checkpoint:{...row.checkpoint as object,messages:variant==="prefix-missing"?[]:[{role:"assistant",callId:"other"}]}}).where(eq(executionTasks.id,f.task.id));
 if(variant==="receipt")await db.update(executionCalls).set({providerResult:{content:[]}}).where(eq(executionCalls.id,f.before[0]!.id));
 if(variant==="owner")await db.update(executionTasks).set({payload:{...row.payload as object,aiTaskId:"foreign"}}).where(eq(executionTasks.id,f.task.id));
 if(variant.endsWith("lease"))await db.update(executionTasks).set({leaseOwner:"old-worker",leaseExpiresAt:variant==="active-lease"?"2026-09-22T01:00:00.000Z":"2026-09-21T23:00:00.000Z"}).where(eq(executionTasks.id,f.task.id));
 if(variant==="foreign-call"){
  const other=await f.tasks.enqueue(f.ctx,{kind:"ai_task",ownerType:"ai_task",ownerId:randomUUID(),idempotencyKey:randomUUID(),payload:row.payload as Record<string,unknown>});
  await db.update(executionCalls).set({executionTaskId:other.id}).where(eq(executionCalls.id,f.tail.id));
 }
 if(variant==="unknown-tool")await db.update(executionCalls).set({kind:"tool",status:"unknown"}).where(eq(executionCalls.id,f.tail.id));
 if(variant==="successor")await db.insert(executionCalls).values({...f.before[0]!,id:randomUUID(),sequence:3,operationKey:`${f.id}/model/3`});
 if(variant==="providerJob")await db.update(executionCalls).set({providerJob:{jobId:"external"}}).where(eq(executionCalls.id,f.tail.id));
 if(variant==="child")await db.update(executionCalls).set({parentCallId:f.before[0]!.id}).where(eq(executionCalls.id,f.tail.id));
 if(variant==="operation-key")await db.update(executionCalls).set({operationKey:"other/model/2"}).where(eq(executionCalls.id,f.tail.id));
 if(variant==="unknown-error")await db.update(executionTasks).set({lastErrorCode:"UNPROVEN"}).where(eq(executionTasks.id,f.task.id));
 const before=await f.calls();
 await expect(f.tasks.command(f.ctx,{taskIds:[f.task.id],command:"resume",idempotencyKey:"unsafe"})).rejects.toThrow();
 await f.tasks.recoverExpiredLeases({includeSafeUnknownResults:true,taskId:f.task.id});
 expect(await f.row()).toMatchObject({status:"unknown_result",retryOfCallId:null});expect(await f.calls()).toEqual(before);expect(f.providerCalls()).toBe(2);
});

it.each(["digest","tokens","budget","old-fence"])("恢复锚后%s仍由正式reserve/租约门拒绝，不新增调用",async variant=>{
 const f=await fixture();await f.legacy();await f.tasks.recoverExpiredLeases({includeSafeUnknownResults:true,taskId:f.task.id});
 const stale=f.ref();await f.claim();
 if(variant==="budget")await db.update(executionTasks).set({executionBudget:{...f.beforeTask.executionBudget as object,maxCalls:2}}).where(eq(executionTasks.id,f.task.id));
 const request=variant==="digest"?{...f.request,request:{...f.request.request,temperature:0.7}}:variant==="tokens"?{...f.request,request:{...f.request.request,maxOutputTokens:129}}:f.request;
 await expect(f.generation.reserveGenerationCall(variant==="old-fence"?stale:f.ref(),request)).rejects.toThrow();
 expect(await f.calls()).toEqual(f.before);expect(f.providerCalls()).toBe(2);
});

it("paused不被启动扫描解开，只能显式resume保留原锚",async()=>{
 const f=await fixture();await f.tasks.command(f.ctx,{taskIds:[f.task.id],command:"pause",idempotencyKey:"pause-again"});
 await f.tasks.acknowledgeControl({taskId:f.task.id,workerId:f.id,attempt:f.ref().attempt});
 const before=await f.row();await f.tasks.recoverExpiredLeases({includeSafeUnknownResults:true,taskId:f.task.id});
 expect(await f.row()).toEqual(before);expect(before.status).toBe("paused");
 await f.tasks.command(f.ctx,{taskIds:[f.task.id],command:"resume",idempotencyKey:"resume-again"});
 expect(await f.row()).toMatchObject({status:"queued",retryOfCallId:f.tail.id});expect(await f.calls()).toEqual(f.before);
});

it("回放错误码不遮断原有纯模型unknown的安全恢复",async()=>{
 const f=await fixture(false);expect((await f.calls()).at(-1)!.status).toBe("unknown");
 expect((await f.tasks.recoverExpiredLeases({includeSafeUnknownResults:true,taskId:f.task.id})).requeued).toBe(1);
 expect(await f.row()).toMatchObject({status:"queued",retryOfCallId:f.tail.id});await f.claim();
 expect(await f.generation.reserveGenerationCall(f.ref(),f.request)).toMatchObject({status:"reserved"});
});

it.each(["unclosed-prefix","older-logical-tail"])("%s不能被物理尾或递增首次序号伪装成可重试槽",async variant=>{
 const f=await fixture();await f.legacy();
 const prefix=f.before[0]!,tail=f.before[1]!;
 const empty={providerResult:null,resultText:null,resultRef:null,usage:null,totalTokens:null,status:"superseded"};
 await db.update(executionCalls).set(empty).where(eq(executionCalls.id,prefix.id));
 if(variant==="older-logical-tail"){
  await db.update(executionCalls).set({status:"settled",providerResult:prefix.providerResult,usage:prefix.usage,totalTokens:prefix.totalTokens}).where(eq(executionCalls.id,tail.id));
  await db.insert(executionCalls).values({...prefix,...empty,id:randomUUID(),sequence:3,retryOfCallId:prefix.id});
 }
 await db.update(executionTasks).set({checkpoint:{...f.beforeTask.checkpoint as object,ledgerSequence:variant==="older-logical-tail"?2:1,messages:variant==="older-logical-tail"?[{role:"assistant",callId:tail.id}]:[]}}).where(eq(executionTasks.id,f.task.id));
 const before=await f.calls();
 await expect(f.tasks.command(f.ctx,{taskIds:[f.task.id],command:"resume",idempotencyKey:"unsafe-logical"})).rejects.toThrow();
 expect((await f.tasks.recoverExpiredLeases({includeSafeUnknownResults:true,taskId:f.task.id})).requeued).toBe(0);
 expect(await f.row()).toMatchObject({status:"unknown_result",retryOfCallId:null});expect(await f.calls()).toEqual(before);
});

it.each(["retry","fallback","child","empty"])("合法%s历史前缀经真实service证明可恢复，不用模型物理条数推断逻辑序号",async kind=>{
 const id=randomUUID(),ctx={userId:id,accountId:id,requestId:id,source:"user" as const};let stamp="2026-09-22T00:00:00.000Z";
 const now=()=>stamp,budget={maxCalls:20,maxTokens:100000,deadlineMs:300000},tasks=createPersistentTaskService(db,{now}),
  ledger=createExecutionCallLedgerService(db,{now,budget}),generation=createExecutionGenerationPorts(db,{now,budget}),
  checkpoints=createExecutionCheckpointService(db,{now}),outcomes=createExecutionWorkerOutcomeService(db,{now,random:()=>0});
 const input=chatWorkerInputSchema.parse({kind:"chat.run",executionEngine:"pi",operationKey:id,capability:"copilot.assist",userId:id,accountId:id,conversationId:id,sourceMessageId:id,system:"fixture",messages:[{role:"user",content:"fixture"}],maxSteps:3,maxOutputTokens:128,tools:[]});
 // retry前缀本身使用一次额外attempt，显式给足本测试的既有预算，不修改生产预算门。
 const task=await tasks.enqueue(ctx,{kind:"ai_task",ownerType:"ai_task",ownerId:id,idempotencyKey:id,maxAttempts:5,payload:{aiTaskId:id,modelInput:input}});
 let ref!:ExecutionRef;
 const claim=async()=>{const c=(await tasks.claimTask({taskId:task.id,workerId:id}))!;ref={executionTaskId:task.id,attempt:c.lease.attempt,fenceToken:c.lease.fenceToken};};await claim();
 const request={operationKey:`${id}/model/1`,request:{maxOutputTokens:128,prompt:[]}};
 const receipt={content:[{type:"text",text:"prefix"}],finishReason:{unified:"stop"},usage:{inputTokens:{total:1},outputTokens:{total:1}},warnings:[]};
 const messages:Array<{role:"assistant"|"tool";callId:string}>=[];
 if(kind!=="empty"){
  let prefix=await generation.reserveGenerationCall(ref!,request);await ledger.start(ref!,prefix.callId);
  if(kind==="retry"){
   await ledger.settle(ref!,prefix.callId,{status:"superseded"});await outcomes.recordFailure(ref!,{outcome:"retry_wait",errorCode:"MODEL_STREAM_INTERRUPTED"});
   stamp="2026-09-22T00:01:00.000Z";await claim();prefix=await generation.reserveGenerationCall(ref!,request);await ledger.start(ref!,prefix.callId);
  }
  if(kind==="fallback"){
   await ledger.settle(ref!,prefix.callId,{status:"rejected",rejectionCode:"CHAT_MODEL_RETRYABLE_REJECTION"});
   await createExecutionChatFallbackService(db,{now,resolve:async()=>({apiFormat:"openai_chat",baseUrl:"https://unused.invalid",model:"fixture",token:"unused"})}).resolve(ref!,request.operationKey);
   prefix=await generation.reserveGenerationCall(ref!,{...request,operationKey:`${request.operationKey}/fallback/model/1`});await ledger.start(ref!,prefix.callId);
  }
  await ledger.settle(ref!,prefix.callId,{status:"settled",usage:{totalTokens:2},providerResult:kind==="child"?{...receipt,content:[{type:"tool-call",toolCallId:"provider-tool",toolName:"fixture_read",input:"{}"}],finishReason:{unified:"tool-calls"}}:receipt});
  messages.push({role:"assistant",callId:prefix.callId});
  if(kind==="child"){
   const parent=await ledger.reserve(ref!,{kind:"tool",operationKey:"fixture-tool",inputDigest:"sha256:"+"a".repeat(64),reservedTokens:0});await ledger.start(ref!,parent.id);
   const child=await ledger.reserve(ref!,{kind:"model",parentCallId:parent.id,operationKey:"fixture-child",inputDigest:"sha256:"+"b".repeat(64),reservedTokens:128});await ledger.start(ref!,child.id);
   await ledger.settle(ref!,child.id,{status:"settled",usage:{totalTokens:2},providerResult:receipt});
   await ledger.settle(ref!,parent.id,{status:"settled",usage:{totalTokens:0},resultText:JSON.stringify({schemaVersion:1,kind:"tool",toolCallId:"provider-tool",toolName:"fixture_read",output:{status:"ok"}})});
   messages.push({role:"tool",callId:parent.id});
  }
  const calls=(await ledger.inspect(ref!)).calls;
  await checkpoints.save(ref!,{expectedRevision:0,expectedLedgerSequence:calls.at(-1)!.sequence,messages});
 }
 const tailRequest={...request,operationKey:`${id}/model/${kind==="empty"?1:2}`};
 const tail=await generation.reserveGenerationCall(ref!,tailRequest);await ledger.start(ref!,tail.callId);
 await tasks.command(ctx,{taskIds:[task.id],command:"pause",idempotencyKey:"pause"});await ledger.settle(ref!,tail.callId,{status:"unknown"});
 await tasks.acknowledgeControl({taskId:task.id,workerId:id,attempt:ref!.attempt});await tasks.command(ctx,{taskIds:[task.id],command:"resume",idempotencyKey:"resume"});await claim();
 const before=(await ledger.inspect(ref!)).calls;
 await outcomes.recordFailure(ref!,{outcome:"unknown_result",errorCode:"MODEL_CALL_REQUIRES_RECONCILIATION"});
 expect((await db.select().from(executionTasks).where(eq(executionTasks.id,task.id)))[0]!.retryOfCallId).toBe(tail.callId);
 await db.update(executionTasks).set({retryOfCallId:null}).where(eq(executionTasks.id,task.id));
 const recovery=await tasks.recoverExpiredLeases({includeSafeUnknownResults:true,taskId:task.id});
 expect(recovery.requeued,JSON.stringify((await db.select().from(executionTasks).where(eq(executionTasks.id,task.id)))[0])).toBe(1);await claim();
 const retry=await generation.reserveGenerationCall(ref!,tailRequest);expect(retry.status).toBe("reserved");expect(retry.callId).not.toBe(tail.callId);
 expect(await generation.reserveGenerationCall(ref!,tailRequest)).toEqual(retry);
 const after=(await ledger.inspect(ref!)).calls;expect(after.slice(0,-1)).toEqual(before);expect(after.at(-1)!.retryOfCallId).toBe(tail.callId);
});
