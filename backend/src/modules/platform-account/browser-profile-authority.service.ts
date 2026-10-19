import path from 'node:path';
import {createHash} from 'node:crypto';
import type {RequestContext} from '@creatoros/contract';
import {and,eq,platformAccounts,executionTasks,type Db} from '@creatoros/backend';
import {resolveDouyinProfileIdentity} from '@creatoros/ai-worker/browser/profile-directory';

/** 宿主账号目录归属：真实账号查当前登记；尚未完成绑定的目录必须由当前请求显式登记。 */
export function createBrowserProfileAuthority(db:Db,base:string,options?:{localPlatformRoot?:string}){
 const temporaryOwners=new Map<string,string>();
 type LocalPlatform='xiaohongshu'|'kuaishou'|'wechatOfficial'|'wechatVideo';
 const localDomains:Record<LocalPlatform,string>={xiaohongshu:'creator.xiaohongshu.com',kuaishou:'cp.kuaishou.com',wechatOfficial:'mp.weixin.qq.com',wechatVideo:'channels.weixin.qq.com'};
 type LocalOwner={userId:string;groupId:string|null;platform:LocalPlatform;segment:string;runId?:string;accountId?:string;externalAccountId?:string};
 const localOwners=new Map<string,LocalOwner>();
 const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
 const isLocal=(value:unknown):value is LocalPlatform=>value==='xiaohongshu'||value==='kuaishou'||value==='wechatOfficial'||value==='wechatVideo';
 async function localIdentity(owner:LocalOwner,signal?:AbortSignal){
  if(!options?.localPlatformRoot)throw Error('本地平台登录目录未配置');
  const root=path.join(options.localPlatformRoot,owner.platform,hash(owner.userId),'accounts');
  return {...await resolveDouyinProfileIdentity(root,owner.segment,signal),userId:owner.userId,domain:localDomains[owner.platform]};
 }
 async function registerLocal(owner:LocalOwner){const identity=await localIdentity(owner);localOwners.set(identity.authDir,owner);return identity;}
 async function authorizeTemporary(userId:string,segment:string){
  if(!userId || !(segment==='_default'||/^_staging-[a-f0-9]{16}$/.test(segment)))throw new Error('临时登录目录授权无效');
  const owner=temporaryOwners.get(segment);
  if(owner && owner!==userId)throw new Error('临时登录目录属于其他用户');
  temporaryOwners.set(segment,userId);
  return resolveDouyinProfileIdentity(base,segment);
 }
 return {
  authorizeTemporary,
  async authorizeBindingStaging(ctx:RequestContext,runId:string,stagingKey:string){
   const [task]=await db.select().from(executionTasks).where(and(eq(executionTasks.id,runId),eq(executionTasks.userId,ctx.userId),eq(executionTasks.kind,'account_binding')));
   const expected=createHash('sha256').update(JSON.stringify([ctx.userId,runId])).digest('hex').slice(0,16);
   if(!task||task.groupId!==ctx.groupId||expected!==stagingKey)throw new Error('临时目录缺少原绑定任务证明');
   const platform=(task.payload as {platform?:string}).platform;
   if(isLocal(platform))return registerLocal({userId:ctx.userId,groupId:ctx.groupId??null,platform,segment:`_staging-${stagingKey}`,runId});
   if(platform!=='douyin')throw Error('绑定平台未提供登录目录授权');
   return authorizeTemporary(ctx.userId,`_staging-${stagingKey}`);
  },
  async authorizeBindingTarget(ctx:RequestContext,accountId:string,readAccount:(ctx:RequestContext,id:string)=>Promise<{id:string;userId:string;platform:string;externalAccountId?:string|null}>){
   const account=await readAccount(ctx,accountId);
   if(account.id!==accountId||account.userId!==ctx.userId)throw new Error('绑定目标目录没有真实账号归属');
   if(isLocal(account.platform)){if(!account.externalAccountId)throw Error('绑定目标缺少真实平台身份');return registerLocal({userId:ctx.userId,groupId:ctx.groupId??null,platform:account.platform,segment:hash(account.externalAccountId),accountId,externalAccountId:account.externalAccountId});}
   if(account.platform!=='douyin')throw new Error('绑定目标目录没有真实账号归属');
   temporaryOwners.set(accountId,ctx.userId);return resolveDouyinProfileIdentity(base,accountId);
  },
  async authorizeBindingRecoveryTarget(ctx:RequestContext,input:{runId:string;stagingKey:string;accountId?:string}){
   const [task]=await db.select().from(executionTasks).where(and(eq(executionTasks.id,input.runId),eq(executionTasks.userId,ctx.userId),eq(executionTasks.kind,'account_binding')));
   if(!task||task.groupId!==ctx.groupId||(task.checkpoint as {stagingKey?:string})?.stagingKey!==input.stagingKey||!['running','cancel_requested'].includes(task.status))throw new Error('恢复登录目录缺少原绑定任务证明');
   const platform=(task.payload as {platform?:string}).platform;
   if(isLocal(platform)){const externalAccountId=(task.checkpoint as {externalAccountId?:string}).externalAccountId;if(!externalAccountId)throw Error('恢复目录缺少原任务真实身份');return registerLocal({userId:ctx.userId,groupId:ctx.groupId??null,platform,segment:hash(externalAccountId),runId:input.runId,externalAccountId});}
   if(platform!=='douyin'||!input.accountId)throw Error('恢复目标缺少真实账号标识');
   const [account]=await db.select().from(platformAccounts).where(eq(platformAccounts.id,input.accountId));
   if(account&&(account.userId!==ctx.userId||account.platform!=='douyin'))throw new Error('恢复目标目录属于其它账号');
   temporaryOwners.set(input.accountId,ctx.userId);return resolveDouyinProfileIdentity(base,input.accountId);
  },
  forgetTemporary(segment:string){temporaryOwners.delete(segment);localOwners.delete(segment);},
  async resolveProfile(authDir:string,signal?:AbortSignal){
   const local=localOwners.get(authDir);
   if(local){
    if(local.accountId){const [account]=await db.select().from(platformAccounts).where(eq(platformAccounts.id,local.accountId));if(!account||account.userId!==local.userId||account.platform!==local.platform||account.externalAccountId!==local.externalAccountId||account.status!=='active')throw Error('登录目录缺少当前真实平台账号');}
    else {const [task]=await db.select().from(executionTasks).where(and(eq(executionTasks.id,local.runId!),eq(executionTasks.userId,local.userId),eq(executionTasks.kind,'account_binding')));if(!task||task.groupId!==local.groupId||(task.payload as {platform?:string}).platform!==local.platform)throw Error('登录目录缺少原任务归属');const state=task.checkpoint as {externalAccountId?:string};if(local.externalAccountId&&state.externalAccountId!==local.externalAccountId)throw Error('登录目录的原身份已改变');}
    const identity=await localIdentity(local,signal);if(identity.authDir!==authDir)throw Error('登录目录与原授权不符');signal?.throwIfAborted();return identity;
   }
   const segment=path.basename(authDir),identity=await resolveDouyinProfileIdentity(base,segment,signal);
   const normalize=(value:string)=>process.platform==='win32'?path.resolve(value).toLowerCase():path.resolve(value);
   // 同时允许已配置根目录为别名；不能仅凭 basename 接受另一个目录。
   if(normalize(authDir)!==normalize(identity.authDir)&&normalize(authDir)!==normalize(path.join(base,segment)))throw new Error('登录目录不在当前资源根');
   let userId=temporaryOwners.get(segment);
   if(!userId){const [account]=await db.select({userId:platformAccounts.userId,platform:platformAccounts.platform}).from(platformAccounts).where(eq(platformAccounts.id,segment));if(account?.platform!=='douyin')throw new Error('登录目录缺少真实抖音账号');userId=account.userId;}
   signal?.throwIfAborted();return {...identity,userId};
  },
 };
}
