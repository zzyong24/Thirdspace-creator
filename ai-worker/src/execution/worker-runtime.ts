import {codexCallAuthority,codexWorkerPorts} from './codex-call-context';
import {AsrExecutionInterruption} from '../runtime/asr-request';
import type {runAssetAsrInWorker} from './asset-asr-worker-run';
import type {runExternalChatInWorker} from "./external-chat-worker-run";
import {executionTimeoutMs, remainingDeadlineMs} from "@creatoros/contract/timeout-policy";

import type {runVideoDecisionsInWorker} from "./video-decisions-worker";
import type {runAssetProcessingInWorker} from "./asset-processing-worker";
import type {runTranscribeInWorker} from "./transcribe-worker-run";
import type {runCoverInWorker} from "./cover-worker-run";
import type {runAssetInWorker} from "./asset-worker-run";
import type { runChatInWorker } from "./chat-worker-run";
import {createPersistentStreamWriter} from "./persistent-stream-writer";
import {dailyTopicInputSchema} from "./topic-worker-input";
import {getHistoricalScriptFallback} from "./script-fallback";
import { randomUUID } from "node:crypto";
import {
  chatToolApprovalReceiptSchema, chatCommitReceiptSchema, hostMessageSchema, workerStructuredResultSchema, agenticCommitReceiptSchema, workerPortInputSchemas, workerReservationSchema, workerStartReceiptSchema, modelGenerationInputSchema, executionModelSpecSchema, sameExecution,
  workerTaskInputSchema, structuredGenerationInputSchema, intelligenceRewriteInputSchema, workerCallRequestId, type ExecutionRef, type WorkerMessage, type WorkerPort, type WorkerStopReason,
} from "@creatoros/contract/execution-worker";
import { z } from "zod";
import type { runAgenticInWorker } from "./agentic-worker-run";
import { GenerationFailure } from "./generation-error";

const modelCheckpointSchema = z.object({
  revision:z.number().int().nonnegative(), ledgerSequence:z.number().int().nonnegative(),
  messages:z.array(z.object({role:z.enum(["assistant","tool"]),callId:z.string().min(1),resultText:z.string().nullable().optional()})),
  uncheckpointedReceipts:z.array(z.object({callId:z.string().min(1),kind:z.enum(["model","tool"]),sequence:z.number().int().positive(),resultText:z.string().nullable().optional()})),
  recovery:z.enum(["ready","pending","requires_replay","requires_reconciliation"]),
});

export interface WorkerDependencies {
  heartbeatMs?: number;
  capabilities?: Array<"asset.asr"|"transcribe.douyin"|"asset.generate"|"model.generate"|"model.structured"|"intelligence.rewrite-text"|"agentic.run"|"chat.run"|"chat.script-draft"|"chat.hooks"|"chat.structured"|"chat.research"|"chat.web-read">;
  supportsChatWebRead?:boolean;
  supportsChatResearch?:boolean;
  supportsChatHooks?:boolean;
  supportsChatScriptDraft?:boolean;
  supportsChatStructured?:boolean;
  runAsset?:typeof runAssetInWorker;
  runAssetProcessing?:typeof runAssetProcessingInWorker;
  runAssetAsr?:typeof runAssetAsrInWorker;
  runTranscribe?:typeof runTranscribeInWorker;
  runCover?:typeof runCoverInWorker;
  runVideo?:typeof runVideoDecisionsInWorker;
  runAgentic?: typeof runAgenticInWorker;
  runChat?: typeof runChatInWorker;
  runExternalChat?:typeof runExternalChatInWorker;
  generateStructured?(input:z.infer<typeof structuredGenerationInputSchema>,model:z.infer<typeof executionModelSpecSchema>,signal:AbortSignal,call:(port:WorkerPort,data:unknown,signal?:AbortSignal)=>Promise<unknown>):Promise<{callId:string;text:string}>;
  generateIntelligenceText?(input:z.infer<typeof intelligenceRewriteInputSchema>,model:z.infer<typeof executionModelSpecSchema>,signal:AbortSignal,call:(port:WorkerPort,data:unknown,signal?:AbortSignal)=>Promise<unknown>):Promise<{callId:string;text:string}>;
  send(message: WorkerMessage): void;
  generate(input: z.infer<typeof modelGenerationInputSchema>, model: z.infer<typeof executionModelSpecSchema>, signal: AbortSignal,
    onText: (text: string) => void | Promise<void>): Promise<{text: string; usage: unknown}>;
}

