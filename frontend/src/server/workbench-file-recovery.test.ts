// @vitest-environment node
import {randomUUID,createHash} from "node:crypto";
import {spawn} from "node:child_process";
import {mkdtemp,readFile,writeFile,rm,readdir,mkdir} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {afterAll,beforeAll,expect,it,vi} from "vitest";
import {createDb,createCliInvocationService,aiTasks,executionCalls,executionTasks,eq,asc,type Db} from "@creatoros/backend";
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
async function fixture(socketPath?:string,stopMode:"paused"|"unknown_result"="paused",pauseBeforeClaim=false){
 const id=randomUUID(),ctx={userId:id,accountId:id,requestId:id,source:"user" as const};
 const cap=nativeFileCapabilities.find(c=>c.name==="files.edit")!;
 const setup=await prepareChatToolDefinitions({"files.edit":defineWorkbenchChatTool(cap,async()=>{throw Error("unused");})},{workbenchCapabilities:[cap]});
 const input=chatWorkerInputSchema.parse({kind:"chat.run",executionEngine:"pi",operationKey:id,capability:"copilot.assist",userId:id,accountId:id,conversationId:id,sourceMessageId:id,
  system:"修复文件",messages:[{role:"user",content:"修复报告"}],maxSteps:8,maxOutputTokens:128,tools:setup.definitions,workbenchCapabilities:[cap],workbenchPlatform:"macos"});
 const tasks=createPersistentTaskService(db),task=await tasks.enqueue(ctx,{kind:"ai_task",ownerType:"ai_task",ownerId:id,idempotencyKey:id,payload:{aiTaskId:id,modelInput:input}});
 await db.insert(aiTasks).values({id,userId:id,accountId:id,taskType:"copilot.assist",status:"running",executionTaskId:task.id,idempotencyKey:id,requestedAt:new Date().toISOString(),inputData:{modelInputDigest:chatInputDigest(input)}});
 const claim=(await tasks.claimTask({taskId:task.id,workerId:id}))!,ref={executionTaskId:task.id,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
 const ledger=createExecutionCallLedgerService(db,{budget}),model=await ledger.reserve(ref,{kind:"model",operationKey:"model",inputDigest:"sha256:"+"a".repeat(64),reservedTokens:10});
 await ledger.start(ref,model.id);
 await ledger.settle(ref,model.id,{status:"settled",usage:{totalTokens:5},providerResult:{content:[{type:"tool-call",toolCallId:"write",toolName:"files_edit",input:JSON.stringify({path:"报告.html",content:"完整目标🙂",expectedVersion:3})}],finishReason:{unified:"tool-calls"},usage:{inputTokens:{total:3},outputTokens:{total:2}},warnings:[]}});
 const write=vi.fn(async()=>{throw Error("reply lost after Native write");});
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
   if(++checks===2){
    if(stopMode==="unknown_result")throw new NativeFileError("NATIVE_RESULT_UNKNOWN",true);
    await tasks.command(ctx,{taskIds:[task.id],command:"pause",idempotencyKey:randomUUID()});
   }
   return nativeLease.withLease(ref,mode,action);
  }},nativeOptions);
  const host=createNativeFilesWorkbenchHost(db,{...nativeOptions,filePort:interrupted.file})!;
  const resolveTools=createChatWorkbenchCapabilityHost(host,r=>leases.withLease(r,"admission",async({task,context})=>({userId:context.userId,accountId:context.accountId!,taskId:task.id,attempt:task.attempt,fenceToken:task.fenceToken!,leaseId:task.leaseOwner!})),async()=>{});
  tools=await resolveTools(ctx,input,ref,new AbortController().signal);
 }
 const ports=createExecutionChatToolPorts(db,{budget,tools});
 const call=await ports.reserve(ref,{modelCallId:model.id,toolCallId:"write"});await ports.start(ref,{callId:call.callId});
 if(pauseBeforeClaim)await tasks.command(ctx,{taskIds:[task.id],command:"pause",idempotencyKey:randomUUID()});
 await expect(ports.execute(ref,{callId:call.callId})).rejects.toThrow();
 if(pauseBeforeClaim){
  expect(write).not.toHaveBeenCalled();
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
 expect((await calls())[1]).toMatchObject({status:"unknown",toolExecutionClaimId:pauseBeforeClaim?null:expect.any(String)});
 return {ctx,task,ref,calls,readTask,callId:call.callId,write,ports,tasks,native};
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
 }
 const before=await f.calls(),task=await f.readTask(),read=vi.fn(async(q:FileReceiptQuery)=>committed(q));
 const service=createWorkbenchFileRecoveryService(db,{capabilities:nativeFileCapabilities,readReceipt:read});
 const api=createWorkbenchPublicTransport({reconcileFile:service.reconcile} as Parameters<typeof createWorkbenchPublicTransport>[0]);
 await expect(api.request(ENDPOINTS.reconcileWorkbenchFile,{params:{taskId:f.task.id},query:undefined,body:{operationId:f.callId}},f.ctx))
  .rejects.toMatchObject({code:"ConflictError",message:`文件恢复身份或调用证据不匹配 [${reason}]`});
 expect(read).not.toHaveBeenCalled();expect(await f.calls()).toEqual(before);expect(await f.readTask()).toEqual(task);
});

