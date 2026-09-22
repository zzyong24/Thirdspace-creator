// @vitest-environment node
import {randomUUID} from "node:crypto";
import {createServer} from "node:net";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {afterAll,beforeAll,expect,it,vi} from "vitest";
import {createDb,aiTasks,executionTasks,executionCalls,eq,asc,type Db} from "@creatoros/backend";
import {createPersistentTaskService,createExecutionLeaseService,createExecutionCallLedgerService,createWorkbenchPublicStreamService as createExecutionStreamService} from "@creatoros/backend/modules/execution";
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
 const capabilities=allBrowser?(nativeHost?.catalog??catalog):[descriptor];
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
 const leases=createExecutionLeaseService(db),streams=createExecutionStreamService(db),resolve=createChatWorkbenchCapabilityHost(nativeHost??{catalog:capabilities,platform:"macos",capabilities:["task.browser"],dispatch},
  r=>leases.withLease(r,"admission",async({task,context})=>({userId:context.userId,accountId:context.accountId!,taskId:task.id,attempt:task.attempt,fenceToken:task.fenceToken!,leaseId:task.leaseOwner!})),async(r,id,progress)=>{await streams.appendWorkbenchProgress(r,id,progress);});
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
 return {ctx,task,ref,descriptor,ports,tasks,reserve,reserveBatch,ledger,streams,calls,readTask,dispatch,setMode:(m:Mode)=>{mode=m;}};
}

it.each(["profile_location","open","invalid_reply","unknown_code"])("open %s失败沿正式公开events保留有界阶段事实，原调用仍unknown",async fault=>{
 const dir=await mkdtemp(join(tmpdir(),"t1026-open-diagnostic-")),path=join(dir,"browser.sock"),profileKey=randomUUID().replaceAll("-","").repeat(2);
 let opens=0;
 const server=createServer(socket=>{let buffer="";socket.on("data",chunk=>{
  buffer+=chunk.toString();if(!buffer.includes("\n"))return;
  const request=JSON.parse(buffer.split("\n")[0]!),kind=request.action.kind;
  if(kind==="open")opens++;
  if((fault==="profile_location"&&kind==="profile_location")||(fault!=="profile_location"&&fault!=="invalid_reply"&&kind==="open")){
   socket.end(JSON.stringify({ok:false,operationId:request.operationId,code:fault==="unknown_code"?"SECRET_PROVIDER_VALUE":"BROWSER_UNAVAILABLE",message:"SECRET_MESSAGE"})+"\n");return;
  }
  const value=kind==="profile_location"?{profileKey,managedProfileRoot:"/SECRET_PATH",identityMode:"anonymous",legacyIdentityImported:false,primaryLoginState:"unverified"}:
   kind==="stop_proof"?{profileStopped:false}:{lane:{lane_id:"SECRET_INVALID",browser_epoch:"bad"},secret:"SECRET_VALUE"};
  socket.end(JSON.stringify({ok:true,operationId:request.operationId,value})+"\n");
 });});
 await new Promise<void>(resolve=>server.listen(path,resolve));
 const host=createWorkbenchBrowserHost(db,{platform:"darwin",desktop:true,socketPath:path})!;
 try{
  const f=await fixture("browser.open",false,host),id=await f.reserve();
  await expect(f.ports.execute(f.ref,{callId:id})).rejects.toThrow("须按原调用对账");
  expect((await f.calls()).at(-1)).toMatchObject({id,status:"unknown",resultText:null});
  const page=await f.streams.read(f.ctx,f.task.id,{afterSequence:0,limit:100});
  const progress=page.events.filter(event=>event.callId===id&&event.chunk.type==="data-workbench-progress");
  const details=progress.map(event=>JSON.parse((event.chunk.data as {content:{text:string}[]}).content[0]!.text));
  expect(details.at(-1)).toMatchObject({kind:"browser_open_diagnostic",observation:"stage_error",terminalOutcome:"unproven",
   stage:fault==="profile_location"?"profile_admission":fault==="invalid_reply"?"reply_validation":"native_open",
   code:fault==="unknown_code"?"unknown_code":fault==="invalid_reply"?"INVALID_BROWSER_REPLY":"BROWSER_UNAVAILABLE",
   openDispatched:fault!=="profile_location"});
  expect(opens).toBe(fault==="profile_location"?0:1);
  expect(JSON.stringify(progress)).not.toContain("SECRET");expect(JSON.stringify(progress)).not.toContain(f.ref.fenceToken);
  expect(progress.length).toBeLessThanOrEqual(10);
  await expect(f.ports.execute(f.ref,{callId:id})).rejects.toThrow("须对账");expect(opens).toBe(fault==="profile_location"?0:1);
  await expect(f.streams.read({...f.ctx,accountId:"other"},f.task.id,{})).rejects.toThrow();
 }finally{await host.dispose();await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(dir,{recursive:true,force:true});}
});

