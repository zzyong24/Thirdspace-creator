import {beforeEach,expect,it,vi} from "vitest";
import type {WorkerPort} from "@creatoros/contract/execution-worker";
import {runChatGenerationInWorker} from "./chat-generation-worker";
import {GenerationFailure} from "./generation-error";
const controlled=vi.hoisted(()=>({sequence:vi.fn()}));
vi.mock("./chat-structured-sequence",()=>({runChatStructuredSequence:controlled.sequence}));
vi.mock("../runtime/provider-factory",()=>({modelFor:()=>({})}));
vi.mock("./durable-generation-model",()=>({createDurableGenerationModel:()=>({})}));
// SEMANTIC_BOUNDARY_ALLOW: 仅受控叶协议夹具提供可信节点异常和宿主回执，验证已登记类型/信号/回执，不判断创作内容；不冒称HTTP或公开整链。
const prepared={node:{capability:"topic.enrich",facets:{title:"原标题"},candidateId:"candidate-original"},maxOutputTokens:128,operationKey:"structured:original-parent",skillSnapshot:{snapshotVersion:1,userId:"leaf-u",accountId:"leaf-a",resolvedAt:"fixed",platformPolicyVersion:"1",platformPolicy:"候选",skills:[{skillId:"topic.enrich",baseVersion:"1",overlayRevision:null,overlayVersion:null,effective:{methodSystem:"原策略",template:"{{title}}",tools:[],requiredFacets:["title"],contextRequirements:[],outputSchema:{type:"object",properties:{oneLiner:{type:"string"}},required:["oneLiner"]},completionPolicy:null,completionPolicyAdapter:null}}]}};
const result={status:"ok",summary:"原候选",evidence:[],data:{kind:"topic.card",oneLiner:"原结果"},error:null,continuation:null,sideEffect:"none"};
beforeEach(()=>{controlled.sequence.mockReset();});
function ports(options:{complete?:()=>Promise<unknown>;fail?:(input:unknown)=>Promise<unknown>}={}){
 const reports:unknown[]=[];
 const call=vi.fn(async(port:WorkerPort,input:unknown):Promise<unknown>=>{
  if(port==="resolveChatGenerationCredential")return {apiFormat:"openai_chat",baseUrl:"http://127.0.0.1:1/v1",model:"fixture",token:"local-fixture"};
  if(port==="prepareChatGeneration")return structuredClone(prepared);
  if(port==="completeChatGeneration"){if(options.complete)return options.complete();throw Error("原生成仍未完整");}
  if(port==="failChatGeneration"){reports.push(structuredClone(input));if(options.fail)return options.fail(input);return {status:(input as {outcome:string}).outcome};}
  throw Error(`非预期端口:${port}`);
 });return {call,reports};
}
it.each([false,true])("已知retry_wait同实例或可信cause保原code/delay：wrapped=%s",async wrapped=>{
 const failure=new GenerationFailure("retry_wait","RATE_LIMIT",1750),f=ports();
 controlled.sequence.mockRejectedValue(wrapped?new Error("结构化包装",{cause:failure}):failure);
 await expect(runChatGenerationInWorker("parent-original",new AbortController().signal,f.call)).rejects.toMatchObject({outcome:"retry_wait",errorCode:"RATE_LIMIT",retryAfterMs:1750});
 expect(f.reports).toEqual([{callId:"parent-original",outcome:"retry_wait",errorCode:"RATE_LIMIT",retryAfterMs:1750}]);expect(controlled.sequence).toHaveBeenCalledTimes(1);
});
it.each(["waiting_user","failed"] as const)("可信cause保原%s，不能变unknown",async outcome=>{
 const failure=new GenerationFailure(outcome,"ORIGINAL_KNOWN_CODE"),f=ports();controlled.sequence.mockRejectedValue(new Error("包装",{cause:failure}));
 await expect(runChatGenerationInWorker("parent-original",new AbortController().signal,f.call)).rejects.toMatchObject({outcome:outcome,errorCode:"ORIGINAL_KNOWN_CODE"});
 expect(f.reports).toEqual([{callId:"parent-original",outcome,errorCode:"ORIGINAL_KNOWN_CODE",retryAfterMs:undefined}]);
});
it.each(["direct","cause"])("缺模型结算ACK保持unknown且不报可重试：%s",async shape=>{
 const failure=new GenerationFailure("unknown_result","MODEL_SETTLEMENT_RECEIPT_UNKNOWN"),f=ports();controlled.sequence.mockRejectedValue(shape==="cause"?new Error("包装",{cause:failure}):failure);
 await expect(runChatGenerationInWorker("parent-original",new AbortController().signal,f.call)).rejects.toBe(failure);expect(f.reports).toEqual([]);
});
it("普通网络错误无可信receipt仍unknown，不能借候选恢复放行",async()=>{
 const f=ports();controlled.sequence.mockRejectedValue(Error("connection closed"));
 await expect(runChatGenerationInWorker("parent-original",new AbortController().signal,f.call)).rejects.toMatchObject({outcome:"unknown_result",errorCode:"MODEL_RESULT_UNKNOWN"});expect(f.reports).toEqual([]);
});
it("宿主已有完整结果优先回读，不因叶异常报告失败或重跑",async()=>{
 const f=ports({complete:async()=>result});controlled.sequence.mockRejectedValue(new GenerationFailure("retry_wait","RATE_LIMIT",1750));
 expect(await runChatGenerationInWorker("parent-original",new AbortController().signal,f.call)).toEqual(result);expect(f.reports).toEqual([]);expect(controlled.sequence).toHaveBeenCalledTimes(1);
});
it("原signal取消后不回读完成或报告可恢复失败",async()=>{
 const abort=new AbortController(),reason=Error("原任务取消"),f=ports();controlled.sequence.mockImplementation(async()=>{abort.abort(reason);throw new GenerationFailure("retry_wait","RATE_LIMIT",1750);});
 await expect(runChatGenerationInWorker("parent-original",abort.signal,f.call)).rejects.toBe(reason);expect(f.call.mock.calls.map(row=>row[0])).toEqual(["resolveChatGenerationCredential","prepareChatGeneration"]);expect(f.reports).toEqual([]);
});
it("宿主failure ACK丢失仅重读同报告，不新增节点或更换parent",async()=>{
 let acknowledgments=0;const f=ports({fail:async()=>{if(++acknowledgments===1)throw Error("宿主失败ACK丢失");return {status:"retry_wait"};}});
 controlled.sequence.mockRejectedValue(new GenerationFailure("retry_wait","RATE_LIMIT",1750));
 await expect(runChatGenerationInWorker("parent-original",new AbortController().signal,f.call)).rejects.toMatchObject({outcome:"retry_wait",errorCode:"RATE_LIMIT",retryAfterMs:1750});
 expect(f.reports).toEqual(Array.from({length:2},()=>({callId:"parent-original",outcome:"retry_wait",errorCode:"RATE_LIMIT",retryAfterMs:1750})));expect(controlled.sequence).toHaveBeenCalledTimes(1);
});

it('已结算发送前失败直接报告原因，不调用 complete 掩盖为 HOST_PORT_REJECTED',async()=>{
 const f=ports();controlled.sequence.mockRejectedValue(new GenerationFailure('failed','MODEL_REQUEST_BUILD_FAILED',undefined,'ReferenceError: fixture is not defined'));
 await expect(runChatGenerationInWorker('parent-original',new AbortController().signal,f.call)).rejects.toMatchObject({outcome:'failed',errorCode:'MODEL_REQUEST_BUILD_FAILED',message:'ReferenceError: fixture is not defined'});
 expect(f.call.mock.calls.some(([port])=>port==='completeChatGeneration')).toBe(false);
 expect(f.reports).toEqual([{callId:'parent-original',outcome:'failed',errorCode:'MODEL_REQUEST_BUILD_FAILED',retryAfterMs:undefined}]);
});
