import 'server-only';
export type HostBrowserProfileAcquire=(authDir:string,signal?:AbortSignal)=>Promise<{authDir:string;onStopped():Promise<void>}>;
const key=Symbol.for('creatoros.hostDouyinProfileLifecycle');
const registry=globalThis as typeof globalThis & {[key]?:HostBrowserProfileAcquire};
/** 正式宿主装配唯一授权入口；全部旧抖音checkout复用同一个跨进程租约服务。 */
export function configureHostBrowserProfileLifecycle(acquire:HostBrowserProfileAcquire){registry[key]=acquire;}
export function acquireHostBrowserProfile(authDir:string,signal?:AbortSignal){
 const acquire=registry[key];
 if(!acquire)throw new Error('抖音账号浏览器资源尚未初始化');
 return acquire(authDir,signal);
}
