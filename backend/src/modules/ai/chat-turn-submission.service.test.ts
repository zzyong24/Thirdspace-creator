import { createChatHostContextReader } from "./chat-host-context.service";
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

it("真实租约恢复只读工具，使用冻结产品说明及当前账号数据，拒绝旧租约和工具版本变化",async()=>{
 const {createChatReadToolResolver}=await import("../ai-runtime/chat-read-tool-resolver");
 const {buildChatTools}=await import("../ai-runtime/chat-tools");
 const {prepareChatToolDefinitions}=await import("../ai-runtime/chat-tool-definitions");
 const {getChatToolNativeExecutor}=await import("../ai-runtime/chat-tool-gate");
 const {createChatHostContextReader}=await import("./chat-host-context.service");
 const {createPersistentTaskService}=await import("../execution/persistent-task.service");
 const f=await fixture(),frozen=hostContext(f.ctx);
 frozen.skillSnapshot.skills.push({skillId:"creatoros.guide",baseVersion:"v1",overlayRevision:null,overlayVersion:null,effective:{methodSystem:"提交时产品说明",template:"模板",tools:[],requiredFacets:[],contextRequirements:[],outputSchema:null,completionPolicy:null,completionPolicyAdapter:null}});
 const prototypes=buildChatTools(["creatoros.guide","context.projects"],{} as Parameters<typeof buildChatTools>[1]);
 const definitions=(await prepareChatToolDefinitions(prototypes)).definitions;
 const service=createChatTurnSubmissionService(db,{now,nextId,assemble:async(ctx,snapshot)=>({...await f.assemble(ctx,snapshot),tools:definitions,hostContext:frozen})});
 const submitted=await service.submit(f.ctx,f.request),tasks=createPersistentTaskService(db,{now,nextId});
 const claim=(await tasks.claimTask({taskId:submitted.executionTaskId,workerId:"worker"}))!;
 const ref={executionTaskId:submitted.executionTaskId,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
 const listProjects=vi.fn(async(ctx:typeof f.ctx)=>({rows:[{id:"current",title:ctx.accountId,stage:"planning",status:"active"}],total:1}));
 const resolve=createChatReadToolResolver(createChatHostContextReader(db,{now}),{listProjects} as never);
 frozen.skillSnapshot.skills[1]!.effective.methodSystem="后来的配置";
 const tools=await resolve(f.ctx,ref);
 expect(Object.keys(tools)).toEqual(["creatoros.guide","context.projects"]);
 expect(listProjects).not.toHaveBeenCalled();
 const guide=await getChatToolNativeExecutor(tools["creatoros.guide"]!)!({},{});
 expect(JSON.stringify(guide)).toContain("提交时产品说明");expect(JSON.stringify(guide)).not.toContain("后来的配置");
 await getChatToolNativeExecutor(tools["context.projects"]!)!({},{});
 expect(listProjects).toHaveBeenLastCalledWith(expect.objectContaining({accountId:f.ctx.accountId}),expect.anything());
 await expect(resolve({...f.ctx,accountId:"other"},ref)).rejects.toThrow();
 await expect(resolve(f.ctx,{...ref,fenceToken:"old"})).rejects.toThrow();
 await expect(resolve(f.ctx,ref,AbortSignal.abort())).rejects.toThrow();
 const reader=createChatHostContextReader(db,{now}),original=await reader.read(ref);
 const changed=structuredClone(original);changed.modelInput.tools[0]!.version="changed";
 await expect(createChatReadToolResolver({read:async()=>changed},{listProjects} as never)(f.ctx,ref)).rejects.toThrow("定义");
 const schemaChanged=structuredClone(original);schemaChanged.modelInput.tools[0]!.parameters={type:"object",properties:{untrusted:{type:"string"}}};
 await expect(createChatReadToolResolver({read:async()=>schemaChanged},{listProjects} as never)(f.ctx,ref)).rejects.toThrow("定义");
 const variant=structuredClone(original);variant.hostContext.chatContext.projectId="bound-project";variant.hostContext.mediaRoute={kind:"cover.publication_reference"};
 variant.modelInput.tools=(await prepareChatToolDefinitions(buildChatTools(["context.projects.search","context.project.detail","context.publications"],{boundProjectId:"bound-project",publicationView:"published_cover_candidates"} as Parameters<typeof buildChatTools>[1]))).definitions;
 const searchProjects=vi.fn(async()=>({rows:[],total:0})),getProjectDetail=vi.fn(async()=>null),listPublications=vi.fn(async()=>({rows:[],total:0}));
 const scopedTools=await createChatReadToolResolver({read:async()=>variant},{searchProjects,getProjectDetail,listPublications} as never)(f.ctx,ref);
 variant.context.accountId="mutated";variant.hostContext.chatContext.projectId="mutated";
 expect(searchProjects).not.toHaveBeenCalled();expect(getProjectDetail).not.toHaveBeenCalled();expect(listPublications).not.toHaveBeenCalled();
 await getChatToolNativeExecutor(scopedTools["context.projects.search"]!)!({},{});
 expect(searchProjects).toHaveBeenLastCalledWith(expect.objectContaining({accountId:f.ctx.accountId}),expect.objectContaining({excludeProjectId:"bound-project"}));
 await getChatToolNativeExecutor(scopedTools["context.project.detail"]!)!({projectId:"model-project"},{});
 expect(getProjectDetail).toHaveBeenLastCalledWith(expect.objectContaining({accountId:f.ctx.accountId}),{projectId:"bound-project"});
 await getChatToolNativeExecutor(scopedTools["context.publications"]!)!({},{});
 expect(listPublications).toHaveBeenLastCalledWith(expect.objectContaining({accountId:f.ctx.accountId}),expect.objectContaining({view:"published_cover_candidates"}));

});

it("开场生成快照随真实任务持久化并受原摘要保护",async()=>{
 const {createPersistentTaskService}=await import("../execution/persistent-task.service");
 const f=await fixture();
 const original={selectionTitle:"原选题",positioningBrief:"原定位",projectBriefHard:"原约束",userMaterialHardBrief:"原事实",userMaterialRefBrief:"原参考",knowledgeBrief:"原知识"};
 const frozen={...hostContext(f.ctx),scriptHooksContext:original};
 const service=createChatTurnSubmissionService(db,{now,nextId,assemble:async(ctx,snapshot)=>({...await f.assemble(ctx,snapshot),hostContext:frozen})});
 const result=await service.submit(f.ctx,f.request);
 original.positioningBrief="后来修改";
 const taskService=createPersistentTaskService(db,{now,nextId}),claim=(await taskService.claimTask({taskId:result.executionTaskId,workerId:"worker"}))!;
 const ref={executionTaskId:result.executionTaskId,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
 const reader=createChatHostContextReader(db,{now});
 expect((await reader.read(ref)).hostContext.scriptHooksContext?.positioningBrief).toBe("原定位");
 const rows=await f.rows();const payload=rows.executions[0]!.payload as Record<string,unknown>;
 await db.update(executionTasks).set({payload:{...payload,hostContext:{...frozen,scriptHooksContext:{...original,positioningBrief:"被篡改"}}}}).where(eq(executionTasks.id,result.executionTaskId));
 await expect(reader.read(ref)).rejects.toThrow("摘要不符");
});

it("装配显式返回可选 undefined 时，落库摘要仍可被租约读取及重复提交核对",async()=>{
 const f=await fixture();
 const service=createChatTurnSubmissionService(db,{now,nextId,assemble:async(ctx,snapshot)=>({...await f.assemble(ctx,snapshot),forcedTool:undefined,forcedToolSequence:undefined})});
 const submitted=await service.submit(f.ctx,f.request);
 expect(await service.submit(f.ctx,f.request)).toMatchObject({...submitted,replayed:true});
 const {createPersistentTaskService}=await import("../execution/persistent-task.service");
 const {readExecutionChatTask}=await import("../execution/execution-chat-tool-ports.service");
 const claim=(await createPersistentTaskService(db,{now}).claimTask({taskId:submitted.executionTaskId,workerId:"undefined-test"}))!;
 const ref={executionTaskId:submitted.executionTaskId,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
 expect((await readExecutionChatTask(db,ref,now)).input).not.toHaveProperty("forcedTool");
});

it("宿主上下文可选 undefined 也按数据库 JSON 形态保存摘要",async()=>{
 const f=await fixture();
 const frozen={...hostContext(f.ctx),chatContext:{surface:"topics",projectId:undefined,selection:{kind:"candidate",ids:[],label:undefined}}};
 const service=createChatTurnSubmissionService(db,{now,nextId,assemble:async(ctx,snapshot)=>({...await f.assemble(ctx,snapshot),hostContext:frozen})});
 const submitted=await service.submit(f.ctx,f.request);
 expect(await service.submit(f.ctx,f.request)).toMatchObject({...submitted,replayed:true});
});

it("新Codex任务冻结ACP工件，重放不切版本或协议",async()=>{
 const f=await fixture();await f.service.submit(f.ctx,{...f.request,executionEngine:"codex"});
 const rows=await f.rows();expect(rows.executions[0]!.payload).toMatchObject({modelInput:{externalAgentBinding:{protocolKind:"acp",adapterVersion:"2.1.1",runtimeVersion:"0.159.3",policy:"creatoros-acp-readonly-v2"}}});
 await expect(f.service.submit(f.ctx,{...f.request,executionEngine:"pi"})).rejects.toThrow("引擎");
});
