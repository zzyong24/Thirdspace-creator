import {expect,it,vi} from 'vitest';
import {createSelfCollector} from './self';
import {createDb} from '@creatoros/backend';
import {createPublicationSyncService} from '../../modules/analytics/sync-state.service';
import {createAnalyticsRepository} from '../../modules/analytics/analytics.repository';
import {createAnalyticsService} from '../../modules/analytics/analytics.service';
const ctx={userId:'u',accountId:'a',requestId:'r',source:'user' as const};
it('目录完整参与公开核验，但只写到期作品；目录截断保留已完成成果',async()=>{
 const stamp='2026-09-13T00:00:00Z';const pubs=['old','new'].map(id=>({id:`p-${id}`,externalId:id,title:id,platform:'douyin',publishedAt:'2026-09-01T00:00:00Z'}));
 const raw=pubs.map(p=>({externalId:p.externalId,title:p.title,platform:'douyin',publishedAt:p.publishedAt,capturedAt:stamp,rawMetrics:{plays:1}}));
 const details=pubs.map(p=>({title:p.title,pubDate:p.publishedAt,genre:'视频',status:'已通过',plays:1,finishRate:0,finish5sRate:0,coverCtr:null,bounce2sRate:0,avgDurationSec:0,likes:0,shares:0,comments:0,favorites:0,profileVisits:0,followerGain:0}));
 const ingest=vi.fn(async(_c:unknown,body:{records:unknown[]})=>({recordsWritten:body.records.length}));const settle=vi.fn(async()=>{});
 const collector=createSelfCollector({sync:{due:async(_c:unknown,id:string)=>id==='p-new',settle},resolvePublication:async(_c:unknown,id:string)=>({id:`p-${id}`}),projectsService:{reconcilePlatformWork:async()=>{}},publishingService:{getRecentPublicationsWithTitle:async()=>pubs},ingestionService:{ensureDouyinSource:async()=> 'source',ingestApprovedDouyinBatch:ingest,createRun:async()=>({id:'run'}),ingestMetrics:async(_c:unknown,input:{records:unknown[]})=>({recordsWritten:input.records.length}),completeRun:async()=>{}},readMetrics:async()=>({incomplete:true,records:raw,identity:{}}),readExport:async()=>new Uint8Array(),parseDouyinWorkListXlsx:async()=>details,now:()=>stamp,checkScheduledSignal:()=>{},configuration:{}} as never);
 const result=await collector(ctx,{__operationsSync:true,__skipHeavyBackfill:true},()=>{});expect(result.incomplete).toBe(true);expect(ingest).toHaveBeenCalledWith(ctx,expect.objectContaining({records:[raw[1]]}));expect(settle).toHaveBeenCalledWith(ctx,'p-new','metrics',{success:true});expect(settle).not.toHaveBeenCalledWith(ctx,'p-old','metrics',expect.anything());
});

it('T1106 老作品固定时间次日采集不被完成时刻推迟：正式collector与持久水位/快照联合回归',async()=>{
 const f=await createDb();try{
  let stamp='2026-09-13T01:00:00Z',seq=0;
  const pub={id:'p-old',externalId:'old',title:'老作品',platform:'douyin',publishedAt:'2026-07-01T00:00:00Z'};
  const sync=createPublicationSyncService(f.db,{now:()=>stamp,assertPublication:async(c,id)=>{if(c.accountId!=='a'||id!==pub.id)throw Error('ownership');return pub;}});
  const analytics=createAnalyticsService({repo:createAnalyticsRepository(f.db,{now:()=>stamp,nextId:p=>`${p}-${++seq}`}),publishing:{resolvePublication:async()=>pub,listPublicationIdsByProject:async()=>[pub.id]}});
  let views=100;
  const store=async(c:typeof ctx,input:{records:Array<{capturedAt:string;metrics:Record<string,unknown>}>})=>{for(const row of input.records)await analytics.appendSnapshot(c,{publicationId:pub.id,source:'ingestion',ingestionRunId:null,capturedAt:row.capturedAt,rawMetrics:row.metrics,values:[]});return {recordsWritten:input.records.length};};
  const collector=createSelfCollector({sync,resolvePublication:async()=>pub,projectsService:{reconcilePlatformWork:async()=>{}},publishingService:{getRecentPublicationsWithTitle:async()=>[pub]},ingestionService:{ensureDouyinSource:async()=> 'source',ingestApprovedDouyinBatch:store,createRun:async()=>({id:'run'}),ingestMetrics:async(c:typeof ctx,input:Parameters<typeof store>[1])=>{const result=await store(c,input);stamp=new Date(Date.parse(stamp)+60000).toISOString();return result;},completeRun:async()=>{}},readMetrics:async(_c:unknown,capturedAt:string)=>({incomplete:true,records:[{externalId:'old',title:pub.title,platform:'douyin',publishedAt:pub.publishedAt,capturedAt,metrics:{views}}],identity:{}}),readExport:async()=>new Uint8Array(),parseDouyinWorkListXlsx:async()=>[{title:pub.title,pubDate:pub.publishedAt,genre:'视频',status:'已通过',plays:views,finishRate:0,finish5sRate:0,coverCtr:null,bounce2sRate:0,avgDurationSec:0,likes:0,shares:0,comments:0,favorites:0,profileVisits:0,followerGain:0}],now:()=>stamp,checkScheduledSignal:()=>{},configuration:{}} as never);
  await collector(ctx,{__operationsSync:true,__skipHeavyBackfill:true},()=>{});
  expect((await sync.read(ctx,pub.id,'metrics'))?.lastSucceededAt).toBe('2026-09-13T01:01:00.000Z');
  expect(await sync.due(ctx,pub.id,'metrics')).toBe(false);
  stamp='2026-09-14T01:00:00Z';views=150;
  await collector(ctx,{__operationsSync:true,__skipHeavyBackfill:true},()=>{});
  expect((await analytics.getPublicationAnalytics(ctx,pub.id,1,20)).total).toBe(4);
  expect(await analytics.getDailyPlayTrend(ctx,{days:7})).toEqual([{day:'2026-09-14',plays:50}]);
  await sync.settle(ctx,pub.id,'metrics',{success:false,error:'实际失败'});
  stamp='2026-09-14T01:02:00Z';expect(await sync.due(ctx,pub.id,'metrics')).toBe(false);
  stamp='2026-09-14T01:16:00Z';expect(await sync.due(ctx,pub.id,'metrics')).toBe(true);
  expect(await sync.read({...ctx,accountId:'other'},pub.id,'metrics')).toBeUndefined();
 }finally{await f.client.close();}
});
