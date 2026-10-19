import {getTableName,sql,type SQL} from 'drizzle-orm';
import type {PgTable} from 'drizzle-orm/pg-core';
import type {RequestContext} from '@creatoros/contract';
import type {Db} from '../../db';
import {platformAccounts} from '../../schema/platform-account';
import {accountGroupMemberships} from '../../schema/account-groups';
import {and,eq} from 'drizzle-orm';
import {lockWorkspaceMembership,type FrozenWorkspace,type MembershipTransaction} from '../platform-account/membership-lock.service';
import {OwnershipError,IntelligenceConflictError} from './intelligence.errors';

type Scope=Pick<RequestContext,'userId'|'accountId'|'groupId'>;
const column=(alias:string,name:string)=>sql`${sql.identifier(alias)}.${sql.identifier(name)}`;
const bare=(ctx:Scope)=>ctx.groupId?sql`false`:sql`${ctx.accountId??null}::text IS NOT NULL AND NOT EXISTS (SELECT 1 FROM platform_accounts iw_bare_account WHERE iw_bare_account.id=${ctx.accountId??null})`;

/** 服务持久时间统一为 toISOString() 的 UTC 格式；坏旧行只失去历史准入，不强转日期炸查询。 */
function trustedIso(value:SQL):SQL {
 const year=sql`substring(${value},1,4)::integer`,month=sql`substring(${value},6,2)::integer`,day=sql`substring(${value},9,2)::integer`;
 return sql`CASE WHEN ${value} ~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]\\.[0-9]{3}Z$' THEN
  CASE WHEN ${year}>0 AND ${day}<=CASE WHEN ${month}=2 THEN CASE WHEN (${year}%400=0 OR (${year}%4=0 AND ${year}%100<>0)) THEN 29 ELSE 28 END WHEN ${month} IN (4,6,9,11) THEN 30 ELSE 31 END THEN ${value} ELSE NULL END
  ELSE NULL END`;
}

/** SEMANTIC_BOUNDARY_ALLOW: 只解释真实初始工作区的存储表示，不推断内容、人设或创作选择。 */
function logicalGroup(ctx:Scope):SQL {
 if(ctx.groupId)return sql`${ctx.groupId}`;
 return sql`(SELECT iw_current.group_id FROM account_group_memberships iw_current
  JOIN platform_accounts iw_account ON iw_account.id=iw_current.platform_account_id AND iw_account.user_id=iw_current.user_id
  JOIN account_groups iw_group ON iw_group.id=iw_current.group_id AND iw_group.user_id=iw_current.user_id
  WHERE iw_current.user_id=${ctx.userId} AND iw_current.platform_account_id=${ctx.accountId??null}
  AND iw_current.left_at IS NULL AND iw_current.version=1 AND iw_current.group_id='grp_legacy_' || iw_current.platform_account_id
  AND (SELECT count(*) FROM account_group_memberships iw_initial WHERE iw_initial.platform_account_id=iw_current.platform_account_id AND iw_initial.version=1)=1)`;
}

function ownership(alias:string,ctx:Scope,createdAt:boolean):SQL {
 const group=logicalGroup(ctx),account=column(alias,'account_id'),storedGroup=column(alias,'group_id');
 const oldTime=createdAt?sql`(iw_history.left_at IS NULL OR (${trustedIso(column(alias,'created_at'))} <= ${trustedIso(sql`iw_history.left_at`)}))`:sql`true`;
 return sql`${column(alias,'user_id')}=${ctx.userId} AND (
  (${storedGroup}=${group} AND EXISTS (SELECT 1 FROM account_groups iw_owned WHERE iw_owned.id=${group} AND iw_owned.user_id=${ctx.userId}))
  OR (${storedGroup} IS NULL AND ${account} IS NOT NULL AND EXISTS (
   SELECT 1 FROM account_group_memberships iw_history
   JOIN platform_accounts iw_initial_account ON iw_initial_account.id=iw_history.platform_account_id AND iw_initial_account.user_id=iw_history.user_id
   JOIN account_groups iw_initial_group ON iw_initial_group.id=iw_history.group_id AND iw_initial_group.user_id=iw_history.user_id
   WHERE iw_history.user_id=${ctx.userId} AND iw_history.platform_account_id=${account} AND iw_history.version=1
    AND iw_history.group_id=${group} AND iw_history.group_id='grp_legacy_' || ${account}
    AND (SELECT count(*) FROM account_group_memberships iw_unique WHERE iw_unique.platform_account_id=${account} AND iw_unique.version=1)=1 AND ${oldTime}))
  OR (${bare(ctx)} AND ${account}=${ctx.accountId??null} AND (${storedGroup} IS NULL OR ${storedGroup}='grp_legacy_' || ${ctx.accountId??null}))
 )`;
}

