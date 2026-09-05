import { createExecutionGenerationPorts } from "./execution-generation-ports.service";
import { eq,executionTasks,type Db } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import { workerPortInputSchemas,workerModelSpecSchema,type ExecutionRef } from "@creatoros/contract/execution-worker";
import { createExecutionCandidateService,type ExecutionCandidateDeps } from "../ai/execution-candidate.service";
import { createExecutionLeaseService } from "./execution-lease.service";
import { createExecutionWorkerCallPorts } from "./execution-worker-call-ports.service";
import { createExecutionWorkerOutcomeService } from "./execution-worker-outcome.service";
import { createPersistentTaskService } from "./persistent-task.service";
import { createWorkerSupervisor } from "./worker-supervisor";

export interface ModelWorkerDispatcherDeps extends ExecutionCandidateDeps {
  entryPath:string;
  workerId:string;
  budget:{maxCalls:number;maxTokens:number;deadlineMs:number};
  /** 生产适配器须按业务任务读取已冻结模型权威；不能只按当前账号设置猜测。 */
  resolveModelCredential(context:RequestContext,capability:string,owner:{aiTaskId:string;executionTaskId:string}):Promise<unknown>;
  pollMs?:number;
  onError?(code:string):void;
}
/** 后端调度宿主：只领取已冻结输入的模型任务；模型与SDK生命周期在独立Worker。 */
export function createModelWorkerDispatcher(db:Db,deps:ModelWorkerDispatcherDeps){
  const now=deps.now ?? (()=>new Date().toISOString());
  const leases=createExecutionLeaseService(db,{now});
  const tasks=createPersistentTaskService(db,{now});
  const calls=createExecutionWorkerCallPorts(db,{now,budget:deps.budget});
  const generation=createExecutionGenerationPorts(db,{now,budget:deps.budget});
  const outcomes=createExecutionWorkerOutcomeService(db,{now});
  const candidates=createExecutionCandidateService(db,deps);
  let stopping=false;
  let timer:ReturnType<typeof setTimeout>|undefined;
  let draining:Promise<number>|undefined;
  const report=(code:string)=>{try{deps.onError?.(code);}catch{/* 诊断订阅故障不改变执行。 */}};
  const supervisor=createWorkerSupervisor({entryPath:deps.entryPath,ports:{
    async validate(ref,mode){await leases.withLease(ref,mode,async()=>{});},
    async invoke(ref,port,raw){
      if(port==="reserveGenerationCall")return generation.reserveGenerationCall(ref,raw);
      if(port==="settleGenerationCall")return generation.settleGenerationCall(ref,raw);
      if(port==="saveGenerationResult")return generation.saveGenerationResult(ref,raw);
      if(port==="readTaskContext")return calls.readTaskContext(ref);
      if(port==="reserveCall")return calls.reserveCall(ref,raw);
      if(port==="startCall")return calls.startCall(ref,raw);
      if(port==="settleCall")return calls.settleCall(ref,raw);
      if(port==="resolveModelCredential"){
        const input=workerPortInputSchemas.resolveModelCredential.parse(raw);
        const modelInput=await calls.readTaskContext(ref);
        if(input.capability!==modelInput.capability)throw new Error("MODEL_CAPABILITY_MISMATCH");
        const scope=await leases.withLease(ref,"admission",async({context,task})=>({context,aiTaskId:task.ownerId}));
        const credential=workerModelSpecSchema.parse(await deps.resolveModelCredential(scope.context,input.capability,{aiTaskId:scope.aiTaskId,executionTaskId:ref.executionTaskId}));
        // 凭据解析期间可能取消，返回私有凭据前再检查当前执行。
        await leases.withLease(ref,"admission",async()=>{});
        return credential;
      }
      if(port==="commitResult"){
        const input=workerPortInputSchemas.commitResult.parse(raw);
        return input.outcome==="succeeded" ? candidates.commitResult(ref,input) : outcomes.recordFailure(ref,input);
      }
      if(port==="heartbeat")return leases.withLease(ref,"admission",async({tx,task})=>{
        await tx.update(executionTasks).set({heartbeatAt:now(),leaseExpiresAt:new Date(Date.parse(now())+60000).toISOString()}).where(eq(executionTasks.id,task.id));
        return {};
      });
      throw new Error("UNSUPPORTED_MODEL_WORKER_PORT");
    },
  }});
  async function acknowledge(ref:ExecutionRef){
    await leases.withLease(ref,"settlement",async({tx,task})=>{
      const status=task.status==="pause_requested" ? "paused" : task.status==="cancel_requested" ? "cancelled" : null;
      if(status)await tx.update(executionTasks).set({status,leaseOwner:null,leaseExpiresAt:null,heartbeatAt:null,updatedAt:now()}).where(eq(executionTasks.id,task.id));
    });
  }
  const drainOnce=():Promise<number>=>{
    if(draining)return draining;
    if(stopping)return Promise.resolve(0);
    draining=(async()=>{
      await tasks.recoverExpiredLeases();
      let count=0;
      while(!stopping){
        const claim=await tasks.claimNext({workerId:deps.workerId,kinds:["ai_task"],executionMode:"model"});
        if(!claim || stopping)break;
        const ref={executionTaskId:claim.task.id,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
        let watching=true;
        let controlTimer:ReturnType<typeof setTimeout>|undefined;
        const watch=async()=>{
          try{
            const status=await leases.withLease(ref,"settlement",async({task})=>task.status);
            if(watching && (status==="pause_requested" || status==="cancel_requested"))supervisor.cancel(ref);
          }catch{if(watching){try{supervisor.cancel(ref);}catch{/* 进程可能已经退出。 */}}}
          if(watching)controlTimer=setTimeout(()=>{void watch();},250);
        };
        controlTimer=setTimeout(()=>{void watch();},250);
        try{
          const deadline=await leases.withLease(ref,"admission",async({task})=>task.deadlineAt);
          if(stopping)break;
          if(!deadline)throw new Error("PREPARED_DEADLINE_MISSING");
          await supervisor.run(ref,Date.parse(deadline));
        }catch{
          // 不推测外部提交结果；持久恢复按调用账本决定恢复/待对账，禁止换键重放。
          report("MODEL_WORKER_RUN_INTERRUPTED");
        }finally{
          watching=false;if(controlTimer)clearTimeout(controlTimer);
          await acknowledge(ref).catch(()=>{});
        }
        count++;
      }
      return count;
    })().finally(()=>{draining=undefined;});
    return draining;
  };
  const tick=async()=>{
    try{await drainOnce();}catch{report("MODEL_WORKER_POLL_FAILED");}
    if(!stopping)timer=setTimeout(()=>{void tick();},Math.max(100,deps.pollMs ?? 1000));
  };
  return {
    drainOnce,
    start(){if(timer || draining || stopping)return;void tick();},
    async stop(){stopping=true;if(timer)clearTimeout(timer);await supervisor.stop();await draining;},
  };
}
