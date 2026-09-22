import {createServer} from "node:http";
import {randomUUID} from "node:crypto";
import {expect,it,vi} from "vitest";
import {z} from "zod";
import {createDb,executionCalls,executionTasks,eq,asc} from "@creatoros/backend";
import {chatWorkerInputSchema} from "@creatoros/contract/execution-worker";
import {runChatInWorker,type ChatWorkerPorts} from "../../../ai-worker/src/execution/chat-worker-run";
import {createPersistentTaskService} from "../modules/execution/persistent-task.service";
import {createExecutionCallLedgerService} from "../modules/execution/execution-call-ledger.service";
import {createExecutionGenerationPorts} from "../modules/execution/execution-generation-ports.service";
import {createExecutionChatToolPorts} from "../modules/execution/execution-chat-tool-ports.service";
import {createExecutionCheckpointService} from "../modules/execution/execution-checkpoint.service";
import {createExecutionStreamService} from "../modules/execution/execution-stream.service";
import {createExecutionWorkerOutcomeService} from "../modules/execution/execution-worker-outcome.service";
import * as recovery from "../modules/execution/model-call-recovery";
import {createAiRepository} from "../modules/ai/ai.repository";
import {createChatTurnSubmissionService} from "../modules/ai/chat-turn-submission.service";

