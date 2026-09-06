import {it,expect,vi} from "vitest";
import type {Endpoint,RequestContext} from "@creatoros/contract";
import {createServer} from "node:http";
import {resolve} from "node:path";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {execFileSync} from "node:child_process";
import type {Db} from "@creatoros/backend";
const fixture=vi.hoisted(()=>({url:"",prepareFailures:0,prepares:0,db:undefined as Db|undefined}));
vi.mock("@creatoros/backend",async original=>{const actual=await original<typeof import("@creatoros/backend")>();return {...actual,createConfiguredDb:async(...args:Parameters<typeof actual.createConfiguredDb>)=>{const result=await actual.createConfiguredDb(...args);fixture.db=result.db;return result;}};});
vi.mock("@creatoros/backend/modules/ai-runtime",async original=>{
 const actual=await original<typeof import("@creatoros/backend/modules/ai-runtime")>();
 return {...actual,resolveLlmConfig:async()=>({apiFormat:"openai_chat",baseUrl:fixture.url,model:"fixture",token:"fixture",settings:{structuredOutputs:true}}),
  createPlanningThesisBusinessAdapter:(...args:Parameters<typeof actual.createPlanningThesisBusinessAdapter>)=>{const adapter=actual.createPlanningThesisBusinessAdapter(...args);return {...adapter,prepare:async(...input:Parameters<typeof adapter.prepare>)=>{fixture.prepares++;if(fixture.prepareFailures>0){fixture.prepareFailures--;throw Object.assign(new Error("fixture prepare unavailable"),{statusCode:503});}return adapter.prepare(...input);}};},
 };
});
import {getChatRuntime,compositeTransport,__resetPersistenceForTests} from "./persistence-client";
it("聊天论点提交沿原 attempt 恢复并继续真实派发，同键不同主题拒绝",async()=>{
 execFileSync(process.execPath,[resolve("../ai-worker/scripts/build.mjs")],{stdio:"pipe"});
 const directory=mkdtempSync(resolve(tmpdir(),"t915-chat-submission-"));
 vi.stubEnv("DATABASE_URL","");vi.stubEnv("PGLITE_DATA_DIR",resolve(directory,"db"));__resetPersistenceForTests();
 let requests=0;
 const server=createServer(async(req,res)=>{for await(const _ of req){}requests++;res.writeHead(200,{"content-type":"application/json"});res.end(JSON.stringify({id:"fixture",object:"chat.completion",created:1,model:"fixture",choices:[{index:0,message:{role:"assistant",content:JSON.stringify({core:{title:"原任务论点",summary:"验证同一提交恢复"},branches:[]})},finish_reason:"stop"}],usage:{prompt_tokens:2,completion_tokens:3,total_tokens:5}}));});
 await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));fixture.url=`http://127.0.0.1:${(server.address() as {port:number}).port}/v1`;
 const ctx:RequestContext={userId:"chat-submit",accountId:"a",source:"user",requestId:"test"};
 const call=async(id:string,params:unknown,body?:unknown)=>(await compositeTransport.request({id} as Endpoint,{params,body} as never,ctx) as {data:any}).data;
 try{
  const runtime=await getChatRuntime(),project=await call("projects.create",undefined,{title:"提交恢复项目"});
  const input={projectId:project.id,topic:"原主题",attemptId:"chat-planning-original-attempt"};
  const [first,again]=await Promise.all([runtime.dispatchPlanningThesis(ctx,input),runtime.dispatchPlanningThesis(ctx,input)]);
  expect(again.taskId).toBe(first.taskId);
  await expect(runtime.dispatchPlanningThesis(ctx,{...input,topic:"另一个意图"})).rejects.toMatchObject({code:"ATTEMPT_PAYLOAD_MISMATCH"});
  await vi.waitFor(async()=>{const task=await call("ai.tasks.get",{taskId:first.taskId});expect(task.status,JSON.stringify(task)).toBe("awaiting_confirmation");},{timeout:15000});
  expect((await runtime.dispatchPlanningThesis(ctx,input)).taskId).toBe(first.taskId);
  expect(requests).toBe(1);
  const tasks=await runtime.ai.listTasks(ctx,{taskType:"planning.thesis",limit:100,offset:0});expect(tasks.rows).toHaveLength(1);
 }finally{
  await (globalThis as {__creatorosDisposePersistence?:()=>Promise<void>}).__creatorosDisposePersistence?.();__resetPersistenceForTests();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));vi.unstubAllEnvs();rmSync(directory,{recursive:true,force:true});
 }
},30000);

