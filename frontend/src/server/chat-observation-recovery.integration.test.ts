// @vitest-environment node
import {it,expect,vi} from "vitest";
import {createDb,aiTasks,executionTasks,eq} from "@creatoros/backend";
import {createAiRepository} from "../../../backend/src/modules/ai/ai.repository";
import {createChatTurnSubmissionService,readChatTurnSnapshot} from "../../../backend/src/modules/ai/chat-turn-submission.service";
import {createPersistentTaskService} from "../../../backend/src/modules/execution/persistent-task.service";
import {createChatTaskControl} from "../features/copilot/chat-task-control";
import {createAiService,type ServiceDeps} from "../../../backend/src/modules/ai/ai.service";
import {createExecutionStreamService,subscribeExecutionStream} from "../../../backend/src/modules/execution/execution-stream.service";
import {recoverChatExecution} from "./chat-execution-recovery";
import type {ChatRuntime} from "./persistence-client";

it("T-1407 真实库已取消原轮只读回abort，旧恢复与陌生账号均不重建任务或删历史",async()=>{
 const f=await createDb(),db=f.db;let seq=0;
 const ctx={userId:"recovery-user",accountId:"recovery-account",source:"user" as const,requestId:"recovery"};
 const now=()=>new Date().toISOString(),nextId=(prefix:string)=>`${prefix}-recovery-${++seq}`;
 const repo=createAiRepository(db,{...ctx,now,nextId});
 try{
  const conversation=await repo.createConversation({title:"原定位",projectId:null,scope:"global"});
  const source=await repo.createMessage(conversation.id,{role:"user",content:"原定位内容保留",attachments:[],modelMetadata:{}});
  const submit=createChatTurnSubmissionService(db,{now,nextId,assemble:async()=>({capability:"copilot.assist",system:"隔离测试",messages:[{role:"user",content:source.content}],tools:[],maxSteps:2,maxOutputTokens:128})});
  const receipt=await submit.submit(ctx,{conversationId:conversation.id,sourceMessageId:source.id});
  const tasks=createPersistentTaskService(db,{now,nextId}),events=createExecutionStreamService(db,{now});
  await tasks.command(ctx,{taskIds:[receipt.executionTaskId],command:"cancel",idempotencyKey:"test-cancel"});
  // Only read methods are used; unrelated adoption/write ports must never be invoked.
  const ai=createAiService({db,now,nextId} as ServiceDeps);
  const forbidden=vi.fn(async()=>{throw new Error("恢复不得新建任务");});
  const runtime={ai,durable:{get:tasks.get,subscribe:(c:typeof ctx,id:string,signal:AbortSignal)=>subscribeExecutionStream(events,c,id,{signal}),submit:forbidden,command:forbidden}} as unknown as ChatRuntime;
  const original={executionTaskId:receipt.executionTaskId,conversationId:conversation.id,sourceMessageId:source.id,intent:"observe"};
  const before={tasks:await db.select().from(aiTasks),executions:await db.select().from(executionTasks),messages:await ai.listMessages(ctx,conversation.id)};
  const response=await recoverChatExecution(runtime,ctx,original,new AbortController().signal);
  expect(response.status).toBe(200);expect(await response.text()).toContain('"type":"abort"');
  expect((await recoverChatExecution(runtime,ctx,{...original,intent:"resume"},new AbortController().signal)).status).toBe(409);
  expect((await recoverChatExecution(runtime,{...ctx,accountId:"other-account"},original,new AbortController().signal)).status).toBe(409);
  expect(forbidden).not.toHaveBeenCalled();
  expect({tasks:await db.select().from(aiTasks),executions:await db.select().from(executionTasks),messages:await ai.listMessages(ctx,conversation.id)}).toEqual(before);
 }finally{await f.client.close();}
},180000);

it("真实持久提交先于响应头：停止观察后原对话/任务中心仍查得同一任务，原消息重放不重复创建",async()=>{
 const f=await createDb();const db=f.db;let seq=0;
 const ctx={userId:"observation-user",accountId:"observation-account",source:"user" as const,requestId:"observation"};
 const now=()=>new Date().toISOString(),nextId=(prefix:string)=>`${prefix}-observation-${++seq}`;
 const repo=createAiRepository(db,{userId:ctx.userId,accountId:ctx.accountId,now,nextId});
 const conversation=await repo.createConversation({title:"停止后原对话",projectId:null,scope:"global"});
 const source=await repo.createMessage(conversation.id,{role:"user",content:"原真实请求",attachments:[],modelMetadata:{}});
 const service=createChatTurnSubmissionService(db,{now,nextId,assemble:async()=>({capability:"copilot.assist",system:"隔离测试",messages:[{role:"user",content:source.content}],tools:[],maxSteps:2,maxOutputTokens:128})});
 let reached!:()=>void,release!:(response:Response)=>void;const committed=new Promise<void>(resolve=>{reached=resolve});
 let submitted:Awaited<ReturnType<typeof service.submit>>|undefined;
 const originalFetch=globalThis.fetch;
 vi.stubGlobal("fetch",vi.fn(async()=>{submitted=await service.submit(ctx,{conversationId:conversation.id,sourceMessageId:source.id});reached();return new Promise<Response>(resolve=>{release=resolve});}));
 try{
  const control=createChatTaskControl(),request=control.fetch("/api/chat",{body:JSON.stringify({trigger:"submit-message"})}).catch(error=>error);await Promise.race([committed,request.then(value=>{throw value})]);
  expect(await control.cancel()).toBe(true);expect(control.stopOutcome).toBe("waiting_stopped");
  const feed=await createPersistentTaskService(db,{now,nextId}).list(ctx);expect(feed.total).toBe(1);expect(feed.rows[0]?.id).toBe(submitted!.executionTaskId);
  const {conversation:original}=await readChatTurnSnapshot(db,ctx,{conversationId:conversation.id,sourceMessageId:source.id});expect(original?.id).toBe(conversation.id);
  const tasks=await db.select().from(aiTasks).where(eq(aiTasks.accountId,ctx.accountId));const executions=await db.select().from(executionTasks).where(eq(executionTasks.accountId,ctx.accountId));
  expect(tasks).toHaveLength(1);expect(executions).toHaveLength(1);expect(executions[0]).toMatchObject({id:submitted!.executionTaskId,status:"queued",ownerId:submitted!.taskId});
  expect(tasks[0]!.inputData).toMatchObject({conversationId:conversation.id,sourceMessageId:source.id});
  expect(await service.submit(ctx,{conversationId:conversation.id,sourceMessageId:source.id})).toMatchObject({...submitted,replayed:true});
  release(new Response("late",{headers:{"x-execution-task-id":submitted!.executionTaskId}}));expect(await request).toMatchObject({name:"AbortError"});expect(control.currentTaskId()).toBeNull();
  expect(await db.select().from(executionTasks).where(eq(executionTasks.accountId,ctx.accountId))).toHaveLength(1);
 }finally{globalThis.fetch=originalFetch;await f.client.close();}
},180000);
