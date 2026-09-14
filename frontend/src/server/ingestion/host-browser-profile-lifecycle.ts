import 'server-only';
export type HostBrowserProfileAcquire = (authDir: string, signal?: AbortSignal) => Promise<{
  authDir: string;
  onStopped(): Promise<void>;
}>;
export type HostBrowserProfileResolve = (authDir: string, signal?: AbortSignal) => Promise<{
  userId: string;
  authDir: string;
  profileKey: string;
}>;
const key = Symbol.for('creatoros.hostDouyinProfileLifecycle');
const registry = globalThis as typeof globalThis & {
  [key]?: {
    acquire: HostBrowserProfileAcquire;
    resolve: HostBrowserProfileResolve;
  };
};
/** 正式宿主装配唯一授权入口；全部旧抖音checkout复用同一个跨进程租约服务。 */
export function configureHostBrowserProfileLifecycle(acquire: HostBrowserProfileAcquire, resolve: HostBrowserProfileResolve) {
  registry[key] = {
    acquire, resolve
  };
}
export function acquireHostBrowserProfile(authDir: string, signal?: AbortSignal) {
  const acquire = registry[key]?.acquire;
  if (!acquire)
    throw new Error('抖音账号浏览器资源尚未初始化');
  return acquire(authDir, signal);
}
/** 即使复用现有浏览器，每次借用仍须重新核对用户与规范目录授权。 */
export function resolveHostBrowserProfile(authDir: string, signal?: AbortSignal) {
  const resolve = registry[key]?.resolve;
  if (!resolve)
    throw new Error('抖音账号浏览器授权尚未初始化');
  return resolve(authDir, signal);
}
