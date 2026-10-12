// @vitest-environment node
import {randomUUID,createHash} from "node:crypto";
import {spawn} from "node:child_process";
import {mkdtemp,readFile,writeFile,rm,readdir,mkdir} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join,resolve,dirname} from "node:path";
import {afterAll,beforeAll,expect,it,vi} from "vitest";
import {createDb,createCliInvocationService,aiTasks,executionCalls,executionTasks,executionStreamEvents,eq,asc,sql,type Db} from "@creatoros/backend";
import {ENDPOINTS,type Transport,type RequestContext} from "@creatoros/contract";
import {chatWorkerInputSchema} from "@creatoros/contract/execution-worker";
import {createPersistentTaskService} from "../../../backend/src/modules/execution/persistent-task.service";
import {createExecutionCallLedgerService} from "../../../backend/src/modules/execution/execution-call-ledger.service";
import {createExecutionChatToolPorts} from "../../../backend/src/modules/execution/execution-chat-tool-ports.service";
import {createWorkbenchPublicTransport} from "../../../backend/src/modules/execution/workbench-public.transport";
import {createWorkbenchFileRecoveryService,fileWriteRequestDigest,type FileReceiptQuery} from "../../../backend/src/modules/execution/workbench-file-recovery.service";
import {prepareChatToolDefinitions} from "../../../backend/src/modules/ai-runtime/chat-tool-definitions";
import {defineWorkbenchChatTool} from "../../../backend/src/modules/ai-runtime/chat-tool-gate";
import {nativeFileCapabilities,createNativeFilesWorkbenchHost} from "./workbench-native-host";
import {createWorkbenchNativeClient,NativeFileError,type NativeLeasePort} from "./workbench-native-client";
import {createNativeFileRecoveryService} from "./workbench-file-recovery";
import {createExecutionLeaseService} from "../../../backend/src/modules/execution/execution-lease.service";
import {createWorkbenchPlanService} from "../../../backend/src/modules/execution/workbench-plan.service";
import {createChatWorkbenchCapabilityHost} from "../../../backend/src/modules/ai-runtime/chat-workbench-capability-host";
import {chatInputDigest} from "../../../backend/src/modules/ai/chat-turn-submission.service";
import {POST} from "../app/api/v1/dispatch/route";
import {startLoopbackCliFixture} from "../../../mcp-server/tests/helpers/loopback-cli";
import {createRecoveryWakeCoordinator} from "../../../backend/src/application/recovery-wake";

const shared=vi.hoisted(()=>({transport:null as Transport|null,gateway:null as ReturnType<typeof createCliInvocationService>|null,ctx:null as RequestContext|null}));
vi.mock("@/server/persistence-client",()=>({compositeTransport:{request:(...args:Parameters<Transport["request"]>)=>shared.transport!.request(...args)},getCliInvocationService:async()=>shared.gateway}));
vi.mock("@/lib/request-context.server",()=>({resolveRequestContext:async(_token:unknown,accountId:string)=>({...shared.ctx!,accountId}),isAuthError:()=>false,isOwnershipError:()=>false}));

let db:Db,close:()=>Promise<void>;
beforeAll(async()=>{const f=await createDb();db=f.db;close=()=>f.client.close();});
afterAll(async()=>close?.());
const hash=(v:string)=>createHash("sha256").update(v).digest("hex");
const budget={maxCalls:20,maxTokens:100000,deadlineMs:60000};
async function fixture(socketPath?:string,stopMode:"paused"|"unknown_result"="paused",pauseBeforeClaim=false,priorSameParameters=false,initialBudget?:typeof budget){
 const id=randomUUID(),ctx={userId:id,accountId:id,requestId:id,source:"user" as const};
 const cap=nativeFileCapabilities.find(c=>c.name==="files.edit")!;
 const setup=await prepareChatToolDefinitions({"files.edit":defineWorkbenchChatTool(cap,async()=>{throw Error("unused");})},{workbenchCapabilities:[cap]});
 const input=chatWorkerInputSchema.parse({kind:"chat.run",executionEngine:"pi",operationKey:id,capability:"copilot.assist",userId:id,accountId:id,conversationId:id,sourceMessageId:id,
  system:"修复文件",messages:[{role:"user",content:"修复报告"}],maxSteps:8,maxOutputTokens:128,tools:setup.definitions,workbenchCapabilities:[cap],workbenchPlatform:"macos"});
 const tasks=createPersistentTaskService(db),task=await tasks.enqueue(ctx,{kind:"ai_task",ownerType:"ai_task",ownerId:id,idempotencyKey:id,...(initialBudget?{executionBudget:initialBudget}:{}),payload:{aiTaskId:id,modelInput:input}});
 await db.insert(aiTasks).values({id,userId:id,accountId:id,taskType:"copilot.assist",status:"running",executionTaskId:task.id,idempotencyKey:id,requestedAt:new Date().toISOString(),inputData:{modelInputDigest:chatInputDigest(input)}});
 const initialBirth=initialBudget?(await db.select().from(executionTasks).where(eq(executionTasks.id,task.id)))[0]:undefined;
 const claim=(await tasks.claimTask({taskId:task.id,workerId:id}))!,ref={executionTaskId:task.id,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
 const ledger=createExecutionCallLedgerService(db,{budget:initialBudget??budget}),model=await ledger.reserve(ref,{kind:"model",operationKey:"model",inputDigest:"sha256:"+"a".repeat(64),reservedTokens:10});
 await ledger.start(ref,model.id);
 await ledger.settle(ref,model.id,{status:"settled",usage:{totalTokens:5},providerResult:{content:[...(priorSameParameters?[{type:"tool-call",toolCallId:"prior",toolName:"files_edit",input:JSON.stringify({path:"报告.html",content:"完整目标🙂",expectedVersion:3})}]:[]),{type:"tool-call",toolCallId:"write",toolName:"files_edit",input:JSON.stringify({path:"报告.html",content:"完整目标🙂",expectedVersion:3})}],finishReason:{unified:"tool-calls"},usage:{inputTokens:{total:3},outputTokens:{total:2}},warnings:[]}});
 const write=vi.fn(async()=>{if(priorSameParameters)return {status:"ok" as const,summary:"同参旧操作已确认",evidence:[],error:null,continuation:null,sideEffect:"committed" as const};throw Error("reply lost after Native write");});
 const leases=createExecutionLeaseService(db);
 const nativeOptions={platform:"darwin" as const,desktop:true,socketPath};
 const nativeLease:NativeLeasePort={withLease:(ref,mode,action)=>leases.withLease(ref,mode,async({task,context})=>{
  if(!context.accountId)throw Error("fixture missing account");
  return action({task,context:{userId:context.userId,accountId:context.accountId}});
 })};
 const native=createWorkbenchNativeClient(nativeLease,nativeOptions);
 let tools:Parameters<typeof createExecutionChatToolPorts>[1]["tools"]={"files.edit":{...setup.definitions[0]!,parameters:setup.parameters["files.edit"]!.parameters,approve:async()=>({status:"not-applicable"}),execute:write}};
 if(socketPath){
  for(let expectedVersion=0;expectedVersion<3;expectedVersion++)await native.file(ref,`seed-${expectedVersion}`,{kind:"write",path:"报告.html",contentBase64:Buffer.from(`v${expectedVersion+1}`).toString("base64"),expectedVersion});
  // Pause precisely after Rust acknowledged the committed write but before the
  // client's post-I/O lease check. Every write below uses the real private IPC fixture.
  let checks=0;
  const interrupted=createWorkbenchNativeClient({withLease:async(ref,mode,action)=>{
   if(++checks===2&&!pauseBeforeClaim){
    if(stopMode==="unknown_result")throw new NativeFileError("NATIVE_RESULT_UNKNOWN",true);
    await tasks.command(ctx,{taskIds:[task.id],command:"pause",idempotencyKey:randomUUID()});
   }
   return nativeLease.withLease(ref,mode,action);
  }},nativeOptions);
  const host=createNativeFilesWorkbenchHost(db,{...nativeOptions,filePort:interrupted.file})!;
  const resolveTools=createChatWorkbenchCapabilityHost(host,r=>leases.withLease(r,"admission",async({task,context})=>({userId:context.userId,accountId:context.accountId!,taskId:task.id,attempt:task.attempt,fenceToken:task.fenceToken!,leaseId:task.leaseOwner!})),async()=>{});
  tools=await resolveTools(ctx,input,ref,new AbortController().signal);
 }
 const ports=createExecutionChatToolPorts(db,{budget:initialBudget??budget,tools});
 if(priorSameParameters){const prior=await ports.reserve(ref,{modelCallId:model.id,toolCallId:"prior"});await ports.start(ref,{callId:prior.callId});await ports.execute(ref,{callId:prior.callId});}
 const call=await ports.reserve(ref,{modelCallId:model.id,toolCallId:"write"});await ports.start(ref,{callId:call.callId});
 if(pauseBeforeClaim)await tasks.command(ctx,{taskIds:[task.id],command:"pause",idempotencyKey:randomUUID()});
 await expect(ports.execute(ref,{callId:call.callId})).rejects.toThrow();
 if(pauseBeforeClaim){
  expect(write).toHaveBeenCalledTimes(priorSameParameters?1:0);
  await ports.settle(ref,{callId:call.callId,status:"unknown"});
  await tasks.acknowledgeControl({taskId:task.id,workerId:id,attempt:ref.attempt});
 }
 else if(socketPath&&stopMode==="paused")await tasks.acknowledgeControl({taskId:task.id,workerId:id,attempt:ref.attempt});
 else if(socketPath){
  await db.update(executionTasks).set({leaseExpiresAt:new Date(0).toISOString()}).where(eq(executionTasks.id,task.id));
  expect(await tasks.recoverExpiredLeases({taskId:task.id})).toMatchObject({unknownResult:1,requeued:0});
 }
 else{
  expect(write).toHaveBeenCalledOnce();
  await db.update(executionTasks).set({status:"paused",leaseOwner:null,leaseExpiresAt:null}).where(eq(executionTasks.id,task.id));
 }
 const calls=()=>db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,task.id)).orderBy(asc(executionCalls.sequence));
 const readTask=async()=>(await db.select().from(executionTasks).where(eq(executionTasks.id,task.id)))[0]!;
 expect((await calls()).find(row=>row.id===call.callId)).toMatchObject({status:"unknown",toolExecutionClaimId:pauseBeforeClaim?null:expect.any(String)});
 return {ctx,task,ref,calls,readTask,callId:call.callId,write,ports,tasks,native,initialBirth};
}
function committed(q:FileReceiptQuery){
 const scopeKey=[q.scope.userId,q.scope.accountId,q.scope.taskId].map(hash).join(":");
 return {status:"committed",receipt:{schemaVersion:1,scopeKey,operationId:q.operationId,
  requestDigest:fileWriteRequestDigest(scopeKey,q.operationId,q.path,q.expectedVersion,q.contentSha256,q.byteLength),path:q.path,
  expectedVersion:q.expectedVersion,observedBaseVersion:3,contentSha256:q.contentSha256,byteLength:q.byteLength,
  admittedAttempt:q.scope.attempt,fenceToken:q.scope.fenceToken,state:"committed",resultVersion:4}};
}

