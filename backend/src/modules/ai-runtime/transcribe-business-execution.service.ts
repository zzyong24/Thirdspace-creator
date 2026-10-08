import {requireWorkspace,workspaceFilter,assertWritableWorkspace} from "../../workspace-scope";
import type {BoundedExecutionBudget} from "@creatoros/contract/execution-worker";
import {isDeepStrictEqual} from 'node:util';
import {and,asc,eq,isNull,aiTasks,aiTaskSteps,aiTaskResults,executionTasks,OwnershipError,type Db} from '@creatoros/backend';
import {transcribeTaskInputSchema,transcribeConfigurationSchema,type TranscribeConfiguration} from '@creatoros/contract/execution-worker';
import type {RequestContext} from '@creatoros/contract';
import type {MultimodalSpec} from './multimodal/resolve';
import {createExecutionAuthorityService,type PreparedModelExecution} from '../execution/execution-authority.service';
import {awaitPreparation} from '../execution/await-preparation';
type Task=typeof aiTasks.$inferSelect;
/** 确定性配置投影，只保留适配器实际消费的选项，不保存密钥或未知 settings。 */
export function transcribeConfiguration(spec:MultimodalSpec):TranscribeConfiguration {
 const output:Record<string,unknown>={kind:spec.kind,provider:spec.provider,model:spec.model,baseUrl:spec.baseUrl};
 for(const key of ['serviceId','apiFormat','displayModelKey','credentialLifecycle'] as const)if(spec[key]!==undefined)output[key]=spec[key];
 if(spec.settings){const settings:Record<string,unknown>={};for(const key of ['maxDurationSeconds','maxBytes'])if(spec.settings[key]!==undefined)settings[key]=spec.settings[key];if(Object.keys(settings).length)output.settings=settings;}
 return transcribeConfigurationSchema.parse(output);
}
function ids(task:Task){const input=task.inputData as Record<string,unknown>;return Array.isArray(input.awemeIds)?input.awemeIds:typeof input.awemeId==='string'?[input.awemeId]:[];}
/** 只有没有旧执行事实的任务才转交；配置读取在事务外，提交时重新核对原任务。 */
export function createTranscribeBusinessExecutionService(db:Db,deps:{budget:BoundedExecutionBudget;now?:()=>string;resolveSpec(ctx:RequestContext):Promise<MultimodalSpec>}){
 const controller=new AbortController(),authority=createExecutionAuthorityService(db,{now:deps.now});
 const owned=(ctx:RequestContext,id:string)=>and(eq(aiTasks.id,id),eq(aiTasks.userId,ctx.userId),workspaceFilter(aiTasks,ctx));
 async function legacy(tx:Pick<Db,'select'>,task:Task){
  if(task.retryOfTaskId||task.startedAt||Object.hasOwn(task.runtimeData??{},'multimodalProviderCheckpoint'))return true;
  if((await tx.select({id:aiTaskSteps.id}).from(aiTaskSteps).where(eq(aiTaskSteps.aiTaskId,task.id)).limit(1))[0])return true;
  return !!(await tx.select({id:aiTaskResults.id}).from(aiTaskResults).where(eq(aiTaskResults.aiTaskId,task.id)).limit(1))[0];
 }
 const service={
  async prepare(context:RequestContext,taskId:string,signal?:AbortSignal):Promise<{legacy:true;executionTaskId?:never}|{legacy?:never;aiTaskId:string;executionTaskId:string}>{
   const ctx={...context},abort=signal?AbortSignal.any([signal,controller.signal]):controller.signal;abort.throwIfAborted();
   const [task]=await db.select().from(aiTasks).where(owned(ctx,taskId));if(!task||task.taskType!=='transcribe.douyin')throw new OwnershipError('转写任务不存在');
   if(task.executionTaskId){const [execution]=await db.select().from(executionTasks).where(eq(executionTasks.id,task.executionTaskId));const frozen=transcribeTaskInputSchema.parse((execution?.payload as Record<string,unknown>)?.modelInput);if(!isDeepStrictEqual(frozen.awemeIds,ids(task)))throw new Error('转写原作品输入已改变');abort.throwIfAborted();return authority.bindAiTask(ctx,task.id);}
   if(task.status!=='queued'||task.leaseOwner||task.leaseToken||task.modelCallStartedAt)throw new Error('转写任务已开始，须沿原执行恢复');
   if(await legacy(db,task))return {legacy:true};
   const spec=await awaitPreparation(()=>deps.resolveSpec(ctx),abort);
   const modelInput=transcribeTaskInputSchema.parse({kind:'transcribe.douyin',awemeIds:ids(task),language:'zh',configuration:transcribeConfiguration(spec)});
   // 批量转写按已授权作品数预留识别/后处理额度，不共用一次文本生成的6次调用上限。
   // 只在首次绑定时冻结，恢复不扩大原任务预算或期限。
   const budget={...deps.budget,maxCalls:Math.min(10000,deps.budget.maxCalls*modelInput.awemeIds.length),maxTokens:Math.min(2_000_000_000,deps.budget.maxTokens*modelInput.awemeIds.length)};
   return db.transaction(async tx=>{
    abort.throwIfAborted();const [current]=await tx.select().from(aiTasks).where(owned(ctx,task.id)).for('update');
    if(!current||current.requestFingerprint!==task.requestFingerprint||!isDeepStrictEqual(current.inputData,task.inputData)||current.projectId!==task.projectId)throw new Error('转写准备期间原任务已改变');
    if(!current.executionTaskId&&await legacy(tx,current)){abort.throwIfAborted();return {legacy:true as const};}
    const mapped=await createExecutionAuthorityService(tx as unknown as Db,{now:deps.now}).bindAiTask(ctx,task.id,{requestFingerprint:task.requestFingerprint,modelInput,budget});abort.throwIfAborted();return mapped;
   });
  },
  async recoverQueued(onLegacy:(ctx:RequestContext,id:string)=>Promise<void>,onFailure:(ctx:RequestContext,id:string)=>Promise<void>,shouldStop=()=>false){
   const tasks=await db.select().from(aiTasks).where(and(eq(aiTasks.taskType,'transcribe.douyin'),eq(aiTasks.status,'queued'),isNull(aiTasks.executionTaskId),isNull(aiTasks.leaseOwner))).orderBy(asc(aiTasks.requestedAt));
   for(const task of tasks){if(shouldStop()||controller.signal.aborted)return;const ctx:RequestContext={userId:task.userId,accountId:task.accountId,groupId:task.groupId,groupVersion:task.groupVersion??undefined,membershipVersion:task.membershipVersion??undefined,requestId:`transcribe-recover:${task.id}`,source:'user'};
    try{const result=await service.prepare(ctx,task.id);if(result.legacy)await onLegacy(ctx,task.id);}catch{if(shouldStop()||controller.signal.aborted)return;await onFailure(ctx,task.id);}
   }
  },
  stop(){controller.abort();},
 };
 return service;
}
