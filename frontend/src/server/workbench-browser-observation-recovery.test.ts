// @vitest-environment node
import {randomUUID} from "node:crypto";
import {createServer} from "node:net";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {afterAll,beforeAll,expect,it,vi} from "vitest";
import {createDb,aiTasks,executionTasks,executionCalls,eq,asc,type Db} from "@creatoros/backend";
import {createPersistentTaskService,createExecutionLeaseService,createExecutionCallLedgerService} from "@creatoros/backend/modules/execution";
import {createExecutionChatToolPorts} from "../../../backend/src/modules/execution/execution-chat-tool-ports.service";
import {createChatWorkbenchCapabilityHost} from "../../../backend/src/modules/ai-runtime/chat-workbench-capability-host";
import {prepareChatToolDefinitions} from "../../../backend/src/modules/ai-runtime/chat-tool-definitions";
import {defineWorkbenchChatTool} from "../../../backend/src/modules/ai-runtime/chat-tool-gate";
import {chatInputDigest} from "../../../backend/src/modules/ai/chat-turn-submission.service";
import {chatWorkerInputSchema,workbenchToolOutcome,type AgenticToolOutcome} from "@creatoros/contract/execution-worker";
import type {WorkbenchResult} from "@creatoros/contract/agent-workbench";
import {createWorkbenchBrowserHost} from "./workbench-browser-host";

let db:Db,close:()=>Promise<void>;
beforeAll(async()=>{const f=await createDb();db=f.db;close=()=>f.client.close();});
afterAll(async()=>close());
const budget={maxCalls:100,maxTokens:100000,deadlineMs:60000};
const catalog=createWorkbenchBrowserHost({} as Db,{platform:"darwin",desktop:true,socketPath:"/isolated-unused.sock",media:{submit:async()=>"unused"}})!.catalog;
type Mode="failure"|"unknown"|"throw"|"oversized"|"invalid"|"success";
async function fixture(name="browser.observe",legacy=false,nativeHost?:NonNullable<ReturnType<typeof createWorkbenchBrowserHost>>,allBrowser=false){
 const id=randomUUID(),ctx={userId:id,accountId:id,requestId:id,source:"user" as const};
 const descriptor=catalog.find(c=>c.name===name)!;
 const capabilities=allBrowser?catalog:[descriptor];
 const setup=await prepareChatToolDefinitions(Object.fromEntries(capabilities.map(cap=>[cap.name,defineWorkbenchChatTool(cap,async()=>{throw Error("unused");})])),{workbenchCapabilities:capabilities});
 const input=chatWorkerInputSchema.parse({kind:"chat.run",executionEngine:"pi",operationKey:id,capability:"copilot.assist",userId:id,accountId:id,conversationId:id,sourceMessageId:id,
  system:"读取页面",messages:[{role:"user",content:"读取页面"}],maxSteps:12,maxOutputTokens:128,tools:setup.definitions,workbenchCapabilities:capabilities,workbenchPlatform:"macos"});
 const tasks=createPersistentTaskService(db),task=await tasks.enqueue(ctx,{kind:"ai_task",ownerType:"ai_task",ownerId:id,idempotencyKey:id,payload:{aiTaskId:id,modelInput:input}});
 await db.insert(aiTasks).values({id,userId:id,accountId:id,taskType:"copilot.assist",status:"running",executionTaskId:task.id,idempotencyKey:id,requestedAt:new Date().toISOString(),inputData:{modelInputDigest:chatInputDigest(input)}});
 const claim=(await tasks.claimTask({taskId:task.id,workerId:id}))!,ref={executionTaskId:task.id,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
 let mode:Mode="failure";
 const dispatch=vi.fn(async(call:{context:{operationId:string}}):Promise<WorkbenchResult>=>{
  if(mode==="throw")throw Error("secret provider exception must not escape");
  const base={operationId:call.context.operationId,artifactRefs:[],progressCursor:null};
  if(mode==="invalid")return {...base,operationId:"wrong",status:"succeeded",content:[]};
  if(mode==="oversized"||mode==="success")return {...base,status:"succeeded",content:[{type:"text",text:mode==="oversized"?"x".repeat(1_000_001):"fresh page"}]};
  return {...base,status:mode==="unknown"?"unknown":"failed",error:{code:"browser_driver_failed",dispatched:true,retryable:false,nextAction:"reconcile"}};
 });
 const leases=createExecutionLeaseService(db),resolve=createChatWorkbenchCapabilityHost(nativeHost??{catalog:capabilities,platform:"macos",capabilities:["task.browser"],dispatch},
  r=>leases.withLease(r,"admission",async({task,context})=>({userId:context.userId,accountId:context.accountId!,taskId:task.id,attempt:task.attempt,fenceToken:task.fenceToken!,leaseId:task.leaseOwner!})),async()=>{});
 const tools=await resolve(ctx,input,ref,new AbortController().signal);
 if(legacy)tools[name]!.execute=async()=>{throw Error("legacy observation receipt lost");};
 const ports=createExecutionChatToolPorts(db,{budget,tools}),ledger=createExecutionCallLedgerService(db,{budget});
 const params=name==="browser.open"?{laneId:"lane",mode:"anonymous",domain:"example.com"}:name==="browser.status"?{laneId:"lane"}:name==="browser.navigate"?{laneId:"lane",browserEpoch:1,url:"https://example.com"}:name==="browser.act"?{laneId:"lane",browserEpoch:1,action:"click",input:{ref:"r1"}}:{laneId:"lane",browserEpoch:1};
 async function reserveBatch(toolName:string,supplied:Record<string,unknown>,count:number){
  const model=await ledger.reserve(ref,{kind:"model",operationKey:randomUUID(),inputDigest:"sha256:"+"a".repeat(64),reservedTokens:10});await ledger.start(ref,model.id);
  const ids=Array.from({length:count},()=>randomUUID());
  await ledger.settle(ref,model.id,{status:"settled",usage:{totalTokens:5},providerResult:{content:ids.map(toolCallId=>({type:"tool-call",toolCallId,toolName:toolName.replaceAll(".","_"),input:JSON.stringify(supplied)})),finishReason:{unified:"tool-calls"},usage:{inputTokens:{total:3},outputTokens:{total:2}},warnings:[]}});
  const reserved=[];
  for(const toolCallId of ids){const call=await ports.reserve(ref,{modelCallId:model.id,toolCallId});await ports.start(ref,{callId:call.callId});reserved.push({callId:call.callId,toolCallId});}
  return reserved;
 }
 async function reserve(toolName=name,supplied:Record<string,unknown>=params){return (await reserveBatch(toolName,supplied,1))[0]!.callId;}
 const calls=()=>db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,task.id)).orderBy(asc(executionCalls.sequence));
 const readTask=async()=>(await db.select().from(executionTasks).where(eq(executionTasks.id,task.id)))[0]!;
 return {ctx,task,ref,descriptor,ports,tasks,reserve,reserveBatch,ledger,calls,readTask,dispatch,setMode:(m:Mode)=>{mode=m;}};
}