it("公开对账原调用幂等结算、暂停不唤醒、费用和claim不变；新lease仅回放原工具",async()=>{
 const f=await fixture(),before=await f.calls(),taskBefore=await f.readTask(),read=vi.fn(async(q:FileReceiptQuery)=>committed(q));
 const service=createWorkbenchFileRecoveryService(db,{capabilities:nativeFileCapabilities,readReceipt:read});
 const transport=createWorkbenchPublicTransport({reconcileFile:service.reconcile} as Parameters<typeof createWorkbenchPublicTransport>[0]);
 const request=()=>transport.request(ENDPOINTS.reconcileWorkbenchFile,{params:{taskId:f.task.id},query:undefined,body:{operationId:f.callId}},f.ctx) as Promise<{data:unknown}>;
 const first=await request();expect(first.data).toMatchObject({status:"settled",operationId:f.callId,verificationKind:"native_receipt",version:4});
 expect(await f.readTask()).toEqual(taskBefore);
 const after=await f.calls();expect(after).toHaveLength(2);expect(after[0]).toEqual(before[0]);
 expect(after[1]).toMatchObject({id:f.callId,inputDigest:before[1]!.inputDigest,operationKey:before[1]!.operationKey,sequence:2,status:"settled",reservedTokens:0,totalTokens:0,toolExecutionClaimId:before[1]!.toolExecutionClaimId});
 const receipt=JSON.parse(after[1]!.resultText!);expect(receipt.output.data.recoveryEvidence).toMatchObject({kind:"native_receipt",originalSnapshot:{status:"unknown",resultText:null,toolExecutionClaimId:before[1]!.toolExecutionClaimId}});
 expect(after[1]!.resultText).not.toContain(f.ref.fenceToken);
 expect(await request()).toEqual(first);expect(await f.calls()).toEqual(after);expect(read).toHaveBeenCalledTimes(1);
 await f.tasks.command(f.ctx,{taskIds:[f.task.id],command:"resume",idempotencyKey:randomUUID()});
 const next=(await f.tasks.claimTask({taskId:f.task.id,workerId:"resume"}))!;
 expect(await f.ports.execute({executionTaskId:f.task.id,attempt:next.lease.attempt,fenceToken:next.lease.fenceToken},{callId:f.callId})).toEqual(receipt.output);
 expect(f.write).toHaveBeenCalledTimes(1);expect(await f.calls()).toEqual(after);
});

it.each([
 ["frozen","FROZEN_TOOL_MISMATCH"],["modelUsage","MODEL_USAGE_MISSING"],["modelReceipt","MODEL_RECEIPT_INVALID"],
 ["parentCallId","PARENT_CALL_NOT_ALLOWED"],["toolExecutionClaimId","EXECUTION_CLAIM_MISSING"],
 ["startedMissing","STARTED_ATTEMPT_MISSING"],["startedAhead","STARTED_ATTEMPT_AHEAD"],
 ["providerJob","PROVIDER_JOB_PRESENT"],["providerResult","PROVIDER_RESULT_PRESENT"],["resultRef","RESULT_REF_PRESENT"],
 ["retryOfCallId","RETRY_SOURCE_PRESENT"],["rejectionCode","REJECTION_CODE_PRESENT"],
 ["reservedTokens","RESERVED_TOKENS_MISMATCH"],["accountingBasis","ACCOUNTING_BASIS_MISMATCH"],
 ["children","CHILD_CALLS_PRESENT"],["duplicate","OPERATION_NOT_UNIQUE"],
])("身份诊断 %s只返回固定reason，原拒绝/Native零调用/账本不变",async(field,reason)=>{
 const f=await fixture(),rows=await f.calls(),call=rows[1]!,model=rows[0]!;
 expect(call).toMatchObject({parentCallId:null,reservedTokens:0,accountingBasis:"tokens",retryOfCallId:null,providerJob:null,providerResult:null});
 const secret="private-value-must-not-leak";
 if(field==="frozen"){
  const payload=structuredClone((await f.readTask()).payload) as {modelInput:{tools:{description:string}[]}};
  payload.modelInput.tools[0]!.description=secret;
  await db.update(executionTasks).set({payload}).where(eq(executionTasks.id,f.task.id));
 }else if(field==="modelUsage"||field==="modelReceipt"){
  await db.update(executionCalls).set(field==="modelUsage"?{totalTokens:null}:{providerResult:{...model.providerResult as object,warnings:secret}}).where(eq(executionCalls.id,model.id));
 }else if(field==="children"||field==="duplicate"){
  await db.insert(executionCalls).values({...call,id:randomUUID(),sequence:3,...(field==="children"?{parentCallId:call.id,operationKey:"child"}:{})});
 }else{
  const patch:Partial<typeof call>=field==="parentCallId"?{parentCallId:model.id}:field==="toolExecutionClaimId"?{toolExecutionClaimId:null}:
   field==="startedMissing"?{startedAttempt:null}:field==="startedAhead"?{startedAttempt:99}:field==="providerJob"?{providerJob:{secret}}:
   field==="providerResult"?{providerResult:{secret}}:field==="reservedTokens"?{reservedTokens:7}:field==="accountingBasis"?{accountingBasis:"requests"}:{[field!]:secret};
  await db.update(executionCalls).set(patch).where(eq(executionCalls.id,call.id));
  if(field==="toolExecutionClaimId")await db.update(executionTasks).set({status:"unknown_result"}).where(eq(executionTasks.id,f.task.id));
 }
 const before=await f.calls(),task=await f.readTask(),read=vi.fn(async(q:FileReceiptQuery)=>committed(q));
 const service=createWorkbenchFileRecoveryService(db,{capabilities:nativeFileCapabilities,readReceipt:read});
 const api=createWorkbenchPublicTransport({reconcileFile:service.reconcile} as Parameters<typeof createWorkbenchPublicTransport>[0]);
 await expect(api.request(ENDPOINTS.reconcileWorkbenchFile,{params:{taskId:f.task.id},query:undefined,body:{operationId:f.callId}},f.ctx))
  .rejects.toMatchObject({code:"ConflictError",message:`文件恢复身份或调用证据不匹配 [${reason}]`});
 expect(read).not.toHaveBeenCalled();expect(await f.calls()).toEqual(before);expect(await f.readTask()).toEqual(task);
});

