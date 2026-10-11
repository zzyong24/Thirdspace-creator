import {and,eq,aiTasks,executionTasks,type Db} from '@creatoros/backend';
import type {RequestContext} from '@creatoros/contract';
import {chatWorkerInputSchema} from '@creatoros/contract/execution-worker';
import {workspaceFilter} from '../../workspace-scope';
import {chatInputDigest} from '../ai/chat-turn-submission.service';
import {ConflictError} from './execution.errors';
/** 宿主凭据解析只读原冻结聊天映射，不读取现在的默认引擎。 */
export async function readFrozenChatExecutionEngine(db:Db,ctx:RequestContext,owner:{aiTaskId:string;executionTaskId:string}){
 const [task]=await db.select().from(executionTasks).where(and(eq(executionTasks.id,owner.executionTaskId),eq(executionTasks.ownerId,owner.aiTaskId),eq(executionTasks.userId,ctx.userId),workspaceFilter(executionTasks,ctx)));
 const [business]=await db.select().from(aiTasks).where(and(eq(aiTasks.id,owner.aiTaskId),eq(aiTasks.executionTaskId,owner.executionTaskId),eq(aiTasks.userId,ctx.userId),workspaceFilter(aiTasks,ctx)));
 const payload=task?.payload as {aiTaskId?:string;modelInput?:unknown}|undefined;
 const input=chatWorkerInputSchema.parse(payload?.modelInput);
 if(!task||task.kind!=='ai_task'||task.ownerType!=='ai_task'||!business||business.taskType!=='copilot.assist'||payload?.aiTaskId!==business.id||(business.inputData as {modelInputDigest?:string}).modelInputDigest!==chatInputDigest(input)||input.userId!==ctx.userId||(input.accountId??null)!==(ctx.accountId??null)||(input.groupId??null)!==(ctx.groupId??null))throw new ConflictError('聊天冻结引擎归属不符');
 return input.executionEngine;
}
