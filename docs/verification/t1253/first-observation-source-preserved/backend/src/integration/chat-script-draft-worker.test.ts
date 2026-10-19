import {createAiService,type ServiceDeps} from "../modules/ai/ai.service";
import {createScriptDraftTargetService} from "../modules/artifacts/script-draft-target.service";
import {buildChatTools,type ChatToolDeps} from "../modules/ai-runtime/chat-tools";
import {prepareChatToolDefinitions} from "../modules/ai-runtime/chat-tool-definitions";
import {createChatScriptDraftTaskHost} from "../modules/ai-runtime/chat-script-draft-tool-host";
import {createChatHostContextReader} from "../modules/ai/chat-host-context.service";
import * as supervisorModule from "../modules/execution/worker-supervisor";
import * as hooksModule from "../modules/execution/execution-chat-script-draft.service";
import {createServer} from "node:http";
import {execFileSync} from "node:child_process";
import {resolve} from "node:path";
import {beforeAll,afterAll,it,expect,vi} from "vitest";
import {createDb,executionTasks,executionCalls,aiMessages,projects,aiTasks,aiTaskResults,artifacts,and,eq,type Db} from "@creatoros/backend";
import {createAiRepository} from "../modules/ai/ai.repository";
import type {ChatHostContext} from "../modules/ai/chat-host-context";
import {createChatTurnSubmissionService} from "../modules/ai/chat-turn-submission.service";
import {createChatWorkerDispatcher} from "../modules/execution/model-worker-dispatcher";
import {createExecutionStreamService} from "../modules/execution/execution-stream.service";
import {createPersistentTaskService} from "../modules/execution/persistent-task.service";
let db:Db,close:()=>Promise<void>,seq=0;
async function observeUnknownCase(stage:string,executionTaskId:string,aiTaskId:string,httpTrace:Array<Record<string,unknown>>){
 const [task]=await db.select().from(executionTasks).where(eq(executionTasks.id,executionTaskId));
 const calls=await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,executionTaskId));
 const formal=await db.select({id:aiTaskResults.id,resultType:aiTaskResults.resultType,assetId:aiTaskResults.assetId,artifactId:aiTaskResults.artifactId,knowledgeItemId:aiTaskResults.knowledgeItemId,resultData:aiTaskResults.resultData}).from(aiTaskResults).where(eq(aiTaskResults.aiTaskId,aiTaskId));
 const [business]=await db.select({id:aiTasks.id,status:aiTasks.status,executionTaskId:aiTasks.executionTaskId}).from(aiTasks).where(eq(aiTasks.id,aiTaskId));
 // 仅受控协议夹具实际归属/账本/HTTP形状观察；不记录credential/header/providerMetadata、不填缺失事实。
 console.info("T1253_UNKNOWN_OBSERVATION",JSON.stringify({stage,executionTaskId,aiTaskId,httpTrace,task:task?{id:task.id,userId:task.userId,accountId:task.accountId,groupId:task.groupId,status:task.status,executionBudget:task.executionBudget,createdAt:task.createdAt,deadlineAt:task.deadlineAt,leaseExpiresAt:task.leaseExpiresAt,retryAt:task.retryAt,lastErrorCode:task.lastErrorCode}:null,calls:calls.map(call=>({id:call.id,kind:call.kind,parentCallId:call.parentCallId,operationKey:call.operationKey,status:call.status,totalTokens:call.totalTokens,providerReceiptPresent:call.providerResult!==null,resultText:call.kind==="tool"?call.resultText:null,startedAttempt:call.startedAttempt,retryOfCallId:call.retryOfCallId,createdAt:call.createdAt,updatedAt:call.updatedAt})),formal,business:business??null}));
}

