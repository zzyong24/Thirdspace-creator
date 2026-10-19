import {buildChatTools,type ChatToolDeps} from "../modules/ai-runtime/chat-tools";
import {prepareChatToolDefinitions} from "../modules/ai-runtime/chat-tool-definitions";
import {createChatHooksTaskToolHost} from "../modules/ai-runtime/chat-hooks-tool-host";
import {createChatHostContextReader} from "../modules/ai/chat-host-context.service";
import * as supervisorModule from "../modules/execution/worker-supervisor";
import * as hooksModule from "../modules/execution/execution-chat-hooks.service";
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
const originalFactory=hooksModule.createExecutionChatHooksService;
let db:Db,close:()=>Promise<void>,seq=0;
const entryPath=resolve("../ai-worker/dist/execution-worker.cjs");
beforeAll(async()=>{const f=await createDb();db=f.db;close=()=>f.client.close();execFileSync(process.execPath,[resolve("../ai-worker/scripts/build.mjs")],{stdio:"pipe",timeout:180000});},180000);
afterAll(async()=>close(),180000);
it.each(["success","cancel","reject401","reject401resume","reject429","reject429drop","reject400drop","crashAfterChild","crashUnknownChild","crashCancel","crashDeadline","crashPauseResume","settlementDrop"])("同一真实Worker内部开场生成：%s",async(mode)=>{
 let server:ReturnType<typeof createServer>|undefined,host:ReturnType<typeof createChatWorkerDispatcher>|undefined;
 let supervisorSpy:{mockRestore():void}|undefined,failureSpy:{mockRestore():void}|undefined,hooksSpy:{mockRestore():void}|undefined;
 let releaseSettlements=()=>{};
 try{
 let clockOffset=0;
 const ctx={userId:"hooks-worker-u",accountId:`hooks-worker-a-${++seq}`,requestId:"test",source:"user" as const},now=()=>new Date(Date.now()+clockOffset).toISOString();
 const repo=createAiRepository(db,{userId:ctx.userId,accountId:ctx.accountId,now,nextId:prefix=>`${prefix}-${++seq}`});
 const conversation=await repo.createConversation({title:"开场",projectId:null,scope:"global"});
 const source=await repo.createMessage(conversation.id,{role:"user",content:"生成开场",attachments:[],modelMetadata:{}});
 const definitions=(await prepareChatToolDefinitions(buildChatTools(["script.hooks"],{} as ChatToolDeps),{workerScriptHooks:true})).definitions;
 const hostContext:ChatHostContext={schemaVersion:1,chatContext:{surface:"topics"},mediaRoute:null,positioningScratch:false,trustedScriptSources:[],scriptHooksContext:{selectionTitle:"真实主题",positioningBrief:"原定位",projectBriefHard:"",userMaterialHardBrief:"",userMaterialRefBrief:"",knowledgeBrief:""},scriptHooksGeneration:{version:1,maxOutputTokens:2048},skillSnapshot:{snapshotVersion:1,userId:ctx.userId,accountId:ctx.accountId,resolvedAt:"fixed",platformPolicyVersion:"1",platformPolicy:"候选",skills:[{skillId:"chatbox.topic",baseVersion:"1",overlayRevision:null,overlayVersion:null,effective:{methodSystem:"策略",template:"",tools:["script.hooks"],requiredFacets:[],contextRequirements:[],outputSchema:null,completionPolicy:null,completionPolicyAdapter:null}}]}};
 const submission=await createChatTurnSubmissionService(db,{now,assemble:async()=>({capability:"copilot.assist",system:"生成开场候选",messages:[{role:"user",content:"生成开场"}],maxSteps:6,maxOutputTokens:128,tools:definitions,hostContext})}).submit(ctx,{conversationId:conversation.id,sourceMessageId:source.id});
 const requests:Record<string,unknown>[]=[];
 let childOpened=false;
 server=createServer(async(req,res)=>{
  let body="";for await(const chunk of req)body+=chunk.toString();const input=JSON.parse(body);requests.push(input);
  const rootRequest=Array.isArray(input.tools)&&input.tools.some((tool:{function?:{name?:string}})=>tool.function?.name==="script_hooks");
  if(!rootRequest){childOpened=true;
   if((mode.startsWith("reject")) && requests.length===2){res.writeHead(mode.startsWith("reject401")?401:mode.startsWith("reject400")?400:429,{"content-type":"application/json","retry-after":"1"});res.end(JSON.stringify({error:{message:"fixture rejected",type:"api_error"}}));return;}
if(!input.stream)res.writeHead(200,{"content-type":"application/json"});if(mode==="crashUnknownChild"){res.destroy();return;}if(mode==="cancel"){res.write('{"id":');return;}const childResponse={id:"child",object:"chat.completion",created:1,model:"fixture",choices:[{index:0,message:{role:"assistant",content:'[{"text":"真实开场","angle":"场景"}]'},finish_reason:"stop"}],usage:{prompt_tokens:4,completion_tokens:3,total_tokens:7}};if(input.stream){res.writeHead(200,{"content-type":"text/event-stream"});res.end([{...childResponse,object:"chat.completion.chunk",choices:childResponse.choices.map(choice=>({index:choice.index,delta:choice.message,finish_reason:null}))},{...childResponse,object:"chat.completion.chunk",choices:childResponse.choices.map(choice=>({index:choice.index,delta:{},finish_reason:choice.finish_reason}))}].map(chunk=>`data: ${JSON.stringify(chunk)}\n\n`).join("")+"data: [DONE]\n\n");}else res.end(JSON.stringify(childResponse));return;}
  const first=requests.length===1;
  const delta=first?{tool_calls:[{index:0,id:"hooks",type:"function",function:{name:"script_hooks",arguments:"{}"}}]}:{content:"候选已准备好"};
  const chunks=[{choices:[{index:0,delta,finish_reason:null}]},{choices:[{index:0,delta:{},finish_reason:first?"tool_calls":"stop"}],usage:{prompt_tokens:2,completion_tokens:3,total_tokens:5}}];
  res.writeHead(200,{"content-type":"text/event-stream"});res.end(chunks.map(chunk=>`data: ${JSON.stringify({id:"root",object:"chat.completion.chunk",created:1,model:"fixture",...chunk})}\n\n`).join("")+"data: [DONE]\n\n");
 });
 await new Promise<void>(resolve=>server!.listen(0,"127.0.0.1",resolve));
 const createHost=()=>createChatWorkerDispatcher(db,{now,entryPath,workerId:"hooks-host",budget:{maxCalls:10,maxTokens:100000,deadlineMs:mode.startsWith("crash")?300000:180000},modelConcurrency:1,resolveTools:createChatHooksTaskToolHost(createChatHostContextReader(db,{now})),resolveModelCredential:async()=>({apiFormat:"openai_chat",baseUrl:`http://127.0.0.1:${(server!.address() as {port:number}).port}/v1`,model:"fixture",token:mode==="reject401resume"?`fixture-${requests.length}`:"fixture"})});
 let droppedFailure=false;
 let stopExecution:ReturnType<typeof originalSupervisor>["stopExecutionTree"]|undefined;
 supervisorSpy=mode.startsWith("crash")?vi.spyOn(supervisorModule,"createWorkerSupervisor").mockImplementation(options=>{
  const supervisor=originalSupervisor(options);stopExecution=ref=>supervisor.stopExecutionTree(ref);return supervisor;
 }):undefined;
 failureSpy=(mode.endsWith("drop") || mode.startsWith("crash") || mode==="settlementDrop")?vi.spyOn(hooksModule,"createExecutionChatHooksService").mockImplementation((...args)=>{
  const service=originalFactory(...args);
  return {...service,async settle(...settleArgs){
   const result=await service.settle(...settleArgs);
   if(mode==="settlementDrop")throw new Error("fixture lost child settlement receipt");
   if(mode.startsWith("crash")){expect(await stopExecution!(settleArgs[0])).toBe(true);}
   return result;
  },async fail(...failureArgs){const result=await service.fail(...failureArgs);if(!droppedFailure){droppedFailure=true;throw new Error("fixture lost failure receipt");}return result;}};
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
   expect(requests).toHaveLength(2);
   await host.stop();failureSpy?.mockRestore();supervisorSpy?.mockRestore();
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
  expect(task?.status).toBe("succeeded");expect(requests).toHaveLength(mode.startsWith("reject")?4:3);
  expect(JSON.stringify(requests[1]?.messages)).toContain("真实主题");
  expect(JSON.stringify(requests.at(-1)?.messages)).toContain("真实开场");
  const calls=await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,submission.executionTaskId));
  expect(calls.filter(call=>call.kind==="model")).toHaveLength(mode.startsWith("reject")?4:3);
  expect(calls.filter(call=>call.parentCallId)).toHaveLength(mode.startsWith("reject")?2:1);
  if(mode.startsWith("reject")){
   const children=calls.filter(call=>call.parentCallId).sort((a,b)=>a.sequence-b.sequence);
   expect(children[1]).toMatchObject({retryOfCallId:children[0]!.id,operationKey:children[0]!.operationKey,parentCallId:children[0]!.parentCallId});
   expect(calls.filter(call=>!call.parentCallId && call.kind==="model")).toHaveLength(2);
  }
  expect(calls.reduce((sum,call)=>sum+(call.totalTokens??0),0)).toBe(17);
  const messages=await db.select().from(aiMessages).where(eq(aiMessages.conversationId,conversation.id));
  expect(JSON.stringify(messages.find(message=>message.role==="assistant")?.parts)).toContain("真实开场");
  const page=await createExecutionStreamService(db).read(ctx,submission.executionTaskId,{});
  expect(page.events.filter(event=>event.chunk.type==="text-delta").map(event=>event.chunk.delta).join("")).toBe("候选已准备好");
 }finally{releaseSettlements();hooksSpy?.mockRestore();supervisorSpy?.mockRestore();failureSpy?.mockRestore();await host?.stop();if(server){server.closeAllConnections();if(server.listening)await new Promise<void>(resolve=>server!.close(()=>resolve()));}}
},540000);

