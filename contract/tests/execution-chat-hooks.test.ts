import {it,expect} from "vitest";
import {workerPortSchema,workerPortInputSchemas,chatWorkerInputSchema} from "../src/internal/execution-worker";
it("开场端口只接受调用引用，不接受账号或候选内容",()=>{
 for(const name of ["prepareChatHooks","reserveChatHooksModel","startChatHooksModel","settleChatHooksModel","completeChatHooks"]){expect(workerPortSchema.safeParse(name).success).toBe(true);}
 expect(workerPortInputSchemas.prepareChatHooks.parse({callId:"parent"})).toEqual({callId:"parent"});
 expect(workerPortInputSchemas.completeChatHooks.safeParse({callId:"parent",items:[]}).success).toBe(false);
 expect(workerPortInputSchemas.prepareChatHooks.safeParse({callId:"parent",accountId:"other"}).success).toBe(false);
});
it("冻结工具显式绑定内部开场执行，旧工具不增默认字段",()=>{
 const input={kind:"chat.run",operationKey:"chat",capability:"copilot.assist",userId:"u",accountId:"a",conversationId:"c",sourceMessageId:"s",system:"系统",messages:[{role:"user",content:"正文"}],maxSteps:6,maxOutputTokens:128,tools:[{name:"script.hooks",version:"1",description:"开场",parameters:{type:"object"},effect:"proposal"}]};
 expect(chatWorkerInputSchema.parse(input).tools[0]).not.toHaveProperty("execution");
 const workerTool={...input.tools[0],execution:"worker.script-hooks"};
 expect(chatWorkerInputSchema.parse({...input,tools:[workerTool]}).tools[0]?.execution).toBe("worker.script-hooks");
 expect(chatWorkerInputSchema.safeParse({...input,tools:[{...workerTool,name:"publish",effect:"committed"}]}).success).toBe(false);
});
