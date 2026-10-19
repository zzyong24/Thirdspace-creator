import { renderToStaticMarkup } from 'react-dom/server';
import { expect,it,vi } from 'vitest';
vi.mock('@/lib/contract-client.server',()=>({client:{}}));
vi.mock('@/features/automations/automations-island',()=>({AutomationsIsland:({jobs}:{jobs:{id:string}[]})=><div>{jobs.map(j=><span key={j.id}>{j.id}</span>)}</div>}));
import { AutomationsPage } from './automations-page';
import type { ScheduledJobResource } from '@creatoros/backend/modules/scheduling';
it('已迁移的旧同步隐藏，未迁移评论仍可管理，统一作业保留',async()=>{
 const jobs=[{id:'unified',sourceKind:'self.metrics',target:{operationsSync:{version:1}}},{id:'merged-comments',sourceKind:'comments',target:{mergedIntoSelfMetrics:true}},{id:'legacy-comments',sourceKind:'comments',target:{}},{id:'merged-traffic',sourceKind:'self.traffic',target:{mergedIntoSelfMetrics:true}}] as ScheduledJobResource[];
 const html=renderToStaticMarkup(await AutomationsPage({jobs}));
 expect(html).toContain('unified');expect(html).toContain('legacy-comments');expect(html).not.toContain('merged-comments');expect(html).not.toContain('merged-traffic');
});
it('迁移后四类独立任务可见，仅显式内容补全detail可见，未知旧detail仍隐藏',async()=>{
 const jobs=[{id:'metrics',sourceKind:'self.metrics',target:{}},{id:'comments',sourceKind:'comments',target:{}},{id:'traffic',sourceKind:'self.traffic',target:{}},{id:'backfill',sourceKind:'self.detail',target:{__backfillOnly:true}},{id:'old-detail',sourceKind:'self.detail',target:{}}] as ScheduledJobResource[];
 const html=renderToStaticMarkup(await AutomationsPage({jobs}));
 for(const id of ['metrics','comments','traffic','backfill'])expect(html).toContain(id);expect(html).not.toContain('old-detail');
});
it('T987 作业慢读时账号读取已启动，不把独立查询串行',async()=>{
 let resolveJobs!:(v:[])=>void;
 const listAccounts=vi.fn(async()=>[]);
 const read=AutomationsPage({currentAccountId:'a',client:{listScheduledJobs:()=>new Promise<[]>(r=>{resolveJobs=r;}),listAccounts} as any});
 try { expect(listAccounts).toHaveBeenCalledTimes(1); }
 finally {resolveJobs([]);await read;}
});
it('T1199 纯组任务超过100条仍全部读取，不退化为当前媒体',async()=>{
 const batch=Array.from({length:100},(_,i)=>({id:`job-${i}`,sourceKind:'self.metrics',target:{},accountId:i%2?'xhs':'dy'})) as ScheduledJobResource[];
 const listScheduledJobs=vi.fn(async({query}:any)=>query.page===1?batch:[{id:'job-100',sourceKind:'self.metrics',target:{},accountId:'xhs'}]);
 const getAccountGroup=vi.fn(async()=>({id:'g',name:'真实组',members:[]}));
 const html=renderToStaticMarkup(await AutomationsPage({scope:{groupId:'g',accountId:null},client:{listScheduledJobs,getAccountGroup,listAccounts:vi.fn(),getAccountCollectionPlanReadiness:vi.fn()} as any}));
 expect(html).toContain('job-100');expect(listScheduledJobs).toHaveBeenCalledTimes(2);expect(listScheduledJobs.mock.calls.map(([input])=>input.query.page)).toEqual([1,2]);expect(getAccountGroup).toHaveBeenCalledWith({params:{groupId:'g'},query:undefined,body:undefined});
});
it('T1199 组或任务读取失败不伪装空组',async()=>{
 const broken={listScheduledJobs:vi.fn(async()=>{throw new Error('真实任务读取失败')}),getAccountGroup:vi.fn(async()=>null),listAccounts:vi.fn(),getAccountCollectionPlanReadiness:vi.fn()} as any;
 await expect(AutomationsPage({scope:{groupId:'g'},client:broken})).rejects.toThrow('真实任务读取失败');
});
