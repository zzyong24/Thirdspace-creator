import {createServer} from "node:http";
import {execFileSync} from "node:child_process";
import {resolve} from "node:path";
import {afterAll,beforeAll,expect,it} from "vitest";
import {createDb,executionCalls,executionTasks,eq,type Db} from "@creatoros/backend";
import type {WorkbenchCapability} from "@creatoros/contract/agent-workbench";
import {createAiRepository} from "../modules/ai/ai.repository";
import {createChatTurnSubmissionService} from "../modules/ai/chat-turn-submission.service";
import {createChatWorkerDispatcher} from "../modules/execution/model-worker-dispatcher";
import {createExecutionLeaseService} from "../modules/execution/execution-lease.service";
import {createExecutionStreamService} from "../modules/execution/execution-stream.service";
import {createChatWorkbenchCapabilityHost,type ChatWorkbenchCapabilityHost} from "../modules/ai-runtime/chat-workbench-capability-host";
import {defineWorkbenchChatTool} from "../modules/ai-runtime/chat-tool-gate";
import {prepareChatToolDefinitions} from "../modules/ai-runtime/chat-tool-definitions";

let db:Db,close:()=>Promise<void>;
beforeAll(async()=>{const opened=await createDb();db=opened.db;close=()=>opened.client.close();execFileSync(process.execPath,[resolve("../ai-worker/scripts/build.mjs")],{stdio:"pipe"});},30000);
afterAll(async()=>close?.());

const descriptor:WorkbenchCapability={
 name:"files.read",schemaVersion:1,description:"读取本任务文件",effects:["read"],requiredCapabilities:["task.files"],platforms:["macos"],
 inputSchema:{type:"object",properties:{path:{type:"string"}},required:["path"],additionalProperties:false},resultSchema:{type:"object"},
};

