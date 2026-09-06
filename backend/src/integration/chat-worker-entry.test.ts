import { createExecutionStreamService,subscribeExecutionStream } from "../modules/execution/execution-stream.service";
import { createServer } from "node:http";
import { z } from "zod";
import { createDb,executionStreamEvents,aiMessages,aiTaskResults,executionCalls,executionTasks,eq,type Db } from "@creatoros/backend";
import { createChatTurnSubmissionService } from "../modules/ai/chat-turn-submission.service";
import { createAiRepository } from "../modules/ai/ai.repository";
import { createChatWorkerDispatcher } from "../modules/execution/model-worker-dispatcher";
import { createPersistentTaskService } from "../modules/execution/persistent-task.service";
import { afterAll,beforeAll,expect,it,vi } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { createWorkerSupervisor } from "../modules/execution/worker-supervisor";
let db:Db,close:()=>Promise<void>,sequence=0;
beforeAll(async()=>{const f=await createDb();db=f.db;close=()=>f.client.close();});
afterAll(async()=>close());
const entryPath=resolve("../ai-worker/dist/execution-worker.cjs");
beforeAll(()=>{execFileSync(process.execPath,[resolve("../ai-worker/scripts/build.mjs")],{stdio:"pipe"});},30000);
it("正式 Worker 二进制真实声明 chat.run 能力",async()=>{
 const worker=createWorkerSupervisor({entryPath,ports:{validate:async()=>{},invoke:async()=>{throw Error("本用例只探测能力");}}});
 try{expect(await worker.start()).toContain("chat.run");}finally{await worker.stop();}
});

