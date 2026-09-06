import {it,expect,vi} from "vitest";
import type {Db} from "@creatoros/backend";
const captured=vi.hoisted(()=>({db:undefined as Db|undefined}));
vi.mock("@creatoros/backend",async original=>{
 const actual=await original<typeof import("@creatoros/backend")>();
 return {...actual,createConfiguredDb:async(...args:Parameters<typeof actual.createConfiguredDb>)=>{const result=await actual.createConfiguredDb(...args);captured.db=result.db;return result;}};
});
import {mkdtemp,writeFile,realpath,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {getChatRuntime,__resetPersistenceForTests} from "./persistence-client";
import {grantOnce,checkGrant,resetLocalReadGrantsForTest} from "./local-read-grants";

it("正式本地读取取消后不消费一次授权，随后正常读取仍可成功",async()=>{
 const directory=await realpath(await mkdtemp(join(tmpdir(),"local-read-")));
 vi.stubEnv("DATABASE_URL","");vi.stubEnv("PGLITE_DATA_DIR","");
 vi.stubEnv("CREATOROS_LOCAL_READ_GRANTS_FILE",join(directory,"grants.json"));
 __resetPersistenceForTests();resetLocalReadGrantsForTest();
 try{
  const path=join(directory,"note.txt");await writeFile(path,"真实本地正文");
  const runtime=await getChatRuntime();
  const context={userId:"local-reader",accountId:"local-account",requestId:"local-request",source:"user" as const};
  grantOnce(context.userId,path);
  const controller=new AbortController();controller.abort();
  await expect(runtime.readLocalFile(context,{path,signal:controller.signal})).rejects.toMatchObject({name:"AbortError"});
  expect(checkGrant(context.userId,path)).toBe("once");
  await expect(runtime.readLocalFile(context,{path})).resolves.toMatchObject({status:"file",fullText:"真实本地正文"});
  expect(checkGrant(context.userId,path)).toBeNull();
 }finally{
  await (globalThis as {__creatorosDisposePersistence?:()=>Promise<void>}).__creatorosDisposePersistence?.();
  __resetPersistenceForTests();resetLocalReadGrantsForTest();vi.unstubAllEnvs();await rm(directory,{recursive:true,force:true});
 }
},30000);

it.each(["normal","resume","unknown"])("真实 Worker 本地读取（%s）：恢复、回放与未知结果边界",async mode=>{
 const recover=mode==="resume",unknown=mode==="unknown";
 const {createChatTaskToolHost,buildChatTools}=await import("@creatoros/backend/modules/ai-runtime");
 const {prepareChatToolDefinitions}=await import("../../../backend/src/modules/ai-runtime/chat-tool-definitions");
 const {createChatWorkerDispatcher}=await import("../../../backend/src/modules/execution/model-worker-dispatcher");
 const {createChatHostContextReader}=await import("../../../backend/src/modules/ai/chat-host-context.service");
 const {createChatTurnSubmissionService}=await import("../../../backend/src/modules/ai/chat-turn-submission.service");
 const {createExecutionChatToolPorts}=await import("../../../backend/src/modules/execution/execution-chat-tool-ports.service");
 const {executionTasks,executionCalls,eq}=await import("@creatoros/backend");
 const {workerSkillSnapshotSchema,chatWorkerInputSchema}=await import("@creatoros/contract/execution-worker");
 const {createServer}=await import("node:http"),{resolve}=await import("node:path"),{execFileSync}=await import("node:child_process");
 execFileSync(process.execPath,[resolve("../ai-worker/scripts/build.mjs")],{stdio:"pipe"});
 const directory=await realpath(await mkdtemp(join(tmpdir(),"local-worker-"))),path=join(directory,"note.txt");
 await writeFile(path,"一次授权读取的原始正文");
 vi.stubEnv("DATABASE_URL","");vi.stubEnv("PGLITE_DATA_DIR",join(directory,"db"));vi.stubEnv("CREATOROS_LOCAL_READ_GRANTS_FILE",join(directory,"grants.json"));
 __resetPersistenceForTests();resetLocalReadGrantsForTest();
 const requests:Record<string,unknown>[]=[];let release!:()=>void;
 const hold=new Promise<void>(r=>{release=r;});
 const server=createServer(async(req,res)=>{
  let body="";for await(const chunk of req)body+=chunk.toString();requests.push(JSON.parse(body));
  const first=requests.length===1,reading=first || (recover && requests.length===2);if(!reading)await hold;
  const delta=reading?{tool_calls:[{index:0,id:`read-${requests.length}`,type:"function",function:{name:"local_read",arguments:JSON.stringify({path:recover && first?"note.txt":path})}}]}:{content:"已读取原始正文"};
  const chunks=[{choices:[{index:0,delta,finish_reason:null}]},{choices:[{index:0,delta:{},finish_reason:reading?"tool_calls":"stop"}],usage:{prompt_tokens:2,completion_tokens:3,total_tokens:5}}];
  res.writeHead(200,{"content-type":"text/event-stream"});res.end(chunks.map(chunk=>`data: ${JSON.stringify({id:"root",object:"chat.completion.chunk",created:1,model:"fixture",...chunk})}\n\n`).join("")+"data: [DONE]\n\n");
 });
 await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));let host:ReturnType<typeof createChatWorkerDispatcher>|undefined;
 const ctx={userId:"local-worker",accountId:"a",source:"user" as const,requestId:"test"};
 try{
  const runtime=await getChatRuntime(),db=captured.db!,snapshot=workerSkillSnapshotSchema.parse(await runtime.resolveEffectiveSkillSnapshot(ctx,["chatbox.topic","creatoros.guide"]));
  if(!recover)grantOnce(ctx.userId,path);
  const conversation=await runtime.ai.createConversation(ctx,{title:"本地读取",scope:"global"}),source=await runtime.ai.createMessage(ctx,conversation.id,{content:"读取已授权文件"});
  const definitions=(await prepareChatToolDefinitions(buildChatTools(["local.read"],{} as never))).definitions;
  const submitted=await createChatTurnSubmissionService(db,{assemble:async()=>({capability:"copilot.assist",system:"读取本地文件",messages:[{role:"user",content:source.content}],tools:definitions,maxSteps:6,maxOutputTokens:128,hostContext:{schemaVersion:1,chatContext:{surface:"topics"},mediaRoute:null,positioningScratch:false,trustedScriptSources:[],skillSnapshot:snapshot}})}).submit(ctx,{conversationId:conversation.id,sourceMessageId:source.id});
  const {createLocalReadHost}=await import("@creatoros/backend/modules/ai-runtime");
  const local=createLocalReadHost({checkGrant,consumeOnce:(await import("./local-read-grants")).consumeOnce,listAlwaysDirs:()=>[directory]},{homedir:()=>directory});
  const readLocalFile=vi.fn(async(...args:Parameters<typeof runtime.readLocalFile>)=>{
   const result=await (recover?local.readLocalFile:runtime.readLocalFile)(...args);
   if(unknown)throw new Error("fixture: 读取完成但未交付回执");
   return result;
  }),budget={maxCalls:8,maxTokens:100000,deadlineMs:60000};
  const resolver=createChatTaskToolHost(createChatHostContextReader(db),runtime.contextReaders,{localRead:{readLocalFile,decideLocalReadAccess:runtime.decideLocalReadAccess}} as never);
  host=createChatWorkerDispatcher(db,{entryPath:resolve("../ai-worker/dist/execution-worker.cjs"),workerId:"local-reader",budget,modelConcurrency:1,pollMs:100,resolveTools:resolver,resolveModelCredential:async()=>({apiFormat:"openai_chat",baseUrl:`http://127.0.0.1:${(server.address() as {port:number}).port}/v1`,model:"fixture",token:"fixture"})});
  host.start();
  if(unknown){
   await vi.waitFor(async()=>{const [task]=await db.select().from(executionTasks).where(eq(executionTasks.id,submitted.executionTaskId));expect(task?.status).toBe("unknown_result");},{timeout:12000});
   const calls=await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,submitted.executionTaskId));
   expect(calls.filter(call=>call.kind==="tool").map(call=>call.status)).toEqual(["unknown"]);
   expect(requests).toHaveLength(1);expect(readLocalFile).toHaveBeenCalledTimes(1);expect(checkGrant(ctx.userId,path)).toBeNull();
   const {createPersistentTaskService}=await import("@creatoros/backend/modules/execution");
   await expect(createPersistentTaskService(db).command(ctx,{taskIds:[submitted.executionTaskId],command:"resume",idempotencyKey:"unsafe-retry"})).rejects.toThrow();
   expect(readLocalFile).toHaveBeenCalledTimes(1);return;
  }
  if(recover){
   await vi.waitFor(async()=>{const [task]=await db.select().from(executionTasks).where(eq(executionTasks.id,submitted.executionTaskId));expect(task?.status).toBe("waiting_user");},{timeout:12000});
   grantOnce(ctx.userId,path);
   const {createPersistentTaskService}=await import("@creatoros/backend/modules/execution");
   await createPersistentTaskService(db).command(ctx,{taskIds:[submitted.executionTaskId],command:"resume",idempotencyKey:"user-authorized-file"});
  }
  await vi.waitFor(()=>expect(requests).toHaveLength(recover?3:2),{timeout:12000});
  expect(JSON.stringify(requests.at(-1))).toContain("一次授权读取的原始正文");expect(checkGrant(ctx.userId,path)).toBeNull();
  await writeFile(path,"已变化的文件内容，不应被回放读取");
  const [task]=await db.select().from(executionTasks).where(eq(executionTasks.id,submitted.executionTaskId));
  const ref={executionTaskId:task!.id,attempt:task!.attempt,fenceToken:task!.fenceToken!};
  const tools=await resolver(ctx,chatWorkerInputSchema.parse((task!.payload as {modelInput:unknown}).modelInput),ref,new AbortController().signal);
  const calls=await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,task!.id));const tool=calls.find(call=>call.kind==="tool" && call.resultText && JSON.parse(call.resultText).output?.data?.file)!;
  expect(tool.status).toBe("settled");
  // 新建服务实例只读数据库原回执，不依赖原宿主闭包缓存。
  const replay=await createExecutionChatToolPorts(db,{budget,tools}).execute(ref,{callId:tool.id});
  expect(replay).toMatchObject({status:"ok",sideEffect:"committed",data:{kind:"local.read",file:{text:"一次授权读取的原始正文"}}});
  expect(readLocalFile).toHaveBeenCalledTimes(recover?2:1);release();
  await vi.waitFor(async()=>{const [current]=await db.select().from(executionTasks).where(eq(executionTasks.id,task!.id));expect(current?.status).toBe("succeeded");},{timeout:10000});
 }finally{
  release();await host?.stop();await (globalThis as {__creatorosDisposePersistence?:()=>Promise<void>}).__creatorosDisposePersistence?.();
  __resetPersistenceForTests();resetLocalReadGrantsForTest();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));vi.unstubAllEnvs();await rm(directory,{recursive:true,force:true});
 }
},45000);
