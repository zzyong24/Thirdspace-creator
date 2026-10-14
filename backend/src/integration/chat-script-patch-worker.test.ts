import * as supervisorModule from "../modules/execution/worker-supervisor";
import {createServer} from "node:http";
import {execFileSync} from "node:child_process";
import {resolve} from "node:path";
import {beforeAll,afterAll,it,expect,vi} from "vitest";
import {createDb,executionCalls,executionTasks,aiMessages,eq,type Db} from "@creatoros/backend";
import {createAiRepository} from "../modules/ai/ai.repository";
import {createChatTurnSubmissionService} from "../modules/ai/chat-turn-submission.service";
import {createChatHostContextReader} from "../modules/ai/chat-host-context.service";
import type {ChatHostContext} from "../modules/ai/chat-host-context";
import {createChatWorkerDispatcher} from "../modules/execution/model-worker-dispatcher";
import * as toolPorts from "../modules/execution/execution-chat-tool-ports.service";
import {createChatTaskToolHost} from "../modules/ai-runtime/chat-task-tool-host";
import {buildChatTools,type ChatToolDeps} from "../modules/ai-runtime/chat-tools";
import {prepareChatToolDefinitions} from "../modules/ai-runtime/chat-tool-definitions";
import type {ContextReaders} from "../modules/ai-runtime/chat-assembly-types";
let db:Db,close:()=>Promise<void>,seq=0;
const entryPath=resolve("../ai-worker/dist/execution-worker.cjs");
beforeAll(async()=>{const f=await createDb();db=f.db;close=()=>f.client.close();execFileSync(process.execPath,[resolve("../ai-worker/scripts/build.mjs")],{stdio:"pipe",timeout:180000});},180000);
afterAll(async()=>close());
it.each(["success","unchanged","lostAck","crashAfterPatch"])("真实 Worker 局部改稿只产原版本候选：%s",async mode=>{
 let clockOffset=0;
 const ctx={userId:"patch-worker-u",accountId:`patch-worker-${++seq}`,requestId:"test",source:"user" as const},now=()=>new Date(Date.now()+clockOffset).toISOString();
 const repo=createAiRepository(db,{userId:ctx.userId,accountId:ctx.accountId,now,nextId:prefix=>`${prefix}-${++seq}`});
 const conversation=await repo.createConversation({title:"改这一段",projectId:null,scope:"global"});
 const source=await repo.createMessage(conversation.id,{role:"user",content:"改这一段",attachments:[],modelMetadata:{}});
 const anchor={artifactId:"artifact",versionId:"version-1",sectionId:"section-1",originalText:"原始段落"};
 const definitions=(await prepareChatToolDefinitions(buildChatTools(["script.patch"],{scriptPatchAnchor:anchor} as ChatToolDeps))).definitions;
 const hostContext:ChatHostContext={schemaVersion:1,chatContext:{surface:"topics",selection:{kind:"script_section",ids:[anchor.sectionId],artifactId:anchor.artifactId,versionId:anchor.versionId,excerpt:anchor.originalText}},mediaRoute:null,positioningScratch:false,trustedScriptSources:[],skillSnapshot:{snapshotVersion:1,userId:ctx.userId,accountId:ctx.accountId,resolvedAt:"fixed",platformPolicyVersion:"1",platformPolicy:"候选",skills:[{skillId:"chatbox.topic",baseVersion:"1",overlayRevision:null,overlayVersion:null,effective:{methodSystem:"策略",template:"",tools:["script.patch"],requiredFacets:[],contextRequirements:[],outputSchema:null,completionPolicy:null,completionPolicyAdapter:null}}]}};
 const submitted=await createChatTurnSubmissionService(db,{now,assemble:async()=>({capability:"copilot.assist",system:"只修改选中段",messages:[{role:"user",content:"改这一段"}],maxSteps:4,maxOutputTokens:128,tools:definitions,hostContext})}).submit(ctx,{conversationId:conversation.id,sourceMessageId:source.id});
 const requests:Record<string,unknown>[]=[];
 const server=createServer(async(req,res)=>{
  let body="";for await(const chunk of req)body+=chunk.toString();const input=JSON.parse(body);requests.push(input);
  expect(input.stream).toBe(true);
  const first=requests.length===1,delta=first?{tool_calls:[{index:0,id:"patch",type:"function",function:{name:"script_patch",arguments:JSON.stringify({replacementText:mode==="unchanged"?"原始段落":"新的单段正文",summary:"单段修改"})}}]}:{content:"请确认候选"};
  res.writeHead(200,{"content-type":"text/event-stream"});res.end([{choices:[{index:0,delta,finish_reason:null}]},{choices:[{index:0,delta:{},finish_reason:first?"tool_calls":"stop"}],usage:{prompt_tokens:2,completion_tokens:3,total_tokens:5}}].map(chunk=>`data: ${JSON.stringify({id:"root",object:"chat.completion.chunk",created:1,model:"fixture",...chunk})}\n\n`).join("")+"data: [DONE]\n\n");
 });
 await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));
 const current={...anchor},resolveSelection=vi.fn(async()=>({...current})),resolveTools=createChatTaskToolHost(createChatHostContextReader(db,{now}),{} as ContextReaders,{scriptPatch:{resolveSelection}});
 const originalSupervisor=supervisorModule.createWorkerSupervisor;
 let stopExecution:ReturnType<typeof originalSupervisor>["stopExecutionTree"]|undefined;
 const supervisorSpy=mode==="crashAfterPatch"?vi.spyOn(supervisorModule,"createWorkerSupervisor").mockImplementation(options=>{const supervisor=originalSupervisor(options);stopExecution=ref=>supervisor.stopExecutionTree(ref);return supervisor;}):undefined;
 const original=toolPorts.createExecutionChatToolPorts;let lost=false;
 const spy=(mode==="lostAck" || mode==="crashAfterPatch")?vi.spyOn(toolPorts,"createExecutionChatToolPorts").mockImplementation((...args)=>{const ports=original(...args);return {...ports,async execute(...input){const result=await ports.execute(...input);if(mode==="crashAfterPatch"){expect(await stopExecution!(input[0])).toBe(true);return result;}if(!lost){lost=true;throw new Error("fixture lost committed tool receipt");}return result;}};}):undefined;
 const createHost=()=>createChatWorkerDispatcher(db,{now,entryPath,workerId:"patch-host",budget:{maxCalls:6,maxTokens:100000,deadlineMs:mode==="crashAfterPatch"?300000:180000},modelConcurrency:1,resolveTools,resolveModelCredential:async()=>({apiFormat:"openai_chat",baseUrl:`http://127.0.0.1:${(server.address() as {port:number}).port}/v1`,model:"fixture",token:"fixture"})});
 let host=createHost();
 try{
  await host.drainOnce();
  if(mode==="crashAfterPatch"){
   const [interrupted]=await db.select().from(executionTasks).where(eq(executionTasks.id,submitted.executionTaskId));
   expect(interrupted!.status).toBe("running");expect(requests).toHaveLength(1);
   await host.stop();spy?.mockRestore();supervisorSpy?.mockRestore();
   current.versionId="version-2";current.originalText="用户已经保存另一版正文";
   clockOffset=Date.parse(interrupted!.leaseExpiresAt!)-Date.now()+1;host=createHost();await host.drainOnce();
  }
  expect((await db.select().from(executionTasks).where(eq(executionTasks.id,submitted.executionTaskId)))[0]!.status).toBe(mode==="unchanged"?"partial":"succeeded");
  expect(requests).toHaveLength(2);
  const calls=await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,submitted.executionTaskId));
  expect(calls.filter(call=>call.kind==="tool")).toHaveLength(1);expect(calls.filter(call=>call.parentCallId)).toHaveLength(0);
  const output=JSON.parse(calls.find(call=>call.kind==="tool")!.resultText!).output;
  if(mode==="unchanged")expect(output).toMatchObject({status:"error",sideEffect:"none"});
  else expect(output).toMatchObject({status:"ok",sideEffect:"proposal",data:{kind:"script.patch",...anchor,replacementText:"新的单段正文"}});
  const messages=await db.select().from(aiMessages).where(eq(aiMessages.conversationId,conversation.id));
  expect(messages.filter(message=>message.role==="assistant")).toHaveLength(1);
  expect(JSON.stringify(messages.find(message=>message.role==="assistant")!.parts)).toContain("script.patch");
  expect(anchor.originalText).toBe("原始段落");expect(resolveSelection).toHaveBeenCalledTimes(1);if(mode==="lostAck")expect(lost).toBe(true);
 }finally{spy?.mockRestore();supervisorSpy?.mockRestore();await host.stop();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
},540000);
