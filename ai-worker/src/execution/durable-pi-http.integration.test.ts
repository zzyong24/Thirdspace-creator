import {createServer} from "node:http";
import {afterEach,describe,expect,it,vi} from "vitest";
import {stream as chat} from "@earendil-works/pi-ai/api/openai-completions";
import {stream as responses} from "@earendil-works/pi-ai/api/openai-responses";
import {stream as anthropic} from "@earendil-works/pi-ai/api/anthropic-messages";
import type {StreamFunction} from "@earendil-works/pi-ai";
import type {WorkerPort} from "@creatoros/contract/execution-worker";
import {wrapDurablePiStream} from "./durable-pi-stream";

const providers=[{api:"openai-completions",stream:chat},{api:"openai-responses",stream:responses},{api:"anthropic-messages",stream:anthropic}];
const disposers:Array<()=>Promise<void>>=[];
afterEach(async()=>{await Promise.all(disposers.splice(0).map(close=>close()));});
async function fixture(status:number|"disconnect"|"truncated"|"missing-usage"){
 let requests=0;
 const server=createServer((request,response)=>{
  requests++;request.resume();
  if(status==="disconnect"){request.socket.destroy();return;}
  if(status==="missing-usage"){
   response.writeHead(200,{"content-type":"text/event-stream"});
   response.write(`data: ${JSON.stringify({id:"no-usage",choices:[{index:0,delta:{role:"assistant",content:"明确正文但未返回用量"},finish_reason:null}]})}\n\n`);
   response.end(`data: ${JSON.stringify({id:"no-usage",choices:[{index:0,delta:{},finish_reason:"stop"}]})}\n\ndata: [DONE]\n\n`);return;
  }
  if(status==="truncated"){
   response.writeHead(200,{"content-type":"text/event-stream"});
   const event=(value:unknown)=>response.write(`${value && typeof value==="object" && "type" in value ? `event: ${value.type}\n` : ""}data: ${JSON.stringify(value)}\n\n`);
   if(request.url?.includes("/chat/completions"))event({id:"partial",choices:[{index:0,delta:{role:"assistant",content:"部分正文"},finish_reason:null}]});
   else if(request.url?.includes("/responses")){
    event({type:"response.created",response:{id:"partial",model:"fixture-model"}});
    event({type:"response.output_item.added",output_index:0,item:{type:"message",id:"msg",role:"assistant",content:[]}});
    event({type:"response.content_part.added",output_index:0,content_index:0,part:{type:"output_text",text:"",annotations:[]}});
    event({type:"response.output_text.delta",output_index:0,content_index:0,delta:"部分正文"});
   }else{
    event({type:"message_start",message:{id:"partial",role:"assistant",model:"fixture-model",content:[],usage:{input_tokens:1,output_tokens:0}}});
    event({type:"content_block_start",index:0,content_block:{type:"text",text:""}});
    event({type:"content_block_delta",index:0,delta:{type:"text_delta",text:"部分正文"}});
   }
   setTimeout(()=>response.destroy(),20);return;
  }
  response.writeHead(status,{"content-type":"application/json","retry-after":"2","retry-after-ms":"2000","x-private":"must-not-cross"});
  response.end(JSON.stringify({error:{type:"rate_limit_error",message:"private body must not cross"}}));
 });
 await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
 disposers.push(()=>new Promise<void>((resolve,reject)=>{server.closeAllConnections();server.close(error=>error?reject(error):resolve());}));
 const address=server.address();if(!address || typeof address==="string")throw new Error("address missing");
 const baseUrl=`http://127.0.0.1:${address.port}/v1`;
 const call=vi.fn(async(port:WorkerPort,data:unknown)=>{
  if(port==="reserveAgenticModel")return {callId:"model-1",status:"reserved"};
  if(port==="startCall")return {callId:"model-1",status:"started"};
  if(port==="settleGenerationCall")return {callId:"model-1",status:(data as {status:string}).status};
  throw new Error("unexpected port");
 });
 return {baseUrl,call,requests:()=>requests};
}
describe.each(providers)("真实Pi HTTP兼容：$api",provider=>{
 it.each([{status:429,outcome:"retry_wait"},{status:401,outcome:"waiting_user"},{status:503,outcome:"retry_wait"}] as const)("HTTP $status保留可信拒绝，不由SDK重试",async({status,outcome})=>{
  const f=await fixture(status);const observed=vi.fn();
  const model={id:"fixture-model",name:"fixture-model",api:provider.api,provider:"fixture",baseUrl:f.baseUrl,reasoning:false,input:["text"],cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:32000,maxTokens:1024} as Parameters<StreamFunction>[0];
  const stream=wrapDurablePiStream(provider.stream as StreamFunction,{signal:new AbortController().signal,call:f.call,maxOutputTokens:128,onSettled:vi.fn()})(model,{messages:[{role:"user",content:"测试",timestamp:0}]},{apiKey:"fixture-secret",onResponse:observed,maxRetries:5});
  await expect(stream.result()).rejects.toMatchObject({outcome,...(outcome==="retry_wait"?{retryAfterMs:2000}:{})});
  expect(f.requests()).toBe(1);
  expect(f.call.mock.calls.filter(([port])=>port==="reserveAgenticModel")).toHaveLength(1);
  expect(f.call.mock.calls.filter(([port])=>port==="startCall")).toHaveLength(1);
  expect(f.call).toHaveBeenCalledWith("startCall",{callId:"model-1"},expect.any(AbortSignal));
  expect(f.call.mock.calls.find(([port])=>port==="reserveAgenticModel")?.[1]).toMatchObject({maxOutputTokens:128});
  expect(f.call.mock.calls.at(-1)).toEqual(["settleGenerationCall",{callId:"model-1",status:outcome==="retry_wait"?"superseded":"rejected"}]);
  expect(observed.mock.calls[0]?.[0]).toEqual({status,headers:{"retry-after":"2","retry-after-ms":"2000"}});
  expect(JSON.stringify(f.call.mock.calls)).not.toContain("private body");
 });
 it.each(["truncated","disconnect"] as const)("%s纯Pi候选中断沿原任务retry_wait，不假发布done",async(status)=>{
  const f=await fixture(status);
  const model={id:"fixture-model",name:"fixture-model",api:provider.api,provider:"fixture",baseUrl:f.baseUrl,reasoning:false,input:["text"],cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:32000,maxTokens:1024} as Parameters<StreamFunction>[0];
  const stream=wrapDurablePiStream(provider.stream as StreamFunction,{signal:new AbortController().signal,call:f.call,maxOutputTokens:128,onSettled:vi.fn()})(model,{messages:[{role:"user",content:"测试",timestamp:0}]},{apiKey:"fixture-secret",maxRetries:5});
  const events:string[]=[];
  const consumed=(async()=>{try{for await(const event of stream)events.push(event.type);}catch{/* result below asserts the same failure. */}})();
  await expect(stream.result()).rejects.toMatchObject({outcome:"retry_wait",errorCode:"MODEL_STREAM_INTERRUPTED"});await consumed;
  if(status==="truncated")expect(events).toContain("text_delta");
  expect(f.requests()).toBe(1);
  expect(f.call.mock.calls.filter(([port])=>port==="reserveAgenticModel")).toHaveLength(1);
  expect(f.call.mock.calls.filter(([port])=>port==="startCall")).toHaveLength(1);
  expect(f.call).toHaveBeenCalledWith("startCall",{callId:"model-1"},expect.any(AbortSignal));
  expect(f.call.mock.calls.find(([port])=>port==="reserveAgenticModel")?.[1]).toMatchObject({maxOutputTokens:128});
  expect(f.call.mock.calls.at(-1)).toEqual(["settleGenerationCall",{callId:"model-1",status:"superseded"}]);
  expect(events).not.toContain("done");
 });
 it("带status字段的普通异常不是可信HTTP拒绝",async()=>{
  const f=await fixture(429);const observed=vi.fn();
  const model={id:"fixture-model",name:"fixture-model",api:provider.api,provider:"fixture",baseUrl:f.baseUrl,reasoning:false,input:["text"],cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:32000,maxTokens:1024} as Parameters<StreamFunction>[0];
  const stream=wrapDurablePiStream(provider.stream as StreamFunction,{signal:new AbortController().signal,call:f.call,maxOutputTokens:128,onSettled:vi.fn()})(model,{messages:[{role:"user",content:"测试",timestamp:0}]},{apiKey:"fixture-secret",onResponse:observed,onPayload:()=>{throw Object.assign(new Error("429 spoof"),{status:429,headers:new Headers({"retry-after":"2"})});}});
  await expect(stream.result()).rejects.toMatchObject({outcome:"retry_wait",errorCode:"MODEL_STREAM_INTERRUPTED",retryAfterMs:undefined});
  expect(f.call.mock.calls.at(-1)).toEqual(["settleGenerationCall",{callId:"model-1",status:"superseded"}]);
  expect(f.requests()).toBe(0);expect(observed).not.toHaveBeenCalled();
 });

});

