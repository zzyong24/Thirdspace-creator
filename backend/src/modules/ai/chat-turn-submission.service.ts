import {requireWorkspace,workspaceFilter,assertWritableWorkspace} from "../../workspace-scope";
import {lockWorkspaceMembership} from "../platform-account/membership-lock.service";
import { createContinuousExecutionBudget } from "@creatoros/contract/execution-worker";
import {validateChatHostContext,readChatHostContextPair,chatHostContextDigest,type ChatHostContext} from "./chat-host-context";
import { createHash, randomUUID } from "node:crypto";
import { canonicalJson } from "./canonical-json";
import { z } from "zod";
import { and, asc, eq, aiConversations, aiMessages, aiTasks, executionTasks, requireAccountId, OwnershipError, type Db } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import { chatWorkerInputSchema,codexAcpBinding } from "@creatoros/contract/execution-worker";
import { createPersistentTaskService } from "../execution/persistent-task.service";
import { ConflictError } from "../execution/execution.errors";
type ChatInput=z.infer<typeof chatWorkerInputSchema>;
type Message=typeof aiMessages.$inferSelect;
export type ChatTurnSnapshot={conversation:typeof aiConversations.$inferSelect;messages:Message[];sourceMessage:Message};
export type ChatTurnAssembly=Omit<ChatInput,"kind"|"operationKey"|"userId"|"accountId"|"groupId"|"groupVersion"|"membershipVersion"|"conversationId"|"sourceMessageId"|"externalAgentBinding"> & {hostContext?:ChatHostContext};
const object=(value:unknown):Record<string,unknown>=>value && typeof value==="object" && !Array.isArray(value)?value as Record<string,unknown>:{};
export const chatInputDigest=(value:unknown)=>createHash("sha256").update(canonicalJson(value)).digest("hex");
export const chatHistoryDigest=(snapshot:ChatTurnSnapshot)=>chatInputDigest({
  conversationId:snapshot.conversation.id,projectId:snapshot.conversation.projectId,scope:snapshot.conversation.scope,
  messages:snapshot.messages.map(row=>({id:row.id,role:row.role,content:row.content,parts:row.parts,attachments:row.attachments})),
});

export async function readChatTurnSnapshot(store:Db,ctx:RequestContext,request:{conversationId:string;sourceMessageId:string},lock=false):Promise<ChatTurnSnapshot>{
    requireWorkspace(ctx);
    const query=store.select().from(aiConversations).where(and(eq(aiConversations.id,request.conversationId),eq(aiConversations.userId,ctx.userId),workspaceFilter(aiConversations,ctx)));
    const [conversation]=await (lock?query.for("update"):query);
    if(!conversation)throw new OwnershipError("会话不存在或不可访问");
    const history=await store.select().from(aiMessages).where(eq(aiMessages.conversationId,conversation.id)).orderBy(asc(aiMessages.createdAt));
    const index=history.findIndex(message=>message.id===request.sourceMessageId);
    if(index<0 || history[index]!.role!=="user")throw new ConflictError("源消息不是当前会话的用户消息");
    return {conversation,messages:history.slice(0,index+1),sourceMessage:history[index]!};
  }

