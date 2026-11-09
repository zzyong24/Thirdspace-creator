import {and,desc,eq,inArray,sql} from 'drizzle-orm';
import {executionTasks} from '@creatoros/backend';
import type {Db} from '../../db';
import {platformAccounts} from '../../schema/platform-account';
import {accountGroupBindingStatusResource,iso8601,type AccountBindingStatusItem,type AccountGroupBindingStatusResource,type AccountGroupResource,type RequestContext} from '@creatoros/contract';
import {OwnershipError} from './platform-account.errors';

export type AccountLoginObservation=Pick<AccountBindingStatusItem,'accountId'|'loginState'|'checkedAt'|'reasonCode'>;
export interface AccountBindingStatusService {read(ctx:RequestContext,groupId:string):Promise<AccountGroupBindingStatusResource>}
const record=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};

/** 账号模块只投影自己拥有的扫码记录；其它平台事实仍经原owner的只读端口。 */
export function createAccountBindingStatusService(deps:{
 db:Db;now:()=>string;
 readGroup(ctx:RequestContext,groupId:string):Promise<AccountGroupResource>;
 readCollectionObservations?:(ctx:RequestContext,accountIds:readonly string[])=>Promise<readonly AccountLoginObservation[]>;
}):AccountBindingStatusService{
 return {async read(ctx,groupId){
  const group=await deps.readGroup(ctx,groupId);
  if(group.id!==groupId||group.userId!==ctx.userId)throw new OwnershipError('账号组不存在');
  const members=group.members.filter(member=>member.leftAt===null),ids=[...new Set(members.map(member=>member.accountId))];
  if(!ids.length)return {groupId,accounts:[]};
  const rows=await deps.db.select().from(platformAccounts).where(and(eq(platformAccounts.userId,ctx.userId),inArray(platformAccounts.id,ids)));
  const byId=new Map(rows.map(account=>[account.id,account]));
  const items:AccountBindingStatusItem[]=members.map(member=>{
   const account=byId.get(member.accountId);
   const bindingState=!account||account.platform!==member.platform?'unavailable':member.status==='archived'||account.status==='archived'?'hidden':account.externalAccountId?'bound':'unverified';
   return {accountId:member.accountId,platform:member.platform,accountHandle:account?.accountHandle??member.accountHandle,bindingState,loginState:'unknown',checkedAt:null,reasonCode:null};
  });
  const bound=items.filter(item=>item.bindingState==='bound'),boundIds=bound.map(item=>item.accountId);
  if(!boundIds.length)return accountGroupBindingStatusResource.parse({groupId,accounts:items});
  const accountKey=sql<string>`${executionTasks.checkpoint}->>'accountId'`;
  const [proofs,observations]=await Promise.all([
   // account_binding是本模块拥有的kind；不读取任务正文或其它组历史。
   deps.db.selectDistinctOn([accountKey],{accountId:accountKey,payload:executionTasks.payload,checkpoint:executionTasks.checkpoint,updatedAt:executionTasks.updatedAt})
    .from(executionTasks).where(and(eq(executionTasks.userId,ctx.userId),eq(executionTasks.groupId,groupId),eq(executionTasks.kind,'account_binding'),eq(executionTasks.status,'succeeded'),inArray(accountKey,boundIds)))
    .orderBy(accountKey,desc(executionTasks.updatedAt),desc(executionTasks.id)),
   deps.readCollectionObservations?.({...ctx,groupId,accountId:null},boundIds)??Promise.resolve([]),
  ]);
  const latest=new Map<string,AccountLoginObservation>(),allowed=new Set(boundIds),now=Date.parse(deps.now());
  // SEMANTIC_BOUNDARY_ALLOW: 只按账号ID、协议状态与真实观测时间选最近资源证据，不判断内容语义。
  const observe=(value:AccountLoginObservation)=>{
   if(!allowed.has(value.accountId)||!value.checkedAt||!iso8601.safeParse(value.checkedAt).success)return;
   const time=Date.parse(value.checkedAt);if(!Number.isFinite(time)||time>now)return;
   if(value.loginState!=='verified'&&value.loginState!=='needs_login')return;
   if(value.loginState==='verified'&&value.reasonCode!==null)return;
   if(value.loginState==='needs_login'&&!['expired','revoked','needs_auth'].includes(value.reasonCode??''))return;
   const prior=latest.get(value.accountId),before=prior?.checkedAt?Date.parse(prior.checkedAt):-Infinity;
   if(time>before||(time===before&&value.loginState==='needs_login'))latest.set(value.accountId,{...value,checkedAt:new Date(time).toISOString()});
  };
  for(const proof of proofs){
   const account=byId.get(proof.accountId),payload=record(proof.payload),checkpoint=record(proof.checkpoint);
   if(account&&payload.groupId===groupId&&payload.platform===account.platform&&checkpoint.externalAccountId===account.externalAccountId)
    observe({accountId:account.id,loginState:'verified',checkedAt:proof.updatedAt,reasonCode:null});
  }
  for(const value of observations)observe(value);
  return accountGroupBindingStatusResource.parse({groupId,accounts:items.map(item=>({...item,...latest.get(item.accountId)}))});
 }};
}
