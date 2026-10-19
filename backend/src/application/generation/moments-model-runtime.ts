import type {Db} from '@creatoros/backend';
import {createSettingsRepository} from '../../modules/settings';
import {createEffectiveSkillSnapshotResolver,requiredSkillIdsForTask,type OfficialSkillProvider} from '../../modules/ai-runtime';
import type {RequestContext} from '@creatoros/contract';
import {createExecutionRoute} from '@creatoros/contract/execution-worker';
/** 原runtime同tx读取账号overlay；原task保留原requiredSkill映射，新task明确唯一Skill。 */
export function createMomentsRuntime(tx:Db,deps:{now:()=>string;nextId:(p:string)=>string;officialSkills:OfficialSkillProvider;readPinnedAuthority:(ctx:RequestContext,tx:Db)=>Promise<{authority:'local'|'channel-managed';digest:string}>}){
 const settings=createSettingsRepository(tx,deps),resolve=createEffectiveSkillSnapshotResolver({officialSkills:deps.officialSkills,groupOverlays:{listBySkillIds:(c,ids)=>settings.listAccountSkillOverlays(c,ids)},accountOverlays:{listBySkillIds:(c,ids)=>settings.listAccountSkillOverlays(c,ids)},now:deps.now});
 return async(ctx:RequestContext,type:string,input:Readonly<Record<string,unknown>>)=>{
  const preference=await settings.getPreferences(ctx),executionRoute=createExecutionRoute(preference?.assistantExecutionEngine==='codex'?'codex':'pi');
  const ids=type==='moments.draft'?['moments.compose']:requiredSkillIdsForTask(type,input),skillSnapshot=await resolve(ctx,ids);
  if(executionRoute.engine==='codex')return {skillSnapshot,executionRoute};
  const authority=await deps.readPinnedAuthority(ctx,tx);
  return {skillSnapshot,executionRoute,modelAuthority:authority.authority,modelAuthorityDigest:authority.digest};
 };
}