it("真实Chat省略usage时不把Pi初始全零当计量事实，unknown重投不再联网",async()=>{
 const f=await fixture("missing-usage");const original=f.call.getMockImplementation()!;let unknown=false;
 f.call.mockImplementation(async(port,data)=>{
  if(port==="reserveAgenticModel" && unknown)return {callId:"model-1",status:"unknown"};
  if(port==="settleGenerationCall" && (data as {status?:string}).status==="unknown")unknown=true;
  return original(port,data);
 });
 const model={id:"fixture-model",name:"fixture-model",api:"openai-completions",provider:"fixture",baseUrl:f.baseUrl,reasoning:false,input:["text"],cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:32000,maxTokens:1024} as Parameters<StreamFunction>[0];
 const settled=vi.fn();
 const invoke=()=>wrapDurablePiStream(chat as StreamFunction,{signal:new AbortController().signal,call:f.call,maxOutputTokens:128,onSettled:settled})(model,{messages:[{role:"user",content:"非空任务",timestamp:0}]},{apiKey:"fixture-secret"});
 await expect(invoke().result()).rejects.toMatchObject({outcome:"unknown_result",errorCode:"MODEL_USAGE_UNKNOWN"});
 expect(unknown).toBe(true);expect(settled).not.toHaveBeenCalled();
 await expect(invoke().result()).rejects.toMatchObject({outcome:"unknown_result"});
 expect(f.requests()).toBe(1);
 expect(f.call.mock.calls.filter(([port])=>port==="settleGenerationCall")).toEqual([["settleGenerationCall",{callId:"model-1",status:"unknown"}]]);
});