it("真实start→pause→缺claim unknown：公开CLI重新准入原call，永久审计且paused不wake",async()=>{
 const f=await fixture(undefined,"paused",true),before=await f.calls(),task=await f.readTask(),read=vi.fn(async(q:FileReceiptQuery)=>committed(q));
 expect(before[1]).toMatchObject({status:"unknown",startedAttempt:f.ref.attempt,toolExecutionClaimId:null,parentCallId:null,reservedTokens:0,accountingBasis:"tokens"});
 const recovery=createWorkbenchFileRecoveryService(db,{capabilities:nativeFileCapabilities,readReceipt:read});
 shared.ctx=f.ctx;shared.transport=createWorkbenchPublicTransport({reconcileFile:recovery.reconcile} as Parameters<typeof createWorkbenchPublicTransport>[0]);
 shared.gateway=createCliInvocationService({db,masterKey:Buffer.alloc(32,7),now:()=>new Date().toISOString(),nextId:()=>randomUUID()});
 const cli=await startLoopbackCliFixture({post:POST,accessToken:"isolated-diagnostic"});
 const args=["call","workbench.files.reconcile","--input",JSON.stringify({params:{taskId:f.task.id},body:{operationId:f.callId}}),"--account",f.ctx.accountId,"--apply","--idempotency-key","identity-reason"];
 try{
  const result=await cli.run(args);
  expect(result).toMatchObject({data:{status:"readmitted",verificationKind:"predispatch_readmission",version:null,hash:null,size:null,auditDigest:expect.stringMatching(/^sha256:/)}});
  expect(await cli.run(args)).toEqual(result);
  const nextArgs=[...args];nextArgs[8]="readmission-replay";
  expect(await cli.run(nextArgs)).toMatchObject({data:(result as {data:unknown}).data});
  const foreign=[...args];foreign[5]="another-account";foreign[8]="foreign-key";
  await expect(cli.run(foreign)).rejects.toMatchObject({status:404,message:expect.not.stringContaining("EXECUTION_CLAIM_MISSING")});
 }finally{await cli.close();}
 expect(read).not.toHaveBeenCalled();expect(f.write).not.toHaveBeenCalled();
 const after=await f.calls(),saved=await f.readTask();
 expect(after).toEqual([before[0],{...before[1],status:"reserved",startedAttempt:null,updatedAt:expect.any(String)}]);
 const audit=(saved.payload as any).filePredispatchRecoveries[f.callId];
 expect(audit.originalCall).toEqual(before[1]);expect(audit.historicalCommit).toBe("unproven");
 expect(saved).toEqual({...task,payload:{...task.payload as object,filePredispatchRecoveries:{[f.callId]:audit}},updatedAt:expect.any(String)});
 await expect(f.ports.settle(f.ref,{callId:f.callId,status:"unknown"})).rejects.toThrow();
 expect(await f.calls()).toEqual(after);
});

it.each(["absent","prepared","native-failed"])("%s不产生回执、不写文件、不解除unknown",async mode=>{
 const f=await fixture(),before=await f.calls();
 const service=createWorkbenchFileRecoveryService(db,{capabilities:nativeFileCapabilities,readReceipt:async q=>{
  if(mode==="native-failed")throw Error("native unavailable");
  if(mode==="absent")return {status:"absent"};
  const value=committed(q);return {...value,status:"prepared",receipt:{...value.receipt,state:"prepared",resultVersion:null}};
 }});
 expect(await service.reconcile(f.ctx,f.task.id,f.callId)).toMatchObject({status:"unknown",verificationKind:null});
 expect(await f.calls()).toEqual(before);expect(f.write).toHaveBeenCalledTimes(1);
});

it.each(["scopeKey","operationId","requestDigest","contentSha256","path","expectedVersion","admittedAttempt","fenceToken","resultVersion"])("拒绝伪原生 %s",async field=>{
 const f=await fixture(),before=await f.calls();
 const service=createWorkbenchFileRecoveryService(db,{capabilities:nativeFileCapabilities,readReceipt:async q=>{
  const r=committed(q);const rec=r.receipt as Record<string,unknown>;rec[field]=typeof rec[field]==="number"?Number(rec[field])+1:field.includes("Digest")||field==="contentSha256"?"sha256:"+"b".repeat(64):"foreign";return r;
 }});
 await expect(service.reconcile(f.ctx,f.task.id,f.callId)).rejects.toThrow();expect(await f.calls()).toEqual(before);
});

it.each(["claim","task","digest","lease","frozen"])("锁外Native期间查询及时完成，%s变动则CAS拒绝",async changed=>{
 const f=await fixture();let release!:()=>void,entered!:()=>void;
 const gate=new Promise<void>(resolve=>release=resolve),ready=new Promise<void>(resolve=>entered=resolve);
 const service=createWorkbenchFileRecoveryService(db,{capabilities:nativeFileCapabilities,readReceipt:async q=>{entered();await gate;return committed(q);}});
 const result=service.reconcile(f.ctx,f.task.id,f.callId);void result.catch(()=>{});
 await Promise.race([ready,result.then(()=>{throw Error("Native reader not reached");})]);
 try{
  expect((await f.readTask()).status).toBe("paused");
  if(changed==="task")await db.update(executionTasks).set({status:"queued"}).where(eq(executionTasks.id,f.task.id));
  else if(changed==="lease")await db.update(executionTasks).set({leaseOwner:"new-worker",leaseExpiresAt:new Date(Date.now()+60000).toISOString()}).where(eq(executionTasks.id,f.task.id));
  else if(changed==="frozen"){
   const current=await f.readTask(),payload=structuredClone(current.payload) as {modelInput:{tools:{version:string}[]}};
   payload.modelInput.tools[0]!.version="changed";
   await db.update(executionTasks).set({payload}).where(eq(executionTasks.id,f.task.id));
  }
  else await db.update(executionCalls).set(changed==="claim"?{toolExecutionClaimId:"new"}:{inputDigest:"sha256:"+"e".repeat(64)}).where(eq(executionCalls.id,f.callId));
 }finally{release();}
 await expect(result).rejects.toThrow();expect((await f.calls())[1]!.status).toBe("unknown");
});

it("账号错误不发Native请求；其他unknown外部动作原样保留",async()=>{
 const f=await fixture(),read=vi.fn(async(q:FileReceiptQuery)=>committed(q));
 const service=createWorkbenchFileRecoveryService(db,{capabilities:nativeFileCapabilities,readReceipt:read});
 await expect(service.reconcile({...f.ctx,accountId:"foreign"},f.task.id,f.callId)).rejects.toThrow();expect(read).not.toHaveBeenCalled();
 const calls=await f.calls(),external={...calls[1]!,id:randomUUID(),sequence:3,operationKey:"browser-unknown",inputDigest:"browser-digest"};
 await db.insert(executionCalls).values(external);
 await service.reconcile(f.ctx,f.task.id,f.callId);
 expect((await f.calls())[2]).toEqual(external);
 await expect(service.reconcile(f.ctx,f.task.id,external.id)).rejects.toThrow();
});

it("Rust/TS UTF8/null请求摘要向量一致",()=>{
 expect(fileWriteRequestDigest("scope","op-甲","草稿/é.md",null,"sha256:efd3cde8796eef45558bd5c45ab2a38800dcdc46a83842f30b1bb5bcdac66bd8",11))
  .toBe("sha256:4ec40ad0265a71c7b3cbf3bead0c31cabf32b03cad663e485a943ccb5e633af9");
});