it.each(["text","tool","retry","approval","denied","cancel","unknown","partial","missing-tools","revoked","login","late-denied","live"])("正式聊天子进程通过宿主完成并保留执行事实：%s",async mode=>{
 const ctx={userId:"chat-entry-u",accountId:`chat-entry-a-${++sequence}`,requestId:"test",source:"user" as const};
 const now=()=>new Date().toISOString(),budget={maxCalls:10,maxTokens:100000,deadlineMs:60000};
 const repo=createAiRepository(db,{userId:ctx.userId,accountId:ctx.accountId,now,nextId:prefix=>`${prefix}-entry-${++sequence}`});
 const conversation=await repo.createConversation({title:"真实 Worker",projectId:null,scope:"global"});
 const source=await repo.createMessage(conversation.id,{role:"user",content:"查找来源",attachments:[],modelMetadata:{}});
 const parameters=z.object({query:z.string()}).strict();
 const usesTool=!["text","retry","cancel","partial","live"].includes(mode);
 const submission=await createChatTurnSubmissionService(db,{now,assemble:async()=>({capability:"copilot.assist",system:"使用已授权工具查找来源",messages:[{role:"user",content:"查找来源"}],maxSteps:6,maxOutputTokens:128,tools:usesTool?[{name:"web.read",version:"1",effect:"none",description:"读取资料",parameters:z.record(z.string(),z.json()).parse(z.toJSONSchema(parameters))}]:[]})}).submit(ctx,{conversationId:conversation.id,sourceMessageId:source.id});
 const responseGate:{finish?:()=>void}={};
 let requests=0,grant=false,disconnected=false;const bodies:string[]=[];
 const server=createServer((req,res)=>{let body="";req.on("data",chunk=>{body+=chunk;});req.on("end",()=>{
  requests++;bodies.push(body);
  if(mode==="cancel"){res.writeHead(200,{"content-type":"text/event-stream"});res.write(": waiting\n\n");res.on("close",()=>{disconnected=true;});return;}
  if(mode==="retry" && requests===1){res.writeHead(429,{"content-type":"application/json","retry-after":"1"});res.end('{"error":{"message":"fixture rate limited"}}');return;}
  const hasTool=JSON.parse(body).messages.some((item:{role:string})=>item.role==="tool");
  const tool=usesTool && (!hasTool || (["revoked","login"].includes(mode) && !body.includes("https://source.test/evidence")));
  const delta=tool?{tool_calls:[{index:0,id:requests===1?"read-source":`read-source-${requests}`,type:"function",function:{name:"web_read",arguments:'{"query":"真实查询"}'}}]}:{content:"最终回复"};
  const chunks=[{choices:[{index:0,delta,finish_reason:null}]},{choices:[{index:0,delta:{},finish_reason:tool?"tool_calls":mode==="partial"?"length":"stop"}],usage:{prompt_tokens:2,completion_tokens:3,total_tokens:5}}];
  if(mode==="live"){
    const encode=(chunk:unknown)=>`data: ${JSON.stringify({id:"fixture",object:"chat.completion.chunk",created:1,model:"fixture",...chunk as object})}\n\n`;
    res.writeHead(200,{"content-type":"text/event-stream"});res.write(encode(chunks[0]));responseGate.finish=()=>res.end(encode(chunks[1])+"data: [DONE]\n\n");return;
  }
  res.writeHead(200,{"content-type":"text/event-stream"});res.end(chunks.map(chunk=>`data: ${JSON.stringify({id:"fixture",object:"chat.completion.chunk",created:1,model:"fixture",...chunk})}\n\n`).join("")+"data: [DONE]\n\n");
 });});
 await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));
 const execute=vi.fn(async(context:unknown,args:unknown)=>{
  expect(context).toMatchObject({userId:ctx.userId,accountId:ctx.accountId});expect(args).toEqual({query:"真实查询"});
  if(mode==="login" && !grant)return {status:"blocked" as const,summary:"需要登录",evidence:[],error:{code:"needs_login" as const,retryable:false,recovery:"完成登录后恢复"},continuation:null,sideEffect:"none" as const};
  if(mode==="unknown")throw Error("fixture提交结果未知");
  return {status:"ok" as const,summary:"真实来源",data:{kind:"source-card",url:"https://source.test/evidence"},evidence:[{sourceUrl:"https://source.test/evidence"}],error:null,continuation:null,sideEffect:"none" as const};
 });
 let approvalChecks=0;
 const approve=vi.fn(async()=>{approvalChecks++;return (mode==="denied" || (mode==="late-denied" && approvalChecks>1))?{status:"denied" as const,reason:"用户拒绝"}:(mode==="approval" || (mode==="revoked" && approvalChecks>1))&&!grant?{status:"user-approval" as const}:{status:"not-applicable" as const};});
 const host=createChatWorkerDispatcher(db,{entryPath,workerId:"chat-host",budget,pollMs:100,modelConcurrency:1,tools:mode==="missing-tools"?{}:{"web.read":{version:"1",effect:"none",parameters,execute,approve}},resolveModelCredential:async(context,capability)=>{
  expect(context).toMatchObject({userId:ctx.userId,accountId:ctx.accountId});expect(capability).toBe("copilot.assist");
  return {apiFormat:"openai_chat",baseUrl:`http://127.0.0.1:${(server.address() as {port:number}).port}/v1`,model:"fixture",token:"fixture"};
 }});
 const state=async()=>(await db.select().from(executionTasks).where(eq(executionTasks.id,submission.executionTaskId)))[0]!;
 try{
  host.start();
  if(mode==="live"){
    const stream=createExecutionStreamService(db);
    await vi.waitFor(async()=>expect((await stream.read(ctx,submission.executionTaskId)).events.some(event=>event.chunk.type==="text-delta")).toBe(true));
    expect((await state()).status).toBe("running");
    const stop=new AbortController(),subscription=subscribeExecutionStream(stream,ctx,submission.executionTaskId,{signal:stop.signal});
    const first=await subscription.next();expect(first.done).toBe(false);
    stop.abort();expect((await subscription.next()).done).toBe(true);
    expect((await state()).status).toBe("running");expect(requests).toBe(1);
    const cursor=first.value!.nextSequence;expect((await stream.read(ctx,submission.executionTaskId,{afterSequence:cursor})).events).toEqual([]);
    responseGate.finish!();
  }
  if(mode==="cancel"){
   await vi.waitFor(()=>expect(requests).toBe(1));await createPersistentTaskService(db).command(ctx,{taskIds:[submission.executionTaskId],command:"cancel",idempotencyKey:"cancel"});
   await vi.waitFor(async()=>expect((await state()).status).toBe("cancelled"));expect(disconnected).toBe(true);
  }else if(mode==="unknown" || mode==="missing-tools"){
   await vi.waitFor(async()=>expect((await state()).status).toBe(mode==="unknown"?"unknown_result":"failed"));
   expect(requests).toBe(mode==="unknown"?1:0);expect(execute).toHaveBeenCalledTimes(mode==="unknown"?1:0);
  }else{
   if(["approval","revoked","login","late-denied"].includes(mode)){
    await vi.waitFor(async()=>expect((await state()).status).toBe("waiting_user"));
    const waiting=await state();expect(waiting.lastErrorCode).toBe(mode==="approval"?"CHAT_APPROVAL_REQUIRED":"CHAT_TOOL_REQUIRES_USER");expect(execute).toHaveBeenCalledTimes(mode==="login"?1:0);expect(requests).toBe(1);
    grant=true;await createPersistentTaskService(db).command(ctx,{taskIds:[submission.executionTaskId],command:"resume",idempotencyKey:"allow-and-resume"});
   }
   await vi.waitFor(async()=>expect((await state()).status).toBe(mode==="partial"?"partial":"succeeded"),{timeout:15000});
   const streamEvents=await db.select().from(executionStreamEvents).where(eq(executionStreamEvents.executionTaskId,submission.executionTaskId));
   expect(streamEvents.filter(event=>event.chunk.type==="text-delta").map(event=>event.chunk.delta).join("")).toBe("最终回复");
   expect(streamEvents.filter(event=>event.chunk.type==="text-start")).toHaveLength(1);
   const rows=await db.select().from(aiMessages).where(eq(aiMessages.conversationId,conversation.id));expect(rows).toHaveLength(2);expect(rows.find(row=>row.role==="assistant")).toMatchObject({content:"最终回复"});
   expect(await db.select().from(aiTaskResults).where(eq(aiTaskResults.aiTaskId,submission.taskId))).toHaveLength(1);
   expect(execute).toHaveBeenCalledTimes(mode==="login"?2:usesTool && !["denied","late-denied"].includes(mode)?1:0);expect(requests).toBe(["revoked","login"].includes(mode)?3:usesTool || mode==="retry"?2:1);
   if(usesTool && !["denied","late-denied"].includes(mode))expect(bodies.at(-1)).toContain("https://source.test/evidence");
   if(["approval","revoked","login","late-denied"].includes(mode))expect((await state()).attempt).toBe(2);
  }
  const calls=await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,submission.executionTaskId));
  if(mode==="retry")expect(calls.map(call=>call.status)).toEqual(["rejected","settled"]);
  if(["cancel","unknown","missing-tools"].includes(mode))expect(await db.select().from(aiTaskResults).where(eq(aiTaskResults.aiTaskId,submission.taskId))).toHaveLength(0);
 }finally{await host.stop();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
},20000);
