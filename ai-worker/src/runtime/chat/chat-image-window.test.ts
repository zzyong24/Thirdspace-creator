import {expect,it} from "vitest";
import type {ModelMessage} from "ai";
import {windowChatPiMessages} from "./chat-pi-context";
import {windowChatContextV2} from "./chat-context-window-v2";

const imageData=Buffer.alloc(20_000,0xaa).toString("base64");
const tool=(id:string):ModelMessage=>({role:"tool",content:[{type:"tool-result",toolCallId:id,toolName:"browser_screenshot",output:{type:"content",value:[{type:"text",text:"原回执摘要"},{type:"file",mediaType:"image/png",data:{type:"data",data:imageData}}]}}]}) as ModelMessage;
const textTool={role:"tool",content:[{type:"tool-result",toolCallId:"after-shot",toolName:"browser_status",output:{type:"text",value:"仍在当前页面"}}]} as ModelMessage;
const user={role:"user",content:"查看网页"} as ModelMessage;
const assistant={role:"assistant",content:[{type:"text",text:"继续"}]} as ModelMessage;

it.each(["v1","v2"] as const)("%s 仅紧邻本轮的图片送入模型，后续回合保留引用且不重复注入",version=>{
 const project=(messages:ModelMessage[])=>version==="v1"?windowChatPiMessages(messages):windowChatContextV2(messages,"系统",[],240000,1);
 const immediate=project([user,assistant,tool("first")]);
 expect(JSON.stringify(immediate.messages)).toContain(imageData);
 expect(JSON.stringify(project([user,assistant,tool("first"),textTool]).messages)).toContain(imageData);
 const second=project([user,assistant,tool("first"),assistant,tool("second")]);
 expect(JSON.stringify(second.messages).match(new RegExp(imageData,"g"))).toHaveLength(1);
 expect(JSON.stringify(second.messages)).toContain("first");
 expect(JSON.stringify(second.messages)).toContain("历史截图已省略");
 const later=project([user,assistant,tool("first"),assistant,tool("second"),assistant]);
 expect(JSON.stringify(later.messages)).not.toContain(imageData);
 expect(JSON.stringify(later.messages)).toContain("tool.result.read");
});
