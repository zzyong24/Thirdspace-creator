import {createContinuousExecutionBudget} from '@creatoros/contract/execution-worker';
import { afterAll,beforeAll,describe,expect,it } from "vitest";
import { createDb,type Db } from "@creatoros/backend";
import { createPersistentTaskService } from "./persistent-task.service";
import { createExecutionWorkerCallPorts } from "./execution-worker-call-ports.service";
import { createExecutionCallLedgerService } from "./execution-call-ledger.service";
import { createExecutionWorkerOutcomeService } from "./execution-worker-outcome.service";
const ctx={userId:"retry-user",accountId:"retry-account",requestId:"test",source:"user" as const};
const modelInput={kind:"model.generate",prompt:"正文",capability:"script",maxOutputTokens:128,operationKey:"generate"};
describe("持久重试调度",()=>{
  let db:Db;let close:()=>Promise<void>;
  beforeAll(async()=>{const c=await createDb();db=c.db;close=()=>c.client.close();});afterAll(async()=>close?.());
  async function fixture(id:string){
    const clock={stamp:"2026-09-05T00:00:00.000Z"};const now=()=>clock.stamp;
    const deps={now,budget:{maxCalls:2,maxTokens:10000,deadlineMs:300000}};
    const tasks=createPersistentTaskService(db,{now});
    const task=await tasks.enqueue(ctx,{kind:"ai_task",ownerType:"ai_task",ownerId:id,idempotencyKey:id,payload:{modelInput}});
    const claim=await tasks.claimTask({taskId:task.id,workerId:"worker"});if(!claim)throw new Error("claim missing");
    const ref={executionTaskId:task.id,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
    return {clock,now,tasks,ref,ports:createExecutionWorkerCallPorts(db,deps),ledger:createExecutionCallLedgerService(db,deps),outcomes:createExecutionWorkerOutcomeService(db,{now,random:()=>0})};
  }
  it("拒绝诊断保存在原调用并到达任务错误，持久前再次脱敏",async()=>{
    const f=await fixture("provider-detail");const call=await f.ports.reserveCall(f.ref,{operationKey:"generate",maxOutputTokens:128});
    await f.ports.startCall(f.ref,{callId:call.callId});
    await f.ledger.settle(f.ref,call.callId,{status:"rejected",errorDetail:"http_400: invalid tool_choice token=synthetic-sensitive"});
    const saved=(await f.ledger.inspect(f.ref)).calls.find(row=>row.id===call.callId)!;
    expect(saved.resultText).toContain("invalid tool_choice");expect(saved.resultText).not.toContain("synthetic-sensitive");
    await f.outcomes.recordFailure(f.ref,{outcome:"failed",errorCode:"http_400"});
    expect(await f.tasks.get(ctx,f.ref.executionTaskId)).toMatchObject({errorCode:"http_400",errorMessage:expect.stringContaining("invalid tool_choice")});
  });
  it("保留完整Retry-After，暂停恢复不能提前领取；到期同键重试并受总调用预算限制",async()=>{
    const f=await fixture("retry");const a=await f.ports.reserveCall(f.ref,{operationKey:"generate",maxOutputTokens:128});
    await f.ports.startCall(f.ref,{callId:a.callId});await f.ports.settleCall(f.ref,{callId:a.callId,status:"rejected"});
    expect(await f.outcomes.recordFailure(f.ref,{outcome:"retry_wait",errorCode:"RATE_LIMIT",retryAfterMs:120000})).toEqual({status:"retry_wait",retryAt:"2026-09-05T00:02:00.000Z"});
    expect(await f.tasks.claimTask({taskId:f.ref.executionTaskId,workerId:"early"})).toBeNull();
    expect(await f.tasks.claimNext({workerId:"early-next",kinds:["ai_task"]})).toBeNull();
    expect(await f.tasks.get(ctx,f.ref.executionTaskId)).toMatchObject({status:"queued",runtimeStatus:"retry_wait"});
    await f.tasks.command(ctx,{taskIds:[f.ref.executionTaskId],command:"pause",idempotencyKey:"p"});
    await f.tasks.command(ctx,{taskIds:[f.ref.executionTaskId],command:"resume",idempotencyKey:"r"});
    f.clock.stamp="2026-09-05T00:01:59.999Z";
    expect(await f.tasks.claimTask({taskId:f.ref.executionTaskId,workerId:"early"})).toBeNull();
    f.clock.stamp="2026-09-05T00:02:00.000Z";
    const claim=await f.tasks.claimTask({taskId:f.ref.executionTaskId,workerId:"next"});if(!claim)throw new Error("retry missing");
    f.ref={...f.ref,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
    const b=await f.ports.reserveCall(f.ref,{operationKey:"generate",maxOutputTokens:128});expect(b.callId).not.toBe(a.callId);
    await f.ports.startCall(f.ref,{callId:b.callId});await f.ports.settleCall(f.ref,{callId:b.callId,status:"rejected"});
    expect((await f.outcomes.recordFailure(f.ref,{outcome:"retry_wait",errorCode:"RATE_LIMIT"})).status).toBe("failed");
    expect((await f.ledger.inspect(f.ref)).calls.map(c=>c.operationKey)).toEqual(["generate","generate"]);
  });
  it("进程退出留下的纯模型调用按原键有界续跑，不进入永久 unknown_result",async()=>{
    const f=await fixture("unknown");const call=await f.ports.reserveCall(f.ref,{operationKey:"generate",maxOutputTokens:128});
    await f.ports.startCall(f.ref,{callId:call.callId});
    await expect(f.outcomes.recordFailure(f.ref,{outcome:"retry_wait",errorCode:"NETWORK"})).rejects.toMatchObject({name:"ConflictError"});
    f.clock.stamp="2026-09-05T00:01:01.000Z";
    expect((await f.tasks.recoverExpiredLeases()).requeued).toBe(1);
    expect(await f.tasks.get(ctx,f.ref.executionTaskId)).toMatchObject({status:"queued"});
    const claim=await f.tasks.claimTask({taskId:f.ref.executionTaskId,workerId:"next"});expect(claim).toBeTruthy();
    f.ref={...f.ref,attempt:claim!.lease.attempt,fenceToken:claim!.lease.fenceToken};
    const retried=await f.ports.reserveCall(f.ref,{operationKey:"generate",maxOutputTokens:128});
    expect(retried.callId).not.toBe(call.callId);
    expect((await f.ledger.inspect(f.ref)).calls).toEqual(expect.arrayContaining([
      expect.objectContaining({id:call.callId,status:"superseded"}),expect.objectContaining({id:retried.callId,retryOfCallId:call.callId}),
    ]));
  });
  it("旧版已落 unknown_result 的纯模型调用仅在启动扫描时沿原任务恢复",async()=>{
    const f=await fixture("startup-unknown");const call=await f.ports.reserveCall(f.ref,{operationKey:"generate",maxOutputTokens:128});
    await f.ports.startCall(f.ref,{callId:call.callId});await f.ports.settleCall(f.ref,{callId:call.callId,status:"unknown"});
    await f.outcomes.recordFailure(f.ref,{outcome:"unknown_result",errorCode:"MODEL_SETTLEMENT_RECEIPT_UNKNOWN"});
    expect((await f.tasks.recoverExpiredLeases()).requeued).toBe(0);
    expect((await f.tasks.get(ctx,f.ref.executionTaskId)).runtimeStatus).toBe("unknown_result");
    expect((await f.tasks.recoverExpiredLeases({includeSafeUnknownResults:true})).requeued).toBe(1);
    expect(await f.tasks.get(ctx,f.ref.executionTaskId)).toMatchObject({status:"queued",errorCode:null});
  });
  it("外部工具结果未知仍保持待对账，启动扫描不会盲重放",async()=>{
    const f=await fixture("tool-unknown");const call=await f.ledger.reserve(f.ref,{operationKey:"tool",kind:"tool",inputDigest:"sha256:"+"b".repeat(64),reservedTokens:0});
    await f.ledger.start(f.ref,call.id);await f.ledger.settle(f.ref,call.id,{status:"unknown"});
    await f.outcomes.recordFailure(f.ref,{outcome:"unknown_result",errorCode:"TOOL_RESULT_UNKNOWN"});
    expect((await f.tasks.recoverExpiredLeases({includeSafeUnknownResults:true})).requeued).toBe(0);
    expect((await f.tasks.get(ctx,f.ref.executionTaskId)).runtimeStatus).toBe("unknown_result");
  });
  it("模型连接中断废弃本次候选后，原任务自动进入重试等待",async()=>{
    const f=await fixture("superseded");const call=await f.ports.reserveCall(f.ref,{operationKey:"generate",maxOutputTokens:128});
    await f.ports.startCall(f.ref,{callId:call.callId});await f.ports.settleCall(f.ref,{callId:call.callId,status:"superseded"});
    expect(await f.outcomes.recordFailure(f.ref,{outcome:"retry_wait",errorCode:"MODEL_STREAM_INTERRUPTED"})).toMatchObject({status:"retry_wait"});
    expect(await f.tasks.get(ctx,f.ref.executionTaskId)).toMatchObject({status:"queued",runtimeStatus:"retry_wait"});
  });
  it("等待登录或配置不会被自动领取，显式恢复后才允许领取",async()=>{
    const f=await fixture("login");
    const call=await f.ports.reserveCall(f.ref,{operationKey:"generate",maxOutputTokens:128});
    await f.ports.startCall(f.ref,{callId:call.callId});await f.ports.settleCall(f.ref,{callId:call.callId,status:"rejected"});
    await f.outcomes.recordFailure(f.ref,{outcome:"waiting_user",errorCode:"MODEL_CONFIG_MISSING"});
    expect(await f.tasks.claimTask({taskId:f.ref.executionTaskId,workerId:"next"})).toBeNull();
    await f.tasks.command(ctx,{taskIds:[f.ref.executionTaskId],command:"resume",idempotencyKey:"configured"});
    const claim=await f.tasks.claimTask({taskId:f.ref.executionTaskId,workerId:"next"});if(!claim)throw new Error("resume missing");
    f.ref={...f.ref,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
    expect((await f.ports.reserveCall(f.ref,{operationKey:"generate",maxOutputTokens:128})).callId).not.toBe(call.callId);
  });
  it('T1426 额度不足保留原任务与准确恢复提示，不自动换源或重提',async()=>{
    const f=await fixture('credit-message');
    const call=await f.ports.reserveCall(f.ref,{operationKey:'generate',maxOutputTokens:128});
    await f.ports.startCall(f.ref,{callId:call.callId});
    await f.ports.settleCall(f.ref,{callId:call.callId,status:'rejected'});
    await f.outcomes.recordFailure(f.ref,{outcome:'waiting_user',errorCode:'AI_CREDIT_EXHAUSTED'});
    expect(await f.tasks.get(ctx,f.ref.executionTaskId)).toMatchObject({id:f.ref.executionTaskId,runtimeStatus:'waiting_user',errorCode:'AI_CREDIT_EXHAUSTED',errorMessage:expect.stringContaining('额度不足')});
    expect((await f.tasks.get(ctx,f.ref.executionTaskId)).errorMessage).toContain('继续原任务');
    expect(await f.tasks.claimTask({taskId:f.ref.executionTaskId,workerId:'no-auto-resume'})).toBeNull();
  });
  it('T1428 受管支付拒绝保留原任务与固定诊断，未获继续授权不自动领取',async()=>{
    const f=await fixture('managed-payment-message');
    const message='官方模型服务返回支付或权益核验拒绝（HTTP 402）。请在设置查看 AI 额度与消耗，核对后继续原任务。';
    const call=await f.ports.reserveCall(f.ref,{operationKey:'generate',maxOutputTokens:128});
    await f.ports.startCall(f.ref,{callId:call.callId});
    await f.ledger.settle(f.ref,call.callId,{status:'rejected',errorDetail:message});
    expect((await f.ledger.inspect(f.ref)).calls.find(row=>row.id===call.callId)).toMatchObject({status:'rejected',resultText:message});
    await f.outcomes.recordFailure(f.ref,{outcome:'waiting_user',errorCode:'CHANNEL_MODEL_PAYMENT_REQUIRED',errorMessage:'private-provider private-model token=private-token'});
    const task=await f.tasks.get(ctx,f.ref.executionTaskId);
    expect(task).toMatchObject({id:f.ref.executionTaskId,runtimeStatus:'waiting_user',errorCode:'CHANNEL_MODEL_PAYMENT_REQUIRED',errorMessage:message});
    expect(JSON.stringify(task)).not.toMatch(/private-provider|private-model|private-token|额度不足/);
    expect(await f.tasks.claimTask({taskId:f.ref.executionTaskId,workerId:'no-auto-payment-retry'})).toBeNull();
    await f.tasks.command(ctx,{taskIds:[f.ref.executionTaskId],command:'resume',idempotencyKey:'payment-explicit-resume'});
    const claim=await f.tasks.claimTask({taskId:f.ref.executionTaskId,workerId:'payment-retry'});expect(claim?.task.id).toBe(f.ref.executionTaskId);
    if(!claim)throw Error('缺少原任务恢复回执');
    const nextRef={executionTaskId:f.ref.executionTaskId,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
    const retry=await f.ports.reserveCall(nextRef,{operationKey:'generate',maxOutputTokens:128});expect(retry.callId).not.toBe(call.callId);
    expect((await f.ledger.inspect(nextRef)).calls.find(row=>row.id===retry.callId)).toMatchObject({retryOfCallId:call.callId});
  });
  it("等待超出原截止时间时停止，不能缩短服务端要求的等待",async()=>{
    const f=await fixture("deadline");const call=await f.ports.reserveCall(f.ref,{operationKey:"generate",maxOutputTokens:128});
    await f.ports.startCall(f.ref,{callId:call.callId});await f.ports.settleCall(f.ref,{callId:call.callId,status:"rejected"});
    expect((await f.outcomes.recordFailure(f.ref,{outcome:"retry_wait",errorCode:"RATE_LIMIT",retryAfterMs:600000})).status).toBe("failed");
  });
  it("停机越过等待截止时间后终结任务，不永久显示排队",async()=>{
    const f=await fixture("expired-wait");const call=await f.ports.reserveCall(f.ref,{operationKey:"generate",maxOutputTokens:128});
    await f.ports.startCall(f.ref,{callId:call.callId});await f.ports.settleCall(f.ref,{callId:call.callId,status:"rejected"});
    await f.outcomes.recordFailure(f.ref,{outcome:"retry_wait",errorCode:"RATE_LIMIT",retryAfterMs:120000});
    f.clock.stamp="2026-09-05T00:05:01.000Z";
    await f.tasks.recoverExpiredLeases();
    expect(await f.tasks.get(ctx,f.ref.executionTaskId)).toMatchObject({status:"failed",errorCode:"EXECUTION_DEADLINE"});
  });

});


// 此用例复用真实PGlite表/账本/任务与outcome；原有限预算fixture及截止测试不变。
it('T1413真实持久continuous单次超时废弃候选，原task retry_wait且deadline保持null',async()=>{
 const opened=await createDb();const database=opened.db;
 try{
  const clock={stamp:'2026-10-25T00:00:00.000Z'},now=()=>clock.stamp;
  const tasks=createPersistentTaskService(database,{now}),budget=createContinuousExecutionBudget();
  const task=await tasks.enqueue(ctx,{kind:'ai_task',ownerType:'ai_task',ownerId:'continuous-timeout',idempotencyKey:'continuous-timeout',payload:{modelInput},executionBudget:budget});
  const claim=(await tasks.claimTask({taskId:task.id,workerId:'worker'}))!;
  const ref={executionTaskId:task.id,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
  const ports=createExecutionWorkerCallPorts(database,{now,budget}),ledger=createExecutionCallLedgerService(database,{now,budget}),outcomes=createExecutionWorkerOutcomeService(database,{now,random:()=>0});
  const call=await ports.reserveCall(ref,{operationKey:'generate',maxOutputTokens:128});await ports.startCall(ref,{callId:call.callId});
  await ports.settleCall(ref,{callId:call.callId,status:'superseded'});
  expect(await outcomes.recordFailure(ref,{outcome:'retry_wait',errorCode:'MODEL_TIMEOUT'})).toMatchObject({status:'retry_wait'});
  expect(await tasks.get(ctx,task.id)).toMatchObject({id:task.id,runtimeStatus:'retry_wait'});
  expect(await ledger.inspect(ref)).toMatchObject({budget:{policy:'continuous',maxCalls:null,deadlineMs:null},deadlineAt:null,calls:[{id:call.callId,status:'superseded'}]});
  clock.stamp='2026-10-25T00:01:00.000Z';
  const next=(await tasks.claimTask({taskId:task.id,workerId:'retry-worker'}))!;expect(next.task.id).toBe(task.id);
  const nextRef={executionTaskId:task.id,attempt:next.lease.attempt,fenceToken:next.lease.fenceToken};
  const retry=await ports.reserveCall(nextRef,{operationKey:'generate',maxOutputTokens:128});expect(retry.callId).not.toBe(call.callId);
  expect(await ledger.inspect(nextRef)).toMatchObject({deadlineAt:null,calls:[{id:call.callId,status:'superseded'},{id:retry.callId,retryOfCallId:call.callId}]});
 }finally{await opened.client.close();}
},120000);
