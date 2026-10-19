import {and,eq,or,isNull,type SQL} from "drizzle-orm";
import type {AnyPgColumn} from "drizzle-orm/pg-core";
import type {RequestContext} from "@creatoros/contract";
import type {Db} from "./db";
import {OwnershipError,ConflictError,requireAccountId} from "./errors";
import {accountGroups,accountGroupMemberships} from "./schema/account-groups";
export type WorkspaceKey={kind:"group"|"legacy-account";id:string};
export function workspaceKey(ctx:Pick<RequestContext,"groupId"|"accountId">):WorkspaceKey{
 if(ctx.groupId)return {kind:"group",id:ctx.groupId};
 return {kind:"legacy-account",id:requireAccountId(ctx.accountId,"legacy workspace")};
}
export function requireWorkspace(ctx:Pick<RequestContext,"groupId"|"accountId">):void{workspaceKey(ctx);}
export function workspaceFilter(table:{groupId:AnyPgColumn;accountId:AnyPgColumn},scope:WorkspaceKey|Pick<RequestContext,"groupId"|"accountId">|string):SQL{
 const key=typeof scope==="string"?{kind:"legacy-account" as const,id:scope}:"kind" in scope?scope:workspaceKey(scope);
 return key.kind==="group"?eq(table.groupId,key.id):and(eq(table.accountId,key.id),or(isNull(table.groupId),eq(table.groupId,`grp_legacy_${key.id}`)))!;
}
export function workspaceStamp(scope:WorkspaceKey|Pick<RequestContext,"groupId"|"accountId">|string):{groupId:string|null;accountId:string|null}{
 if(typeof scope==="string")return {groupId:null,accountId:requireAccountId(scope)};
 if("kind" in scope)return scope.kind==="group"?{groupId:scope.id,accountId:null}:{groupId:null,accountId:scope.id};
 requireWorkspace(scope);return {groupId:scope.groupId??null,accountId:scope.accountId??null};
}
export async function assertWritableWorkspace(db:Db,ctx:RequestContext,options:{allowArchived?:boolean}={}){
 requireWorkspace(ctx);
 let groupId=ctx.groupId;
 if(!groupId){
  const [member]=await db.select().from(accountGroupMemberships).where(and(eq(accountGroupMemberships.userId,ctx.userId),eq(accountGroupMemberships.accountId,ctx.accountId!),isNull(accountGroupMemberships.leftAt)));
  if(!member)return; // 迁移前来源记录；不造账号或扩大数据。
  if(member.groupId!==`grp_legacy_${ctx.accountId}`)throw new ConflictError("账号已归入新工作区，请升级客户端并选择账号组");
  groupId=member.groupId;
 }
 const [group]=await db.select({id:accountGroups.id}).from(accountGroups).where(and(eq(accountGroups.id,groupId),eq(accountGroups.userId,ctx.userId),options.allowArchived?undefined:eq(accountGroups.status,"active")));
 if(!group)throw new OwnershipError("账号组不可用，请重新选择");
}

/** 平台事实按冻结组读取，可进一步筛选真实平台账号；创作数据不消费该筛选。 */
export function factFilter(table:{groupId:AnyPgColumn;accountId:AnyPgColumn},scope:WorkspaceKey|Pick<RequestContext,"groupId"|"accountId">|string):SQL{
 if(typeof scope==="string"||"kind" in scope)return workspaceFilter(table,scope);
 const group=workspaceFilter(table,scope);
 return scope.groupId&&scope.accountId?and(group,eq(table.accountId,scope.accountId))!:group;
}
