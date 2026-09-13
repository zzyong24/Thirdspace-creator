import {expect,it,vi} from 'vitest';
import {createSelfCollector} from './self';
const ctx={userId:'u',accountId:'a',requestId:'r',source:'user' as const};
it('目录完整参与公开核验，但只写到期作品；目录截断保留已完成成果',async()=>{
 const stamp='2026-09-13T00:00:00Z';const pubs=['old','new'].map(id=>({id:`p-${id}`,externalId:id,title:id,platform:'douyin',publishedAt:'2026-09-01T00:00:00Z'}));
 const raw=pubs.map(p=>({externalId:p.externalId,title:p.title,platform:'douyin',publishedAt:p.publishedAt,capturedAt:stamp,rawMetrics:{plays:1}}));
 const details=pubs.map(p=>({title:p.title,pubDate:p.publishedAt,genre:'视频',status:'已通过',plays:1,finishRate:0,finish5sRate:0,coverCtr:null,bounce2sRate:0,avgDurationSec:0,likes:0,shares:0,comments:0,favorites:0,profileVisits:0,followerGain:0}));
 const ingest=vi.fn(async(_c:unknown,body:{records:unknown[]})=>({recordsWritten:body.records.length}));const settle=vi.fn(async()=>{});
 const collector=createSelfCollector({sync:{due:async(_c:unknown,id:string)=>id==='p-new',settle},resolvePublication:async(_c:unknown,id:string)=>({id:`p-${id}`}),projectsService:{reconcilePlatformWork:async()=>{}},publishingService:{getRecentPublicationsWithTitle:async()=>pubs},ingestionService:{ensureDouyinSource:async()=> 'source',ingestApprovedDouyinBatch:ingest,createRun:async()=>({id:'run'}),ingestMetrics:async(_c:unknown,input:{records:unknown[]})=>({recordsWritten:input.records.length}),completeRun:async()=>{}},readMetrics:async()=>({incomplete:true,records:raw,identity:{}}),readExport:async()=>new Uint8Array(),parseDouyinWorkListXlsx:async()=>details,now:()=>stamp,checkScheduledSignal:()=>{},configuration:{}} as never);
 const result=await collector(ctx,{__operationsSync:true,__skipHeavyBackfill:true},()=>{});expect(result.incomplete).toBe(true);expect(ingest).toHaveBeenCalledWith(ctx,expect.objectContaining({records:[raw[1]]}));expect(settle).toHaveBeenCalledWith(ctx,'p-new','metrics',{success:true});expect(settle).not.toHaveBeenCalledWith(ctx,'p-old','metrics',expect.anything());
});