it("恢复lane单在途，stop等待Native退出且拒绝迟到结算及wake",async()=>{
 const f=await fixture();await db.update(executionTasks).set({status:"unknown_result"}).where(eq(executionTasks.id,f.task.id));
 let release!:()=>void,entered!:()=>void;
 const gate=new Promise<void>(r=>release=r),ready=new Promise<void>(r=>entered=r),after=vi.fn();
 const read=vi.fn(async(q:FileReceiptQuery)=>{entered();await gate;return committed(q);});
 const recovery=createWorkbenchFileRecoveryService(db,{capabilities:nativeFileCapabilities,readReceipt:read,afterReconciled:after});
 const coordinator=createRecoveryWakeCoordinator({lanes:{workbench_files:control=>recovery.scan(control,50)}});
 const original=coordinator.run("workbench_files"),repeated=coordinator.run("workbench_files");
 expect(original).toBe(repeated);
 await Promise.race([ready,original.then(()=>{throw Error("reader not entered");})]);
 const before=await f.calls();let stopped=false;const stop=coordinator.stop().then(()=>{stopped=true;});
 await Promise.resolve();expect(stopped).toBe(false);
 release();await stop;await original;
 expect(after).not.toHaveBeenCalled();expect(await f.calls()).toEqual(before);expect((await f.readTask()).status).toBe("unknown_result");
 const count=read.mock.calls.length;await coordinator.run("workbench_files");expect(read).toHaveBeenCalledTimes(count);
});

it("轮转有界扫描跳过absent/prepared，不能解开另一未知动作；CAS后中断仍按已存receipt定点恢复",async()=>{
 const absent=await fixture(),pending=await fixture(),blocked=await fixture(),settled=await fixture();
 const rows=await blocked.calls(),external={...rows[1]!,id:randomUUID(),sequence:3,operationKey:"browser-other",inputDigest:"external"};
 await db.insert(executionCalls).values(external);
 for(const f of [absent,pending,blocked,settled])await db.update(executionTasks).set({status:"unknown_result"}).where(eq(executionTasks.id,f.task.id));
 const beforeAbsent=await absent.calls(),beforePending=await pending.calls(),wake=vi.fn(),ids:string[]=[];
 const recovery=createWorkbenchFileRecoveryService(db,{capabilities:nativeFileCapabilities,readReceipt:async q=>{
  if(![absent.callId,pending.callId,blocked.callId,settled.callId].includes(q.operationId))return {status:"absent"};
  if(q.operationId===absent.callId)return {status:"absent"};
  const r=committed(q);return q.operationId===pending.callId?{status:"prepared",receipt:{...r.receipt,state:"prepared",resultVersion:null}}:r;
 },afterReconciled:async taskId=>{ids.push(taskId);const report=await settled.tasks.recoverExpiredLeases({includeSafeUnknownResults:true,taskId});if(report.requeued)wake();}});
 // Simulate shutdown after durable original-call settlement, before its wake hook.
 const onlySettle=createWorkbenchFileRecoveryService(db,{capabilities:nativeFileCapabilities,readReceipt:async q=>committed(q)});
 await onlySettle.reconcile(settled.ctx,settled.task.id,settled.callId);
 const control={signal:new AbortController().signal,shouldStop:()=>false};
 for(let i=0;i<60&&(await settled.readTask()).status!=="queued";i++)await recovery.scan(control,1);
 expect((await settled.readTask()).status).toBe("queued");
 await recovery.reconcile(blocked.ctx,blocked.task.id,blocked.callId);
 expect((await blocked.readTask()).status).toBe("unknown_result");expect((await blocked.calls())[2]).toEqual(external);
 expect((await absent.readTask()).status).toBe("unknown_result");expect(await absent.calls()).toEqual(beforeAbsent);
 expect((await pending.readTask()).status).toBe("unknown_result");expect(await pending.calls()).toEqual(beforePending);
 expect(ids).not.toContain(absent.task.id);expect(ids).not.toContain(pending.task.id);expect(wake).toHaveBeenCalledOnce();
});

