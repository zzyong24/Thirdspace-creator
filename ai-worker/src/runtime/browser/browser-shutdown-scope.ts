/** 本宿主生命周期容器，仅接收 guardedLaunch 自建资源。 */
export function createBrowserShutdownScope(){
 const controller=new AbortController();
 const pending=new Set<Promise<unknown>>(),resources=new Set<()=>Promise<void>>();
 let draining:Promise<void>|undefined;
 const seal=()=>{if(!controller.signal.aborted)controller.abort(new DOMException('应用正在退出，已停止新建浏览器','AbortError'));};
 return {
  signal:controller.signal,seal,
  trackPending<T>(work:Promise<T>){pending.add(work);void work.then(()=>pending.delete(work),()=>pending.delete(work));return work;},
  register(stop:()=>Promise<void>){resources.add(stop);return ()=>{resources.delete(stop);};},
  drain():Promise<void>{
   seal();if(draining)return draining;
   const work=(async()=>{
    // 停止实际ctx与等待迟到launch同时进行；迟到资源注册后由下一轮继续关闭。
    while(resources.size||pending.size){
     const closing=[...resources].map(stop=>Promise.resolve().then(stop));
     const results=await Promise.allSettled([...closing,...pending]);
     const failures=results.slice(0,closing.length).filter(result=>result.status==='rejected');
     if(failures.length)throw new Error('浏览器或登录档案尚未完成关闭，数据库保持开启');
    }
   })();
   draining=work;void work.then(()=>{draining=undefined;},()=>{draining=undefined;});return work;
  },
 };
}
export type BrowserShutdownScope=ReturnType<typeof createBrowserShutdownScope>;
export const hostBrowserShutdownScope=createBrowserShutdownScope();