it("真实子进程通过原调用账本执行可信宿主；长回执完整保存、进度重连可读且费用只记一次",async()=>{
 const ctx={userId:"gateway-e2e-user",accountId:"gateway-e2e-account",requestId:"test",source:"user" as const};
 const now=()=>new Date().toISOString();
 const repo=createAiRepository(db,{userId:ctx.userId,accountId:ctx.accountId,now,nextId:prefix=>`${prefix}-gateway-e2e`});
 const conversation=await repo.createConversation({title:"网关 E2E",projectId:null,scope:"global"});
 const source=await repo.createMessage(conversation.id,{role:"user",content:"读取任务文件",attachments:[],modelMetadata:{}});
 const prototype=defineWorkbenchChatTool(descriptor,async()=>{throw Error("unused");});
 const [definition]=(await prepareChatToolDefinitions({"files.read":prototype},{workbenchCapabilities:[descriptor]})).definitions;
 const submitted=await createChatTurnSubmissionService(db,{now,assemble:async()=>({
  capability:"copilot.assist",system:"使用文件工具并根据结果答复",messages:[{role:"user",content:"读取任务文件"}],
  maxSteps:6,maxOutputTokens:256,tools:[definition!],workbenchCapabilities:[descriptor],workbenchPlatform:"macos",
 })}).submit(ctx,{conversationId:conversation.id,sourceMessageId:source.id});
 let requests=0,dispatches=0;const bodies:string[]=[];
 const server=createServer((req,res)=>{let body="";req.on("data",chunk=>body+=chunk);req.on("end",()=>{
  bodies.push(body);requests++;
  const delta=requests===1?{tool_calls:[{index:0,id:"file-call",type:"function",function:{name:"files_read",arguments:JSON.stringify({path:"研究/报告.md"})}}]}:{content:"已读取文件。"};
  const chunks=[{choices:[{index:0,delta,finish_reason:null}]},{choices:[{index:0,delta:{},finish_reason:requests===1?"tool_calls":"stop"}],usage:{prompt_tokens:2,completion_tokens:3,total_tokens:5}}];
  res.writeHead(200,{"content-type":"text/event-stream"});res.end(chunks.map(chunk=>`data: ${JSON.stringify({id:"fixture",object:"chat.completion.chunk",created:1,model:"fixture",...chunk})}\n\n`).join("")+"data: [DONE]\n\n");
 });});
 await new Promise<void>(ok=>server.listen(0,"127.0.0.1",ok));
 const leases=createExecutionLeaseService(db,{now}),stream=createExecutionStreamService(db,{now});
 const available:ChatWorkbenchCapabilityHost={catalog:[descriptor],platform:"macos",capabilities:["task.files"],dispatch:async(call,{onProgress})=>{
  dispatches++;
  const operationId=call.context.operationId;
  onProgress({status:"running",operationId,content:[{type:"text",text:"正在读取"}],artifactRefs:[],progressCursor:"first"});
  return {status:"succeeded" as const,operationId,content:[{type:"text" as const,text:"A".repeat(20_000)+"TAIL"}],artifactRefs:[],progressCursor:null};
 }};
 const tools=createChatWorkbenchCapabilityHost(available,
  ref=>leases.withLease(ref,"admission",async({task,context})=>({userId:context.userId,accountId:context.accountId!,taskId:task.id,attempt:task.attempt,fenceToken:task.fenceToken!,leaseId:task.leaseOwner!})),
  (ref,callId,progress)=>stream.appendWorkbenchProgress(ref,callId,progress));
 let resolutionError:unknown,frozenTools:unknown;
 const worker=createChatWorkerDispatcher(db,{entryPath:resolve("../ai-worker/dist/execution-worker.cjs"),workerId:"gateway-e2e",budget:{maxCalls:8,maxTokens:100000,deadlineMs:60000},pollMs:100,modelConcurrency:1,
  resolveTools:async(...args)=>{try{return await tools(...args);}catch(error){resolutionError=error;frozenTools=args[1].tools;throw error;}},resolveModelCredential:async()=>({apiFormat:"openai_chat",baseUrl:`http://127.0.0.1:${(server.address() as {port:number}).port}/v1`,model:"fixture",token:"fixture"}),
 });
 try{
  worker.start();
  await expect.poll(async()=>["succeeded","failed","waiting_user","unknown_result"].includes((await db.select().from(executionTasks).where(eq(executionTasks.id,submitted.executionTaskId)))[0]?.status??""),{timeout:15000}).toBe(true);
  const terminal=(await db.select().from(executionTasks).where(eq(executionTasks.id,submitted.executionTaskId)))[0]!;
  const diagnosticCalls=await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,submitted.executionTaskId));
  if(terminal.status!=="succeeded")throw Error(JSON.stringify({status:terminal.status,error:terminal.lastErrorCode,resolutionError:String(resolutionError),definition,frozenTools,calls:diagnosticCalls.map(row=>({kind:row.kind,status:row.status,result:row.resultText?.slice(0,500)})),requests,dispatches}));
  expect(requests).toBe(2);expect(dispatches).toBe(1);
  const rows=await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,submitted.executionTaskId));
  const tool=rows.find(row=>row.kind==="tool");expect(tool).toMatchObject({status:"settled"});
  expect(tool!.resultText).toContain("TAIL");
  expect(bodies[1]).toContain("原工具调用 ID:");expect(bodies[1]).not.toContain("TAIL");
  expect(rows.filter(row=>row.kind==="model").map(row=>row.totalTokens)).toEqual([5,5]);
  const page=await stream.read(ctx,submitted.executionTaskId,{afterSequence:0,limit:128});
  expect(page.events.some(event=>event.chunk.type==="data-workbench-progress" && event.callId===tool!.id)).toBe(true);
  await expect(stream.read({...ctx,accountId:"other"},submitted.executionTaskId,{afterSequence:0})).rejects.toThrow();
 }finally{await worker.stop();server.closeAllConnections();await new Promise<void>(ok=>server.close(()=>ok()));}
},30000);