it.skipIf(process.platform!=="darwin"||!process.env.CREATOROS_TEST_FILE_JOURNAL_NATIVE)("真实Rust journal→正式装配→公共对账：pause撞已提交写，原call结算后resume不重复写",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"t1026-file-public-")),ready=join(dir,"ready"),done=join(dir,"done"),root=join(dir,"tasks");
 await mkdir(root);
 const chosen=process.env.CREATOROS_TEST_FILE_JOURNAL_NATIVE!;
 const depsDir=chosen.includes("/")?dirname(resolve(chosen)):resolve("src-tauri/target/debug/deps");
 const binaries=(await readdir(depsDir)).filter(name=>/^workbench-[a-f0-9]+$/.test(name));
 // The caller supplies the just-built Cargo test executable; never use an installed bridge.
 const binary=chosen.split("/").at(-1)!;
 expect(binaries).toContain(binary);
 const child=spawn(join(depsDir,binary),["ipc::tests::external_node_file_journal_fixture","--exact","--ignored","--nocapture"],{env:{...process.env,
  CREATOROS_FILES_E2E_NODE_PID:String(process.pid),CREATOROS_FILES_E2E_READY_FILE:ready,CREATOROS_FILES_E2E_DONE_FILE:done,CREATOROS_FILES_E2E_TASK_ROOT:root},stdio:["ignore","pipe","pipe"]});
 let log="";child.stdout.on("data",chunk=>log+=chunk);child.stderr.on("data",chunk=>log+=chunk);
 const exited=new Promise<number|null>((resolve,reject)=>{child.on("error",reject);child.on("exit",resolve);});
 const timer=setTimeout(()=>child.kill("SIGKILL"),60000);
 let cli:Awaited<ReturnType<typeof startLoopbackCliFixture>>|undefined;
 try{
  let socket="";
  await vi.waitFor(async()=>{expect(child.exitCode,log).toBeNull();socket=await readFile(ready,"utf8");expect(socket).toBeTruthy();},{timeout:10000,interval:25});
  const f=await fixture(socket),before=await f.calls(),task=await f.readTask();
  // Same factory and options as persistence-client; there is no mocked receipt port.
  const recoveredIds:string[]=[],wake=vi.fn();
  const recovery=createNativeFileRecoveryService(db,{platform:"darwin",desktop:true,socketPath:socket,afterReconciled:async(taskId,control)=>{
   if(control?.shouldStop())return;
   recoveredIds.push(taskId);
   const report=await f.tasks.recoverExpiredLeases({includeSafeUnknownResults:true,taskId});
   if(report.requeued&&!control?.shouldStop())wake();
  }});
  const publicApi=createWorkbenchPublicTransport({reconcileFile:recovery.reconcile} as Parameters<typeof createWorkbenchPublicTransport>[0]);
  shared.transport=publicApi;shared.ctx=f.ctx;
  shared.gateway=createCliInvocationService({db,masterKey:Buffer.alloc(32,7),now:()=>new Date().toISOString(),nextId:()=>randomUUID()});
  cli=await startLoopbackCliFixture({post:POST,accessToken:"isolated-file-reconcile"});
  const args=["call","workbench.files.reconcile","--input",JSON.stringify({params:{taskId:f.task.id},body:{operationId:f.callId}}),"--account",f.ctx.accountId];
  await expect(cli.run(args)).rejects.toThrow("--apply");expect(cli.requests()).toBe(0);
  const request=(key="original-key")=>cli!.run([...args,"--apply","--idempotency-key",key]) as Promise<{data:unknown}>;
  const result=await request();expect(result).toMatchObject({data:{status:"settled",verificationKind:"native_receipt",version:4,hash:`sha256:${hash("完整目标🙂")}`,size:Buffer.byteLength("完整目标🙂")}});
  expect(await f.readTask()).toEqual(task);expect(task.status).toBe("paused");
  const after=await f.calls();expect(after[0]).toEqual(before[0]);expect(after[1]).toMatchObject({id:f.callId,status:"settled",toolExecutionClaimId:before[1]!.toolExecutionClaimId,inputDigest:before[1]!.inputDigest});
  const receipt=JSON.parse(after[1]!.resultText!);
  expect(receipt.output.data.recoveryEvidence.originalSnapshot.status).toBe("unknown");
  expect(recoveredIds).toEqual([]);expect(wake).not.toHaveBeenCalled();
  // The production recovery coordinator starts the bounded lane; no public
  // reconciliation call or manual resume is used for this second original task.
  const automatic=await fixture(socket,"unknown_result"),autoBefore=await automatic.calls();
  const coordinator=createRecoveryWakeCoordinator({lanes:{workbench_files:control=>recovery.scan(control,50)},intervalMs:50});
  coordinator.start();
  try{await vi.waitFor(async()=>expect((await automatic.readTask()).status).toBe("queued"),{timeout:10000});}
  finally{await coordinator.stop();}
  expect(recoveredIds).toContain(automatic.task.id);expect(recoveredIds).not.toContain(f.task.id);expect(wake).toHaveBeenCalledOnce();
  const autoAfter=await automatic.calls();expect(autoAfter[0]).toEqual(autoBefore[0]);expect(autoAfter[1]).toMatchObject({id:automatic.callId,status:"settled",toolExecutionClaimId:autoBefore[1]!.toolExecutionClaimId});
  const autoLease=(await automatic.tasks.claimTask({taskId:automatic.task.id,workerId:"automatic-resume"}))!;
  expect(await automatic.ports.execute({executionTaskId:automatic.task.id,attempt:autoLease.lease.attempt,fenceToken:autoLease.lease.fenceToken},{callId:automatic.callId})).toEqual(JSON.parse(autoAfter[1]!.resultText!).output);
  expect(await automatic.calls()).toEqual(autoAfter);
  // 同一真实Rust fixture覆盖缺claim重新准入；reconcile本身不触及Native，resume后才按原CAS执行。
  for(const conflict of [false,true]){
   const pre=await fixture(socket,"paused",true),original=await pre.calls();
   shared.ctx=pre.ctx;
   const preArgs=["call","workbench.files.reconcile","--input",JSON.stringify({params:{taskId:pre.task.id},body:{operationId:pre.callId}}),"--account",pre.ctx.accountId,"--apply","--idempotency-key",`predispatch-${conflict}`];
   const initial=await cli.run(preArgs);
   expect(initial).toMatchObject({data:{status:"readmitted",verificationKind:"predispatch_readmission"}});
   const proof=(await pre.readTask()).payload;
   expect((await pre.readTask()).status).toBe("paused");expect(recoveredIds).not.toContain(pre.task.id);
   const prePath=join(root,"users",hash(pre.ctx.userId),"accounts",hash(pre.ctx.accountId),hash(pre.task.id),"报告.html");
   expect(await readFile(prePath,"utf8")).toBe("v3");
   await expect(pre.ports.settle(pre.ref,{callId:pre.callId,status:"unknown"})).rejects.toThrow();
   await pre.tasks.command(pre.ctx,{taskIds:[pre.task.id],command:"resume",idempotencyKey:"resume"});
   const lease=(await pre.tasks.claimTask({taskId:pre.task.id,workerId:"predispatch-resume"}))!.lease;
   const next={executionTaskId:pre.task.id,attempt:lease.attempt,fenceToken:lease.fenceToken};
   if(conflict)await pre.native.file(next,"concurrent-update",{kind:"write",path:"报告.html",expectedVersion:3,contentBase64:Buffer.from("其他真实写入").toString("base64")});
   const replay=await pre.ports.reserve(next,{modelCallId:original[0]!.id,toolCallId:"write"});expect(replay.callId).toBe(pre.callId);
   await pre.ports.start(next,{callId:pre.callId});
   const outcome=await pre.ports.execute(next,{callId:pre.callId});
   expect(outcome.sideEffect).toBe(conflict?"none":"committed");expect(outcome.status).toBe(conflict?"error":"ok");
   expect(await readFile(prePath,"utf8")).toBe(conflict?"其他真实写入":"完整目标🙂");
   const settled=await pre.calls();expect(settled[0]).toEqual(original[0]);expect(settled[1]).toMatchObject({id:pre.callId,operationKey:original[1]!.operationKey,inputDigest:original[1]!.inputDigest,status:"settled"});
   expect((await pre.readTask()).payload).toEqual(proof);
   await expect(pre.ports.settle(pre.ref,{callId:pre.callId,status:"unknown"})).rejects.toThrow();
   expect(await pre.calls()).toEqual(settled);
   const repeat=[...preArgs];repeat[8]=`predispatch-replay-${conflict}`;
   expect(await cli.run(repeat)).toMatchObject({data:(initial as {data:unknown}).data});
   expect((await pre.readTask()).payload).toEqual(proof);
  }
  shared.ctx=f.ctx;
  // Kill the isolated bridge before a repeat: idempotent public reconciliation
  // must return stored evidence even when Native is no longer reachable.
  await writeFile(done,"done");expect(await exited,log).toBe(0);
  expect((await request()).data).toEqual(result.data);expect(await f.calls()).toEqual(after);
  expect((await request("another-key")).data).toEqual(result.data);expect(await f.calls()).toEqual(after);
  const changed=[...args];changed[3]=JSON.stringify({params:{taskId:f.task.id},body:{operationId:"foreign-call"}});
  await expect(cli.run([...changed,"--apply","--idempotency-key","original-key"])).rejects.toThrow();
  expect(cli.requests()).toBe(8);
  await f.tasks.command(f.ctx,{taskIds:[f.task.id],command:"resume",idempotencyKey:randomUUID()});
  const resumed=(await f.tasks.claimTask({taskId:f.task.id,workerId:"resume"}))!;
  expect(await f.ports.execute({executionTaskId:f.task.id,attempt:resumed.lease.attempt,fenceToken:resumed.lease.fenceToken},{callId:f.callId})).toEqual(receipt.output);
  expect(await f.calls()).toEqual(after);
  const path=join(root,"users",hash(f.ctx.userId),"accounts",hash(f.ctx.accountId),hash(f.task.id),"报告.html");
  expect(await readFile(path,"utf8")).toBe("完整目标🙂");
 }finally{
  await cli?.close();
  await writeFile(done,"done").catch(()=>{});
  if(child.exitCode===null)child.kill("SIGKILL");
  await exited.catch(()=>{});clearTimeout(timer);await rm(dir,{recursive:true,force:true});
 }
},60000);

it("普通enqueue不能注入filePredispatchRecoveries审计，即便值为空",async()=>{
 const f=await fixture(undefined,"paused",true),task=await f.readTask();
 await expect(f.tasks.enqueue(f.ctx,{kind:"ai_task",ownerType:"ai_task",ownerId:task.ownerId,idempotencyKey:randomUUID(),payload:{...task.payload as object,filePredispatchRecoveries:{}}})).rejects.toThrow("宿主运行字段");
});

it.each(["audit-malformed","audit-conflict","other-unknown","other-reserved","progress","later-model","lease","frozen-platform","business"])("缺claim恢复拒绝%s且账本/审计不部分推进",async variant=>{
 const f=await fixture(undefined,"paused",true),task=await f.readTask(),calls=await f.calls();
 if(variant.startsWith("audit"))await db.update(executionTasks).set({payload:{...task.payload as object,filePredispatchRecoveries:variant==="audit-malformed"?[]:{[f.callId]:{schemaVersion:99}}}}).where(eq(executionTasks.id,f.task.id));
 else if(variant==="other-unknown"||variant==="other-reserved"||variant==="later-model")await db.insert(executionCalls).values({...calls[variant==="later-model"?0:1]!,id:randomUUID(),sequence:3,operationKey:randomUUID(),status:variant==="other-reserved"?"reserved":variant==="later-model"?"settled":"unknown"});
 else if(variant==="lease")await db.update(executionTasks).set({leaseOwner:"active",leaseExpiresAt:new Date(Date.now()+60000).toISOString()}).where(eq(executionTasks.id,f.task.id));
 else if(variant==="frozen-platform")await db.update(executionTasks).set({payload:{...task.payload as any,modelInput:{...(task.payload as any).modelInput,workbenchPlatform:"windows"}}}).where(eq(executionTasks.id,f.task.id));
 else if(variant==="business")await db.update(aiTasks).set({inputData:{modelInputDigest:"wrong"}}).where(eq(aiTasks.id,task.ownerId));
 else await db.insert(executionStreamEvents).values({executionTaskId:f.task.id,sequence:1,callId:f.callId,callIndex:0,chunk:{type:"data-workbench-progress",data:{operationId:f.callId}},createdAt:new Date().toISOString()});
 const before=await f.calls(),saved=await f.readTask(),reader=vi.fn();
 const service=createWorkbenchFileRecoveryService(db,{capabilities:nativeFileCapabilities,readReceipt:reader});
 await expect(service.reconcile(f.ctx,f.task.id,f.callId)).rejects.toThrow();
 expect(await f.calls()).toEqual(before);expect(await f.readTask()).toEqual(saved);expect(reader).not.toHaveBeenCalled();expect(f.write).not.toHaveBeenCalled();
});

