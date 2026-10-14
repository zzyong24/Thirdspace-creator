import {describe,expect,it} from 'vitest';
import {createDb, sql, type RequestContext} from '@creatoros/backend';
import {ENDPOINTS} from '@creatoros/contract';
import {createSettingsRepository} from './settings.repository';
import {createSettingsService} from './settings.service';
import {createSettingsTransport} from './settings.transport';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const ctx:RequestContext={userId:'routing-owner',requestId:'routing-test',source:'user'};
const choices={text:'codex',vision:'official',image:'self',video:'self',audio:'local',embed:'official'} as const;

async function fixture(dataDir?:string){
  const {db,client}=await createDb(dataDir?{dataDir}:undefined);let serial=0;
  const deps={now:()=>new Date().toISOString(),nextId:(prefix:string)=>`${prefix}-routing-${++serial}`};
  const repo=createSettingsRepository(db,deps);
  const service=()=>createSettingsService(()=>repo,async()=>null as never,async()=>null as never,undefined,undefined,
    async(owner,write)=>db.transaction(async tx=>{
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('creatoros:preferences'),hashtext(${owner.userId}))`);
      return write(createSettingsRepository(tx as never,deps));
    }));
  return {db,client,repo,service};
}

describe('T1278 真实偏好库及公开设置传输',()=>{
  it('真实文件库关闭再打开后，来源/版本和独立密钥均保持',async()=>{
    const root=await mkdtemp(join(tmpdir(),'t1278-routing-restart-'));
    let live:Awaited<ReturnType<typeof fixture>>|undefined;
    try{
      live=await fixture(join(root,'data'));
      await live.service().setModelConfiguration(ctx,'default',{provider:'own',modelName:'original-self',secret:'restart-private-fixture'});
      await live.service().putModelRouting(ctx,{schemaVersion:1,choices,expectedRevision:0});
      await live.client.close();live=undefined;
      live=await fixture(join(root,'data'));
      expect(await live.service().getModelRouting(ctx)).toMatchObject({revision:1,choices,effectiveChoices:choices});
      expect((await live.service().getModelConfig(ctx,'default'))?.secretValue).toBe('restart-private-fixture');
    }finally{await live?.client.close();await rm(root,{recursive:true,force:true});}
  },180_000);
  it('首次读不落选择；公开保存读回，重建服务后保持完整组合和旧配置',async()=>{
    const f=await fixture();
    try{
      const svc=f.service();
      expect(await svc.getModelRouting(ctx)).toMatchObject({revision:0,choices:null});
      expect(await f.repo.getPreferences(ctx)).toBeNull();
      await svc.setModelConfiguration(ctx,'image.generate',{provider:'test-provider',modelName:'test-model',secret:'kept-private'});
      const transport=createSettingsTransport(()=>svc);
      const reply=await transport.request(ENDPOINTS.putModelRouting,{params:undefined,query:undefined,body:{schemaVersion:1,choices,expectedRevision:0}},ctx) as {data:unknown};
      expect(reply.data).toMatchObject({revision:1,choices,effectiveChoices:choices});
      expect(await f.service().getModelRouting(ctx)).toMatchObject({revision:1,choices});
      expect((await svc.getModelConfig(ctx,'image.generate'))?.secretValue).toBe('kept-private');
      expect(JSON.stringify(reply)).not.toContain('kept-private');
      expect(await svc.getPreferences(ctx)).not.toHaveProperty('modelRouting');
    }finally{await f.client.close();}
  },180_000);
  it('CAS拒绝旧版本，同值保存仍增版本；旧engine PATCH不覆盖来源',async()=>{
    const f=await fixture();try{
      const svc=f.service();
      await svc.putModelRouting(ctx,{schemaVersion:1,choices,expectedRevision:0});
      await expect(svc.putModelRouting(ctx,{schemaVersion:1,choices:{...choices,text:'self'},expectedRevision:0})).rejects.toMatchObject({details:{domainCode:'MODEL_ROUTING_CONFLICT'}});
      expect(await svc.putModelRouting(ctx,{schemaVersion:1,choices,expectedRevision:1})).toMatchObject({revision:2});
      await svc.updatePreferences(ctx,{assistantExecutionEngine:'pi'});
      expect(await svc.getModelRouting(ctx)).toMatchObject({revision:2,choices,legacyExecutionEngine:'pi'});
      expect(await svc.getModelRouting({...ctx,userId:'other-owner'})).toMatchObject({revision:0,choices:null});
    }finally{await f.client.close();}
  },180_000);
  it('同版本并发保存只允许一份成功，不覆盖胜出选择',async()=>{
    const f=await fixture();try{
      const svc=f.service();
      const results=await Promise.allSettled([
        svc.putModelRouting(ctx,{schemaVersion:1,choices,expectedRevision:0}),
        svc.putModelRouting(ctx,{schemaVersion:1,choices:{...choices,image:'official'},expectedRevision:0}),
      ]);
      expect(results.filter(x=>x.status==='fulfilled')).toHaveLength(1);
      expect(results.filter(x=>x.status==='rejected')).toHaveLength(1);
      const winner=results.find(x=>x.status==='fulfilled');
      expect(await f.service().getModelRouting(ctx)).toEqual(winner?.status==='fulfilled'?winner.value:null);
    }finally{await f.client.close();}
  },180_000);
  it('非法来源在写入前拒绝，当前选择不变',async()=>{
    const f=await fixture();try{
      const svc=f.service();
      await expect(svc.putModelRouting(ctx,{schemaVersion:1,choices:{...choices,video:'codex'},expectedRevision:0} as never)).rejects.toMatchObject({details:{domainCode:'MODEL_ROUTE_UNSUPPORTED'}});
      expect(await f.repo.getPreferences(ctx)).toBeNull();
    }finally{await f.client.close();}
  },180_000);
});
