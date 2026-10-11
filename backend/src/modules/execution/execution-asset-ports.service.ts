import {executionAssetCredentialSchema} from '@creatoros/contract/execution-worker';
import {createHash} from "node:crypto";
import type {RequestContext} from "@creatoros/contract";
import {assetCredentialSchema,assetRuntimeOptionsSchema} from "@creatoros/contract/execution-worker";
import {canonicalJson} from "../ai/canonical-json";
import {createExecutionCallLedgerService} from "./execution-call-ledger.service";
import {ConflictError} from "./execution.errors";
import {executionRefSchema,workerPortInputSchemas,type ExecutionRef,type WorkerPort} from "@creatoros/contract/execution-worker";
import {createExecutionAssetResultService} from "./execution-asset-result.service";
import {createExecutionProviderJobService} from "./execution-provider-job.service";
import {createExecutionLeaseService} from "./execution-lease.service";
import {bindAssetExecution} from "./asset-execution-binding";
import type {Db} from "@creatoros/backend";
/** 仅命名素材端口，身份、存储路径、格式及预留预算都由后端原任务决定。 */
export function createExecutionAssetPorts(deps:Parameters<typeof createExecutionAssetResultService>[0]&{resolveCredential?:(context:RequestContext,owner:{aiTaskId:string;executionTaskId:string})=>Promise<unknown>;readReference?:(context:RequestContext,assetId:string,fileId:string)=>Promise<{fileId:string;checksum:string;mimeType:string;bytes:Uint8Array}|null>}){
 const results=createExecutionAssetResultService(deps),jobs=createExecutionProviderJobService(deps.db,{now:deps.now});
 const leases=createExecutionLeaseService(deps.db,{now:deps.now});
 return {
  async invoke(execution:ExecutionRef,port:WorkerPort,raw:unknown,signal?:AbortSignal):Promise<unknown>{
   const ref=executionRefSchema.parse(execution);
   if(port==="readAssetReference"){
    const {callId}=workerPortInputSchemas.readAssetReference.parse(raw);
    const bound=await leases.withLease(ref,"admission",async scope=>{
      const {input}=await bindAssetExecution(scope,callId);
      if(!input.reference)throw new ConflictError("素材任务没有参考图");
      return {context:scope.context,reference:input.reference};
    });
    if(!deps.readReference)throw new Error("ASSET_REFERENCE_UNAVAILABLE");
    const value=await deps.readReference(bound.context,bound.reference.assetId,bound.reference.fileId);
    signal?.throwIfAborted();
    if(!value || value.fileId!==bound.reference.fileId || value.checksum!==bound.reference.checksum || value.mimeType!==bound.reference.mimeType || createHash("sha256").update(value.bytes).digest("hex")!==bound.reference.checksum)throw new ConflictError("参考素材版本或字节已变化");
    await leases.withLease(ref,"admission",async scope=>{
      const {input}=await bindAssetExecution(scope,callId);
      if(!input.reference||input.reference.assetId!==bound.reference.assetId||input.reference.fileId!==bound.reference.fileId||input.reference.checksum!==bound.reference.checksum||input.reference.mimeType!==bound.reference.mimeType)throw new ConflictError("参考素材冻结输入已变化");
    });
    return {bytes:value.bytes,mimeType:value.mimeType};
   }
   if(port==="resolveAssetCredential"){
    const {callId}=workerPortInputSchemas.resolveAssetCredential.parse(raw);
    const owner=await leases.withLease(ref,"admission",async scope=>{await bindAssetExecution(scope,callId);return {context:scope.context,aiTaskId:scope.task.ownerId};});
    if(!deps.resolveCredential)throw new Error("ASSET_CREDENTIAL_UNAVAILABLE");
    const credential=executionAssetCredentialSchema.parse(await deps.resolveCredential(owner.context,{aiTaskId:owner.aiTaskId,executionTaskId:ref.executionTaskId}));
    await leases.withLease(ref,"admission",async scope=>{
     const {input}=await bindAssetExecution(scope,callId);
     if("engine" in input){if(!("engine" in credential)||credential.kind!==input.mediaKind||credential.runtimeVersion!==input.runtimeVersion)throw new ConflictError("Codex素材身份不符");return;}
     if("engine" in credential)throw new ConflictError("API任务不能切换Codex");
     const {token:_token,provider,model,baseUrl,serviceId,kind,...rawOptions}=credential;
     const options=assetRuntimeOptionsSchema.parse(rawOptions),digest=(value:unknown)=>`sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
     if(provider!==input.provider || model!==input.model || baseUrl!==input.baseUrl || serviceId!==input.serviceId || kind!==input.mediaKind || digest(options)!==(input.runtimeOptionsDigest??digest({})))throw new ConflictError("素材模型配置与冻结输入不符");
    });
    signal?.throwIfAborted();return credential;
   }
   if(port==="settleAssetCall"){
    const {callId,status}=workerPortInputSchemas.settleAssetCall.parse(raw);
    return leases.withLease(ref,"settlement",async scope=>{
     await bindAssetExecution(scope,callId);
     const call=await createExecutionCallLedgerService(scope.tx as unknown as Db,{now:deps.now,budget:deps.budget}).settle(ref,callId,{status});
     return {callId:call.id,status:call.status};
    });
   }
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
