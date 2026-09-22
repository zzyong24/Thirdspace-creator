import {afterAll,beforeAll,expect,it} from "vitest";
import {randomUUID} from "node:crypto";
import {createDb,aiTasks,executionTasks,executionCalls,eq,asc,type Db} from "@creatoros/backend";
import {chatWorkerInputSchema,type ExecutionRef} from "@creatoros/contract/execution-worker";
import {createPersistentTaskService} from "./persistent-task.service";
import {createExecutionCallLedgerService} from "./execution-call-ledger.service";
import {createExecutionChatToolPorts} from "./execution-chat-tool-ports.service";
import {createWorkbenchPlanService} from "./workbench-plan.service";
import {recoverableWorkbenchPlanCalls} from "./workbench-plan-recovery";
import {createChatWorkbenchPlanToolHost} from "../ai-runtime/chat-workbench-plan-tool-host";
import {chatWorkbenchPlanCapability} from "../ai-runtime/chat-workbench-plan-tool";
import {defineWorkbenchChatTool} from "../ai-runtime/chat-tool-gate";
import {prepareChatToolDefinitions} from "../ai-runtime/chat-tool-definitions";
import {chatInputDigest} from "../ai/chat-turn-submission.service";
import {agenticToolOperationKey} from "./agentic-tool-binding";

let db:Db,close:()=>Promise<void>;
beforeAll(async()=>{const opened=await createDb();db=opened.db;close=()=>opened.client.close();});
afterAll(async()=>close?.());
const now=()=>"2026-09-22T10:00:00.000Z";
const budget={maxCalls:10,maxTokens:10000,deadlineMs:60000};
const step={stepId:"read",title:"读取资料",dependsOn:[],status:"pending" as const,operationRefs:[],artifactRefs:[]};
async function fixture(crash:"before"|"after"|"validation"){
  const id=randomUUID(),ctx={userId:id,accountId:id,requestId:id,source:"user" as const};
  const prototype=defineWorkbenchChatTool(chatWorkbenchPlanCapability,async()=>{throw new Error("unused");});
  const prepared=await prepareChatToolDefinitions({"plan.update":prototype},{workbenchCapabilities:[chatWorkbenchPlanCapability]});
  const input=chatWorkerInputSchema.parse({kind:"chat.run",executionEngine:"pi",recoverMissingFinal:true,operationKey:"turn",capability:"copilot.assist",userId:id,accountId:id,conversationId:id,sourceMessageId:id,system:"计划",messages:[{role:"user",content:"计划"}],maxSteps:4,maxOutputTokens:128,tools:prepared.definitions});
  const tasks=createPersistentTaskService(db,{now}),task=await tasks.enqueue(ctx,{kind:"ai_task",ownerType:"ai_task",ownerId:id,idempotencyKey:id,payload:{aiTaskId:id,modelInput:input}});
  await db.insert(aiTasks).values({id,userId:id,accountId:id,taskType:"copilot.assist",status:"running",executionTaskId:task.id,idempotencyKey:id,requestedAt:now(),inputData:{modelInputDigest:chatInputDigest(input)}});
  const claim=(await tasks.claimTask({taskId:task.id,workerId:id}))!,ref={executionTaskId:task.id,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
  const request={expectedRevision:0,steps:[crash==="validation"?{...step,status:"succeeded" as const,operationRefs:["invented"]}:step]};
  const plans=createWorkbenchPlanService(db,{now}),tools=await createChatWorkbenchPlanToolHost(db,{now})(ctx,input,ref,new AbortController().signal);
  const ledger=createExecutionCallLedgerService(db,{now,budget}),model=await ledger.reserve(ref,{kind:"model",operationKey:"model",inputDigest:"sha256:"+"a".repeat(64),reservedTokens:20});
  await ledger.start(ref,model.id);
  await ledger.settle(ref,model.id,{status:"settled",usage:{totalTokens:5},providerResult:{content:[{type:"tool-call",toolCallId:"plan",toolName:"plan_update",input:JSON.stringify(request)}],finishReason:{unified:"tool-calls"},usage:{inputTokens:{total:3},outputTokens:{total:2}},warnings:[]}});
  // 保留旧 host 的执行窗口：校验错误直接抛出，或保存前/保存后、结算前进程失联。
  const oldPorts=createExecutionChatToolPorts(db,{now,budget,tools:{...tools,"plan.update":{...tools["plan.update"]!,execute:async()=>{
    if(crash!=="before")await plans.save(ref,request);
    throw new Error("模拟进程在回执结算前退出");
  }}}});
  const reserved=await oldPorts.reserve(ref,{modelCallId:model.id,toolCallId:"plan"});await oldPorts.start(ref,{callId:reserved.callId});
  await expect(oldPorts.execute(ref,{callId:reserved.callId})).rejects.toThrow("未确认");
  const calls=()=>db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,task.id)).orderBy(asc(executionCalls.sequence));
  const readTask=async()=>(await db.select().from(executionTasks).where(eq(executionTasks.id,task.id)))[0]!;
  const interrupt=()=>db.update(executionTasks).set({status:"unknown_result",leaseOwner:null,leaseExpiresAt:null}).where(eq(executionTasks.id,task.id));
  const recover=()=>tasks.recoverExpiredLeases({includeSafeUnknownResults:true,taskId:task.id});
  const ports=createExecutionChatToolPorts(db,{now,budget,tools});
  async function replay(){
    const next=(await tasks.claimTask({taskId:task.id,workerId:"resumed"}))!;
    const resumed:ExecutionRef={executionTaskId:task.id,attempt:next.lease.attempt,fenceToken:next.lease.fenceToken};
    expect(resumed.attempt).toBe(ref.attempt+1);expect(resumed.fenceToken).not.toBe(ref.fenceToken);
    const retry=await ports.reserve(resumed,{modelCallId:model.id,toolCallId:"plan"});
    expect(retry.callId).toBe(reserved.callId);expect(retry.status).toBe("reserved");
    await ports.start(resumed,{callId:retry.callId});
    const output=await ports.execute(resumed,{callId:retry.callId});
    const settled=(await calls()).find(call=>call.id===retry.callId)!;
    expect(settled.toolExecutionClaimId).toBeTruthy();
    expect(await ports.execute(resumed,{callId:retry.callId})).toEqual(output);
    expect((await calls()).find(call=>call.id===retry.callId)).toEqual(settled);
    return output;
  }
  return {ctx,task,ref,input,plans,request,model,calls,readTask,interrupt,recover,replay,callId:reserved.callId};
}