it.each([0,1])("真实论点工厂首次准备失败 %i 次后，不重启也能读回候选",async failures=>{
 fixture.prepareFailures=failures;fixture.prepares=0;
 const {createChatTaskToolHost}=await import("@creatoros/backend/modules/ai-runtime");
 const {buildChatTools}=await import("../../../backend/src/modules/ai-runtime/chat-tools");
 const {prepareChatToolDefinitions}=await import("../../../backend/src/modules/ai-runtime/chat-tool-definitions");
 const {createChatTurnSubmissionService}=await import("../../../backend/src/modules/ai/chat-turn-submission.service");
 const {createChatHostContextReader}=await import("../../../backend/src/modules/ai/chat-host-context.service");
 const {createChatWorkerDispatcher}=await import("../../../backend/src/modules/execution/model-worker-dispatcher");
 const {executionTasks,executionCalls,eq}=await import("@creatoros/backend");
 execFileSync(process.execPath,[resolve("../ai-worker/scripts/build.mjs")],{stdio:"pipe"});
 const directory=mkdtempSync(resolve(tmpdir(),"t915-planning-factory-"));
 vi.stubEnv("DATABASE_URL","");vi.stubEnv("PGLITE_DATA_DIR",resolve(directory,"db"));__resetPersistenceForTests();
 const requests:any[]=[];
 const server=createServer(async(req,res)=>{
  let body="";for await(const chunk of req)body+=chunk.toString();const input=JSON.parse(body);requests.push(input);
  if(!input.stream){res.writeHead(200,{"content-type":"application/json"});res.end(JSON.stringify({id:"child",object:"chat.completion",created:1,model:"fixture",choices:[{index:0,message:{role:"assistant",content:JSON.stringify({core:{title:"真实子任务论点",summary:"选区主题的候选"},branches:[]})},finish_reason:"stop"}],usage:{prompt_tokens:2,completion_tokens:3,total_tokens:5}}));return;}
  const first=requests.filter(item=>item.stream).length===1;
  const delta=first?{tool_calls:[{index:0,id:"planning-call",type:"function",function:{name:"planning_thesis",arguments:"{}"}}]}:{content:"论点任务已提交，请在候选中查看。"};
  const chunks=[{choices:[{index:0,delta,finish_reason:null}]},{choices:[{index:0,delta:{},finish_reason:first?"tool_calls":"stop"}],usage:{prompt_tokens:2,completion_tokens:3,total_tokens:5}}];
  res.writeHead(200,{"content-type":"text/event-stream"});res.end(chunks.map(chunk=>`data: ${JSON.stringify({id:"root",object:"chat.completion.chunk",created:1,model:"fixture",...chunk})}\n\n`).join("")+"data: [DONE]\n\n");
 });
 await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));fixture.url=`http://127.0.0.1:${(server.address() as {port:number}).port}/v1`;
 let host:ReturnType<typeof createChatWorkerDispatcher>|undefined;
 const ctx:RequestContext={userId:"planning-factory",accountId:"a",source:"user",requestId:"test"};
 const call=async(id:string,params:unknown,body?:unknown)=>(await compositeTransport.request({id} as Endpoint,{params,body} as never,ctx) as {data:any}).data;
 try{
  const runtime=await getChatRuntime(),db=fixture.db!,project=await call("projects.create",undefined,{title:"论点真实工厂项目"});
  const conversation=await runtime.ai.createConversation(ctx,{title:"论点工厂",scope:"project",projectId:project.id});
  const source=await runtime.ai.createMessage(ctx,conversation.id,{content:"给选中主题生成论点"});
  const snapshot=await runtime.resolveEffectiveSkillSnapshot(ctx,["chatbox.topic","creatoros.guide"]);
  // 专项只声明真实论点工具；完整场景在 chat-read-host 文件保留全部工具并独立验收。
  const prototypes=buildChatTools(["planning.thesis"],{} as never);
  const definitions=(await prepareChatToolDefinitions(prototypes,{atomicPlanningThesis:true})).definitions;
  const submission=await createChatTurnSubmissionService(db,{assertProject:async(c,id)=>{if(!await runtime.contextReaders.getProjectDetail!(c,{projectId:id}))throw new Error("项目不可访问");},assemble:async()=>({capability:"copilot.assist",system:"使用论点工具",messages:[{role:"user",content:source.content}],tools:definitions,maxSteps:4,maxOutputTokens:128,hostContext:{schemaVersion:1,chatContext:{surface:"project",projectId:project.id,selection:{kind:"candidate",ids:[],label:"原选区标题"}},mediaRoute:null,positioningScratch:false,trustedScriptSources:[],skillSnapshot:snapshot} as never})}).submit(ctx,{conversationId:conversation.id,sourceMessageId:source.id});
  host=createChatWorkerDispatcher(db,{entryPath:resolve("../ai-worker/dist/execution-worker.cjs"),workerId:"planning-parent",budget:{maxCalls:6,maxTokens:100000,deadlineMs:60000},modelConcurrency:1,pollMs:100,resolveTools:createChatTaskToolHost(createChatHostContextReader(db),runtime.contextReaders,{prepareTaskCommit:runtime.ai.prepareTaskCommit,wakeTask:runtime.wakeChatPlanningTask}),resolveModelCredential:async()=>({apiFormat:"openai_chat",baseUrl:fixture.url,model:"fixture",token:"fixture"})});
  host.start();
  await vi.waitFor(async()=>{const [row]=await db.select().from(executionTasks).where(eq(executionTasks.id,submission.executionTaskId));expect(row?.status,JSON.stringify(row)).toBe("succeeded");},{timeout:15000});
  const children=await runtime.ai.listTasks(ctx,{taskType:"planning.thesis",limit:100,offset:0});expect(children.rows).toHaveLength(1);const child=children.rows[0]!;
  await vi.waitFor(async()=>expect((await runtime.ai.getTask(ctx,child.id)).status).toBe("awaiting_confirmation"),{timeout:15000});
  expect((await runtime.ai.getTask(ctx,child.id)).inputData).toMatchObject({projectId:project.id,topic:"原选区标题"});
  const calls=await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,submission.executionTaskId));const tool=calls.find(row=>row.kind==="tool")!;
  expect(JSON.parse(tool.resultText!).output.data).toMatchObject({kind:"planning.thesis",taskId:child.id,projectId:project.id});
  expect(JSON.stringify(requests.filter(item=>item.stream)[1])).toContain(child.id);
  expect(requests.filter(item=>!item.stream)).toHaveLength(1);
  expect(fixture.prepares).toBe(1+failures);
 }finally{fixture.prepareFailures=0;await host?.stop();await (globalThis as {__creatorosDisposePersistence?:()=>Promise<void>}).__creatorosDisposePersistence?.();__resetPersistenceForTests();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));vi.unstubAllEnvs();rmSync(directory,{recursive:true,force:true});}
},45000);
