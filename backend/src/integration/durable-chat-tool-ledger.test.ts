import { createServer } from "node:http";
import { it, expect, vi } from "vitest";
import { type ModelMessage } from "ai";
import { z } from "zod";
import { createDb, executionTasks, eq } from "@creatoros/backend";
import { runChatInWorker } from "@creatoros/ai-worker/chat-worker-run";
import { chatWorkerInputSchema } from "@creatoros/contract/execution-worker";
import { createAiRepository } from "../modules/ai/ai.repository";
import { createChatTurnSubmissionService } from "../modules/ai/chat-turn-submission.service";
import { createPersistentTaskService } from "../modules/execution/persistent-task.service";
import { createExecutionCallLedgerService } from "../modules/execution/execution-call-ledger.service";
import { createExecutionGenerationPorts } from "../modules/execution/execution-generation-ports.service";
import { createExecutionCheckpointService } from "../modules/execution/execution-checkpoint.service";
import { createExecutionAgenticToolPorts } from "../modules/execution/execution-agentic-tool-ports.service";

it.each(["completed","unknown","approval","denied","empty","length","http429"])("真实聊天 Worker 回合绑定账本并恢复：%s", async mode => {
  const f=await createDb();
  const ctx={userId:"chat-u",accountId:"chat-a",requestId:"fixture",source:"user" as const};
  const now=()=>new Date().toISOString(),budget={maxCalls:6,maxTokens:100000,deadlineMs:60000};
  const messages:ModelMessage[]=[{role:"user",content:"查询资料"}];
  const parameters=z.object({query:z.string()}).strict();
  let input=chatWorkerInputSchema.parse({kind:"chat.run",operationKey:"chat-turn",capability:"copilot.assist",userId:ctx.userId,accountId:ctx.accountId,
    conversationId:"conversation",sourceMessageId:"source-message",system:"查找真实来源",messages,maxSteps:6,maxOutputTokens:128,
    tools:[{name:"web.read",version:"1",description:"读取来源",parameters:z.toJSONSchema(parameters),effect:"none"}]});
  let requests=0,approved=false;const bodies:string[]=[];
  const server=createServer((req,res)=>{
    let body="";req.on("data",chunk=>{body+=chunk;});req.on("end",()=>{
      requests++;
      if(mode==="http429"){res.writeHead(429,{"content-type":"application/json","retry-after":"1"});res.end(JSON.stringify({error:{message:"fixture rate limit"}}));return;}
      const parsed=JSON.parse(body);
      const hasResult=parsed.messages.some((message:{role:string})=>message.role==="tool");
      if(hasResult)bodies.push(body);
      const delta=mode==="empty"?{content:""}:hasResult ? {content:mode==="denied"?"未执行读取":"有来源的结论"} : {tool_calls:[{index:0,id:"read-1",type:"function",function:{name:"web_read",arguments:'{"query":"真实查询"}'}}]};
      const chunks=[{choices:[{index:0,delta,finish_reason:null}]},{choices:[{index:0,delta:{},finish_reason:mode==="empty"?"stop":hasResult?(mode==="length"?"length":"stop"):"tool_calls"}],usage:{prompt_tokens:2,completion_tokens:3,total_tokens:5}}];
      res.writeHead(200,{"content-type":"text/event-stream"});
      res.end(chunks.map(chunk=>`data: ${JSON.stringify({id:"fixture",object:"chat.completion.chunk",created:1,model:"fixture",...chunk})}\n\n`).join("")+"data: [DONE]\n\n");
    });
  });
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
  try {
    const tasks=createPersistentTaskService(f.db,{now});
    const repo=createAiRepository(f.db,{userId:ctx.userId,accountId:ctx.accountId,now,nextId:prefix=>`${prefix}-ledger`});
    const conversation=await repo.createConversation({title:"持久聊天",projectId:null,scope:"global"});
    const source=await repo.createMessage(conversation.id,{role:"user",content:"查询资料",attachments:[],modelMetadata:{}});
    const submission=await createChatTurnSubmissionService(f.db,{
      now,
      assemble:async(_ctx,snapshot)=>({
        ...input,
        messages:snapshot.messages.map(row=>({role:row.role as "user",content:row.content})),
      }),
    }).submit(ctx,{conversationId:conversation.id,sourceMessageId:source.id});
    const [task]=(await f.db.select().from(executionTasks).where(eq(executionTasks.id,submission.executionTaskId)));
    if(!task)throw Error("task missing");
    input=chatWorkerInputSchema.parse((task.payload as {modelInput:unknown}).modelInput);
    const claim=(await tasks.claimTask({taskId:task.id,workerId:"worker"}))!;
    const ref={executionTaskId:task.id,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
    const ledger=createExecutionCallLedgerService(f.db,{now,budget}),generation=createExecutionGenerationPorts(f.db,{now,budget});
    const execute=vi.fn(async(actualCtx:unknown,args:unknown)=>{
      expect(actualCtx).toMatchObject({userId:ctx.userId,accountId:ctx.accountId});expect(args).toEqual({query:"真实查询"});
      if(mode==="unknown")throw Error("执行提交未知");
      return {status:"ok" as const,summary:"查到来源",data:{kind:"source-card",url:"https://source.test/real",text:"真实正文"},evidence:[{sourceUrl:"https://source.test/real"}],error:null,continuation:null,sideEffect:"none" as const};
    });
    const host=createExecutionAgenticToolPorts(f.db,{now,budget,tools:{"web.read":{version:"1",parameters,effect:"none",execute}}});
    const spec={apiFormat:"openai_chat" as const,baseUrl:`http://127.0.0.1:${(server.address() as {port:number}).port}/v1`,model:"fixture",token:"fixture"};
    const checkpoints=createExecutionCheckpointService(f.db,{now});
    async function run(){
      const chunks:unknown[]=[];
      const result=await runChatInWorker(input,spec,new AbortController().signal,{
        approve:async()=>mode==="denied"?"denied":mode==="approval"?(approved?"approved":"user-approval"):"not-applicable",
        onChunk:async(chunk)=>{chunks.push(chunk);},
        call:async(port,data,signal)=>{
          switch(port){
            case "readCheckpoint":return checkpoints.read(ref);
            case "saveCheckpoint":return checkpoints.save(ref,data);
            case "reserveGenerationCall":return generation.reserveGenerationCall(ref,data);
            case "startCall":{const row=await ledger.start(ref,(data as {callId:string}).callId);return {callId:row.id,status:row.status};}
            case "settleGenerationCall":return generation.settleGenerationCall(ref,data);
            case "reserveAgenticTool":return host.reserve(ref,data);
            case "startAgenticTool":return host.start(ref,data);
            case "executeAgenticTool":return host.execute(ref,data,signal);
            case "settleAgenticTool":return host.settle(ref,data);
            default:throw Error(`unbound port ${port}`);
          }
        },
      });
      expect(result.message.id).toBe(`chat:${source.id}`);
      if(result.outcome!=="awaiting_confirmation"){
        expect(result.outcome).toBe(mode==="length"?"partial":"completed");
        expect(result.text).toBe(mode==="denied"?"未执行读取":"有来源的结论");
        if(mode!=="denied")expect(chunks).toContainEqual(expect.objectContaining({type:"tool-output-available",output:expect.objectContaining({kind:"source-card"})}));
      }
      return result;
    }
    if(mode==="http429"){
      await expect(run()).rejects.toMatchObject({outcome:"retry_wait"});
      expect(requests).toBe(1);expect(execute).not.toHaveBeenCalled();
      expect((await ledger.inspect(ref)).calls.map(call=>call.status)).toEqual(["rejected"]);return;
    }
    if(mode==="empty"){
      await expect(run()).rejects.toMatchObject({outcome:"failed",errorCode:"CHAT_OUTPUT_EMPTY"});
      expect(requests).toBe(1);expect(execute).not.toHaveBeenCalled();return;
    }
    if(mode==="unknown"){
      await expect(run()).rejects.toMatchObject({outcome:"unknown_result"});
      await expect(run()).rejects.toMatchObject({outcome:"unknown_result"});
      expect(requests).toBe(1);expect(execute).toHaveBeenCalledTimes(1);
      expect((await ledger.inspect(ref)).calls.map(call=>call.status)).toEqual(["settled","unknown"]);
      return;
    }
    if(mode==="approval"){
      expect((await run()).outcome).toBe("awaiting_confirmation");
      expect(requests).toBe(1);expect(execute).not.toHaveBeenCalled();approved=true;
    }
    await run();await run();
    if(mode!=="denied")expect(bodies[0]).toContain("https://source.test/real");
    expect(requests).toBe(2);expect(execute).toHaveBeenCalledTimes(mode==="denied"?0:1);
    const state=await ledger.inspect(ref);expect(state.calls).toHaveLength(3);expect(state.spentTokens).toBe(10);
    expect(state.calls.map(call=>[call.kind,call.status])).toEqual([["model","settled"],["tool","settled"],["model","settled"]]);
    expect((await checkpoints.read(ref)).recovery).toBe("ready");
    const badVersion=createExecutionAgenticToolPorts(f.db,{now,budget,tools:{"web.read":{version:"2",parameters,effect:"none",execute}}});
    await expect(badVersion.reserve(ref,{modelCallId:state.calls[0]!.id,toolCallId:"read-1"})).rejects.toThrow();
    await expect(host.reserve({...ref,fenceToken:"wrong"},{modelCallId:state.calls[0]!.id,toolCallId:"read-1"})).rejects.toThrow();
    await f.db.update(executionTasks).set({payload:{modelInput:{...input,accountId:"foreign"}}}).where(eq(executionTasks.id,task.id));
    await expect(host.reserve(ref,{modelCallId:state.calls[0]!.id,toolCallId:"read-1"})).rejects.toThrow();
    await expect(generation.reserveGenerationCall(ref,{operationKey:`${input.operationKey}/model/1`,request:{maxOutputTokens:128}})).rejects.toThrow();
    expect(execute).toHaveBeenCalledTimes(mode==="denied"?0:1);
  } finally {
    server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await f.client.close();
  }
},15000);
