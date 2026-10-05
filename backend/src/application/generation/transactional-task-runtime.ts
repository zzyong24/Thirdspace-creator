import type {Db} from '@creatoros/backend';
import type {RequestContext} from '@creatoros/contract';
import {createSettingsRepository,type RepoDeps} from '@creatoros/backend/modules/settings';
import {createEffectiveSkillSnapshotResolver,requiredSkillIdsForTask,type OfficialSkillProvider} from '@creatoros/backend/modules/ai-runtime';
export interface TransactionalTaskRuntimeDeps extends RepoDeps {
 officialSkills:OfficialSkillProvider;
 /** 复用根原pinModelAuthority/readChannelModelAuthority；若内部读PG必须绑定tx，不能捕获root repository。 */
 readPinnedAuthority(ctx:RequestContext,tx:Db):Promise<{authority:'local'|'channel-managed';digest:string}>;
}
/** 组合根绑定helper：同一AI事务读取真实账号Skill overlay，不借root DB连接。 */
export function createTransactionalTaskRuntimeResolver(tx:Db,deps:TransactionalTaskRuntimeDeps){
 const settings=createSettingsRepository(tx,deps);
 const resolve=createEffectiveSkillSnapshotResolver({officialSkills:deps.officialSkills,groupOverlays:{listBySkillIds:(ctx,ids)=>settings.listAccountSkillOverlays(ctx,ids)},accountOverlays:{listBySkillIds:(ctx,ids)=>settings.listAccountSkillOverlays(ctx,ids)},now:deps.now});
 return async(ctx:RequestContext,taskType:string,inputData:Readonly<Record<string,unknown>>):Promise<Record<string,unknown>>=>{
  if(taskType==='benchmark.transcribe')return{}; // 原纯ASR协议不申请文本Skill。
  const required=requiredSkillIdsForTask(taskType,inputData),authority=await deps.readPinnedAuthority(ctx,tx);
  return{skillSnapshot:await resolve(ctx,required),modelAuthority:authority.authority,modelAuthorityDigest:authority.digest};
 };
}
