import { it, expect, vi } from "vitest";
import type { Db } from "@creatoros/backend";
const fixture = vi.hoisted(() => ({ db: undefined as Db | undefined }));
vi.mock("@creatoros/backend", async original => {
  const actual = await original<typeof import("@creatoros/backend")>();
  return { ...actual, createConfiguredDb: async (...args: Parameters<typeof actual.createConfiguredDb>) => {
    const result = await actual.createConfiguredDb(...args); fixture.db = result.db; return result;
  } };
});
import {workerSkillSnapshotSchema} from "@creatoros/contract/execution-worker";
import type { Endpoint, RequestContext } from "@creatoros/contract";
import { createPersistentTaskService, createExecutionCallLedgerService } from "@creatoros/backend/modules/execution";
import { createExecutionChatToolPorts } from "../../../backend/src/modules/execution/execution-chat-tool-ports.service";
import { createChatTurnSubmissionService } from "../../../backend/src/modules/ai/chat-turn-submission.service";
import {createAiRepository} from "../../../backend/src/modules/ai/ai.repository";
import {createChatHostContextReader} from "../../../backend/src/modules/ai/chat-host-context.service";
import {createChatReadToolResolver} from "../../../backend/src/modules/ai-runtime/chat-read-tool-resolver";
import { createChatReadToolHost } from "../../../backend/src/modules/ai-runtime/chat-read-tool-host";
import { prepareChatToolDefinitions } from "../../../backend/src/modules/ai-runtime/chat-tool-definitions";
import { buildChatTools, type ChatToolDeps } from "../../../backend/src/modules/ai-runtime/chat-tools";
import { getChatRuntime, compositeTransport, __resetPersistenceForTests } from "./persistence-client";

it("真实聊天读取经租约/授权/账本结算：账号隔离、回放不重复读取、瞬断不记未知", async () => {
  vi.stubEnv("DATABASE_URL", ""); vi.stubEnv("PGLITE_DATA_DIR", ""); __resetPersistenceForTests();
  try {
    const runtime = await getChatRuntime(), db = fixture.db!;
    const a: RequestContext = { userId: "read-host", accountId: "a", requestId: "r", source: "user" };
    const b = { ...a, accountId: "b" };
    for (const ctx of [a, b]) await compositeTransport.request({ id: "projects.create" } as Endpoint, { body: { title: `账号${ctx.accountId}项目`, brief: "" } } as never, ctx);
    let reads = 0, fail = false;
    // 只装配这一真实领域读取；其余不在白名单的工具不会被执行。
    const toolsFor = (ctx: RequestContext) => buildChatTools(["context.projects"], { listProjects: async (options: { limit: number; offset: number }) => {
      return runtime.contextReaders.listProjects(ctx, options);
    } } as ChatToolDeps);
    const prototypes = toolsFor(a), definitions = (await prepareChatToolDefinitions(prototypes)).definitions;
    const host = await createChatReadToolHost(prototypes, createChatReadToolResolver(createChatHostContextReader(db), {
      ...runtime.contextReaders, listProjects: async (ctx, options) => {
        reads++; if (fail) throw Object.assign(new Error("fixture unavailable"), {statusCode:503});
        return runtime.contextReaders.listProjects(ctx, options);
      },
    }));
    const now = () => new Date().toISOString(), budget = { maxCalls: 10, maxTokens: 10000, deadlineMs: 60000 };
    const tasks = createPersistentTaskService(db, { now }), ledger = createExecutionCallLedgerService(db, { now, budget });
    const ports = createExecutionChatToolPorts(db, { now, budget, tools: host });
    let seq = 0;
    async function execute(ctx: RequestContext) {
      const id = `read-host-${++seq}`;
      const repo=createAiRepository(db,{userId:ctx.userId,accountId:ctx.accountId!,now,nextId:prefix=>`${prefix}-${id}`});
      const conversation=await repo.createConversation({title:"真实读取任务",projectId:null,scope:"global"});
      const source=await repo.createMessage(conversation.id,{role:"user",content:"读取项目",attachments:[],modelMetadata:{}});
      const skillSnapshot=workerSkillSnapshotSchema.parse(await runtime.resolveEffectiveSkillSnapshot(ctx,["chatbox.topic","creatoros.guide"]));
      const submission=createChatTurnSubmissionService(db,{assemble:async()=>({capability:"copilot.assist",system:"读取",messages:[{role:"user",content:source.content}],maxSteps:6,maxOutputTokens:128,tools:definitions,hostContext:{schemaVersion:1,chatContext:{surface:"topics"},mediaRoute:null,positioningScratch:false,trustedScriptSources:[],skillSnapshot}})});
      const submitted=await submission.submit(ctx,{conversationId:conversation.id,sourceMessageId:source.id});
      const claim=(await tasks.claimTask({taskId:submitted.executionTaskId,workerId:"fixture"}))!;
      const ref = { executionTaskId: submitted.executionTaskId, attempt: claim.lease.attempt, fenceToken: claim.lease.fenceToken };
      const model = await ledger.reserve(ref, { kind: "model", operationKey: id, inputDigest: "sha256:" + "a".repeat(64), reservedTokens: 20 });
      await ledger.start(ref, model.id);
      await ledger.settle(ref, model.id, { status: "settled", usage: { totalTokens: 5 }, providerResult: { content: [{ type: "tool-call", toolCallId: "t", toolName: "context_projects", input: "{}" }], finishReason: { unified: "tool-calls" }, usage: { inputTokens: { total: 2 }, outputTokens: { total: 3 } }, warnings: [] } });
      expect(await ports.check(ref, { modelCallId: model.id, toolCallId: "t" })).toEqual({ status: "not-applicable" });
      const call = await ports.reserve(ref, { modelCallId: model.id, toolCallId: "t" }); await ports.start(ref, { callId: call.callId });
      const result = await ports.execute(ref, { callId: call.callId });
      const count = reads;
      expect(await ports.execute(ref, { callId: call.callId })).toEqual(result);
      expect(reads).toBe(count);
      expect((await ledger.inspect(ref)).calls.at(-1)!.status).toBe("settled");
      return result;
    }
    expect(JSON.stringify((await execute(b)).data)).toContain("账号b项目");
    expect(JSON.stringify((await execute(a)).data)).not.toContain("账号b项目");
    fail = true;
    expect(await execute(a)).toMatchObject({ status: "error", sideEffect: "none", error: { code: "transient", retryable: true } });
    expect(reads).toBe(3);
  } finally {
    await (globalThis as { __creatorosDisposePersistence?: () => Promise<void> }).__creatorosDisposePersistence?.();
    __resetPersistenceForTests(); vi.unstubAllEnvs();
  }
}, 30000);

