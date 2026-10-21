import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {executionCalls,executionTasks} from '@creatoros/backend';
import {chatWorkerInputSchema,codexModelSpecSchema,structuredGenerationInputSchema,intelligenceRewriteInputSchema,externalChatStartSchema,frozenExecutionEngine,isContinuousExecutionBudget,workerTaskInputSchema,videoFrozenSchema} from '@creatoros/contract/execution-worker';
import {canonicalJson} from '../ai/canonical-json';
import {frozenChatModelRouteForCall,frozenNonChatModelBindingForCall,frozenProjectPreparationGenerationBinding} from './execution-model-identity.service';
type Task=typeof executionTasks.$inferSelect;
type Call=typeof executionCalls.$inferSelect;
const object=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const intelligenceGenerationInputSchema=z.union([structuredGenerationInputSchema,intelligenceRewriteInputSchema]);
/** SEMANTIC_BOUNDARY_ALLOW: 只核验原期限和真实协议身份，不选择内容或取得再次提交权。 */
export function codexReadDeadlineAvailable(task:Task,stamp:string){
 return task.deadlineAt===null
  ? isContinuousExecutionBudget(task.executionBudget)&&object(task.executionBudget).deadlineMs===null
  : Number.isFinite(Date.parse(task.deadlineAt))&&Date.parse(task.deadlineAt)>Date.parse(stamp);
}
export function originalCodexReadBinding(task:Task,call:Call){
 const payload=object(task.payload),visual=object(payload.executionRoute).schemaVersion===2&&payload.stageKind==='video.visual-review',input=workerTaskInputSchema.safeParse(visual?payload.reviewInput:payload.modelInput),chat=chatWorkerInputSchema.safeParse(payload.modelInput);
 const v2=object(payload.executionRoute).schemaVersion===2,own=v2&&!chat.success?frozenNonChatModelBindingForCall(task,call):null;
 const chatV2=chat.success&&object(payload.executionRoute).schemaVersion===2;
 const projectPreview=task.kind==='topic_preview'&&task.ownerType==='project'&&!!frozenProjectPreparationGenerationBinding(task);
 const intelligence=projectPreview||(task.kind==='topic_preview'&&task.ownerType==='transform')||(task.kind==='script_candidate'&&task.ownerType==='project');
 if((!intelligence&&(task.kind!=='ai_task'||task.ownerType!=='ai_task'||(!visual&&payload.aiTaskId!==task.ownerId)||!input.success))||
  (v2?(chatV2?frozenChatModelRouteForCall(payload,call)?.source:own?.route.source)!=='codex':(frozenExecutionEngine(payload)!=='codex'&&!(payload.executionRoute===undefined&&chat.success&&chat.data.executionEngine==='codex')))||
  call.executionTaskId!==task.id||!['model','external_agent'].includes(call.kind)||!['started','unknown'].includes(call.status)||
  call.startedAttempt===null||call.startedAttempt<1||call.startedAttempt>task.attempt||call.providerJob!==null||call.toolExecutionClaimId!==null)return null;
 if(chat.success&&((!chatV2||call.kind==='external_agent')&&chat.data.executionEngine!=='codex'||chat.data.userId!==task.userId||chat.data.accountId!==task.accountId||(chat.data.groupId??null)!==(task.groupId??null)))return null;
 const native=object(object(payload.codexCalls)[call.id]);
 if(typeof native.threadId!=='string'||!native.threadId.trim()||typeof native.turnId!=='string'||!native.turnId.trim())return null;
 if(call.kind==='external_agent'){
  const start=externalChatStartSchema.safeParse(call.providerResult);
  if(!chat.success||call.parentCallId!==null||call.sequence!==1||call.operationKey!==`${chat.data.operationKey}/external-turn/1`||
   call.inputDigest!==createHash('sha256').update(canonicalJson(chat.data)).digest('hex')||!start.success||start.data.engine!=='codex'||
   !['acp','codex-app-server'].includes(start.data.protocolKind??'')||start.data.turnId!==call.id||
   start.data.sessionId!==native.threadId||!start.data.providerTurnId||start.data.providerTurnId!==native.turnId)return null;
 }else{
  let identity=call.parentCallId?object(object(payload.chatModelIdentities)[call.parentCallId]).identity:payload.modelIdentity;
  const matchingStage=(value:unknown)=>{
   const stage=object(value),frozen=(intelligence?intelligenceGenerationInputSchema:structuredGenerationInputSchema).safeParse(stage.input);
   if(!frozen.success||frozen.data.skillSnapshot.userId!==task.userId||frozen.data.skillSnapshot.accountId!==task.accountId||(frozen.data.skillSnapshot.groupId??null)!==(task.groupId??null))return undefined;
   const prefix=`${frozen.data.operationKey}/model/`,suffix=call.operationKey.slice(prefix.length);
   return call.parentCallId===null&&call.operationKey.startsWith(prefix)&&/^[1-9][0-9]*$/.test(suffix)&&object(stage.identity).capability===frozen.data.capability?stage.identity:undefined;
  };
  if(intelligence){
   const frozen=object(payload.intelligenceGeneration),generation=intelligenceGenerationInputSchema.safeParse(frozen.input);
   if(!generation.success||generation.data.operationKey!==`intelligence:${task.id}`||generation.data.capability!==(task.kind==='topic_preview'?'topic.generate':'script.draft'))return null;
   identity=matchingStage(frozen);
  }else if(input.success&&input.data.kind==='scheduled.flywheel'){
   const identities=Object.values(object(payload.flywheelStages)).map(matchingStage).filter(value=>value!==undefined);
   if(identities.length!==1)return null;identity=identities[0];
  }else if(input.success&&input.data.kind==='transcribe.douyin'){
   const plans=Object.values(object(payload.transcribePostprocess)).map(value=>object(object(value).plan)).filter(plan=>typeof plan.operationKey==='string'&&call.operationKey.startsWith(`${plan.operationKey}/model/`)&&/^[1-9][0-9]*$/.test(call.operationKey.slice(`${plan.operationKey}/model/`.length)));
   if(plans.length!==1||call.parentCallId)return null;identity=plans[0]!.identity;
  }else if(input.success&&input.data.kind==='model.structured'&&input.data.facets.__videoDecisions!==undefined){
   try{
    const structuredInput=input.data;const frozen=videoFrozenSchema.parse(JSON.parse(structuredInput.facets.__videoDecisions!));
    if(frozen.task.id!==task.ownerId)return null;
    const matching=Object.entries(frozen.modelIdentities).filter(([skill])=>{const prefix=`${structuredInput.operationKey}/video/${skill}/`;return call.operationKey.startsWith(prefix)&&/^[1-9][0-9]*\/model\/[1-9][0-9]*$/.test(call.operationKey.slice(prefix.length));});
    if(matching.length!==1||call.parentCallId)return null;identity=matching[0]![1];
   }catch{return null;}
  }
  const {schemaVersion,capability,...spec}=object(identity);
  const originalIdentity=schemaVersion===1&&typeof capability==='string'&&codexModelSpecSchema.safeParse(spec).success;
  // 图片的原引擎规格本身已冻结在原任务输入；文本必须已有无秘密模型身份。
  if(!originalIdentity&&!(own?.assetInput&&own.route.source==='codex')&&!(input.success&&input.data.kind==='asset.generate'&&'engine' in input.data&&input.data.engine==='codex'))return null;
  if(!visual&&input.success&&input.data.kind==='model.generate'&&(call.parentCallId!==null||call.operationKey!==input.data.operationKey||capability!==input.data.capability||call.inputDigest!==`sha256:${createHash('sha256').update(JSON.stringify(input.data)).digest('hex')}`))return null;
 }
 return native as Record<string,unknown>&{threadId:string;turnId:string};
}
