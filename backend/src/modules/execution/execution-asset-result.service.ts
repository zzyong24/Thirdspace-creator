import type {Db} from "@creatoros/backend";
import {createHash} from 'node:crypto';
import {frozenExecutionEngine,workerPortInputSchemas,readFrozenModelRoute} from '@creatoros/contract/execution-worker';
import {executionRefSchema,type ExecutionRef} from "@creatoros/contract/execution-worker";
import {createPendingGeneratedAssetService,type PendingGeneratedAssetReceipt} from "../assets/pending-generated-asset.service";
import type {ObjectStorageForCtx} from "../assets/assets.service";
import {generatedAssetDescription,deriveName} from "../ai-runtime/generated-asset-metadata";
import {bindAssetExecution} from "./asset-execution-binding";
import {createExecutionLeaseService} from "./execution-lease.service";
import {createExecutionCallLedgerService} from "./execution-call-ledger.service";
import {ConflictError} from "./execution.errors";
import {frozenNonChatModelBindingForCall} from './execution-model-identity.service';

/** SEMANTIC_BOUNDARY_ALLOW: 仅核验原回合已绑定字节的文件格式，不选择创作内容。 */
function nativeImageMime(bytes:Uint8Array){
 const b=Buffer.from(bytes);if(b.length<12||b.length>30*1024*1024)throw new ConflictError('Codex图片格式或大小无效');
 if(b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';
 if(b[0]===255&&b[1]===216&&b[2]===255)return 'image/jpeg';
 if(b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP')return 'image/webp';
 throw new ConflictError('Codex图片格式无效');
}
type Budget=Parameters<typeof createExecutionCallLedgerService>[1]["budget"];
/** 后端素材端口：只提交 pending 原产物，候选采纳由业务服务另行完成。 */
export function createExecutionAssetResultService(deps:{db:Db;now:()=>string;budget:Budget;objectStorageForCtx:ObjectStorageForCtx}){
 const {db,now}=deps,leases=createExecutionLeaseService(db,{now});
 const ledger=(database=db)=>createExecutionCallLedgerService(database,{now,budget:deps.budget});
 async function binding(ref:ExecutionRef,callId:string){
  return leases.withLease(ref,"settlement",async scope=>{
   const bound=await bindAssetExecution(scope,callId);
   if(!bound.call || !["started","unknown","settled"].includes(bound.call.status) || (!bound.call.startedAttempt&&!bound.legacyRecovery))throw new ConflictError("素材缺少原调用的实际启动事实");
   return {...bound,call:bound.call,context:scope.context,payload:scope.task.payload,task:scope.task};
  });
 }
 const operationKey=(callId:string)=>`execution-asset:${callId}`;
 function assets(ref:ExecutionRef,callId:string){
  return createPendingGeneratedAssetService({db,now,objectStorageForCtx:deps.objectStorageForCtx,
   authorize:async(ctx,key,tx)=>{
    if(key!==operationKey(callId))throw new ConflictError("素材操作键与原调用不符");
    await createExecutionLeaseService(tx as unknown as Db,{now}).withLease(ref,"admission",async scope=>{
     const bound=await bindAssetExecution(scope,callId);
     if(ctx.userId!==scope.context.userId || ctx.accountId!==scope.context.accountId || !bound.call || !["started","unknown"].includes(bound.call.status) || (!bound.call.startedAttempt&&!bound.legacyRecovery))throw new ConflictError("素材提交缺少当前归属或原启动事实");
    });
   },
  });
 }
 async function settle(ref:ExecutionRef,callId:string,receipt:PendingGeneratedAssetReceipt){
  // 保存素材与账本是两个可恢复事务；每次补账重新核对当前 fence 与双向业务映射。
  await leases.withLease(ref,"settlement",async scope=>{
   const bound=await bindAssetExecution(scope,callId);
   if(!bound.call || !["started","unknown","settled"].includes(bound.call.status))throw new ConflictError("原调用不可结算素材");
   const original=(scope.task.payload as {codexCalls?:Record<string,{nativeResult?:{usage:Record<string,number|null>|null}}>}).codexCalls?.[callId]?.nativeResult;
   const reported=original?.usage,usage=reported?Object.fromEntries(Object.entries(reported).filter(([key,value])=>['inputTokens','outputTokens','totalTokens'].includes(key)&&value!==null)):{};
   await ledger(scope.tx as unknown as Db).settle(ref,callId,{status:"settled",usage,resultText:JSON.stringify(receipt)});
  });
  return receipt;
 }
 return {
  async reserve(execution:ExecutionRef,reservedTokens:number){
   const ref=executionRefSchema.parse(execution);
   return leases.withLease(ref,"admission",async scope=>{
    const {input,digest}=await bindAssetExecution(scope);
    if(readFrozenModelRoute(scope.task.payload,input.mediaKind,input.capability)){
     const synthetic={executionTaskId:scope.task.id,kind:"model",parentCallId:null,operationKey:input.operationKey,inputDigest:digest};
     if(!frozenNonChatModelBindingForCall(scope.task,synthetic))throw new ConflictError("MODEL_ROUTE_IDENTITY_CHANGED");
    }
    const recovery=(scope.task.payload as {assetLegacyRecovery?:{callId:string}}).assetLegacyRecovery;
    if(recovery){
     const bound=await bindAssetExecution(scope,recovery.callId);
     if(!bound.call||!bound.saved||!["unknown","started","settled"].includes(bound.call.status))throw new ConflictError("历史素材缺少原提交事实，不能创建调用");
     return bound.call;
    }
    return ledger(scope.tx as unknown as Db).reserve(ref,{operationKey:input.operationKey,kind:"model",inputDigest:digest,reservedTokens,...(scope.task.retryOfCallId?{retryOfCallId:scope.task.retryOfCallId}:{})});
   });
  },
  async start(execution:ExecutionRef,callId:string){
   const ref=executionRefSchema.parse(execution);
   return leases.withLease(ref,"admission",async scope=>{
    await bindAssetExecution(scope,callId);
    if((scope.task.payload as {assetLegacyRecovery?:unknown}).assetLegacyRecovery)throw new ConflictError("历史素材恢复没有新提交权限");
    return ledger(scope.tx as unknown as Db).start(ref,callId);
   });
  },
  async save(execution:ExecutionRef,callId:string,rawBytes:Uint8Array,signal?:AbortSignal){
   const ref=executionRefSchema.parse(execution),bytes=new Uint8Array(rawBytes);
   signal?.throwIfAborted();const bound=await binding(ref,callId);
   // 新执行只可保存原供应商任务号续查的结果；无任务号的旧启动只能回读已保存对象。
   const native=(bound.payload as {codexCalls?:Record<string,{threadId?:string;turnId?:string;nativeResult?:unknown}>}).codexCalls?.[callId];
   const result=workerPortInputSchemas.bindCodexCall.shape.nativeResult.safeParse(native?.nativeResult);
   const own=readFrozenModelRoute(bound.payload,bound.input.mediaKind,bound.input.capability);
   const codexOriginal='engine' in bound.input&&bound.input.engine==='codex'&&(own?frozenNonChatModelBindingForCall(bound.task,bound.call)?.route.source==='codex':frozenExecutionEngine(bound.payload)==='codex')&&native?.threadId&&native.turnId&&result.success&&result.data&&result.data.checksum===`sha256:${createHash('sha256').update(bytes).digest('hex')}`;
   if('engine' in bound.input&&!codexOriginal)throw new ConflictError('Codex图片字节与原回合事实不符');
   if(bound.call.startedAttempt!==ref.attempt && !bound.saved&&!codexOriginal)throw new ConflictError("新执行缺少原供应商任务号，不能提交新字节");
   const input=bound.input;
   const receipt=await assets(ref,callId).submit(bound.context,{
    operationKey:operationKey(callId),assetType:input.mediaKind,mimeType:codexOriginal?nativeImageMime(bytes):input.mediaKind==="image"?"image/png":"video/mp4",
    name:bound.name??deriveName(input.prompt,input.mediaKind),description:generatedAssetDescription(input.prompt),bytes,
   },signal);
   return settle(ref,callId,receipt);
  },
  async recover(execution:ExecutionRef,callId:string,signal?:AbortSignal){
   const ref=executionRefSchema.parse(execution),bound=await binding(ref,callId);
   const result=await assets(ref,callId).recover(bound.context,operationKey(callId),signal);
   if(result.status!=="committed")return result;
   return {status:"committed" as const,receipt:await settle(ref,callId,result.receipt)};
  },
 };
}