it("正式Worker经动态工具工厂读取真实项目，下一轮供应商请求确实包含当前账号结果",async()=>{
 const {createChatReadTaskToolHost}=await import("../../../backend/src/modules/ai-runtime/chat-read-tool-resolver");
 const {createChatWorkerDispatcher}=await import("../../../backend/src/modules/execution/model-worker-dispatcher");
 const {executionTasks,aiMessages,executionCalls,eq}=await import("@creatoros/backend");
 const {createServer}=await import("node:http"),{resolve}=await import("node:path"),{execFileSync}=await import("node:child_process");
 execFileSync(process.execPath,[resolve("../ai-worker/scripts/build.mjs")],{stdio:"pipe"});
 vi.stubEnv("DATABASE_URL","");vi.stubEnv("PGLITE_DATA_DIR","");__resetPersistenceForTests();
 const bodies:string[]=[];
 const server=createServer((req,res)=>{let body="";req.on("data",chunk=>body+=chunk);req.on("end",()=>{
  bodies.push(body);const done=JSON.parse(body).messages.some((message:{role:string})=>message.role==="tool");
  const delta=done?{content:"读取完成"}:{tool_calls:[{index:0,id:"read-projects",type:"function",function:{name:"context_projects",arguments:"{}"}}]};
  const chunks=[{choices:[{index:0,delta,finish_reason:null}]},{choices:[{index:0,delta:{},finish_reason:done?"stop":"tool_calls"}],usage:{prompt_tokens:2,completion_tokens:3,total_tokens:5}}];
  res.writeHead(200,{"content-type":"text/event-stream"});res.end(chunks.map(chunk=>`data: ${JSON.stringify({id:"fixture",object:"chat.completion.chunk",created:1,model:"fixture",...chunk})}\n\n`).join("")+"data: [DONE]\n\n");
 });});
 let host:ReturnType<typeof createChatWorkerDispatcher>|undefined;
 try{
  await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));
  const runtime=await getChatRuntime(),db=fixture.db!,now=()=>new Date().toISOString();let seq=0,reads=0;
  const definitions=(await prepareChatToolDefinitions(buildChatTools(["context.projects"],{} as ChatToolDeps))).definitions;
  const submissions=[];
  for(const accountId of ["a","b"]){
   const ctx:RequestContext={userId:"worker-read-host",accountId,source:"user",requestId:"test"};
   await compositeTransport.request({id:"projects.create"} as Endpoint,{body:{title:`真实${accountId}项目`,brief:""}} as never,ctx);
   const repo=createAiRepository(db,{userId:ctx.userId,accountId,now,nextId:prefix=>`${prefix}-worker-read-${++seq}`});
   const conversation=await repo.createConversation({title:"Worker读项目",projectId:null,scope:"global"}),source=await repo.createMessage(conversation.id,{role:"user",content:`读取账号${accountId}项目`,attachments:[],modelMetadata:{}});
   const skillSnapshot=workerSkillSnapshotSchema.parse(await runtime.resolveEffectiveSkillSnapshot(ctx,["chatbox.topic","creatoros.guide"]));
   const submitted=await createChatTurnSubmissionService(db,{assemble:async()=>({capability:"copilot.assist",system:"读取项目",messages:[{role:"user",content:source.content}],tools:definitions,maxSteps:6,maxOutputTokens:128,hostContext:{schemaVersion:1,chatContext:{surface:"topics"},mediaRoute:null,positioningScratch:false,trustedScriptSources:[],skillSnapshot}})}).submit(ctx,{conversationId:conversation.id,sourceMessageId:source.id});
   submissions.push({...submitted,ctx,conversationId:conversation.id});
  }
  const factory=createChatReadTaskToolHost(createChatHostContextReader(db),{...runtime.contextReaders,listProjects:async(ctx,options)=>{reads++;return runtime.contextReaders.listProjects(ctx,options);}});
  const resolveTools=vi.fn(factory);
  host=createChatWorkerDispatcher(db,{entryPath:resolve("../ai-worker/dist/execution-worker.cjs"),workerId:"real-read",budget:{maxCalls:8,maxTokens:100000,deadlineMs:60000},modelConcurrency:2,pollMs:100,resolveTools,resolveModelCredential:async()=>({apiFormat:"openai_chat",baseUrl:`http://127.0.0.1:${(server.address() as {port:number}).port}/v1`,model:"fixture",token:"fixture"})});
  host.start();
  for(const submitted of submissions){
   await vi.waitFor(async()=>expect((await db.select().from(executionTasks).where(eq(executionTasks.id,submitted.executionTaskId)))[0]!.status).toBe("succeeded"),{timeout:15000});
   const final=bodies.find(body=>body.includes(`读取账号${submitted.ctx.accountId}项目`)&&JSON.parse(body).messages.some((message:{role:string})=>message.role==="tool"))!;
   expect(final).toContain(`真实${submitted.ctx.accountId}项目`);expect(final).not.toContain(`真实${submitted.ctx.accountId==="a"?"b":"a"}项目`);
   const messages=await db.select().from(aiMessages).where(eq(aiMessages.conversationId,submitted.conversationId));
   expect(messages).toHaveLength(2);expect(messages.find(message=>message.role==="assistant")!.content).toBe("读取完成");
   const calls=await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,submitted.executionTaskId));expect(calls).toHaveLength(3);expect(calls.every(call=>call.status==="settled")).toBe(true);
  }
  expect(bodies).toHaveLength(4);expect(reads).toBe(2);expect(resolveTools).toHaveBeenCalledTimes(2);
 }finally{
  await host?.stop();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));
  await (globalThis as {__creatorosDisposePersistence?:()=>Promise<void>}).__creatorosDisposePersistence?.();__resetPersistenceForTests();vi.unstubAllEnvs();
 }
},30000);

