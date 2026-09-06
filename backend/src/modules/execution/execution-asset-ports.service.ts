import {executionRefSchema,workerPortInputSchemas,type ExecutionRef,type WorkerPort} from "@creatoros/contract/execution-worker";
import {createExecutionAssetResultService} from "./execution-asset-result.service";
import {createExecutionProviderJobService} from "./execution-provider-job.service";
import {createExecutionLeaseService} from "./execution-lease.service";
import {bindAssetExecution} from "./asset-execution-binding";
import type {Db} from "@creatoros/backend";
/** 仅命名素材端口，身份、存储路径、格式及预留预算都由后端原任务决定。 */
export function createExecutionAssetPorts(deps:Parameters<typeof createExecutionAssetResultService>[0]){
 const results=createExecutionAssetResultService(deps),jobs=createExecutionProviderJobService(deps.db,{now:deps.now});
 const leases=createExecutionLeaseService(deps.db,{now:deps.now});
 return {
  async invoke(execution:ExecutionRef,port:WorkerPort,raw:unknown,signal?:AbortSignal):Promise<unknown>{
   const ref=executionRefSchema.parse(execution);
   if(port==="reserveAssetCall"){
    workerPortInputSchemas.reserveAssetCall.parse(raw);
    return leases.withLease(ref,"admission",async scope=>{
     const {input}=await bindAssetExecution(scope);
     // 只预留原输入字节和协议开销，不把供应商未报告用量当零。
     const call=await createExecutionAssetResultService({...deps,db:scope.tx as unknown as Db}).reserve(ref,Buffer.byteLength(input.prompt)+1024);
     return {callId:call.id,status:call.status,...(call.resultText?{resultText:call.resultText}:{})};
    });
   }
   if(port==="startAssetCall"){
    const {callId}=workerPortInputSchemas.startAssetCall.parse(raw),call=await results.start(ref,callId);
    return {callId:call.id,status:call.status};
   }
   if(port==="saveAssetResult"){
    const {callId,bytes}=workerPortInputSchemas.saveAssetResult.parse(raw);return results.save(ref,callId,bytes,signal);
   }
   if(port==="recoverAssetResult"){
    const {callId}=workerPortInputSchemas.recoverAssetResult.parse(raw);return results.recover(ref,callId,signal);
   }
   if(port==="recordAssetProviderJob")return jobs.record(ref,workerPortInputSchemas.recordAssetProviderJob.parse(raw));
   if(port==="readAssetProviderJob")return jobs.read(ref,workerPortInputSchemas.readAssetProviderJob.parse(raw));
   throw new Error("UNSUPPORTED_ASSET_PORT");
  },
 };
}
