// @vitest-environment node
import {it,expect,vi} from "vitest";
import {createDb,aiTasks,executionTasks,eq} from "@creatoros/backend";
import {createAiRepository} from "../../../backend/src/modules/ai/ai.repository";
import {createChatTurnSubmissionService,readChatTurnSnapshot} from "../../../backend/src/modules/ai/chat-turn-submission.service";
import {createPersistentTaskService} from "../../../backend/src/modules/execution/persistent-task.service";
import {createChatTaskControl} from "../features/copilot/chat-task-control";

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
