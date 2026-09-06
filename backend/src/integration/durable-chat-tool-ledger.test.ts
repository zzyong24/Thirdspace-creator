import { createServer } from "node:http";
import { it, expect, vi } from "vitest";
import { tool, type ModelMessage } from "ai";
import { z } from "zod";
import { createDb, executionTasks, eq } from "@creatoros/backend";
import { modelFor } from "@creatoros/ai-worker";
import { createDurableStreamModel } from "@creatoros/ai-worker/durable-stream";
import { createChatModelStream } from "@creatoros/ai-worker/chat";
import { chatWorkerInputSchema } from "@creatoros/contract/execution-worker";
import { createAiRepository } from "../modules/ai/ai.repository";
import { createChatTurnSubmissionService } from "../modules/ai/chat-turn-submission.service";
import { createPersistentTaskService } from "../modules/execution/persistent-task.service";
import { createExecutionCallLedgerService } from "../modules/execution/execution-call-ledger.service";
import { createExecutionGenerationPorts } from "../modules/execution/execution-generation-ports.service";
import { createExecutionCheckpointService } from "../modules/execution/execution-checkpoint.service";
import { createExecutionAgenticToolPorts } from "../modules/execution/execution-agentic-tool-ports.service";

it("聊天编码工具名绑定同一真实账本，完整模型循环恢复不重发模型和业务执行", async () => {
  const f=await createDb();
  const ctx={userId:"chat-u",accountId:"chat-a",requestId:"fixture",source:"user" as const};
  const now=()=>new Date().toISOString(),budget={maxCalls:6,maxTokens:100000,deadlineMs:60000};
  const messages:ModelMessage[]=[{role:"user",content:"查询资料"}];
  const parameters=z.object({query:z.string()}).strict();
  let input=chatWorkerInputSchema.parse({kind:"chat.run",operationKey:"chat-turn",capability:"copilot.assist",userId:ctx.userId,accountId:ctx.accountId,
    conversationId:"conversation",sourceMessageId:"source-message",system:"查找真实来源",messages,maxSteps:6,maxOutputTokens:128,
    tools:[{name:"web.read",version:"1",description:"读取来源",parameters:z.toJSONSchema(parameters),effect:"none"}]});
  let requests=0;const bodies:string[]=[];
  const server=createServer((req,res)=>{
    let body="";req.on("data",chunk=>{body+=chunk;});req.on("end",()=>{
      requests++;
      const parsed=JSON.parse(body);
      const hasResult=parsed.messages.some((message:{role:string})=>message.role==="tool");
      if(hasResult)bodies.push(body);
      const delta=hasResult ? {content:"有来源的结论"} : {tool_calls:[{index:0,id:"read-1",type:"function",function:{name:"web_read",arguments:'{"query":"真实查询"}'}}]};
      const chunks=[{choices:[{index:0,delta,finish_reason:null}]},{choices:[{index:0,delta:{},finish_reason:hasResult?"stop":"tool_calls"}],usage:{prompt_tokens:2,completion_tokens:3,total_tokens:5}}];
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
      return {status:"ok" as const,summary:"查到来源",data:{kind:"source-card",url:"https://source.test/real",text:"真实正文"},evidence:[{sourceUrl:"https://source.test/real"}],error:null,continuation:null,sideEffect:"none" as const};
    });
    const host=createExecutionAgenticToolPorts(f.db,{now,budget,tools:{"web.read":{version:"1",parameters,effect:"none",execute}}});
    const provider=modelFor({apiFormat:"openai_chat",baseUrl:`http://127.0.0.1:${(server.address() as {port:number}).port}/v1`,model:"fixture",token:"fixture"});
    async function run(){
      const modelForTool=new Map<string,string>();
      const bind=(callId:string,receipt:any)=>{for(const part of receipt?.content??[])if(part.type==="tool-call")modelForTool.set(part.toolCallId,callId);};
      const model=createDurableStreamModel({model:provider,operationKey:input.operationKey,ports:{
        reserve:async(request)=>{const result=await generation.reserveGenerationCall(ref,request);bind(result.callId,result.providerResult);return result;},
        start:async(callId)=>{await ledger.start(ref,callId);},
        settle:async(callId,result)=>{await generation.settleGenerationCall(ref,{callId,...result});if(result.status==="settled")bind(callId,result.providerResult);},
      }});
      const result=createChatModelStream({model,messages,system:input.system,maxSteps:input.maxSteps,maxOutputTokens:input.maxOutputTokens,tools:{"web.read":tool({description:"读取来源",inputSchema:parameters,
        execute:async(_args,options)=>{
          const reservation=await host.reserve(ref,{modelCallId:modelForTool.get(options.toolCallId),toolCallId:options.toolCallId});
          expect(reservation.toolName).toBe("web_read");
          if(reservation.status!=="settled")await host.start(ref,{callId:reservation.callId});
          return (await host.execute(ref,{callId:reservation.callId})).data;
        },
      })}});
      expect(await result.text).toBe("有来源的结论");
    }
    await run();await run();
    expect(bodies[0]).toContain("https://source.test/real");
    expect(requests).toBe(2);expect(execute).toHaveBeenCalledTimes(1);
    const state=await ledger.inspect(ref);expect(state.calls).toHaveLength(3);expect(state.spentTokens).toBe(10);
    expect(state.calls.map(call=>[call.kind,call.status])).toEqual([["model","settled"],["tool","settled"],["model","settled"]]);
    const checkpoints=createExecutionCheckpointService(f.db,{now});
    await checkpoints.save(ref,{expectedRevision:0,expectedLedgerSequence:state.calls.at(-1)!.sequence,messages:state.calls.map(call=>({role:call.kind==="model"?"assistant":"tool",callId:call.id}))});
    expect((await checkpoints.read(ref)).recovery).toBe("ready");
    const badVersion=createExecutionAgenticToolPorts(f.db,{now,budget,tools:{"web.read":{version:"2",parameters,effect:"none",execute}}});
    await expect(badVersion.reserve(ref,{modelCallId:state.calls[0]!.id,toolCallId:"read-1"})).rejects.toThrow();
    await expect(host.reserve({...ref,fenceToken:"wrong"},{modelCallId:state.calls[0]!.id,toolCallId:"read-1"})).rejects.toThrow();
    await f.db.update(executionTasks).set({payload:{modelInput:{...input,accountId:"foreign"}}}).where(eq(executionTasks.id,task.id));
    await expect(host.reserve(ref,{modelCallId:state.calls[0]!.id,toolCallId:"read-1"})).rejects.toThrow();
    await expect(generation.reserveGenerationCall(ref,{operationKey:`${input.operationKey}/model/1`,request:{maxOutputTokens:128}})).rejects.toThrow();
    expect(execute).toHaveBeenCalledTimes(1);
  } finally {
    server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await f.client.close();
  }
},15000);
