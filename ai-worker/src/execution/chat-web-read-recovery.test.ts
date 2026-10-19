import {expect,it,vi} from "vitest";
import {chatWorkerInputSchema,type WorkerPort} from "@creatoros/contract/execution-worker";
const model=vi.hoisted(()=>({create:vi.fn(()=>{throw new Error("MODEL_BOUNDARY_TEST_STOP");})}));
vi.mock("../runtime/provider-factory",()=>({modelFor:model.create}));
import {runChatInWorker} from "./chat-worker-run";
// 与正式 chat-turn-submission 的冻结输入一致；引擎标记缺失代表旧任务，不能进入恢复。
// 此夹具无 history.read，故不声明仅用于历史分页的 contextPolicyVersion:2。
const input=chatWorkerInputSchema.parse({kind:"chat.run",executionEngine:"pi",recoverMissingFinal:true,operationKey:"turn",capability:"copilot.assist",userId:"user",accountId:"account",conversationId:"conversation",sourceMessageId:"message",system:"事实",messages:[{role:"user",content:"读取网页"}],maxSteps:4,maxOutputTokens:128,tools:[]});
const spec={apiFormat:"openai_chat" as const,baseUrl:"https://example.com",model:"fixture",token:"fixture"};
const output={status:"ok",summary:"读取完成",evidence:[],data:{assetId:"saved"},error:null,continuation:null,sideEffect:"committed"};
function checkpoint(callIds:string[],recovery:"pending"|"requires_replay"="pending"){
 return {schemaVersion:1,revision:0,ledgerSequence:callIds.length+1,messages:[],
  uncheckpointedReceipts:recovery==="requires_replay"?[{kind:"model",callId:"original-model",sequence:1}]:[],
  pendingCalls:callIds.map(callId=>({callId,status:"started"})),recovery,replayableWebReadToolCallIds:callIds};
}
it.each(["pending","requires_replay"] as const)("当前冻结 Pi 任务在 %s 时先接管全部网页父调用并完成原观察，再进入模型边界",async recovery=>{
 const order:string[]=[];model.create.mockClear();
 const call=vi.fn(async(port:WorkerPort,data:unknown)=>{
  if(port==="readCheckpoint")return checkpoint(["one","two"],recovery);
  const id=(data as {callId:string}).callId;order.push(`${port}:${id}`);
  if(port==="restoreChatWebRead")return {callId:id,status:"started"};
  if(port==="completeChatWebRead")return output;
  throw new Error("恢复不应重新访问网页");
 });
 await expect(runChatInWorker(input,spec,new AbortController().signal,{call,approve:async()=>"approved"})).rejects.toThrow("MODEL_BOUNDARY_TEST_STOP");
 expect(order).toEqual(["restoreChatWebRead:one","restoreChatWebRead:two","completeChatWebRead:one","completeChatWebRead:two"]);expect(model.create).toHaveBeenCalledTimes(1);
 expect(call.mock.calls.map(c=>[c[0],c[1]])).toEqual([["readCheckpoint",{}],["restoreChatWebRead",{callId:"one"}],["restoreChatWebRead",{callId:"two"}],["completeChatWebRead",{callId:"one"}],["completeChatWebRead",{callId:"two"}]]);
});
it.each(["one","two"])("网页恢复回执 %s 身份不符时拒绝新模型与全部后续提交",async forgedCallId=>{
 model.create.mockClear();
 const call=vi.fn(async(port:WorkerPort,data:unknown)=>{
  if(port==="readCheckpoint")return checkpoint(["one","two"]);
  if(port!=="restoreChatWebRead")throw new Error("身份错误后不应读取网页或提交观察");
  const {callId}=data as {callId:string};
  return {callId:callId===forgedCallId?"forged":callId,status:"started"};
 });
 await expect(runChatInWorker(input,spec,new AbortController().signal,{call,approve:async()=>"approved"})).rejects.toMatchObject({outcome:"unknown_result",errorCode:"CHAT_WEB_READ_RESTORE_RECEIPT_UNKNOWN"});
 expect(model.create).not.toHaveBeenCalled();
 expect(call.mock.calls.map(c=>[c[0],c[1]])).toEqual([["readCheckpoint",{}],["restoreChatWebRead",{callId:"one"}],...(forgedCallId==="two"?[["restoreChatWebRead",{callId:"two"}]]:[])]);
});
it.each([false,true])("旧协议任务保留升级阻断且不重放网页（存在在途调用：%s）",async hasPendingCall=>{
 model.create.mockClear();
 const {executionEngine:_,...legacy}=input;
 const call=vi.fn(async(port:WorkerPort)=>{
  if(port!=="readCheckpoint")throw new Error("旧任务不能自动恢复或重发");
  return {...checkpoint(["one"]),pendingCalls:hasPendingCall?[{callId:"one",status:"started"}]:[]};
 });
 await expect(runChatInWorker(legacy,spec,new AbortController().signal,{call,approve:async()=>"approved"})).rejects.toMatchObject({outcome:hasPendingCall?"unknown_result":"waiting_user",errorCode:"CHAT_LEGACY_RUNTIME_UPGRADE_REQUIRED"});
 expect(model.create).not.toHaveBeenCalled();expect(call.mock.calls.map(c=>c[0])).toEqual(["readCheckpoint"]);
});