it("真实Worker暂停model后：旧resume对照被checkpoint阻断，新resume同键续跑且历史工具不重放",async()=>{
 const f=await createDb(),id=randomUUID(),budget={maxCalls:10,maxTokens:100000,deadlineMs:60000};
 const ctx={userId:id,accountId:id,requestId:id,source:"user" as const};
 let input=chatWorkerInputSchema.parse({kind:"chat.run",executionEngine:"pi",contextPolicyVersion:2,recoverMissingFinal:true,
  operationKey:id,capability:"copilot.assist",userId:id,accountId:id,conversationId:id,sourceMessageId:id,system:"读取后完成报告",messages:[{role:"user",content:"读取报告并总结"}],maxSteps:12,maxOutputTokens:128,
  tools:[{name:"source.read",version:"1",effect:"none",description:"读取资料",parameters:z.toJSONSchema(z.object({}))}]});
 let requests=0,started=0,pausing=true;
 const bodies:unknown[]=[],controller=new AbortController();
 const server=createServer((req,res)=>{let body="";req.on("data",chunk=>body+=chunk);req.on("end",()=>{
  bodies.push(JSON.parse(body));requests++;
  const delta=requests===1?{tool_calls:[{index:0,id:"read-once",type:"function",function:{name:"source_read",arguments:"{}"}}]}:{content:"已根据原读取结果完成总结。"};
  const chunks=[{choices:[{index:0,delta,finish_reason:null}]},{choices:[{index:0,delta:{},finish_reason:requests===1?"tool_calls":"stop"}],usage:{prompt_tokens:2,completion_tokens:3,total_tokens:5}}];
  res.writeHead(200,{"content-type":"text/event-stream"});res.end(chunks.map(chunk=>`data: ${JSON.stringify({id:"fixture",object:"chat.completion.chunk",created:1,model:"fixture",...chunk})}\n\n`).join("")+"data: [DONE]\n\n");
 });});
 await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
 try{
  const tasks=createPersistentTaskService(f.db),repo=createAiRepository(f.db,{userId:id,accountId:id,now:()=>new Date().toISOString(),nextId:prefix=>`${prefix}-${randomUUID()}`});
  const conversation=await repo.createConversation({title:"暂停恢复",projectId:null,scope:"global"});
  const source=await repo.createMessage(conversation.id,{role:"user",content:"读取报告并总结",attachments:[],modelMetadata:{}});
  const submitted=await createChatTurnSubmissionService(f.db,{assemble:async()=>input}).submit(ctx,{conversationId:conversation.id,sourceMessageId:source.id});
  const task=(await f.db.select().from(executionTasks).where(eq(executionTasks.id,submitted.executionTaskId)))[0]!;
  input=chatWorkerInputSchema.parse((task.payload as {modelInput:unknown}).modelInput);
  const claim=async()=>{const c=(await tasks.claimTask({taskId:task.id,workerId:"fixture"}))!;return {executionTaskId:task.id,attempt:c.lease.attempt,fenceToken:c.lease.fenceToken};};
  let ref=await claim();
  const ledger=createExecutionCallLedgerService(f.db,{budget}),generation=createExecutionGenerationPorts(f.db,{budget}),checkpoint=createExecutionCheckpointService(f.db),streams=createExecutionStreamService(f.db);
  const read=vi.fn(async()=>({status:"ok" as const,summary:"真实隔离资料",evidence:[],error:null,continuation:null,sideEffect:"none" as const}));
  const host=createExecutionChatToolPorts(f.db,{budget,tools:{"source.read":{version:"1",effect:"none",parameters:z.object({}),execute:read,approve:async()=>({status:"not-applicable"})}}});
  const ports:ChatWorkerPorts={approve:async(data,signal)=>(await host.check(ref,data,signal)).status as "not-applicable",call:async(port,data,signal)=>{
   switch(port){
    case "readCheckpoint":return checkpoint.read(ref);
    case "saveCheckpoint":return checkpoint.save(ref,data);
    case "appendStreamEvents":return streams.append(ref,data);
    case "reserveGenerationCall":return generation.reserveGenerationCall(ref,data);
    case "startCall":{
     const c=await ledger.start(ref,(data as {callId:string}).callId);started++;
     if(pausing&&started===2){await tasks.command(ctx,{taskIds:[task.id],command:"pause",idempotencyKey:"pause"});controller.abort();}
     return {callId:c.id,status:c.status};
    }
    case "settleGenerationCall":return generation.settleGenerationCall(ref,data);
    case "reserveAgenticTool":return host.reserve(ref,data);
    case "startAgenticTool":return host.start(ref,data);
    case "executeAgenticTool":return host.execute(ref,data,signal);
    case "settleAgenticTool":return host.settle(ref,data);
    default:throw Error(`unbound ${port}`);
   }
  }};
  const run=(signal:AbortSignal)=>runChatInWorker(input,{apiFormat:"openai_chat",baseUrl:`http://127.0.0.1:${(server.address() as {port:number}).port}/v1`,model:"fixture",token:"fixture"},signal,ports);
  const interrupted=await run(controller.signal).then(result=>({result,error:undefined}),error=>({result:undefined,error}));
  expect({error:interrupted.error?.message,started,requests}).toEqual({error:expect.any(String),started:2,requests:1});
  await tasks.acknowledgeControl({taskId:task.id,workerId:"fixture",attempt:ref.attempt});
  const calls=()=>f.db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,task.id)).orderBy(asc(executionCalls.sequence));
  const before=await calls();expect(before).toHaveLength(3);expect(before[2]).toMatchObject({kind:"model",status:"unknown",totalTokens:null,providerResult:null});
  expect(requests).toBe(1);expect(read).toHaveBeenCalledTimes(1);pausing=false;
  // 只在隔离对照中禁用新判定，复现旧resume只排队的行为；真实Worker必须先于HTTP被阻断。
  const oldResume=vi.spyOn(recovery,"resumableChatModelCalls").mockReturnValueOnce([]);
  try{await tasks.command(ctx,{taskIds:[task.id],command:"resume",idempotencyKey:"legacy-resume"});}finally{oldResume.mockRestore();}
  ref=await claim();
  await expect(run(AbortSignal.timeout(15000))).rejects.toMatchObject({errorCode:"CHAT_CHECKPOINT_REQUIRES_RECONCILIATION"});
  expect(requests).toBe(1);expect(await calls()).toEqual(before);
  await createExecutionWorkerOutcomeService(f.db).recordFailure(ref,{outcome:"unknown_result",errorCode:"CHAT_CHECKPOINT_REQUIRES_RECONCILIATION"});
  await tasks.command(ctx,{taskIds:[task.id],command:"resume",idempotencyKey:"fixed-resume"});ref=await claim();
  await expect(run(AbortSignal.timeout(15000))).resolves.toMatchObject({outcome:"completed"});
  const after=await calls();expect(after).toHaveLength(4);expect(after.slice(0,2)).toEqual(before.slice(0,2));
  expect(after[2]).toEqual({...before[2],status:"superseded",updatedAt:expect.any(String)});
  expect(after[3]).toMatchObject({status:"settled",operationKey:before[2]!.operationKey,inputDigest:before[2]!.inputDigest,retryOfCallId:before[2]!.id,totalTokens:5});
  expect(requests).toBe(2);expect(read).toHaveBeenCalledTimes(1);expect(JSON.stringify(bodies[1])).toContain("真实隔离资料");
  expect((await ledger.inspect(ref)).spentTokens).toBe(10);
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await f.client.close();}
},25000);
