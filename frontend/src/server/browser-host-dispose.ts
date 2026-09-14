/** 关机先封闭浏览器入口；等任务和自建浏览器都停止后才能关闭租约所在数据库。 */
export function createBrowserHostDisposer(deps:{browser:{seal():void;drain():Promise<void>};stopWorkers():Promise<void>;disposeDatabase():Promise<void>}){
 let pending:Promise<void>|undefined,disposed=false;
 return ():Promise<void>=>{
  if(disposed)return Promise.resolve();if(pending)return pending;
  deps.browser.seal();
  const work=(async()=>{
   const stopped=await Promise.allSettled([Promise.resolve().then(deps.stopWorkers),Promise.resolve().then(()=>deps.browser.drain())]);
   if(stopped.some(result=>result.status==='rejected'))throw new Error('任务或浏览器尚未完成停止，数据库保持开启');
   await deps.disposeDatabase();disposed=true;
  })();
  pending=work;void work.catch(()=>{pending=undefined;});return work;
 };
}