/** Worker 只执行；状态、预算、凭据、候选的权威均在父进程命名端口。 */
export function createExecutionWorker(deps: WorkerDependencies) {
  const capabilities=["model.generate",...(deps.runAssetAsr?["asset.asr"]:[]), ...(deps.runTranscribe?["transcribe.douyin"]:[]), ...(deps.runAsset?["asset.generate"]:[]), ...(deps.generateStructured ? ["model.structured"] : []), ...(deps.generateIntelligenceText ? ["intelligence.rewrite-text"] : []), ...(deps.runAgentic ? ["agentic.run"] : []), ...(deps.runChat ? ["chat.run",...(deps.supportsChatScriptDraft?["chat.script-draft"]:[]),...(deps.supportsChatHooks?["chat.hooks"]:[]),...(deps.supportsChatStructured?["chat.structured"]:[]),...(deps.supportsChatResearch?["chat.research"]:[]),...(deps.supportsChatWebRead?["chat.web-read"]:[])] : [])].filter(capability=>!deps.capabilities || deps.capabilities.some(item=>item===capability));
  type Active = {execution: ExecutionRef; controller: AbortController;deadlineAt:number|null;receiptProtocol:boolean;nextCallSeq:number};
  const pending = new Map<string, {resolve(data: unknown): void; reject(error: Error): void; cleanup(): void;scope?:Active;callSeq?:number}>();

  // 只缓存最近的 IPC 重投结果；跨进程/历史幂等仍由后端账本负责。
  const completed = new Map<string, WorkerStopReason>();
  let active: Active | undefined;
  let closed = false;
  const send = (message: WorkerMessage) => { if (!closed) deps.send(message); };
  const key = (ref: ExecutionRef) => JSON.stringify(ref);
  const acknowledge = (scope: Active, resend = false) => {
    if (!scope.receiptProtocol || active !== scope || closed) return;
    // 从当前在途集合的空隙计算累计确认；较早挂起调用不阻挡后面的音频释放。
    // 区间数最多为在途空隙数，随空隙关闭合并，不保存历史 ID/tombstone。
    const outstanding=[...pending.values()].filter(item=>item.scope===scope).map(item=>item.callSeq!).sort((a,b)=>a-b);
    const throughSeq=outstanding.length?outstanding[0]!-1:scope.nextCallSeq;
    const consumedRanges:Array<{fromSeq:number;toSeq:number}>=[];
    let fromSeq=throughSeq+1;
    for(const sequence of outstanding){if(sequence>fromSeq)consumedRanges.push({fromSeq,toSeq:sequence-1});fromSeq=sequence+1;}
    if(fromSeq<=scope.nextCallSeq)consumedRanges.push({fromSeq,toSeq:scope.nextCallSeq});
    if(throughSeq>0 || consumedRanges.length || resend){
      try {send({version:1,type:'consumed',requestId:randomUUID(),execution:scope.execution,throughSeq,consumedRanges});} catch {/* 断连由原任务监督，不重发调用。 */}
    }
  };
  const call = (execution: ExecutionRef, port: WorkerPort, data: unknown, signal?: AbortSignal): Promise<unknown> => {
    signal?.throwIfAborted();
    if (closed) return Promise.reject(new Error("WORKER_DISCONNECTED"));
    const scope = active?.receiptProtocol && sameExecution(active.execution, execution) ? active : undefined;
    const callSeq = scope ? ++scope.nextCallSeq : undefined;
    const requestId = callSeq ? workerCallRequestId(execution,callSeq) : randomUUID();
    return new Promise((resolve, reject) => {
      const onAbort = () => { cleanup(); reject(new Error("WORKER_CANCELLED")); };
      // 每个端口共享原领取任务的绝对deadline；continuous由原取消/心跳/租约监督。
      // 素材准备含登录取流、抽音和保存，不能再由独立30秒限误杀。
      const waitMs = active && sameExecution(active.execution, execution)
        ? remainingDeadlineMs(active.deadlineAt) : executionTimeoutMs();
      const timer = waitMs === undefined ? undefined : setTimeout(() => {cleanup(); reject(new Error("HOST_PORT_TIMEOUT"));}, waitMs);
      const cleanup = () => {clearTimeout(timer); signal?.removeEventListener("abort", onAbort); pending.delete(requestId); if(scope)acknowledge(scope);};
      pending.set(requestId, {resolve, reject, cleanup, scope, callSeq});
      signal?.addEventListener("abort", onAbort, {once: true});
      try { send({version: 1, type: "call", requestId, execution, port, data, ...(callSeq ? {callSeq} : {})}); }
      catch {cleanup(); reject(new Error("WORKER_DISCONNECTED"));}
    });
  };
  const execute = async (execution: ExecutionRef, deadlineAt: number|null, requestId: string, receiptProtocol?: 'consumed-v1') => {
    const controller = new AbortController();
    active = {execution, controller,deadlineAt,receiptProtocol:receiptProtocol === 'consumed-v1',nextCallSeq:0};
    const signal = controller.signal;
    const timer = deadlineAt===null ? undefined : setTimeout(() => controller.abort(), Math.max(0, deadlineAt - Date.now()));
    let reason: WorkerStopReason = "failed";
    let started = false;
    let settled = false;
    let committing = false;
    let callId: string | undefined;
    let seq = 0;
    let heartbeatTimer: ReturnType<typeof setTimeout> | undefined;
    let finished = false;
    const heartbeat = async () => {
      if (finished || signal.aborted) return;
      try {await call(execution, "heartbeat", {}, signal);}
      catch {controller.abort(); return;}
      if (!finished && !signal.aborted) heartbeatTimer = setTimeout(() => {void heartbeat();}, deps.heartbeatMs ?? 10000);
    };
    heartbeatTimer = setTimeout(() => {void heartbeat();}, deps.heartbeatMs ?? 10000);
    try {
      if (deadlineAt !== null && deadlineAt <= Date.now()) controller.abort();
      signal.throwIfAborted();
      // 只暴露阶段码，不传宿主原始错误/上下文/凭据。此时尚未调用模型。
      const readBoundary = async <T>(port: "readTaskContext" | "resolveModelCredential", data: unknown, schema: z.ZodType<T>): Promise<T> => {
        const stage = port === "readTaskContext" ? "CONTEXT" : "CREDENTIAL";
        let raw: unknown;
        try { raw = await call(execution, port, data, signal); }
        catch (error) {
          signal.throwIfAborted();
          if (error instanceof GenerationFailure) throw error;
          throw new GenerationFailure("failed", `WORKER_${stage}_UNAVAILABLE`);
        }
        const parsed = schema.safeParse(raw);
        if (!parsed.success) throw new GenerationFailure("failed", `WORKER_${stage}_INVALID`);
        return parsed.data;
      };
      const input = await readBoundary("readTaskContext", {}, workerTaskInputSchema);
      const executionCapability="intelligenceText" in input ? "intelligence.rewrite-text" : input.kind;
      if(!capabilities.includes(executionCapability))throw new GenerationFailure("waiting_user","WORKER_CAPABILITY_UNAVAILABLE");
      // 明确标签先进入专用依赖，不被视频等旧 structured facets 抢走，也不降为泛型 handler。
      if("intelligenceText" in input){
        if(!deps.generateIntelligenceText)throw new GenerationFailure("waiting_user","WORKER_CAPABILITY_UNAVAILABLE");
        const model=await readBoundary("resolveModelCredential",{capability:input.capability},executionModelSpecSchema);
        const result=await deps.generateIntelligenceText(input,model,signal,(port,data,portSignal)=>call(execution,port,data,portSignal));
        signal.throwIfAborted();committing=true;
        await call(execution,"commitResult",{outcome:"succeeded",...result},signal);
        reason="completed";return;
      }
      if((input.kind==="scheduled.flywheel"||input.kind==="benchmark.transcribe"))throw new GenerationFailure("failed","DOMAIN_STAGE_AUTHORIZATION_REQUIRED");
      if(input.kind==="asset.asr"){
        if(!deps.runAssetAsr)throw new GenerationFailure("waiting_user","ASSET_ASR_WORKER_UNAVAILABLE");
        try {
          const result=await deps.runAssetAsr(input,signal,(port,data,portSignal)=>call(execution,port,data,portSignal));
          reason=result.status==="succeeded"?"completed":"failed";return;
        } catch(error) {
          // 原持久 ASR 端口报告未确认结果；不得被普通文本生命周期的局部 started 标志降为可重试失败。
          if(error instanceof AsrExecutionInterruption)throw new GenerationFailure("unknown_result","ASR_RESULT_UNKNOWN");
          throw error;
        }
      }
      if(input.kind==="transcribe.douyin"){
        if(!deps.runTranscribe)throw new GenerationFailure("waiting_user","TRANSCRIBE_WORKER_UNAVAILABLE");
        const result=await deps.runTranscribe(input,signal,(port,data,portSignal)=>call(execution,port,data,portSignal));
        reason=result.status==="succeeded"?"completed":"failed";return;
      }
      if(input.kind==="asset.generate"){
        if(!deps.runAsset)throw new GenerationFailure("waiting_user","ASSET_WORKER_UNAVAILABLE");
        const result=await deps.runAsset(input,signal,(port,data,portSignal)=>call(execution,port,data,portSignal));
        signal.throwIfAborted();committing=true;
        await call(execution,"commitResult",{outcome:"succeeded",...result},signal);
        reason="completed";return;
      }
      if(input.kind==="chat.run"){
        if(input.executionEngine==="codex"){
          if(!deps.runExternalChat)throw new GenerationFailure("waiting_user","CODEX_WORKER_UNAVAILABLE");
          const result=await deps.runExternalChat(input,signal,(port,data,portSignal)=>call(execution,port,data,portSignal),async text=>{
            if(!signal.aborted)send({version:1,type:"progress",requestId,execution,seq:seq++,text});
          });
          signal.throwIfAborted();committing=true;
          const receipt=chatCommitReceiptSchema.parse(await call(execution,"commitExternalChatResult",result,signal));
          if(receipt.messageId!==`chat:${input.sourceMessageId}`)throw new Error("CODEX_COMMIT_RECEIPT_MISMATCH");
          reason="completed";return;
        }
        if(input.tools.some(tool=>tool.execution==="worker.web-read") && !capabilities.includes("chat.web-read"))throw new GenerationFailure("waiting_user","CHAT_WEB_READ_WORKER_UNAVAILABLE");
        if(input.tools.some(tool=>tool.execution==="worker.research") && !capabilities.includes("chat.research"))throw new GenerationFailure("waiting_user","CHAT_RESEARCH_WORKER_UNAVAILABLE");
        if(input.tools.some(tool=>tool.execution==="worker.structured-node") && !capabilities.includes("chat.structured"))throw new GenerationFailure("waiting_user","CHAT_STRUCTURED_WORKER_UNAVAILABLE");
        if(input.tools.some(tool=>tool.execution==="worker.script-draft") && !capabilities.includes("chat.script-draft"))throw new GenerationFailure("waiting_user","CHAT_SCRIPT_DRAFT_WORKER_UNAVAILABLE");
        if(input.tools.some(tool=>tool.execution==="worker.script-hooks") && !capabilities.includes("chat.hooks"))throw new GenerationFailure("waiting_user","CHAT_HOOKS_WORKER_UNAVAILABLE");
        if(!deps.runChat)throw new GenerationFailure("waiting_user","CHAT_WORKER_NOT_READY");
        const model=await readBoundary("resolveModelCredential", {capability: input.capability}, executionModelSpecSchema);
        const result=await deps.runChat(input,model,signal,{
          call:(port,data,portSignal)=>call(execution,port,data,portSignal),
          readPlanStatus:async(modelCallId,planSignal)=>call(execution,"readWorkbenchPlan",{modelCallId},planSignal) as ReturnType<NonNullable<Parameters<typeof deps.runChat>[3]["readPlanStatus"]>>,
          approve:async(request,approvalSignal)=>{
            const decision=chatToolApprovalReceiptSchema.parse(await call(execution,"checkChatToolApproval",request,approvalSignal));
            if(decision.status==="unavailable")throw new GenerationFailure("waiting_user","CHAT_APPROVAL_UNAVAILABLE");
            return decision.status==="denied"?{type:"denied",reason:decision.reason}:decision.status;
          },
          onChunk:async(chunk)=>{if(chunk.type==="text-delta" && !signal.aborted)send({version:1,type:"progress",requestId,execution,seq:seq++,text:chunk.delta});},
        });
        signal.throwIfAborted();
        if(result.outcome==="awaiting_confirmation")throw new GenerationFailure("waiting_user","CHAT_APPROVAL_REQUIRED");
        committing=true;
        const receipt=chatCommitReceiptSchema.parse(await call(execution,"commitChatResult",{lastModelCallId:result.lastModelCallId,toolCallIds:result.toolCallIds,...(result.terminalPlanFailureStepIds?.length?{partialPlanFailureStepIds:result.terminalPlanFailureStepIds}:{}),...(result.terminalToolFailureCallIds?.length?{terminalToolFailureCallIds:result.terminalToolFailureCallIds}:{})},signal));
        if(receipt.messageId!==`chat:${input.sourceMessageId}`)throw new Error("CHAT_COMMIT_RECEIPT_MISMATCH");
        reason="completed";return;
      }
      if(input.kind==="agentic.run"){
        if(!deps.runAgentic)throw new GenerationFailure("waiting_user","AGENTIC_WORKER_NOT_READY");
        const model=await readBoundary("resolveModelCredential", {capability: input.capability}, executionModelSpecSchema);
        signal.throwIfAborted();
        const result=await deps.runAgentic(input,model,signal,(port,data,portSignal)=>call(execution,port,data,portSignal),text=>{
          if(!signal.aborted)send({version:1,type:"progress",requestId,execution,seq:seq++,text});
        });
        signal.throwIfAborted();
        const candidate=workerPortInputSchemas.commitAgenticResult.parse(result);
        committing=true;
        const receipt=agenticCommitReceiptSchema.parse(await call(execution,"commitAgenticResult",candidate,signal));
        reason=receipt.outcome==="failed"?"failed":"completed";
        return;
      }
      if(input.kind==="model.structured"){
        if(input.facets.__videoDecisions!==undefined){
          if(!deps.runVideo)throw new GenerationFailure("waiting_user","VIDEO_WORKER_UNAVAILABLE");
          const result=await deps.runVideo(input,signal,(port,data,portSignal)=>call(execution,port,data,portSignal));
          signal.throwIfAborted();committing=true;
          await call(execution,"commitResult",{outcome:"succeeded",...result},signal);reason="completed";return;
        }
        if(input.facets.__assetProcessing!==undefined){if(!deps.runAssetProcessing)throw new Error("ASSET_PROCESSING_WORKER_UNAVAILABLE");await deps.runAssetProcessing(input,signal,(port,data,portSignal)=>call(execution,port,data,portSignal));reason="completed";return;}
        if(input.skillId==="cover.brief" || input.skillId==="graphic.card-brief"){
          if(!deps.runCover)throw new GenerationFailure("waiting_user","COVER_WORKER_UNAVAILABLE");
          if(input.capability!=="copy.generate")throw new Error("COVER_INPUT_MISMATCH");
          // 先沿原凭据端口锁定业务任务的模型身份，封面链返回最终图片回执。
          const model=await readBoundary("resolveModelCredential", {capability: input.capability}, executionModelSpecSchema);
          const result=await deps.runCover(input,model,signal,(port,data,portSignal)=>call(execution,port,data,portSignal));
          signal.throwIfAborted();committing=true;
          await call(execution,"commitResult",{outcome:"succeeded",...result},signal);
          reason="completed";return;
        }
        const daily=input.facets.__dailyTopic!==undefined ? dailyTopicInputSchema.parse(JSON.parse(input.facets.__dailyTopic)) : undefined;
        if(daily && (input.skillId!=="topic.generate" || input.capability!=="topic.generate"))throw new Error("DAILY_TOPIC_INPUT_MISMATCH");
        if(daily?.skipReason){
          signal.throwIfAborted();committing=true;
          await call(execution,"completeDailyTopicSkip",{},signal);
          reason="completed";return;
        }
        if(daily){const topic=z.object({mode:z.literal("daily")}).parse(JSON.parse(input.facets.__topicGenerate??"null"));void topic;}
        if(input.skillId==="script.draft" && input.facets.__scriptVerbatim){
          const result=z.object({callId:z.string().min(1),text:z.string().min(1)}).strict().parse(await call(execution,"prepareScriptImport",{},signal));
          signal.throwIfAborted();
          committing=true;
          await call(execution,"commitResult",{outcome:"succeeded",...result},signal);
          reason="completed";
          return;
        }
        const fallback=getHistoricalScriptFallback(input);
        if(fallback){
          const text=JSON.stringify(fallback);
          let receipt:{callId:string;text:string};
          try{receipt=z.object({callId:z.string().min(1),text:z.string().min(1)}).strict().parse(await call(execution,"saveScriptFallback",{text},signal));const saved=workerStructuredResultSchema.parse(JSON.parse(receipt.text));const savedShots=z.object({shots:z.array(z.object({口播:z.string()})).min(1)}).parse(saved.object).shots;if(saved.generation.finishReason!=="deterministic_fallback" || saved.validation?.status!=="partial" || savedShots.map(shot=>shot.口播).join("")!==fallback.object.shots.map(shot=>shot.口播).join(""))throw new Error("FALLBACK_RECEIPT_MISMATCH");}
          catch{throw new GenerationFailure("unknown_result","SCRIPT_FALLBACK_RECEIPT_UNKNOWN");}
          signal.throwIfAborted();
          committing=true;
          await call(execution,"commitResult",{outcome:"succeeded",...receipt},signal);
          reason="completed";
          return;
        }
        if(!deps.generateStructured)throw new Error("STRUCTURED_WORKER_UNAVAILABLE");
        const model=await readBoundary("resolveModelCredential", {capability: input.capability}, executionModelSpecSchema);
        const result=await deps.generateStructured(input,model,signal,(port,data,portSignal)=>call(execution,port,data,portSignal));
        signal.throwIfAborted();
        committing=true;
        await call(execution,daily?"commitDailyTopicResult":"commitResult",{outcome:"succeeded",...result},signal);
        reason="completed";
        return;
      }
      const readCheckpoint = async () => {
        const checkpoint = modelCheckpointSchema.parse(await call(execution,"readCheckpoint",{},signal));
        if(checkpoint.messages.some(message=>message.role!=="assistant") || checkpoint.uncheckpointedReceipts.some(receipt=>receipt.kind!=="model")) {
          throw new GenerationFailure("unknown_result","CHECKPOINT_REQUIRES_RECONCILIATION");
        }
        return checkpoint;
      };
      const initialCheckpoint = await readCheckpoint();
      const checkpointReceipt = async (id:string, checkpoint=initialCheckpoint) => {
        const messages=checkpoint.messages.map(message=>({role:"assistant" as const,callId:message.callId}));
        const seen=new Set(messages.map(message=>message.callId));
        for(const receipt of [...checkpoint.uncheckpointedReceipts].sort((a,b)=>a.sequence-b.sequence)) {
          if(!seen.has(receipt.callId)){messages.push({role:"assistant",callId:receipt.callId});seen.add(receipt.callId);}
        }
        if(!seen.has(id))throw new GenerationFailure("unknown_result","CHECKPOINT_RECEIPT_MISSING");
        if(messages.length===checkpoint.messages.length)return;
        const saved=z.object({revision:z.number().int().positive()}).parse(await call(execution,"saveCheckpoint",{
          expectedRevision:checkpoint.revision,expectedLedgerSequence:checkpoint.ledgerSequence,messages,
        },signal));
        if(saved.revision!==checkpoint.revision+1)throw new Error("CHECKPOINT_REVISION_MISMATCH");
      };
      if(input.kind!=="model.generate")throw new GenerationFailure("waiting_user","WORKER_CAPABILITY_UNAVAILABLE");
      // Pi 对账中的原检查点仍在任何调用预留前停止；Codex才核原回合只读证明。
      const reconciliationModel=initialCheckpoint.recovery === "requires_reconciliation"
        ? await readBoundary("resolveModelCredential", {capability: input.capability}, executionModelSpecSchema) : undefined;
      if(reconciliationModel && !("engine" in reconciliationModel))throw new GenerationFailure("unknown_result","CHECKPOINT_REQUIRES_RECONCILIATION");
      const operationKey = input.operationKey;
      const reservation = workerReservationSchema.parse(await call(execution, "reserveCall", {operationKey, maxOutputTokens: input.maxOutputTokens}, signal));
      callId = reservation.callId;
      if (reservation.status === "settled" && reservation.resultText) {
        committing = true;
        await checkpointReceipt(callId);
        await call(execution, "commitResult", {outcome:"succeeded",callId,text:reservation.resultText}, signal);
        reason = "completed";
        return;
      }
      const model = reconciliationModel ?? await readBoundary("resolveModelCredential", {capability: input.capability}, executionModelSpecSchema);
      const codex="engine" in model;
      const originalNative=codex&&['started','unknown'].includes(reservation.status)
        ? z.object({threadId:z.string().min(1),turnId:z.string().min(1)}).passthrough().safeParse(await call(execution,'readCodexCall',{callId},signal)) : undefined;
      const recovering=originalNative?.success===true;
      if (!recovering && initialCheckpoint.recovery === "requires_reconciliation") throw new GenerationFailure("unknown_result","CHECKPOINT_REQUIRES_RECONCILIATION");
      if (!recovering && reservation.status !== "reserved") throw new GenerationFailure("unknown_result", "CALL_REQUIRES_RECONCILIATION");
      signal.throwIfAborted();
      // 启动回执丢失也视为未知；没有明确许可绝不调用供应商。
      started = true;
      if(!recovering){const receipt = workerStartReceiptSchema.parse(await call(execution, "startCall", {callId}, signal));
      if (receipt.callId !== callId) throw new Error("CALL_RECEIPT_MISMATCH");}
      signal.throwIfAborted();
      const streamWriter=createPersistentStreamWriter(callId,data=>call(execution,"appendStreamEvents",data));
      const result = await (async()=>{
        try{return await codexCallAuthority.run({callId,recover:recovering},()=>deps.generate(input,model,signal,async text=>{
          // 原回合只读结果直接结算；旧stream所属原启动attempt，不伪造新流执行事实。
          if(recovering)return;
          await streamWriter.push({type:"text-delta",id:callId,delta:text});
          if(!signal.aborted)send({version:1,type:"progress",requestId,execution,seq:seq++,text});
        }));}finally{await streamWriter.close();}
      })();
      // 已执行调用允许在取消后结算，提交候选仍由父端口检查控制状态。
      await call(execution, "settleCall", {callId, status: "settled", usage: result.usage, text:result.text});
      settled = true;
      signal.throwIfAborted();
      committing = true;
      await checkpointReceipt(callId, await readCheckpoint());
      await call(execution, "commitResult", {outcome: "succeeded", callId, text: result.text}, signal);
      reason = "completed";
    } catch (error) {
      const failure = error instanceof GenerationFailure ? error : undefined;
      reason = signal.aborted ? "cancelled" : failure?.outcome ?? (started || committing ? "unknown_result" : "failed");
      if (started && !settled) {
        await call(execution, "settleCall", {callId, status: failure && failure.outcome !== "unknown_result" ? "rejected" : "unknown"}).catch(() => {});
      }
      // 不返回 provider 原始错误，避免密钥/请求正文进入 IPC 错误日志。
      // 提交可能已落库但回执丢失，禁止用第二次失败提交覆盖它；交给后端同键对账。
      if (!signal.aborted && !committing) await call(execution, "commitResult", {outcome: reason, errorCode: failure?.errorCode ?? "WORKER_EXECUTION_INTERRUPTED", retryAfterMs: failure?.retryAfterMs}).catch(() => {});
    } finally {
      finished = true;
      if (heartbeatTimer) clearTimeout(heartbeatTimer);
      controller.abort();
      clearTimeout(timer);
      completed.set(key(execution), reason);
      if (completed.size > 256) completed.delete(completed.keys().next().value!);
      active = undefined;
      send({version: 1, type: "stopped", requestId, execution, reason});
    }
  };
  return {
    ready() {send({version: 1, type: "ready", requestId: randomUUID(), capabilities,receiptProtocol:'consumed-v1'});},
    receive(raw: unknown) {
      const parsed = hostMessageSchema.safeParse(raw);
      if (!parsed.success || closed) return;
      const message = parsed.data;
      if (message.type === "reply") {
        const item = pending.get(message.requestId);
        if (!item) {
          // 迟到/重复回复表示宿主可能丢了确认；重发当前累计水位，不创建新的调用。
          if(active?.receiptProtocol && message.execution && sameExecution(active.execution,message.execution) && message.callSeq && message.callSeq <= active.nextCallSeq)acknowledge(active,true);
          return;
        }
        if(item.scope && (message.callSeq !== item.callSeq || !message.execution || !sameExecution(item.scope.execution,message.execution)))return;
        item.cleanup();
        if (message.ok) item.resolve(message.data); else item.reject(["MODEL_AUTHORITY_CHANGED","MODEL_CREDENTIAL_UNAVAILABLE"].includes(message.errorCode ?? "") ? new GenerationFailure("waiting_user",message.errorCode!) : new Error(message.errorCode ?? "HOST_PORT_REJECTED"));
      } else if (message.type === "cancel") {
        if (active && sameExecution(active.execution, message.execution)) active.controller.abort();
      } else {
        const previous = completed.get(key(message.execution));
        if (previous) {
          send({version: 1, type: "stopped", requestId: message.requestId, execution: message.execution, reason: previous});
          return;
        }
        if (active) {
          if (!sameExecution(active.execution, message.execution)) send({version: 1, type: "stopped", requestId: message.requestId, execution: message.execution, reason: "failed"});
          return;
        }
        void codexWorkerPorts.run((port,data,signal)=>call(message.execution,port,data,signal),()=>execute(message.execution,message.deadlineAt,message.requestId,message.receiptProtocol));
      }
    },
    close() {
      closed = true;
      active?.controller.abort();
      for (const item of [...pending.values()]) {item.cleanup(); item.reject(new Error("WORKER_DISCONNECTED"));}
    },
  };
}