it('纯Pi恢复许可不能覆盖用户取消：原调用unknown且不发布done',async()=>{
 const f=await fixture(429),controller=new AbortController(),settled=vi.fn();
 const model={id:'fixture-model',name:'fixture-model',api:'openai-completions',provider:'fixture',baseUrl:f.baseUrl,reasoning:false,input:['text'],cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:32000,maxTokens:1024} as Parameters<StreamFunction>[0];
 const stream=wrapDurablePiStream(chat as StreamFunction,{signal:controller.signal,call:f.call,maxOutputTokens:128,onSettled:settled})(model,{messages:[{role:'user',content:'原候选',timestamp:0}]},{apiKey:'fixture-secret',onResponse:()=>{controller.abort('用户取消');}});
 const events:string[]=[];const consumed=(async()=>{try{for await(const event of stream)events.push(event.type);}catch{/* 同一 result 断言真实失败。 */}})();
 await expect(stream.result()).rejects.toMatchObject({outcome:'unknown_result'});await consumed;
 expect(f.requests()).toBe(1);expect(f.call.mock.calls.at(-1)).toEqual(['settleGenerationCall',{callId:'model-1',status:'unknown'}]);
 expect(events).not.toContain('done');expect(settled).not.toHaveBeenCalled();
});

it('纯Pi候选恢复结算ACK丢失仍unknown，原call重读不再次HTTP或结算',async()=>{
 const f=await fixture(429),original=f.call.getMockImplementation()!;let uncertain=false;
 f.call.mockImplementation(async(port,data)=>{
  if(port==='reserveAgenticModel'&&uncertain)return {callId:'model-1',status:'unknown'};
  if(port==='settleGenerationCall'){expect(data).toEqual({callId:'model-1',status:'superseded'});uncertain=true;throw Error('原结算ACK丢失');}
  return original(port,data);
 });
 const model={id:'fixture-model',name:'fixture-model',api:'openai-completions',provider:'fixture',baseUrl:f.baseUrl,reasoning:false,input:['text'],cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:32000,maxTokens:1024} as Parameters<StreamFunction>[0];
 const settled=vi.fn(),invoke=()=>wrapDurablePiStream(chat as StreamFunction,{signal:new AbortController().signal,call:f.call,maxOutputTokens:128,onSettled:settled})(model,{messages:[{role:'user',content:'原候选',timestamp:0}]},{apiKey:'fixture-secret'});
 await expect(invoke().result()).rejects.toMatchObject({outcome:'unknown_result',errorCode:'MODEL_SETTLEMENT_RECEIPT_UNKNOWN'});
 await expect(invoke().result()).rejects.toMatchObject({outcome:'unknown_result'});
 expect(f.requests()).toBe(1);expect(f.call.mock.calls.filter(([port])=>port==='startCall')).toHaveLength(1);expect(f.call.mock.calls.filter(([port])=>port==='settleGenerationCall')).toHaveLength(1);expect(settled).not.toHaveBeenCalled();
});