const entryPath=resolve("../ai-worker/dist/execution-worker.cjs");
beforeAll(async()=>{const f=await createDb();db=f.db;close=()=>f.client.close();execFileSync(process.execPath,[resolve("../ai-worker/scripts/build.mjs")],{stdio:"pipe",timeout:180000});},180000);
afterAll(async()=>close());
it.each(["generate","verbatim","unauthorized","reject429","crashAfterChild","crashUnknownChild","settlementDrop","completeDrop"])("真实 Worker 整稿授权与原子提交：%s",async(mode)=>{
 let clockOffset=0;
 const ctx={userId:"hooks-worker-u",accountId:`hooks-worker-a-${++seq}`,requestId:"test",source:"user" as const},now=()=>new Date(Date.now()+clockOffset).toISOString();
 const repo=createAiRepository(db,{userId:ctx.userId,accountId:ctx.accountId,now,nextId:(prefix:string)=>`${prefix}-${++seq}`});
 const projectId=`project-${++seq}`;
 await db.insert(projects).values({id:projectId,userId:ctx.userId,accountId:ctx.accountId,title:"整稿",creationMode:"manual",status:"active",currentStage:"script",startedAt:now(),createdAt:now(),updatedAt:now()});
 const ai=createAiService({db,now,nextId:(prefix:string)=>`${prefix}-${++seq}`,scriptDraftTargets:createScriptDraftTargetService({now,nextId:(prefix:string)=>`${prefix}-${++seq}`}),resolveTaskRuntimeData:async()=>({})} as unknown as ServiceDeps);
 const conversation=await repo.createConversation({title:"整稿",projectId,scope:"project"});
 const source=await repo.createMessage(conversation.id,{role:"user",content:"生成开场",attachments:[],modelMetadata:{}});
 const definitions=(await prepareChatToolDefinitions(buildChatTools(["script.draft"],{} as ChatToolDeps),{workerScriptDraft:true})).definitions;
 const body="这是第一句正文。\n完整结尾。";
 const hostContext:ChatHostContext={schemaVersion:1,chatContext:{surface:"topics",projectId,selection:{kind:"topic",ids:[],label:"缺省标题"}},mediaRoute:null,positioningScratch:false,trustedScriptSources:[{ref:"source",label:"原稿",text:body,truncated:false,sourceType:"message",sourceId:source.id}],scriptDraftContext:{latestUserInstruction:"把这份完整稿子保真写入，先给候选"},skillSnapshot:{snapshotVersion:1,userId:ctx.userId,accountId:ctx.accountId,resolvedAt:"fixed",platformPolicyVersion:"1",platformPolicy:"候选",skills:[{skillId:"chatbox.topic",baseVersion:"1",overlayRevision:null,overlayVersion:null,effective:{methodSystem:"策略",template:"",tools:["script.draft"],requiredFacets:[],contextRequirements:[],outputSchema:null,completionPolicy:null,completionPolicyAdapter:null}}]}};
 const submission=await createChatTurnSubmissionService(db,{now,assertProject:async(owner,id)=>{const [project]=await db.select().from(projects).where(and(eq(projects.id,id),eq(projects.userId,owner.userId),eq(projects.accountId,owner.accountId!)));if(!project)throw new Error("项目归属不符");},assemble:async()=>({capability:"copilot.assist",system:"生成开场候选",messages:[{role:"user",content:"生成开场"}],maxSteps:6,maxOutputTokens:2048,tools:definitions,hostContext})}).submit(ctx,{conversationId:conversation.id,sourceMessageId:source.id});
 const requests:Record<string,unknown>[]=[];
 const httpTrace:Array<Record<string,unknown>>=[];let fixturePhase="initial",draining:Promise<number>|undefined;
 let bodyFailed=false,originalBodyError:unknown;
 const server=createServer(async(req,res)=>{
  let body="";for await(const chunk of req)body+=chunk.toString();const input=JSON.parse(body);requests.push(input);
  if(mode==="crashUnknownChild")httpTrace.push({type:"http_request",ordinal:requests.length,phase:fixturePhase,at:new Date().toISOString(),rootRequest:Array.isArray(input.tools)&&input.tools.some((tool:{function?:{name?:string}})=>tool.function?.name==="script_draft"),stream:input.stream,toolNames:Array.isArray(input.tools)?input.tools.map((tool:{function?:{name?:string}})=>tool.function?.name):[],messageRoles:Array.isArray(input.messages)?input.messages.map((message:{role?:string;tool_call_id?:string})=>({role:message.role,toolCallId:message.tool_call_id})):[]});
  if(mode!=="generate" && (requests.length===2 || (mode.startsWith("reject") && requests.length===3))){
   if((mode.startsWith("reject")) && requests.length===2){res.writeHead(429,{"content-type":"application/json","retry-after":"1"});res.end(JSON.stringify({error:{message:"fixture rejected",type:"api_error"}}));return;}
if(mode==="crashUnknownChild"){httpTrace.push({type:"res_destroy",ordinal:requests.length,phase:fixturePhase,at:new Date().toISOString()});res.destroy();return;}
   const content=JSON.stringify({authorized:mode!=="unauthorized",startAnchor:null,endAnchor:null,reason:"仅交付原稿"});
   res.writeHead(200,{"content-type":"text/event-stream"});
   res.end([ {choices:[{index:0,delta:{role:"assistant",content},finish_reason:null}]}, {choices:[{index:0,delta:{},finish_reason:"stop"}],usage:{prompt_tokens:4,completion_tokens:3,total_tokens:7}} ].map(chunk=>`data: ${JSON.stringify({id:"child",object:"chat.completion.chunk",created:1,model:"fixture",...chunk})}\n\n`).join("")+"data: [DONE]\n\n");return;
  }
  const first=requests.length===1;
  const delta=first?{tool_calls:[{index:0,id:"hooks",type:"function",function:{name:"script_draft",arguments:JSON.stringify(mode==="generate"?{mode:"generate"}:{mode:"verbatim",sourceRef:"source"})}}]}:{content:"候选已准备好"};
  const chunks=[{choices:[{index:0,delta,finish_reason:null}]},{choices:[{index:0,delta:{},finish_reason:first?"tool_calls":"stop"}],usage:{prompt_tokens:2,completion_tokens:3,total_tokens:5}}];
  res.writeHead(200,{"content-type":"text/event-stream"});res.end(chunks.map(chunk=>`data: ${JSON.stringify({id:"root",object:"chat.completion.chunk",created:1,model:"fixture",...chunk})}\n\n`).join("")+"data: [DONE]\n\n");
 });
 await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
 const createHost=()=>createChatWorkerDispatcher(db,{now,entryPath,workerId:"hooks-host",budget:{maxCalls:10,maxTokens:100000,deadlineMs:300000},modelConcurrency:1,resolveTools:createChatScriptDraftTaskHost(createChatHostContextReader(db,{now}),{readCurrentScript:async()=>({projectId,artifactId:"current-artifact",currentVersionId:"current-v2",contentHash:"unused",fullText:"WASD移动、QQ回血，自动射击。"}),prepareDraft:(context,input)=>ai.prepareScriptDraftTaskCommit(context,input),wakeTask:async()=>{}}),resolveModelCredential:async()=>({apiFormat:"openai_chat",baseUrl:`http://127.0.0.1:${(server.address() as {port:number}).port}/v1`,model:"fixture",token:"fixture"})});
 let droppedFailure=false;
 const originalSupervisor=supervisorModule.createWorkerSupervisor;
 let stopExecution:ReturnType<typeof originalSupervisor>["stopExecutionTree"]|undefined;
 const supervisorSpy=(mode.startsWith("crash") || mode==="completeDrop")?vi.spyOn(supervisorModule,"createWorkerSupervisor").mockImplementation(options=>{
  const supervisor=originalSupervisor(options);stopExecution=ref=>supervisor.stopExecutionTree(ref);return supervisor;
 }):undefined;
 const originalFactory=hooksModule.createExecutionChatScriptDraftService;
 const failureSpy=(mode.endsWith("drop") || mode.startsWith("crash") || mode==="settlementDrop" || mode==="completeDrop")?vi.spyOn(hooksModule,"createExecutionChatScriptDraftService").mockImplementation((...args)=>{
  const service=originalFactory(...args);
  return {...service,async complete(...completeArgs){const result=await service.complete(...completeArgs);if(mode==="completeDrop")expect(await stopExecution!(completeArgs[0])).toBe(true);return result;},async settle(...settleArgs){
   const result=await service.settle(...settleArgs);
   if(mode==="settlementDrop")throw new Error("fixture lost child settlement receipt");
   if(mode.startsWith("crash")){expect(await stopExecution!(settleArgs[0])).toBe(true);}
   return result;
  },async fail(...failureArgs){const result=await service.fail(...failureArgs);if(!droppedFailure){droppedFailure=true;throw new Error("fixture lost failure receipt");}return result;}};
 }):undefined;
 let host=createHost();
 try{
  draining=host.drainOnce();
  await draining;
  if(mode.startsWith("crash") || mode==="completeDrop"){
   const [interrupted]=await db.select().from(executionTasks).where(eq(executionTasks.id,submission.executionTaskId));
   const before=await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,submission.executionTaskId));
   if(mode==="crashUnknownChild")await observeUnknownCase("before-recovery",submission.executionTaskId,submission.taskId,httpTrace);
   expect(interrupted?.status).toBe("running");
   expect(before.find(call=>call.kind==="tool")).toMatchObject({status:mode==="completeDrop"?"settled":"started"});
   expect(before.find(call=>call.parentCallId)).toMatchObject(mode==="crashUnknownChild"?{status:"unknown",totalTokens:null}:{status:"settled",totalTokens:7});
   expect(requests).toHaveLength(2);
   await host.stop();failureSpy?.mockRestore();supervisorSpy?.mockRestore();
   clockOffset=Date.parse(interrupted!.leaseExpiresAt!)-Date.now()+1;
   fixturePhase="resumed";host=createHost();draining=host.drainOnce();await draining;
  }
  if(mode.startsWith("reject")){
   const [stopped]=await db.select().from(executionTasks).where(eq(executionTasks.id,submission.executionTaskId));
   expect(stopped?.status).toBe("retry_wait");
   const before=await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,submission.executionTaskId));
   expect(before.find(call=>call.kind==="tool")).toMatchObject({status:"started"});
   expect(before.find(call=>call.parentCallId)).toMatchObject({status:"rejected"});
   await host.stop();host=createHost();
   await vi.waitFor(()=>expect(Date.parse(stopped!.retryAt!)).toBeLessThanOrEqual(Date.now()),{timeout:180000});
   draining=host.drainOnce();await draining;
  }
  const [task]=await db.select().from(executionTasks).where(eq(executionTasks.id,submission.executionTaskId));
  if(mode==="crashUnknownChild"){
   expect(task?.status).toBe("unknown_result");expect(requests).toHaveLength(2);
   expect((await db.select().from(aiTasks).where(eq(aiTasks.projectId,projectId))).filter(task=>task.taskType==="script.draft")).toHaveLength(0);
   return;
  }
  expect(task?.status,JSON.stringify({code:task?.lastErrorCode,deadline:task?.deadlineAt,now:now()})).toBe(mode==="unauthorized"?"partial":"succeeded");expect(requests).toHaveLength(mode==="generate"?2:mode.startsWith("reject")?4:3);
  const calls=await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,submission.executionTaskId));
  expect(calls.filter(call=>call.parentCallId)).toHaveLength(mode==="generate"?0:mode.startsWith("reject")?2:1);
  const children=(await db.select().from(aiTasks).where(eq(aiTasks.projectId,projectId))).filter(task=>task.taskType==="script.draft");
  expect(children).toHaveLength(mode==="unauthorized"?0:1);
  const targets=await db.select().from(artifacts).where(eq(artifacts.projectId,projectId));
  expect(targets).toHaveLength(mode==="unauthorized"?0:1);
  if(mode==="generate")expect(children[0]!.inputData).toMatchObject({topic:"缺省标题",instruction:expect.stringContaining("先给候选"),sourceSnapshots:[expect.objectContaining({body:"WASD移动、QQ回血，自动射击。",sourceId:"current-artifact:current-v2"})]});
  else if(mode!=="unauthorized")expect(children[0]!.inputData).toMatchObject({draftMode:"verbatim",verbatimSourceText:body,verbatimSourceLength:body.length});
  if(mode!=="generate")expect(JSON.stringify(requests[1]?.messages)).toContain(body.replace(/\n/g,"\\n"));
  const messages=await db.select().from(aiMessages).where(eq(aiMessages.conversationId,conversation.id));
  expect(JSON.stringify(messages.find(message=>message.role==="assistant")?.parts)).toContain("script.draft");
  const page=await createExecutionStreamService(db).read(ctx,submission.executionTaskId,{});
  expect(page.events.filter(event=>event.chunk.type==="text-delta").map(event=>event.chunk.delta).join("")).toBe("候选已准备好");
 }catch(error){bodyFailed=true;originalBodyError=error;throw error;}finally{
  supervisorSpy?.mockRestore();failureSpy?.mockRestore();
  const cleanup:PromiseSettledResult<unknown>[]=await Promise.allSettled([host.stop(),(async()=>{server.closeAllConnections();if(server.listening)await new Promise<void>(resolve=>server.close(()=>resolve()));})()]);
  if(draining)cleanup.push(...await Promise.allSettled([draining]));
  if(mode==="crashUnknownChild"){try{await observeUnknownCase("after-cleanup",submission.executionTaskId,submission.taskId,httpTrace);}catch(error){cleanup.push({status:"rejected",reason:error});}}
  const rejected=cleanup.filter((item):item is PromiseRejectedResult=>item.status==="rejected");if(rejected.length)throw new AggregateError([...(bodyFailed?[originalBodyError]:[]),...rejected.map(item=>item.reason)],"原draft观察夹具stop/drain/HTTP/日志错误均保留");
 }
},540000);
