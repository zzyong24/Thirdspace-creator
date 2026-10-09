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

it('T1106 持久老作品指标跨日到期，其他能力保持24小时且失败退避不绕过',async()=>{
 const f=await createDb();close.push(()=>f.client.close());
 let stamp='2026-09-12T01:01:00Z';
 const ports={now:()=>stamp,assertPublication:async(c:typeof ctx,id:string)=>{
  if(c.accountId!=='a'||id!=='p')throw Error('ownership');
  return {externalId:'v',publishedAt:'2026-01-01T00:00:00Z'};
 }};
 const service=createPublicationSyncService(f.db,ports as never);
 await service.settle(ctx,'p','metrics',{success:true});
 await service.settle(ctx,'p','comments',{success:true});
 expect(await service.due(ctx,'p','metrics')).toBe(false);
 stamp='2026-09-13T01:00:00Z';
 const recovered=createPublicationSyncService(f.db,ports as never);
 expect(await recovered.due(ctx,'p','metrics')).toBe(true);
 expect(await recovered.due(ctx,'p','comments')).toBe(false);
 expect((await recovered.read(ctx,'p','metrics'))?.lastSucceededAt).toBe('2026-09-12T01:01:00Z');
 await recovered.settle(ctx,'p','metrics',{success:false,error:'原指标读取失败'});
 expect(await recovered.due(ctx,'p','metrics')).toBe(false);
 expect(await recovered.read(ctx,'p','metrics')).toMatchObject({lastSucceededAt:'2026-09-12T01:01:00Z',retryAt:'2026-09-13T01:15:00.000Z',failures:1,error:'原指标读取失败'});
 stamp='2026-09-13T01:15:00Z';
 const retry=createPublicationSyncService(f.db,ports as never);
 expect(await retry.due(ctx,'p','metrics')).toBe(true);
 await retry.settle(ctx,'p','metrics',{success:true});
 stamp='2026-09-13T15:59:59Z';
 expect(await retry.due(ctx,'p','metrics')).toBe(false);
 stamp='2026-09-13T16:00:00Z';
 expect(await retry.due(ctx,'p','metrics')).toBe(true);
 expect(await retry.read({...ctx,accountId:'other'},'p','metrics')).toBeUndefined();
 await expect(retry.due({...ctx,accountId:'other'},'p','metrics')).rejects.toThrow('ownership');
});
