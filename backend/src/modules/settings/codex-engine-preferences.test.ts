import {expect,it} from 'vitest';
import {createDb} from '@creatoros/backend';
import {createSettingsRepository} from './settings.repository';
import {createSettingsService} from './settings.service';
it('T1238 引擎服务持久化、用户隔离与空值迁移保护',async()=>{
 const {db,client}=await createDb();const deps={now:()=>new Date().toISOString(),nextId:(p:string)=>`${p}-codex`};
 const repo=createSettingsRepository(db,deps);
 const svc=createSettingsService(()=>repo,async()=>null as never,async()=>null as never,undefined,undefined,async(c,write)=>db.transaction(async tx=>write(createSettingsRepository(tx as never,deps))));
 const ctx={userId:'engine-a',accountId:null,requestId:'engine',source:'user' as const};
 try{
  expect((await svc.getPreferences(ctx)).assistantExecutionEngine).toBeNull();
  expect((await svc.updatePreferences(ctx,{assistantExecutionEngine:'codex'})).assistantExecutionEngine).toBe('codex');
  expect((await svc.getPreferences({...ctx,userId:'engine-b'})).assistantExecutionEngine).toBeNull();
  await expect(svc.patchPreferencesIfUnchanged(ctx,{assistantExecutionEngine:'pi'},{assistantExecutionEngine:null})).rejects.toThrow();
  expect((await svc.getPreferences(ctx)).assistantExecutionEngine).toBe('codex');
 }finally{await client.close();}
});