it("同task新attempt的正式host清理精确旧profile后reopen；诊断观察者抛错不改变成功",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"t1026-open-attempt-")),path=join(dir,"browser.sock"),profileKey=randomUUID().replaceAll("-","").repeat(2),requests:Array<{kind:string;attempt?:number}>=[];
 let opens=0;
 const server=createServer(socket=>{let buffer="";socket.on("data",chunk=>{
  buffer+=chunk.toString();if(!buffer.includes("\n"))return;const request=JSON.parse(buffer.split("\n")[0]!),kind=request.action.kind;
  requests.push({kind,attempt:request.admission?.attempt});
  const value=kind==="profile_location"?{profileKey:request.action.identityMode==="anonymous"?profileKey:"b".repeat(64),managedProfileRoot:"/isolated/profile",identityMode:request.action.identityMode,legacyIdentityImported:false,primaryLoginState:"unverified"}:
   kind==="open"?{lane:{lane_id:`native-${++opens}`,browser_epoch:1}}:
   {profileStopped:true,profileKey,profileLeaseId:request.admission.profileLeaseId};
  socket.end(JSON.stringify({ok:true,operationId:request.operationId,value})+"\n");
 });});
 await new Promise<void>(resolve=>server.listen(path,resolve));
 const options={platform:"darwin" as const,desktop:true,socketPath:path},first=createWorkbenchBrowserHost(db,options)!;
 let second:ReturnType<typeof createWorkbenchBrowserHost>;
 try{
  const f=await fixture("browser.open",false,first),id=await f.reserve();expect(await f.ports.execute(f.ref,{callId:id})).toMatchObject({status:"ok"});
  await f.tasks.command(f.ctx,{taskIds:[f.task.id],command:"pause",idempotencyKey:randomUUID()});
  await f.tasks.acknowledgeControl({taskId:f.task.id,workerId:f.ctx.userId,attempt:f.ref.attempt});await first.dispose();
  await f.tasks.command(f.ctx,{taskIds:[f.task.id],command:"resume",idempotencyKey:randomUUID()});
  const claim=(await f.tasks.claimTask({taskId:f.task.id,workerId:"new-worker"}))!;
  second=createWorkbenchBrowserHost(db,options)!;
  const context={userId:f.ctx.userId,accountId:f.ctx.accountId,taskId:f.task.id,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken,leaseId:"new-worker",operationId:randomUUID()};
  expect(await second.dispatch({context,invocation:{name:"browser.status",schemaVersion:1,input:{laneId:"native-1"}}},{signal:new AbortController().signal,onProgress:()=>{}})).toMatchObject({status:"failed",error:{code:"lane_not_found",dispatched:false}});
  const observer=vi.fn(()=>{throw Error("observer is unavailable");});
  const reopened=await second.dispatch({context:{...context,operationId:randomUUID()},invocation:{name:"browser.open",schemaVersion:1,input:{laneId:"acceptance-browser-g-v2",mode:"anonymous",domain:"example.com"}}},{signal:new AbortController().signal,onProgress:observer});
  expect(reopened).toMatchObject({status:"succeeded"});expect(JSON.stringify(reopened)).toContain("native-2");expect(observer).toHaveBeenCalled();
  expect(requests.filter(row=>row.kind==="cleanup")).toEqual([{kind:"cleanup",attempt:1}]);
  expect(requests.filter(row=>row.kind==="open")).toEqual([{kind:"open",attempt:1},{kind:"open",attempt:2}]);
 }finally{await first.dispose();await second?.dispose();await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(dir,{recursive:true,force:true});}
});

