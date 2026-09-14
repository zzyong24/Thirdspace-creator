import {expect,it,vi} from 'vitest';
import {createSelfCollector} from './self';
const ctx={userId:'u',accountId:'a',requestId:'t983',source:'user' as const};
function fixture(){
 let tick=0;let fail:'none'|'busy'|'bad'='none';const stamp=()=>new Date(Date.parse('2026-09-14T00:00:00Z')+tick).toISOString();
 const missing=new Map(Array.from({length:12},(_,i)=>[`p${i}`,{id:`p${i}`,externalId:`v${i}`,contentOutputId:null}]));
 const states=new Map<string,{retryAt:string|null}>();
 const metrics=vi.fn(async()=>{throw new Error('独立封面不得重新采集指标');});
 const read=vi.fn(async(_c:unknown,id:string)=>{if(id==='v0'&&fail!=='none')throw Object.assign(new Error(fail),{code:fail==='busy'?'BROWSER_PROFILE_BUSY':'NETWORK_ERROR'});return {coverUrl:'https://example.test/cover.jpg'};});
 const settle=vi.fn(async(_c:unknown,id:string,cap:string,result:{success:boolean})=>{expect(cap).toBe('cover');states.set(id,{retryAt:result.success?null:new Date(Date.parse(stamp())+900000).toISOString()});});
 const collector=createSelfCollector({sync:{due:async(_c:unknown,id:string)=>!states.get(id)?.retryAt||Date.parse(states.get(id)!.retryAt!)<=Date.parse(stamp()),read:async(_c:unknown,id:string)=>states.get(id),settle},projectsService:{listImportedWorks:async()=>[]},publishingService:{listPublicationsMissingCover:async(_c:unknown,opts:{limit:number})=>[...missing.values()].slice(0,opts.limit),setCover:async(_c:unknown,id:string)=>{missing.delete(id);}},assetsService:{createGeneratedAsset:async()=>({id:'saved-asset'})},readMetrics:metrics,readExport:metrics,readCover:read,downloadDouyinImage:async()=>({bytes:new Uint8Array([1]),mimeType:'image/jpeg'}),resolveCoverBackfillLimit:()=>10,now:stamp,checkScheduledSignal:()=>{},configuration:{}} as never);
 return {collector,metrics,read,settle,missing,fail:(value:typeof fail)=>{fail=value;},advance:()=>{tick+=900000;}};
}
it('独立封面每批10，12条两批完成，不读取指标、导出或调用归因模型',async()=>{
 const f=fixture();const first=await f.collector(ctx,{__backfillOnly:true},()=>{});
 expect(first).toMatchObject({itemsUpdated:10,continueCollection:true,retryAfterMs:2000});
 const second=await f.collector(ctx,{__backfillOnly:true},()=>{});expect(second).toMatchObject({itemsUpdated:2,continueCollection:false});
 expect(f.metrics).not.toHaveBeenCalled();expect(f.missing.size).toBe(0);expect(f.settle).toHaveBeenCalledTimes(12);
});
it('坏封面按水位退避不挡后续作品，未来到期项不每2秒空转',async()=>{
 const f=fixture();f.fail('bad');await f.collector(ctx,{__backfillOnly:true},()=>{});
 const remaining=await f.collector(ctx,{__backfillOnly:true},()=>{});
 expect(f.missing.size).toBe(1);expect(remaining).toMatchObject({continueCollection:true,retryAfterMs:900000});
 f.advance();f.fail('none');expect(await f.collector(ctx,{__backfillOnly:true},()=>{})).toMatchObject({itemsUpdated:1,continueCollection:false});
});
it('浏览器占用原样传回持久runner等待，不消耗本批也不写封面失败水位',async()=>{
 const f=fixture();f.fail('busy');await expect(f.collector(ctx,{__backfillOnly:true},()=>{})).rejects.toMatchObject({code:'BROWSER_PROFILE_BUSY'});
 expect(f.read).toHaveBeenCalledOnce();expect(f.settle).not.toHaveBeenCalled();expect(f.missing.size).toBe(12);
});
