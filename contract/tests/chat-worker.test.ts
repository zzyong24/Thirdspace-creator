import { it, expect } from "vitest";
import { chatWorkerInputSchema, chatToolProviderName } from "../src/internal/chat-worker";
const input={kind:"chat.run",operationKey:"turn",capability:"copilot.assist",userId:"u",accountId:"a",conversationId:"c",sourceMessageId:"m",system:"协助用户",messages:[{role:"user",content:"问题"}],maxSteps:6,maxOutputTokens:128,tools:[{name:"web.read",version:"1",description:"读取",parameters:{type:"object"},effect:"none"}]};
it("聊天输入允许普通文本短路径，原始工具名只按供应商协议编码",()=>{
  expect(chatWorkerInputSchema.parse(input).tools[0]!.name).toBe("web.read");
  expect(chatToolProviderName("web.read")).toBe("web_read");
  expect(chatWorkerInputSchema.parse({...input,tools:[]}).tools).toEqual([]);
});
it("拒绝编码碰撞、越界强制工具与无界循环参数",()=>{
  expect(chatWorkerInputSchema.safeParse({...input,tools:[...input.tools,{...input.tools[0],name:"web_read"}]}).success).toBe(false);
  expect(chatWorkerInputSchema.safeParse({...input,forcedTool:"local.read"}).success).toBe(false);
  expect(chatWorkerInputSchema.safeParse({...input,maxSteps:1000}).success).toBe(false);
});
it("冻结输入拒绝函数、缺失归属与非持久消息字段",()=>{
  expect(chatWorkerInputSchema.safeParse({...input,userId:""}).success).toBe(false);
  expect(chatWorkerInputSchema.safeParse({...input,messages:[{role:"user",content:"问题",callback:()=>{}}]}).success).toBe(false);
  expect(chatWorkerInputSchema.safeParse({...input,tools:[{...input.tools[0],execute:()=>{}}]}).success).toBe(false);
});