it("完整真实聊天装配经持久提交后，Worker 读取项目并生成开场候选",async()=>{
 const {loadPositioningWorksBrief}=await import("../../../backend/src/modules/ai-runtime/creative-context");
 const {prepareDurableChatTurn,createChatTaskToolHost}=await import("@creatoros/backend/modules/ai-runtime");
 const {createChatWorkerDispatcher}=await import("../../../backend/src/modules/execution/model-worker-dispatcher");
 const {createSettingsRepository}=await import("@creatoros/backend/modules/settings");
 const {executionTasks,aiMessages,executionCalls,eq}=await import("@creatoros/backend");
 const {createServer}=await import("node:http"),{resolve}=await import("node:path"),{execFileSync}=await import("node:child_process");
 execFileSync(process.execPath,[resolve("../ai-worker/scripts/build.mjs")],{stdio:"pipe"});
 vi.stubEnv("DATABASE_URL","");vi.stubEnv("PGLITE_DATA_DIR","");__resetPersistenceForTests();
 const requests:Record<string,unknown>[]=[];
 const server=createServer(async(req,res)=>{
  let body="";for await(const chunk of req)body+=chunk.toString();const input=JSON.parse(body);requests.push(input);
  if(!input.stream){res.writeHead(200,{"content-type":"application/json"});res.end(JSON.stringify({id:"child",object:"chat.completion",created:1,model:"fixture",choices:[{index:0,message:{role:"assistant",content:'[{"text":"已生成真实开场候选","angle":"场景"}]'},finish_reason:"stop"}],usage:{prompt_tokens:4,completion_tokens:3,total_tokens:7}}));return;}
  const roots=requests.filter(request=>request.stream).length;
  const name=roots===1?"context_projects":roots===2?"script_hooks":null;
  const delta=name?{tool_calls:[{index:0,id:`tool-${roots}`,type:"function",function:{name,arguments:"{}"}}]}:{content:"项目已读取，开场候选已准备好"};
  const chunks=[{choices:[{index:0,delta,finish_reason:null}]},{choices:[{index:0,delta:{},finish_reason:name?"tool_calls":"stop"}],usage:{prompt_tokens:2,completion_tokens:3,total_tokens:5}}];
  res.writeHead(200,{"content-type":"text/event-stream"});res.end(chunks.map(chunk=>`data: ${JSON.stringify({id:"root",object:"chat.completion.chunk",created:1,model:"fixture",...chunk})}\n\n`).join("")+"data: [DONE]\n\n");
 });
 let host:ReturnType<typeof createChatWorkerDispatcher>|undefined;
 try{
  await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));
  const runtime=await getChatRuntime(),db=fixture.db!,now=()=>new Date().toISOString();let seq=0;
  const ctx:RequestContext={userId:"assembled-chat",accountId:"a",source:"user",requestId:"test"};
  for(const accountId of ["a","b"])await compositeTransport.request({id:"projects.create"} as Endpoint,{body:{title:`装配账号${accountId}项目`,brief:""}} as never,{...ctx,accountId});
  const original=await runtime.resolveEffectiveSkillSnapshot(ctx,["chatbox.topic","creatoros.guide"]);
  await createSettingsRepository(db,{now,nextId:prefix=>`${prefix}-assembled-${++seq}`}).putAccountSkillOverlay(ctx,{skillId:"chatbox.topic",expectedRevision:null,observedBaseVersion:original.skills.find(skill=>skill.skillId==="chatbox.topic")!.baseVersion,overlay:{tools:["context.projects","script.hooks"]}});
  const repo=createAiRepository(db,{userId:ctx.userId,accountId:ctx.accountId!,now,nextId:prefix=>`${prefix}-assembled-${++seq}`});
  const conversation=await repo.createConversation({title:"真实装配",projectId:null,scope:"global"});
  const source=await repo.createMessage(conversation.id,{role:"user",content:"读取我的项目，再为选题生成开场",attachments:[],modelMetadata:{}});
  const resolveCredential=vi.fn(runtime.resolveModelSpec);
  const submitted=await createChatTurnSubmissionService(db,{assemble:async(context,snapshot)=>{
   const skills=workerSkillSnapshotSchema.parse(await runtime.resolveEffectiveSkillSnapshot(context,["chatbox.topic","creatoros.guide","topic.enrich","positioning.generate"]));
   expect(skills.skills.find(skill=>skill.skillId==="chatbox.topic")!.overlayRevision).toBe(1);
   const prepared=await prepareDurableChatTurn(context,{
    messages:snapshot.messages.map(message=>({id:message.id,role:message.role as "user"|"assistant",parts:[{type:"text" as const,text:message.content}]})),
    chatContext:{surface:"topics",selection:{kind:"candidate",ids:[],label:"用户选中的主题"}},
   },{...runtime.context,contextReaders:runtime.contextReaders,searchWeb:runtime.searchWeb,resolveModelSpec:resolveCredential,humanizeError:()=>null},skills,{workerResearch:true,scriptHooksGeneration:{version:1,maxOutputTokens:2048},structuredGeneration:{version:1,maxOutputTokens:2048}});
   expect(prepared.hostContext.scriptHooksContext!.selectionTitle).toBe("用户选中的主题");
   // Skill 工具是优先顺序；完整场景清单不能为了测试通过而裁掉。
   expect(prepared.toolDefinitions.map(tool=>tool.name)).toEqual(expect.arrayContaining(["context.projects","script.hooks","topic.generate","brief.fill"]));
   return {capability:prepared.assembly.capability,system:prepared.assembly.system,messages:JSON.parse(JSON.stringify(prepared.modelMessages)),tools:prepared.toolDefinitions,hostContext:prepared.hostContext,maxSteps:6,maxOutputTokens:128,forcedTool:prepared.assembly.forcedTool,forcedToolSequence:prepared.assembly.forcedToolSequence};
  }}).submit(ctx,{conversationId:conversation.id,sourceMessageId:source.id});
  expect(resolveCredential).not.toHaveBeenCalled();expect(requests).toHaveLength(0);
  const missingTools:string[]=[];let factoryFailure="";
  const resolveTools=createChatTaskToolHost(createChatHostContextReader(db),runtime.contextReaders,{research:true,planning:{prepareTaskCommit:runtime.ai.prepareTaskCommit,wakeTask:runtime.wakeChatPlanningTask},local:{detectTools:runtime.detectTools,listAuthorizedDirs:runtime.listAuthorizedDirs},structured:{readWorks:(context,limit)=>loadPositioningWorksBrief(context,runtime.context.positioningWorks,limit),getPositioningDiscovery:runtime.getPositioningDiscovery}});
  host=createChatWorkerDispatcher(db,{entryPath:resolve("../ai-worker/dist/execution-worker.cjs"),workerId:"assembled-chat",budget:{maxCalls:12,maxTokens:300000,deadlineMs:60000},modelConcurrency:1,pollMs:100,resolveTools:async(...args)=>{try{const tools=await resolveTools(...args);missingTools.push(...args[1].tools.filter(tool=>!Object.hasOwn(tools,tool.name)).map(tool=>tool.name));return tools;}catch(error){factoryFailure=error instanceof Error?error.message:String(error);throw error;}},resolveModelCredential:async()=>({apiFormat:"openai_chat",baseUrl:`http://127.0.0.1:${(server.address() as {port:number}).port}/v1`,model:"fixture",token:"fixture"})});
  host.start();
  await vi.waitFor(async()=>{const [task]=await db.select().from(executionTasks).where(eq(executionTasks.id,submitted.executionTaskId));expect(["queued","running"]).not.toContain(task!.status);},{timeout:15000});
  const [finished]=await db.select().from(executionTasks).where(eq(executionTasks.id,submitted.executionTaskId));
  expect(finished!.status,`任务错误=${finished!.lastErrorCode}; 模型请求=${requests.length}; 工厂错误=${factoryFailure}; 未接工具=${missingTools.join(",")}`).toBe("succeeded");
  expect(requests).toHaveLength(4);
  const roots=requests.filter(request=>request.stream);
  expect(JSON.stringify(roots[1])).toContain("装配账号a项目");expect(JSON.stringify(roots[1])).not.toContain("装配账号b项目");
  expect(JSON.stringify(requests.find(request=>!request.stream))).toContain("用户选中的主题");
  expect(JSON.stringify(roots[2])).toContain("已生成真实开场候选");
  const messages=await db.select().from(aiMessages).where(eq(aiMessages.conversationId,conversation.id));
  expect(messages).toHaveLength(2);expect(messages.find(message=>message.role==="assistant")!.content).toBe("项目已读取，开场候选已准备好");
  expect(JSON.stringify(messages.find(message=>message.role==="assistant")!.parts)).toContain("已生成真实开场候选");
  const calls=await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,submitted.executionTaskId));
  expect(calls).toHaveLength(6);expect(calls.every(call=>call.status==="settled")).toBe(true);
 }finally{
  await host?.stop();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));
  await (globalThis as {__creatorosDisposePersistence?:()=>Promise<void>}).__creatorosDisposePersistence?.();__resetPersistenceForTests();vi.unstubAllEnvs();
 }
},30000);

