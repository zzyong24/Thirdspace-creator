import {isDeepStrictEqual} from "node:util";
import {eq,executionCalls,type Db} from "@creatoros/backend";
import {providerJobReadSchema,providerJobRecordSchema,type ExecutionRef} from "@creatoros/contract/execution-worker";
import {bindAssetExecution} from "./asset-execution-binding";
import {createExecutionLeaseService} from "./execution-lease.service";
import {ConflictError} from "./execution.errors";

/** 保存外部已提交事实，不创建调用、不清除 unknown，也不改变任务终态或预算。 */
export function createExecutionProviderJobService(db:Db,deps:{now?:()=>string}={}){
 const now=deps.now??(()=>new Date().toISOString()),leases=createExecutionLeaseService(db,{now});
 async function bound(scope:Parameters<Parameters<typeof leases.withLease>[2]>[0],callId:string){
  const binding=await bindAssetExecution(scope,callId);
  if(binding.input.mediaKind!=="video" || !binding.call || !binding.identity)throw new ConflictError("供应商任务号缺少真实视频任务归属");
  return {...binding,call:binding.call,identity:binding.identity};
 }

 return {
  async record(ref:ExecutionRef,raw:unknown){
   const request=providerJobRecordSchema.parse(raw);
   return leases.withLease(ref,"settlement",async scope=>{
    const {call,identity,saved}=await bound(scope,request.callId),job=identity(request.job);
    if(saved){if(!isDeepStrictEqual(saved,job))throw new ConflictError("已提交的供应商任务号不能替换");return saved;}
    if(!["started","unknown"].includes(call.status) || call.startedAttempt!==ref.attempt)throw new ConflictError("未获当前启动权，不能补记供应商提交");
    await scope.tx.update(executionCalls).set({providerJob:job,updatedAt:now()}).where(eq(executionCalls.id,call.id));
    return job;
   });
  },
  async read(ref:ExecutionRef,raw:unknown){
   const {callId}=providerJobReadSchema.parse(raw);
   return leases.withLease(ref,"admission",async scope=>(await bound(scope,callId)).saved);
  },
 };
}
