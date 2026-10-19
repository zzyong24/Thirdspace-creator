import {and,eq,isNull,or,type SQL} from 'drizzle-orm';
import type {AnyPgColumn} from 'drizzle-orm/pg-core';
import type {RequestContext} from '@creatoros/contract';
import type {Db} from './db';
import {OwnershipError} from './errors';
import {workspaceFilter,workspaceKey} from './workspace-scope';
import {accountGroups,accountGroupMemberships} from './schema/account-groups';
import {platformAccounts} from './schema/platform-account';

/** 仅作品子树使用：输入必须来自同tx原项目服务授权，不是浏览器传入的归属。 */
export type WorkProjectFact={id:string;userId:string;groupId?:string|null;accountId:string|null;status:string};
export type WorkProjectAuthority={projectId:string;userId:string;groupId:string|null;accountId:string|null;status:string;legacyOrigin:{groupId:string;accountId:string}|null;newStamp:{groupId:string|null;accountId:string|null}};
export async function readWorkLegacyOrigin(ctx:RequestContext,parent:WorkProjectFact,tx:Db){
 if(!parent.groupId||!parent.accountId||parent.groupId!==`grp_legacy_${parent.accountId}`)return null;
 const [group]=await tx.select().from(accountGroups).where(and(eq(accountGroups.id,parent.groupId),eq(accountGroups.userId,ctx.userId)));
 const [account]=await tx.select().from(platformAccounts).where(and(eq(platformAccounts.id,parent.accountId),eq(platformAccounts.userId,ctx.userId)));
 const [member]=await tx.select().from(accountGroupMemberships).where(and(eq(accountGroupMemberships.userId,ctx.userId),eq(accountGroupMemberships.groupId,parent.groupId),eq(accountGroupMemberships.accountId,parent.accountId)));
 // 历史leftAt允许证明原来源；不把已迁账号的数据移动到新组，也不靠ID后缀单独授权。
 return group&&account&&member?{groupId:group.id,accountId:account.id}:null;
}
export function createWorkChildWorkspaceAuthority(ports:{readProject:(ctx:RequestContext,id:string,tx:Db,forUpdate?:boolean)=>Promise<WorkProjectFact>;readLegacyOrigin:typeof readWorkLegacyOrigin}){
 return {async authorizeProject(ctx:RequestContext,projectId:string,tx:Db,forUpdate=false):Promise<WorkProjectAuthority>{
  workspaceKey(ctx);
  const parent=await ports.readProject(ctx,projectId,tx,forUpdate);
  if(!parent||parent.id!==projectId||parent.userId!==ctx.userId)throw new OwnershipError('原父项目不存在');
  const legacyOrigin=await ports.readLegacyOrigin(ctx,parent,tx);
  return {projectId:parent.id,userId:parent.userId,groupId:parent.groupId??null,accountId:parent.accountId,status:parent.status,legacyOrigin,newStamp:{groupId:parent.groupId??null,accountId:ctx.groupId?null:(ctx.accountId??null)}};
 }};
}
type ChildColumns={userId:AnyPgColumn;groupId:AnyPgColumn;accountId:AnyPgColumn};
/** SEMANTIC_BOUNDARY_ALLOW: 真实父FK、用户和原legacy来源的机械身份比较，不做内容选择。 */
function childWhere(table:ChildColumns,ctx:RequestContext,parent:WorkProjectAuthority,fk:AnyPgColumn,id:string|null):SQL{
 if(parent.userId!==ctx.userId)throw new OwnershipError('原父项目不可见');
 const legacy=parent.legacyOrigin;
 const bridge=ctx.groupId&&parent.groupId===ctx.groupId&&legacy?.groupId===ctx.groupId?and(isNull(table.groupId),eq(table.accountId,legacy.accountId)):undefined;
 return and(eq(table.userId,ctx.userId),(id===null?isNull(fk):eq(fk,id)),or(workspaceFilter(table,ctx),bridge))!;
}
export function projectChildWhere(table:ChildColumns&{projectId:AnyPgColumn},ctx:RequestContext,parent:WorkProjectAuthority){return childWhere(table,ctx,parent,table.projectId,parent.projectId);}
export function compositionChildWhere(table:ChildColumns&{compositionId:AnyPgColumn},ctx:RequestContext,parent:WorkProjectAuthority,compositionId:string|null){return childWhere(table,ctx,parent,table.compositionId,compositionId);}