it.each(["browser.observe","browser.extract","browser.status","browser.screenshot"])("%s已派发观察失败保持事实，原call回放错误，新call真正重新观察",async name=>{
 const f=await fixture(name),id=await f.reserve();
 const result=await f.ports.execute(f.ref,{callId:id});
 expect(result).toMatchObject({status:"error",sideEffect:"none",error:{code:"transient"},data:{workbench:{status:"failed",error:{dispatched:true,nextAction:"reconcile"}}}});
 expect(JSON.stringify(result)).not.toContain("confirmedNoCommit");
 expect((await f.calls()).at(-1)).toMatchObject({id,status:"settled",totalTokens:0});
 expect(await f.ports.execute(f.ref,{callId:id})).toEqual(result);expect(f.dispatch).toHaveBeenCalledTimes(1);
 f.setMode("success");const next=await f.reserve();expect(await f.ports.execute(f.ref,{callId:next})).toMatchObject({status:"ok",summary:"fresh page"});
 expect(f.dispatch).toHaveBeenCalledTimes(2);
});

it("真实browser host/ledger：新scroll各派发，同call仅回放；close后同名新open取得新lane，未知act不重复",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"t1026-browser-operations-")),path=join(dir,"browser.sock"),profileKey=randomUUID().replaceAll("-","").repeat(2);
 let opens=0,scrolls=0,closes=0,alive=false,unknown=false;
 const server=createServer(socket=>{let buffer="";socket.on("data",chunk=>{
  buffer+=chunk.toString();if(!buffer.includes("\n"))return;const request=JSON.parse(buffer.split("\n")[0]!),action=request.action;
  let value:unknown;
  if(action.kind==="profile_location")value={profileKey,managedProfileRoot:"/isolated/browser",identityMode:"anonymous",legacyIdentityImported:false,primaryLoginState:"unverified"};
  else if(action.kind==="open"){alive=true;value={lane:{lane_id:`lane-${++opens}`,browser_epoch:1}};}
  else if(action.kind==="close"){closes++;alive=false;value={closed:true};}
  else if(action.kind==="stop_proof")value={profileStopped:!alive,profileKey,profileLeaseId:request.admission.profileLeaseId};
  else {scrolls++;if(unknown){socket.end(JSON.stringify({ok:false,operationId:request.operationId,code:"BROWSER_RESULT_UNKNOWN"})+"\n");return;}value={scrolls};}
  socket.end(JSON.stringify({ok:true,operationId:request.operationId,value})+"\n");
 });});
 await new Promise<void>(resolve=>server.listen(path,resolve));
 const host=createWorkbenchBrowserHost(db,{platform:"darwin",desktop:true,socketPath:path,media:{submit:async()=>"unused"}})!;
 try{
  const f=await fixture("browser.open",false,host,true),openInput={laneId:"research",mode:"anonymous",domain:"example.com"};
  const execute=(callId:string)=>f.ports.execute(f.ref,{callId});
  const first=await f.reserve("browser.open",openInput),opened=await execute(first);expect(opened.summary).toContain("lane-1");
  const scroll={laneId:"lane-1",browserEpoch:1,action:"scroll",input:{direction:"down",amount:300}};
  const one=await f.reserve("browser.act",scroll),out=await execute(one);expect(await execute(one)).toEqual(out);expect(scrolls).toBe(1);
  const two=await f.reserve("browser.act",scroll);await execute(two);expect(scrolls).toBe(2);
  const closeInput={laneId:"lane-1",browserEpoch:1},last=await f.reserve("browser.close",closeInput),closed=await execute(last);
  expect(await execute(last)).toEqual(closed);expect(closes).toBe(1);
  const repeatClose=await f.reserve("browser.close",closeInput);expect(await execute(repeatClose)).toMatchObject({status:"error",error:{code:"invalid_input"}});
  const second=await f.reserve("browser.open",openInput);expect((await execute(second)).summary).toContain("lane-2");expect(opens).toBe(2);
  expect(await execute(first)).toEqual(opened);expect(opens).toBe(2);
  const unknownInput={...scroll,laneId:"lane-2"};
  // Reserve the competing proposals before any result becomes unknown: the
  // ledger correctly forbids admitting a new model after an unknown action.
  const [lost,historical,next,afterHistorical]=await f.reserveBatch("browser.act",unknownInput,4);
  unknown=true;
  await expect(execute(lost!.callId)).rejects.toThrow("须按原调用对账");const sent=scrolls;expect(sent).toBe(3);
  await expect(execute(lost!.callId)).rejects.toThrow("须对账");
  // Isolated legacy-history fixture only: seed a later saved success through
  // the low-level ledger. This is not a new execution or a recovery assertion.
  await f.ledger.settle(f.ref,historical!.callId,{status:"settled",usage:{totalTokens:0},resultText:JSON.stringify({schemaVersion:1,kind:"tool",toolCallId:historical!.toolCallId,toolName:"browser_act",output:out})});
  await expect(execute(next!.callId)).rejects.toThrow("须按原调用对账");expect(scrolls).toBe(sent);
  await expect(execute(afterHistorical!.callId)).rejects.toThrow("须按原调用对账");expect(scrolls).toBe(sent);
  const saved=await f.calls();
  expect(saved.find(call=>call.id===lost!.callId)).toMatchObject({status:"unknown",toolExecutionClaimId:expect.any(String)});
  expect(saved.find(call=>call.id===historical!.callId)?.status).toBe("settled");
 }finally{await host.dispose();await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(dir,{recursive:true,force:true});}
});