it.each(["before","after","validation"] as const)("真实 recoverExpiredLeases 恢复 %s 中断，原 ID/键重放且预算费用保留",async crash=>{
  const f=await fixture(crash),before=await f.calls(),taskBefore=await f.readTask();
  expect(before[1]).toMatchObject({status:"unknown",resultText:null});
  expect(await f.plans.read(f.ctx,f.task.id)).toEqual(crash==="after"?{planRevision:1,steps:[step]}:null);
  await f.interrupt();
  const result=await f.recover();
  expect(result).toEqual({requeued:1,unknownResult:0,failed:0,paused:0,cancelled:0});
  const recovered=await f.calls();
  expect(recovered).toEqual([before[0],{...before[1],status:"reserved",startedAttempt:null,toolExecutionClaimId:null,updatedAt:now()}]);
  expect(await f.readTask()).toMatchObject({id:f.task.id,status:"queued",attempt:taskBefore.attempt,fenceToken:taskBefore.fenceToken,leaseOwner:null,leaseExpiresAt:null});
  expect((await f.recover()).requeued).toBe(0);
  expect(await f.calls()).toEqual(recovered);
  const output=await f.replay();
  expect(output).toMatchObject(crash==="validation"?{status:"error",sideEffect:"none",error:{code:"invalid_input"}}:{status:"ok",sideEffect:"committed"});
  expect(await f.plans.read(f.ctx,f.task.id)).toEqual(crash==="validation"?null:{planRevision:1,steps:[step]});
  const after=await f.calls();expect(after).toHaveLength(2);expect(after[0]).toEqual(before[0]);
  expect(after[1]).toMatchObject({id:before[1]!.id,operationKey:before[1]!.operationKey,inputDigest:before[1]!.inputDigest,sequence:before[1]!.sequence,reservedTokens:0,totalTokens:0,status:"settled"});
  expect(after[1]!.toolExecutionClaimId).not.toBe(before[1]!.toolExecutionClaimId);
  expect((await f.readTask()).executionBudget).toEqual(taskBefore.executionBudget);
  expect((await f.readTask()).deadlineAt).toBe(taskBefore.deadlineAt);
  await expect(createWorkbenchPlanService(db,{now}).save(f.ref,f.request)).rejects.toThrow("执行凭证已失效");
});

