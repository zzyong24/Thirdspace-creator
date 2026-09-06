import {expect,it,vi} from "vitest";
import type {WorkerPort} from "@creatoros/contract/execution-worker";
const model=vi.hoisted(()=>({create:vi.fn(()=>{throw new Error("MODEL_BOUNDARY_TEST_STOP");})}));
vi.mock("../runtime/provider-factory",()=>({modelFor:model.create}));
import {runChatInWorker} from "./chat-worker-run";
const input={kind:"chat.run" as const,operationKey:"turn",capability:"copilot.assist",userId:"user",accountId:"account",conversationId:"conversation",sourceMessageId:"message",system:"事实",messages:[{role:"user" as const,content:"读取网页"}],maxSteps:4,maxOutputTokens:128,tools:[]};
const spec={apiFormat:"openai_chat" as const,baseUrl:"https://example.com",model:"fixture",token:"fixture"};
const output={status:"ok",summary:"读取完成",evidence:[],data:{assetId:"saved"},error:null,continuation:null,sideEffect:"committed"};
it("恢复先接管全部网页父调用并完成原观察，再进入模型边界",async()=>{
 const order:string[]=[];model.create.mockClear();
 const call=vi.fn(async(port:WorkerPort,data:unknown)=>{
  if(port==="readCheckpoint")return {revision:0,ledgerSequence:2,messages:[],uncheckpointedReceipts:[],recovery:"requires_replay",replayableWebReadToolCallIds:["one","two"]};
  const id=(data as {callId:string}).callId;order.push(`${port}:${id}`);
  if(port==="restoreChatWebRead")return {callId:id,status:"started"};
  if(port==="completeChatWebRead")return output;
  throw new Error("恢复不应重新访问网页");
 });
 await expect(runChatInWorker(input,spec,new AbortController().signal,{call,approve:async()=>"approved"})).rejects.toThrow("MODEL_BOUNDARY_TEST_STOP");
 expect(order).toEqual(["restoreChatWebRead:one","restoreChatWebRead:two","completeChatWebRead:one","completeChatWebRead:two"]);expect(model.create).toHaveBeenCalledTimes(1);
});
it("网页恢复回执身份不符时拒绝新模型与后续提交",async()=>{
 model.create.mockClear();
 const call=vi.fn(async(port:WorkerPort)=>port==="readCheckpoint"?{revision:0,ledgerSequence:1,messages:[],uncheckpointedReceipts:[],recovery:"requires_replay",replayableWebReadToolCallIds:["one"]}:{callId:"forged",status:"started"});
 await expect(runChatInWorker(input,spec,new AbortController().signal,{call,approve:async()=>"approved"})).rejects.toMatchObject({outcome:"unknown_result",errorCode:"CHAT_WEB_READ_RESTORE_RECEIPT_UNKNOWN"});
 expect(model.create).not.toHaveBeenCalled();expect(call.mock.calls.map(c=>c[0])).toEqual(["readCheckpoint","restoreChatWebRead"]);
});
