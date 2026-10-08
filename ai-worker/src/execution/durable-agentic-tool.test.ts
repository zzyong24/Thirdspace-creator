import {describe,it,expect,vi} from "vitest";
import type {AgenticToolOutcome,WorkerPort} from "@creatoros/contract/execution-worker";
import {runDurableAgenticTool} from "./durable-agentic-tool";
import {projectReceiptForPi} from "../capabilities/result-pages";
const input={modelCallId:"model-1",toolCallId:"tool-1"};
const output:AgenticToolOutcome={status:"ok",summary:"真实正文",evidence:[{sourceUrl:"https://example.com",text:"正文"}],error:null,continuation:null,sideEffect:"none"};
function fixture(status="reserved") {
  const controller=new AbortController();
  const execute=vi.fn(async()=>output);
  const call=vi.fn(async(port:WorkerPort,data:unknown,_signal?:AbortSignal):Promise<unknown>=>{
    if(port==="reserveAgenticTool")return {callId:"call-1",status,toolName:"web.read",input:{url:"https://example.com"},...(status==="settled"?{receipt:{schemaVersion:1,kind:"tool",toolCallId:input.toolCallId,toolName:"web.read",output}}:{})};
    if(port==="startAgenticTool")return {callId:"call-1",status:"started"};
    if(port==="settleAgenticTool")return {callId:"call-1",status:(data as {status:string}).status};
    throw new Error("unexpected port");
  });
  return {controller,execute,call,run:()=>runDurableAgenticTool(input,{signal:controller.signal,execute,call})};
}
describe("Worker 持久工具执行边界",()=>{
  it("后端非法参数回执经start与settle持久返回，绝不调用执行handler",async()=>{
    const f=fixture();const original=f.call.getMockImplementation()!;
    const validationOutcome:AgenticToolOutcome={status:"error",summary:"参数无效",evidence:[],error:{code:"invalid_input",retryable:true,recovery:"请提供url"},continuation:null,sideEffect:"none"};
    f.call.mockImplementation(async(port,data,signal)=>{
      const result=await original(port,data,signal);
      return port==="reserveAgenticTool"?{...(result as object),input:{},validationOutcome}:result;
    });
    expect(await f.run()).toEqual(validationOutcome);expect(f.execute).not.toHaveBeenCalled();
    expect(f.call.mock.calls.map(c=>c[0])).toEqual(["reserveAgenticTool","startAgenticTool","settleAgenticTool"]);
    expect(f.call.mock.calls[2]![1]).toEqual({callId:"call-1",status:"settled",output:validationOutcome});
  });
  it("先启动确认再执行，结算确认后返回真实结果",async()=>{
    const f=fixture();expect(await f.run()).toEqual(output);
    expect(f.call.mock.calls.map(c=>c[0])).toEqual(["reserveAgenticTool","startAgenticTool","settleAgenticTool"]);
    expect(f.execute).toHaveBeenCalledExactlyOnceWith("web.read",{url:"https://example.com"},f.controller.signal);
    expect(f.call.mock.calls[2]![2]).toBeUndefined();
  });
  it("已结算回执只重放，绝不再次执行或结算",async()=>{
    const f=fixture("settled");expect(await f.run()).toEqual(output);
    expect(f.execute).not.toHaveBeenCalled();expect(f.call).toHaveBeenCalledTimes(1);
  });
  it("已结算截图回放仅解析原媒体引用，不再次派发浏览器截图",async()=>{
    const dataRef="wm1-"+"a".repeat(64);
    const screenshot:AgenticToolOutcome={status:"ok",summary:"截图",evidence:[],data:{workbench:{operationId:"call-1",status:"succeeded",artifactRefs:[],progressCursor:null,content:[{type:"image",mediaType:"image/png",dataRef}]}},error:null,continuation:null,sideEffect:"none"};
    const execute=vi.fn(async()=>{throw Error("BROWSER_SCREENSHOT_MUST_NOT_RERUN");});
    const call=vi.fn(async(port:WorkerPort)=>{
      if(port!=="reserveAgenticTool")throw Error("UNEXPECTED_WORKER_PORT");
      return {callId:"call-1",status:"settled",toolName:"browser_screenshot",input:{},receipt:{schemaVersion:1,kind:"tool",toolCallId:"tool-1",toolName:"browser_screenshot",output:screenshot}};
    });
    const replayed=await runDurableAgenticTool(input,{signal:AbortSignal.timeout(10000),call,execute});
    const resolveImage=vi.fn(async()=>({mimeType:"image/png",data:"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4AWP4z8DwHwAFAAH/e+m+7wAAAABJRU5ErkJggg=="}));
    const projected=await projectReceiptForPi(replayed,"call-1",{resolveImage});
    expect(projected.content[1]?.type).toBe("image");expect(resolveImage).toHaveBeenCalledExactlyOnceWith(dataRef);
    expect(execute).not.toHaveBeenCalled();expect(call).toHaveBeenCalledTimes(1);
  });
  it.each(["started","unknown","rejected"])("历史%s需要对账，不重做",async(status)=>{
    const f=fixture(status);await expect(f.run()).rejects.toMatchObject({outcome:"unknown_result"});
    expect(f.execute).not.toHaveBeenCalled();expect(f.call).toHaveBeenCalledTimes(1);
  });
  it("start回执丢失或拒绝，不执行也不污染其他消费者账本",async()=>{
    const f=fixture();const original=f.call.getMockImplementation()!;
    f.call.mockImplementation(async(port,...args)=>{if(port==="startAgenticTool")throw new Error("private-token");return original(port,...args);});
    await expect(f.run()).rejects.toMatchObject({outcome:"unknown_result",message:"TOOL_REQUIRES_RECONCILIATION"});
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.call.mock.calls.map(c=>c[0])).toEqual(["reserveAgenticTool","startAgenticTool"]);
  });
  it("settle回执丢失且查询无已确认事实，不重做工具",async()=>{
    const f=fixture();const original=f.call.getMockImplementation()!;
    f.call.mockImplementation(async(port,data,signal)=>{if(port==="settleAgenticTool" && (data as {status:string}).status==="settled")throw new Error("lost");return original(port,data,signal);});
    await expect(f.run()).rejects.toMatchObject({outcome:"unknown_result"});
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(f.call.mock.calls).toContainEqual(["settleAgenticTool",{callId:"call-1",status:"unknown"}]);
  });
  it("执行期间取消但工具返回真实结果，保存结算且不向循环返回",async()=>{
    const f=fixture();f.execute.mockImplementation(async()=>{f.controller.abort();return output;});
    await expect(f.run()).rejects.toMatchObject({outcome:"unknown_result"});
    expect(f.call.mock.calls.filter(c=>c[0]==="settleAgenticTool")).toEqual([["settleAgenticTool",{callId:"call-1",status:"settled",output}]]);
  });
  it("执行抛错包括取消时，无signal补unknown结算",async()=>{
    const f=fixture();f.execute.mockImplementation(async()=>{f.controller.abort();throw new Error("cancelled");});
    await expect(f.run()).rejects.toMatchObject({outcome:"unknown_result"});
    expect(f.call.mock.calls.at(-1)).toEqual(["settleAgenticTool",{callId:"call-1",status:"unknown"}]);
  });
  it.each(["unknown_commit","sideEffect"])("%s不能伪装为已完成",async(mode)=>{
    const f=fixture();f.execute.mockResolvedValue({...output,...(mode==="unknown_commit"?{error:{code:"unknown_commit",retryable:false,recovery:"核实结果"}}:{sideEffect:"unknown"})} as AgenticToolOutcome);
    const original=f.call.getMockImplementation()!;
    f.call.mockImplementation(async(port,data,signal)=>port==="settleAgenticTool"?{callId:"call-1",status:"unknown"}:original(port,data,signal));
    await expect(f.run()).rejects.toMatchObject({outcome:"unknown_result"});
    expect(f.execute).toHaveBeenCalledTimes(1);expect(f.call).toHaveBeenCalledTimes(3);
  });
  it("明确的工具错误作为已确认事实返回，是否恢复由模型决定",async()=>{
    const f=fixture();const failure:AgenticToolOutcome={...output,status:"error",evidence:[],error:{code:"transient",retryable:true,recovery:"稍后再观察"}};
    f.execute.mockResolvedValue(failure);expect(await f.run()).toEqual(failure);expect(f.execute).toHaveBeenCalledTimes(1);
  });
  it("调用前已取消不预留、不执行",async()=>{
    const f=fixture();f.controller.abort();await expect(f.run()).rejects.toThrow();expect(f.call).not.toHaveBeenCalled();
  });
  it("结算成功回执返回时取消，不把settled覆盖为unknown",async()=>{
    const f=fixture();const original=f.call.getMockImplementation()!;
    f.call.mockImplementation(async(port,data,signal)=>{
      const result=await original(port,data,signal);
      if(port==="settleAgenticTool")f.controller.abort();
      return result;
    });
    await expect(f.run()).rejects.toMatchObject({outcome:"unknown_result"});
    expect(f.call.mock.calls.filter(c=>c[0]==="settleAgenticTool")).toHaveLength(1);
  });
  it("重放回执关联不匹配时拒绝，不启动工具补做",async()=>{
    const f=fixture("settled");const original=f.call.getMockImplementation()!;
    f.call.mockImplementation(async(port,data,signal)=>{
      const result=await original(port,data,signal) as {receipt?:{toolCallId:string}};
      if(result.receipt)result.receipt.toolCallId="other-call";
      return result;
    });
    await expect(f.run()).rejects.toMatchObject({outcome:"unknown_result"});
    expect(f.execute).not.toHaveBeenCalled();expect(f.call).toHaveBeenCalledTimes(1);
  });

  it("两个消费者竞争同reserved时，start失败者不结算unknown",async()=>{
    const first=fixture();const second=fixture();let started=false;
    const original=first.call.getMockImplementation()!;
    const shared=vi.fn(async(port:WorkerPort,data:unknown,signal?:AbortSignal)=>{
      if(port==="startAgenticTool") {
        if(started)throw new Error("ALREADY_STARTED");
        started=true;
      }
      return original(port,data,signal);
    });
    const results=await Promise.allSettled([
      runDurableAgenticTool(input,{signal:first.controller.signal,call:shared,execute:first.execute}),
      runDurableAgenticTool(input,{signal:second.controller.signal,call:shared,execute:second.execute}),
    ]);
    expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);
    expect(first.execute.mock.calls.length+second.execute.mock.calls.length).toBe(1);
    expect(shared.mock.calls.filter(c=>c[0]==="settleAgenticTool").map(c=>c[1])).toEqual([{callId:"call-1",status:"settled",output}]);
  });

});
it.each(["same","other-call","other-tool","other-proposal","unknown-effect"])("丢 ACK 后只采信同一调用的明确回执：%s",async variant=>{
 const f=fixture(),original=f.call.getMockImplementation()!;let reservations=0;
 f.execute.mockRejectedValue(new Error("ACK lost"));
 f.call.mockImplementation(async(port,data,signal)=>{
  if(port==="reserveAgenticTool" && ++reservations>1)return {callId:variant==="other-call"?"other":"call-1",status:"settled",toolName:variant==="other-tool"?"other":"web.read",input:{},receipt:{schemaVersion:1,kind:"tool",toolCallId:variant==="other-proposal"?"other":input.toolCallId,toolName:"web.read",output:variant==="unknown-effect"?{...output,sideEffect:"unknown"}:output}};
  return original(port,data,signal);
 });
 if(variant==="same")expect(await f.run()).toEqual(output);else await expect(f.run()).rejects.toMatchObject({outcome:"unknown_result"});
 expect(f.execute).toHaveBeenCalledTimes(1);expect(reservations).toBe(2);
});
it("回读已确认回执期间取消，迟到结果不交回模型循环",async()=>{
 const f=fixture(),original=f.call.getMockImplementation()!;let reservations=0,release!:()=>void;
 f.execute.mockRejectedValue(new Error("ACK lost"));
 f.call.mockImplementation(async(port,data,signal)=>{
  if(port==="reserveAgenticTool" && ++reservations>1){await new Promise<void>(r=>{release=r;});return {callId:"call-1",status:"settled",toolName:"web.read",input:{},receipt:{schemaVersion:1,kind:"tool",toolCallId:input.toolCallId,toolName:"web.read",output}};}
  return original(port,data,signal);
 });
 const pending=f.run();await vi.waitFor(()=>expect(release).toBeDefined());f.controller.abort();release();
 await expect(pending).rejects.toMatchObject({outcome:"unknown_result"});expect(f.execute).toHaveBeenCalledTimes(1);
 expect(f.call.mock.calls.filter(c=>c[0]==="startAgenticTool")).toHaveLength(1);
});