it("监督器报告缺少结构化聊天能力时，不取凭据、不发主模型请求或准备生成", async()=>{
 const {z}=await import("zod");
 const ctx={userId:"structured-cap-u",accountId:`structured-cap-${++seq}`,requestId:"test",source:"user" as const}, now=()=>new Date().toISOString();
 const repo=createAiRepository(db,{userId:ctx.userId,accountId:ctx.accountId,now,nextId:prefix=>`${prefix}-${++seq}`});
 const conversation=await repo.createConversation({title:"结构化能力",projectId:null,scope:"global"});
 const source=await repo.createMessage(conversation.id,{role:"user",content:"补全选题",attachments:[],modelMetadata:{}});
 const name="topic.enrich",definition={name,version:"test-capability-v1",description:"选题补全",parameters:{type:"object"},effect:"proposal" as const,execution:"worker.structured-node" as const};
 const submission=await createChatTurnSubmissionService(db,{now,assemble:async()=>({capability:"copilot.assist",system:"补全选题",messages:[{role:"user",content:"补全选题"}],maxSteps:4,maxOutputTokens:128,tools:[definition]})}).submit(ctx,{conversationId:conversation.id,sourceMessageId:source.id});
 const credential=vi.fn(async()=>({apiFormat:"openai_chat",baseUrl:null,model:"unavailable",token:"unavailable"}));
 const prepareGeneration=vi.fn(async()=>{throw new Error("缺少 Worker 能力时不得准备生成");});
 const advertised:string[][]=[], realSupervisor=supervisorModule.createWorkerSupervisor;
 const supervisorSpy=vi.spyOn(supervisorModule,"createWorkerSupervisor").mockImplementation(options=>{const supervisor=realSupervisor(options);return {...supervisor,async start(){const capabilities=await supervisor.start();advertised.push(capabilities);return capabilities.filter(value=>value!=="chat.structured");}};});
 const host=createChatWorkerDispatcher(db,{now,entryPath,workerId:"structured-cap-host",budget:{maxCalls:10,maxTokens:10000,deadlineMs:180000},modelConcurrency:1,tools:{[name]:{version:definition.version,effect:"proposal",execution:"worker.structured-node",parameters:z.object({}),approve:async()=>({status:"not-applicable"}),prepareGeneration}},resolveModelCredential:credential});
 try {
  await host.drainOnce();
  const [task]=await db.select().from(executionTasks).where(eq(executionTasks.id,submission.executionTaskId));
  expect(task?.status).toBe("failed");expect(task?.lastErrorCode).toBe("CHAT_WORKER_INPUT_UNAVAILABLE");
  expect(advertised.some(capabilities=>capabilities.includes("chat.run") && capabilities.includes("chat.structured"))).toBe(true);
  expect(credential).not.toHaveBeenCalled();expect(prepareGeneration).not.toHaveBeenCalled();
  expect(await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,task!.id))).toHaveLength(0);
 }finally{await host.stop();supervisorSpy.mockRestore();}
});