it("候选工具经真实 Worker 回传卡片，项目当前值和经验实体保持不变",async()=>{
 const {createChatTaskToolHost}=await import("@creatoros/backend/modules/ai-runtime");
 const {createChatWorkerDispatcher}=await import("../../../backend/src/modules/execution/model-worker-dispatcher");
 const {executionTasks,executionCalls,aiMessages,learnings,eq,and}=await import("@creatoros/backend");
 const {createServer}=await import("node:http"),{resolve}=await import("node:path"),{execFileSync}=await import("node:child_process");
 execFileSync(process.execPath,[resolve("../ai-worker/scripts/build.mjs")],{stdio:"pipe"});
 vi.stubEnv("DATABASE_URL","");vi.stubEnv("PGLITE_DATA_DIR","");__resetPersistenceForTests();
 const requests:string[]=[];
 const server=createServer(async(req,res)=>{
  let body="";for await(const chunk of req)body+=chunk.toString();requests.push(body);
  const done=JSON.parse(body).messages.some((message:{role:string})=>message.role==="tool");
  const delta=done?{content:"两个候选已准备好，请采纳"}:{tool_calls:[
   {index:0,id:"learning",type:"function",function:{name:"learning_capture",arguments:JSON.stringify({title:"保留证据",insight:"区分事实和推断",learningType:"process"})}},
   {index:1,id:"brief",type:"function",function:{name:"brief_fill",arguments:JSON.stringify({targetAudience:"新观众"})}},
  ]};
  const chunks=[{choices:[{index:0,delta,finish_reason:null}]},{choices:[{index:0,delta:{},finish_reason:done?"stop":"tool_calls"}],usage:{prompt_tokens:2,completion_tokens:3,total_tokens:5}}];
  res.writeHead(200,{"content-type":"text/event-stream"});res.end(chunks.map(chunk=>`data: ${JSON.stringify({id:"fixture",object:"chat.completion.chunk",created:1,model:"fixture",...chunk})}\n\n`).join("")+"data: [DONE]\n\n");
 });
 let host:ReturnType<typeof createChatWorkerDispatcher>|undefined;
 try{
  await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));
  const runtime=await getChatRuntime(),db=fixture.db!,now=()=>new Date().toISOString();let seq=0,briefReads=0;
  const ctx:RequestContext={userId:"candidate-worker",accountId:"a",source:"user",requestId:"test"};
  const project=await compositeTransport.request({id:"projects.create"} as Endpoint,{body:{title:"候选项目",briefDetail:{targetAudience:"原观众"}}} as never,ctx) as {data:{id:string}};
  const before=await runtime.contextReaders.getProjectBrief(ctx,{projectId:project.data.id});
  const learningRows=()=>db.select().from(learnings).where(and(eq(learnings.userId,ctx.userId),eq(learnings.accountId,ctx.accountId!)));
  const beforeLearnings=await learningRows();
  const repo=createAiRepository(db,{userId:ctx.userId,accountId:ctx.accountId!,now,nextId:prefix=>`${prefix}-candidate-${++seq}`});
  const conversation=await repo.createConversation({title:"候选工具验证",projectId:project.data.id,scope:"project"});
  const source=await repo.createMessage(conversation.id,{role:"user",content:"整理一条经验并补充目标观众",attachments:[],modelMetadata:{}});
  const definitions=(await prepareChatToolDefinitions(buildChatTools(["learning.capture","brief.fill"],{} as ChatToolDeps))).definitions;
  const snapshot=workerSkillSnapshotSchema.parse(await runtime.resolveEffectiveSkillSnapshot(ctx,["chatbox.topic","creatoros.guide"]));
  // 单独验证新工具实际 Worker 链路；完整场景装配红测仍在上方保留，不裁剪其白名单。
  const submitted=await createChatTurnSubmissionService(db,{assertProject:async(c,id)=>{if(!await runtime.contextReaders.getProjectDetail!(c,{projectId:id}))throw new Error("项目不可访问");},assemble:async()=>({capability:"copilot.assist",system:"整理候选",messages:[{role:"user",content:source.content}],tools:definitions,maxSteps:6,maxOutputTokens:128,hostContext:{schemaVersion:1,chatContext:{surface:"project",projectId:project.data.id},mediaRoute:null,positioningScratch:false,trustedScriptSources:[],skillSnapshot:snapshot}})}).submit(ctx,{conversationId:conversation.id,sourceMessageId:source.id});
  const readers={...runtime.contextReaders,getProjectBrief:async(...args:Parameters<typeof runtime.contextReaders.getProjectBrief>)=>{briefReads++;return runtime.contextReaders.getProjectBrief(...args);}};
  host=createChatWorkerDispatcher(db,{entryPath:resolve("../ai-worker/dist/execution-worker.cjs"),workerId:"candidate-worker",budget:{maxCalls:8,maxTokens:100000,deadlineMs:60000},modelConcurrency:1,pollMs:100,resolveTools:createChatTaskToolHost(createChatHostContextReader(db),readers),resolveModelCredential:async()=>({apiFormat:"openai_chat",baseUrl:`http://127.0.0.1:${(server.address() as {port:number}).port}/v1`,model:"fixture",token:"fixture"})});
  host.start();
  await vi.waitFor(async()=>{const [task]=await db.select().from(executionTasks).where(eq(executionTasks.id,submitted.executionTaskId));expect(["queued","running"]).not.toContain(task!.status);},{timeout:15000});
  const [task]=await db.select().from(executionTasks).where(eq(executionTasks.id,submitted.executionTaskId));expect(task!.status,task!.lastErrorCode??"").toBe("succeeded");
  expect(requests).toHaveLength(2);expect(briefReads).toBe(1);
  expect(requests[1]).toContain("原观众");expect(requests[1]).toContain("新观众");expect(requests[1]).toContain("保留证据");
  const messages=await db.select().from(aiMessages).where(eq(aiMessages.conversationId,conversation.id));
  const assistant=messages.find(message=>message.role==="assistant")!;expect(assistant.content).toBe("两个候选已准备好，请采纳");
  expect(JSON.stringify(assistant.parts)).toContain("新观众");expect(JSON.stringify(assistant.parts)).toContain("保留证据");
  expect(await runtime.contextReaders.getProjectBrief(ctx,{projectId:project.data.id})).toEqual(before);expect(await learningRows()).toEqual(beforeLearnings);
  const calls=await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,submitted.executionTaskId));expect(calls).toHaveLength(4);expect(calls.every(call=>call.status==="settled")).toBe(true);
  expect(calls.filter(call=>call.kind==="tool").map(call=>JSON.parse(call.resultText!).output.sideEffect)).toEqual(["proposal","proposal"]);
 }finally{
  await host?.stop();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));
  await (globalThis as {__creatorosDisposePersistence?:()=>Promise<void>}).__creatorosDisposePersistence?.();__resetPersistenceForTests();vi.unstubAllEnvs();
 }
},30000);

