import {ingestionRuns} from "../../schema/ingestion";
import {and,eq,isNull,sql} from 'drizzle-orm';
import type {Db} from '../../db';
import type {RequestContext} from '@creatoros/contract';
import {OwnershipError} from '../../errors';
import {ConflictError} from './platform-account.errors';
import {accountGroups,accountGroupMemberships} from '../../schema/account-groups';
import {platformAccounts} from '../../schema/platform-account';
import {aiTasks} from '../../schema/ai';
import {executionTasks} from '../../schema/intelligence';
import {scheduledJobs,jobRuns} from '../../schema/scheduling';
import {requireWorkspace} from '../../workspace-scope';

export type MembershipTransaction=Parameters<Parameters<Db['transaction']>[0]>[0];
export interface FrozenWorkspace {userId:string;groupId:string|null;accountId:string|null;groupVersion:number|null;membershipVersion:number|null}

/** 转组、任务创建/认领共用此端口：先锁真实平台账号，再锁有效member，最后重读组。 */
export async function lockWorkspaceMembership(tx:MembershipTransaction,ctx:RequestContext,options:{allowArchived?:boolean}={}):Promise<FrozenWorkspace>{
 requireWorkspace(ctx);
 const freeze:FrozenWorkspace={userId:ctx.userId,groupId:ctx.groupId??null,accountId:ctx.accountId??null,groupVersion:null,membershipVersion:null};
 // 显式legacy入口保留原账号范围，不自动转换或扩大成整个组。
 if(!ctx.groupId){
  const [account]=await tx.select().from(platformAccounts).where(and(eq(platformAccounts.userId,ctx.userId),eq(platformAccounts.id,ctx.accountId!))).for("update");
  if(!account)return freeze; // 未迁移的显式legacy范围保留旧合同；平台调用者仍校验真实账号。
  if(account.status!=="active")throw new OwnershipError("平台账号不可用，请重新选择");
  const [member]=await tx.select().from(accountGroupMemberships).where(and(eq(accountGroupMemberships.userId,ctx.userId),eq(accountGroupMemberships.accountId,ctx.accountId!),isNull(accountGroupMemberships.leftAt))).for("update");
  if(member&&member.groupId!==`grp_legacy_${ctx.accountId}`)throw new ConflictError("账号已转组，请使用账号组入口重新选择目标");
  if(!member)return freeze;
  const [group]=await tx.select().from(accountGroups).where(and(eq(accountGroups.userId,ctx.userId),eq(accountGroups.id,member.groupId))).for("update");
  if(!group||(!options.allowArchived&&group.status!=="active"))throw new OwnershipError("账号组不可用，请重新选择");
  return {...freeze,groupId:group.id,groupVersion:group.version,membershipVersion:member.version};
 }
 if(ctx.accountId){
  const [account]=await tx.select().from(platformAccounts).where(and(eq(platformAccounts.userId,ctx.userId),eq(platformAccounts.id,ctx.accountId))).for('update');
  if(!account||account.status!=='active')throw new OwnershipError('平台账号不可用，请重新选择');
  const [member]=await tx.select().from(accountGroupMemberships).where(and(eq(accountGroupMemberships.userId,ctx.userId),eq(accountGroupMemberships.accountId,ctx.accountId),isNull(accountGroupMemberships.leftAt))).for('update');
  if(!member||member.groupId!==ctx.groupId||(ctx.membershipVersion!==undefined&&member.version!==ctx.membershipVersion))throw new ConflictError('账号归属已改变，请重新选择目标');
  freeze.membershipVersion=member.version;
 }
 const [group]=await tx.select().from(accountGroups).where(and(eq(accountGroups.userId,ctx.userId),eq(accountGroups.id,ctx.groupId))).for("update");
 if(!group||(!options.allowArchived&&group.status!=='active'))throw new OwnershipError('账号组不可用，请重新选择');
 freeze.groupVersion=group.version;return freeze;
}

/** 在外部副作用开始前重验原冻结值；绝不使用当前页面选中的组覆盖原任务。 */
export async function assertFrozenWorkspaceMembership(tx:MembershipTransaction,frozen:FrozenWorkspace,options:{allowArchived?:boolean}={}):Promise<void>{
 if(!frozen.groupId){if(frozen.accountId)await lockWorkspaceMembership(tx,{userId:frozen.userId,accountId:frozen.accountId,requestId:"legacy-membership-validation",source:"ai"},options);return;}
 if(frozen.accountId&&frozen.membershipVersion===null)throw new ConflictError('任务缺少冻结账号归属版本，请重新选择目标');
 await lockWorkspaceMembership(tx,{userId:frozen.userId,groupId:frozen.groupId,accountId:frozen.accountId,membershipVersion:frozen.membershipVersion??undefined,requestId:'frozen-membership-validation',source:'ai'},options);
}

/** 调用者已通过上述平台账号/member锁；转组不能与创建新在途任务交错。 */
export async function activeAccountTaskCount(tx:MembershipTransaction,userId:string,accountId:string):Promise<number>{
 const [ai,execution,runs,ingestions]=await Promise.all([
  tx.select({count:sql<number>`count(*)::int`}).from(aiTasks).where(and(eq(aiTasks.userId,userId),eq(aiTasks.accountId,accountId),sql`${aiTasks.status} NOT IN ('succeeded','failed','cancelled') AND NOT EXISTS (SELECT 1 FROM execution_tasks e WHERE e.id=${aiTasks.executionTaskId} AND e.status NOT IN ('succeeded','failed','cancelled','partial'))`)),
  tx.select({count:sql<number>`count(*)::int`}).from(executionTasks).where(and(eq(executionTasks.userId,userId),eq(executionTasks.accountId,accountId),sql`${executionTasks.status} NOT IN ('succeeded','failed','cancelled','partial')`)),
  tx.select({count:sql<number>`count(*)::int`}).from(jobRuns).innerJoin(scheduledJobs,eq(jobRuns.jobId,scheduledJobs.id)).where(and(eq(scheduledJobs.userId,userId),eq(scheduledJobs.accountId,accountId),sql`${jobRuns.status} IN ('queued','running') AND NOT EXISTS (SELECT 1 FROM ai_tasks a WHERE a.id=${jobRuns.aiTaskId} AND a.status NOT IN ('succeeded','failed','cancelled'))`)),
  tx.select({count:sql<number>`count(*)::int`}).from(ingestionRuns).where(and(eq(ingestionRuns.userId,userId),eq(ingestionRuns.accountId,accountId),sql`${ingestionRuns.status} IN ('pending','running')`)),
 ]);return (ai[0]?.count??0)+(execution[0]?.count??0)+(runs[0]?.count??0)+(ingestions[0]?.count??0);
}
export function createMembershipLockService(db:Db){return {
 withLock:<T>(ctx:RequestContext,body:(tx:MembershipTransaction,frozen:FrozenWorkspace)=>Promise<T>)=>db.transaction(async tx=>body(tx,await lockWorkspaceMembership(tx,ctx))),
 lock:lockWorkspaceMembership,
 assertFrozen:assertFrozenWorkspaceMembership,
 activeTaskCount:activeAccountTaskCount,
 async assertNoActiveAccountTasks(tx:MembershipTransaction,userId:string,accountId:string){if(await activeAccountTaskCount(tx,userId,accountId))throw new ConflictError('该账号仍有在途任务，完成或取消后再转组');},
};}
