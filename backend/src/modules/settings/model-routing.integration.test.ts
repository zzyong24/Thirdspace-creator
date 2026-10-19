import {describe,expect,it} from 'vitest';
import {createDb, sql, type RequestContext} from '@creatoros/backend';
import {ENDPOINTS} from '@creatoros/contract';
import {createSettingsRepository} from './settings.repository';
import {createSettingsService,type ModelRoutingProjectionReader} from './settings.service';
import {createSettingsTransport} from './settings.transport';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const ctx:RequestContext={userId:'routing-owner',requestId:'routing-test',source:'user'};
const choices={text:'codex',vision:'official',image:'self',video:'self',audio:'local',embed:'official'} as const;

async function fixture(dataDir?:string,projection?:ModelRoutingProjectionReader){
  const {db,client}=await createDb(dataDir?{dataDir}:undefined);let serial=0;
  const deps={now:()=>new Date().toISOString(),nextId:(prefix:string)=>`${prefix}-routing-${++serial}`};
  const repo=createSettingsRepository(db,deps);
  const service=()=>createSettingsService(()=>repo,async()=>null as never,async()=>null as never,undefined,undefined,
    async(owner,write)=>db.transaction(async tx=>{
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('creatoros:preferences'),hashtext(${owner.userId}))`);
      return write(createSettingsRepository(tx as never,deps));
    }),projection);
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

// T1294：默认只读投影与执行共用策略，不按旧激活或现存密钥猜自配。
it('T1294 未存选择默认全部官方，保密钥且GET不写入',async()=>{
 const f=await fixture();try{
  await f.service().setModelConfiguration(ctx,'default',{provider:'own',modelName:'kept-model',secret:'kept-private'});
  expect(await f.service().getModelRouting(ctx)).toMatchObject({choices:null,revision:0,effectiveChoices:{text:'official',vision:'official',image:'official',video:'official',audio:'official',embed:'official'}});
  expect(await f.repo.getPreferences(ctx)).toBeNull();
  expect((await f.service().getModelConfig(ctx,'default'))?.secretValue).toBe('kept-private');
 }finally{await f.client.close();}
},180_000);
it('T1294 服务端旧Codex显式选择优先，完整组合仍原样优先',async()=>{
 const f=await fixture();try{
  await f.service().updatePreferences(ctx,{assistantExecutionEngine:'codex'});
  expect(await f.service().getModelRouting(ctx)).toMatchObject({choices:null,effectiveChoices:{text:'codex',vision:'codex',image:'codex',video:'official',audio:'official',embed:'official'}});
  await f.service().putModelRouting(ctx,{schemaVersion:1,choices,expectedRevision:0});
  expect(await f.service().getModelRouting(ctx)).toMatchObject({choices,effectiveChoices:choices});
 }finally{await f.client.close();}
},180_000);

it('T1294 新选择Codex必须在写锁外通过检查，失败零写；后续读和无关切换不复检',async()=>{
 let allow=false;const checks:boolean[]=[];
 const projection:ModelRoutingProjectionReader=async(_ctx,value,options)=>{
  checks.push(options?.checkCodex===true);
  const effectiveChoices=value.choices!;
  return {effectiveChoices,capabilities:[{mode:'text',capability:'copilot.assist',source:'codex',status:allow?'ready':'unavailable',reasonCode:allow?null:'CODEX_LOGIN_REQUIRED'}]};
 };
 const f=await fixture(undefined,projection);try{
  const selected={text:'codex',vision:'official',image:'official',video:'official',audio:'official',embed:'official'} as const;
  await expect(f.service().putModelRouting(ctx,{schemaVersion:1,choices:selected,expectedRevision:0})).rejects.toThrow('尚未通过');
  expect(await f.repo.getPreferences(ctx)).toBeNull();expect(checks).toEqual([true]);
  allow=true;await f.service().putModelRouting(ctx,{schemaVersion:1,choices:selected,expectedRevision:0});
  await f.service().getModelRouting(ctx);
  await f.service().putModelRouting(ctx,{schemaVersion:1,choices:{...selected,video:'self'},expectedRevision:1});
  expect(checks.filter(Boolean)).toHaveLength(2);
  expect((await f.repo.getPreferences(ctx))?.modelRoutingRevision).toBe(2);
 }finally{await f.client.close();}
},180_000);
it('T1294 Codex检查期间并发保存仍以最终原revision CAS拒绝，不覆盖胜出选择',async()=>{
 let checked!:()=>void,release!:()=>void;
 const reached=new Promise<void>(resolve=>{checked=resolve;}),gate=new Promise<void>(resolve=>{release=resolve;});
 const f=await fixture(undefined,async(_ctx,value,options)=>{
  if(options?.checkCodex){checked();await gate;}
  return {effectiveChoices:value.choices!,capabilities:[{mode:'text',capability:'copilot.assist',source:'codex',status:'ready',reasonCode:null}]};
 });try{
  const selected={text:'codex',vision:'official',image:'official',video:'official',audio:'official',embed:'official'} as const;
  const pending=f.service().putModelRouting(ctx,{schemaVersion:1,choices:selected,expectedRevision:0});
  const refused=expect(pending).rejects.toMatchObject({details:{domainCode:'MODEL_ROUTING_CONFLICT'}});
  await reached;await f.service().putModelRouting(ctx,{schemaVersion:1,choices:{...selected,text:'official'},expectedRevision:0});release();await refused;
  expect((await f.repo.getPreferences(ctx))?.modelRouting?.text).toBe('official');
 }finally{release();await f.client.close();}
},180_000);
