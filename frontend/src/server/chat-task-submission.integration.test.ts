// @vitest-environment node
import {it,expect,vi} from "vitest";
import type {Endpoint,RequestContext} from "@creatoros/contract";
import {createServer} from "node:http";
import {resolve} from "node:path";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {execFileSync} from "node:child_process";
import type {Db} from "@creatoros/backend";
const fixture=vi.hoisted(()=>({url:"",prepareFailures:0,prepares:0,db:undefined as Db|undefined}));
// 本测试只初始化临时数据库和媒体根；任何存储目录迁移都必须在读写旧目录前拒绝。
vi.mock("@creatoros/backend/modules/assets",async original=>{
 const actual=await original<typeof import("@creatoros/backend/modules/assets")>();
 return {...actual,migrateStorageRoot:async()=>{throw new Error("本测试禁止迁移媒体目录");}};
});
vi.mock("@creatoros/backend",async original=>{const actual=await original<typeof import("@creatoros/backend")>();return {...actual,createConfiguredDb:async(...args:Parameters<typeof actual.createConfiguredDb>)=>{const result=await actual.createConfiguredDb(...args);fixture.db=result.db;return result;}};});
vi.mock("@creatoros/backend/modules/ai-runtime",async original=>{
 const actual=await original<typeof import("@creatoros/backend/modules/ai-runtime")>();
 return {...actual,resolveMultimodalSpec:async()=>({kind:"image",provider:"openai",model:"gpt-image-1",token:"fixture",baseUrl:fixture.url}),
  createAssetBusinessExecutionService:(...args:Parameters<typeof actual.createAssetBusinessExecutionService>)=>{const service=actual.createAssetBusinessExecutionService(...args);return {...service,prepare:async(...input:Parameters<typeof service.prepare>)=>{fixture.prepares++;if(fixture.prepareFailures>0){fixture.prepareFailures--;throw Object.assign(new Error("fixture asset prepare unavailable"),{statusCode:503});}return service.prepare(...input);}};},
  resolveLlmConfig:async()=>({apiFormat:"openai_chat",baseUrl:fixture.url,model:"fixture",token:"fixture",settings:{structuredOutputs:true}}),
  preparePlatformAdaptContext:async(...args:Parameters<typeof actual.preparePlatformAdaptContext>)=>{fixture.prepares++;if(fixture.prepareFailures>0){fixture.prepareFailures--;throw Object.assign(new Error("fixture publish prepare unavailable"),{statusCode:503});}return actual.preparePlatformAdaptContext(...args);},
  createScriptBusinessAdapter:(...args:Parameters<typeof actual.createScriptBusinessAdapter>)=>{const adapter=actual.createScriptBusinessAdapter(...args);return {...adapter,prepare:async(...input:Parameters<typeof adapter.prepare>)=>{fixture.prepares++;if(fixture.prepareFailures>0){fixture.prepareFailures--;throw Object.assign(new Error("fixture script prepare unavailable"),{statusCode:503});}return adapter.prepare(...input);}};},
  prepareScriptReviewContext:async(...args:Parameters<typeof actual.prepareScriptReviewContext>)=>{fixture.prepares++;if(fixture.prepareFailures>0){fixture.prepareFailures--;throw Object.assign(new Error("fixture review prepare unavailable"),{statusCode:503});}return actual.prepareScriptReviewContext(...args);},
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

it.each([{toolName:"planning.thesis",failures:0},{toolName:"planning.thesis",failures:1},{toolName:"material.generate",failures:0},{toolName:"material.generate",failures:1},{toolName:"review.script",failures:0},{toolName:"review.script",failures:1},{toolName:"review.script",failures:0,empty:true},{toolName:"publish.package",failures:0},{toolName:"publish.package",failures:1},{toolName:"publish.package",failures:0,empty:true},{toolName:"script.draft",failures:0},{toolName:"script.draft",failures:1}])("真实 $toolName 工厂首次准备失败 $failures 次后，不重启也能读回候选",async({toolName,failures,empty=false}:{toolName:string;failures:number;empty?:boolean})=>{
 const publish=toolName==="publish.package",script=toolName==="script.draft";
 const material=toolName==="material.generate",review=toolName==="review.script",taskType=script?"script.draft":publish?"publish.platform_adapt":material?"asset.generate":review?"script.review":"planning.thesis";
 fixture.prepareFailures=failures;fixture.prepares=0;
 const {createChatTaskToolHost}=await import("@creatoros/backend/modules/ai-runtime");
 const {createChatMaterialTaskHost}=await import("../../../backend/src/modules/ai-runtime/chat-material-task-host");
 const {buildChatTools}=await import("../../../backend/src/modules/ai-runtime/chat-tools");
 const {prepareChatToolDefinitions}=await import("../../../backend/src/modules/ai-runtime/chat-tool-definitions");
 const {createChatTurnSubmissionService}=await import("../../../backend/src/modules/ai/chat-turn-submission.service");
 const {createChatHostContextReader}=await import("../../../backend/src/modules/ai/chat-host-context.service");
 const {createChatWorkerDispatcher}=await import("../../../backend/src/modules/execution/model-worker-dispatcher");
 const {storageConfigs,aiTasks,executionTasks,executionCalls,eq}=await import("@creatoros/backend");
 execFileSync(process.execPath,[resolve("../ai-worker/scripts/build.mjs")],{stdio:"pipe"});
 const directory=mkdtempSync(resolve(tmpdir(),"t915-planning-factory-"));
 if(material)vi.stubEnv("CREATOROS_STORAGE","local");
 vi.stubEnv("DATABASE_URL","");vi.stubEnv("PGLITE_DATA_DIR",resolve(directory,"db"));__resetPersistenceForTests();
 const requests:any[]=[];
 const server=createServer(async(req,res)=>{
  let body="";for await(const chunk of req)body+=chunk.toString();const input=JSON.parse(body);requests.push(input);
  if(!input.stream && material){res.writeHead(200,{"content-type":"application/json"});res.end(JSON.stringify({data:[{b64_json:Buffer.from("fixture-image").toString("base64")}]}));return;}
  if(!input.stream){res.writeHead(200,{"content-type":"application/json"});res.end(JSON.stringify({id:"child",object:"chat.completion",created:1,model:"fixture",choices:[{index:0,message:{role:"assistant",content:JSON.stringify(script?{authorized:true,startAnchor:null,endAnchor:null}:publish?{drafts:[{platform:"douyin",title:"真实发布标题",body:"完整发布简介",tags:["真实"],coverIdea:"原稿画面",auditFlags:[]}]}:review?{verdict:"pass",summary:"已依据原文完成审核",findings:[]}:{core:{title:"真实子任务论点",summary:"选区主题的候选"},branches:[]})},finish_reason:"stop"}],usage:{prompt_tokens:2,completion_tokens:3,total_tokens:5}}));return;}
  const first=requests.filter(item=>item.stream).length===1;
  const delta=first?{tool_calls:[{index:0,id:"planning-call",type:"function",function:{name:toolName.replaceAll(".","_"),arguments:script?JSON.stringify({mode:"verbatim",sourceRef:"source"}):material?JSON.stringify({kind:"image",prompt:"原素材画面"}):"{}"}}]}:{content:"论点任务已提交，请在候选中查看。"};
  const chunks=[{choices:[{index:0,delta,finish_reason:null}]},{choices:[{index:0,delta:{},finish_reason:first?"tool_calls":"stop"}],usage:{prompt_tokens:2,completion_tokens:3,total_tokens:5}}];
  res.writeHead(200,{"content-type":"text/event-stream"});res.end(chunks.map(chunk=>`data: ${JSON.stringify({id:"root",object:"chat.completion.chunk",created:1,model:"fixture",...chunk})}\n\n`).join("")+"data: [DONE]\n\n");
 });
 await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));fixture.url=`http://127.0.0.1:${(server.address() as {port:number}).port}/v1`;
 let host:ReturnType<typeof createChatWorkerDispatcher>|undefined;
 const ctx:RequestContext={userId:"planning-factory",accountId:"a",source:"user",requestId:"test"};
 const call=async(id:string,params:unknown,body?:unknown)=>(await compositeTransport.request({id} as Endpoint,{params,body} as never,ctx) as {data:any}).data;
 try{
  const runtime=await getChatRuntime(),db=fixture.db!;
  // 测试只初始化隔离数据库的存储配置；禁止调用会迁移真实默认媒体目录的设置 API。
  if(material)await db.insert(storageConfigs).values({userId:ctx.userId,rootPath:resolve(directory,"media"),backend:"local",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
  const project=await call("projects.create",undefined,{title:"论点真实工厂项目"});
  if(publish)await call("projects.outputs.create",{projectId:project.id},{title:"发布挂点"});
  const reviewArtifact=(review || publish)?await call("artifacts.create",{projectId:project.id},{title:"当前原稿",artifactType:"output_script",stage:"script"}):null;
  const originalScript="这是一份已经保存的完整原稿，说明实际操作和适用边界。".repeat(4);
  const reviewVersion=(review || publish)?await call("artifacts.versions.create",{artifactId:reviewArtifact.id},{contentText:empty?"":originalScript}):null;
  const conversation=await runtime.ai.createConversation(ctx,{title:"论点工厂",scope:"project",projectId:project.id});
  const source=await runtime.ai.createMessage(ctx,conversation.id,{content:script?"把本轮原稿逐字导入并生成候选":"给选中主题生成内容"});
  const snapshot=await runtime.resolveEffectiveSkillSnapshot(ctx,["chatbox.topic","creatoros.guide"]);
  // 专项声明对应真实工具；全场景和正式聊天路由仍需独立验收。
  const prototypes=buildChatTools([toolName] as never,{} as never);
  const definitions=(await prepareChatToolDefinitions(prototypes,{atomicPlanningThesis:true,atomicMaterialGenerate:material,atomicScriptReview:review,atomicPublishPackage:publish,workerScriptDraft:script})).definitions;
  const submission=await createChatTurnSubmissionService(db,{assertProject:async(c,id)=>{if(!await runtime.contextReaders.getProjectDetail!(c,{projectId:id}))throw new Error("项目不可访问");},assemble:async()=>({capability:"copilot.assist",system:"使用论点工具",messages:[{role:"user",content:source.content}],tools:definitions,maxSteps:4,maxOutputTokens:128,hostContext:{schemaVersion:1,chatContext:{surface:"project",projectId:project.id,selection:{kind:"candidate",ids:[],label:"原选区标题"}},mediaRoute:null,positioningScratch:false,trustedScriptSources:script?[{ref:"source",label:"原稿",text:originalScript,truncated:false,sourceType:"message",sourceId:source.id}]:[],...(script?{scriptDraftContext:{latestUserInstruction:source.content}}:{}),skillSnapshot:snapshot} as never})}).submit(ctx,{conversationId:conversation.id,sourceMessageId:source.id});
  host=createChatWorkerDispatcher(db,{entryPath:resolve("../ai-worker/dist/execution-worker.cjs"),workerId:"planning-parent",budget:{maxCalls:6,maxTokens:100000,deadlineMs:60000},modelConcurrency:1,pollMs:100,resolveTools:material?createChatMaterialTaskHost(createChatHostContextReader(db),runtime.contextReaders,{prepareTaskCommit:runtime.ai.prepareTaskCommit,wakeTask:runtime.wakeChatMaterialTask}):createChatTaskToolHost(createChatHostContextReader(db),runtime.contextReaders,{publish:{preparePublish:runtime.prepareChatPublishTask,wakeTask:runtime.wakeChatPublishTask},scriptDraft:{prepareDraft:runtime.prepareChatScriptDraftTask,wakeTask:runtime.wakeChatScriptDraftTask},review:{prepareReview:runtime.prepareChatScriptReviewTask,wakeTask:runtime.wakeChatScriptReviewTask},planning:{prepareTaskCommit:runtime.ai.prepareTaskCommit,wakeTask:runtime.wakeChatPlanningTask},local:{detectTools:runtime.detectTools,listAuthorizedDirs:runtime.listAuthorizedDirs}}),resolveModelCredential:async()=>({apiFormat:"openai_chat",baseUrl:fixture.url,model:"fixture",token:"fixture"})});
  host.start();
  await vi.waitFor(async()=>{const [row]=await db.select().from(executionTasks).where(eq(executionTasks.id,submission.executionTaskId));expect(row?.status,JSON.stringify(row)).toBe("succeeded");},{timeout:15000});
  const children=await runtime.ai.listTasks(ctx,{taskType,limit:100,offset:0});
  if(empty){
   expect(children.rows).toHaveLength(0);expect(requests.filter(item=>!item.stream)).toHaveLength(0);expect(fixture.prepares).toBe(0);
   const calls=await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,submission.executionTaskId));
   expect(JSON.parse(calls.find(row=>row.kind==="tool")!.resultText!).output).toMatchObject({status:"error",sideEffect:"none",data:{kind:publish?"publish.package":"review.report",taskId:null,projectId:project.id,error:expect.stringContaining(publish?"可用的整稿":"可审的整稿")}});return;
  }
  expect(children.rows,JSON.stringify(await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,submission.executionTaskId)))).toHaveLength(1);const child=children.rows[0]!;
  await vi.waitFor(async()=>{const current=await runtime.ai.getTask(ctx,child.id);const [raw]=await db.select().from(aiTasks).where(eq(aiTasks.id,child.id));const [execution]=raw?.executionTaskId?await db.select().from(executionTasks).where(eq(executionTasks.id,raw.executionTaskId)):[];expect(current.status,JSON.stringify({task:current,execution,requests})).toBe(review?"succeeded":"awaiting_confirmation");},{timeout:15000});
  expect((await runtime.ai.getTask(ctx,child.id)).inputData).toMatchObject(script?{projectId:project.id,draftMode:"verbatim",verbatimSourceText:originalScript}:publish?{projectId:project.id,topic:"原选区标题",scriptText:originalScript,platforms:["douyin"]}:material?{projectId:project.id,kind:"image",prompt:"原素材画面"}:review?{projectId:project.id,artifactId:reviewArtifact.id,artifactVersion:reviewVersion.versionNumber}:{projectId:project.id,topic:"原选区标题"});
  const calls=await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,submission.executionTaskId));const tool=calls.find(row=>row.kind==="tool")!;
  expect(JSON.parse(tool.resultText!).output.data).toMatchObject({kind:review?"review.report":toolName,taskId:child.id,...(material?{}:{projectId:project.id})});
  expect(JSON.stringify(requests.filter(item=>item.stream)[1])).toContain(child.id);
  expect(requests.filter(item=>!item.stream)).toHaveLength(1);
  expect(fixture.prepares).toBe(1+failures);
  if(script){const results=await call("ai.tasks.results.list",{taskId:child.id});expect(results[0].resultData).toMatchObject({body:originalScript,draftMode:"verbatim"});}
  if(publish){
   const results=await call("ai.tasks.results.list",{taskId:child.id});expect(results[0].resultData).toMatchObject({drafts:[{platform:"douyin",title:"真实发布标题"}]});
   const {publications}=await import("@creatoros/backend");const before=await db.select().from(publications);
   await runtime.ai.confirmTask(ctx,child.id);await runtime.ai.confirmTask(ctx,child.id);
   expect(await db.select().from(publications)).toHaveLength(before.length+1);
  }
  if(review){
   expect(await call("scriptReviews.getLatest",{projectId:project.id})).toMatchObject({artifactId:reviewArtifact.id,artifactVersion:reviewVersion.versionNumber,verdict:"pass"});
   expect(await runtime.contextReaders.getArtifactText!(ctx,{projectId:project.id,artifactType:"output_script"})).toMatchObject({currentVersionId:reviewVersion.id});
   expect(await call("ai.tasks.results.list",{taskId:child.id})).toEqual([]);
  }
  if(material){await runtime.ai.confirmTask(ctx,child.id);await runtime.ai.confirmTask(ctx,child.id);expect((await runtime.ai.getTask(ctx,child.id)).status).toBe("succeeded");}
 }finally{fixture.prepareFailures=0;await host?.stop();await (globalThis as {__creatorosDisposePersistence?:()=>Promise<void>}).__creatorosDisposePersistence?.();__resetPersistenceForTests();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));vi.unstubAllEnvs();rmSync(directory,{recursive:true,force:true});}
},45000);

