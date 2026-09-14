// @vitest-environment node
import {it,expect,vi} from 'vitest';
import {createBrowserHostDisposer} from './browser-host-dispose';
import {createBrowserShutdownScope} from '../../../ai-worker/src/runtime/browser/browser-shutdown-scope';
import {guardedLaunch} from '../../../ai-worker/src/runtime/browser/chromium-guard';
function deferred<T>(){let resolve!:(value:T)=>void;return {promise:new Promise<T>(r=>resolve=r),resolve};}
const guardDeps={listProfileProcesses:async()=>[],killPid:async()=>{},removeFile:async()=>{}};
it('worker等待浏览器退出时并发drain解开等待，真实lease释放后才关DB，并发dispose幂等',async()=>{
 const scope=createBrowserShutdownScope(),physical=deferred<void>(),lease=deferred<void>(),events:string[]=[];
 await guardedLaunch('/dispose/concurrent',async()=>({close:async()=>{events.push('close');physical.resolve();}}),{shutdownScope:scope,onStopped:async()=>{await lease.promise;events.push('lease');}},guardDeps);
 const db=vi.fn(async()=>{events.push('db');});const stopWorkers=vi.fn(async()=>{await physical.promise;events.push('worker');});
 const dispose=createBrowserHostDisposer({browser:scope,stopWorkers,disposeDatabase:db});const first=dispose(),second=dispose();expect(first).toBe(second);
 await vi.waitFor(()=>expect(events).toContain('worker'));expect(db).not.toHaveBeenCalled();lease.resolve();await first;
 expect(events.indexOf('db')).toBeGreaterThan(events.indexOf('lease'));await dispose();expect(db).toHaveBeenCalledOnce();expect(stopWorkers).toHaveBeenCalledOnce();
});
it('worker停止失败仍尝试浏览器清理，资源关闭失败不会先关闭DB，可重试',async()=>{
 const scope=createBrowserShutdownScope(),close=vi.fn().mockRejectedValueOnce(Error('still alive')).mockResolvedValue(undefined),release=vi.fn(async()=>{}),db=vi.fn(async()=>{});
 await guardedLaunch('/dispose/failure',async()=>({close}),{shutdownScope:scope,onStopped:release},guardDeps);
 const stopWorkers=vi.fn().mockRejectedValueOnce(Error('worker stopped late')).mockResolvedValue(undefined);
 const dispose=createBrowserHostDisposer({browser:scope,stopWorkers,disposeDatabase:db});await expect(dispose()).rejects.toThrow('数据库保持开启');expect(close).toHaveBeenCalledOnce();expect(db).not.toHaveBeenCalled();expect(release).not.toHaveBeenCalled();
 await dispose();expect(release).toHaveBeenCalledOnce();expect(db).toHaveBeenCalledOnce();
});
it('迟到launch与lease清理均完成前不关闭DB',async()=>{
 const scope=createBrowserShutdownScope(),started=deferred<void>(),launch=deferred<{close:()=>Promise<void>}>(),closed=deferred<void>(),db=vi.fn(async()=>{});
 const request=guardedLaunch('/dispose/late',()=>{started.resolve();return launch.promise;},{shutdownScope:scope},guardDeps);await started.promise;const rejected=expect(request).rejects.toMatchObject({name:'AbortError'});
 const dispose=createBrowserHostDisposer({browser:scope,stopWorkers:async()=>{},disposeDatabase:db});const stopping=dispose();await rejected;expect(db).not.toHaveBeenCalled();launch.resolve({close:()=>closed.promise});await Promise.resolve();expect(db).not.toHaveBeenCalled();closed.resolve();await stopping;expect(db).toHaveBeenCalledOnce();
});
it('真实PGlite宿主租约在浏览器关闭后释放，数据库dispose观察到releasedAt后才能关闭',async()=>{
 const {createDb,executionBrowserProfileLeases,eq}=await import('@creatoros/backend');
 const {createExecutionBrowserProfileLeaseService}=await import('../../../backend/src/modules/execution/execution-browser-profile-lease.service');
 const f=await createDb(),profiles=createExecutionBrowserProfileLeaseService(f.db),scope=createBrowserShutdownScope();
 const owner={userId:'shutdown-test',domain:'douyin.com',profileKey:'f'.repeat(64),hostInstanceId:'test-host',hostOperationId:'test-operation'};
 const receipt=await profiles.acquireForHost(owner);let physicalClosed=false,dbClosed=false;
 try{
  await guardedLaunch('/dispose/real-lease',async()=>({close:async()=>{physicalClosed=true;}}),{shutdownScope:scope,onStopped:async()=>{expect(physicalClosed).toBe(true);await profiles.releaseAfterHostStopped(owner,receipt.leaseId);}},guardDeps);
  const dispose=createBrowserHostDisposer({browser:scope,stopWorkers:async()=>{},disposeDatabase:async()=>{
   const [row]=await f.db.select().from(executionBrowserProfileLeases).where(eq(executionBrowserProfileLeases.leaseId,receipt.leaseId));expect(row!.releasedAt).not.toBeNull();await f.client.close();dbClosed=true;
  }});
  await dispose();expect(dbClosed).toBe(true);
 }finally{if(!dbClosed)await f.client.close();}
},30000);
