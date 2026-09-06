/** 仅限无副作用准备读取：停止等待后拒绝迟到结果，调用方不得在 work 内提交任务。 */
export function awaitPreparation<T>(work:()=>Promise<T>,signal?:AbortSignal):Promise<T>{
 if(!signal)return work();
 signal.throwIfAborted();
 return new Promise<T>((resolve,reject)=>{
  const abort=()=>{signal.removeEventListener("abort",abort);reject(signal.reason);};
  signal.addEventListener("abort",abort,{once:true});
  Promise.resolve().then(()=>{signal.throwIfAborted();return work();}).then(result=>{
   signal.removeEventListener("abort",abort);if(signal.aborted)reject(signal.reason);else resolve(result);
  },error=>{signal.removeEventListener("abort",abort);reject(error);});
 });
}
