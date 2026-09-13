import {describe,it,expect,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {withPageReadCache} from '@/lib/page-read-cache.server';
import {ENDPOINTS,successEnvelope} from '@creatoros/contract';
const input=(date:string)=>({params:undefined,body:undefined,query:{date}});
describe('日报展示缓存',()=>{
 it('相同账号日期复用，数据版本/日期/账号改变重新读',async()=>{
 let revision='1';const request=vi.fn(async(_:any,i:any,c:any)=>({data:{date:i.query.date,timeZone:'Asia/Shanghai',generatedAt:'2026-09-13T00:00:00Z',accountId:c.accountId,accountName:null,positioning:null,works:[],recentWorks:[],warnings:[]},meta:{requestId:'r'},error:null}));
 const cache=withPageReadCache({request} as any,async()=>revision);const ctx:any={userId:'cache-report-test',accountId:'a',source:'user',requestId:'r'};
 await cache.request(ENDPOINTS.getDailyReport,input('2026-09-12'),ctx);await cache.request(ENDPOINTS.getDailyReport,input('2026-09-12'),ctx);expect(request).toHaveBeenCalledTimes(1);
 revision='2';await cache.request(ENDPOINTS.getDailyReport,input('2026-09-12'),ctx);await cache.request(ENDPOINTS.getDailyReport,input('2026-09-11'),ctx);await cache.request(ENDPOINTS.getDailyReport,input('2026-09-12'),{...ctx,accountId:'b'});expect(request).toHaveBeenCalledTimes(4);
 });
 it('未解析的昨天与模型调用不缓存',async()=>{const request=vi.fn(async()=>({}));const cache=withPageReadCache({request} as any,async()=>'r');const ctx:any={userId:'cache2',accountId:'a',source:'user'};await cache.request(ENDPOINTS.getDailyReport,{params:undefined,body:undefined,query:{}},ctx);await cache.request(ENDPOINTS.getDailyReport,{params:undefined,body:undefined,query:{}},ctx);expect(request).toHaveBeenCalledTimes(2);});
});
