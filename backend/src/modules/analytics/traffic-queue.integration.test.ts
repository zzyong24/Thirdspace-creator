import {afterEach,expect,it,vi} from 'vitest';
import {createDb} from '@creatoros/backend';
import {publications} from '../../schema/publishing';
import {createTrafficService} from './traffic.service';
import {createTrafficCollector} from '../../application/collection/traffic';
import type {RequestContext,TrafficSourcePayload} from '@creatoros/contract';
const ctx:RequestContext={userId:'user',accountId:'account',requestId:'test',source:'user'};
const stamp='2026-09-11T00:00:00.000Z';
const data:TrafficSourcePayload={app:'抖音 App',windowLabel:null,complete:true,entries:[{label:'推荐页',percentage:95.7},{label:'其他',percentage:0}]};
const close:Array<()=>Promise<unknown>>=[];
afterEach(async()=>{for(const fn of close.splice(0))await fn();});
async function fixture(count=1){
 const f=await createDb();close.push(()=>f.client.close());
 const pubs=Array.from({length:count},(_,i)=>({id:`pub-${String(i).padStart(4,'0')}`,accountId:'account',externalId:`video-${i}`,platform:'douyin',hiddenAt:null as string|null,status:'published'}));
 await f.db.insert(publications).values(pubs.map(p=>({...p,userId:ctx.userId,contentOutputId:"output",accountReference:"account",createdAt:stamp,updatedAt:stamp})));
 let now=stamp;
 const publishing={getPublication:vi.fn(async(_ctx:RequestContext,id:string)=>{const p=pubs.find(p=>p.id===id);if(!p)throw new Error('missing');return p;}),listPublicationIdsByProject:vi.fn(async()=>pubs.map(p=>p.id)),listPublicationsForUser:vi.fn(async(_ctx:RequestContext,page:{limit:number;offset:number})=>pubs.slice(page.offset,page.offset+page.limit))};
 const service=createTrafficService(f.db,{now:()=>now,publishing:publishing as never});
 return {...f,pubs,publishing,service,setNow:(value:string)=>{now=value;},collector:(read=(async()=>data),checkSignal=()=>{})=>createTrafficCollector({service,read,checkSignal,isNotLoggedIn:e=>e instanceof Error&&e.message==='login'})};
}
const run=(collector:ReturnType<typeof createTrafficCollector>,taskId='task')=>collector(ctx,{} as never,()=>{}, {taskId} as never);
it('归属隔离、非抖音/隐藏/未发布跳过；不同账号不能读写已有队列',async()=>{
 const f=await fixture(4);f.pubs[1]!.platform='xiaohongshu';f.pubs[2]!.hiddenAt=stamp;f.pubs[3]!.status='draft';
 expect(await f.service.enqueueProject(ctx,'project')).toBe(1);expect(await f.service.pending(ctx)).toHaveLength(1);
 const foreign={...ctx,accountId:'foreign'};
 expect(await f.service.pending(foreign)).toHaveLength(0);
 await expect(f.service.enqueueProject(foreign,'project')).rejects.toThrow();
 await expect(f.service.settle(foreign,{publicationId:f.pubs[0]!.id,requestedAt:stamp},{data},'task')).rejects.toThrow();
 await f.service.settle(foreign,{publicationId:f.pubs[0]!.id,requestedAt:stamp},{status:'failed',error:'forged'},'task');
 expect((await f.service.pending(ctx))[0]?.status).toBe('pending');
 expect((await f.service.getProject(foreign,'project')).items).toEqual([]);
});
it('新一轮失败和过期回执均不覆盖上次成功快照',async()=>{
 const f=await fixture();await f.service.enqueueProject(ctx,'project');let [row]=await f.service.pending(ctx);
 await f.service.settle(ctx,row!,{data},'first');f.setNow('2026-09-12T00:00:00.000Z');await f.service.enqueueProject(ctx,'project');
 expect(await f.service.settle(ctx,row!,{data:{...data,entries:[{label:'伪旧回执',percentage:1}]}},'stale')).toHaveLength(0);
 await run(f.collector(async()=>{throw new Error('timeout');}),'second');
 const current=(await f.service.getProject(ctx,'project')).items[0]!;
 expect(current).toMatchObject({status:'failed',data,capturedAt:stamp,error:'timeout'});
 expect(await f.service.summary(ctx,'second')).toEqual({written:0,failed:1});
});
it('1005条按20条分批，中断保留断点，恢复原任务且累计最早一批失败',async()=>{
 const f=await fixture(1005);
 // 真实列表分页先核验公开集合，再持久排队；不访问浏览器/媒体/真实数据库。
 expect(await f.service.enqueueVisible(ctx,new Set(f.pubs.map(p=>p.externalId)))).toBe(1005);
 expect(f.publishing.listPublicationsForUser).toHaveBeenCalledTimes(6);
 let reads=0,abort=false;
 const read=vi.fn(async()=>{reads++;if(reads===1)throw new Error('first failed');if(reads===7)abort=true;return data;});
 const cancelled=f.collector(read,()=>{if(abort)throw new Error('cancelled');});
 await expect(run(cancelled)).rejects.toThrow('cancelled');
 expect(await f.service.summary(ctx,'task')).toEqual({written:5,failed:1});
 expect(await f.service.pending(ctx,2000)).toHaveLength(999);
 // 重新构造collector模拟进程重启；已提交作品不会重新读取。
 const resumedRead=vi.fn(async()=>data);const resumed=f.collector(resumedRead);let result;
 for(let batch=0;batch<51;batch++){result=await run(resumed);if(!result.continueCollection)break;}
 expect(resumedRead).toHaveBeenCalledTimes(999);
 expect(result).toMatchObject({itemsUpdated:1004,continueCollection:false,incomplete:true});
 expect(await f.service.summary(ctx,'task')).toEqual({written:1004,failed:1});
 expect(await f.service.pending(ctx)).toEqual([]);
},30000);
it('登录过期停止后续访问，重新连接可继续原队列',async()=>{
 const f=await fixture(3);await f.service.enqueueProject(ctx,'project');const read=vi.fn(async()=>{throw new Error('login');});
 await expect(run(f.collector(read))).rejects.toThrow('login');expect(read).toHaveBeenCalledTimes(1);
 expect(await f.service.summary(ctx,'task')).toEqual({written:0,failed:1});
 const result=await run(f.collector());expect(result).toMatchObject({itemsUpdated:3,continueCollection:false,incomplete:false});
});
it('作品平台标识修正后重试采用最新标识，不被旧队列永久卡住',async()=>{
 const f=await fixture();await f.service.enqueueProject(ctx,'project');await run(f.collector(async()=>{throw new Error('bad old id');}));
 f.pubs[0]!.externalId='corrected-id';f.setNow('2026-09-12T00:00:00.000Z');await f.service.enqueueProject(ctx,'project');
 const read=vi.fn(async()=>data);const result=await run(f.collector(read),'retry');
 expect(read).toHaveBeenCalledWith(ctx,'corrected-id');expect(result).toMatchObject({itemsUpdated:1,incomplete:false});
});
