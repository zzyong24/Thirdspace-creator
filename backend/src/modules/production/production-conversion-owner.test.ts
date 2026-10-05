import {it,expect} from 'vitest';
import {createDb,projects,contentOutputs} from '@creatoros/backend';
import {createProductionConversion} from './production-conversion.service';
import {convertLegacyProductionPlan} from './production-conversion-plan';
import type {RequestContext} from '@creatoros/contract';
const ctx:RequestContext={userId:'user',accountId:'account',source:'user',requestId:'http'};
const now='2026-10-02T12:00:00.000Z';
it('空稿通过原Production repo真实DB预约和采用，无源/probe/file；回执丢回复重试/CAS/账号隔离',async()=>{
 const opened=await createDb(),db=opened.db;let seq=0;
 try{
 await db.insert(projects).values({id:'project',userId:'user',accountId:'account',title:'项目',creationMode:'guided',status:'active',currentStage:'production',startedAt:now,createdAt:now,updatedAt:now});
 await db.insert(contentOutputs).values({id:'output',projectId:'project',contentType:'video',title:'视频',status:'drafting',createdAt:now,updatedAt:now});
 const unavailable=()=>{throw Error('空转换不应读取不存在的媒体');};
 const service=createProductionConversion(db,{now:()=>now,nextId:p=>`${p}-${++seq}`,ports:{sourceGet:unavailable,readLegacyMain:unavailable,source:{readMediaFile:unavailable,createTask:unavailable,assertTaskSettled:unavailable,readTask:unavailable}}});
 const body={mode:'empty',expectedRevision:0,requestId:'convert-empty-request'};
 const prepared=await service.prepare(ctx,'output',body);expect(prepared.plan.mainTrack.clips).toEqual([]);expect(await service.get(ctx,'output',body.requestId)).toEqual(prepared);expect(await service.prepare(ctx,'output',body)).toEqual(prepared);
 const adopt={conversionRequestId:body.requestId,expectedRevision:0,requestId:'adopt-empty-request',conversionDigest:prepared.conversionDigest};
 const applied=await service.adopt(ctx,'output',adopt);expect(applied.revision).toBe(1);expect(await service.adopt(ctx,'output',adopt)).toEqual(applied);
 await expect(service.adopt(ctx,'output',{...adopt,requestId:'stale-new-request'})).rejects.toThrow();
 await expect(service.get({...ctx,accountId:'other'},'output',body.requestId)).rejects.toThrow();
 await expect(service.prepare(ctx,'output',{...body,mode:'capture-current-original',mainSourceRequestId:'source'})).rejects.toThrow();
 }finally{await opened.client.close();}
});
it('旧稿完整扩展/重复ID/卡片真实at到scene-end机械映射；empty拒清掉旧主片',()=>{
 let id=0;const next=(p:string)=>`${p}-${++id}`;
 const legacy={editorVersion:1,extra:{keep:true},renderProps:{meta:{title:'旧稿'},talkingHead:{file:'original',durationSec:10},scenes:[{id:'same',title:'场景',label:'场景',startSec:0,endSec:10,cards:[{kind:'list',id:'same',at:3,items:[{text:'原文'}],extension:{keep:true}}]}],captions:[{id:'same',start:1,end:2,cn:'正文'}],broll:[],delivery:{width:1920,height:1080,fps:30}}};
 const source={sourceId:'source',assetId:'asset',assetFileId:'file',fileDigest:'a'.repeat(64),probeDigest:'b'.repeat(64),timebase:{num:1,den:1000},durationTicks:10000,hasAudio:true};
 expect(()=>convertLegacyProductionPlan(legacy,null,next)).toThrow();
 const value=convertLegacyProductionPlan(legacy,source,next);expect(value.plan.legacySnapshot).toEqual(legacy);expect(value.plan.extra).toEqual({keep:true});expect(value.plan.overlayDraft).not.toHaveProperty('talkingHead');expect(value.plan.overlayDraft.scenes[0]!.cards[0]!.anchor).toEqual({kind:'timeline',startUs:3000000,endUs:10000000});expect(value.plan.overlayDraft.scenes[0]!.cards[0]!.extension).toEqual({keep:true});expect(value.warnings.length).toBeGreaterThan(0);
});
