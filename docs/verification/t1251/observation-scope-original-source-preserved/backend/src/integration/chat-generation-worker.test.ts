import {createAccountGroupService,createPlatformAccountService} from "../modules/platform-account";
import {createAiService} from "../modules/ai/ai.service";
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
import {createDb,aiTasks,aiTaskResults,executionTasks,executionCalls,aiMessages,eq,type Db} from "@creatoros/backend";
import {createAiRepository} from "../modules/ai/ai.repository";
import type {ChatHostContext} from "../modules/ai/chat-host-context";
import {createChatTurnSubmissionService} from "../modules/ai/chat-turn-submission.service";
import {createChatWorkerDispatcher,createModelWorkerDispatcher} from "../modules/execution/model-worker-dispatcher";
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
 let server:ReturnType<typeof createServer>|undefined,host:ReturnType<typeof createChatWorkerDispatcher>|undefined,draining:Promise<number>|undefined;
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
 const [originalFrozenTask]=await db.select().from(executionTasks).where(eq(executionTasks.id,submission.executionTaskId));
 let mixedConfirmedModelFacts:Array<{id:string;operationKey:string;parentCallId:string|null;status:string;totalTokens:number|null}>=[];
 const requests:Record<string,unknown>[]=[];
 let childOpened=false,recovered=false,settledChildren=0;
 const isFixtureExecution=(ref:{executionTaskId:string})=>ref.executionTaskId===submission.executionTaskId;
 server=createServer(async(req,res)=>{
  let body="";for await(const chunk of req)body+=chunk.toString();const input=JSON.parse(body);requests.push(input);
  const rootRequest=Array.isArray(input.tools)&&input.tools.some((tool:{function?:{name?:string}})=>tool.function?.name===name.replaceAll(".","_"));
  fixtureTrace.push({type:"http",index:requests.length,rootRequest,stream:input.stream,toolNames:Array.isArray(input.tools)?input.tools.map((tool:{function?:{name?:string}})=>tool.function?.name):[]});
  if(!rootRequest){childOpened=true;
   const hook=mode==="crashMixed" && JSON.stringify(input.messages).includes("开场专用主题");
   if((mode.startsWith("reject")) && requests.length===2){res.writeHead(mode.startsWith("reject401")?401:mode.startsWith("reject400")?400:429,{"content-type":"application/json","retry-after":"1"});res.end(JSON.stringify({error:{message:"fixture rejected",type:"api_error"}}));return;}
if(!input.stream)res.writeHead(200,{"content-type":"application/json"});if(mode==="cancel"){res.write('{"id":');return;}const childResponse={id:"child",object:"chat.completion",created:1,model:"fixture",choices:[{index:0,message:{role:"assistant",content:hook?'[ {"text":"真实开场卡","angle":"场景"} ]':mode==="badOutput" || (!recovered && ["crashFallback","crashTwoNodes","crashMixed"].includes(mode))?'无效对象':mode==="diagnosisEmpty"?'{"dimensions":[],"verdict":""}':diagnosis?'{"dimensions":[{"key":"hook","score":4}],"verdict":"真实选题卡"}':'{"oneLiner":"真实选题卡"}'},finish_reason:"stop"}],usage:{prompt_tokens:4,completion_tokens:3,total_tokens:7}};if(input.stream){res.writeHead(200,{"content-type":"text/event-stream"});res.end([{...childResponse,object:"chat.completion.chunk",choices:childResponse.choices.map(choice=>({index:choice.index,delta:choice.message,finish_reason:null}))},{...childResponse,object:"chat.completion.chunk",choices:childResponse.choices.map(choice=>({index:choice.index,delta:{},finish_reason:choice.finish_reason}))}].map(chunk=>`data: ${JSON.stringify(chunk)}\n\n`).join("")+"data: [DONE]\n\n");}else res.end(JSON.stringify(childResponse));return;}
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
   // SEMANTIC_BOUNDARY_ALLOW: 仅本受控协议夹具模拟provider receipt未抵达宿主持久结算；不将已成功写入的结果改成unknown、不改变生产判断。
   if(mode==="crashUnknownChild" && isFixtureExecution(settleArgs[0])){fixtureTrace.push({type:"provider-receipt-dropped-before-settlement",executionTaskId:settleArgs[0].executionTaskId});throw Error("fixture provider receipt unavailable before host settlement");}
   const result=await service.settle(...settleArgs);
   if(mode==="settlementDrop" && isFixtureExecution(settleArgs[0]))throw new Error("fixture lost child settlement receipt");
   if(mode.startsWith("crash") && isFixtureExecution(settleArgs[0]) && ++settledChildren===(["crashTwoNodes","crashMixed"].includes(mode)?2:1)){expect(await stopExecution!(settleArgs[0])).toBe(true);releaseSettlements();}
   return result;
  },async fail(...failureArgs){const result=await service.fail(...failureArgs);if(isFixtureExecution(failureArgs[0]) && !droppedFailure){droppedFailure=true;throw new Error("fixture lost failure receipt");}return result;}};
 }):undefined;
 hooksSpy=mode==="crashMixed"?vi.spyOn(hooksModule,"createExecutionChatHooksService").mockImplementation((...args)=>{
  const service=realHooks(...args);return {...service,async settle(...input){const result=await service.settle(...input);if(isFixtureExecution(input[0]) && ++settledChildren===2){expect(await stopExecution!(input[0])).toBe(true);releaseSettlements();}return result;}};
 }):undefined;
 host=createHost();
  draining=host.drainOnce();
  if(mode==="cancel"){
   await vi.waitFor(()=>expect(childOpened).toBe(true),{timeout:180000});
   await createPersistentTaskService(db).command(ctx,{taskIds:[submission.executionTaskId],command:"cancel",idempotencyKey:"cancel"});
  }
  await draining;
  if(mode.startsWith("crash")){
   const [interrupted]=await db.select().from(executionTasks).where(eq(executionTasks.id,submission.executionTaskId));
   const before=await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,submission.executionTaskId));
   expect(interrupted?.status).toBe(mode==="crashUnknownChild"?"unknown_result":"running");
   expect(before.find(call=>call.kind==="tool")).toMatchObject({status:mode==="crashUnknownChild"?"unknown":"started"});
   expect(before.find(call=>call.parentCallId)).toMatchObject(mode==="crashUnknownChild"?{status:"started",providerResult:null,totalTokens:null}:{status:"settled",totalTokens:7});
   expect(requests).toHaveLength(["crashTwoNodes","crashMixed"].includes(mode)?3:2);
   if(mode==="crashMixed")mixedConfirmedModelFacts=before.filter(call=>call.kind==="model" && call.status==="settled").map(call=>({id:call.id,operationKey:call.operationKey,parentCallId:call.parentCallId,status:call.status,totalTokens:call.totalTokens}));
   recovered=true;await host.stop();failureSpy?.mockRestore();supervisorSpy?.mockRestore();hooksSpy?.mockRestore();
   if(mode==="crashCancel")await createPersistentTaskService(db,{now}).command(ctx,{taskIds:[submission.executionTaskId],command:"cancel",idempotencyKey:"cancel-crashed"});
   if(mode==="crashPauseResume")await createPersistentTaskService(db,{now}).command(ctx,{taskIds:[submission.executionTaskId],command:"pause",idempotencyKey:"pause-crashed"});
   if(mode==="crashDeadline"){expect(interrupted!.deadlineAt).toBeNull();expect(interrupted!.executionBudget).toMatchObject({policy:"continuous",deadlineMs:null});}
   if(mode==="crashUnknownChild"){expect(interrupted!.leaseExpiresAt).toBeNull();}else clockOffset=Date.parse(interrupted!.leaseExpiresAt!)-Date.now()+1;
   host=createHost();draining=host.drainOnce();await draining;
   if(mode==="crashPauseResume"){
    const [paused]=await db.select().from(executionTasks).where(eq(executionTasks.id,submission.executionTaskId));
    expect(paused?.status).toBe("paused");expect(requests).toHaveLength(2);
    await createPersistentTaskService(db,{now}).command(ctx,{taskIds:[submission.executionTaskId],command:"resume",idempotencyKey:"resume-completion"});
    draining=host.drainOnce();await draining;
   }
  }
  if(mode.startsWith("reject")){
   const [stopped]=await db.select().from(executionTasks).where(eq(executionTasks.id,submission.executionTaskId));
   expect(stopped?.status).toBe(mode.startsWith("reject401")?"waiting_user":mode.startsWith("reject400")?"failed":"retry_wait");
   const before=await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,submission.executionTaskId));
   expect(before.find(call=>call.kind==="tool")).toMatchObject({status:"started"});
   expect(before.find(call=>call.parentCallId)).toMatchObject({status:mode.startsWith("reject429")?"superseded":"rejected"});
   if(mode==="reject401" || mode.startsWith("reject400")){expect(requests).toHaveLength(2);return;}
   await host.stop();host=createHost();
   if(mode==="reject401resume")await createPersistentTaskService(db).command(ctx,{taskIds:[submission.executionTaskId],command:"resume",idempotencyKey:"configured"});
   else await vi.waitFor(()=>expect(Date.parse(stopped!.retryAt!)).toBeLessThanOrEqual(Date.now()),{timeout:180000});
   draining=host.drainOnce();await draining;
  }
  const [task]=await db.select().from(executionTasks).where(eq(executionTasks.id,submission.executionTaskId));
  if(["crashUnknownChild","crashCancel"].includes(mode)){
   expect(task?.status).toBe(mode==="crashUnknownChild"?"unknown_result":"cancelled");
   expect(requests).toHaveLength(2);return;
  }
  if(mode==="cancel"){
   expect(task?.status).toBe("cancelled");expect(requests).toHaveLength(2);
   const calls=await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,submission.executionTaskId));
   expect(calls.find(call=>call.parentCallId)).toMatchObject({status:"unknown",totalTokens:null});return;
  }
  expect(task?.status).toBe(mode==="badOutput" || mode==="diagnosisEmpty"?"partial":"succeeded");
  if(mode==="badOutput" || mode==="diagnosisEmpty"){
   const rows=await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,submission.executionTaskId));
   expect(rows.find(call=>call.kind==="tool")).toMatchObject({status:"settled"});
   expect(JSON.stringify(rows.find(call=>call.kind==="tool")?.resultText)).not.toContain("真实选题卡");
   // 原no_evidence字面预期保在首轮；此受控生成端口的已确认回执始终是transient/可恢复，不改生产码或假造已交付候选。
   const receipt=JSON.parse(rows.find(call=>call.kind==="tool")!.resultText!);
   expect(receipt).toMatchObject({schemaVersion:1,kind:"tool",toolCallId:"node-0",output:{status:"error",summary:"模型未返回符合要求的候选，继续当前任务",evidence:[],error:{code:"transient",retryable:true,recovery:"在当前 Agent loop 中调整生成策略并继续原任务"},continuation:null,sideEffect:"none"}});
   expect(receipt.output).not.toHaveProperty("data");
   expect(JSON.stringify(requests.at(-1)?.messages)).toContain("transient");
   expect(JSON.stringify(requests.at(-1)?.messages)).toContain("在当前 Agent loop 中调整生成策略并继续原任务");
   expect(JSON.stringify(requests.at(-1)?.messages)).not.toContain("真实选题卡");
   const expectedModels=mode==="badOutput"?5:3,expectedChildren=mode==="badOutput"?3:1;
   expect(requests).toHaveLength(expectedModels);expect(rows.filter(call=>call.kind==="model")).toHaveLength(expectedModels);
   expect(rows.filter(call=>call.parentCallId)).toHaveLength(expectedChildren);
   expect(rows.filter(call=>call.parentCallId).every(call=>call.parentCallId===rows.find(call=>call.kind==="tool")!.id && call.status==="settled" && call.totalTokens===7)).toBe(true);
   expect(rows.filter(call=>call.kind==="model" && !call.parentCallId)).toHaveLength(2);
   expect(rows.reduce((sum,call)=>sum+(call.totalTokens??0),0)).toBe(mode==="badOutput"?31:17);
   expect(task).toMatchObject({id:submission.executionTaskId,executionBudget:originalFrozenTask!.executionBudget,deadlineAt:originalFrozenTask!.deadlineAt});
   expect(task!.payload).toMatchObject({toolFailureReceiptVersion:1});
   const results=await db.select().from(aiTaskResults).where(eq(aiTaskResults.aiTaskId,submission.taskId));
   expect(results).toHaveLength(1);expect(results[0]).toMatchObject({resultType:"conversation_reply",artifactId:null,knowledgeItemId:null,assetId:null,resultData:{stopReason:"stop",actualEngine:"pi",completeness:"partial"}});
   const [business]=await db.select().from(aiTasks).where(eq(aiTasks.id,submission.taskId));expect(business!.status).toBe("partial");
   const messages=await db.select().from(aiMessages).where(eq(aiMessages.conversationId,conversation.id));
   expect(messages.find(message=>message.role==="assistant")!.modelMetadata).toMatchObject({chatTaskId:submission.taskId,completeness:"partial",stopReason:"stop"});
   expect(JSON.stringify(messages.find(message=>message.role==="assistant")!.parts)).toContain("本次部分完成");
   expect(JSON.stringify(messages.find(message=>message.role==="assistant")!.parts)).toContain("在当前 Agent loop 中调整生成策略并继续原任务");return;
  }
  const count=mode==="crashMixed"?6:mode==="crashTwoNodes"?6:mode==="crashFallback" || mode.startsWith("reject")?4:3;
  expect(requests).toHaveLength(count);
  expect(requests.filter(request=>!Array.isArray(request.tools)||(request.tools as Array<{function?:{name?:string}}>).every(tool=>tool.function?.name!==name.replaceAll(".","_"))).some(request=>JSON.stringify(request.messages).includes("真实主题"))).toBe(true);
  if(mode==="crashMixed")expect(JSON.stringify(requests.at(-1)?.messages)).toContain("真实开场卡");
  expect(JSON.stringify(requests.at(-1)?.messages)).toContain("真实选题卡");
  const calls=await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,submission.executionTaskId));
  if(diagnosis) expect(JSON.parse(calls.find(call=>call.kind==="tool")!.resultText!).output.data).toMatchObject({kind:"calibration.diagnosis",diagnosis:{dimensions:[{key:"hook",score:4}]}});
  expect(calls.filter(call=>call.kind==="model")).toHaveLength(count);
  expect(calls.filter(call=>call.parentCallId)).toHaveLength(count-2);
  if(mode==="crashMixed"){
   expect(mixedConfirmedModelFacts).toHaveLength(3);
   for(const fact of mixedConfirmedModelFacts)expect(calls.filter(call=>call.id===fact.id)).toEqual([expect.objectContaining(fact)]);
   expect(calls.filter(call=>call.kind==="tool")).toHaveLength(2);
   expect(calls.filter(call=>call.parentCallId && call.operationKey.startsWith("structured:"))).toHaveLength(3);
   expect(calls.filter(call=>call.parentCallId && call.operationKey.startsWith("hooks:"))).toHaveLength(1);
   expect(calls.filter(call=>call.kind==="model" && !call.parentCallId)).toHaveLength(2);
   expect(task).toMatchObject({id:submission.executionTaskId,executionBudget:originalFrozenTask!.executionBudget,deadlineAt:originalFrozenTask!.deadlineAt});
  }
  if(mode.startsWith("reject")){
   const children=calls.filter(call=>call.parentCallId).sort((a,b)=>a.sequence-b.sequence);
   expect(children[1]).toMatchObject({retryOfCallId:children[0]!.id,operationKey:children[0]!.operationKey,parentCallId:children[0]!.parentCallId});
   expect(calls.filter(call=>!call.parentCallId && call.kind==="model")).toHaveLength(2);
  }
  expect(calls.reduce((sum,call)=>sum+(call.totalTokens??0),0)).toBe(mode==="crashMixed"?38:mode==="crashTwoNodes"?38:mode==="crashFallback"?24:17);
  const messages=await db.select().from(aiMessages).where(eq(aiMessages.conversationId,conversation.id));
  expect(JSON.stringify(messages.find(message=>message.role==="assistant")?.parts)).toContain("真实选题卡");
  const page=await createExecutionStreamService(db).read(ctx,submission.executionTaskId,{});
  expect(page.events.filter(event=>event.chunk.type==="text-delta").map(event=>event.chunk.delta).join("")).toBe("候选已准备好");
 }finally{
  releaseSettlements();hooksSpy?.mockRestore();supervisorSpy?.mockRestore();failureSpy?.mockRestore();
  // 两条自有资源关闭独立启动；任何stop/HTTP拒绝不能跳过另一条，也不能跳过本轮draining。
  const cleanupResults:PromiseSettledResult<unknown>[]=await Promise.allSettled([host?.stop(),(async()=>{if(server){server.closeAllConnections();if(server.listening)await new Promise<void>(done=>server!.close(()=>done()));}})()]);
  if(draining)cleanupResults.push(...await Promise.allSettled([draining]));
  try{if(diagnosticTaskId){const [task]=await db.select().from(executionTasks).where(eq(executionTasks.id,diagnosticTaskId));const calls=await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,diagnosticTaskId));const receiptObservation=["badOutput","diagnosisEmpty"].includes(mode)?{toolResultTexts:calls.filter(call=>call.kind==="tool").map(call=>({callId:call.id,status:call.status,resultText:call.resultText})),formalResults:await db.select().from(aiTaskResults).where(eq(aiTaskResults.aiTaskId,String((task?.payload as {aiTaskId?:string}|undefined)?.aiTaskId))),businessStatus:(await db.select({status:aiTasks.status}).from(aiTasks).where(eq(aiTasks.id,String((task?.payload as {aiTaskId?:string}|undefined)?.aiTaskId))))[0]?.status}:undefined;console.info('T1246_B045_B046_TRACE',JSON.stringify({mode,executionTaskId:diagnosticTaskId,fixtureTrace,...(receiptObservation?{receiptObservation}:{}),...(["badOutput","diagnosisEmpty","crashMixed"].includes(mode)?{lastHttpMessages:requests.at(-1)?.messages}:{}),status:task?.status,deadlineAt:task?.deadlineAt,lastErrorCode:task?.lastErrorCode,calls:calls.map(call=>({id:call.id,kind:call.kind,parentCallId:call.parentCallId,operationKey:call.operationKey,status:call.status,totalTokens:call.totalTokens,createdAt:call.createdAt,updatedAt:call.updatedAt,startedAttempt:call.startedAttempt}))}));}}catch(error){cleanupResults.push({status:"rejected",reason:error});}
  const rejected=cleanupResults.filter((item):item is PromiseRejectedResult=>item.status==="rejected");
  if(rejected.length)throw new AggregateError(rejected.map(item=>item.reason),"生成夹具清理失败，原stop/drain/HTTP/trace错误均保留");
 }
},540000);

