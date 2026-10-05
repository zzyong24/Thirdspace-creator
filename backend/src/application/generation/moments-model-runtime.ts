import type {Db} from '@creatoros/backend';
import {createSettingsRepository} from '../../modules/settings';
import {createEffectiveSkillSnapshotResolver,requiredSkillIdsForTask,type OfficialSkillProvider} from '../../modules/ai-runtime';
import type {RequestContext} from '@creatoros/contract';
/** 原runtime同tx读取账号overlay；原task保留原requiredSkill映射，新task明确唯一Skill。 */
export function createMomentsRuntime(tx:Db,deps:{now:()=>string;nextId:(p:string)=>string;officialSkills:OfficialSkillProvider;readPinnedAuthority:(ctx:RequestContext,tx:Db)=>Promise<{authority:'local'|'channel-managed';digest:string}>}){const settings=createSettingsRepository(tx,deps),resolve=createEffectiveSkillSnapshotResolver({officialSkills:deps.officialSkills,accountOverlays:{listBySkillIds:(c,ids)=>settings.listAccountSkillOverlays(c,ids)},now:deps.now});return async(ctx:RequestContext,type:string,input:Readonly<Record<string,unknown>>)=>{const ids=type==='moments.draft'?['moments.compose']:requiredSkillIdsForTask(type,input),authority=await deps.readPinnedAuthority(ctx,tx);return{skillSnapshot:await resolve(ctx,ids),modelAuthority:authority.authority,modelAuthorityDigest:authority.digest};};}