it("真实host/ledger同参旧success存在时不得readmit或冒用旧operation回执",async()=>{
 const f=await fixture(undefined,"paused",true,true),before=await f.calls(),task=await f.readTask(),reader=vi.fn();
 expect(before).toHaveLength(3);expect(before[1]).toMatchObject({status:"settled",toolExecutionClaimId:expect.any(String)});expect(f.write).toHaveBeenCalledOnce();
 const service=createWorkbenchFileRecoveryService(db,{capabilities:nativeFileCapabilities,readReceipt:reader});
 await expect(service.reconcile(f.ctx,f.task.id,f.callId)).rejects.toThrow("PREDISPATCH");
 expect(await f.calls()).toEqual(before);expect(await f.readTask()).toEqual(task);expect(reader).not.toHaveBeenCalled();expect(f.write).toHaveBeenCalledOnce();
});

it("准入audit写失败或停止时原call重置同事务回滚，不留下半笔事实",async()=>{
 const f=await fixture(undefined,"paused",true),before=await f.calls(),task=await f.readTask();
 await db.execute(sql`CREATE FUNCTION t1026_reject_readmission() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.payload ? 'filePredispatchRecoveries' THEN RAISE EXCEPTION 'isolated audit write failure'; END IF; RETURN NEW; END $$`);
 await db.execute(sql`CREATE TRIGGER t1026_reject_readmission BEFORE UPDATE ON execution_tasks FOR EACH ROW EXECUTE FUNCTION t1026_reject_readmission()`);
 try{
  const service=createWorkbenchFileRecoveryService(db,{capabilities:nativeFileCapabilities,readReceipt:vi.fn()});
  await expect(service.reconcile(f.ctx,f.task.id,f.callId)).rejects.toThrow();
  expect(await f.calls()).toEqual(before);expect(await f.readTask()).toEqual(task);
 }finally{await db.execute(sql`DROP TRIGGER t1026_reject_readmission ON execution_tasks`);await db.execute(sql`DROP FUNCTION t1026_reject_readmission()`);}
 let checks=0;
 const stopped=createWorkbenchFileRecoveryService(db,{capabilities:nativeFileCapabilities,readReceipt:vi.fn(),shouldStop:()=>++checks>=3});
 await expect(stopped.reconcile(f.ctx,f.task.id,f.callId)).rejects.toThrow("FILE_RECOVERY_STOPPED");
 expect(checks).toBe(3);expect(await f.calls()).toEqual(before);expect(await f.readTask()).toEqual(task);
});

it("并发重新准入只append一次；幂等enqueue和后续payload更新保留audit；损坏audit拒绝覆盖",async()=>{
 const f=await fixture(undefined,"paused",true),task=await f.readTask(),before=await f.calls();
 const service=createWorkbenchFileRecoveryService(db,{capabilities:nativeFileCapabilities,readReceipt:vi.fn()});
 const [a,b]=await Promise.all([service.reconcile(f.ctx,f.task.id,f.callId),service.reconcile(f.ctx,f.task.id,f.callId)]);expect(a).toEqual(b);
 const saved=await f.readTask();expect(Object.keys((saved.payload as any).filePredispatchRecoveries)).toEqual([f.callId]);
 await expect(f.tasks.enqueue(f.ctx,{kind:"ai_task",ownerType:"ai_task",ownerId:task.ownerId,idempotencyKey:task.idempotencyKey,payload:task.payload as Record<string,unknown>})).resolves.toMatchObject({id:task.id});
 expect((saved.payload as any).filePredispatchRecoveries[f.callId].originalCall).toEqual(before[1]);
  await f.tasks.command(f.ctx,{taskIds:[f.task.id],command:"resume",idempotencyKey:"r"});
  expect((await f.readTask()).payload).toEqual(saved.payload);
  const lease=(await f.tasks.claimTask({taskId:f.task.id,workerId:"audit-preservation"}))!.lease;
  await createWorkbenchPlanService(db,{}).save({executionTaskId:f.task.id,attempt:lease.attempt,fenceToken:lease.fenceToken},{expectedRevision:0,steps:[{stepId:"pending",title:"继续原文件",status:"pending",dependsOn:[],operationRefs:[],artifactRefs:[]}]});
  expect((await f.readTask()).payload).toMatchObject({filePredispatchRecoveries:(saved.payload as any).filePredispatchRecoveries});
 const damaged=structuredClone(saved.payload) as any;damaged.filePredispatchRecoveries[f.callId].originalCall.operationKey="tampered";
 await db.update(executionTasks).set({payload:damaged}).where(eq(executionTasks.id,f.task.id));
 const damagedCalls=await f.calls();await expect(service.reconcile(f.ctx,f.task.id,f.callId)).rejects.toThrow("PREDISPATCH");
 expect(await f.calls()).toEqual(damagedCalls);expect((await f.readTask()).payload).toEqual(damaged);
});

it("只有严格null claim可准入；已有claim走原Native核对，后台source不能准入paused",async()=>{
 const f=await fixture(undefined,"paused",true),task=await f.readTask(),before=await f.calls();
 const read=vi.fn(async()=>({status:"absent"}));
 const service=createWorkbenchFileRecoveryService(db,{capabilities:nativeFileCapabilities,readReceipt:read});
 await expect(service.reconcile({...f.ctx,source:"ai"},f.task.id,f.callId)).rejects.toThrow("EXECUTION_CLAIM_MISSING");
 expect(await f.calls()).toEqual(before);expect(await f.readTask()).toEqual(task);expect(read).not.toHaveBeenCalled();
 await db.update(executionCalls).set({toolExecutionClaimId:""}).where(eq(executionCalls.id,f.callId));
 await expect(service.reconcile(f.ctx,f.task.id,f.callId)).rejects.toThrow("EXECUTION_CLAIM_MISSING");expect(read).not.toHaveBeenCalled();
 await db.update(executionCalls).set({toolExecutionClaimId:"non-null-claim"}).where(eq(executionCalls.id,f.callId));
 expect(await service.reconcile(f.ctx,f.task.id,f.callId)).toMatchObject({status:"unknown",verificationKind:null});
 expect(read).toHaveBeenCalledOnce();expect(await f.readTask()).toEqual(task);expect((await f.calls())[1]).toMatchObject({status:"unknown",toolExecutionClaimId:"non-null-claim"});
});


it("T1250 私有只读对账传原signal；预先取消零读取，在途取消账本与原task不变",async()=>{
 const f=await fixture(),before=await f.calls(),taskBefore=await f.readTask(),controller=new AbortController();
 let captured:AbortSignal|undefined,enter!:()=>void;const entered=new Promise<void>(resolve=>{enter=resolve;});
 const read=vi.fn(async(_query:FileReceiptQuery,signal?:AbortSignal)=>{
  captured=signal;enter();
  await new Promise<never>((_resolve,reject)=>{
   signal!.addEventListener("abort",()=>reject(signal!.reason),{once:true});
  });
 });
 const service=createWorkbenchFileRecoveryService(db,{capabilities:nativeFileCapabilities,readReceipt:read});
 const pending=service.reconcile(f.ctx,f.task.id,f.callId,{signal:controller.signal,shouldStop:()=>controller.signal.aborted});
 await entered;expect(captured).toBe(controller.signal);controller.abort(Error("owned readonly recovery cancelled"));
 await expect(pending).resolves.toMatchObject({taskId:f.task.id,operationId:f.callId,status:"unknown",verificationKind:null});
 expect(await f.calls()).toEqual(before);expect(await f.readTask()).toEqual(taskBefore);expect(f.write).toHaveBeenCalledTimes(1);
 const aborted=new AbortController();aborted.abort(Error("before readonly admission"));
 await expect(service.reconcile(f.ctx,f.task.id,f.callId,{signal:aborted.signal,shouldStop:()=>true})).rejects.toThrow("before readonly admission");
 expect(read).toHaveBeenCalledTimes(1);expect(await f.calls()).toEqual(before);expect(await f.readTask()).toEqual(taskBefore);
},1800000);