function provenanceMarker(alias:string):SQL {
 const config=column(alias,'adapter_config');
 return sql`(${config}=jsonb_build_object('__creatorosProvenanceOnly',1,'originalExternalKey',${config}->>'originalExternalKey') AND jsonb_typeof(${config}->'originalExternalKey')='string')`;
}
function parent(table:string,parentAlias:string,relation:SQL,ctx:Scope,depth:number,evidence=false):SQL {
 return sql`EXISTS (SELECT 1 FROM ${sql.identifier(table)} ${sql.identifier(parentAlias)} WHERE ${relation} AND ${proof(table,parentAlias,ctx,depth,evidence)})`;
}
function sameOldAccount(child:string,owner:string):SQL {
 return sql`(${column(child,'group_id')} IS NOT NULL OR ${column(owner,'group_id')} IS NOT NULL OR ${column(child,'account_id')}=${column(owner,'account_id')})`;
}
function proof(table:string,alias:string,ctx:Scope,depth=0,evidence=false):SQL {
 const source=`iw_source_${depth}`,run=`iw_run_${depth}`,item=`iw_item_${depth}`,snapshot=`iw_snapshot_${depth}`,collection=`iw_collection_${depth}`,transform=`iw_transform_${depth}`;
 const itemParent=(key='item_id')=>parent('intelligence_items',item,sql`${column(item,'id')}=${column(alias,key)} AND ${sameOldAccount(alias,item)}`,ctx,depth+1);
 const sourceParent=(allowEvidence=false)=>parent('intelligence_sources',source,sql`${column(source,'id')}=${column(alias,'source_id')} AND ${sameOldAccount(alias,source)}`,ctx,depth+1,allowEvidence);
 const runParent=(allowEvidence=false)=>parent('intelligence_sync_runs',run,sql`${column(run,'id')}=${column(alias,'run_id')} AND ${column(run,'source_id')}=${column(alias,'source_id')} AND ${sameOldAccount(alias,run)}`,ctx,depth+1,allowEvidence);
 switch(table){
  case 'intelligence_item_transcripts':case 'intelligence_item_metric_snapshots':
   return sql`${ownership(alias,ctx,false)} AND ${itemParent()}`;
  case 'intelligence_source_collection_memberships':
   return sql`${ownership(alias,ctx,false)} AND ${sourceParent()} AND ${parent('intelligence_collections',collection,sql`${column(collection,'id')}=${column(alias,'collection_id')} AND ${sameOldAccount(alias,collection)}`,ctx,depth+1)}`;
  case 'intelligence_item_source_observations':
   return sql`${ownership(alias,ctx,false)} AND ${itemParent()} AND ${sourceParent()} AND ${runParent()}`;
  case 'intelligence_source_snapshots':
   // 裸旧端口仍保已存在的 item+snapshot 合同；真实账号/组必须证明 source/run 两父。
   return sql`${ownership(alias,ctx,false)} AND (${column(alias,'item_id')} IS NULL OR ${itemParent()}) AND (${bare(ctx)} OR (${sourceParent(true)} AND ${runParent(true)}))`;
  case 'intelligence_sync_run_events':
   return sql`${ownership(alias,ctx,false)} AND ${parent('intelligence_sync_runs',run,sql`${column(run,'id')}=${column(alias,'run_id')} AND ${sameOldAccount(alias,run)}`,ctx,depth+1)}`;
  case 'intelligence_sync_runs':
   return sql`${ownership(alias,ctx,true)} AND ${sourceParent(evidence)}`;
  case 'intelligence_transforms':
   return sql`${ownership(alias,ctx,true)} AND ${itemParent()} AND ${parent('intelligence_source_snapshots',snapshot,sql`${column(snapshot,'id')}=${column(alias,'source_snapshot_id')} AND ${column(snapshot,'item_id')}=${column(alias,'item_id')} AND ${sameOldAccount(alias,snapshot)}`,ctx,depth+1)}`;
  case 'project_intelligence_references':
   return sql`${ownership(alias,ctx,true)} AND ${itemParent()} AND ${parent('intelligence_transforms',transform,sql`${column(transform,'id')}=${column(alias,'transform_id')} AND ${column(transform,'item_id')}=${column(alias,'item_id')} AND ${column(transform,'source_snapshot_id')}=${column(alias,'source_snapshot_id')} AND ${column(transform,'target_topic_id')}=${column(alias,'topic_id')} AND ${sameOldAccount(alias,transform)}`,ctx,depth+1)}`;
  case 'intelligence_sources':
   return sql`${ownership(alias,ctx,true)} AND ${evidence?sql`true`:sql`NOT coalesce(${provenanceMarker(alias)},false)`}`;
  case 'intelligence_collections':case 'intelligence_items':
   return ownership(alias,ctx,true);
  default:throw new Error(`非内容表不能使用初始工作区兼容: ${table}`);
 }
}

