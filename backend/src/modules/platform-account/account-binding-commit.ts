import {and,eq,sql,type Db} from '@creatoros/backend';
import type {RequestContext} from '@creatoros/contract';
import {platformAccounts} from './platform-account.db-schema';
import {createPlatformAccountService} from './platform-account.service';
import {createAccountGroupService} from './account-group.service';
import {ConflictError,ValidationError} from './platform-account.errors';
type Tx=Parameters<Parameters<Db['transaction']>[0]>[0];
type Identity={externalAccountId:string;accountHandle:string;followerBaseline?:number};
export interface AccountBindingPreparedPlan {readonly accountId:string;readonly existing:boolean;readonly userId:string;readonly groupId:string;readonly externalAccountId:string;}
async function validateKnown(ctx:RequestContext,known:typeof platformAccounts.$inferSelect,db:Db,now:()=>string,nextId:(prefix:string)=>string,tx?:Tx){
 const member=await createAccountGroupService({db,now,nextId}).forAccount(ctx,known.id,tx,!!tx);
 if(member.groupId!==ctx.groupId)throw new ConflictError('这个抖音账号已归属其它账号组，请先明确转组');
 if(known.status!=='active')throw new ConflictError('请先恢复此账号，再更新登录态');
}
/** 只预读稳定平台ID并分配真实内部ID；准备期间不插入账号或成员。 */
export function createAccountBindingPreparer(ports:{db:Db;now:()=>string;nextId:(prefix:string)=>string}){
 return async(ctx:RequestContext,identity:Identity):Promise<AccountBindingPreparedPlan>=>{
  if(!ctx.groupId||!identity.externalAccountId.trim()||!identity.accountHandle.trim())throw new ValidationError('平台身份或目标账号组不完整');
  const [known]=await ports.db.select().from(platformAccounts).where(and(eq(platformAccounts.userId,ctx.userId),eq(platformAccounts.platform,'douyin'),eq(platformAccounts.externalAccountId,identity.externalAccountId)));
  if(known)await validateKnown(ctx,known,ports.db,ports.now,ports.nextId);
  return {accountId:known?.id??ports.nextId('acct'),existing:!!known,userId:ctx.userId,groupId:ctx.groupId,externalAccountId:identity.externalAccountId};
 };
}
/** 扫码只按平台稳定ID确认；同名不合并，已在别组的真实账号必须显式转组。 */
export function createAccountBindingCommitter(ports:{now:()=>string;nextId:(prefix:string)=>string;prepareProfile:(ctx:RequestContext,input:{stagingKey:string;accountId:string;signal:AbortSignal},accountReader:(ctx:RequestContext,id:string)=>Promise<{id:string;userId:string;platform:string}>)=>Promise<{rollbackProfile:()=>Promise<void>;finalizeProfile:()=>Promise<void>}>}){
 return async(ctx:RequestContext,input:{stagingKey:string;identity:Identity;signal:AbortSignal;prepared:AccountBindingPreparedPlan},tx:Tx)=>{
  input.signal.throwIfAborted();const identity=input.identity,plan=input.prepared;
  if(!plan||!plan.accountId||plan.userId!==ctx.userId||plan.groupId!==ctx.groupId||plan.externalAccountId!==identity.externalAccountId)throw new ConflictError('绑定准备与原用户、账号组或身份不符');
  if(!identity.externalAccountId.trim()||!identity.accountHandle.trim())throw new ValidationError('平台身份不完整');
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${ctx.userId+':douyin:'+identity.externalAccountId},1022))`);
  const [known]=await tx.select().from(platformAccounts).where(and(eq(platformAccounts.userId,ctx.userId),eq(platformAccounts.platform,'douyin'),eq(platformAccounts.externalAccountId,identity.externalAccountId))).for('update');
  if(!!known!==plan.existing||(known&&known.id!==plan.accountId))throw new ConflictError('平台身份归属已改变，请重新发起绑定');
  let assigned=false;const service=createPlatformAccountService({db:tx as unknown as Db,now:ports.now,nextId:prefix=>{if(prefix==='acct'&&!assigned){assigned=true;return plan.accountId;}return ports.nextId(prefix);}});
  let account;
  if(known){
   await validateKnown(ctx,known,tx as unknown as Db,ports.now,ports.nextId,tx);
   account=await service.updateAccount(ctx,known.id,{accountHandle:identity.accountHandle,...(identity.followerBaseline!==undefined?{followerBaseline:identity.followerBaseline}:{})});
  }else account=await service.createAccount(ctx,{platform:'douyin',accountHandle:identity.accountHandle,externalAccountId:identity.externalAccountId,followerBaseline:identity.followerBaseline});
  input.signal.throwIfAborted();const receipt=await ports.prepareProfile(ctx,{stagingKey:input.stagingKey,accountId:account.id,signal:input.signal},(c,id)=>service.getAccount(c,id));
  return {accountId:account.id,...receipt};
 };
}
