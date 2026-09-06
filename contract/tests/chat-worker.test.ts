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
it("复用关联只出现在后端回执，Worker不能指定复用来源结算",async()=>{
  const {workerToolResultReceiptSchema,agenticToolReservationSchema,workerPortInputSchemas}=await import("../src/internal/execution-worker");
  const output={status:"ok",summary:"已完成",evidence:[],error:null,continuation:null,sideEffect:"none"};
  const receipt={schemaVersion:1,kind:"tool",toolCallId:"model-tool",toolName:"web_read",output,reusedCallId:"prior-call"};
  expect(workerToolResultReceiptSchema.parse(receipt).reusedCallId).toBe("prior-call");
  expect(agenticToolReservationSchema.parse({callId:"current",status:"settled",toolName:"web_read",input:{},receipt}).receipt?.reusedCallId).toBe("prior-call");
  expect(workerPortInputSchemas.settleAgenticTool.safeParse({callId:"current",status:"settled",output,reusedCallId:"invented"}).success).toBe(false);
});

it("聊天完成端口只接收账本引用，拒绝自报消息、身份和终态",async()=>{
  const {workerPortSchema,workerPortInputSchemas}=await import("../src/internal/execution-worker");
  expect(workerPortSchema.safeParse("commitChatResult").success).toBe(true);
  const schema=workerPortInputSchemas.commitChatResult;
  const input={lastModelCallId:"model-final",toolCallIds:["tool-1"]};
  expect(schema.safeParse(input).success).toBe(true);
  for(const extra of [{message:{text:"伪造"}},{userId:"foreign"},{outcome:"succeeded"}])expect(schema.safeParse({...input,...extra}).success).toBe(false);
  expect(schema.safeParse({...input,toolCallIds:["tool-1","tool-1"]}).success).toBe(false);
});

import {chatSubmittedTaskType} from "../src/internal/execution-worker";
it.each([["planning.thesis","planning.thesis"],["material.generate","asset.generate"]])("%s 只映射明确的原子子任务类型",(name,taskType)=>{
 expect(chatSubmittedTaskType(name)).toBe(taskType);
 expect(chatWorkerInputSchema.safeParse({...input,tools:[{name,version:"v1",description:"test",parameters:{type:"object"},effect:"committed",execution:"host.task-submit"}]}).success).toBe(true);
});
it.each(["asset.generate","cover.generate","arbitrary.task","__proto__","constructor"])("%s 不能冒充已迁移的事务工具",name=>{
 expect(chatSubmittedTaskType(name)).toBeNull();
 expect(chatWorkerInputSchema.safeParse({...input,tools:[{name,version:"v1",description:"test",parameters:{type:"object"},effect:"committed",execution:"host.task-submit"}]}).success).toBe(false);
});
it.each(["none","proposal"])("素材提交不能声明为 %s",effect=>{
 expect(chatWorkerInputSchema.safeParse({...input,tools:[{name:"material.generate",version:"v1",description:"test",parameters:{type:"object"},effect,execution:"host.task-submit"}]}).success).toBe(false);
});