it("open成功给真实lane协议指导；alias仍拒绝，真实ID成功，同call回放和catalog不改",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"t1026-lane-guidance-")),path=join(dir,"browser.sock"),profileKey=randomUUID().replaceAll("-","").repeat(2),actions:string[]=[];
 const server=createServer(socket=>{let buffer="";socket.on("data",chunk=>{
  buffer+=chunk.toString();if(!buffer.includes("\n"))return;const request=JSON.parse(buffer.split("\n")[0]!),kind=request.action.kind;actions.push(kind);
  const lane={lane_id:"real-native-lane",browser_epoch:1};
  const value=kind==="profile_location"?{profileKey,managedProfileRoot:"/isolated/profile",identityMode:"anonymous",legacyIdentityImported:false,primaryLoginState:"unverified"}:
   kind==="open"?{lane}:lane;
  socket.end(JSON.stringify({ok:true,operationId:request.operationId,value})+"\n");
 });});
 await new Promise<void>(resolve=>server.listen(path,resolve));
 const host=createWorkbenchBrowserHost(db,{platform:"darwin",desktop:true,socketPath:path})!,before=JSON.stringify(host.catalog);
 try{
  const f=await fixture("browser.open",false,host,true),id=await f.reserve("browser.open",{laneId:"requested-alias",mode:"anonymous",domain:"example.com"});
  const opened=await f.ports.execute(f.ref,{callId:id});
  const data=opened.data as {workbench:{content:{type:string;text:string}[]}};
  expect(data.workbench.content[0]).toEqual({type:"text",text:JSON.stringify({lane:{lane_id:"real-native-lane",browser_epoch:1}})});
  expect(data.workbench.content[1]?.text).toContain("lane.lane_id");expect(data.workbench.content[1]?.text).toContain("lane.browser_epoch");
  const wrong=await f.reserve("browser.status",{laneId:"requested-alias"}),denied=await f.ports.execute(f.ref,{callId:wrong});
  expect(denied).toMatchObject({status:"error",sideEffect:"none",error:{code:"invalid_input",recovery:expect.stringContaining("lane.lane_id")},data:{workbench:{error:{code:"lane_not_found",dispatched:false}}}});
  expect(denied.error?.recovery).toContain("unknown");expect(actions.filter(action=>action==="status")).toHaveLength(0);
  const correct=await f.reserve("browser.status",{laneId:"real-native-lane"});expect(await f.ports.execute(f.ref,{callId:correct})).toMatchObject({status:"ok"});
  expect(actions.filter(action=>action==="status")).toHaveLength(1);
  expect(await f.ports.execute(f.ref,{callId:id})).toEqual(opened);expect(actions.filter(action=>action==="open")).toHaveLength(1);
  expect(JSON.stringify(host.catalog)).toBe(before);
 }finally{await host.dispose();await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(dir,{recursive:true,force:true});}
});

it.each(["lease","abort"])("open原生回覆后%s失效不回写新诊断，派发可能性保留且仍unknown",async fault=>{
 const dir=await mkdtemp(join(tmpdir(),"t1026-open-fence-")),path=join(dir,"browser.sock"),profileKey=randomUUID().replaceAll("-","").repeat(2);
 const controller=new AbortController();let invalidate=async()=>{},opens=0,invalidationError:unknown;
 const server=createServer(socket=>{socket.on("error",()=>{});let buffer="";socket.on("data",async chunk=>{
  buffer+=chunk.toString();if(!buffer.includes("\n"))return;const request=JSON.parse(buffer.split("\n")[0]!),kind=request.action.kind;
  if(kind==="open"){opens++;await invalidate();}
  const value=kind==="profile_location"?{profileKey,managedProfileRoot:"/isolated/profile",identityMode:"anonymous",legacyIdentityImported:false,primaryLoginState:"unverified"}:
   kind==="open"?{lane:{lane_id:"native",browser_epoch:1}}:{profileStopped:false};
  socket.end(JSON.stringify({ok:true,operationId:request.operationId,value})+"\n");
 });});
 await new Promise<void>(resolve=>server.listen(path,resolve));
 const host=createWorkbenchBrowserHost(db,{platform:"darwin",desktop:true,socketPath:path})!;
 try{
  const f=await fixture("browser.open",false,host),id=await f.reserve();
  invalidate=async()=>{
   // Wait for earlier stage facts, then invalidate before the Native reply.
   try{await vi.waitFor(async()=>{expect(JSON.stringify((await f.streams.read(f.ctx,f.task.id,{})).events)).toContain("native_open");});}
   catch(error){invalidationError=error;}
   if(fault==="abort")controller.abort();else await db.update(executionTasks).set({status:"paused",leaseOwner:null,leaseExpiresAt:null}).where(eq(executionTasks.id,f.task.id));
  };
  await expect(f.ports.execute(f.ref,{callId:id},controller.signal)).rejects.toThrow();expect(opens).toBe(1);
  if(invalidationError)throw invalidationError;
  expect((await f.calls()).at(-1)).toMatchObject({status:"unknown",resultText:null});
  const page=await f.streams.read(f.ctx,f.task.id,{}),last=page.events.at(-1)!;
  const detail=JSON.parse((last.chunk.data as {content:{text:string}[]}).content[0]!.text);
  expect(detail).toMatchObject({stage:"native_open",observation:"stage_enter",terminalOutcome:"unproven",openDispatched:null});
  expect(page.events.some(event=>JSON.stringify(event.chunk).includes("stage_error"))).toBe(false);
 }finally{await host.dispose();await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(dir,{recursive:true,force:true});}
});

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
