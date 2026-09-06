import { it, expect, vi } from "vitest";
import { tool, jsonSchema, type ModelMessage } from "ai";
import type { LanguageModelV4, LanguageModelV4CallOptions, LanguageModelV4StreamPart } from "@ai-sdk/provider";
import { createChatModelStream } from "./chat-model-stream";
import { createDurableStreamModel } from "../../execution/durable-stream-model";
const usage = { inputTokens: {total:2,noCache:2,cacheRead:0,cacheWrite:0}, outputTokens:{total:3,text:3,reasoning:0} };
const finish = {type:"finish",usage,finishReason:{unified:"stop",raw:"stop"}} as const;
const text = (value:string):LanguageModelV4StreamPart[] => [
  {type:"stream-start",warnings:[]},{type:"text-start",id:"text"},
  {type:"text-delta",id:"text",delta:value},{type:"text-end",id:"text"},finish,
];
const call = (name:string):LanguageModelV4StreamPart[] => [
  {type:"stream-start",warnings:[]},
  {type:"tool-call",toolCallId:"read-1",toolName:name,input:'{"query":"原始查询"}'},
  {...finish,finishReason:{unified:"tool-calls",raw:"tool_calls"}},
];
function provider(reply:(index:number,params:LanguageModelV4CallOptions)=>LanguageModelV4StreamPart[]) {
  let n=0;
  const requests:LanguageModelV4CallOptions[]=[];
  const model:LanguageModelV4={specificationVersion:"v4",provider:"fixture",modelId:"fixture",supportedUrls:{},
    doGenerate:async()=>{throw Error("unexpected generate");},
    doStream:async(params)=>{requests.push(params);const parts=reply(n++,params);return {stream:new ReadableStream({start(c){parts.forEach(p=>c.enqueue(p));c.close();}})};},
  };
  return {model,requests};
}
const messages:ModelMessage[]=[{role:"user",content:"读一下资料"}];
const readSchema=jsonSchema<{query:string}>({type:"object",properties:{query:{type:"string"}},required:["query"]});
it("普通文本走一次模型短路径并保留输出用量",async()=>{
  const f=provider(()=>text("回答"));
  const result=createChatModelStream({model:f.model,messages,system:"协助用户",tools:{},maxSteps:6});
  expect(await result.text).toBe("回答");expect(f.requests).toHaveLength(1);
  expect((await result.totalUsage).totalTokens).toBe(5);
});
it("真实SDK循环将工具证据送入下一步，原名与合规名一致，流中保留结果卡",async()=>{
  const f=provider((n,p)=>{
    if(n===0){expect(p.toolChoice).toEqual({type:"tool",toolName:"web_read"});expect(JSON.stringify(p.prompt)).toContain("web_read");return call("web_read");}
    expect(JSON.stringify(p.prompt)).toContain("https://source.test/a");
    expect(JSON.stringify(p.prompt)).toContain("原始正文证据");return text("依据来源回答");
  });
  const execute=vi.fn(async()=>({kind:"source-card",url:"https://source.test/a",text:"原始正文证据"}));
  const result=createChatModelStream({model:f.model,messages,system:"使用 web.read 读取",tools:{"web.read":tool({inputSchema:readSchema,execute})},forcedTool:"web.read",maxSteps:6});
  const reader=result.toUIMessageStream().getReader(),parts:unknown[]=[];
  while(true){const p=await reader.read();if(p.done)break;parts.push(p.value);}
  expect(parts).toContainEqual(expect.objectContaining({type:"tool-output-available",toolCallId:"read-1",output:expect.objectContaining({kind:"source-card"})}));
  expect(await result.text).toBe("依据来源回答");expect(execute).toHaveBeenCalledTimes(1);expect(f.requests).toHaveLength(2);
});
it.each([true,false])("真实SDK授权挂起并按用户决定续接，允许=%s",async(approved)=>{
  const f=provider(n=>n===0?call("local_read"):text(approved?"已读取":"没有读取"));
  const execute=vi.fn(async()=>({text:"已授权内容"}));
  const options={model:f.model,system:"通过 local.read 读取",tools:{"local.read":tool({inputSchema:readSchema,execute})},maxSteps:6,
    toolApproval:{"local.read":async()=>"user-approval" as const}};
  const first=createChatModelStream({...options,messages});
  const events=[];const reader=first.fullStream.getReader();
  while(true){const p=await reader.read();if(p.done)break;events.push(p.value);}
  const approval=events.find(p=>p.type==="tool-approval-request");
  expect(approval?.type).toBe("tool-approval-request");expect(execute).not.toHaveBeenCalled();expect(f.requests).toHaveLength(1);
  if(!approval || approval.type!=="tool-approval-request")throw Error("approval missing");
  const history=(await first.response).messages;
  const next=createChatModelStream({...options,messages:[...messages,...history,{role:"tool",content:[{type:"tool-approval-response",approvalId:approval.approvalId,approved}]}]});
  expect(await next.text).toBe(approved?"已读取":"没有读取");expect(execute).toHaveBeenCalledTimes(approved?1:0);expect(f.requests).toHaveLength(2);
});
it("同一聊天循环使用持久模型包装器时，保存失败不会执行工具或请求下一步",async()=>{
  const f=provider(()=>call("web_read"));const execute=vi.fn(async()=>({text:"正文"}));const errors:unknown[]=[];
  const model=createDurableStreamModel({model:f.model,operationKey:"chat",ports:{
    reserve:async()=>({callId:"model-1",status:"reserved"}),start:async()=>{},settle:async()=>{throw Error("ACK_LOST");},
  }});
  const result=createChatModelStream({model,messages,system:"查资料",tools:{"web.read":tool({inputSchema:readSchema,execute})},maxSteps:6,onError:({error})=>{errors.push(error);}});
  await result.consumeStream();expect(errors).toHaveLength(1);expect(errors[0]).toMatchObject({outcome:"unknown_result"});
  expect(execute).not.toHaveBeenCalled();expect(f.requests).toHaveLength(1);
});
