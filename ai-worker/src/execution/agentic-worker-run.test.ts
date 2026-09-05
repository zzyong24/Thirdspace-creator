import {createServer} from "node:http";
import {describe,it,expect} from "vitest";
import type {WorkerPort,WorkerProviderReceipt} from "@creatoros/contract/execution-worker";
import {runAgenticInWorker} from "./agentic-worker-run";
const input={kind:"agentic.run" as const,operationKey:"agent",taskType:"agentic.research" as const,goal:"读取网页后总结",systemPrompt:"只使用web.read读取目标，再总结。",capability:"research",maxOutputTokens:200,dryRun:false,tools:[{name:"web.read",version:"1",label:"读取",description:"读取网页",parameters:{type:"object",properties:{url:{type:"string"}},required:["url"],additionalProperties:false},effect:"none" as const}]};
const outcome={status:"ok",summary:"已读网页",evidence:[{sourceUrl:"https://example.com",text:"真实返回正文"}],data:{text:"真实返回正文"},error:null,continuation:null,sideEffect:"none"};
function ledger(maxCalls=12,maxTokens=5000){
  type Row={callId:string;kind:"model"|"tool";sequence:number;status:string;key:string;providerResult?:WorkerProviderReceipt;receipt?:unknown;toolName?:string;toolCallId?:string;input?:unknown};
  const rows:Row[]=[];let revision=0;let messages:Array<{role:string;callId:string}>=[];let executions=0;
  const call=async(port:WorkerPort,raw:unknown):Promise<unknown>=>{
    const data=raw as Record<string,any>;
    if(port==="readCheckpoint")return {revision,ledgerSequence:rows.length,messages,uncheckpointedReceipts:rows.filter(r=>r.status==="settled" && !messages.some(m=>m.callId===r.callId)).map(r=>({callId:r.callId,kind:r.kind,sequence:r.sequence})),recovery:rows.some(r=>r.status==="unknown")?"requires_reconciliation":"ready",budget:{maxCalls,maxTokens}};
    if(port==="saveCheckpoint") {expect(data.expectedRevision).toBe(revision);expect(data.expectedLedgerSequence).toBe(rows.length);messages=data.messages;return {revision:++revision};}
    if(port==="reserveAgenticModel"){
      const key=JSON.stringify(data.request);let row=rows.find(r=>r.key===key);
      if(!row){row={callId:`call-${rows.length+1}`,kind:"model",sequence:rows.length+1,status:"reserved",key};rows.push(row);}
      return {callId:row.callId,status:row.status,providerResult:row.providerResult};
    }
    if(port==="reserveAgenticTool"){
      const model=rows.find(r=>r.callId===data.modelCallId)!;
      const part=model.providerResult!.content.find(p=>p && typeof p==="object" && !Array.isArray(p) && p.type==="tool-call") as {toolCallId:string;toolName:string;input:string};
      expect(part.toolCallId).toBe(data.toolCallId);
      const key=`tool:${data.modelCallId}:${data.toolCallId}`;let row=rows.find(r=>r.key===key);
      if(!row){row={callId:`call-${rows.length+1}`,kind:"tool",sequence:rows.length+1,status:"reserved",key,toolName:part.toolName,toolCallId:part.toolCallId,input:JSON.parse(part.input)};rows.push(row);}
      return {callId:row.callId,status:row.status,toolName:row.toolName,input:row.input,receipt:row.receipt};
    }
    const row=rows.find(r=>r.callId===data.callId)!;
    if(port==="startCall" || port==="startAgenticTool"){expect(row.status).toBe("reserved");row.status="started";return {callId:row.callId,status:"started"};}
    if(port==="settleGenerationCall"){row.status=data.status;row.providerResult=data.providerResult;return {callId:row.callId,status:row.status};}
    if(port==="executeAgenticTool"){expect(row.status).toBe("started");expect(row.input).toEqual({url:"https://example.com"});executions++;return outcome;}
    if(port==="settleAgenticTool"){row.status=data.status;row.receipt={schemaVersion:1,kind:"tool",toolCallId:row.toolCallId,toolName:row.toolName,output:data.output};return {callId:row.callId,status:row.status};}
    throw new Error(`unexpected ${port}`);
  };
  return {call,rows,get revision(){return revision;},get messages(){return messages;},get executions(){return executions;}};
}
describe("Worker内真实Pi循环与持久代理",()=>{
  it.each([{dryRun:false,invalid:{}},{dryRun:true,invalid:{}},{dryRun:false,invalid:[]}])("非法参数经持久回执自修复，provider仍有严格schema：%j",async({dryRun,invalid})=>{
    const taskInput={...input,dryRun,tools:input.tools.map(tool=>({...tool,effect:dryRun?"proposal" as const:tool.effect}))};
    const requests:string[]=[];
    const server=createServer(async(req,res)=>{
      const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));requests.push(Buffer.concat(chunks).toString());
      const n=requests.length;
      const delta=n<=2?{role:"assistant",tool_calls:[{index:0,id:`t${n}`,type:"function",function:{name:"web.read",arguments:JSON.stringify(n===1?invalid:{url:"https://example.com"})}}]}:{role:"assistant",content:"完成"};
      const base={id:`m${n}`,object:"chat.completion.chunk",created:1,model:"test"};
      res.writeHead(200,{"content-type":"text/event-stream"});res.end(`data: ${JSON.stringify({...base,choices:[{index:0,delta,finish_reason:null}]})}\n\ndata: ${JSON.stringify({...base,choices:[{index:0,delta:{},finish_reason:n<=2?"tool_calls":"stop"}],usage:{prompt_tokens:3,completion_tokens:4,total_tokens:7}})}\n\ndata: [DONE]\n\n`);
    });
    await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
    try{
      const f=ledger();
      const validationOutcome={status:"error",summary:"参数缺少url",evidence:[],error:{code:"invalid_input",retryable:true,recovery:"请提供url字符串"},continuation:null,sideEffect:"none"};
      const call=async(port:WorkerPort,data:unknown)=>{
        const result=await f.call(port,data);
        if(port==="reserveAgenticTool" && (data as {toolCallId:string}).toolCallId==="t1")return {...result as object,validationOutcome};
        return result;
      };
      const model={apiFormat:"openai_chat" as const,authStyle:"bearer" as const,baseUrl:`http://127.0.0.1:${(server.address() as {port:number}).port}/v1`,model:"test",token:"fixture"};
      const first=await runAgenticInWorker(taskInput,model,new AbortController().signal,call);
      expect(first.stopReason).toBe("completed");expect(requests).toHaveLength(3);expect(f.executions).toBe(dryRun?0:1);
      const firstHttp=JSON.parse(requests[0]!);expect(firstHttp.tools[0].function.parameters).toMatchObject({required:["url"],additionalProperties:false});
      expect(requests[1]).toContain("invalid_input");expect(requests[1]).toContain("请提供url字符串");
      expect(f.rows.filter(row=>row.kind==="tool").map(row=>row.status)).toEqual(["settled","settled"]);
      expect(f.messages.map(message=>message.role)).toEqual(["assistant","tool","assistant","tool","assistant"]);
      expect(await runAgenticInWorker(taskInput,model,new AbortController().signal,call)).toEqual(first);
      expect(requests).toHaveLength(3);expect(f.executions).toBe(dryRun?0:1);
    }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
  },30000);
  it.each([{lostCheckpoint:false,dryRun:false,budgetStop:null},{lostCheckpoint:true,dryRun:false,budgetStop:null},{lostCheckpoint:false,dryRun:true,budgetStop:null},{lostCheckpoint:false,dryRun:false,budgetStop:"max_steps"},{lostCheckpoint:false,dryRun:false,budgetStop:"budget_exhausted"}])("真实SDK循环和预演回执恢复不重复执行 %j",async({lostCheckpoint,dryRun,budgetStop})=>{
    const expectedRequests=budgetStop==="max_steps"?1:2;
    const taskInput={...input,dryRun,tools:input.tools.map(tool=>({...tool,effect:dryRun?"proposal" as const:tool.effect}))};
    let requests=0;
    const server=createServer((req,res)=>{
      req.resume();requests++;res.writeHead(200,{"content-type":"text/event-stream"});
      const delta=requests===1?{role:"assistant",tool_calls:[{index:0,id:"t1",type:"function",function:{name:"web.read",arguments:JSON.stringify({url:"https://example.com"})}}]}:{role:"assistant",content:"已根据正文完成总结"};
      const chunk={id:`m${requests}`,object:"chat.completion.chunk",created:1,model:"test",choices:[{index:0,delta,finish_reason:null}]};
      const done={...chunk,choices:[{index:0,delta:{},finish_reason:requests===1?"tool_calls":"stop"}],usage:{prompt_tokens:3,completion_tokens:4,total_tokens:7}};
      res.end(`data: ${JSON.stringify(chunk)}\n\ndata: ${JSON.stringify(done)}\n\ndata: [DONE]\n\n`);
    });
    await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));
    try{
      const f=ledger(budgetStop==="max_steps"?2:12,budgetStop==="budget_exhausted"?14:5000);const model={apiFormat:"openai_chat" as const,baseUrl:`http://127.0.0.1:${(server.address() as {port:number}).port}/v1`,model:"test",token:"fixture",authStyle:"bearer" as const};
      if(lostCheckpoint){
        let lost=false;
        await expect(runAgenticInWorker(taskInput,model,new AbortController().signal,async(port,data)=>{
          const result=await f.call(port,data);
          if(port==="saveCheckpoint" && !lost){lost=true;throw new Error("durable checkpoint receipt lost");}
          return result;
        })).rejects.toMatchObject({outcome:"unknown_result"});
        expect(requests).toBe(1);expect(f.executions).toBe(0);expect(f.revision).toBe(1);
      }
      const first=await runAgenticInWorker(taskInput,model,new AbortController().signal,f.call);
      expect(first).toMatchObject({actualEngine:"pi",stopReason:budgetStop ?? "completed",lastModelCallId:budgetStop==="max_steps"?"call-1":"call-3",toolCallIds:["call-2"]});
      expect(requests).toBe(expectedRequests);expect(f.executions).toBe(dryRun?0:1);expect(f.messages.map(m=>m.role)).toEqual(budgetStop==="max_steps"?["assistant","tool"]:["assistant","tool","assistant"]);
      if(dryRun)expect(f.rows.find(r=>r.kind==="tool")?.receipt).toMatchObject({output:{sideEffect:"none",data:{plan:{toolName:"web.read",input:{url:"https://example.com"}}}}});
      const revision=f.revision;
      expect(await runAgenticInWorker(taskInput,model,new AbortController().signal,f.call)).toEqual(first);
      expect(requests).toBe(expectedRequests);expect(f.executions).toBe(dryRun?0:1);expect(f.revision).toBe(revision);
    }finally{await new Promise<void>((r,j)=>server.close(e=>e?j(e):r()));}
  },30000);
  it("缺少明确认证格式时等待配置，不猜供应商或启动模型",async()=>{
    let calls=0;
    await expect(runAgenticInWorker(input,{apiFormat:"openai_chat",baseUrl:null,model:"test",token:"fixture"},new AbortController().signal,async()=>{calls++;})).rejects.toMatchObject({outcome:"waiting_user",errorCode:"AGENT_AUTH_STYLE_REQUIRED"});
    expect(calls).toBe(0);
  });
  it("待对账检查点不启动Pi模型或工具",async()=>{
    let calls=0;
    await expect(runAgenticInWorker(input,{apiFormat:"openai_chat",baseUrl:null,model:"test",token:"fixture",authStyle:"bearer" as const},new AbortController().signal,async()=>{calls++;return {revision:0,ledgerSequence:1,messages:[],uncheckpointedReceipts:[],recovery:"requires_reconciliation",budget:{maxCalls:12,maxTokens:5000}};})).rejects.toMatchObject({outcome:"unknown_result"});
    expect(calls).toBe(1);
  });
});