it.each(["browser.observe","browser.screenshot"])("真实socket→browser host→gateway→ledger：%s读取/媒体故障不阻断，新调用可重新观察",async name=>{
 const dir=await mkdtemp(join(tmpdir(),"t1026-browser-read-")),path=join(dir,"browser.sock"),requests:string[]=[],profileKey=randomUUID().replaceAll("-","").repeat(2);
 let fail=true;
 const png="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4AWP4z8DwHwAFAAH/e+m+7wAAAABJRU5ErkJggg==";
 const server=createServer(socket=>{let buffer="";socket.on("data",chunk=>{
  buffer+=chunk.toString();if(!buffer.includes("\n"))return;
  const request=JSON.parse(buffer.split("\n")[0]!);const action=request.action;requests.push(action.kind);
  if(action.kind==="execute"&&name==="browser.observe"&&fail){socket.end(JSON.stringify({ok:false,operationId:request.operationId,code:"OPERATION_NOT_ALLOWED"})+"\n");return;}
  const value=action.kind==="profile_location"?{profileKey,managedProfileRoot:"/isolated/browser",identityMode:"anonymous",legacyIdentityImported:false,primaryLoginState:"unverified"}:
   action.kind==="open"?{lane:{lane_id:"lane",browser_epoch:1}}:action.kind==="stop_proof"?{profileStopped:false}:
   action.action==="screenshot"?{result:{output:{media_type:"image/png",data:png}}}:{text:"fresh page"};
  socket.end(JSON.stringify({ok:true,operationId:request.operationId,value})+"\n");
 });});
 await new Promise<void>(resolve=>server.listen(path,resolve));
 const media=vi.fn(async()=>{if(fail)throw Error("immutable upload reply unavailable");return "wm1-"+"e".repeat(64);});
 const host=createWorkbenchBrowserHost(db,{platform:"darwin",desktop:true,socketPath:path,media:{submit:media}})!;
 try{
  const f=await fixture(name,false,host),task=await f.readTask();
  expect((await host.dispatch({context:{userId:f.ctx.userId,accountId:f.ctx.accountId,taskId:f.task.id,attempt:f.ref.attempt,fenceToken:f.ref.fenceToken,leaseId:task.leaseOwner!,operationId:randomUUID()},
   invocation:{name:"browser.open",schemaVersion:1,input:{laneId:"lane",mode:"anonymous",domain:"example.com"}}},{signal:AbortSignal.timeout(10000),onProgress:()=>{}}))).toMatchObject({status:"succeeded"});
  const id=await f.reserve(),out=await f.ports.execute(f.ref,{callId:id});
  expect(out).toMatchObject({status:"error",sideEffect:"none",data:{workbench:{status:"failed",error:{dispatched:true,code:name==="browser.observe"?"operation_not_allowed":"screenshot_media_result_unknown"}}}});
  expect((await f.calls()).at(-1)?.status).toBe("settled");expect(JSON.stringify(out)).not.toContain("confirmedNoCommit");
  fail=false;const next=await f.reserve();expect(await f.ports.execute(f.ref,{callId:next})).toMatchObject({status:"ok"});
  expect(requests.filter(kind=>kind==="execute")).toHaveLength(2);
 }finally{await host.dispose();await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(dir,{recursive:true,force:true});}
});

