import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { asc, eq, executionCalls, executionTasks, type Db } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import {
  codexExecutionSpec,frozenExecutionEngine,readFrozenModelRoute,workerPortInputSchemas, transcribePostprocessPlanSchema, transcribePostprocessResultSchema,
  transcribePostprocessPreparationSchema, transcribePostprocessReservationSchema,
  type TranscribePostprocessPlan, type TranscribePostprocessResult, type ExecutionRef, type WorkerPort,
} from "@creatoros/contract/execution-worker";
import { replayStructuredGeneration, generationRequestDigest, type GenerationReplayReceipt } from "@creatoros/ai-worker/chat";
import { providerIdentityFor, structuredModeForIdentity } from "@creatoros/ai-worker/model-identity";
import {
  TRANSCRIPT_POSTPROCESS_TEMPLATE, TRANSCRIPT_POSTPROCESS_SCHEMA, TRANSCRIPT_POSTPROCESS_CAPABILITY,
  buildTranscriptPostprocessNode, checkTranscriptFidelity, isTranscriptExecutionControlError,
} from "@creatoros/ai-worker/transcript-postprocess";
import { createExecutionLeaseService } from "./execution-lease.service";
import { createExecutionCallLedgerService } from "./execution-call-ledger.service";
import { createExecutionAsrPorts } from "./execution-asr-ports.service";
import { bindTranscribeExecution, type TranscribeExecutionScope } from "./transcribe-execution-binding";
import { prepareExecutionModelIdentity } from "./execution-model-identity.service";
import { awaitPreparation } from "./await-preparation";
import { ConflictError, ExecutionBudgetError } from "./execution.errors";

type Call = typeof executionCalls.$inferSelect;
const entrySchema = z.object({plan:transcribePostprocessPlanSchema,result:transcribePostprocessResultSchema.optional()}).strict();
const entriesSchema = z.record(z.string(),entrySchema);
const contextSchema = z.object({accountPositioning:z.string().max(200000).optional(),title:z.string().max(10000).optional()}).strict();
const templateVersion = `${TRANSCRIPT_POSTPROCESS_TEMPLATE.id}/${TRANSCRIPT_POSTPROCESS_TEMPLATE.version}`;
const templateDigest = generationRequestDigest({template:TRANSCRIPT_POSTPROCESS_TEMPLATE,schema:TRANSCRIPT_POSTPROCESS_SCHEMA});
const sourceDigest = (source: unknown) => generationRequestDigest({source});
const planKey = (awemeId:string, plan:Omit<TranscribePostprocessPlan,"operationKey">) => `transcribe:${awemeId}/postprocess:${generationRequestDigest(plan).slice(7)}`;
const fallback = (plan:TranscribePostprocessPlan, reason:string):TranscribePostprocessResult => ({applied:false,transcript:plan.transcript,reason});

