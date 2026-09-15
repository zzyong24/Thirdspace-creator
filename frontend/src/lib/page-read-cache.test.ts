import {afterEach,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {readCachedPageValue,withPageReadInvalidation} from './page-read-cache.server';
import {ENDPOINTS} from '@creatoros/contract';
const ctx:any={userId:'t987-generic',accountId:'a',source:'user'};
const deferred=<T,>()=>{let resolve!:(v:T)=>void;const promise=new Promise<T>(r=>resolve=r);return {resolve,promise};};
afterEach(()=>vi.useRealTimers());
it('同在途复用；返回对象不共享；到期重读',async()=>{
 vi.useFakeTimers();const d=deferred<{n:number}>(),read=vi.fn<() => Promise<{n:number}>>().mockReturnValueOnce(d.promise).mockResolvedValue({n:2});
 const opts={ctx,key:['ttl'],readRevision:async()=>'1',read,isCacheable:()=>true,maxAgeMs:30000};
 const a=readCachedPageValue(opts),b=readCachedPageValue(opts);await Promise.resolve();await Promise.resolve();expect(read).toHaveBeenCalledTimes(1);
 d.resolve({n:1});const first=await a;first.n=8;expect((await b).n).toBe(1);
 await vi.advanceTimersByTimeAsync(30001);expect((await readCachedPageValue(opts)).n).toBe(2);expect(read).toHaveBeenCalledTimes(2);
});
it('写入使已完成缓存失效；写入前的慢回执不回填',async()=>{
 const d=deferred<{n:number}>();const read=vi.fn<() => Promise<{n:number}>>().mockReturnValueOnce(d.promise).mockResolvedValue({n:2});
 const opts={ctx,key:['write'],readRevision:async()=>'1',read,isCacheable:()=>true};
 const old=readCachedPageValue(opts);await Promise.resolve();await Promise.resolve();
 const transport=withPageReadInvalidation({request:async()=>({})} as any);
 await transport.request({...ENDPOINTS.listProjects,method:'POST'} as any,{} as any,ctx);
 expect(await readCachedPageValue(opts)).toEqual({n:2});d.resolve({n:1});await old;
 expect(await readCachedPageValue(opts)).toEqual({n:2});expect(read).toHaveBeenCalledTimes(2);
 await transport.request({...ENDPOINTS.listProjects,method:'POST'} as any,{} as any,ctx);await readCachedPageValue(opts);expect(read).toHaveBeenCalledTimes(3);
});
it('版本读取失败/运行中版本变化/非用户读取不缓存',async()=>{
 let r='1';const read=vi.fn(async()=>{r='2';return 1});
 const opts={ctx,key:['revision'],readRevision:async()=>r,read,isCacheable:()=>true};
 await readCachedPageValue(opts);await readCachedPageValue(opts);expect(read).toHaveBeenCalledTimes(2);
 const failure={...opts,readRevision:async()=>{throw Error('metadata unavailable')}};
 await readCachedPageValue(failure);await readCachedPageValue(failure);expect(read).toHaveBeenCalledTimes(4);
 await readCachedPageValue({...opts,ctx:{...ctx,source:'agent'}});await readCachedPageValue({...opts,ctx:{...ctx,source:'agent'}});expect(read).toHaveBeenCalledTimes(6);
});