// 新增独立有限生成期限链；它不伪装成chat.submit有限参数，也不改任何原continuous任务。
it("真实enqueue从出生冻结有限结构化生成期限，原Worker到期不续期/重发/写正式候选",async()=>{
 const ctxBase={userId:"finite-generation-u",accountId:`finite-generation-a-${++seq}`,requestId:"finite-generation",source:"user" as const};
 let clock=Date.now();const now=()=>new Date(clock).toISOString(),nextId=(prefix:string)=>`${prefix}-finite-${++seq}`;
 const accounts=createPlatformAccountService({db,now,nextId:prefix=>prefix==="acct"?ctxBase.accountId:nextId(prefix)});
 const account=await accounts.createAccount(ctxBase,{platform:"douyin",accountHandle:ctxBase.accountId,idempotencyKey:`finite-account-${ctxBase.accountId}`});
 const groups=createAccountGroupService({db,now,nextId});const membership=await groups.forAccount(ctxBase,account.id),group=await groups.get(ctxBase,membership.groupId);
 const ctx={...ctxBase,groupId:group.id,groupVersion:group.version,membershipVersion:membership.version};
 expect(group.members).toContainEqual(expect.objectContaining({accountId:account.id,leftAt:null}));
 const forbidden=async():Promise<never>=>{throw Error("到期链不得写正式候选或业务产物");};
 const ai=createAiService({db,now,nextId,artifacts:{createVersion:forbidden},knowledge:{createKnowledge:forbidden},candidate:{createFromAIResult:forbidden,enrichCard:forbidden},learnings:{createLearning:forbidden},publishing:{createPublicationFromDraft:forbidden},materialLinks:{link:forbidden},positioning:{upsertProfile:forbidden,createStatementVersion:forbidden},calibration:{createDraftPrediction:forbidden}});
 const business=await ai.createTask(ctx,{taskType:"topic.enrich",inputData:{title:"有限期限原主题"},attemptId:`finite-original-attempt-${ctx.accountId}`});
 expect(await ai.getTask(ctx,business.id)).toMatchObject({id:business.id,userId:ctx.userId,groupId:ctx.groupId,status:"queued"});
 expect(await ai.getTaskExecutionRuntime(ctx,business.id)).toMatchObject({owner:{userId:ctx.userId,accountId:ctx.accountId,groupId:ctx.groupId,groupVersion:ctx.groupVersion,membershipVersion:ctx.membershipVersion}});
 const skillId="topic.enrich",operationKey=`finite:${business.id}`,budget={maxCalls:4,maxTokens:100000,deadlineMs:180000};
 const modelInput={kind:"model.structured",operationKey,capability:skillId,skillId,maxOutputTokens:128,facets:{title:"有限期限原主题"},skillSnapshot:{snapshotVersion:1,userId:ctx.userId,accountId:ctx.accountId,groupId:ctx.groupId,groupVersion:ctx.groupVersion,membershipVersion:ctx.membershipVersion,resolvedAt:now(),platformPolicyVersion:"1",platformPolicy:"只产候选",skills:[{skillId,baseVersion:"1",overlayRevision:null,overlayVersion:null,effective:{methodSystem:"原策略",template:"{{title}}",tools:[],requiredFacets:["title"],contextRequirements:[],outputSchema:{type:"object",properties:{oneLiner:{type:"string"}},required:["oneLiner"],additionalProperties:false},completionPolicy:null,completionPolicyAdapter:null}}]}};
 const tasks=createPersistentTaskService(db,{now,nextId}),task=await tasks.enqueue(ctx,{kind:"ai_task",ownerType:"ai_task",ownerId:business.id,idempotencyKey:`finite:${business.id}`,executionBudget:budget,payload:{modelInput}});
 const [frozen]=await db.select().from(executionTasks).where(eq(executionTasks.id,task.id));
 expect(frozen).toMatchObject({ownerId:business.id,userId:ctx.userId,accountId:ctx.accountId,groupId:ctx.groupId,executionBudget:budget});
 expect(Date.parse(frozen!.deadlineAt!)-Date.parse(frozen!.createdAt)).toBe(180000);
 // 实际业务owner存在；不伪造executionTaskId映射。此为受控generic生成期限验收，不能冒AI业务成功链。
 const [ownerBefore]=await db.select().from(aiTasks).where(eq(aiTasks.id,business.id));expect(ownerBefore!.executionTaskId).toBeNull();
 let httpCalls=0,disconnected=0;const projectCandidate=vi.fn(()=>{throw Error("到期不得投影正式候选");});
 const server=createServer(async(req,res)=>{for await(const _ of req){};httpCalls++;res.writeHead(200,{"content-type":"application/json"});res.write('{"id":');res.on("close",()=>{disconnected++;});});
 await new Promise<void>(done=>server.listen(0,"127.0.0.1",done));
 const host=createModelWorkerDispatcher(db,{now,entryPath,workerId:`finite-worker-${business.id}`,budget,modelConcurrency:1,pollMs:100,projectCandidate,resolveModelCredential:async(context,capability,owner)=>{
  expect(context).toMatchObject({userId:ctx.userId,accountId:ctx.accountId,groupId:ctx.groupId});expect(capability).toBe(skillId);expect(owner).toEqual({aiTaskId:business.id,executionTaskId:task.id});return {apiFormat:"openai_chat",baseUrl:`http://127.0.0.1:${(server.address() as {port:number}).port}/v1`,model:"fixture",token:"finite-local-fixture"};
 }});
 let draining:Promise<number>|undefined;
 try{
  draining=host.drainOnce();await vi.waitFor(()=>expect(httpCalls).toBe(1),{timeout:180000});
  const before=await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,task.id));expect(before).toHaveLength(1);
  expect(before[0]).toMatchObject({kind:"model",status:"started",operationKey:`${operationKey}/model/1`,totalTokens:null});
  clock=Date.parse(frozen!.deadlineAt!)+1; // 仅测试注入clock越过已冻结期限；不写SQL预算/期限、不修改原task。
  await draining;await vi.waitFor(()=>expect(disconnected).toBe(1),{timeout:180000});
  const [after]=await db.select().from(executionTasks).where(eq(executionTasks.id,task.id));
  expect(after).toMatchObject({id:task.id,status:"failed",lastErrorCode:"EXECUTION_DEADLINE",deadlineAt:frozen!.deadlineAt,executionBudget:budget});expect((after!.payload as {modelInput:unknown}).modelInput).toEqual(modelInput);
  const calls=await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,task.id));expect(calls).toHaveLength(1);expect(calls[0]).toMatchObject({id:before[0]!.id,operationKey:before[0]!.operationKey,status:"unknown",totalTokens:null,providerResult:null});
  expect(await host.drainOnce()).toBe(0);expect(httpCalls).toBe(1);expect(projectCandidate).not.toHaveBeenCalled();expect(await db.select().from(aiTaskResults).where(eq(aiTaskResults.aiTaskId,business.id))).toEqual([]);
  const [ownerAfter]=await db.select().from(aiTasks).where(eq(aiTasks.id,business.id));expect(ownerAfter!.executionTaskId).toBeNull();expect(ownerAfter!.status).toBe(ownerBefore!.status);
 }finally{
  const cleanupResults:PromiseSettledResult<unknown>[]=await Promise.allSettled([host.stop(),(async()=>{server.closeAllConnections();if(server.listening)await new Promise<void>(done=>server.close(()=>done()));})()]);
  if(draining)cleanupResults.push(...await Promise.allSettled([draining]));
  const rejected=cleanupResults.filter((item):item is PromiseRejectedResult=>item.status==="rejected");
  if(rejected.length)throw new AggregateError(rejected.map(item=>item.reason),"有限生成夹具清理失败，原stop/drain/HTTP错误均保留");
 }
},540000);
