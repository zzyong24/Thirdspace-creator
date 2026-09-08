import {createHash,randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {and,asc,eq,inArray,aiTasks,aiTaskResults,executionTasks,executionCalls,OwnershipError,type Db} from '@creatoros/backend';
import type {RequestContext} from '@creatoros/contract';
import {assetGenerationInputSchema} from '@creatoros/contract/execution-worker';
import {canonicalJson} from '../ai/canonical-json';
import {generationFingerprint,parseProviderCheckpoint} from './asset-provider-checkpoint';
type Task=typeof aiTasks.$inferSelect;
type Input=import('zod').z.infer<typeof assetGenerationInputSchema>;
/** 旧提交事实单向导入现有账本。仅允许读取原 video job，绝不授予新的付费提交额度。 */
export async function prepareLegacyAssetRecovery(db:Db,ctx:RequestContext,snapshot:Task,modelInput:Input|undefined,options:{deadlineMs:number;now:()=>string;signal:AbortSignal}){
 const {signal,now}=options;
 return db.transaction(async tx=>{
  signal.throwIfAborted();
  const ids=[...new Set([snapshot.id,snapshot.retryOfTaskId].filter((id):id is string=>!!id))].sort();
  const rows=await tx.select().from(aiTasks).where(and(inArray(aiTasks.id,ids),eq(aiTasks.userId,ctx.userId),eq(aiTasks.accountId,ctx.accountId??''))).orderBy(asc(aiTasks.id)).for('update');
  const current=rows.find(row=>row.id===snapshot.id),original=rows.find(row=>row.id===(snapshot.retryOfTaskId??snapshot.id));
  if(!current||!original||rows.length!==ids.length||rows.some(row=>row.taskType!=='asset.generate'))throw new OwnershipError('旧素材任务归属不符');
  if(!isDeepStrictEqual(current.inputData,snapshot.inputData)||current.requestFingerprint!==snapshot.requestFingerprint||current.projectId!==snapshot.projectId)throw new Error('旧素材记录在准备期间改变');
  if(current.executionTaskId)return {aiTaskId:current.id,executionTaskId:current.executionTaskId};
  if(!isDeepStrictEqual(current.runtimeData,snapshot.runtimeData))throw new Error('旧素材提交记录在准备期间改变');
  // 旧租约未交还时不能接管；过期清理由原租约恢复器负责。
  if(rows.some(row=>row.leaseOwner||row.leaseToken))throw new Error('旧素材执行尚未确认停止');
  if(current.status!=='queued')throw new Error('仅排队的旧素材任务可交接');
  const stamp=now(),executionTaskId=`exec_${randomUUID()}`;
  const results=await tx.select().from(aiTaskResults).where(inArray(aiTaskResults.aiTaskId,ids));
  const ownResults=results.filter(row=>row.aiTaskId===current.id&&row.resultType==='generated_asset');
  const previousBinding=(original.runtimeData as Record<string,unknown>).assetWorkerRecoveryExecutionTaskId;
  let reason='旧素材提交结果无法确认，请核对原任务和供应商结果，禁止重复生成';
  let jobId:string|undefined;
  const mismatched=rows.some(row=>!isDeepStrictEqual(row.inputData,current.inputData)||row.projectId!==current.projectId);
  if(ownResults.length)reason='原素材候选已保留，请读取原结果并采纳';
  else if(results.length)reason='原任务已有结果，请打开原任务核对并采纳，不再重复生成';
  else if(original.executionTaskId||previousBinding)reason='此素材意图已交给原持久执行，请在原任务恢复';
  else if(mismatched)reason='重试输入或项目与原素材意图不同，请核对原提交';
  else if(modelInput){
   const input=assetGenerationInputSchema.parse(modelInput);
   const fingerprint=generationFingerprint({intentId:current.retryOfTaskId??current.id,capability:input.capability,prompt:input.prompt,aspectRatio:input.aspectRatio,durationSec:input.durationSec,resolution:input.mediaKind==='video'?input.resolution:'768P',spec:input});
   const checkpoints=rows.map(row=>({row,raw:(row.runtimeData as Record<string,unknown>).multimodalProviderCheckpoint})).filter(item=>item.raw!==undefined);
   const parsed=checkpoints.map(item=>parseProviderCheckpoint(item.raw,fingerprint));
   const jobs=parsed.filter(checkpoint=>checkpoint?.state==='submitted'&&checkpoint.jobId);
   // SEMANTIC_BOUNDARY_ALLOW: provider 列表只声明已有视频适配器的 resumeJobId 协议支持，不做内容选择。
   const canResume=['minimax','omnihi','seedance','seeddance'].includes(input.provider);
   if(input.mediaKind==='video'&&canResume&&parsed.length>0&&parsed.every(checkpoint=>checkpoint?.capability===input.capability&&checkpoint.state==='submitted'&&checkpoint.jobId)&&new Set(jobs.map(checkpoint=>checkpoint!.jobId)).size===1){
    jobId=jobs[0]!.jobId;
    reason='沿已提交的原供应商任务号恢复读取';
   }else if(!canResume)reason='原供应商尚无安全的任务号读取适配，请核对原结果';
  }else reason='原模型身份或配置不可用，请恢复原配置后核对供应商任务，禁止新提交';
  // 无原 execution 映射的旧链没有冻结截止；此窗口仅授权读取已知 job。已有映射从上方原样返回。
  const deadlineAt=new Date(Date.parse(stamp)+options.deadlineMs).toISOString();
  const status=ownResults.length?'succeeded':jobId?'queued':'waiting_user';
  const frozen=modelInput?assetGenerationInputSchema.parse(modelInput):undefined;
  const callId=jobId?`call_${randomUUID()}`:undefined;
  const reservedTokens=frozen?Buffer.byteLength(frozen.prompt)+1024:1;
  // 旧链没有可证明的 token 用量，不能置零；唯一旧请求占满调用额度，仅允许同键回读。
  await tx.insert(executionTasks).values({id:executionTaskId,userId:current.userId,accountId:current.accountId,kind:'ai_task',ownerType:'ai_task',ownerId:current.id,idempotencyKey:`ai:${current.id}`,status,
   payload:{aiTaskId:current.id,...(frozen?{modelInput:frozen}:{}),assetLegacyRecovery:{schemaVersion:1,mode:jobId?'provider_job':'review',originalTaskId:original.id,callId:callId??null,inputData:current.inputData,requestFingerprint:current.requestFingerprint,recoveryStartedAt:stamp}},
   executionBudget:{maxCalls:1,maxTokens:reservedTokens,deadlineMs:options.deadlineMs},deadlineAt,createdAt:original.requestedAt,updatedAt:stamp,
   lastErrorCode:jobId?null:'ASSET_LEGACY_REVIEW_REQUIRED',lastErrorMessage:jobId?null:reason});
  if(jobId&&frozen&&callId){
   await tx.insert(executionCalls).values({id:callId,executionTaskId,sequence:1,kind:'model',operationKey:frozen.operationKey,inputDigest:`sha256:${createHash('sha256').update(canonicalJson(frozen)).digest('hex')}`,reservedTokens,accountingBasis:'tokens',status:'unknown',startedAttempt:null,
    providerJob:{schemaVersion:1,provider:frozen.provider,model:frozen.model,baseUrl:frozen.baseUrl,...(frozen.serviceId?{serviceId:frozen.serviceId}:{}),jobId},
    createdAt:original.modelCallStartedAt??original.startedAt??original.requestedAt,updatedAt:stamp});
   await tx.update(aiTasks).set({runtimeData:{...(original.runtimeData as Record<string,unknown>),assetWorkerRecoveryExecutionTaskId:executionTaskId}}).where(eq(aiTasks.id,original.id));
  }
  await tx.update(aiTasks).set({executionTaskId,...(ownResults.length?{status:'awaiting_confirmation'}:{}),errorMessage:jobId?null:reason}).where(eq(aiTasks.id,current.id));
  signal.throwIfAborted();return {aiTaskId:current.id,executionTaskId};
 });
}