it("真实start→pause→未领claim的execute被拒→Worker结算unknown：HTTP409不代表已派发Native",async()=>{
 const f=await fixture(undefined,"paused",true),before=await f.calls(),task=await f.readTask(),read=vi.fn(async(q:FileReceiptQuery)=>committed(q));
 expect(before[1]).toMatchObject({status:"unknown",startedAttempt:f.ref.attempt,toolExecutionClaimId:null,parentCallId:null,reservedTokens:0,accountingBasis:"tokens"});
 const recovery=createWorkbenchFileRecoveryService(db,{capabilities:nativeFileCapabilities,readReceipt:read});
 shared.ctx=f.ctx;shared.transport=createWorkbenchPublicTransport({reconcileFile:recovery.reconcile} as Parameters<typeof createWorkbenchPublicTransport>[0]);
 shared.gateway=createCliInvocationService({db,masterKey:Buffer.alloc(32,7),now:()=>new Date().toISOString(),nextId:()=>randomUUID()});
 const cli=await startLoopbackCliFixture({post:POST,accessToken:"isolated-diagnostic"});
 const args=["call","workbench.files.reconcile","--input",JSON.stringify({params:{taskId:f.task.id},body:{operationId:f.callId}}),"--account",f.ctx.accountId,"--apply","--idempotency-key","identity-reason"];
 try{
  await expect(cli.run(args)).rejects.toMatchObject({status:409,message:expect.stringContaining("[EXECUTION_CLAIM_MISSING]")});
  const foreign=[...args];foreign[5]="another-account";foreign[8]="foreign-key";
  await expect(cli.run(foreign)).rejects.toMatchObject({status:404,message:expect.not.stringContaining("EXECUTION_CLAIM_MISSING")});
 }finally{await cli.close();}
 expect(read).not.toHaveBeenCalled();expect(f.write).not.toHaveBeenCalled();expect(await f.calls()).toEqual(before);expect(await f.readTask()).toEqual(task);
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
 const depsDir=resolve("src-tauri/target/debug/deps");
 const binaries=(await readdir(depsDir)).filter(name=>/^workbench-[a-f0-9]+$/.test(name));
 // The caller supplies the just-built Cargo test executable; never use an installed bridge.
 const binary=process.env.CREATOROS_TEST_FILE_JOURNAL_NATIVE!;
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
  // Kill the isolated bridge before a repeat: idempotent public reconciliation
  // must return stored evidence even when Native is no longer reachable.
  await writeFile(done,"done");expect(await exited,log).toBe(0);
  expect((await request()).data).toEqual(result.data);expect(await f.calls()).toEqual(after);
  expect((await request("another-key")).data).toEqual(result.data);expect(await f.calls()).toEqual(after);
  const changed=[...args];changed[3]=JSON.stringify({params:{taskId:f.task.id},body:{operationId:"foreign-call"}});
  await expect(cli.run([...changed,"--apply","--idempotency-key","original-key"])).rejects.toThrow();
  expect(cli.requests()).toBe(4);
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
