import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {and,eq,executionTasks,OwnershipError,type Db} from '@creatoros/backend';
import type {RequestContext} from '@creatoros/contract';
import type {AiService} from '../ai/ai.service';
import {workspaceFilter} from '../../workspace-scope';
import type {KnowledgeGenerationPort} from './knowledge-generation.types';
const skills=new Set(['knowledge.classify','knowledge.distill','knowledge.relate','comment.qa-sift']);
export class KnowledgeGenerationPendingError extends Error{
 constructor(readonly taskId:string,readonly executionTaskId:string,readonly runtimeStatus:string,readonly errorCode:string|null,message:string){super(`${message}（原任务：${taskId}）`);this.name='KnowledgeGenerationPendingError';}
}
export interface KnowledgeGenerationDeps {
 ai:Pick<AiService,'createTask'|'getTask'|'listResults'>;
 prepareTask(ctx:RequestContext,taskId:string,signal?:AbortSignal):Promise<{executionTaskId:string}>;
 wakeWorker():void;
}
/** 复用原aiTask与唯一execution记录，公共同步接口只等待同一候选，不解析模型、不重复提交。 */
export function createKnowledgeGenerationService(db:Db,deps:KnowledgeGenerationDeps):{runKnowledgeGeneration:KnowledgeGenerationPort}{
 return {async runKnowledgeGeneration(ctx,input,signal){
  signal?.throwIfAborted();if(!skills.has(input.skillId))throw Error('知识候选能力无效');
  const owner=structuredClone(ctx),body=structuredClone(input.inputData);
  const task=await deps.ai.createTask(owner,{taskType:input.skillId,attemptId:`knowledge-sync:${randomUUID()}`,inputData:body});
  let executionTaskId='';
  try{
   // 请求断开不会撤销已提交的任务；prepare/wake仍使原持久任务进入正常调度。
   ({executionTaskId}=await deps.prepareTask(owner,task.id));deps.wakeWorker();
   for(;;){
    const current=await deps.ai.getTask(owner,task.id);
    const [execution]=await db.select().from(executionTasks).where(and(eq(executionTasks.id,executionTaskId),eq(executionTasks.ownerId,task.id),eq(executionTasks.userId,owner.userId),workspaceFilter(executionTasks,owner)));
    if(!execution||execution.kind!=='ai_task'||execution.ownerType!=='ai_task')throw new OwnershipError('知识执行任务不存在');
    if(['awaiting_confirmation','succeeded'].includes(current.status)){
     const results=await deps.ai.listResults(owner,task.id),candidates=results.filter(row=>row.resultType==='knowledge_sync_candidate'&&row.resultData.skillId===input.skillId);
     if(candidates.length!==1||!Object.hasOwn(candidates[0]!.resultData,'output'))throw Error('知识候选回执不完整');
     return candidates[0]!.resultData.output;
    }
    const fail=(message:string)=>new KnowledgeGenerationPendingError(task.id,executionTaskId,execution.status,execution.lastErrorCode,message);
    if(['waiting_user','unknown_result','paused','pause_requested','failed','cancelled','expired','partial'].includes(execution.status))throw fail(execution.lastErrorCode?.startsWith('CODEX_')?'本地 Codex 未完成本次知识候选，请从原任务核对状态':current.errorMessage??'知识候选尚未完成，请从原任务核对状态');
    if(signal?.aborted)throw fail('本次等待已结束，原知识任务仍保留');
    // 所有分块共用首次绑定的原绝对期限，观察循环从不续期或创建第二任务。
    if(execution.deadlineAt!==null&&Date.parse(execution.deadlineAt)<=Date.now())throw fail('原知识任务期限已耗尽，请从原任务核对结果');
    try{await delay(Math.min(250,execution.deadlineAt===null?250:Math.max(1,Date.parse(execution.deadlineAt)-Date.now())),undefined,{signal});}
    catch(error){if(signal?.aborted)throw fail('本次等待已结束，原知识任务仍保留');throw error;}
   }
  }catch(error){
   if(error instanceof KnowledgeGenerationPendingError||error instanceof OwnershipError)throw error;
   if(executionTaskId){
    // 观察/唤醒错误不能把已绑定原任务假写成准备失败。
    let current:{status:string;lastErrorCode:string|null}|undefined;
    try{[current]=await db.select().from(executionTasks).where(and(eq(executionTasks.id,executionTaskId),eq(executionTasks.ownerId,task.id),eq(executionTasks.userId,owner.userId),workspaceFilter(executionTasks,owner)));}catch{}
    throw new KnowledgeGenerationPendingError(task.id,executionTaskId,current?.status??'unobserved',current?.lastErrorCode??null,'知识任务尚未取得完整候选，请从原任务继续核对');
   }
   throw new KnowledgeGenerationPendingError(task.id,executionTaskId,'preparation_failed',null,'知识任务准备尚未完成，请从原任务继续核对');
  }
 }};
}
