import {localCodexWorkerEnv} from './local-codex-worker-env';
import type {ExecutionRef} from "@creatoros/contract/execution-worker";
import {createWorkerSupervisor,type WorkerSupervisorPorts} from "./worker-supervisor";

/** 监督已经领取的业务任务；租约归属、调用预算、回执恢复仍由各业务端口负责。 */
export function createClaimedWorkerSupervision(deps:{entryPath:string|(()=>string)}) {
 let stopping=false;
 const active=new Set<ReturnType<typeof createWorkerSupervisor>>();
 return {
  isStopping:()=>stopping,
  async run(input:{ref:ExecutionRef;deadlineAt:number|null;ports:WorkerSupervisorPorts;verify():Promise<unknown>;isClosed():boolean;close():void;hasDurableOutcome():boolean}) {
   if(stopping)throw new Error("CLAIMED_WORKER_STOPPING");
   const worker=createWorkerSupervisor({extraEnv:localCodexWorkerEnv(),entryPath:typeof deps.entryPath==="function"?deps.entryPath():deps.entryPath,ports:input.ports});
   active.add(worker);
   let checking=false;
   const timer=setInterval(()=>{
    if(checking||input.isClosed())return;
    checking=true;
    void input.verify().catch(()=>{if(!input.isClosed())worker.cancel(input.ref);}).finally(()=>{checking=false;});
   },250);
   try{return await worker.run(input.ref,input.deadlineAt);}
   finally {
    input.close();clearInterval(timer);
    try{await worker.stop();active.delete(worker);}
    catch(error){
     // 已保存业务结果不回滚，但未确认退出的进程必须继续被宿主持有，不能从停机清单消失。
     if(!input.hasDurableOutcome())throw error;
     console.error("[execution-worker] 任务结果已保存，进程清理仍待确认");
    }
   }
  },
  async stop(){stopping=true;await Promise.all([...active].map(async worker=>{await worker.stop();active.delete(worker);}));},
 };
}
