import path from 'node:path';
import {createHash} from 'node:crypto';
import type {RequestContext} from '@creatoros/contract';
import {and,eq,platformAccounts,executionTasks,type Db} from '@creatoros/backend';
import {resolveDouyinProfileIdentity} from '@creatoros/ai-worker/browser/profile-directory';

/** 宿主账号目录归属：真实账号查当前登记；尚未完成绑定的目录必须由当前请求显式登记。 */
export function createBrowserProfileAuthority(db:Db,base:string){
 const temporaryOwners=new Map<string,string>();
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
   return authorizeTemporary(ctx.userId,`_staging-${stagingKey}`);
  },
  async authorizeBindingTarget(ctx:RequestContext,accountId:string,readAccount:(ctx:RequestContext,id:string)=>Promise<{id:string;userId:string;platform:string}>){
   const account=await readAccount(ctx,accountId);
   if(account.id!==accountId||account.userId!==ctx.userId||account.platform!=='douyin')throw new Error('绑定目标目录没有真实账号归属');
   temporaryOwners.set(accountId,ctx.userId);return resolveDouyinProfileIdentity(base,accountId);
  },
  async authorizeBindingRecoveryTarget(ctx:RequestContext,input:{runId:string;stagingKey:string;accountId:string}){
   const [task]=await db.select().from(executionTasks).where(and(eq(executionTasks.id,input.runId),eq(executionTasks.userId,ctx.userId),eq(executionTasks.kind,'account_binding')));
   if(!task||task.groupId!==ctx.groupId||(task.checkpoint as {stagingKey?:string})?.stagingKey!==input.stagingKey||!['running','cancel_requested'].includes(task.status))throw new Error('恢复登录目录缺少原绑定任务证明');
   const [account]=await db.select().from(platformAccounts).where(eq(platformAccounts.id,input.accountId));
   if(account&&(account.userId!==ctx.userId||account.platform!=='douyin'))throw new Error('恢复目标目录属于其它账号');
   temporaryOwners.set(input.accountId,ctx.userId);return resolveDouyinProfileIdentity(base,input.accountId);
  },
  forgetTemporary(segment:string){temporaryOwners.delete(segment);},
  async resolveProfile(authDir:string,signal?:AbortSignal){
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
