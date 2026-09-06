import { and,eq,aiTasks,type Db } from "@creatoros/backend";
import { chatWorkerInputSchema,type ExecutionRef } from "@creatoros/contract/execution-worker";
import { createExecutionLeaseService } from "../execution/execution-lease.service";
import { ConflictError } from "../execution/execution.errors";
import { readChatTurnSnapshot,chatHistoryDigest,chatInputDigest } from "./chat-turn-submission.service";
import { readChatHostContextPair } from "./chat-host-context";
const object=(value:unknown):Record<string,unknown>=>value && typeof value==="object" && !Array.isArray(value)?value as Record<string,unknown>:{};
/** 只由后端在当前租约下恢复工具上下文；不把宿主快照作为Worker或模型输入。 */
export function createChatHostContextReader(db:Db,deps:{now?:()=>string}={}) {
  const leases=createExecutionLeaseService(db,deps);
  return {read:(ref:ExecutionRef)=>leases.withLease(ref,"admission",async({tx,task,context})=>{
    const payload=object(task.payload),modelInput=chatWorkerInputSchema.parse(payload.modelInput);
    const [business]=await tx.select().from(aiTasks).where(and(eq(aiTasks.id,task.ownerId),eq(aiTasks.executionTaskId,task.id),eq(aiTasks.userId,context.userId),eq(aiTasks.accountId,context.accountId!)));
    const input=object(business?.inputData);
    if(task.kind!=="ai_task" || task.ownerType!=="ai_task" || !business || !["queued","running"].includes(business.status) || business.taskType!=="copilot.assist" || payload.aiTaskId!==business.id || input.kind!=="chat.run" || modelInput.userId!==context.userId || modelInput.accountId!==context.accountId || input.modelInputDigest!==chatInputDigest(modelInput) || input.conversationId!==modelInput.conversationId || input.sourceMessageId!==modelInput.sourceMessageId)throw new ConflictError("聊天宿主任务映射无效");
    const snapshot=await readChatTurnSnapshot(tx as unknown as Db,context,{conversationId:modelInput.conversationId,sourceMessageId:modelInput.sourceMessageId});
    if(business.projectId!==snapshot.conversation.projectId || object(snapshot.sourceMessage.modelMetadata).chatTaskId!==business.id || input.historyDigest!==chatHistoryDigest(snapshot) || JSON.stringify(input.historyMessageIds)!==JSON.stringify(snapshot.messages.map(message=>message.id)))throw new ConflictError("聊天宿主历史映射已变化");
    const hostContext=readChatHostContextPair(payload.hostContext,input.hostContextDigest,{userId:context.userId,accountId:context.accountId!,projectId:snapshot.conversation.projectId});
    if(!hostContext)throw new ConflictError("旧聊天任务缺少宿主上下文，不能按当前配置重建");
    return {context,aiTaskId:business.id,hostContext,modelInput,snapshot};
  })};
}