it.each(["unknown","throw","oversized","invalid"] as const)("gateway的%s观察结果有界收口为读取错误，不产生unknown账本",async mode=>{
 const f=await fixture();f.setMode(mode);const id=await f.reserve();
 const output=await f.ports.execute(f.ref,{callId:id});
 expect(output).toMatchObject({status:"error",sideEffect:"none",error:{code:"transient"},data:{workbench:{error:{dispatched:true}}}});
 expect(JSON.stringify(output).length).toBeLessThan(15000);expect(JSON.stringify(output)).not.toContain("secret provider");
 expect((await f.calls()).at(-1)?.status).toBe("settled");
});

it.each(["browser.navigate","browser.act","browser.open","browser.close"])("%s未知不能按观察放行（navigate的read目录也不例外）",async name=>{
 const f=await fixture(name),id=await f.reserve();
 await expect(f.ports.execute(f.ref,{callId:id})).rejects.toThrow("须按原调用对账");
 expect((await f.calls()).at(-1)?.status).toBe("unknown");
});

it("伪装写权限的同名观察不可安全重读；取消信号不派发",async()=>{
 const f=await fixture(),raw:WorkbenchResult={operationId:"op",status:"unknown",artifactRefs:[],progressCursor:null,error:{code:"lost",dispatched:true,retryable:false,nextAction:"reconcile"}};
 expect(workbenchToolOutcome(raw,{...f.descriptor,effects:["read","external_write"]}).sideEffect).toBe("unknown");
 const id=await f.reserve(),controller=new AbortController();controller.abort();
 await expect(f.ports.execute(f.ref,{callId:id},controller.signal)).rejects.toThrow();expect(f.dispatch).not.toHaveBeenCalled();
});

