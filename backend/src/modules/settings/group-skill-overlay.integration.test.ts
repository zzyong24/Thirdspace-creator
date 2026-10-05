import {afterEach,expect,it} from 'vitest';
import {createDb} from '../../db';
import {createSettingsRepository} from './settings.repository';
import {createAccountGroupService} from '../platform-account/account-group.service';
let store:Awaited<ReturnType<typeof createDb>>;afterEach(async()=>store?.client.close());
it('空组Skill增量独立保存、重读、版本追加，另一组不可读且归档不能写',async()=>{
 store=await createDb();let n=0;const deps={now:()=>new Date().toISOString(),nextId:(s:string)=>s+'-'+ ++n};const ctx={userId:'skill-owner',source:'user' as const,requestId:'skill'};const groups=createAccountGroupService({db:store.db,...deps});const a=await groups.create(ctx,{name:'甲',idempotencyKey:'a'});const b=await groups.create(ctx,{name:'乙',idempotencyKey:'b'});const repo=createSettingsRepository(store.db,deps);const scope={...ctx,groupId:a.id};
 const row=await repo.putAccountSkillOverlay(scope,{skillId:'script',expectedRevision:null,observedBaseVersion:'official-1',overlay:{system:'只属于甲'}});
 expect(row.accountId).toBeNull();expect(row.groupId).toBe(a.id);
 expect((await repo.listAccountSkillOverlays(scope))[0]?.overlay).toEqual({system:'只属于甲'});
 expect(await repo.listAccountSkillOverlays({...ctx,groupId:b.id})).toEqual([]);
 expect((await repo.listAccountSkillOverlayVersions(scope,'script'))[0]?.groupId).toBe(a.id);
 await groups.archive(ctx,a.id,a.version);
 await expect(repo.putAccountSkillOverlay(scope,{skillId:'script',expectedRevision:1,observedBaseVersion:'official-1',overlay:{}})).rejects.toThrow();
});
