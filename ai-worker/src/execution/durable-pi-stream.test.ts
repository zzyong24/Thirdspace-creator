import {describe,it,expect,vi} from "vitest";
import type {AssistantMessage,AssistantMessageEvent,Context,StreamFunction} from "@earendil-works/pi-ai";
import {wrapDurablePiStream,piAssistantToCanonical,canonicalToPiAssistant,normalizePiContext} from "./durable-pi-stream";
import type {WorkerPort} from "@creatoros/contract/execution-worker";
const message:AssistantMessage={role:"assistant",api:"openai-completions",provider:"fixture",model:"test",timestamp:123,stopReason:"toolUse",content:[{type:"text",text:"观察",textSignature:"text-sign"},{type:"thinking",thinking:"思考",thinkingSignature:"reason-sign",redacted:true},{type:"toolCall",id:"t-1",name:"web.read",arguments:{url:"https://example.com",timestamp:"业务参数保留"},thoughtSignature:"tool-sign"}],usage:{input:2,cacheRead:3,cacheWrite:4,output:5,reasoning:2,totalTokens:14,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}}};
const context:Context={systemPrompt:"系统规则",messages:[{role:"user",content:"任务",timestamp:10}],tools:[{name:"web.read",description:"读取",parameters:{type:"object",properties:{url:{type:"string"}}}}]};
const model={id:"test",api:"openai-completions",provider:"fixture"} as Parameters<StreamFunction>[0];
function nativeStream():ReturnType<StreamFunction>{return {async *[Symbol.asyncIterator](){yield {type:"start",partial:message} as AssistantMessageEvent;yield {type:"done",reason:"toolUse",message} as AssistantMessageEvent;},result:async()=>message} as unknown as ReturnType<StreamFunction>;}
function fixture(status="reserved"){
  const controller=new AbortController();const onSettled=vi.fn();const onFailure=vi.fn();const native=vi.fn(nativeStream) as unknown as ReturnType<typeof vi.fn<StreamFunction>>;
  const call=vi.fn(async(port:WorkerPort,data:unknown,_signal?:AbortSignal):Promise<unknown>=>{
    if(port==="reserveAgenticModel")return {callId:"c1",status,...(status==="settled"?{providerResult:piAssistantToCanonical(message)}:{})};
    if(port==="startCall")return {callId:"c1",status:"started"};
    if(port==="settleGenerationCall")return {callId:"c1",status:(data as {status:string}).status};
    throw new Error("unexpected port");
  });
  const run=()=>wrapDurablePiStream(native,{signal:controller.signal,call,maxOutputTokens:50,onSettled,onFailure})(model,context,{maxTokens:100,apiKey:"secret"});
  return {controller,onSettled,onFailure,native,call,run};
}
describe("Pi 持久模型流",()=>{
  it("完整文本/推理/工具ID和签名可规范重建，缓存计量不重复",()=>{
    const receipt=piAssistantToCanonical(message);
    expect(receipt.usage.inputTokens).toEqual({total:9,noCache:2,cacheRead:3,cacheWrite:4});
    expect(receipt.usage.outputTokens).toEqual({total:5,reasoning:2,text:3});
    expect(canonicalToPiAssistant(receipt)).toEqual(message);
    expect(normalizePiContext({...context,messages:[message]})).toMatchObject({messages:[{role:"assistant",content:message.content}]});
    expect(JSON.stringify(normalizePiContext({...context,messages:[message]}))).not.toContain('"usage"');
    expect(JSON.stringify(normalizePiContext({...context,messages:[message]}))).toContain("业务参数保留");
  });
  it("done和result都等待settle确认，再通知onSettled",async()=>{
    const f=fixture();const original=f.call.getMockImplementation()!;
    let release!:()=>void;const gate=new Promise<void>(r=>{release=r;});
    f.call.mockImplementation(async(port,...args)=>{if(port==="settleGenerationCall")await gate;return original(port,...args);});
    const stream=f.run();const events:AssistantMessageEvent[]=[];const consuming=(async()=>{for await(const event of stream)events.push(event);})();
    let resolved=false;void stream.result().then(()=>{resolved=true;});
    await vi.waitFor(()=>expect(f.call.mock.calls.some(c=>c[0]==="settleGenerationCall")).toBe(true));
    expect(resolved).toBe(false);expect(events.map(e=>e.type)).toEqual(["start"]);expect(f.onSettled).not.toHaveBeenCalled();
    release();await consuming;expect(await stream.result()).toEqual(message);
    expect(f.native.mock.calls[0]![2]).toMatchObject({maxTokens:50,maxRetries:0});
    expect(JSON.stringify(f.call.mock.calls)).not.toContain("secret");
    expect(events.at(-1)?.type).toBe("done");expect(f.onSettled).toHaveBeenCalledOnce();
  });
  it("兼容SDK异步流入口且禁用供应商内部重试",async()=>{
    const f=fixture();
    const native=vi.fn(async()=>nativeStream());
    const stream=wrapDurablePiStream(native as unknown as StreamFunction,{signal:f.controller.signal,call:f.call,maxOutputTokens:50,onSettled:f.onSettled})(model,context,{maxRetries:4});
    expect(await stream.result()).toEqual(message);
    expect(native).toHaveBeenCalledWith(model,context,expect.objectContaining({maxRetries:0}));
  });
  it("历史settled只重放完整消息，不再次请求",async()=>{
    const f=fixture("settled");const stream=f.run();expect(await stream.result()).toEqual(message);
    expect(f.native).not.toHaveBeenCalled();expect(f.call).toHaveBeenCalledTimes(1);expect(f.onSettled).toHaveBeenCalledOnce();
  });
  it.each(["started","unknown","rejected"])("历史%s停下对账",async(status)=>{
    const f=fixture(status);await expect(f.run().result()).rejects.toMatchObject({outcome:"unknown_result"});expect(f.native).not.toHaveBeenCalled();
  });
  it("start回执丢失不调用供应商、不污染另一执行者账本",async()=>{
    const f=fixture();const original=f.call.getMockImplementation()!;
    f.call.mockImplementation(async(port,...args)=>{if(port==="startCall")throw new Error("lost");return original(port,...args);});
    await expect(f.run().result()).rejects.toMatchObject({outcome:"unknown_result"});expect(f.native).not.toHaveBeenCalled();expect(f.call).toHaveBeenCalledTimes(2);
  });
  it("settle回执丢失不向Pi释放完成事件、不重复请求",async()=>{
    const f=fixture();const original=f.call.getMockImplementation()!;
    f.call.mockImplementation(async(port,...args)=>{if(port==="settleGenerationCall")throw new Error("lost");return original(port,...args);});
    const stream=f.run();const events:AssistantMessageEvent[]=[];
    await expect((async()=>{for await(const event of stream)events.push(event);})()).rejects.toMatchObject({outcome:"unknown_result"});
    await expect(stream.result()).rejects.toMatchObject({outcome:"unknown_result"});expect(events.some(e=>e.type==="done")).toBe(false);
    expect(f.native).toHaveBeenCalledOnce();expect(f.onSettled).not.toHaveBeenCalled();
  });
  it("明确429按rejected结算并保留retry_wait分类，不自行重试",async()=>{
    const f=fixture();f.native.mockImplementation(()=>{throw Object.assign(new Error("private"),{statusCode:429});});
    await expect(f.run().result()).rejects.toMatchObject({outcome:"retry_wait"});
    expect(f.call.mock.calls.at(-1)).toEqual(["settleGenerationCall",{callId:"c1",status:"rejected"}]);
    expect(f.onFailure).toHaveBeenCalledWith(expect.objectContaining({outcome:"retry_wait"}));expect(f.native).toHaveBeenCalledOnce();
  });
  it("取消会终止不响应signal的流等待，结算unknown且不发done",async()=>{
    const f=fixture();
    f.native.mockImplementation(()=>({result:()=>new Promise(()=>{}),[Symbol.asyncIterator]:()=>({next:()=>new Promise(()=>{})})}) as unknown as ReturnType<StreamFunction>);
    const stream=f.run();await vi.waitFor(()=>expect(f.native).toHaveBeenCalledOnce());f.controller.abort();
    await expect(stream.result()).rejects.toMatchObject({outcome:"unknown_result"});
    expect(f.call.mock.calls.at(-1)).toEqual(["settleGenerationCall",{callId:"c1",status:"unknown"}]);expect(f.onSettled).not.toHaveBeenCalled();
  });
  it("结算成功后onSettled失败不回退账本，也不释放done",async()=>{
    const f=fixture();f.onSettled.mockRejectedValue(new Error("checkpoint lost"));
    await expect(f.run().result()).rejects.toMatchObject({outcome:"unknown_result"});
    expect(f.call.mock.calls.filter(c=>c[0]==="settleGenerationCall")).toHaveLength(1);
  });
  it("明确拒绝的结算回执丢失转unknown，不能安全重试",async()=>{
    const f=fixture();const original=f.call.getMockImplementation()!;
    f.native.mockImplementation(()=>{throw Object.assign(new Error("rate limit"),{statusCode:429});});
    f.call.mockImplementation(async(port,...args)=>{if(port==="settleGenerationCall")throw new Error("receipt lost");return original(port,...args);});
    await expect(f.run().result()).rejects.toMatchObject({outcome:"unknown_result"});
    expect(f.onFailure).toHaveBeenCalledWith(expect.objectContaining({outcome:"unknown_result"}));
  });

  it("冻结systemPrompt同时用于账本请求和实际供应商，不保留SDK宿主追加信息",async()=>{
    const f=fixture();
    const sourceContext={...context,systemPrompt:"SDK system prompt + private working directory"};
    const stream=wrapDurablePiStream(f.native,{signal:f.controller.signal,call:f.call,maxOutputTokens:50,onSettled:f.onSettled,frozenSystemPrompt:"冻结原文"})(model,sourceContext,{apiKey:"secret"});
    await expect(stream.result()).resolves.toEqual(message);
    expect(f.call.mock.calls[0]?.[1]).toMatchObject({request:{systemPrompt:"冻结原文"}});
    expect(f.native.mock.calls[0]?.[1]).toMatchObject({systemPrompt:"冻结原文"});
    expect(sourceContext.systemPrompt).toBe("SDK system prompt + private working directory");
  });

});
