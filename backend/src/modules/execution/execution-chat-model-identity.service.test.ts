import { createHash } from "node:crypto";
import { beforeAll, afterAll, it, expect } from "vitest";
import { z } from "zod";
import { createDb, executionTasks, eq, type Db } from "@creatoros/backend";
import { chatWorkerInputSchema,codexExecutionSpec } from "@creatoros/contract/execution-worker";
import { createPersistentTaskService } from "./persistent-task.service";
import { createExecutionCallLedgerService } from "./execution-call-ledger.service";
import { createAgenticToolBinding } from "./agentic-tool-binding";
import { createExecutionModelIdentityService } from "./execution-model-identity.service";
import { createExecutionChatModelIdentityService } from "./execution-chat-model-identity.service";
let db:Db, close:()=>Promise<void>, seq=0;
const now=()=>"2026-09-06T10:00:00.000Z", ctx={userId:"child-u",accountId:"child-a",requestId:"test",source:"user" as const};
const budget={maxCalls:20,maxTokens:100000,deadlineMs:600000};
const credential={apiFormat:"openai_chat" as const,baseUrl:"https://child.invalid/v1",model:"child-model",token:"secret-token-original",structuredOutputs:false};
beforeAll(async()=>{const f=await createDb();db=f.db;close=()=>f.client.close();});afterAll(async()=>close());
async function fixture(name:"topic.enrich"|"positioning.generate"|"calibration.diagnose"="topic.enrich") {
 const id=`chat-child-${++seq}`,tools={[name]:{version:"1",effect:"proposal" as const,execution:"worker.structured-node" as const,parameters:z.object({})}};
 const input=chatWorkerInputSchema.parse({kind:"chat.run",operationKey:id,capability:"copilot.assist",userId:ctx.userId,accountId:ctx.accountId,conversationId:id,sourceMessageId:id,system:"系统",messages:[{role:"user",content:"生成"}],maxSteps:4,maxOutputTokens:1024,tools:[{name,version:"1",effect:"proposal",execution:"worker.structured-node",description:"生成",parameters:{type:"object"}}]});
 const tasks=createPersistentTaskService(db,{now}),task=await tasks.enqueue(ctx,{kind:"ai_task",ownerType:"ai_task",ownerId:id,idempotencyKey:id,payload:{modelInput:input}});
 const claim=(await tasks.claimTask({taskId:task.id,workerId:id}))!,ref={executionTaskId:task.id,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
 const ledger=createExecutionCallLedgerService(db,{now,budget});
 const root=await ledger.reserve(ref,{kind:"model",operationKey:`${id}/model/1`,inputDigest:`sha256:${createHash("sha256").update("root fixture").digest("hex")}`,reservedTokens:100});
 await ledger.start(ref,root.id);
 await ledger.settle(ref,root.id,{status:"settled",usage:{},providerResult:{content:[{type:"tool-call",toolCallId:"node",toolName:name.replaceAll(".","_"),input:"{}"}],finishReason:{unified:"tool-calls"},usage:{inputTokens:{total:2},outputTokens:{total:3}},warnings:[]}});
 const state=await ledger.inspect(ref);
 const [currentTask]=await db.select().from(executionTasks).where(eq(executionTasks.id,task.id));
 const bound=createAgenticToolBinding(tools).bind(currentTask!,state.calls,{modelCallId:root.id,toolCallId:"node"});
 const parent=await ledger.reserve(ref,{kind:"tool",operationKey:bound.operationKey,inputDigest:bound.inputDigest,reservedTokens:100});await ledger.start(ref,parent.id);
 await createExecutionModelIdentityService(db,{now}).pin(ref,"copilot.assist",{...credential,model:"main-chat-model"});
 return {task,tasks,ref,ledger,parent,tools,service:createExecutionChatModelIdentityService(db,{now,tools})};
}
it.each(["topic.enrich","positioning.generate","calibration.diagnose"] as const)("%s 独立冻结专属模型，不借用主聊天身份，密钥不落快照",async name=>{
 const f=await fixture(name);await f.service.pin(f.ref,f.parent.id,credential);
 expect(await f.service.read(f.ref,f.parent.id)).toMatchObject({capability:name,model:"child-model",customEndpoint:true});
 expect(await createExecutionModelIdentityService(db,{now}).read(f.ref)).toMatchObject({capability:"copilot.assist",model:"main-chat-model"});
 await expect(f.service.pinPrimary(f.ref,f.parent.id)).rejects.toThrow("不能借用聊天主模型");
 const [row]=await db.select().from(executionTasks).where(eq(executionTasks.id,f.task.id));
 expect(JSON.stringify(row!.payload)).not.toContain(credential.token);expect(JSON.stringify(row!.payload)).not.toContain(credential.baseUrl);
});
it("重建服务与同配置密钥轮换保持原身份",async()=>{
 const f=await fixture();await f.service.pin(f.ref,f.parent.id,credential);
 const restored=createExecutionChatModelIdentityService(db,{now,tools:f.tools}),before=await restored.read(f.ref,f.parent.id);
 expect(await restored.pin(f.ref,f.parent.id,{...credential,token:"rotated-secret"})).toMatchObject({token:"rotated-secret"});
 expect(await restored.read(f.ref,f.parent.id)).toEqual(before);
});
it.each([{model:"changed"},{baseUrl:"https://changed.invalid"},{structuredOutputs:true},{authStyle:"x-api-key"}])("原节点拒绝配置切换 %j",async change=>{
 const f=await fixture();await f.service.pin(f.ref,f.parent.id,credential);
 await expect(f.service.pin(f.ref,f.parent.id,{...credential,...change})).rejects.toThrow("原执行身份");
});
it("跨任务父调用及已取消租约不能取得凭据",async()=>{
 const a=await fixture(),b=await fixture();
 await expect(a.service.pin(a.ref,b.parent.id,credential)).rejects.toThrow();
 await a.tasks.command(ctx,{taskIds:[a.task.id],command:"cancel",idempotencyKey:"cancel-child"});
 await expect(a.service.pin(a.ref,a.parent.id,credential)).rejects.toThrow();
});
it("冻结声明不允许任意工具冒充结构化子节点",()=>{
 expect(chatWorkerInputSchema.safeParse({kind:"chat.run",operationKey:"x",capability:"copilot.assist",userId:"u",accountId:"a",conversationId:"c",sourceMessageId:"m",system:"",messages:[{role:"user",content:"x"}],maxSteps:2,maxOutputTokens:100,tools:[{name:"arbitrary.tool",version:"1",description:"",parameters:{},effect:"proposal",execution:"worker.structured-node"}]}).success).toBe(false);
});

it("原Pi任务遇到当前Codex凭据仍拒绝切换，原API身份可继续冻结",async()=>{
 const f=await fixture();await expect(f.service.pin(f.ref,f.parent.id,codexExecutionSpec())).rejects.toThrow();
 expect(await f.service.pin(f.ref,f.parent.id,credential)).toMatchObject({model:'child-model'});
 expect(await f.service.read(f.ref,f.parent.id)).not.toMatchObject({engine:'codex'});
});
