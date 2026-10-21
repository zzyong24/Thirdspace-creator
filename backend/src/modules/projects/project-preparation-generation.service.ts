import {isDeepStrictEqual} from 'node:util';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {Db} from '../../db';
import type {RequestContext,ProjectPreparationCandidate} from '@creatoros/contract';
import {projectPreparationGenerationTargetSchema,type ProjectPreparationGenerationTarget} from '@creatoros/contract/execution-worker';
import {intelligenceTopicDecomposeSchema,intelligenceTopicFromDecompositionSchema} from '@creatoros/ai-worker';
import {ConflictError} from '../../errors';
import {createArtifactsService} from '../artifacts/artifacts.service';
import {createProjectRepository} from './projects.repository';
import {createExecutionLeaseService} from '../execution/execution-lease.service';
import {createProjectPreparationStateService} from '../execution/project-preparation-state.service';
import {createPersistentTaskService,type PersistentTaskClaim,type PersistentTaskService} from '../execution/persistent-task.service';
import {projectPreparationGenerationTargetForTask} from '../execution/execution-model-identity.service';
import type {PreparationTaskRow} from '../execution/project-preparation-state.service';
import type {TopicPreviewCheckpoint,TopicPreviewGeneratorPort} from '../intelligence/topic-preview-runner';
import {projectIntakeDigest,readImportedProjectText} from './project-intake.service';
import type {ServiceDeps} from './projects.service';
import type {PreparationContent} from './project-preparation.service';
import {workspaceFilter} from '../../workspace-scope';
const object=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const textHash=(text:string)=>`sha256:${createHash('sha256').update(text).digest('hex')}`;
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const resultSchema=z.union([z.object({generationMode:z.literal('rewrite_only'),adaptedDraft:z.string().min(1)}).strict(),intelligenceTopicDecomposeSchema.and(intelligenceTopicFromDecompositionSchema).and(z.object({adaptedDraft:z.string().min(1)}))]);
type Generated=Awaited<ReturnType<TopicPreviewGeneratorPort['generate']>>;
export function createProjectPreparationGenerationService(db:Db,deps:ServiceDeps&{tasks:PersistentTaskService;readImportedText?:(db:Db,ctx:RequestContext,intakeId:string)=>Promise<{projectId:string;contentText:string;contentHash:string}>}){
 const leases=createExecutionLeaseService(db,deps),states=createProjectPreparationStateService(db);
 async function source(store:Db,ctx:RequestContext,target:ProjectPreparationGenerationTarget){
  await createProjectRepository(store).get(ctx,target.projectId);
  if(textHash(target.transcript.text)!==target.source.contentHash)throw new ConflictError('来源正文摘要不一致');
  if(target.source.kind==='project_artifact'){
   const artifacts=createArtifactsService({db:store,...deps,assertProjectOwned:(c,id)=>createProjectRepository(store).get(c,id)}),artifact=await artifacts.getArtifact(ctx,target.source.artifactId);
   if(artifact.projectId!==target.projectId)throw new ConflictError('来源工件跨项目');
   const version=(await artifacts.listVersions(ctx,artifact.id)).find(row=>row.versionNumber===(target.source.kind==='project_artifact'?target.source.artifactVersion:0));
   if(!version||version.contentText!==target.transcript.text||textHash(version.contentText)!==target.source.contentHash)throw new ConflictError('来源精确版本或正文已变化');
  }else{
   const actual=await (deps.readImportedText??((store,c,id)=>readImportedProjectText(store,deps,c,id)))(store,ctx,target.source.intakeId);
   if(actual.projectId!==target.projectId||actual.contentText!==target.source.contentText||actual.contentHash!==target.source.contentHash)throw new ConflictError('真实导入正文与冻结来源不符');
  }
 }
 async function withClaim<T>(ctx:RequestContext,claim:PersistentTaskClaim,action:(store:Db,task:PreparationTaskRow,target:ProjectPreparationGenerationTarget)=>Promise<T>){
  return leases.withLease({executionTaskId:claim.task.id,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken},'admission',async({tx,task,context})=>{
   if(context.userId!==ctx.userId||context.accountId!==(ctx.accountId??null)||context.groupId!==(ctx.groupId??null)||task.leaseOwner!==claim.lease.workerId)throw new ConflictError('项目候选执行归属不符');
   const target=projectPreparationGenerationTargetForTask(task,object(task.payload).target);if(!target)throw new ConflictError('项目候选冻结来源不符');
   await source(tx as unknown as Db,context,target);return action(tx as unknown as Db,task,target);
  });
 }
 const service={
  async reserve(ctx:RequestContext,input:{parentClaim:PersistentTaskClaim;projectId:string;referenceId:string|null;inputRevision:number;target:ProjectPreparationGenerationTarget}){
   const target=projectPreparationGenerationTargetSchema.parse(input.target),parent=input.parentClaim;
   if(target.projectId!==input.projectId||parent.task.ownerId!==input.projectId)throw new ConflictError('项目候选父来源不符');
   await source(db,ctx,target);
   const key=`preparation:${parent.task.id}:source_draft:${input.inputRevision}`;
   // 原子任务已经启动时只读原身份证明，不把运行时 payload 当成新入队输入。
   const prior=await states.byKey(ctx,'topic_preview',key);
   if(prior){if(prior.ownerType!=='project'||prior.ownerId!==input.projectId||!isDeepStrictEqual(object(prior.payload).target,target)||object(object(prior.payload).preparationParentProof).parentTaskId!==parent.task.id)throw new ConflictError('原准备候选身份不符');return {childTaskId:prior.id,sourceDigest:digest(target)};}
   const child=await deps.tasks.enqueue(ctx,{kind:'topic_preview',ownerType:'project',ownerId:input.projectId,idempotencyKey:key,modelRouteParent:{taskId:parent.task.id,...parent.lease,preparationReferenceId:input.referenceId},payload:{schemaVersion:1,projectId:input.projectId,source:target.source,target,inputRevision:input.inputRevision}});
   return {childTaskId:child.id,sourceDigest:digest(target)};
  },
  getContext(ctx:RequestContext,claim:PersistentTaskClaim){return withClaim(ctx,claim,async(_tx,_task,target)=>target);},
  async saveCandidate(ctx:RequestContext,claim:PersistentTaskClaim,checkpoint:TopicPreviewCheckpoint){
   const value=checkpoint.stage==='decomposition'?intelligenceTopicDecomposeSchema.parse(checkpoint.value):checkpoint.stage==='topic'?intelligenceTopicFromDecompositionSchema.parse(checkpoint.value):z.object({contentText:z.string().min(1),templateVersion:z.string().optional()}).parse(checkpoint.value);
   await withClaim(ctx,claim,async(tx,task,target)=>{const current=object(task.checkpoint);await createPersistentTaskService(tx,deps).saveCheckpoint({taskId:task.id,...claim.lease,checkpoint:{...current,schemaVersion:1,projectId:task.ownerId,sourceDigest:digest(target),stages:{...object(current.stages),[checkpoint.stage]:value}}});});
  },
  async finish(ctx:RequestContext,claim:PersistentTaskClaim,generated:Generated){
   const result=resultSchema.parse(generated);await withClaim(ctx,claim,async(tx,task,target)=>{await createPersistentTaskService(tx,deps).saveCheckpoint({taskId:task.id,...claim.lease,checkpoint:{...object(task.checkpoint),schemaVersion:1,projectId:task.ownerId,sourceDigest:digest(target),result}});});
  },
  async collect(ctx:RequestContext,projectId:string,childTaskId:string):Promise<Array<{candidate:ProjectPreparationCandidate;content:PreparationContent}>>{
   const task=await states.read(ctx,childTaskId),target=projectPreparationGenerationTargetForTask(task,object(task.payload).target),cp=object(task.checkpoint);
   if(task.status!=='succeeded'||task.ownerId!==projectId||!target||cp.projectId!==projectId||cp.sourceDigest!==digest(target))throw new ConflictError('项目候选缺少真实完成回执');
   await source(db,ctx,target);const result=resultSchema.parse(cp.result),content:PreparationContent={kind:'draft',text:result.adaptedDraft};
   return [{candidate:{id:`preparation-draft:${task.id}`,kind:'draft',sourceTaskId:task.id,transformId:null,checkpointPath:'result.adaptedDraft',sourceDigest:cp.sourceDigest as string,artifactDigest:projectIntakeDigest(content),status:'pending',acceptanceReceipt:null},content}];
  },
 };return service;
}
export type ProjectPreparationGenerationService=ReturnType<typeof createProjectPreparationGenerationService>;
