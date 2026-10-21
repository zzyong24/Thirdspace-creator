import {createHash} from 'node:crypto';
import {z} from 'zod';
import {and,eq,executionTasks,projects,projectSourceReferences,intelligenceItems,sourceSnapshots,artifacts,artifactVersions,aiTasks,aiConversations,type Db} from '@creatoros/backend';
import {workspaceFilter} from '../../workspace-scope';
import {ConflictError} from './execution.errors';
type Tx=Parameters<Parameters<Db['transaction']>[0]>[0];
type Task=typeof executionTasks.$inferSelect;
type Child=Pick<Task,'kind'|'ownerType'|'ownerId'|'userId'|'accountId'|'groupId'|'groupVersion'|'membershipVersion'|'payload'>;
const object=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
export const preparationParentProofSchema=z.object({schemaVersion:z.literal(1),parentTaskId:z.string().min(1),projectId:z.string().min(1),sourceReferenceId:z.string().min(1).nullable(),sourceDigest:z.string().nullable(),exclusive:z.boolean()}).strict();
export type PreparationParentProof=z.infer<typeof preparationParentProofSchema>;
export const isPreparationParent=(task:Pick<Task,'kind'|'ownerType'>)=>task.kind==='project_preparation'&&task.ownerType==='project';
export function readPreparationParentProof(task:Pick<Task,'payload'>){const raw=object(task.payload).preparationParentProof;return raw===undefined?undefined:preparationParentProofSchema.parse(raw);}
/** 准备父的短tick不计模型尝试；生成子必须遵守原有次数上限，包括旧continuous记录。 */
export function preparationGenerationAttemptsExhausted(task:Pick<Task,'kind'|'payload'|'attempt'|'maxAttempts'|'executionBudget'>):boolean {
 if(task.kind!=='topic_preview'||!readPreparationParentProof(task))return false;
 const explicit=object(task.executionBudget).maxAttempts;
 const limit=typeof explicit==='number'&&Number.isInteger(explicit)&&explicit>0?explicit:task.maxAttempts;
 return task.attempt>=limit;
}
/** SEMANTIC_BOUNDARY_ALLOW: 只校验真实父、项目、引用、版本和归属，不按正文选来源。 */
export async function assertPreparationSource(tx:Tx,parent:Task,child:Child,referenceId:string|null){
 const payload=object(parent.payload),input=object(child.payload),scope={accountId:parent.accountId,groupId:parent.groupId};
 if(!isPreparationParent(parent)||payload.schemaVersion!==1||payload.projectId!==parent.ownerId||parent.userId!==child.userId||parent.accountId!==child.accountId||parent.groupId!==child.groupId||parent.groupVersion!==child.groupVersion||parent.membershipVersion!==child.membershipVersion)throw new ConflictError('项目准备父子归属不符');
 const [project]=await tx.select().from(projects).where(and(eq(projects.id,parent.ownerId),eq(projects.userId,parent.userId),workspaceFilter(projects,scope)));if(!project||project.archivedAt)throw new ConflictError('项目准备项目不可写');
 const [reference]=referenceId?await tx.select().from(projectSourceReferences).where(and(eq(projectSourceReferences.id,referenceId),eq(projectSourceReferences.projectId,project.id))):[];
 if(referenceId&&(!reference||!Array.isArray(payload.sourceReferenceIds)||!payload.sourceReferenceIds.includes(referenceId)))throw new ConflictError('项目准备来源不属于原父任务');
 if(reference?.sourceKind==='intelligence_item'){
  const [item]=await tx.select({id:intelligenceItems.id}).from(intelligenceItems).where(and(eq(intelligenceItems.id,reference.itemId!),eq(intelligenceItems.userId,parent.userId),workspaceFilter(intelligenceItems,scope)));
  const [snapshot]=await tx.select({id:sourceSnapshots.id}).from(sourceSnapshots).where(and(eq(sourceSnapshots.id,reference.snapshotId!),eq(sourceSnapshots.itemId,reference.itemId!),eq(sourceSnapshots.userId,parent.userId),workspaceFilter(sourceSnapshots,scope)));
  if(!item||!snapshot)throw new ConflictError('项目准备原始作品或快照已失效');
 }
 if(child.kind==='transcribe'&&child.ownerType==='item'){
  if(reference?.sourceKind!=='intelligence_item'||child.ownerId!==reference.itemId||input.itemId!==reference.itemId)throw new ConflictError('项目转写与真实引用不符');
 }else if(child.kind==='topic_preview'&&child.ownerType==='transform'){
  if(reference?.sourceKind!=='intelligence_item'||child.ownerId!==reference.itemId||input.itemId!==reference.itemId||input.sourceSnapshotId!==reference.snapshotId)throw new ConflictError('项目拆解与真实引用不符');
 }else if(child.kind==='ai_task'&&child.ownerType==='ai_task'){
  const [business]=await tx.select().from(aiTasks).where(and(eq(aiTasks.id,child.ownerId),eq(aiTasks.userId,parent.userId),workspaceFilter(aiTasks,scope)));
  if(!business||business.projectId!==project.id||input.aiTaskId!==business.id)throw new ConflictError('准备业务任务不属于原项目');
  const model=object(input.modelInput),businessInput=object(business.inputData);
  if(business.taskType==='transcribe.douyin'){
   const ref=object(project.platformRef);
   if(reference?.sourceKind!=='platform_work'||reference.platform!=='douyin'||reference.externalId!==ref.externalId||ref.platform!=='douyin'||model.kind!=='transcribe.douyin'||!Array.isArray(model.awemeIds)||model.awemeIds.length!==1||model.awemeIds[0]!==reference.externalId||!Array.isArray(businessInput.awemeIds)||businessInput.awemeIds[0]!==reference.externalId)throw new ConflictError('准备转写与真实抖音作品不符');
  }else if(business.taskType==='copilot.assist'){
   const [conversation]=await tx.select().from(aiConversations).where(and(eq(aiConversations.id,String(model.conversationId)),eq(aiConversations.projectId,project.id),eq(aiConversations.userId,parent.userId),workspaceFilter(aiConversations,scope)));
   if(!conversation||model.kind!=='chat.run'||businessInput.conversationId!==conversation.id||businessInput.sourceMessageId!==model.sourceMessageId||object(object(input.hostContext).chatContext).projectId!==project.id)throw new ConflictError('准备编导选择与原项目不符');
  }else throw new ConflictError('准备父没有此业务能力授权');
 }else if(child.kind==='topic_preview'&&child.ownerType==='project'){
  if(child.ownerId!==project.id||input.projectId!==project.id)throw new ConflictError('项目候选归属不符');
  const source=object(input.source);
  if(source.projectId!==project.id)throw new ConflictError('项目候选来源归属不符');
  if(source.kind==='project_artifact'){
   const [artifact]=await tx.select().from(artifacts).where(and(eq(artifacts.id,String(source.artifactId)),eq(artifacts.projectId,project.id)));
   const [version]=artifact?await tx.select().from(artifactVersions).where(and(eq(artifactVersions.artifactId,artifact.id),eq(artifactVersions.versionNumber,Number(source.artifactVersion)))):[];
   if(!artifact||!version||source.contentHash!==`sha256:${createHash('sha256').update(version.contentText).digest('hex')}`)throw new ConflictError('项目候选来源版本不存在');
  }else if(source.kind!=='imported_text')throw new ConflictError('项目候选缺少可信来源');
 }else throw new ConflictError('项目准备没有此子能力授权');
 return reference??null;
}
export async function findPreparationParent(tx:Tx,child:Task){
 const proof=readPreparationParentProof(child);if(!proof)return undefined;
 // 作品转写在复用端口降为共享后由原自身workspace和期限约束，不被任一准备消费者停止。
 if(!proof.exclusive&&child.kind==='transcribe'&&child.ownerType==='item')return undefined;
 const [parent]=await tx.select().from(executionTasks).where(eq(executionTasks.id,proof.parentTaskId));if(!parent||proof.projectId!==parent.ownerId)throw new ConflictError('项目准备父关系失效');
 const reference=await assertPreparationSource(tx,parent,child,proof.sourceReferenceId);
 if(reference&&reference.sourceDigest!==proof.sourceDigest)throw new ConflictError('项目准备来源摘要改变');return parent;
}
export function preparationExclusiveChildIds(task:Task):string[]{
 if(!isPreparationParent(task))return [];
 const steps=object(task.checkpoint).steps;
 return Array.isArray(steps)?steps.flatMap(value=>{const step=object(value);return step.reuse==='exclusive'&&typeof step.childTaskId==='string'?[step.childTaskId]:[];}):[];
}
