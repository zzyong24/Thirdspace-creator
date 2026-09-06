import { beforeAll, afterAll, it, expect, vi } from "vitest";
import { createDb, aiTasks, aiMessages, executionTasks, eq, type Db } from "@creatoros/backend";
import { createAiRepository } from "./ai.repository";
import { createChatTurnSubmissionService, type ChatTurnSnapshot, type ChatTurnAssembly } from "./chat-turn-submission.service";
let db:Db,close:()=>Promise<void>,seq=0;
const now=()=>new Date(1788600000000+(++seq)*1000).toISOString();
const nextId=(prefix:string)=>`${prefix}-chat-submit-${++seq}`;
beforeAll(async()=>{const f=await createDb();db=f.db;close=()=>f.client.close();});
afterAll(async()=>{await close();});
async function fixture(){
  const ctx={userId:"chat-submit-u",accountId:`chat-submit-a-${++seq}`,requestId:"test",source:"user" as const};
  const repo=createAiRepository(db,{userId:ctx.userId,accountId:ctx.accountId,now,nextId});
  const conversation=await repo.createConversation({title:"真实会话",projectId:null,scope:"global"});
  const message=async(role:"user"|"assistant",content:string)=>repo.createMessage(conversation.id,{role,content,attachments:[],modelMetadata:{existing:"保留"}});
  await message("user","历史问题");await message("assistant","历史回答");const source=await message("user","本轮问题");
  const request={conversationId:conversation.id,sourceMessageId:source.id};
  const assemble=vi.fn(async(_ctx:unknown,snapshot:ChatTurnSnapshot):Promise<ChatTurnAssembly>=>({capability:"copilot.assist",system:"真实策略",messages:snapshot.messages.map(message=>({role:message.role as "user"|"assistant",content:message.content})),maxSteps:6,maxOutputTokens:128,tools:[]}));
  const service=createChatTurnSubmissionService(db,{now,nextId,assemble});
  const rows=async()=>({tasks:await db.select().from(aiTasks).where(eq(aiTasks.accountId,ctx.accountId)),executions:await db.select().from(executionTasks).where(eq(executionTasks.accountId,ctx.accountId))});
  return {ctx,repo,conversation,source,request,assemble,service,message,rows};
}
it("同源消息并发提交只产生一个完整绑定，冻结真实历史且不吞后续消息",async()=>{
  const f=await fixture();await f.message("user","后续问题");
  const [a,b]=await Promise.all([f.service.submit(f.ctx,f.request),f.service.submit(f.ctx,f.request)]);
  expect(a.taskId).toBe(b.taskId);expect(a.executionTaskId).toBe(b.executionTaskId);expect([a.replayed,b.replayed].sort()).toEqual([false,true]);
  const state=await f.rows();expect(state.tasks).toHaveLength(1);expect(state.executions).toHaveLength(1);
  expect(state.tasks[0]).toMatchObject({executionTaskId:a.executionTaskId,taskType:"copilot.assist",status:"queued",inputData:{sourceMessageId:f.source.id}});
  expect(state.executions[0]).toMatchObject({ownerId:a.taskId,status:"queued",payload:{aiTaskId:a.taskId,modelInput:{kind:"chat.run",userId:f.ctx.userId,accountId:f.ctx.accountId,sourceMessageId:f.source.id,messages:[{role:"user",content:"历史问题"},{role:"assistant",content:"历史回答"},{role:"user",content:"本轮问题"}]}}});
  const [saved]=await db.select().from(aiMessages).where(eq(aiMessages.id,f.source.id));expect(saved!.modelMetadata).toEqual({existing:"保留",chatTaskId:a.taskId});
  const count=f.assemble.mock.calls.length;expect(await f.service.submit(f.ctx,f.request)).toMatchObject({...a,replayed:true});expect(f.assemble).toHaveBeenCalledTimes(count);
});
it("跨账号、别的会话消息和非用户源消息在装配前拒绝",async()=>{
  const f=await fixture(),other=await fixture();
  await expect(f.service.submit({...f.ctx,accountId:other.ctx.accountId},f.request)).rejects.toThrow();
  await expect(f.service.submit(f.ctx,{...f.request,sourceMessageId:other.source.id})).rejects.toThrow();
  const assistant=await f.message("assistant","不能作为源输入");
  await expect(f.service.submit(f.ctx,{...f.request,sourceMessageId:assistant.id})).rejects.toThrow();
  expect(f.assemble).not.toHaveBeenCalled();expect(await f.rows()).toEqual({tasks:[],executions:[]});
});
it("装配期间原始消息改变，拒绝提交旧上下文且不留下任务",async()=>{
  const f=await fixture();const service=createChatTurnSubmissionService(db,{now,nextId,assemble:async(ctx,snapshot)=>{
    const result=await f.assemble(ctx,snapshot);await db.update(aiMessages).set({content:"已经修改"}).where(eq(aiMessages.id,f.source.id));return result;
  }});
  await expect(service.submit(f.ctx,f.request)).rejects.toThrow("来源在装配期间改变");expect(await f.rows()).toEqual({tasks:[],executions:[]});
});
it.each(["assembly","execution"])("%s 阶段失败不留下半套任务，用户原消息仍在",async(phase)=>{
  const f=await fixture();const service=createChatTurnSubmissionService(db,{now,nextId:prefix=>{if(phase==="execution" && prefix==="execution-task")throw Error("injected execution failure");return nextId(prefix);},assemble:async(ctx,snapshot)=>{if(phase==="assembly")throw Error("injected assembly failure");return f.assemble(ctx,snapshot);}});
  await expect(service.submit(f.ctx,f.request)).rejects.toThrow("injected");expect(await f.rows()).toEqual({tasks:[],executions:[]});
  const [saved]=await db.select().from(aiMessages).where(eq(aiMessages.id,f.source.id));expect(saved).toMatchObject({content:"本轮问题",modelMetadata:{existing:"保留"}});
});
it("已有绑定被篡改或历史改变时不重新排队，不重跑装配",async()=>{
  const f=await fixture();await f.service.submit(f.ctx,f.request);const count=f.assemble.mock.calls.length;
  await db.update(aiMessages).set({content:"改写过的历史"}).where(eq(aiMessages.id,f.source.id));
  await expect(f.service.submit(f.ctx,f.request)).rejects.toThrow("来源已变化");
  expect(f.assemble).toHaveBeenCalledTimes(count);const rows=await f.rows();expect(rows.tasks).toHaveLength(1);expect(rows.executions).toHaveLength(1);
});
it("执行冻结输入被改写时拒绝复用，不以原任务ID掩盖另一套输入",async()=>{
  const f=await fixture(),submitted=await f.service.submit(f.ctx,f.request);
  const rows=await f.rows(),payload=rows.executions[0]!.payload as {modelInput:Record<string,unknown>};
  await db.update(executionTasks).set({payload:{...payload,modelInput:{...payload.modelInput,system:"改变后的策略"}}}).where(eq(executionTasks.id,submitted.executionTaskId));
  await expect(f.service.submit(f.ctx,f.request)).rejects.toThrow("执行映射无效");expect(f.assemble).toHaveBeenCalledTimes(1);
});
it("项目会话必须先通过归属端口，不把缺失或拒绝当成可执行",async()=>{
  const f=await fixture();
  const {aiConversations}=await import("@creatoros/backend");
  await db.update(aiConversations).set({projectId:"project-reference"}).where(eq(aiConversations.id,f.conversation.id));
  await expect(f.service.submit(f.ctx,f.request)).rejects.toThrow("项目归属验证端口未装配");
  const assertProject=vi.fn(async()=>{throw Error("project unavailable");});
  await expect(createChatTurnSubmissionService(db,{now,nextId,assemble:f.assemble,assertProject}).submit(f.ctx,f.request)).rejects.toThrow("project unavailable");
  expect(assertProject).toHaveBeenCalledWith(f.ctx,"project-reference");expect(f.assemble).not.toHaveBeenCalled();expect(await f.rows()).toEqual({tasks:[],executions:[]});
});
it("已有旧公开入口回复绑定的源消息不能再创建第二份聊天任务",async()=>{
  const f=await fixture();
  await db.update(aiMessages).set({modelMetadata:{replyTaskId:"existing-legacy-task"}}).where(eq(aiMessages.id,f.source.id));
  await expect(f.service.submit(f.ctx,f.request)).rejects.toThrow("已有旧回复任务");
  expect(f.assemble).not.toHaveBeenCalled();expect(await f.rows()).toEqual({tasks:[],executions:[]});
});
