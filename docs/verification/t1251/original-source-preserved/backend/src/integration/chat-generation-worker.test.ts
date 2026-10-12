import {createChatHooksTaskToolHost} from "../modules/ai-runtime/chat-hooks-tool-host";
import * as hooksModule from "../modules/execution/execution-chat-hooks.service";
import {buildChatTools,type ChatToolDeps} from "../modules/ai-runtime/chat-tools";
import {prepareChatToolDefinitions} from "../modules/ai-runtime/chat-tool-definitions";
import {createChatStructuredTaskToolHost} from "../modules/ai-runtime/chat-structured-tool-host";
import {createChatHostContextReader} from "../modules/ai/chat-host-context.service";
import * as supervisorModule from "../modules/execution/worker-supervisor";
import * as generationModule from "../modules/execution/execution-chat-generation.service";
import {createServer} from "node:http";
import {execFileSync} from "node:child_process";
import {resolve} from "node:path";
import {beforeAll,afterAll,it,expect,vi} from "vitest";
import {createDb,executionTasks,executionCalls,aiMessages,eq,type Db} from "@creatoros/backend";
import {createAiRepository} from "../modules/ai/ai.repository";
import type {ChatHostContext} from "../modules/ai/chat-host-context";
import {createChatTurnSubmissionService} from "../modules/ai/chat-turn-submission.service";
import {createChatWorkerDispatcher} from "../modules/execution/model-worker-dispatcher";
import {createExecutionStreamService} from "../modules/execution/execution-stream.service";
import {createPersistentTaskService} from "../modules/execution/persistent-task.service";
const originalSupervisor=supervisorModule.createWorkerSupervisor;
const originalFactory=generationModule.createExecutionChatGenerationService;
const realHooks=hooksModule.createExecutionChatHooksService;
let db:Db,close:()=>Promise<void>,seq=0;
const entryPath=resolve("../ai-worker/dist/execution-worker.cjs");
beforeAll(async()=>{const f=await createDb();db=f.db;close=()=>f.client.close();execFileSync(process.execPath,[resolve("../ai-worker/scripts/build.mjs")],{stdio:"pipe",timeout:180000});},180000);
afterAll(async()=>close(),180000);
it.each(["success","cancel","reject401","reject401resume","reject429","reject429drop","reject400drop","crashAfterChild","crashUnknownChild","crashCancel","crashDeadline","crashPauseResume","settlementDrop","badOutput","crashFallback","crashTwoNodes","positioning","crashMixed","diagnosis","crashDiagnosis","diagnosisEmpty"])("同一真实 Worker 内部结构化生成：%s",async(mode)=>{
 let server:ReturnType<typeof createServer>|undefined,host:ReturnType<typeof createChatWorkerDispatcher>|undefined;
 let supervisorSpy:{mockRestore():void}|undefined,failureSpy:{mockRestore():void}|undefined,hooksSpy:{mockRestore():void}|undefined;
 let releaseSettlements=()=>{},diagnosticTaskId:string|null=null;const fixtureTrace:Array<Record<string,unknown>>=[];
 try{
 let clockOffset=0;
 const diagnosis=mode==="diagnosis" || mode==="crashDiagnosis" || mode==="diagnosisEmpty";
 const name=diagnosis?"calibration.diagnose":mode==="positioning"?"positioning.generate":"topic.enrich",facet=mode==="positioning"?"current":"title";
 const ctx={userId:"hooks-worker-u",accountId:`hooks-worker-a-${++seq}`,requestId:"test",source:"user" as const},now=()=>new Date(Date.now()+clockOffset).toISOString();
 const repo=createAiRepository(db,{userId:ctx.userId,accountId:ctx.accountId,now,nextId:prefix=>`${prefix}-${++seq}`});
 const conversation=await repo.createConversation({title:"开场",projectId:null,scope:"global"});
 const source=await repo.createMessage(conversation.id,{role:"user",content:"生成开场",attachments:[],modelMetadata:{}});
 const definitions=(await prepareChatToolDefinitions(buildChatTools(mode==="crashMixed"?[name,"script.hooks"]:[name],{} as ChatToolDeps),{workerStructuredNodes:true,workerScriptHooks:true})).definitions;
 const effective:ChatHostContext["skillSnapshot"]["skills"][number]["effective"]={methodSystem:"策略",template:`{{${facet}}}`,tools:[name],requiredFacets:[facet],contextRequirements:[],outputSchema:diagnosis?{type:"object",properties:{dimensions:{type:"array",items:{type:"object",properties:{key:{type:"string"},score:{type:"number"}},required:["key","score"],additionalProperties:false}},verdict:{type:"string"}},required:["dimensions","verdict"],additionalProperties:false}:{type:"object",properties:{oneLiner:{type:"string"}},required:["oneLiner"],additionalProperties:false},completionPolicy:null,completionPolicyAdapter:null};
 const hostContext:ChatHostContext={schemaVersion:1,scriptHooksGeneration:{version:1,maxOutputTokens:2048},scriptHooksContext:{selectionTitle:"开场专用主题",positioningBrief:"原定位",projectBriefHard:"",userMaterialHardBrief:"",userMaterialRefBrief:"",knowledgeBrief:""},chatContext:{surface:"topics",selection:{kind:"candidate",ids:["candidate"],label:"真实主题"}},mediaRoute:null,positioningScratch:false,trustedScriptSources:[],structuredContext:{positioningBrief:"原定位",accountsBrief:"",learningsBrief:"",signalsBrief:"",knowledgeBrief:""},structuredGeneration:{version:1,maxOutputTokens:2048},skillSnapshot:{snapshotVersion:1,userId:ctx.userId,accountId:ctx.accountId,resolvedAt:"fixed",platformPolicyVersion:"1",platformPolicy:"候选",skills:["chatbox.topic",name].sort().map(skillId=>({skillId,baseVersion:"1",overlayRevision:null,overlayVersion:null,effective}))}};
 const submission=await createChatTurnSubmissionService(db,{now,assemble:async()=>({capability:"copilot.assist",system:"生成开场候选",messages:[{role:"user",content:"生成开场"}],maxSteps:6,maxOutputTokens:128,tools:definitions,hostContext})}).submit(ctx,{conversationId:conversation.id,sourceMessageId:source.id});
 diagnosticTaskId=submission.executionTaskId;
 const requests:Record<string,unknown>[]=[];
 let childOpened=false,recovered=false,settledChildren=0;
 const allSettled=new Promise<void>(resolve=>{releaseSettlements=resolve;});
 server=createServer(async(req,res)=>{
  let body="";for await(const chunk of req)body+=chunk.toString();const input=JSON.parse(body);requests.push(input);
  const rootRequest=Array.isArray(input.tools)&&input.tools.some((tool:{function?:{name?:string}})=>tool.function?.name===name.replaceAll(".","_"));
  fixtureTrace.push({type:"http",index:requests.length,rootRequest,stream:input.stream,toolNames:Array.isArray(input.tools)?input.tools.map((tool:{function?:{name?:string}})=>tool.function?.name):[]});
  if(!rootRequest){childOpened=true;
   const hook=mode==="crashMixed" && JSON.stringify(input.messages).includes("开场专用主题");
   if((mode.startsWith("reject")) && requests.length===2){res.writeHead(mode.startsWith("reject401")?401:mode.startsWith("reject400")?400:429,{"content-type":"application/json","retry-after":"1"});res.end(JSON.stringify({error:{message:"fixture rejected",type:"api_error"}}));return;}
if(!input.stream)res.writeHead(200,{"content-type":"application/json"});if(mode==="crashUnknownChild"){res.destroy();return;}if(mode==="cancel"){res.write('{"id":');return;}const childResponse={id:"child",object:"chat.completion",created:1,model:"fixture",choices:[{index:0,message:{role:"assistant",content:hook?'[ {"text":"真实开场卡","angle":"场景"} ]':mode==="badOutput" || (!recovered && ["crashFallback","crashTwoNodes","crashMixed"].includes(mode))?'无效对象':mode==="diagnosisEmpty"?'{"dimensions":[],"verdict":""}':diagnosis?'{"dimensions":[{"key":"hook","score":4}],"verdict":"真实选题卡"}':'{"oneLiner":"真实选题卡"}'},finish_reason:"stop"}],usage:{prompt_tokens:4,completion_tokens:3,total_tokens:7}};if(input.stream){res.writeHead(200,{"content-type":"text/event-stream"});res.end([{...childResponse,object:"chat.completion.chunk",choices:childResponse.choices.map(choice=>({index:choice.index,delta:choice.message,finish_reason:null}))},{...childResponse,object:"chat.completion.chunk",choices:childResponse.choices.map(choice=>({index:choice.index,delta:{},finish_reason:choice.finish_reason}))}].map(chunk=>`data: ${JSON.stringify(chunk)}\n\n`).join("")+"data: [DONE]\n\n");}else res.end(JSON.stringify(childResponse));return;}
  const first=requests.length===1;
  const delta=first?{tool_calls:(["crashTwoNodes","crashMixed"].includes(mode)?[0,1]:[0]).map(index=>({index,id:`node-${index}`,type:"function",function:{name:mode==="crashMixed" && index===1?"script_hooks":name.replaceAll(".","_"),arguments:JSON.stringify(mode==="crashMixed" && index===1?{}:mode==="positioning"?{extraBrief:"真实主题"}:{title:"真实主题"})}}))}:{content:"候选已准备好"};
  const chunks=[{choices:[{index:0,delta,finish_reason:null}]},{choices:[{index:0,delta:{},finish_reason:first?"tool_calls":"stop"}],usage:{prompt_tokens:2,completion_tokens:3,total_tokens:5}}];
  res.writeHead(200,{"content-type":"text/event-stream"});res.end(chunks.map(chunk=>`data: ${JSON.stringify({id:"root",object:"chat.completion.chunk",created:1,model:"fixture",...chunk})}\n\n`).join("")+"data: [DONE]\n\n");
 });
 await new Promise<void>(resolve=>server!.listen(0,"127.0.0.1",resolve));
 const reader=createChatHostContextReader(db,{now}),structuredHost=createChatStructuredTaskToolHost(reader,{readWorks:async()=>"",getPositioningDiscovery:async()=>null}),hooksHost=createChatHooksTaskToolHost(reader);
 const createHost=()=>createChatWorkerDispatcher(db,{now,entryPath,workerId:"hooks-host",budget:{maxCalls:10,maxTokens:100000,deadlineMs:mode.startsWith("crash")?300000:180000},modelConcurrency:1,resolveTools:async(...args)=>({...await structuredHost(...args),...await hooksHost(...args)}),resolveModelCredential:async()=>({apiFormat:"openai_chat",baseUrl:`http://127.0.0.1:${(server!.address() as {port:number}).port}/v1`,model:"fixture",...(["crashFallback","crashTwoNodes","crashMixed"].includes(mode)?{structuredOutputs:true}:{}),token:mode==="reject401resume"?`fixture-${requests.length}`:"fixture"})});
 let droppedFailure=false;
 let stopExecution:ReturnType<typeof originalSupervisor>["stopExecutionTree"]|undefined;
 supervisorSpy=mode.startsWith("crash")?vi.spyOn(supervisorModule,"createWorkerSupervisor").mockImplementation(options=>{
  const supervisor=originalSupervisor(options);stopExecution=ref=>supervisor.stopExecutionTree(ref);return supervisor;
 }):undefined;
 failureSpy=(mode.endsWith("drop") || mode.startsWith("crash") || mode==="settlementDrop")?vi.spyOn(generationModule,"createExecutionChatGenerationService").mockImplementation((...args)=>{
  const service=originalFactory(...args);
  return {...service,async settle(...settleArgs){
   const result=await service.settle(...settleArgs);
   if(mode==="settlementDrop")throw new Error("fixture lost child settlement receipt");
   if(mode.startsWith("crash") && ++settledChildren===(["crashTwoNodes","crashMixed"].includes(mode)?2:1)){expect(await stopExecution!(settleArgs[0])).toBe(true);releaseSettlements();}
   if(["crashTwoNodes","crashMixed"].includes(mode))await allSettled;
   return result;
  },async fail(...failureArgs){const result=await service.fail(...failureArgs);if(!droppedFailure){droppedFailure=true;throw new Error("fixture lost failure receipt");}return result;}};
 }):undefined;
 hooksSpy=mode==="crashMixed"?vi.spyOn(hooksModule,"createExecutionChatHooksService").mockImplementation((...args)=>{
  const service=realHooks(...args);return {...service,async settle(...input){const result=await service.settle(...input);if(++settledChildren===2){expect(await stopExecution!(input[0])).toBe(true);releaseSettlements();}await allSettled;return result;}};
 }):undefined;
 host=createHost();
  const draining=host.drainOnce();
  if(mode==="cancel"){
   await vi.waitFor(()=>expect(childOpened).toBe(true),{timeout:180000});
   await createPersistentTaskService(db).command(ctx,{taskIds:[submission.executionTaskId],command:"cancel",idempotencyKey:"cancel"});
  }
  await draining;
  if(mode.startsWith("crash")){
   const [interrupted]=await db.select().from(executionTasks).where(eq(executionTasks.id,submission.executionTaskId));
   const before=await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,submission.executionTaskId));
   expect(interrupted?.status).toBe("running");
   expect(before.find(call=>call.kind==="tool")).toMatchObject({status:"started"});
   expect(before.find(call=>call.parentCallId)).toMatchObject(mode==="crashUnknownChild"?{status:"unknown",totalTokens:null}:{status:"settled",totalTokens:7});
   expect(requests).toHaveLength(["crashTwoNodes","crashMixed"].includes(mode)?3:2);
   recovered=true;await host.stop();failureSpy?.mockRestore();supervisorSpy?.mockRestore();hooksSpy?.mockRestore();
   if(mode==="crashCancel")await createPersistentTaskService(db,{now}).command(ctx,{taskIds:[submission.executionTaskId],command:"cancel",idempotencyKey:"cancel-crashed"});
   if(mode==="crashPauseResume")await createPersistentTaskService(db,{now}).command(ctx,{taskIds:[submission.executionTaskId],command:"pause",idempotencyKey:"pause-crashed"});
   clockOffset=Date.parse(mode==="crashDeadline"?interrupted!.deadlineAt!:interrupted!.leaseExpiresAt!)-Date.now()+1;
   host=createHost();await host.drainOnce();
   if(mode==="crashPauseResume"){
    const [paused]=await db.select().from(executionTasks).where(eq(executionTasks.id,submission.executionTaskId));
    expect(paused?.status).toBe("paused");expect(requests).toHaveLength(2);
    await createPersistentTaskService(db,{now}).command(ctx,{taskIds:[submission.executionTaskId],command:"resume",idempotencyKey:"resume-completion"});
    await host.drainOnce();
   }
  }
  if(mode.startsWith("reject")){
   const [stopped]=await db.select().from(executionTasks).where(eq(executionTasks.id,submission.executionTaskId));
   expect(stopped?.status).toBe(mode.startsWith("reject401")?"waiting_user":mode.startsWith("reject400")?"failed":"retry_wait");
   const before=await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,submission.executionTaskId));
   expect(before.find(call=>call.kind==="tool")).toMatchObject({status:"started"});
   expect(before.find(call=>call.parentCallId)).toMatchObject({status:"rejected"});
   if(mode==="reject401" || mode.startsWith("reject400")){expect(requests).toHaveLength(2);return;}
   await host.stop();host=createHost();
   if(mode==="reject401resume")await createPersistentTaskService(db).command(ctx,{taskIds:[submission.executionTaskId],command:"resume",idempotencyKey:"configured"});
   else await vi.waitFor(()=>expect(Date.parse(stopped!.retryAt!)).toBeLessThanOrEqual(Date.now()),{timeout:180000});
   await host.drainOnce();
  }
  const [task]=await db.select().from(executionTasks).where(eq(executionTasks.id,submission.executionTaskId));
  if(["crashUnknownChild","crashCancel","crashDeadline"].includes(mode)){
   expect(task?.status).toBe(mode==="crashUnknownChild"?"unknown_result":mode==="crashCancel"?"cancelled":"failed");
   expect(requests).toHaveLength(2);return;
  }
  if(mode==="cancel"){
   expect(task?.status).toBe("cancelled");expect(requests).toHaveLength(2);
   const calls=await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,submission.executionTaskId));
   expect(calls.find(call=>call.parentCallId)).toMatchObject({status:"unknown",totalTokens:null});return;
  }
  expect(task?.status).toBe("succeeded");
  if(mode==="badOutput" || mode==="diagnosisEmpty"){
   const rows=await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,submission.executionTaskId));
   expect(rows.find(call=>call.kind==="tool")).toMatchObject({status:"settled"});
   expect(JSON.stringify(rows.find(call=>call.kind==="tool")?.resultText)).not.toContain("真实选题卡");
   expect(JSON.stringify(requests.at(-1)?.messages)).toContain("no_evidence");expect(requests).toHaveLength(3);return;
  }
  const count=mode==="crashMixed"?5:mode==="crashTwoNodes"?6:mode==="crashFallback" || mode.startsWith("reject")?4:3;
  expect(requests).toHaveLength(count);
  expect(requests.filter(request=>!Array.isArray(request.tools)||(request.tools as Array<{function?:{name?:string}}>).every(tool=>tool.function?.name!==name.replaceAll(".","_"))).some(request=>JSON.stringify(request.messages).includes("真实主题"))).toBe(true);
  if(mode==="crashMixed")expect(JSON.stringify(requests.at(-1)?.messages)).toContain("真实开场卡");
  expect(JSON.stringify(requests.at(-1)?.messages)).toContain("真实选题卡");
  const calls=await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,submission.executionTaskId));
  if(diagnosis) expect(JSON.parse(calls.find(call=>call.kind==="tool")!.resultText!).output.data).toMatchObject({kind:"calibration.diagnosis",diagnosis:{dimensions:[{key:"hook",score:4}]}});
  expect(calls.filter(call=>call.kind==="model")).toHaveLength(count);
  expect(calls.filter(call=>call.parentCallId)).toHaveLength(count-2);
  if(mode.startsWith("reject")){
   const children=calls.filter(call=>call.parentCallId).sort((a,b)=>a.sequence-b.sequence);
   expect(children[1]).toMatchObject({retryOfCallId:children[0]!.id,operationKey:children[0]!.operationKey,parentCallId:children[0]!.parentCallId});
   expect(calls.filter(call=>!call.parentCallId && call.kind==="model")).toHaveLength(2);
  }
  expect(calls.reduce((sum,call)=>sum+(call.totalTokens??0),0)).toBe(mode==="crashMixed"?31:mode==="crashTwoNodes"?38:mode==="crashFallback"?24:17);
  const messages=await db.select().from(aiMessages).where(eq(aiMessages.conversationId,conversation.id));
  expect(JSON.stringify(messages.find(message=>message.role==="assistant")?.parts)).toContain("真实选题卡");
  const page=await createExecutionStreamService(db).read(ctx,submission.executionTaskId,{});
  expect(page.events.filter(event=>event.chunk.type==="text-delta").map(event=>event.chunk.delta).join("")).toBe("候选已准备好");
 }finally{releaseSettlements();hooksSpy?.mockRestore();supervisorSpy?.mockRestore();failureSpy?.mockRestore();await host?.stop();if(diagnosticTaskId){const [task]=await db.select().from(executionTasks).where(eq(executionTasks.id,diagnosticTaskId));const calls=await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,diagnosticTaskId));console.info('T1246_B045_B046_TRACE',JSON.stringify({mode,executionTaskId:diagnosticTaskId,fixtureTrace,status:task?.status,deadlineAt:task?.deadlineAt,lastErrorCode:task?.lastErrorCode,calls:calls.map(call=>({id:call.id,kind:call.kind,parentCallId:call.parentCallId,operationKey:call.operationKey,status:call.status,totalTokens:call.totalTokens,createdAt:call.createdAt,updatedAt:call.updatedAt,startedAttempt:call.startedAttempt}))}));}if(server){server.closeAllConnections();if(server.listening)await new Promise<void>(resolve=>server!.close(()=>resolve()));}}
},540000);