it("真实聊天 Worker 连续探测本机 Node 和已授权目录，结果进入下一轮模型",async()=>{
 const {createChatTaskToolHost}=await import("@creatoros/backend/modules/ai-runtime");
 const {createChatWorkerDispatcher}=await import("../../../backend/src/modules/execution/model-worker-dispatcher");
 const {executionTasks,executionCalls,eq}=await import("@creatoros/backend");
 const {createServer}=await import("node:http"),{resolve}=await import("node:path"),{execFileSync}=await import("node:child_process");
 const {mkdtempSync,writeFileSync,rmSync}=await import("node:fs"),{tmpdir}=await import("node:os");
 const {resetLocalReadGrantsForTest}=await import("./local-read-grants");
 execFileSync(process.execPath,[resolve("../ai-worker/scripts/build.mjs")],{stdio:"pipe"});
 const directory=mkdtempSync(resolve(tmpdir(),"t915-local-host-")),allowed=resolve(directory,"allowed"),foreign=resolve(directory,"foreign"),grants=resolve(directory,"grants.json");
 writeFileSync(grants,JSON.stringify({"local-worker":[allowed],"another-user":[foreign]}));
 vi.stubEnv("DATABASE_URL","");vi.stubEnv("PGLITE_DATA_DIR",resolve(directory,"db"));vi.stubEnv("CREATOROS_LOCAL_READ_GRANTS_FILE",grants);__resetPersistenceForTests();resetLocalReadGrantsForTest();
 const requests:any[]=[];
 const server=createServer(async(req,res)=>{
  let body="";for await(const chunk of req)body+=chunk.toString();requests.push(JSON.parse(body));
  const turn=requests.length,name=turn===1?"local_tools":turn===2?"local_workspace":null;
  const delta=name?{tool_calls:[{index:0,id:`local-${turn}`,type:"function",function:{name,arguments:turn===1?'{"tools":["node","unknown"]}':"{}"}}]}:{content:"已读取本机环境和授权目录"};
  const chunks=[{choices:[{index:0,delta,finish_reason:null}]},{choices:[{index:0,delta:{},finish_reason:name?"tool_calls":"stop"}],usage:{prompt_tokens:2,completion_tokens:3,total_tokens:5}}];
  res.writeHead(200,{"content-type":"text/event-stream"});res.end(chunks.map(chunk=>`data: ${JSON.stringify({id:"root",object:"chat.completion.chunk",created:1,model:"fixture",...chunk})}\n\n`).join("")+"data: [DONE]\n\n");
 });
 await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));let host:ReturnType<typeof createChatWorkerDispatcher>|undefined;
 const ctx:RequestContext={userId:"local-worker",accountId:"a",source:"user",requestId:"test"};
 try{
  const runtime=await getChatRuntime(),db=fixture.db!,snapshot=workerSkillSnapshotSchema.parse(await runtime.resolveEffectiveSkillSnapshot(ctx,["chatbox.topic","creatoros.guide"]));
  const conversation=await runtime.ai.createConversation(ctx,{title:"本机工具",scope:"global"}),source=await runtime.ai.createMessage(ctx,conversation.id,{content:"查看 Node 和我的授权目录"});
  // 专项验证真实本机端口；完整装配测试保留全部工具列表。
  const definitions=(await prepareChatToolDefinitions(buildChatTools(["local.tools","local.workspace"],{} as ChatToolDeps))).definitions;
  const submitted=await createChatTurnSubmissionService(db,{assemble:async()=>({capability:"copilot.assist",system:"读取本机工具",messages:[{role:"user",content:source.content}],tools:definitions,maxSteps:6,maxOutputTokens:128,hostContext:{schemaVersion:1,chatContext:{surface:"topics"},mediaRoute:null,positioningScratch:false,trustedScriptSources:[],skillSnapshot:snapshot}})}).submit(ctx,{conversationId:conversation.id,sourceMessageId:source.id});
  host=createChatWorkerDispatcher(db,{entryPath:resolve("../ai-worker/dist/execution-worker.cjs"),workerId:"local-host",budget:{maxCalls:8,maxTokens:100000,deadlineMs:60000},modelConcurrency:1,pollMs:100,resolveTools:createChatTaskToolHost(createChatHostContextReader(db),runtime.contextReaders,{local:{detectTools:runtime.detectTools,listAuthorizedDirs:runtime.listAuthorizedDirs}}),resolveModelCredential:async()=>({apiFormat:"openai_chat",baseUrl:`http://127.0.0.1:${(server.address() as {port:number}).port}/v1`,model:"fixture",token:"fixture"})});
  host.start();await vi.waitFor(async()=>{const [task]=await db.select().from(executionTasks).where(eq(executionTasks.id,submitted.executionTaskId));expect(task?.status,JSON.stringify(task)).toBe("succeeded");},{timeout:15000});
  expect(requests).toHaveLength(3);expect(JSON.stringify(requests[1])).toContain(process.versions.node);expect(JSON.stringify(requests[2])).toContain(allowed);expect(JSON.stringify(requests)).not.toContain(foreign);
  const calls=await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,submitted.executionTaskId));const tools=calls.filter(call=>call.kind==="tool");expect(tools).toHaveLength(2);expect(tools.every(call=>call.status==="settled")).toBe(true);
  const outputs=tools.map(call=>JSON.parse(call.resultText!).output);expect(outputs).toEqual(expect.arrayContaining([expect.objectContaining({status:"ok",sideEffect:"none",data:expect.objectContaining({kind:"local.tools",rejected:["unknown"],tools:[expect.objectContaining({name:"node",installed:true,version:process.versions.node})]})}),expect.objectContaining({status:"ok",sideEffect:"none",data:expect.objectContaining({kind:"local.workspace",dirs:[allowed]})})]));
 }finally{await host?.stop();await (globalThis as {__creatorosDisposePersistence?:()=>Promise<void>}).__creatorosDisposePersistence?.();__resetPersistenceForTests();resetLocalReadGrantsForTest();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));vi.unstubAllEnvs();rmSync(directory,{recursive:true,force:true});}
},30000);
