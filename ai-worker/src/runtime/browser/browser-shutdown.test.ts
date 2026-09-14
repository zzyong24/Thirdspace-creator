import {it,expect,vi} from 'vitest';
import {guardedLaunch,type GuardedLaunchOptions} from './chromium-guard';
import {createBrowserShutdownScope} from './browser-shutdown-scope';
const deps={listProfileProcesses:async()=>[],killPid:async()=>{},removeFile:async()=>{}};
function deferred<T>(){let resolve!:(value:T)=>void;return {promise:new Promise<T>(r=>resolve=r),resolve};}
const options=(scope:ReturnType<typeof createBrowserShutdownScope>,onStopped=async()=>{})=>({shutdownScope:scope,onStopped}) as GuardedLaunchOptions;
it('shutdown只关闭本scope实际ctx，等待close及租约释放，新启动被阻止',async()=>{
 const scope=createBrowserShutdownScope(),other=createBrowserShutdownScope(),physical=deferred<void>(),lease=deferred<void>();
 const close=vi.fn(()=>physical.promise),onStopped=vi.fn(()=>lease.promise),otherClose=vi.fn(async()=>{});
 await guardedLaunch('/shutdown/owned',async()=>({close}),options(scope,onStopped),deps);
 const unrelated=await guardedLaunch('/shutdown/other',async()=>({close:otherClose}),options(other),deps);
 expect(close).not.toHaveBeenCalled();let done=false;const stop=scope.drain().then(()=>done=true);
 await vi.waitFor(()=>expect(close).toHaveBeenCalledOnce());expect(done).toBe(false);expect(onStopped).not.toHaveBeenCalled();
 const launch=vi.fn(async()=>({close:async()=>{}})),unusedRelease=vi.fn(async()=>{});
 await expect(guardedLaunch('/shutdown/new',launch,options(scope,unusedRelease),deps)).rejects.toMatchObject({name:'AbortError'});
 expect(launch).not.toHaveBeenCalled();expect(unusedRelease).toHaveBeenCalledOnce();expect(otherClose).not.toHaveBeenCalled();
 physical.resolve();await vi.waitFor(()=>expect(onStopped).toHaveBeenCalledOnce());expect(done).toBe(false);lease.resolve();await stop;await unrelated.close();
});
it('shutdown等待迟到launch真实关闭，期间不能报告drain完成',async()=>{
 const scope=createBrowserShutdownScope(),launch=deferred<{close:()=>Promise<void>}>(),closed=deferred<void>(),started=deferred<void>(),release=vi.fn(async()=>{});
 const request=guardedLaunch('/shutdown/late',()=>{started.resolve();return launch.promise;},options(scope,release),deps);await started.promise;
 const rejected=expect(request).rejects.toMatchObject({name:'AbortError'});let done=false;const stop=scope.drain().then(()=>done=true);await rejected;expect(done).toBe(false);
 const physical=vi.fn(()=>closed.promise);launch.resolve({close:physical});await vi.waitFor(()=>expect(physical).toHaveBeenCalledOnce());expect(release).not.toHaveBeenCalled();expect(done).toBe(false);
 closed.resolve();await stop;expect(release).toHaveBeenCalledOnce();
});
it('close或租约释放失败必须保留资源，下一次shutdown重试清理',async()=>{
 const scope=createBrowserShutdownScope(),physical=vi.fn().mockRejectedValueOnce(Error('still active')).mockResolvedValue(undefined),release=vi.fn().mockRejectedValueOnce(Error('db unavailable')).mockResolvedValue(undefined);
 await guardedLaunch('/shutdown/retry',async()=>({close:physical}),options(scope,release),deps);
 await expect(scope.drain()).rejects.toThrow();expect(release).not.toHaveBeenCalled();
 await expect(scope.drain()).rejects.toThrow();expect(release).toHaveBeenCalledOnce();
 await scope.drain();expect(release).toHaveBeenCalledTimes(2);
});
it('shutdown取消排队者，仅其未启动租约先释放，活ctx关闭后再释放持有者',async()=>{
 const scope=createBrowserShutdownScope(),closed=deferred<void>(),release=vi.fn(async()=>{}),waitingRelease=vi.fn(async()=>{});
 await guardedLaunch('/shutdown/queued',async()=>({close:()=>closed.promise}),options(scope,release),deps);
 const launch=vi.fn(async()=>({close:async()=>{}}));const next=guardedLaunch('/shutdown/queued',launch,options(scope,waitingRelease),deps);const rejection=expect(next).rejects.toMatchObject({name:'AbortError'});
 const stop=scope.drain();await rejection;expect(waitingRelease).toHaveBeenCalledOnce();expect(release).not.toHaveBeenCalled();expect(launch).not.toHaveBeenCalled();closed.resolve();await stop;expect(release).toHaveBeenCalledOnce();
});
it('整个checkout登记后，等锁期间shutdown也等待新取得租约经guard释放，不实际launch',async()=>{
 const scope=createBrowserShutdownScope(),acquired=deferred<void>(),release=vi.fn(async()=>{}),launch=vi.fn(async()=>({close:async()=>{}}));
 const checkout=scope.trackPending((async()=>{await acquired.promise;return guardedLaunch('/shutdown/acquiring',launch,options(scope,release),deps);})());
 const rejection=expect(checkout).rejects.toMatchObject({name:'AbortError'});let done=false;const stopping=scope.drain().then(()=>done=true);await Promise.resolve();expect(done).toBe(false);
 acquired.resolve();await rejection;await stopping;expect(launch).not.toHaveBeenCalled();expect(release).toHaveBeenCalledOnce();
});
