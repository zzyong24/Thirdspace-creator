import {isDeepStrictEqual} from 'node:util';
import {z} from 'zod';
import {and,asc,eq,isNull,aiTasks,aiTaskResults,executionTasks,executionCalls,platformAccounts,type Db} from '@creatoros/backend';
import type {RequestContext} from '@creatoros/contract';
import {executionRefSchema,structuredGenerationInputSchema,workerStructuredResultSchema,workerProviderReceiptSchema,executionBudgetSchema,type ExecutionRef} from '@creatoros/contract/execution-worker';
import {reconstructProjectSchema} from '@creatoros/ai-worker';
import {accountGroups,accountGroupMemberships} from '../../schema/account-groups';
import {workspaceFilter} from '../../workspace-scope';
import {lockImportedProjectForReconstruction} from '../projects/project-lock.service';
import {ConflictError} from '../execution/execution.errors';
import {renderResearch} from '../ai-runtime/reconstruct-content';
import {materializeSettledReconstructionArtifact} from './artifacts.service';
export type ReconstructionTransaction=Parameters<Parameters<Db['transaction']>[0]>[0];
const settlementBrand:unique symbol=Symbol('original-reconstruction-settlement');
export interface ReconstructionSettlement {readonly [settlementBrand]:true}
type Facts={tx:ReconstructionTransaction;context:RequestContext;projectId:string;contentText:string;contentData:Record<string,unknown>};
const proofs=new WeakMap<ReconstructionSettlement,Facts>();
/** 仅当前事务内的命名结算证明，不可由flags/AI类型/序列化输入取得。 */
export function readReconstructionSettlement(proof:ReconstructionSettlement,tx:ReconstructionTransaction):Facts{
 const facts=proofs.get(proof);if(!facts||facts.tx!==tx)throw new ConflictError('原重建结算证明不可用');return facts;
}
export function consumeReconstructionSettlement(proof:ReconstructionSettlement,tx:ReconstructionTransaction):Facts{
 const facts=readReconstructionSettlement(proof,tx);proofs.delete(proof);return facts;
}
/** 只接受实际原任务、Skill和已发生generation账本；先组/父，再锁执行/业务/调用。 */
export async function prepareReconstructionSettlement(tx:ReconstructionTransaction,rawRef:ExecutionRef,input:{callId:string;text:string},now:()=>string,signal?:AbortSignal){
 const ref=executionRefSchema.parse(rawRef);
 const [snapshot]=await tx.select().from(executionTasks).where(eq(executionTasks.id,ref.executionTaskId));
 if(!snapshot)throw new ConflictError('原重建执行不存在');
 const payload=z.record(z.string(),z.unknown()).parse(snapshot.payload),frozen=structuredGenerationInputSchema.parse(payload.modelInput),skill=frozen.skillSnapshot;
 const target=z.object({projectId:z.string().min(1)}).strict().parse(JSON.parse(frozen.facets.__reconstructProject??'null'));
 const context:RequestContext={userId:snapshot.userId,accountId:snapshot.accountId,groupId:snapshot.groupId,groupVersion:snapshot.groupVersion??undefined,membershipVersion:snapshot.membershipVersion??undefined,requestId:`execution:${snapshot.id}:${snapshot.attempt}`,source:'ai'};
 const resultId=`reconstruct:${input.callId}`;
 const [priorSnapshot]=await tx.select().from(aiTaskResults).where(eq(aiTaskResults.id,resultId));
 // 原结果回执不启动写；新物化锁原根/父后才请求execution行锁，不晚加组锁。
 if(!priorSnapshot){
  if(snapshot.groupId){
   const [group]=await tx.select().from(accountGroups).where(and(eq(accountGroups.id,snapshot.groupId),eq(accountGroups.userId,snapshot.userId))).for('share');
   if(!group||!['active','archived'].includes(group.status))throw new ConflictError('原重建组归属不符');
   if(snapshot.accountId){
    // 转组必须取得同一group UPDATE锁；此处只读原member，不倒置account→group写锁顺序。
    const [member]=await tx.select().from(accountGroupMemberships).where(and(eq(accountGroupMemberships.userId,snapshot.userId),eq(accountGroupMemberships.accountId,snapshot.accountId),isNull(accountGroupMemberships.leftAt)));
    const [account]=await tx.select().from(platformAccounts).where(and(eq(platformAccounts.id,snapshot.accountId),eq(platformAccounts.userId,snapshot.userId)));
    if(!member||member.groupId!==snapshot.groupId||member.version!==snapshot.membershipVersion||!account)throw new ConflictError('原重建成员归属已改变');
   }else if(snapshot.membershipVersion!==null)throw new ConflictError('纯组重建不能制造成员版本');
  }else if(snapshot.accountId){
   // 旧group=NULL谱系只允许原独立账号的初始legacy组；只核当前权限，不重签任何旧freeze。
   const legacyId=`grp_legacy_${snapshot.accountId}`;
   const [group]=await tx.select().from(accountGroups).where(and(eq(accountGroups.id,legacyId),eq(accountGroups.userId,snapshot.userId))).for('share');
   const [member]=await tx.select().from(accountGroupMemberships).where(and(eq(accountGroupMemberships.userId,snapshot.userId),eq(accountGroupMemberships.accountId,snapshot.accountId),isNull(accountGroupMemberships.leftAt)));
   if((member&&(!group||member.groupId!==legacyId))||(group&&!['active','archived'].includes(group.status)))throw new ConflictError('原legacy账号已转组，不能新增重建物化');
  }else throw new ConflictError('原重建缺少工作区归属');
  await lockImportedProjectForReconstruction(tx,context,target.projectId);
 }
 const [task]=await tx.select().from(executionTasks).where(eq(executionTasks.id,ref.executionTaskId)).for('update');
 if(!task||task.attempt!==ref.attempt||task.fenceToken!==ref.fenceToken||!isDeepStrictEqual(task.payload,snapshot.payload)||task.userId!==snapshot.userId||task.groupId!==snapshot.groupId||task.accountId!==snapshot.accountId||task.groupVersion!==snapshot.groupVersion||task.membershipVersion!==snapshot.membershipVersion)throw new ConflictError('执行凭证或原冻结输入已失效');
 const [business]=await tx.select().from(aiTasks).where(and(eq(aiTasks.id,task.ownerId),eq(aiTasks.executionTaskId,task.id),eq(aiTasks.userId,task.userId),workspaceFilter(aiTasks,context))).for('update');
 if(task.kind!=='ai_task'||task.ownerType!=='ai_task'||!business||business.taskType!=='reconstruct.project'||payload.aiTaskId!==business.id)throw new ConflictError('重建任务归属不符');
 for(const key of ['userId','accountId','groupId','groupVersion','membershipVersion'] as const){
  if((business[key]??null)!==(task[key]??null)||(skill[key]??null)!==(task[key]??null))throw new ConflictError('原重建Skill/任务身份或版本不符');
 }
 const runtime=z.record(z.string(),z.unknown()).parse(business.runtimeData);
 if(!isDeepStrictEqual(runtime.skillSnapshot,skill))throw new ConflictError('原重建Skill冻结已改变');
 const businessInput=z.record(z.string(),z.unknown()).parse(business.inputData);
 if(frozen.kind!=='model.structured'||frozen.skillId!=='reconstruct.project'||frozen.capability!=='reconstruct.project'||frozen.operationKey!=='reconstruct.project'||business.projectId!==target.projectId||(businessInput.projectId!==undefined&&businessInput.projectId!==target.projectId))throw new ConflictError('重建冻结项目不符');
 const calls=await tx.select().from(executionCalls).where(eq(executionCalls.executionTaskId,task.id)).orderBy(asc(executionCalls.sequence)).for('update'),call=calls.find(c=>c.id===input.callId);
 if(!call||call.kind!=='model'||call.parentCallId||call.status!=='settled'||!call.providerResult||call.resultText!==input.text||!/^reconstruct\.project\/model\/[1-9][0-9]*$/.test(call.operationKey)||!/^sha256:[a-f0-9]{64}$/.test(call.inputDigest)||call.startedAttempt===null||call.startedAttempt>task.attempt)throw new ConflictError('重建缺少真实generation模型回执');
 workerProviderReceiptSchema.parse(call.providerResult);
 const [existing]=await tx.select().from(aiTaskResults).where(eq(aiTaskResults.id,resultId));
 if(existing){if(existing.aiTaskId!==business.id||existing.executionCallId!==call.id||existing.resultType!=='reconstruction'||call.resultRef!==resultId||task.status!=='succeeded'||business.status!=='succeeded')throw new ConflictError('重建历史回执不一致');return{kind:'existing' as const,resultId,aiTaskId:business.id};}
 const assertActive=()=>{signal?.throwIfAborted();const stamp=Date.parse(now());if(task.status!=='running'||!task.leaseOwner||!task.leaseExpiresAt||Date.parse(task.leaseExpiresAt)<=stamp||(task.deadlineAt&&Date.parse(task.deadlineAt)<=stamp)||!['queued','running'].includes(business.status)||call.resultRef||calls.at(-1)?.id!==call.id||calls.some(c=>['reserved','started','unknown'].includes(c.status)))throw new ConflictError('重建执行已停止或尚未完整');};
 assertActive();const budget=executionBudgetSchema.parse(task.executionBudget);if(call.reservedTokens<1024+frozen.maxOutputTokens||(budget.maxCalls!==null&&calls.length>budget.maxCalls))throw new ConflictError('原generation预算冻结不符');
 const structured=workerStructuredResultSchema.parse(JSON.parse(input.text));if(structured.validation?.status==='partial')throw new ConflictError('研究重建尚未完整');
 const pkg=reconstructProjectSchema.parse(structured.object);if(!pkg.research.coreTopic.trim())throw new ConflictError('研究重建缺少主题');
 // SEMANTIC_BOUNDARY_ALLOW: 只核验原ID/冻结/时间/回执；正文严格来自同call已保存结构，不做创作选择。
 for(const item of [...pkg.research.cases,...pkg.research.dataPoints])Object.freeze(item);Object.freeze(pkg.research.keyPoints);Object.freeze(pkg.research.cases);Object.freeze(pkg.research.dataPoints);const content=renderResearch(pkg.research);Object.freeze(content.contentData);
 const proof:ReconstructionSettlement=Object.freeze<ReconstructionSettlement>({[settlementBrand]:true});proofs.set(proof,Object.freeze({tx,context:Object.freeze(context),projectId:target.projectId,...content}));
 return{kind:'ready' as const,proof,task,business,call,resultId,target,assertActive};
}
/** 命名物化只消费已验证当前事务的原证明；通用artifact写权限不变。 */
export function createReconstructedArtifactService(deps:{now:()=>string;nextId:(prefix:string)=>string}){
 return{materialize:(tx:ReconstructionTransaction,proof:ReconstructionSettlement)=>materializeSettledReconstructionArtifact(tx,proof,deps)};
}