// T1252: 新出生有限预算；原60秒journal八HTTP用例保持原数据与body，不给旧任务续期。
it.skipIf(process.platform!=="darwin"||!process.env.CREATOROS_TEST_FILE_JOURNAL_NATIVE)("T1252 新出生原ID公共Rust对账在owned队列310秒后仍回原证据，不重复写或续期",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"t1252-native-born-public-")),ready=join(dir,"ready"),done=join(dir,"done"),root=join(dir,"tasks");await mkdir(root);
 const binary=resolve(process.env.CREATOROS_TEST_FILE_JOURNAL_NATIVE!);
 // 实际main-lock b88二进制/原ignore filter由私有工具SHA、实际list和本轮父归属守门；不运行cargo或App。
 const child=spawn(binary,["ipc::tests::external_node_file_journal_fixture","--exact","--ignored","--nocapture"],{env:{...process.env,
  CREATOROS_FILES_E2E_NODE_PID:String(process.pid),CREATOROS_FILES_E2E_READY_FILE:ready,CREATOROS_FILES_E2E_DONE_FILE:done,CREATOROS_FILES_E2E_TASK_ROOT:root},stdio:["ignore","pipe","pipe"]});
 let log="";child.stdout.on("data",chunk=>log+=chunk);child.stderr.on("data",chunk=>log+=chunk);
 const exited=new Promise<number|null>((resolve,reject)=>{child.once("error",reject);child.once("close",resolve);});
 const observeExit=async()=>{let timer:ReturnType<typeof setTimeout>|undefined;try{return await Promise.race([exited,new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>reject(Error("OWNED_NATIVE_FINITE_CLOSE_UNKNOWN")),120000);})]);}finally{clearTimeout(timer);}};
 let cli:Awaited<ReturnType<typeof startLoopbackCliFixture>>|undefined,queueTimer:ReturnType<typeof setTimeout>|undefined,bodyFailed=false;
 try{
  let socket="";await vi.waitFor(async()=>{expect(child.exitCode,log).toBeNull();socket=await readFile(ready,"utf8");expect(socket).toBeTruthy();},{timeout:120000,interval:25});
  const finiteBornBudget={maxCalls:20,maxTokens:100000,deadlineMs:36000000};
  const f=await fixture(socket,"paused",false,false,finiteBornBudget),before=await f.calls(),taskBefore=await f.readTask();
  expect(f.initialBirth).toMatchObject({executionBudget:finiteBornBudget,deadlineAt:expect.any(String)});
  const originalDeadline=f.initialBirth!.deadlineAt!;
  expect(Date.parse(originalDeadline)-Date.parse(f.initialBirth!.createdAt)).toBe(finiteBornBudget.deadlineMs);
  expect(taskBefore).toMatchObject({id:f.task.id,status:"paused",deadlineAt:originalDeadline,executionBudget:finiteBornBudget});
  expect(before).toHaveLength(2);expect(before[1]).toMatchObject({id:f.callId,status:"unknown",totalTokens:null,resultText:null,toolExecutionClaimId:expect.any(String)});
  const recovery=createNativeFileRecoveryService(db,{platform:"darwin",desktop:true,socketPath:socket});
  shared.transport=createWorkbenchPublicTransport({reconcileFile:recovery.reconcile} as Parameters<typeof createWorkbenchPublicTransport>[0]);shared.ctx=f.ctx;
  shared.gateway=createCliInvocationService({db,masterKey:Buffer.alloc(32,7),now:()=>new Date().toISOString(),nextId:()=>randomUUID()});
  let queues=0;const queueEvents:Array<{taskId:string;callId:string;requestId:string;deadlineAt:string;startedMs:number;endedMs:number}> = [];
  const key=`slow-original-${randomUUID()}`;
  cli=await startLoopbackCliFixture({accessToken:"owned-slow-native",post:async request=>{
   if(queues++===0){
    expect(request.headers.get("x-account-id")).toBe(f.ctx.accountId);expect(request.headers.get("x-idempotency-key")).toBe(key);
    expect(await request.clone().json()).toEqual({id:"workbench.files.reconcile",input:{params:{taskId:f.task.id},body:{operationId:f.callId}}});
    expect(await f.readTask()).toEqual(taskBefore);expect(await f.calls()).toEqual(before);
    const startedMs=performance.now();await new Promise<void>(resolve=>{queueTimer=setTimeout(resolve,310000);});
    // 只有自然队列结束才交原POST；没有提前写业务成功、改DB deadline或假Native回执。
    expect(await f.readTask()).toEqual(taskBefore);expect(await f.calls()).toEqual(before);
    queueEvents.push({taskId:f.task.id,callId:f.callId,requestId:key,deadlineAt:originalDeadline,startedMs,endedMs:performance.now()});
   }
   return POST(request);
  }});
  const args=["call","workbench.files.reconcile","--input",JSON.stringify({params:{taskId:f.task.id},body:{operationId:f.callId}}),"--account",f.ctx.accountId,"--apply","--idempotency-key",key];
  const started=performance.now(),result=await cli.run(args) as {data:unknown};
  expect(performance.now()-started).toBeGreaterThan(300000);expect(queueEvents).toHaveLength(1);expect(queueEvents[0]!.endedMs-queueEvents[0]!.startedMs).toBeGreaterThanOrEqual(310000);
  expect(result).toMatchObject({data:{taskId:f.task.id,operationId:f.callId,status:"settled",verificationKind:"native_receipt",version:4,hash:`sha256:${hash("完整目标🙂")}`,size:Buffer.byteLength("完整目标🙂")}});
  expect(await f.readTask()).toEqual(taskBefore);const after=await f.calls();expect(after).toHaveLength(2);expect(after[0]).toEqual(before[0]);
  expect(after[1]).toMatchObject({id:f.callId,status:"settled",operationKey:before[1]!.operationKey,inputDigest:before[1]!.inputDigest,toolExecutionClaimId:before[1]!.toolExecutionClaimId,totalTokens:0});
  const receipt=JSON.parse(after[1]!.resultText!);expect(receipt.output.data.recoveryEvidence.originalSnapshot).toMatchObject({status:"unknown",resultText:null,toolExecutionClaimId:before[1]!.toolExecutionClaimId});
  expect(await cli.run(args)).toEqual(result);expect(await f.calls()).toEqual(after);
  const foreign=[...args];foreign[5]="foreign-native-slow-account";foreign[8]=`foreign-${key}`;await expect(cli.run(foreign)).rejects.toMatchObject({status:404});
  expect(cli.requests()).toBe(3);expect(queues).toBe(3);expect(await f.calls()).toEqual(after);expect((await f.readTask()).deadlineAt).toBe(originalDeadline);
  await writeFile(done,"done");expect(await observeExit(),log).toBe(0);
  await f.tasks.command(f.ctx,{taskIds:[f.task.id],command:"resume",idempotencyKey:`resume-${key}`});
  const resumed=(await f.tasks.claimTask({taskId:f.task.id,workerId:"slow-native-owned-resume"}))!;
  expect(await f.ports.execute({executionTaskId:f.task.id,attempt:resumed.lease.attempt,fenceToken:resumed.lease.fenceToken},{callId:f.callId})).toEqual(receipt.output);
  expect(await f.calls()).toEqual(after);expect((await f.readTask()).deadlineAt).toBe(originalDeadline);
  const file=join(root,"users",hash(f.ctx.userId),"accounts",hash(f.ctx.accountId),hash(f.task.id),"报告.html");expect(await readFile(file,"utf8")).toBe("完整目标🙂");
 }catch(error){bodyFailed=true;throw error;}finally{
  clearTimeout(queueTimer);const cleanupErrors:unknown[]=[];
  // 两个自有清理独立开始；HTTP close失败也必须发done并有限观察原Rust，不覆盖原body异常。
  const cleanup=await Promise.allSettled([cli?.close()??Promise.resolve(),writeFile(done,"done")]);
  for(const result of cleanup)if(result.status==="rejected")cleanupErrors.push(result.reason);
  let nativeClosed=false;
  try{expect(await observeExit(),log).toBe(0);nativeClosed=true;}catch(error){cleanupErrors.push(error);if(child.exitCode===null){child.unref();child.stdout.destroy();child.stderr.destroy();}}
  if(nativeClosed)try{await rm(dir,{recursive:true,force:true});}catch(error){cleanupErrors.push(error);}
  // 未确认归属保原目录/UNKNOWN，不signal未知PID；原body错误照抛，另留脱敏cleanup诊断。
  if(cleanupErrors.length){console.error(JSON.stringify({scope:"T1252-owned-native-cleanup",unconfirmed:true,errors:cleanupErrors.map(error=>error instanceof Error?error.name:"UnknownError")}));if(!bodyFailed)throw Error("OWNED_NATIVE_PUBLIC_CLEANUP_UNCONFIRMED");}
 }
},36000000);