/** 只扩展转写命名端口；预算、调用、租约继续使用既有 execution_calls，不建立第二套账本。 */
export function createExecutionTranscribePostprocessService(db:Db,deps:{
  budget:Parameters<typeof createExecutionCallLedgerService>[1]["budget"];
  now?:()=>string;
  maxOutputTokens?:number;
  resolveModelSpec(context:RequestContext,capability:string,owner:{aiTaskId:string},signal?:AbortSignal):Promise<unknown|null>;
  readContext(context:RequestContext,awemeId:string,signal?:AbortSignal):Promise<{accountPositioning?:string;title?:string}>;
}) {
  const leases=createExecutionLeaseService(db,deps);
  const ledgerFor=(scope:TranscribeExecutionScope)=>createExecutionCallLedgerService(scope.tx as unknown as Db,deps);
  const limit=z.number().int().positive().max(65536).parse(deps.maxOutputTokens??8192);
  async function state(scope:TranscribeExecutionScope,awemeId:string,checkSource:boolean) {
    const bound=await bindTranscribeExecution(scope,awemeId);
    const entries=entriesSchema.parse(bound.payload.transcribePostprocess??{}),entry=entries[awemeId];
    const calls=await scope.tx.select().from(executionCalls).where(eq(executionCalls.executionTaskId,scope.task.id)).orderBy(asc(executionCalls.sequence));
    if(entry){
      const {operationKey,...body}=entry.plan;
      if(operationKey!==planKey(awemeId,body))throw new ConflictError("后处理冻结输入摘要不符");
    } else if(calls.some(call=>call.operationKey.startsWith(`transcribe:${awemeId}/postprocess:`)))throw new ConflictError("已有后处理调用缺少原冻结输入");
    let original:string|undefined, digest:string|undefined;
    if(checkSource){
      // 在同一任务行锁与事务中回读所有 ASR 分片；不信任 Worker 提交的原文。
      const source=await createExecutionAsrPorts(scope.tx as unknown as Db,deps).read(scopeRef(scope),{awemeId});
      if(!source)throw new ConflictError("后处理需要完整已确认的 ASR 原文");
      original=source.result.text;digest=sourceDigest(source);
      if(entry&&(entry.plan.sourceDigest!==digest||entry.plan.transcript!==original))throw new ConflictError("后处理原文与 ASR 回执不符");
    }
    return {...scope,...bound,awemeId,entries,entry,calls,original,digest};
  }
  function scopeRef(scope:TranscribeExecutionScope):ExecutionRef {return {executionTaskId:scope.task.id,attempt:scope.task.attempt,fenceToken:scope.task.fenceToken!};}
  const access=<T>(ref:ExecutionRef,awemeId:string,mode:"admission"|"settlement",action:(value:Awaited<ReturnType<typeof state>>)=>Promise<T>)=>leases.withLease(ref,mode,async scope=>action(await state(scope,awemeId,mode==="admission")));
  type State=Awaited<ReturnType<typeof state>>;
  function selected(value:State){if(!value.entry)throw new ConflictError("后处理尚未准备");return value.entry;}
  function callsFor(value:State,plan=selected(value).plan){
    const calls=value.calls.filter(call=>call.operationKey.startsWith(`transcribe:${value.awemeId}/postprocess:`));
    for(let index=0;index<calls.length;index++){
      const call=calls[index]!;
      if(call.operationKey!==`${plan.operationKey}/model/${index+1}`||call.kind!=="model"||call.accountingBasis!=="tokens"||call.parentCallId||call.toolExecutionClaimId||call.retryOfCallId)throw new ConflictError("后处理模型调用序列或归属不符");
    }
    return calls;
  }
  function receipts(calls:Call[]):GenerationReplayReceipt[]{return calls.map(call=>{
    if(call.status==="settled"&&call.providerResult&&call.totalTokens!==null)return {inputDigest:call.inputDigest,status:"settled",providerResult:call.providerResult};
    if(call.status==="rejected"&&call.rejectionCode==="STRUCTURED_PROTOCOL_UNSUPPORTED")return {inputDigest:call.inputDigest,status:"rejected",rejectionCode:call.rejectionCode};
    throw new ConflictError("后处理调用尚未核对，不能重放或降级");
  });}
  async function replay(plan:TranscribePostprocessPlan,rows:Call[],signal?:AbortSignal,captureNodeFailure=false){
    if(!plan.identity||plan.templateVersion!==templateVersion||plan.templateDigest!==templateDigest)throw new ConflictError("后处理模板或模型身份与当前节点不符");
    const node=await buildTranscriptPostprocessNode(plan);
    return replayStructuredGeneration<{correctedText?:unknown}>({...providerIdentityFor(plan.identity),structuredOutputMode:structuredModeForIdentity(plan.identity),receipts:receipts(rows),signal,captureNodeFailure},node);
  }
  async function persist(value:State,awemeId:string,entry:z.infer<typeof entrySchema>){
    const frozen=entrySchema.parse(entry);
    await value.tx.update(executionTasks).set({payload:{...value.payload,transcribePostprocess:{...value.entries,[awemeId]:frozen}}}).where(eq(executionTasks.id,value.task.id));
    return frozen;
  }
  async function terminal(value:State,signal?:AbortSignal):Promise<TranscribePostprocessResult|null>{
    const entry=selected(value);if(entry.result)return entry.result;
    const rows=callsFor(value);if(!rows.length)return null;
    const last=rows.at(-1)!;
    if(last.status==="reserved"){receipts(rows.slice(0,-1));return null;}
    if(last.status==="rejected"&&last.rejectionCode!=="STRUCTURED_PROTOCOL_UNSUPPORTED"){
      // 之前每个请求都必须是原节点允许的请求，且最后有明确拒绝事实。
      const expected=await replay(entry.plan,rows.slice(0,-1),signal);
      if(expected.status!=="next-request"||generationRequestDigest(expected.request)!==last.inputDigest)throw new ConflictError("明确拒绝缺少原节点请求证据");
      return fallback(entry.plan,"模型明确拒绝，保留原文");
    }
    const result=await replay(entry.plan,rows,signal,true);
    if(result.status==="next-request")return null;
    if(result.status==="failed")return fallback(entry.plan,"模型输出异常，保留原文");
    const corrected=typeof result.value.object?.correctedText==="string"?result.value.object.correctedText:"";
    return checkTranscriptFidelity(entry.plan.transcript,corrected).ok?{applied:true,transcript:corrected}:fallback(entry.plan,"输出未过保真校验，保留原文");
  }
  async function credential(value:State,signal?:AbortSignal){
    if(!readFrozenModelRoute(value.payload,'structured',TRANSCRIPT_POSTPROCESS_CAPABILITY)&&frozenExecutionEngine(value.payload)==='codex')return codexExecutionSpec();
    try{return await awaitPreparation(()=>deps.resolveModelSpec({...value.context},TRANSCRIPT_POSTPROCESS_CAPABILITY,{aiTaskId:value.business.id},signal),signal);}
    catch(error){signal?.throwIfAborted();if(error instanceof ConflictError||isTranscriptExecutionControlError(error))throw error;return null;}
  }
  const service={
    async prepare(ref:ExecutionRef,raw:unknown,signal?:AbortSignal){
      const {awemeId}=workerPortInputSchemas.prepareTranscribePostprocess.parse(raw);signal?.throwIfAborted();
      const initial=await access(ref,awemeId,"admission",async value=>{
        if(value.entry){const result=await terminal(value,signal);if(result&&!value.entry.result){await persist(value,awemeId,{...value.entry,result});value.entry={...value.entry,result};}}
        return value;
      });
      if(initial.entry?.result)return {status:"restored" as const,result:initial.entry.result};
      let context:z.infer<typeof contextSchema>={};
      if(!initial.entry){
        try{context=contextSchema.parse(await awaitPreparation(()=>deps.readContext({...initial.context},awemeId,signal),signal));}
        catch(error){signal?.throwIfAborted();if(error instanceof ConflictError||isTranscriptExecutionControlError(error))throw error;context={};}
      }
      signal?.throwIfAborted();
      // 资料读取可能让取消或旧租约失效，取得凭据前再次核验。
      await access(ref,awemeId,"admission",async()=>{signal?.throwIfAborted();});
      const rawSpec=await credential(initial,signal);
      const prepared=rawSpec===null?null:prepareExecutionModelIdentity(TRANSCRIPT_POSTPROCESS_CAPABILITY,rawSpec);
      signal?.throwIfAborted();
      return access(ref,awemeId,"admission",async value=>{
        signal?.throwIfAborted();
        if(value.digest!==initial.digest)throw new ConflictError("后处理准备期间原文改变");
        if(value.entry?.result)return {status:"restored" as const,result:value.entry.result};
        let entry=value.entry;
        if(!entry){
          const body={schemaVersion:1 as const,sourceDigest:value.digest!,transcript:value.original!,...context,templateVersion,templateDigest,maxOutputTokens:limit,identity:prepared?.identity??null};
          const plan=transcribePostprocessPlanSchema.parse({...body,operationKey:planKey(awemeId,body as Omit<TranscribePostprocessPlan,"operationKey">)});
          entry={plan};
        }else if(prepared&&!isDeepStrictEqual(entry.plan.identity,prepared.identity))throw new ConflictError("后处理模型身份已变化，不能改换执行");
        const rows=value.entry?callsFor(value):[];
        if(rows.some(call=>["started","unknown"].includes(call.status)))throw new ConflictError("后处理已有调用待恢复，不能重新准备或降级");
        if(!prepared&&rows.some(call=>call.status==="reserved"))throw new ConflictError("已预留后处理等待原模型恢复，不能降级覆盖");
        if(!prepared||!entry.plan.transcript.trim())entry={...entry,result:fallback(entry.plan,!entry.plan.transcript.trim()?"原文为空，跳过":"模型未配置或暂不可用，保留原文")};
        await persist(value,awemeId,entry);
        return transcribePostprocessPreparationSchema.parse(entry.result?{status:"restored",result:entry.result}:{status:"prepared",plan:entry.plan,spec:prepared!.credential});
      });
    },
    async read(ref:ExecutionRef,raw:unknown,signal?:AbortSignal){const {awemeId}=workerPortInputSchemas.readTranscribePostprocess.parse(raw);signal?.throwIfAborted();return access(ref,awemeId,"admission",async value=>{signal?.throwIfAborted();return value.entry?.result??null;});},
    async reserve(ref:ExecutionRef,raw:unknown,signal?:AbortSignal){
      const input=workerPortInputSchemas.reserveTranscribePostprocess.parse(raw);signal?.throwIfAborted();
      return access(ref,input.awemeId,"admission",async value=>{
        const entry=selected(value);if(entry.result)return {status:"skipped" as const,result:entry.result};
        const rows=callsFor(value),index=Number(input.operationKey.slice(`${entry.plan.operationKey}/model/`.length));
        if(!Number.isSafeInteger(index)||index<1||index>rows.length+1||input.operationKey!==`${entry.plan.operationKey}/model/${index}`)throw new ConflictError("后处理请求跳过原调用序列");
        const expected=await replay(entry.plan,rows.slice(0,index-1),signal);
        if(expected.status!=="next-request"||expected.consumed!==index-1||!isDeepStrictEqual(input.request,expected.request))throw new ConflictError("后处理请求不符合冻结原文、模板或模型");
        signal?.throwIfAborted();
        try{
          const call=await ledgerFor(value).reserve(ref,{kind:"model",operationKey:input.operationKey,inputDigest:generationRequestDigest(input.request),reservedTokens:Buffer.byteLength(JSON.stringify(input.request))+1024+entry.plan.maxOutputTokens});
          return transcribePostprocessReservationSchema.parse({callId:call.id,status:call.status,...(call.providerResult?{providerResult:call.providerResult}:{}),...(call.rejectionCode?{rejectionCode:call.rejectionCode}:{})});
        }catch(error){
          if(!(error instanceof ExecutionBudgetError))throw error;
          // 仅明确的调用前预算拒绝可降级，不能把未知调用变成成功。
          receipts(rows);const result=fallback(entry.plan,"后处理预算不足，保留原文");
          await persist(value,input.awemeId,{...entry,result});return {status:"skipped" as const,result};
        }
      });
    },
    async start(ref:ExecutionRef,raw:unknown,signal?:AbortSignal){
      const input=workerPortInputSchemas.startTranscribePostprocess.parse(raw);signal?.throwIfAborted();
      return access(ref,input.awemeId,"admission",async value=>{
        if(selected(value).result)throw new ConflictError("后处理已有最终结果");
        const rows=callsFor(value),last=rows.at(-1);if(last?.id!==input.callId)throw new ConflictError("不能启动其它作品或旧后处理调用");
        receipts(rows.slice(0,-1));signal?.throwIfAborted();
        const call=await ledgerFor(value).start(ref,input.callId);return {callId:call.id,status:call.status};
      });
    },
    async settle(ref:ExecutionRef,raw:unknown){
      const {awemeId,callId,...settlement}=workerPortInputSchemas.settleTranscribePostprocess.parse(raw);
      return access(ref,awemeId,"settlement",async value=>{
        const rows=callsFor(value),call=rows.find(row=>row.id===callId);if(!call)throw new ConflictError("回执不属于当前作品后处理");
        if(call.status==="unknown"&&settlement.status!=="unknown")throw new ConflictError("未知后处理回执需要独立对账");
        if(call.status==="started"&&call.startedAttempt!==ref.attempt)throw new ConflictError("回执不属于当前启动版本");
        const saved=await ledgerFor(value).settle(ref,callId,settlement);return {callId:saved.id,status:saved.status};
      });
    },
    async save(ref:ExecutionRef,raw:unknown,signal?:AbortSignal){
      const {awemeId}=workerPortInputSchemas.saveTranscribePostprocess.parse(raw);signal?.throwIfAborted();
      return access(ref,awemeId,"admission",async value=>{
        const result=await terminal(value,signal);if(!result)throw new ConflictError("后处理仍需模型回执，不能伪造完成");
        signal?.throwIfAborted();await persist(value,awemeId,{...selected(value),result});return result;
      });
    },
    async invoke(ref:ExecutionRef,port:WorkerPort,input:unknown,signal?:AbortSignal):Promise<unknown>{
      switch(port){
        case "prepareTranscribePostprocess":return service.prepare(ref,input,signal);
        case "readTranscribePostprocess":return service.read(ref,input,signal);
        case "reserveTranscribePostprocess":return service.reserve(ref,input,signal);
        case "startTranscribePostprocess":return service.start(ref,input,signal);
        case "settleTranscribePostprocess":return service.settle(ref,input);
        case "saveTranscribePostprocess":return service.save(ref,input,signal);
        default:throw new ConflictError("不是转写后处理端口");
      }
    },
  };
  return service;
}
