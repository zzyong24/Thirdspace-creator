import {expect,it,vi} from 'vitest';
import {fetchDouyinVideoUrl,fetchDouyinVideoSource,fetchDouyinVideoUrlViaDetail,DouyinAudioFetchError} from './douyin-cdp';
import {withDouyinChannel} from './douyin-request-gateway';

it('限流排队取消立即返回，晚到许可不执行请求也不记录风控失败',async()=>{
 const controller=new AbortController();let release!:()=>void;
 const gate={acquire:()=>new Promise<void>(resolve=>{release=resolve;}),report:vi.fn()},request=vi.fn(async()=>1);
 const task=withDouyinChannel(gate,'iesdouyin',request,undefined,controller.signal);
 const result=expect(task).rejects.toMatchObject({name:'AbortError'});await Promise.resolve();controller.abort();await result;release();await Promise.resolve();
 expect(request).not.toHaveBeenCalled();expect(gate.report).not.toHaveBeenCalled();
});
it('匿名请求收到取消信号且取消不伪装成网络风控',async()=>{
 const controller=new AbortController(),report=vi.fn();let received:AbortSignal|undefined;
 const fetcher=vi.fn(async(_url:unknown,init?:RequestInit)=>{received=init?.signal as AbortSignal;controller.abort();received.throwIfAborted();return new Response('');});
 await expect(fetchDouyinVideoUrl('one',{fetch:fetcher,gateway:{acquire:async()=>{},report},signal:controller.signal})).rejects.toMatchObject({name:'AbortError'});
 expect(received?.aborted).toBe(true);expect(report).not.toHaveBeenCalled();
});
it('解析失败同时取消，不再启动登录态兜底',async()=>{
 const controller=new AbortController(),detail=vi.fn();
 await expect(fetchDouyinVideoSource({awemeId:'one',authDir:'/unused',signal:controller.signal},{fetchIesdouyin:async()=>{controller.abort();throw new DouyinAudioFetchError('parseDouyinVideoUrl: absent');},fetchViaDetail:detail})).rejects.toMatchObject({name:'AbortError'});
 expect(detail).not.toHaveBeenCalled();
});
it('打开登录态期间取消，关闭迟到的上下文且不读取或导航',async()=>{
 const controller=new AbortController(),cookies=vi.fn(),close=vi.fn(async()=>{});
 const ctx={cookies,close,pages:vi.fn(),newPage:vi.fn()};
 await expect(fetchDouyinVideoUrlViaDetail({awemeId:'one',authDir:'/unused',signal:controller.signal},{openContext:async()=>{controller.abort();return ctx as never;}})).rejects.toMatchObject({name:'AbortError'});
 expect(close).toHaveBeenCalledTimes(1);expect(cookies).not.toHaveBeenCalled();
});
it('登录态导航中取消，不进入导航重试或详情请求',async()=>{
 const controller=new AbortController(),close=vi.fn(async()=>{}),waitForTimeout=vi.fn(async()=>{}),evaluate=vi.fn();
 const goto=vi.fn(async()=>{controller.abort();throw Error('context closed');});
 const page={goto,waitForTimeout,evaluate},ctx={cookies:async()=>[{name:'sessionid',value:'fixture'}],close,pages:()=>[page],newPage:async()=>page};
 await expect(fetchDouyinVideoUrlViaDetail({awemeId:'one',authDir:'/unused',signal:controller.signal},{openContext:async()=>ctx as never})).rejects.toMatchObject({name:'AbortError'});
 expect(goto).toHaveBeenCalledTimes(1);expect(waitForTimeout).not.toHaveBeenCalled();expect(evaluate).not.toHaveBeenCalled();expect(close).toHaveBeenCalledTimes(1);
});