it('T1252 原注册版本真实CLI公共render三合法Chromium阶段累计超过300秒，PNG/PDF仍同sourceHash有效字节',async()=>{
 const {createPersistentTaskService,createWorkbenchArtifactReadService,createWorkbenchPublicService,createWorkbenchPublicStreamService}=await import('@creatoros/backend/modules/execution');
 const {createWorkbenchArtifactHost}=await import('./workbench-artifact-host'),{createWorkbenchArtifactRepresentation}=await import('./workbench-artifact-representation');
 const {chromium}=await import('@playwright/test'),{PNG}=await import('pngjs'),{PDFParse}=await import('pdf-parse');
 const nonce=randomUUID(),owner={userId:`public-render-${nonce}`,accountId:`public-render-account-${nonce}`,requestId:nonce,source:'user' as const};
 const bornBudget={maxCalls:20,maxTokens:100000,deadlineMs:36000000},tasks=createPersistentTaskService(db);
 const task=await tasks.enqueue(owner,{kind:'ai_task',ownerType:'ai_task',ownerId:nonce,idempotencyKey:nonce,executionBudget:bornBudget,payload:{}});
 const readOriginalTask=async()=>(await db.select().from(executionTasks).where(eq(executionTasks.id,task.id)))[0]!;
 const born=await readOriginalTask();expect(born.deadlineAt).toBeTruthy();const originalDeadline=born.deadlineAt!;expect(Date.parse(originalDeadline)-Date.parse(born.createdAt)).toBe(bornBudget.deadlineMs);
 const claim=(await tasks.claimTask({taskId:task.id,workerId:`render-owner-${nonce}`}))!;expect((await readOriginalTask()).deadlineAt).toBe(originalDeadline);
 const bytes=Buffer.from('<style>body{margin:0;background:#df2828}</style><h1>Owned slow public original report</h1>'),objects=new Map<string,Uint8Array>(),digest=(v:Uint8Array)=>createHash('sha256').update(v).digest('hex');
 // 与原T1250公共35s用例相同的controlled file source/blobs；实际注册/版本事务与Chromium均真实，非模型生成。
 const blobs={submit:async(_ctx:unknown,input:{operationId:string;bytes:Uint8Array})=>{const hash=digest(input.bytes);objects.set(`${input.operationId}:${hash}`,new Uint8Array(input.bytes));return {hash,size:input.bytes.byteLength};},read:async(_ctx:unknown,input:{operationId:string;hash:string})=>{const value=objects.get(`${input.operationId}:${input.hash}`);if(!value)throw Error('MISSING_OWNED_BLOB');return new Uint8Array(value);}};
 const host=createWorkbenchArtifactHost(db,{platform:'darwin',desktop:true,socketPath:'private-controlled-file-source.sock',blobs,filePort:async(_ref,_operationId,action)=>{if(action.kind==='stat')return {isDirectory:false,size:bytes.length,version:1};if(action.kind==='read')return {contentBase64:bytes.subarray(action.offset,action.offset+action.limit).toString('base64'),total:bytes.length,version:1};throw Error('UNEXPECTED_FILE_ACTION');}})!;
 const registered=await host.dispatch({context:{userId:owner.userId,accountId:owner.accountId,taskId:task.id,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken,leaseId:`render-owner-${nonce}`,operationId:nonce},invocation:{name:'artifact.register',schemaVersion:1,input:{path:'owned/report.html',mime:'text/html'}}},{signal:new AbortController().signal,onProgress:()=>{}});
 expect(registered.status).toBe('succeeded');if(registered.status!=='succeeded')throw Error(JSON.stringify(registered));const metadata=JSON.parse(registered.content.find(part=>part.type==='text')!.text) as {artifactId:string;version:number;hash:string};expect(metadata).toMatchObject({version:1,hash:digest(bytes)});
 const artifacts=createWorkbenchArtifactReadService(db,{blobs});shared.transport=createWorkbenchPublicTransport({tasks:createWorkbenchPublicService(db),stream:createWorkbenchPublicStreamService(db),artifacts,capabilities:()=>({}),render:(ctx,taskId,artifactId,version,format)=>createWorkbenchArtifactRepresentation(artifacts,ctx,taskId,artifactId,version,format),reconcile:async()=>{throw Error('NO_FILE_RECONCILE_IN_RENDER_CASE');}});shared.ctx=owner;
 shared.gateway=createCliInvocationService({db,masterKey:Buffer.alloc(32,7),now:()=>new Date().toISOString(),nextId:()=>randomUUID()});
 const stages:Array<{kind:string;elapsedMs:number}>=[],timers=new Set<ReturnType<typeof setTimeout>>();
 const stage=async<T,>(kind:string,work:()=>Promise<T>):Promise<T>=>{const start=performance.now();let timer:ReturnType<typeof setTimeout>|undefined;try{const delay=new Promise<void>(resolve=>{timer=setTimeout(resolve,110000);timers.add(timer);});const [value]=await Promise.all([work(),delay]);stages.push({kind,elapsedMs:performance.now()-start});return value;}finally{if(timer){clearTimeout(timer);timers.delete(timer);}}};
 // 原真实SDK立即开始，与固定110s延迟并行；每stage仍在原120s独立phase内，不把120sSDK与110s串行相加。
 const launch=chromium.launch.bind(chromium),spy=vi.spyOn(chromium,'launch').mockImplementation(async options=>{const browser=await stage('launch',()=>launch(options)),newContext=browser.newContext.bind(browser);vi.spyOn(browser,'newContext').mockImplementation(async options=>{const context=await stage('context',()=>newContext(options)),newPage=context.newPage.bind(context);vi.spyOn(context,'newPage').mockImplementation(()=>stage('page',()=>newPage()));return context;});return browser;});
 const cli=await startLoopbackCliFixture({post:POST,accessToken:'owned-slow-render'});
 try{
  for(const format of ['png','pdf'] as const){
   const input={params:{taskId:task.id,artifactId:metadata.artifactId,version:1},query:{format}},started=performance.now(),envelope=await cli.run(['call','workbench.artifacts.render','--input',JSON.stringify(input),'--account',owner.accountId]) as {data:unknown};
   const result=ENDPOINTS.renderWorkbenchArtifact.response.parse(envelope.data),output=Buffer.from(result.data,'base64');
   expect(performance.now()-started).toBeGreaterThan(300000);expect(result).toMatchObject({sourceHash:metadata.hash,metadata:{artifactId:metadata.artifactId,version:1,hash:metadata.hash},size:output.length,hash:digest(output),mime:format==='png'?'image/png':'application/pdf'});
   if(format==='png'){const png=PNG.sync.read(output);expect([...png.data.subarray(0,4)]).toEqual([223,40,40,255]);}else{const parser=new PDFParse({data:output});try{expect((await parser.getText()).text).toContain('Owned slow public original report');}finally{await parser.destroy();}}
   expect((await readOriginalTask()).deadlineAt).toBe(originalDeadline);
  }
  expect(stages.map(s=>s.kind)).toEqual(['launch','context','page','launch','context','page']);for(const observed of stages)expect(observed.elapsedMs).toBeGreaterThanOrEqual(110000);
  expect((await artifacts.readAll(owner,task.id,metadata.artifactId,1)).bytes).toEqual(new Uint8Array(bytes));
  const args=['call','workbench.artifacts.render','--input',JSON.stringify({params:{taskId:task.id,artifactId:metadata.artifactId,version:1},query:{format:'png'}}),'--account',owner.accountId];
  const foreign=[...args];foreign[5]='foreign-owned-render-account';await expect(cli.run(foreign)).rejects.toMatchObject({status:404});
  const wrongVersion=[...args];wrongVersion[3]=JSON.stringify({params:{taskId:task.id,artifactId:metadata.artifactId,version:2},query:{format:'png'}});await expect(cli.run(wrongVersion)).rejects.toThrow();
  expect(cli.requests()).toBe(4);expect(spy).toHaveBeenCalledTimes(2);expect((await readOriginalTask()).deadlineAt).toBe(originalDeadline);
 }finally{spy.mockRestore();for(const timer of timers)clearTimeout(timer);await cli.close();}
},42000000);