/** 源消息已经保存；装配只读真实历史，提交时原子绑定唯一业务任务与执行任务。 */
export function createChatTurnSubmissionService(db:Db,deps:{
  now?:()=>string;nextId?:(prefix:string)=>string;
  assemble(ctx:RequestContext,snapshot:ChatTurnSnapshot):Promise<ChatTurnAssembly>;
  assertProject?(ctx:RequestContext,projectId:string):Promise<unknown>;
}){
  const now=deps.now??(()=>new Date().toISOString()),nextId=deps.nextId??(prefix=>`${prefix}-${randomUUID()}`);
  async function existing(store:Db,ctx:RequestContext,snapshot:ChatTurnSnapshot){
    const id=object(snapshot.sourceMessage.modelMetadata).chatTaskId;
    if(id===undefined){
      if(object(snapshot.sourceMessage.modelMetadata).replyTaskId!==undefined)throw new ConflictError("源消息已有旧回复任务，不能重复创建聊天执行");
      return null;
    }
    if(typeof id!=="string" || !id)throw new ConflictError("源消息执行绑定无效");
    const [task]=await store.select().from(aiTasks).where(and(eq(aiTasks.id,id),eq(aiTasks.userId,ctx.userId),workspaceFilter(aiTasks,ctx)));
    const input=object(task?.inputData);
    if(!task || task.taskType!=="copilot.assist" || task.projectId!==snapshot.conversation.projectId || !task.executionTaskId || input.kind!=="chat.run" || input.conversationId!==snapshot.conversation.id || input.sourceMessageId!==snapshot.sourceMessage.id || input.historyDigest!==chatHistoryDigest(snapshot) || JSON.stringify(input.historyMessageIds)!==JSON.stringify(snapshot.messages.map(message=>message.id)))throw new ConflictError("聊天任务来源已变化或映射无效");
    const [execution]=await store.select().from(executionTasks).where(and(eq(executionTasks.id,task.executionTaskId),eq(executionTasks.userId,ctx.userId),workspaceFilter(executionTasks,ctx)));
    const frozen=chatWorkerInputSchema.safeParse(object(execution?.payload).modelInput);
    if(!execution || execution.kind!=="ai_task" || input.modelInputDigest!==chatInputDigest(object(execution.payload).modelInput) || execution.ownerType!=="ai_task" || execution.ownerId!==id || object(execution.payload).aiTaskId!==id || !frozen.success || frozen.data.sourceMessageId!==snapshot.sourceMessage.id || frozen.data.conversationId!==snapshot.conversation.id || frozen.data.userId!==ctx.userId || frozen.data.accountId!==(ctx.accountId??null) || (frozen.data.groupId??null)!==task.groupId)throw new ConflictError("聊天执行映射无效");
    readChatHostContextPair(object(execution.payload).hostContext,input.hostContextDigest,{userId:task.userId,accountId:task.accountId,groupId:task.groupId,projectId:snapshot.conversation.projectId});
    return {taskId:task.id,executionTaskId:execution.id,sourceMessageId:snapshot.sourceMessage.id,replayed:true};
  }
  return {
    async submit(ctx:RequestContext,request:{conversationId:string;sourceMessageId:string;executionEngine?:"pi"|"codex"}){
      await assertWritableWorkspace(db,ctx);
      const snapshot=await readChatTurnSnapshot(db,ctx,request);
      const requestedEngine=request.executionEngine===undefined?undefined:z.enum(["pi","codex"]).parse(request.executionEngine);
      const replay=await existing(db,ctx,snapshot);
      if(replay){
        if(requestedEngine!==undefined){
          const [execution]=await db.select().from(executionTasks).where(eq(executionTasks.id,replay.executionTaskId));
          if(object(object(execution?.payload).modelInput).executionEngine!==requestedEngine)throw new ConflictError("源消息已绑定另一引擎，请另起新消息");
        }
        return replay;
      }
      if(snapshot.conversation.projectId){
        if(!deps.assertProject)throw new ConflictError("项目归属验证端口未装配");
        await deps.assertProject(ctx,snapshot.conversation.projectId);
      }
      const historyDigest=chatHistoryDigest(snapshot);
      const {hostContext:rawHostContext,...assembly}=await deps.assemble(ctx,structuredClone(snapshot));
      // 先通过严格 schema，再统一成数据库 JSON 形态；可选 undefined 不得进入摘要后在落库时消失。
      const hostContext=rawHostContext===undefined?undefined:JSON.parse(JSON.stringify(validateChatHostContext(rawHostContext,{userId:ctx.userId,accountId:ctx.accountId??null,groupId:ctx.groupId,projectId:snapshot.conversation.projectId}))) as ChatHostContext;
      const modelInput=JSON.parse(JSON.stringify(chatWorkerInputSchema.parse({...assembly,executionEngine:requestedEngine??"pi",...(requestedEngine==="codex"?{externalAgentBinding:codexAcpBinding}:{}),recoverMissingFinal:true,...(assembly.tools.some(tool=>tool.name==="history.read")?{contextPolicyVersion:2}:{}),kind:"chat.run",operationKey:`chat:${snapshot.sourceMessage.id}`,userId:ctx.userId,accountId:ctx.accountId??null,groupId:ctx.groupId??null,groupVersion:ctx.groupVersion??null,membershipVersion:ctx.membershipVersion??null,conversationId:snapshot.conversation.id,sourceMessageId:snapshot.sourceMessage.id}))) as ChatInput;
      return db.transaction(async tx=>{
        const frozenScope=await lockWorkspaceMembership(tx,ctx);
        if(hostContext&&frozenScope.groupId){hostContext.skillSnapshot.groupId=frozenScope.groupId;hostContext.skillSnapshot.groupVersion=frozenScope.groupVersion;hostContext.skillSnapshot.membershipVersion=frozenScope.membershipVersion;}
        modelInput.groupId=frozenScope.groupId;modelInput.groupVersion=frozenScope.groupVersion;modelInput.membershipVersion=frozenScope.membershipVersion;
        const store=tx as unknown as Db;
        const current=await readChatTurnSnapshot(store,ctx,request,true);
        const winner=await existing(store,ctx,current);
        if(winner){
          const [execution]=await tx.select().from(executionTasks).where(eq(executionTasks.id,winner.executionTaskId));
          if(object(object(execution?.payload).modelInput).executionEngine!==modelInput.executionEngine)throw new ConflictError("源消息已绑定另一引擎，请另起新消息");
          return winner;
        }
        if(chatHistoryDigest(current)!==historyDigest)throw new ConflictError("聊天来源在装配期间改变，请重新提交");
        const taskId=nextId("ai-task"),stamp=now();
        await tx.insert(aiTasks).values({id:taskId,userId:ctx.userId,accountId:frozenScope.accountId,groupId:frozenScope.groupId,groupVersion:frozenScope.groupVersion,membershipVersion:frozenScope.membershipVersion,projectId:current.conversation.projectId,taskType:"copilot.assist",status:"queued",requestedAt:stamp,idempotencyKey:`chat:${current.sourceMessage.id}`,inputData:{kind:"chat.run",conversationId:current.conversation.id,sourceMessageId:current.sourceMessage.id,historyMessageIds:current.messages.map(message=>message.id),historyDigest,modelInputDigest:chatInputDigest(modelInput),...(hostContext?{hostContextDigest:chatHostContextDigest(hostContext)}:{})}});
        const execution=await createPersistentTaskService(store,{now,nextId}).enqueue(ctx,{kind:"ai_task",ownerType:"ai_task",ownerId:taskId,idempotencyKey:`chat:${current.sourceMessage.id}`,executionBudget:createContinuousExecutionBudget(),payload:{aiTaskId:taskId,modelInput,...(hostContext?{hostContext}:{})}});
        if(execution.ownerId!==taskId)throw new ConflictError("源消息已有不同的执行绑定");
        await tx.update(aiTasks).set({executionTaskId:execution.id}).where(eq(aiTasks.id,taskId));
        await tx.update(aiMessages).set({modelMetadata:{...object(current.sourceMessage.modelMetadata),chatTaskId:taskId}}).where(eq(aiMessages.id,current.sourceMessage.id));
        return {taskId,executionTaskId:execution.id,sourceMessageId:current.sourceMessage.id,replayed:false};
      });
    },
  };
}
