import {describe,it,expect,vi} from "vitest";
import type {AgenticToolOutcome,WorkerPort} from "@creatoros/contract/execution-worker";
import {runDurableAgenticTool} from "./durable-agentic-tool";
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
  it("settle回执丢失不重做工具，仅补unknown结算",async()=>{
    const f=fixture();const original=f.call.getMockImplementation()!;
    f.call.mockImplementation(async(port,data,signal)=>{if(port==="settleAgenticTool" && (data as {status:string}).status==="settled")throw new Error("lost");return original(port,data,signal);});
    await expect(f.run()).rejects.toMatchObject({outcome:"unknown_result"});
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(f.call.mock.calls.at(-1)).toEqual(["settleAgenticTool",{callId:"call-1",status:"unknown"}]);
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