it("任务租约尚有效不恢复，过期 started 调用才可沿原键重新领取",async()=>{
  const f=await fixture("before");
  await db.update(executionCalls).set({status:"started"}).where(eq(executionCalls.id,f.callId));
  expect((await f.recover()).requeued).toBe(0);
  await db.update(executionTasks).set({leaseExpiresAt:new Date(Date.parse(now())-1).toISOString()}).where(eq(executionTasks.id,f.task.id));
  expect((await f.recover()).requeued).toBe(1);
  expect(await f.replay()).toMatchObject({status:"ok",sideEffect:"committed"});
});

it("原保存后计划已经继续推进，无法还原原调用结果时保留 unknown",async()=>{
  const f=await fixture("after");
  await f.plans.save(f.ref,{expectedRevision:1,steps:[{...step,status:"running"}]});
  await f.interrupt();const before=await f.calls();
  expect((await f.recover()).requeued).toBe(0);
  expect(await f.calls()).toEqual(before);
  expect(await f.plans.read(f.ctx,f.task.id)).toMatchObject({planRevision:2});
});

it.each(["version","effect","execution","schema","owner","legacy","operationKey","inputDigest","params","modelStatus","modelIdentity","duplicateModelTool","receipt","usage","tokens","externalJob","child","foreignTask","cancelled","damagedPlan"])("恢复判定拒绝 %s 不一致或非空外部证据",async field=>{
  const f=await fixture("before");await f.interrupt();
  const task=structuredClone(await f.readTask()),calls=structuredClone(await f.calls()),call=calls[1]!,model=calls[0]!;
  const payload=task.payload as {modelInput:typeof f.input;aiTaskId:string;workbenchPlan?:unknown};
  const definition=payload.modelInput.tools[0]!;
  if(field==="version")definition.version="forged";
  if(field==="effect")definition.effect="none";
  if(field==="execution")definition.execution="host.task-submit";
  if(field==="schema")definition.parameters={type:"object"};
  if(field==="owner")payload.modelInput.accountId="foreign";
  if(field==="legacy")delete payload.modelInput.executionEngine;
  if(field==="operationKey")call.operationKey="tool:forged";
  if(field==="inputDigest")call.inputDigest="sha256:"+"b".repeat(64);
  const receipt=model.providerResult as {content:Array<{input:string;toolCallId:string}>};
  if(field==="params")receipt.content[0]!.input=JSON.stringify({...f.request,expectedRevision:7});
  if(field==="modelStatus")model.status="unknown";
  if(field==="modelIdentity")model.id="another-model";
  if(field==="duplicateModelTool")receipt.content.push({...receipt.content[0]!});
  if(field==="receipt")call.resultText="已有证据";
  if(field==="usage")call.usage={totalTokens:0};
  if(field==="tokens")call.reservedTokens=1;
  if(field==="externalJob")call.providerJob={id:"external"};
  if(field==="child")calls.push({...model,id:"child",parentCallId:call.id,sequence:3});
  if(field==="foreignTask")call.executionTaskId="foreign";
  if(field==="cancelled")task.status="cancel_requested";
  if(field==="damagedPlan")payload.workbenchPlan={planRevision:1,steps:"损坏"};
  const original=structuredClone({task,calls});
  expect(await recoverableWorkbenchPlanCalls(task,calls,now())).toEqual([]);
  expect({task,calls}).toEqual(original);
});

it("同一模型回合的其他 unknown 工具不因 plan 可恢复而被重置",async()=>{
  const f=await fixture("before");await f.interrupt();
  const task=await f.readTask(),calls=await f.calls(),model=calls[0]!;
  const payload=task.payload as {modelInput:typeof f.input};
  payload.modelInput.tools.push({name:"external.write",version:"1",effect:"committed",description:"外部动作",parameters:{type:"object"}});
  const receipt=model.providerResult as {content:unknown[]};
  receipt.content.push({type:"tool-call",toolCallId:"external",toolName:"external_write",input:"{}"});
  const external={...calls[1]!,id:"external-call",sequence:3,operationKey:agenticToolOperationKey(model.id,"external")};
  calls.push(external);
  expect(await recoverableWorkbenchPlanCalls(task,calls,now())).toEqual([f.callId]);
  expect(external.status).toBe("unknown");
});