it("正式发布包派发沿原 attempt 复用首稿快照，稿面改变不重复创建任务",async()=>{
 execFileSync(process.execPath,[resolve("../ai-worker/scripts/build.mjs")],{stdio:"pipe"});
 const directory=mkdtempSync(resolve(tmpdir(),"t915-publish-replay-"));
 vi.stubEnv("DATABASE_URL","");vi.stubEnv("PGLITE_DATA_DIR",resolve(directory,"db"));__resetPersistenceForTests();
 let requests=0;
 const server=createServer(async(req,res)=>{for await(const _ of req){}requests++;res.writeHead(200,{"content-type":"application/json"});res.end(JSON.stringify({id:"fixture",object:"chat.completion",created:1,model:"fixture",choices:[{index:0,message:{role:"assistant",content:JSON.stringify({drafts:[{platform:"douyin",title:"原稿标题",body:"原稿简介",tags:[],coverIdea:"原稿画面",auditFlags:[]}]})},finish_reason:"stop"}],usage:{prompt_tokens:2,completion_tokens:3,total_tokens:5}}));});
 await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));fixture.url=`http://127.0.0.1:${(server.address() as {port:number}).port}/v1`;
 const ctx:RequestContext={userId:"publish-replay",accountId:"a",source:"user",requestId:"test"};
 const call=async(id:string,params:unknown,body?:unknown)=>(await compositeTransport.request({id} as Endpoint,{params,body} as never,ctx) as {data:any}).data;
 try{
  const runtime=await getChatRuntime(),project=await call("projects.create",undefined,{title:"发布首稿"});
  const output=await call("projects.outputs.create",{projectId:project.id},{title:"发布挂点"});
  const artifact=await call("artifacts.create",{projectId:project.id},{title:"已保存正文",artifactType:"output_script",stage:"script"});
  const scriptText="这份原稿是准备发布的真实稿件，保留其内容作为发布物料来源。".repeat(3);
  await call("artifacts.versions.create",{artifactId:artifact.id},{contentText:scriptText});
  const input={projectId:project.id,topic:"原主题",attemptId:"publish-original-attempt"};
  const [a,b]=await Promise.all([runtime.dispatchPublishPackage(ctx,input),runtime.dispatchPublishPackage(ctx,input)]);expect(a.taskId).toBe(b.taskId);
  await call("artifacts.versions.create",{artifactId:artifact.id},{contentText:""});
  expect((await runtime.dispatchPublishPackage(ctx,input)).taskId).toBe(a.taskId);
  await expect(runtime.dispatchPublishPackage(ctx,{...input,topic:"新意图"})).rejects.toMatchObject({code:"ATTEMPT_PAYLOAD_MISMATCH"});
  await vi.waitFor(async()=>expect((await runtime.ai.getTask(ctx,a.taskId)).status).toBe("awaiting_confirmation"),{timeout:15000});
  expect((await runtime.ai.getTask(ctx,a.taskId)).inputData).toMatchObject({outputId:output.id,scriptText,projectId:project.id,platforms:["douyin"]});
  expect((await runtime.ai.listTasks(ctx,{taskType:"publish.platform_adapt",limit:100,offset:0})).rows).toHaveLength(1);expect(requests).toBe(1);
 }finally{await (globalThis as {__creatorosDisposePersistence?:()=>Promise<void>}).__creatorosDisposePersistence?.();__resetPersistenceForTests();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));vi.unstubAllEnvs();rmSync(directory,{recursive:true,force:true});}
},30000);