it("旧unknown观察按原账本结算为未取得结果，任务回队列但不重读、不改已结算模型费用",async()=>{
 const f=await fixture("browser.observe",true),id=await f.reserve();await expect(f.ports.execute(f.ref,{callId:id})).rejects.toThrow();
 await db.update(executionTasks).set({status:"unknown_result",leaseOwner:null,leaseExpiresAt:null}).where(eq(executionTasks.id,f.task.id));
 const before=await f.calls();expect(before[1]).toMatchObject({status:"unknown",toolExecutionClaimId:expect.any(String)});
 expect(await f.tasks.recoverExpiredLeases({includeSafeUnknownResults:true,taskId:f.task.id})).toMatchObject({requeued:1});
 const after=await f.calls();expect(after[0]).toEqual(before[0]);expect(after[1]).toMatchObject({id,status:"settled",inputDigest:before[1]!.inputDigest,toolExecutionClaimId:before[1]!.toolExecutionClaimId,totalTokens:0});
 const output=JSON.parse(after[1]!.resultText!).output as AgenticToolOutcome;
 expect(output).toMatchObject({status:"error",sideEffect:"none",data:{recoveryEvidence:{kind:"browser_observation_unavailable",dispatchState:"unproven",originalSnapshot:{status:"unknown",resultText:null}}}});
 expect(f.dispatch).not.toHaveBeenCalled();
 await f.tasks.recoverExpiredLeases({includeSafeUnknownResults:true,taskId:f.task.id});expect(await f.calls()).toEqual(after);
 const next=(await f.tasks.claimTask({taskId:f.task.id,workerId:"resume"}))!;
 expect(await f.ports.execute({executionTaskId:f.task.id,attempt:next.lease.attempt,fenceToken:next.lease.fenceToken},{callId:id})).toEqual(output);
 expect(f.dispatch).not.toHaveBeenCalled();
});

it.each(["paused","active","digest","claim","child","budget","receipt","frozen","capability"])("旧观察%s不具备恢复资格，原unknown与账本保留",async mode=>{
 const f=await fixture("browser.observe",true),id=await f.reserve();await expect(f.ports.execute(f.ref,{callId:id})).rejects.toThrow();
 await db.update(executionTasks).set({status:mode==="paused"?"paused":"unknown_result",leaseOwner:mode==="active"?"live":null,leaseExpiresAt:mode==="active"?new Date(Date.now()+60000).toISOString():null}).where(eq(executionTasks.id,f.task.id));
 if(mode==="digest")await db.update(executionCalls).set({inputDigest:"wrong"}).where(eq(executionCalls.id,id));
 if(mode==="claim")await db.update(executionCalls).set({toolExecutionClaimId:null}).where(eq(executionCalls.id,id));
 if(mode==="budget")await db.update(executionCalls).set({reservedTokens:1}).where(eq(executionCalls.id,id));
 if(mode==="receipt")await db.update(executionCalls).set({resultText:"existing"}).where(eq(executionCalls.id,id));
 if(mode==="child"){const call=(await f.calls())[1]!;await db.insert(executionCalls).values({...call,id:randomUUID(),sequence:3,parentCallId:id,operationKey:randomUUID()});}
 if(mode==="frozen"||mode==="capability"){
  const task=await f.readTask(),payload=structuredClone(task.payload) as {modelInput:{tools:{version:string}[];workbenchCapabilities:{effects:string[]}[]}};
  if(mode==="frozen")payload.modelInput.tools[0]!.version="changed";else payload.modelInput.workbenchCapabilities[0]!.effects=["read","external_write"];
  await db.update(executionTasks).set({payload}).where(eq(executionTasks.id,f.task.id));
 }
 const before=await f.calls();await f.tasks.recoverExpiredLeases({includeSafeUnknownResults:true,taskId:f.task.id});expect(await f.calls()).toEqual(before);
 expect((await f.readTask()).status).not.toBe("queued");
});

it("另一未知写动作仍阻断，只收口该任务的纯观察原call",async()=>{
 const f=await fixture("browser.observe",true),id=await f.reserve();await expect(f.ports.execute(f.ref,{callId:id})).rejects.toThrow();
 const call=(await f.calls())[1]!,external={...call,id:randomUUID(),sequence:3,operationKey:"unproven-mutation"};await db.insert(executionCalls).values(external);
 await db.update(executionTasks).set({status:"unknown_result",leaseOwner:null,leaseExpiresAt:null}).where(eq(executionTasks.id,f.task.id));
 await f.tasks.recoverExpiredLeases({includeSafeUnknownResults:true,taskId:f.task.id});
 expect((await f.calls())[1]?.status).toBe("settled");expect((await f.calls())[2]).toEqual(external);expect((await f.readTask()).status).toBe("unknown_result");
});
