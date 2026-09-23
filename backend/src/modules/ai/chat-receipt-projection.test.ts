import { expect,it } from "vitest";
import { chatWorkerInputSchema } from "@creatoros/contract/execution-worker";
import { projectChatReceipts } from "./chat-receipt-projection";
const input=chatWorkerInputSchema.parse({kind:"chat.run",operationKey:"chat",capability:"copilot.assist",userId:"u",accountId:"a",conversationId:"c",sourceMessageId:"m",system:"策略",messages:[{role:"user",content:"问题"}],maxSteps:6,maxOutputTokens:128,tools:[{name:"web.read",version:"1",description:"读取",parameters:{type:"object"},effect:"none"}]});
const model=(id:string,content:unknown[],finishReason:string)=>({id,kind:"model",resultText:null,providerResult:{content,finishReason:{unified:finishReason},usage:{inputTokens:{total:2},outputTokens:{total:3}},warnings:[]}});
const failed={status:"error",summary:"工具参数无效",evidence:[],error:{code:"invalid_input",retryable:false,recovery:"请修正参数"},continuation:null,sideEffect:"none"};
const receipt=(output:unknown)=>({id:"tool",kind:"tool",providerResult:null,resultText:JSON.stringify({schemaVersion:1,kind:"tool",toolCallId:"read",toolName:"web_read",output})});
const calls=(output:unknown)=>[model("model-1",[{type:"tool-call",toolCallId:"read",toolName:"web_read",input:'{"query":'}],"tool-calls"),receipt(output),model("model-2",[{type:"text",text:"已经解释输入问题"}],"stop")];
it("已结算参数错误后模型继续完成，保留错误历史而不反杀最终回复",()=>{
 const result=projectChatReceipts(calls(failed),input);
 expect(result).toMatchObject({outcome:"succeeded",content:"已经解释输入问题"});
 expect(result.parts).toContainEqual(expect.objectContaining({type:"tool-web_read",state:"output-error",rawInput:'{"query":',errorText:"工具参数无效"}));
 expect(result.parts.find(part=>part.type==="tool-web_read")).not.toHaveProperty("input");
});
it("坏参数没有对应无副作用 invalid_input 回执时仍拒绝",()=>{
 for(const output of [{...failed,error:null,status:"ok"},{...failed,sideEffect:"committed"}])expect(()=>projectChatReceipts(calls(output),input)).toThrow();
});

it("误传内部回执时也不把内部正文或工具请求投影到聊天",()=>{
 const original:Parameters<typeof projectChatReceipts>[0]=calls(failed);
 original.splice(2,0,{...model("child",[{type:"text",text:"内部候选"},{type:"tool-call",toolCallId:"forged",toolName:"unknown",input:"{}"}],"tool-calls"),parentCallId:"tool"});
 const result=projectChatReceipts(original,input);
 expect(result.content).toBe("已经解释输入问题");expect(JSON.stringify(result.parts)).not.toContain("内部候选");
});
it("连续相同的不可重试失败以可信宿主说明收口为partial",()=>{
 const result=projectChatReceipts([],input,new Map(),undefined,[{toolName:"plan_update",errorCode:"invalid_input"}]);
 expect(result.outcome).toBe("partial");
 expect(result.content).toContain("本次部分完成。工具 plan_update 对相同参数连续返回不可重试错误（invalid_input），系统已停止重复调用。");
});
