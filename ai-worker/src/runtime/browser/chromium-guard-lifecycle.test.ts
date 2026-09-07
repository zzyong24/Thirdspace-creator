import {afterEach,it,expect,vi} from 'vitest';
import {guardedLaunch,liveContextCount} from './chromium-guard';
const deps={listProfileProcesses:async()=>[],killPid:async()=>{},removeFile:async()=>{}};
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>{resolve=r;});return {promise,resolve};}
afterEach(()=>vi.useRealTimers());
it('启动超时后，迟到浏览器关闭确认前不得清锁或放行后继',async()=>{
 vi.useFakeTimers();const close=deferred<void>(),closing=vi.fn(()=>close.promise),late={close:closing},launch=deferred<typeof late>(),next=vi.fn(async()=>({close:async()=>{}})),profile='/isolated/guard-late-close';
 const first=guardedLaunch(profile,()=>launch.promise,{timeoutMs:5},deps);const failure=expect(first).rejects.toThrow('启动超时');await vi.advanceTimersByTimeAsync(10);await failure;
 const second=guardedLaunch(profile,next,{},deps);await vi.advanceTimersByTimeAsync(0);expect(next).not.toHaveBeenCalled();
 launch.resolve(late);await vi.advanceTimersByTimeAsync(0);expect(closing).toHaveBeenCalledTimes(1);expect(next).not.toHaveBeenCalled();
 close.resolve();const ctx=await second;expect(next).toHaveBeenCalledTimes(1);await ctx.close();expect(liveContextCount(profile)).toBe(0);
});
it('关闭失败不能释放活浏览器，后续成功关闭才放行',async()=>{
 vi.useFakeTimers();const profile='/isolated/guard-close-failed',close=vi.fn().mockRejectedValueOnce(Error('still alive')).mockResolvedValue(undefined);
 const first=await guardedLaunch(profile,async()=>({close}),{},deps),next=vi.fn(async()=>({close:async()=>{}}));
 await expect(first.close()).rejects.toThrow('still alive');const second=guardedLaunch(profile,next,{},deps);await vi.advanceTimersByTimeAsync(0);
 expect(liveContextCount(profile)).toBe(1);expect(next).not.toHaveBeenCalled();await first.close();const ctx=await second;await ctx.close();expect(liveContextCount(profile)).toBe(0);
});
it('排队取消不执行预检，也不释放前一浏览器的占用',async()=>{
 vi.useFakeTimers();const profile='/isolated/guard-queue-cancel',first=await guardedLaunch(profile,async()=>({close:async()=>{}}),{},deps),controller=new AbortController(),next=vi.fn(async()=>({close:async()=>{}}));
 const pending=guardedLaunch(profile,next,{signal:controller.signal},deps);const failure=expect(pending).rejects.toMatchObject({name:'AbortError'});controller.abort();await failure;
 expect(next).not.toHaveBeenCalled();expect(liveContextCount(profile)).toBe(1);await first.close();const ctx=await guardedLaunch(profile,next,{},deps);await ctx.close();
});
it('锁失败的一次恢复仍持有队列，不能与后继启动并发',async()=>{
 vi.useFakeTimers();const profile='/isolated/guard-retry-lease',retry=deferred<{close:()=>Promise<void>}>();let calls=0;
 const first=guardedLaunch(profile,async()=>{if(++calls===1)throw Object.assign(Error('locked'),{code:'EBUSY'});return retry.promise;},{},deps);
 const next=vi.fn(async()=>({close:async()=>{}})),second=guardedLaunch(profile,next,{},deps);await vi.advanceTimersByTimeAsync(0);
 expect(calls).toBe(2);expect(next).not.toHaveBeenCalled();retry.resolve({close:async()=>{}});const ctx=await first;await ctx.close();const following=await second;await following.close();
});
it('启动等待取消后，迟到 context 关闭失败仍保留占用直到 close 事件',async()=>{
 vi.useFakeTimers();const profile='/isolated/guard-abort-event',controller=new AbortController();let closed!:()=>void;
 const closing=vi.fn(async()=>{throw Error('close not confirmed');}),late={close:closing,on:(event:string,handler:()=>void)=>{if(event==='close')closed=handler;}},launch=deferred<typeof late>();
 const pending=guardedLaunch(profile,()=>launch.promise,{signal:controller.signal},deps),failure=expect(pending).rejects.toMatchObject({name:'AbortError'});await vi.advanceTimersByTimeAsync(0);controller.abort();await failure;
 launch.resolve(late);await vi.advanceTimersByTimeAsync(0);expect(closing).toHaveBeenCalledTimes(1);expect(liveContextCount(profile)).toBe(1);
 const next=vi.fn(async()=>({close:async()=>{}})),second=guardedLaunch(profile,next,{},deps);await vi.advanceTimersByTimeAsync(0);expect(next).not.toHaveBeenCalled();
 closed();const ctx=await second;await ctx.close();expect(liveContextCount(profile)).toBe(0);
});
it('同步启动异常释放占用，其他 profile 不受在途启动影响',async()=>{
 vi.useFakeTimers();const profile='/isolated/guard-sync-fail';await expect(guardedLaunch(profile,()=>{throw Error('failed');},{},deps)).rejects.toThrow('没能启动');
 const ctx=await guardedLaunch(profile,async()=>({close:async()=>{}}),{},deps);await ctx.close();
 const waiting=deferred<{close:()=>Promise<void>}>(),first=guardedLaunch('/isolated/guard-independent-a',()=>waiting.promise,{},deps);
 const independent=await guardedLaunch('/isolated/guard-independent-b',async()=>({close:async()=>{}}),{},deps);await independent.close();waiting.resolve({close:async()=>{}});await (await first).close();
});
it('预检完成到实际 launch 微任务之间取消，不再启动浏览器',async()=>{
 vi.useFakeTimers();const profile='/isolated/guard-before-launch',controller=new AbortController(),lastCleanup=deferred<void>();let removes=0;
 const launch=vi.fn(async()=>({close:async()=>{}}));
 const first=guardedLaunch(profile,launch,{signal:controller.signal},{...deps,removeFile:async()=>{if(++removes===3)await lastCleanup.promise;}});
 const failure=expect(first).rejects.toMatchObject({name:'AbortError'});await vi.advanceTimersByTimeAsync(0);lastCleanup.resolve();await Promise.resolve();await Promise.resolve();controller.abort();await failure;
 expect(launch).not.toHaveBeenCalled();const ctx=await guardedLaunch(profile,launch,{},deps);await ctx.close();
});
it('排队有界超时只退出自己的等待，不能清理或释放原浏览器',async()=>{
 vi.useFakeTimers();const profile='/isolated/guard-queue-timeout',first=await guardedLaunch(profile,async()=>({close:async()=>{}}),{},deps),next=vi.fn(async()=>({close:async()=>{}}));
 const waiting=guardedLaunch(profile,next,{queueTimeoutMs:5},deps),failure=expect(waiting).rejects.toMatchObject({code:'CHROMIUM_PROFILE_LOCKED'});await vi.advanceTimersByTimeAsync(10);await failure;
 expect(next).not.toHaveBeenCalled();expect(liveContextCount(profile)).toBe(1);await first.close();await vi.advanceTimersByTimeAsync(0);expect(next).not.toHaveBeenCalled();
 const final=await guardedLaunch(profile,next,{},deps);await final.close();
});
