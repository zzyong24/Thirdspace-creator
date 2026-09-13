import {afterEach,expect,it} from 'vitest';
import {createDb} from '@creatoros/backend';
import {createPublicationSyncService} from './sync-state.service';
const close:Array<()=>Promise<unknown>>=[];afterEach(async()=>{for(const c of close.splice(0))await c();});
const ctx={userId:'u',accountId:'a',requestId:'r',source:'user' as const};
it('0条结果成功、失败保留水位、跨账号隔离、重建服务恢复持久水位',async()=>{
 const f=await createDb();close.push(()=>f.client.close());let stamp='2026-09-13T00:00:00Z';const ports={now:()=>stamp,assertPublication:async(c:typeof ctx,id:string)=>{if(c.accountId!=='a'||id!=='p')throw Error('ownership');return {externalId:'v',publishedAt:'2026-09-12T00:00:00Z'};}};
 const service=createPublicationSyncService(f.db,ports as never);expect(await service.due(ctx,'p','comments')).toBe(true);
 await service.settle(ctx,'p','comments',{success:true});expect(await service.due(ctx,'p','comments')).toBe(false);
 stamp='2026-09-13T02:00:00Z';expect(await service.due(ctx,'p','comments')).toBe(true);await service.settle(ctx,'p','comments',{success:false,error:'截断'});
 expect((await service.read(ctx,'p','comments'))?.lastSucceededAt).toBe('2026-09-13T00:00:00Z');expect(await service.due(ctx,'p','comments')).toBe(false);
 stamp='2026-09-13T02:15:00Z';expect(await createPublicationSyncService(f.db,ports as never).due(ctx,'p','comments')).toBe(true);
 expect(await service.read({...ctx,accountId:'other'},'p','comments')).toBeUndefined();await expect(service.settle({...ctx,accountId:'other'},'p','comments',{success:true})).rejects.toThrow('ownership');
});