export function isIntelligenceProvenanceOnly(config:unknown):boolean {
 if(!config||typeof config!=='object'||Array.isArray(config))return false;
 const value=config as Record<string,unknown>;
 return Object.keys(value).length===2&&value.__creatorosProvenanceOnly===1&&typeof value.originalExternalKey==='string';
}

/** 模块内根/关联证明；执行表、迁移 ledger 和其它领域不得调用此口。 */
export function intelligenceWorkspaceFilter(table:PgTable,ctx:Scope):SQL {
 return proof(getTableName(table),getTableName(table),ctx);
}

/** 引用先按自身根归属列出，再由项目端逐一证明全部父实体；不能把坏引用静默当空列表。 */
export function intelligenceReferenceRootFilter(table:PgTable,ctx:Scope):SQL {
 if(getTableName(table)!=='project_intelligence_references')throw new Error('根引用筛选仅用于项目引用完整性验证');
 return ownership(getTableName(table),ctx,true);
}

/** 防丢稿/纯进度只证明候选真实根和 item，不因坏 snapshot 自动解除旧保护；不返回正文授权。 */
export function intelligenceTransformGuardFilter(table:PgTable,ctx:Scope):SQL {
 if(getTableName(table)!=='intelligence_transforms')throw new Error('防丢守卫仅用于 transform');
 const alias=getTableName(table),item='iw_guard_item';
 return sql`${ownership(alias,ctx,true)} AND ${parent('intelligence_items',item,sql`${column(item,'id')}=${column(alias,'item_id')} AND ${sameOldAccount(alias,item)}`,ctx,1)}`;
}

export function uniqueIntelligenceRow<T>(rows:T[]):T|undefined {
 if(rows.length>1)throw new IntelligenceConflictError('旧内容与账号组内容存在重复归属，请保留原记录并检查诊断');
 return rows[0];
}

/** 锁顺序复用唯一 membership 端口；同组 NULL/canonical 查旧与 insert 共用组锁。 */
export async function withIntelligenceWrite<T>(db:Db,ctx:RequestContext,action:(tx:MembershipTransaction,frozen:FrozenWorkspace)=>Promise<T>):Promise<T> {
 const body=async(tx:MembershipTransaction)=>{
  const frozen=await lockWorkspaceMembership(tx,ctx);
  if(ctx.accountId){
   const [account]=await tx.select({id:platformAccounts.id}).from(platformAccounts).where(eq(platformAccounts.id,ctx.accountId));
   if(account&&(!frozen.groupId||frozen.membershipVersion===null))throw new OwnershipError('真实账号缺少有效账号组归属，请重新选择');
   if(account&&!ctx.groupId&&frozen.membershipVersion!==1)throw new OwnershipError('账号已转组，请通过账号组入口重新选择');
   if(account&&!ctx.groupId){
    const initial=await tx.select().from(accountGroupMemberships).where(and(eq(accountGroupMemberships.accountId,ctx.accountId),eq(accountGroupMemberships.version,1))).limit(2);
    if(initial.length!==1||initial[0]!.userId!==ctx.userId||initial[0]!.groupId!==frozen.groupId||initial[0]!.groupId!==`grp_legacy_${ctx.accountId}`||initial[0]!.leftAt!==null)throw new OwnershipError('初始账号组历史不唯一，请通过账号组入口检查归属');
   }
   if(account){const [owned]=await tx.select({id:platformAccounts.id}).from(platformAccounts).where(and(eq(platformAccounts.id,ctx.accountId),eq(platformAccounts.userId,ctx.userId)));if(!owned)throw new OwnershipError('账号不属于当前用户');}
  }
  return action(tx,frozen);
 };
 // 已绑定事务的领域服务不嵌套独立事务；仍在相同事务内取 membership/组锁。
 return typeof (db as unknown as {rollback?:unknown}).rollback==='function'?body(db as unknown as MembershipTransaction):db.transaction(body);
}
