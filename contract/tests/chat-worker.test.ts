import {it,expect} from "vitest";
import {chatWorkerInputSchema,chatSubmittedTaskType} from "../src/internal/execution-worker";
const input={kind:"chat.run",operationKey:"call",capability:"copilot.assist",userId:"u",accountId:"a",conversationId:"conversation",sourceMessageId:"message",system:"test",messages:[{role:"user",content:"提交"}],maxSteps:2,maxOutputTokens:128};
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
