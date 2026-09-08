import {z} from 'zod';
import {and,eq,executionTasks,executionCalls,favoritesItems,favoritesFolders,type Db} from '@creatoros/backend';
import type {RequestContext} from '@creatoros/contract';
import {transcribeTaskInputSchema,type ExecutionRef} from '@creatoros/contract/execution-worker';
import {createExecutionLeaseService} from '../execution/execution-lease.service';
import {bindScheduledFlywheel} from '../execution/scheduled-flywheel-binding';
import type {TranscribeExecutionScope,TranscribeResourceBinding} from '../execution/transcribe-execution-binding';
import {createClaimedAsrStageService,ClaimedAsrSuspended,type ClaimedAsrStageDeps} from '../execution/claimed-asr-stage.service';
import {ScheduledFlywheelSuspended} from '../ai-runtime/scheduled-flywheel-suspension';
import {transcribeConfiguration} from '../ai-runtime/transcribe-business-execution.service';

const frozenSchema=z.object({itemId:z.string(),folderId:z.string(),awemeId:z.string(),sourceUrl:z.string(),input:transcribeTaskInputSchema}).strict();
export type ScheduledFavoritesAsrDeps=Omit<ClaimedAsrStageDeps,'bindResource'>;
/** 收藏 ASR 只服务原 favorites 调度及其已登记来源作品；不建立项目或新任务。 */
export function createScheduledFavoritesAsrService(db:Db,deps:ScheduledFavoritesAsrDeps){
 const leases=createExecutionLeaseService(db,deps);
 async function owned(scope:TranscribeExecutionScope,itemId:string,awemeId:string){
  const bound=await bindScheduledFlywheel(scope);
  if(bound.business.taskType!=='scheduled.favorites')throw new Error('FAVORITES_ASR_SOURCE_KIND_MISMATCH');
  const [item]=await scope.tx.select().from(favoritesItems).where(and(eq(favoritesItems.id,itemId),eq(favoritesItems.userId,scope.context.userId),eq(favoritesItems.accountId,scope.context.accountId!)));
  const [folder]=item?await scope.tx.select().from(favoritesFolders).where(and(eq(favoritesFolders.id,item.folderId),eq(favoritesFolders.userId,scope.context.userId),eq(favoritesFolders.accountId,scope.context.accountId!))):[];
  if(!item||item.awemeId!==awemeId||!folder||!folder.enabled)throw new Error('FAVORITES_ASR_ITEM_OWNER_MISMATCH');
  return {...bound,item};
 }
 const bindResource:TranscribeResourceBinding=async(scope,awemeId)=>{
  const payload=scope.task.payload as Record<string,unknown>,frozen=frozenSchema.parse((payload.favoritesAsrResources as Record<string,unknown>|undefined)?.[awemeId]);
  const bound=await owned(scope,frozen.itemId,awemeId);
  if(bound.item.folderId!==frozen.folderId||bound.item.url!==frozen.sourceUrl||frozen.awemeId!==awemeId||frozen.input.awemeIds.length!==1||frozen.input.awemeIds[0]!==awemeId)throw new Error('FAVORITES_ASR_SOURCE_CHANGED');
  return {payload:bound.payload,input:frozen.input,credentialIntentId:bound.business.id};
 };
 const stage=createClaimedAsrStageService(db,{...deps,bindResource});
 return {async transcribe(ref:ExecutionRef,ctx:RequestContext,input:{itemId:string;awemeId:string},signal:AbortSignal):Promise<string|null>{
  const verify=()=>leases.withLease(ref,'admission',async scope=>{
   signal.throwIfAborted();if(scope.context.userId!==ctx.userId||scope.context.accountId!==ctx.accountId)throw new Error('FAVORITES_ASR_ACCOUNT_MISMATCH');
   return owned(scope,input.itemId,input.awemeId);
  });
  const initial=await verify();
  const existing=(initial.payload.favoritesAsrResources as Record<string,unknown>|undefined)?.[input.awemeId];
  if(!existing){
   if(initial.item.transcript?.trim())return initial.item.transcript;
   const configuration=transcribeConfiguration(await deps.resolveSpec(ctx));signal.throwIfAborted();
   await leases.withLease(ref,'admission',async scope=>{
    signal.throwIfAborted();const bound=await owned(scope,input.itemId,input.awemeId),resources=(bound.payload.favoritesAsrResources??{}) as Record<string,unknown>;
    if(resources[input.awemeId])return;
    const calls=await scope.tx.select({operationKey:executionCalls.operationKey}).from(executionCalls).where(eq(executionCalls.executionTaskId,scope.task.id));
    if(calls.some(call=>call.operationKey.startsWith(`transcribe:${input.awemeId}/`)))throw new Error('FAVORITES_ASR_ORIGINAL_RESOURCE_MISSING');
    const frozen=frozenSchema.parse({itemId:bound.item.id,folderId:bound.item.folderId,awemeId:bound.item.awemeId,sourceUrl:bound.item.url,input:{kind:'transcribe.douyin',awemeIds:[bound.item.awemeId],language:'zh',configuration}});
    await scope.tx.update(executionTasks).set({payload:{...bound.payload,favoritesAsrResources:{...resources,[input.awemeId]:frozen}}}).where(eq(executionTasks.id,scope.task.id));
   });
  }
  try{return await stage.transcribe(ref,ctx,input.awemeId,signal);}
  catch(error){if(error instanceof ClaimedAsrSuspended)throw new ScheduledFlywheelSuspended(ref.executionTaskId,error.status);throw error;}
 }};
}
