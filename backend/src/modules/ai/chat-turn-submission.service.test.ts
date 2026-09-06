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

function hostContext(ctx:{userId:string;accountId:string}) {
  return {schemaVersion:1 as const,chatContext:{surface:"topics"},mediaRoute:null,positioningScratch:false,trustedScriptSources:[],skillSnapshot:{snapshotVersion:1 as const,userId:ctx.userId,accountId:ctx.accountId,resolvedAt:"fixed",platformPolicyVersion:"1",platformPolicy:"候选",skills:[{skillId:"chatbox.topic",baseVersion:"1",overlayRevision:null,overlayVersion:null,effective:{methodSystem:"固定策略",template:"模板",tools:["context.projects"],requiredFacets:[],contextRequirements:[],outputSchema:null,completionPolicy:null,completionPolicyAdapter:null}}]}};
}
it("宿主上下文与执行原子保存，重放不换Skill或选区",async()=>{
  const f=await fixture(),frozen=hostContext(f.ctx);
  const service=createChatTurnSubmissionService(db,{now,nextId,assemble:async(ctx,snapshot)=>({...await f.assemble(ctx,snapshot),hostContext:frozen})});
  const result=await service.submit(f.ctx,f.request),rows=await f.rows();
  expect(rows.executions[0]!.payload).toMatchObject({hostContext:frozen});
  expect((rows.executions[0]!.payload as Record<string,unknown>).modelInput).not.toHaveProperty("hostContext");
  expect(rows.tasks[0]!.inputData).toHaveProperty("hostContextDigest");
  frozen.chatContext.surface="project";
  expect(await service.submit(f.ctx,f.request)).toMatchObject({...result,replayed:true});
  expect((await f.rows()).executions[0]!.payload).toMatchObject({hostContext:{chatContext:{surface:"topics"}}});
});
it("拒绝其它账号Skill快照，失败不落半套任务",async()=>{
  const f=await fixture(),frozen=hostContext({...f.ctx,accountId:"other"});
  const service=createChatTurnSubmissionService(db,{now,nextId,assemble:async(ctx,snapshot)=>({...await f.assemble(ctx,snapshot),hostContext:frozen})});
  await expect(service.submit(f.ctx,f.request)).rejects.toThrow();
  expect(await f.rows()).toEqual({tasks:[],executions:[]});
});
it("宿主快照被改写后，原源消息不能复用另一套上下文",async()=>{
  const f=await fixture();
  const service=createChatTurnSubmissionService(db,{now,nextId,assemble:async(ctx,snapshot)=>({...await f.assemble(ctx,snapshot),hostContext:hostContext(f.ctx)})});
  const result=await service.submit(f.ctx,f.request),rows=await f.rows();
  await db.update(executionTasks).set({payload:{...rows.executions[0]!.payload as object,hostContext:{...hostContext(f.ctx),chatContext:{surface:"project"}}}}).where(eq(executionTasks.id,result.executionTaskId));
  await expect(service.submit(f.ctx,f.request)).rejects.toThrow("宿主上下文");
});
it("宿主读取只接受当前租约和原历史，旧任务缺快照不按当前配置重建",async()=>{
  const {createChatHostContextReader}=await import("./chat-host-context.service");
  const {createPersistentTaskService}=await import("../execution/persistent-task.service");
  const f=await fixture(),service=createChatTurnSubmissionService(db,{now,nextId,assemble:async(ctx,snapshot)=>({...await f.assemble(ctx,snapshot),hostContext:hostContext(f.ctx)})});
  const submitted=await service.submit(f.ctx,f.request);
  const taskService=createPersistentTaskService(db,{now,nextId}),claim=(await taskService.claimTask({taskId:submitted.executionTaskId,workerId:"worker"}))!;
  const ref={executionTaskId:submitted.executionTaskId,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
  const reader=createChatHostContextReader(db,{now});
  const restored=await reader.read(ref);
  expect(restored.hostContext).toEqual(hostContext(f.ctx));
  expect(restored.snapshot.sourceMessage.content).toBe("本轮问题");
  await f.message("user","后来追加的指令");
  expect((await reader.read(ref)).snapshot.messages.at(-1)!.content).toBe("本轮问题");
  await expect(reader.read({...ref,fenceToken:"old"})).rejects.toThrow();
  await db.update(aiTasks).set({status:"failed"}).where(eq(aiTasks.id,submitted.taskId));
  await expect(reader.read(ref)).rejects.toThrow();
  await db.update(aiTasks).set({status:"queued"}).where(eq(aiTasks.id,submitted.taskId));
  await db.update(aiMessages).set({content:"被改过的源消息"}).where(eq(aiMessages.id,f.source.id));
  await expect(reader.read(ref)).rejects.toThrow();
  const legacy=await fixture(),old=await legacy.service.submit(legacy.ctx,legacy.request),oldClaim=(await taskService.claimTask({taskId:old.executionTaskId,workerId:"worker"}))!;
  await expect(reader.read({executionTaskId:old.executionTaskId,attempt:oldClaim.lease.attempt,fenceToken:oldClaim.lease.fenceToken})).rejects.toThrow("缺少宿主上下文");
});
it.each(["snapshot","digest"])("宿主%s单边丢失不能降级为旧任务",async field=>{
  const f=await fixture(),service=createChatTurnSubmissionService(db,{now,nextId,assemble:async(ctx,snapshot)=>({...await f.assemble(ctx,snapshot),hostContext:hostContext(f.ctx)})});
  const result=await service.submit(f.ctx,f.request),rows=await f.rows();
  if(field==="snapshot") {
    const {hostContext:_,...payload}=rows.executions[0]!.payload as Record<string,unknown>;
    await db.update(executionTasks).set({payload}).where(eq(executionTasks.id,result.executionTaskId));
  } else {
    const {hostContextDigest:_,...inputData}=rows.tasks[0]!.inputData as Record<string,unknown>;
    await db.update(aiTasks).set({inputData}).where(eq(aiTasks.id,result.taskId));
  }
  await expect(service.submit(f.ctx,f.request)).rejects.toThrow("宿主上下文绑定缺失");
});
it.each(["project","skill","refs","size"])("宿主快照拒绝%s错配或越界",async kind=>{
  const f=await fixture(),frozen=hostContext(f.ctx);
  const raw={...frozen,chatContext:kind==="project"?{...frozen.chatContext,projectId:"foreign"}:frozen.chatContext,
    trustedScriptSources:kind==="refs"?[{ref:"same",label:"",text:"1",truncated:false},{ref:"same",label:"",text:"2",truncated:false}]:kind==="size"?[{ref:"large",label:"",text:"文".repeat(4_000_001),truncated:false}]:[],
    skillSnapshot:kind==="skill"?{...frozen.skillSnapshot,skills:frozen.skillSnapshot.skills.map(skill=>({...skill,skillId:"unrelated"}))}:frozen.skillSnapshot};
  const service=createChatTurnSubmissionService(db,{now,nextId,assemble:async(ctx,snapshot)=>({...await f.assemble(ctx,snapshot),hostContext:raw})});
  await expect(service.submit(f.ctx,f.request)).rejects.toThrow();
  expect(await f.rows()).toEqual({tasks:[],executions:[]});
});
