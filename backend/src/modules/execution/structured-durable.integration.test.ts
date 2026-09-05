import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { afterAll,beforeAll,describe,expect,it } from "vitest";
import { z } from "zod";
import { createDb,type Db } from "@creatoros/backend";
import { modelFor,runStructuredNode } from "@creatoros/ai-worker";
import { createDurableGenerationModel,type DurableGenerationPorts } from "@creatoros/ai-worker/durable-generation";
import { createPersistentTaskService } from "./persistent-task.service";
import { createExecutionCallLedgerService } from "./execution-call-ledger.service";
const ctx={userId:"structured",accountId:"structured",requestId:"test",source:"user" as const};
const template={id:"structured-fixture",version:"1",system:"输出JSON",template:"{{input}}",requiredFacets:["input"],tools:[]};
describe("结构化协议回退逐次持久记账",()=>{
  let db:Db;let close:()=>Promise<void>;
  beforeAll(async()=>{const c=await createDb();db=c.db;close=()=>c.client.close();});afterAll(async()=>close?.());
  async function fixture(id:string,maxCalls=4){
    const tasks=createPersistentTaskService(db);const task=await tasks.enqueue(ctx,{kind:"ai_task",ownerType:"ai_task",ownerId:id,idempotencyKey:id,payload:{}});
    const claim=await tasks.claimTask({taskId:task.id,workerId:"worker"});if(!claim)throw new Error("missing claim");
    const ref={executionTaskId:task.id,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
    const ledger=createExecutionCallLedgerService(db,{budget:{maxCalls,maxTokens:100000,deadlineMs:60000}});
    const ports:DurableGenerationPorts={
      async reserve(input){
        const encoded=JSON.stringify(input.request);const call=await ledger.reserve(ref,{operationKey:input.operationKey,kind:"model",inputDigest:"sha256:"+createHash("sha256").update(encoded).digest("hex"),reservedTokens:Buffer.byteLength(encoded)+1024});
        return {callId:call.id,status:call.status,rejectionCode:call.rejectionCode,...(call.providerResult ? {providerResult:call.providerResult} : {})};
      },
      async start(id){await ledger.start(ref,id);},
      async settle(id,input){await ledger.settle(ref,id,input);},
    };
    return {ledger,ref,ports};
  }
  it("原生JSON失败与文本兼容各记一次，恢复重放回执而不重调供应商",async()=>{
    const f=await fixture("fallback");let requests=0;
    const server=createServer((req,res)=>{req.resume();requests++;res.writeHead(200,{"content-type":"application/json"});res.end(JSON.stringify({id:"test",object:"chat.completion",created:1,model:"test",choices:[{index:0,message:{role:"assistant",content:requests===1 ? "not-json" : '{"value":"有效"}'},finish_reason:"stop"}],usage:{prompt_tokens:2,completion_tokens:3,total_tokens:5}}));});
    await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));const port=(server.address() as {port:number}).port;
    const run=()=>runStructuredNode({model:createDurableGenerationModel({model:modelFor({apiFormat:"openai_chat",baseUrl:`http://127.0.0.1:${port}/v1`,model:"test",token:"fixture",structuredOutputs:true}),operationKey:"generate",ports:f.ports}),template,facets:{input:"正文"},outputSchema:z.object({value:z.string()}),maxOutputTokens:128});
    try{
      expect((await run()).object).toEqual({value:"有效"});expect(requests).toBe(2);
      expect((await f.ledger.inspect(f.ref)).spentTokens).toBe(10);
      expect((await run()).object).toEqual({value:"有效"});expect(requests).toBe(2);
      const state=await f.ledger.inspect(f.ref);expect(state.calls).toHaveLength(2);expect(state.calls.every(c=>Boolean(c.providerResult))).toBe(true);
      expect(JSON.stringify(state.calls)).not.toContain("authorization");
    }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
  });
  it("明确协议拒绝后恢复仍重放文本成功回执，不重复请求",async()=>{
    const f=await fixture("rejected-fallback");let requests=0;
    const server=createServer((req,res)=>{req.resume();requests++;if(requests===1){res.writeHead(400,{"content-type":"application/json"});res.end(JSON.stringify({error:{message:"response_format unsupported",type:"invalid_request_error"}}));return;}res.writeHead(200,{"content-type":"application/json"});res.end(JSON.stringify({id:"test",object:"chat.completion",created:1,model:"test",choices:[{index:0,message:{role:"assistant",content:'{"value":"有效"}'},finish_reason:"stop"}],usage:{prompt_tokens:2,completion_tokens:3,total_tokens:5}}));});
    await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));const port=(server.address() as {port:number}).port;
    const run=()=>runStructuredNode({model:createDurableGenerationModel({model:modelFor({apiFormat:"openai_chat",baseUrl:`http://127.0.0.1:${port}/v1`,model:"test",token:"fixture",structuredOutputs:true}),operationKey:"generate",ports:f.ports}),template,facets:{input:"正文"},outputSchema:z.object({value:z.string()}),maxOutputTokens:128});
    try{
      expect((await run()).object).toEqual({value:"有效"});expect(requests).toBe(2);
      expect((await f.ledger.inspect(f.ref)).spentTokens).toBe(5);
      expect((await run()).object).toEqual({value:"有效"});expect(requests).toBe(2);
      const state=await f.ledger.inspect(f.ref);expect(state.calls).toHaveLength(2);expect(state.calls[0]?.rejectionCode).toBe("STRUCTURED_PROTOCOL_UNSUPPORTED");expect(state.calls[1]?.providerResult).toBeTruthy();
      expect(JSON.stringify(state.calls)).not.toContain("authorization");
    }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
  });
  it("预算只有一次时禁止隐藏文本兜底请求",async()=>{
    const f=await fixture("bounded",1);let requests=0;
    const server=createServer((req,res)=>{requests++;req.resume();res.writeHead(200,{"content-type":"application/json"});res.end(JSON.stringify({id:"test",object:"chat.completion",created:1,model:"test",choices:[{index:0,message:{role:"assistant",content:"not-json"},finish_reason:"stop"}],usage:{prompt_tokens:2,completion_tokens:3,total_tokens:5}}));});
    await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));const port=(server.address() as {port:number}).port;
    try{await expect(runStructuredNode({model:createDurableGenerationModel({model:modelFor({apiFormat:"openai_chat",baseUrl:`http://127.0.0.1:${port}/v1`,model:"test",token:"fixture",structuredOutputs:true}),operationKey:"generate",ports:f.ports}),template,facets:{input:"正文"},outputSchema:z.object({value:z.string()}),maxOutputTokens:128})).rejects.toThrow();expect(requests).toBe(1);}
    finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
  });
  it("外部取消贯通结构化请求，未知提交不启动回退或SDK重试",async()=>{
    const f=await fixture("cancel");const controller=new AbortController();let requests=0;
    const server=createServer(req=>{req.resume();requests++;controller.abort();});
    await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));const port=(server.address() as {port:number}).port;
    try{await expect(runStructuredNode({model:createDurableGenerationModel({model:modelFor({apiFormat:"openai_chat",baseUrl:`http://127.0.0.1:${port}/v1`,model:"test",token:"fixture",structuredOutputs:true}),operationKey:"generate",ports:f.ports}),template,facets:{input:"正文"},outputSchema:z.object({value:z.string()}),maxOutputTokens:128,maxRetries:3,signal:controller.signal})).rejects.toThrow();
      expect(requests).toBe(1);expect((await f.ledger.inspect(f.ref)).calls[0]?.status).toBe("unknown");
    }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
  });
  it("协议拒绝结算回执丢失时禁止额外fallback",async()=>{
    const f=await fixture("settle-lost");let requests=0;
    const server=createServer((req,res)=>{req.resume();requests++;res.writeHead(400,{"content-type":"application/json"});res.end('{"error":{"message":"response_format json_schema not supported","type":"invalid_request_error"}}');});
    await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));const port=(server.address() as {port:number}).port;
    try{await expect(runStructuredNode({model:createDurableGenerationModel({model:modelFor({apiFormat:"openai_chat",baseUrl:`http://127.0.0.1:${port}/v1`,model:"test",token:"fixture",structuredOutputs:true}),operationKey:"generate",ports:{...f.ports,async settle(){throw new Error("ACK_LOST");}}}),template,facets:{input:"正文"},outputSchema:z.object({value:z.string()}),maxOutputTokens:128})).rejects.toThrow("MODEL_SETTLEMENT_RECEIPT_UNKNOWN");expect(requests).toBe(1);}
    finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
  });

});
