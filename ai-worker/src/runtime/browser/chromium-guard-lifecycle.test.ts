import {afterEach,it,expect,vi} from 'vitest';
import {guardedLaunch,liveContextCount,retryBrowserProfileCleanup} from './chromium-guard';
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
it('实际关闭后才通知宿主释放租约，释放完成前不放行队列',async()=>{
 vi.useFakeTimers();const profile='/isolated/guard-host-release',confirmation=deferred<void>(),onStopped=vi.fn(()=>confirmation.promise),physicalClose=vi.fn(async()=>{});
 const first=await guardedLaunch(profile,async()=>({close:physicalClose}),{onStopped},deps);
 expect(onStopped).not.toHaveBeenCalled();const closing=first.close();await vi.advanceTimersByTimeAsync(0);
 expect(physicalClose).toHaveBeenCalledTimes(1);expect(onStopped).toHaveBeenCalledTimes(1);
 const next=vi.fn(async()=>({close:async()=>{}})),second=guardedLaunch(profile,next,{},deps);await vi.advanceTimersByTimeAsync(0);expect(next).not.toHaveBeenCalled();
 confirmation.resolve();await closing;await (await second).close();expect(onStopped).toHaveBeenCalledTimes(1);
});
it('启动超时不通知宿主释放，迟到 context 实际关闭后才通知',async()=>{
 vi.useFakeTimers();const profile='/isolated/guard-late-host-release',closing=deferred<void>(),launch=deferred<{close:()=>Promise<void>}>(),onStopped=vi.fn(async()=>{});
 const pending=guardedLaunch(profile,()=>launch.promise,{timeoutMs:5,onStopped},deps),failure=expect(pending).rejects.toThrow('启动超时');
 await vi.advanceTimersByTimeAsync(10);await failure;expect(onStopped).not.toHaveBeenCalled();
 launch.resolve({close:()=>closing.promise});await vi.advanceTimersByTimeAsync(0);expect(onStopped).not.toHaveBeenCalled();closing.resolve();await vi.advanceTimersByTimeAsync(0);expect(onStopped).toHaveBeenCalledTimes(1);
});
it('关闭失败不通知宿主；释放失败可通过再次关闭重试且不提前放行',async()=>{
 vi.useFakeTimers();const profile='/isolated/guard-host-release-failed',onStopped=vi.fn().mockRejectedValueOnce(Error('db unavailable')).mockResolvedValue(undefined),physical=vi.fn().mockRejectedValueOnce(Error('still live')).mockResolvedValue(undefined);
 const ctx=await guardedLaunch(profile,async()=>({close:physical}),{onStopped},deps);
 await expect(ctx.close()).rejects.toThrow('still live');expect(onStopped).not.toHaveBeenCalled();
 await expect(ctx.close()).rejects.toThrow('db unavailable');expect(liveContextCount(profile)).toBe(1);
 await ctx.close();expect(onStopped).toHaveBeenCalledTimes(2);expect(liveContextCount(profile)).toBe(0);
});
it('普通启动失败与锁重试仅在最终停止时通知宿主一次',async()=>{
 const onStopped=vi.fn(async()=>{});let attempts=0;
 await expect(guardedLaunch('/isolated/guard-host-final-failure',async()=>{attempts++;throw Object.assign(Error('locked'),{code:'EBUSY'});},{onStopped},deps)).rejects.toMatchObject({code:'CHROMIUM_PROFILE_LOCKED'});
 expect(attempts).toBe(2);expect(onStopped).toHaveBeenCalledTimes(1);
});
it('启动失败未返回context时，宿主可用同一清理凭证恢复释放',async()=>{
 const onStopped=vi.fn().mockRejectedValueOnce(Error('db temporary')).mockResolvedValue(undefined),profile='/isolated/guard-host-cleanup-handle';
 const error=await guardedLaunch(profile,async()=>{throw Error('launch failed');},{onStopped},deps).catch(error=>error);
 expect(error.code).toBe('BROWSER_CLEANUP_PENDING');expect(typeof error.retryCleanup).toBe('function');
 await error.retryCleanup();expect(onStopped).toHaveBeenCalledTimes(2);
 const next=await guardedLaunch(profile,async()=>({close:async()=>{}}),{},deps);await next.close();
});
it('超时后的迟到资源已停但释放失败，后继请求重试原清理后再启动',async()=>{
 vi.useFakeTimers();const profile='/isolated/guard-late-host-cleanup-retry',launch=deferred<{close:()=>Promise<void>}>(),onStopped=vi.fn().mockRejectedValueOnce(Error('db down')).mockResolvedValue(undefined);
 const pending=guardedLaunch(profile,()=>launch.promise,{timeoutMs:5,onStopped},deps),failure=expect(pending).rejects.toThrow('启动超时');await vi.advanceTimersByTimeAsync(10);await failure;
 launch.resolve({close:async()=>{}});await vi.advanceTimersByTimeAsync(0);expect(onStopped).toHaveBeenCalledTimes(1);expect(liveContextCount(profile)).toBe(1);
 const next=await guardedLaunch(profile,async()=>({close:async()=>{}}),{},deps);expect(onStopped).toHaveBeenCalledTimes(2);await next.close();expect(liveContextCount(profile)).toBe(0);
});
it('宿主清理等待超时不重复结算或释放占用，原清理仍可完成',async()=>{
 vi.useFakeTimers();const profile='/isolated/guard-host-pending-timeout',settlement=deferred<void>(),onStopped=vi.fn(()=>settlement.promise);
 const ctx=await guardedLaunch(profile,async()=>({close:async()=>{}}),{onStopped},deps),closing=ctx.close();await vi.advanceTimersByTimeAsync(0);
 const waiting=retryBrowserProfileCleanup(profile,{queueTimeoutMs:5}),failure=expect(waiting).rejects.toMatchObject({code:'BROWSER_CLEANUP_PENDING'});await vi.advanceTimersByTimeAsync(10);await failure;
 expect(onStopped).toHaveBeenCalledTimes(1);expect(liveContextCount(profile)).toBe(1);settlement.resolve();await closing;expect(liveContextCount(profile)).toBe(0);
});
