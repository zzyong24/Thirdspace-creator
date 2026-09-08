import path from 'node:path';
import {eq,platformAccounts,type Db} from '@creatoros/backend';
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
