import type {runCoverInWorker} from "./cover-worker-run";
import type {runAssetInWorker} from "./asset-worker-run";
import type { runChatInWorker } from "./chat-worker-run";
import {createPersistentStreamWriter} from "./persistent-stream-writer";
import {dailyTopicInputSchema} from "./topic-worker-input";
import {getHistoricalScriptFallback} from "./script-fallback";
import { randomUUID } from "node:crypto";
import {
  chatToolApprovalReceiptSchema, chatCommitReceiptSchema, hostMessageSchema, workerStructuredResultSchema, agenticCommitReceiptSchema, workerPortInputSchemas, workerReservationSchema, workerStartReceiptSchema, modelGenerationInputSchema, workerModelSpecSchema, sameExecution,
  workerTaskInputSchema, structuredGenerationInputSchema, type ExecutionRef, type WorkerMessage, type WorkerPort, type WorkerStopReason,
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
  capabilities?: Array<"asset.generate"|"model.generate"|"model.structured"|"agentic.run"|"chat.run"|"chat.script-draft"|"chat.hooks"|"chat.structured"|"chat.research"|"chat.web-read">;
  supportsChatWebRead?:boolean;
  supportsChatResearch?:boolean;
  supportsChatHooks?:boolean;
  supportsChatScriptDraft?:boolean;
  supportsChatStructured?:boolean;
  runAsset?:typeof runAssetInWorker;
  runCover?:typeof runCoverInWorker;
  runAgentic?: typeof runAgenticInWorker;
  runChat?: typeof runChatInWorker;
  generateStructured?(input:z.infer<typeof structuredGenerationInputSchema>,model:z.infer<typeof workerModelSpecSchema>,signal:AbortSignal,call:(port:WorkerPort,data:unknown,signal?:AbortSignal)=>Promise<unknown>):Promise<{callId:string;text:string}>;
  send(message: WorkerMessage): void;
  generate(input: z.infer<typeof modelGenerationInputSchema>, model: z.infer<typeof workerModelSpecSchema>, signal: AbortSignal,
    onText: (text: string) => void | Promise<void>): Promise<{text: string; usage: unknown}>;
}

/** Worker 只执行；状态、预算、凭据、候选的权威均在父进程命名端口。 */
export function createExecutionWorker(deps: WorkerDependencies) {
  const capabilities=["model.generate", ...(deps.runAsset?["asset.generate"]:[]), ...(deps.generateStructured ? ["model.structured"] : []), ...(deps.runAgentic ? ["agentic.run"] : []), ...(deps.runChat ? ["chat.run",...(deps.supportsChatScriptDraft?["chat.script-draft"]:[]),...(deps.supportsChatHooks?["chat.hooks"]:[]),...(deps.supportsChatStructured?["chat.structured"]:[]),...(deps.supportsChatResearch?["chat.research"]:[]),...(deps.supportsChatWebRead?["chat.web-read"]:[])] : [])].filter(capability=>!deps.capabilities || deps.capabilities.some(item=>item===capability));
  const pending = new Map<string, {resolve(data: unknown): void; reject(error: Error): void; cleanup(): void}>();
  // 只缓存最近的 IPC 重投结果；跨进程/历史幂等仍由后端账本负责。
  const completed = new Map<string, WorkerStopReason>();
  let active: {execution: ExecutionRef; controller: AbortController;deadlineAt:number} | undefined;
  let closed = false;
  const send = (message: WorkerMessage) => { if (!closed) deps.send(message); };
  const key = (ref: ExecutionRef) => JSON.stringify(ref);
  const call = (execution: ExecutionRef, port: WorkerPort, data: unknown, signal?: AbortSignal): Promise<unknown> => {
    signal?.throwIfAborted();
    if (closed) return Promise.reject(new Error("WORKER_DISCONNECTED"));
    const requestId = randomUUID();
    return new Promise((resolve, reject) => {
      const onAbort = () => { cleanup(); reject(new Error("WORKER_CANCELLED")); };
      const timer = setTimeout(() => {cleanup(); reject(new Error("HOST_PORT_TIMEOUT"));}, port === "executeAgenticTool" && active && sameExecution(active.execution,execution) ? Math.max(1,active.deadlineAt-Date.now()) : 30000);
      const cleanup = () => {clearTimeout(timer); signal?.removeEventListener("abort", onAbort); pending.delete(requestId);};
      pending.set(requestId, {resolve, reject, cleanup});
      signal?.addEventListener("abort", onAbort, {once: true});
      try { send({version: 1, type: "call", requestId, execution, port, data}); }
      catch {cleanup(); reject(new Error("WORKER_DISCONNECTED"));}
    });
  };
  const execute = async (execution: ExecutionRef, deadlineAt: number, requestId: string) => {
    const controller = new AbortController();
    active = {execution, controller,deadlineAt};
    const signal = controller.signal;
    const timer = setTimeout(() => controller.abort(), Math.max(0, deadlineAt - Date.now()));
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
      if (deadlineAt <= Date.now()) controller.abort();
      signal.throwIfAborted();
      const input = workerTaskInputSchema.parse(await call(execution, "readTaskContext", {}, signal));
      if(!capabilities.includes(input.kind))throw new GenerationFailure("waiting_user","WORKER_CAPABILITY_UNAVAILABLE");
      if(input.kind==="asset.generate"){
        if(!deps.runAsset)throw new GenerationFailure("waiting_user","ASSET_WORKER_UNAVAILABLE");
        const result=await deps.runAsset(input,signal,(port,data,portSignal)=>call(execution,port,data,portSignal));
        signal.throwIfAborted();committing=true;
        await call(execution,"commitResult",{outcome:"succeeded",...result},signal);
        reason="completed";return;
      }
      if(input.kind==="chat.run"){
        if(input.tools.some(tool=>tool.execution==="worker.web-read") && !capabilities.includes("chat.web-read"))throw new GenerationFailure("waiting_user","CHAT_WEB_READ_WORKER_UNAVAILABLE");
        if(input.tools.some(tool=>tool.execution==="worker.research") && !capabilities.includes("chat.research"))throw new GenerationFailure("waiting_user","CHAT_RESEARCH_WORKER_UNAVAILABLE");
        if(input.tools.some(tool=>tool.execution==="worker.structured-node") && !capabilities.includes("chat.structured"))throw new GenerationFailure("waiting_user","CHAT_STRUCTURED_WORKER_UNAVAILABLE");
        if(input.tools.some(tool=>tool.execution==="worker.script-draft") && !capabilities.includes("chat.script-draft"))throw new GenerationFailure("waiting_user","CHAT_SCRIPT_DRAFT_WORKER_UNAVAILABLE");
        if(input.tools.some(tool=>tool.execution==="worker.script-hooks") && !capabilities.includes("chat.hooks"))throw new GenerationFailure("waiting_user","CHAT_HOOKS_WORKER_UNAVAILABLE");
        if(!deps.runChat)throw new GenerationFailure("waiting_user","CHAT_WORKER_NOT_READY");
        const model=workerModelSpecSchema.parse(await call(execution,"resolveModelCredential",{capability:input.capability},signal));
        const result=await deps.runChat(input,model,signal,{
          call:(port,data,portSignal)=>call(execution,port,data,portSignal),
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
        const receipt=chatCommitReceiptSchema.parse(await call(execution,"commitChatResult",{lastModelCallId:result.lastModelCallId,toolCallIds:result.toolCallIds},signal));
        if(receipt.messageId!==`chat:${input.sourceMessageId}`)throw new Error("CHAT_COMMIT_RECEIPT_MISMATCH");
        reason="completed";return;
      }
      if(input.kind==="agentic.run"){
        if(!deps.runAgentic)throw new GenerationFailure("waiting_user","AGENTIC_WORKER_NOT_READY");
        const model=workerModelSpecSchema.parse(await call(execution,"resolveModelCredential",{capability:input.capability},signal));
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
        if(input.skillId==="cover.brief"){
          if(!deps.runCover)throw new GenerationFailure("waiting_user","COVER_WORKER_UNAVAILABLE");
          if(input.capability!=="copy.generate")throw new Error("COVER_INPUT_MISMATCH");
          // 先沿原凭据端口锁定业务任务的模型身份，封面链返回最终图片回执。
          const model=workerModelSpecSchema.parse(await call(execution,"resolveModelCredential",{capability:input.capability},signal));
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
        const model=workerModelSpecSchema.parse(await call(execution,"resolveModelCredential",{capability:input.capability},signal));
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
      if(initialCheckpoint.recovery === "requires_reconciliation" && ![...initialCheckpoint.messages,...initialCheckpoint.uncheckpointedReceipts].some(receipt=>receipt.resultText?.trim())) {
        throw new GenerationFailure("unknown_result","CHECKPOINT_REQUIRES_RECONCILIATION");
      }
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
      if (initialCheckpoint.recovery === "requires_reconciliation") throw new GenerationFailure("unknown_result","CHECKPOINT_REQUIRES_RECONCILIATION");
      if (reservation.status !== "reserved") throw new GenerationFailure("unknown_result", "CALL_REQUIRES_RECONCILIATION");
      const model = workerModelSpecSchema.parse(await call(execution, "resolveModelCredential", {capability: input.capability}, signal));
      signal.throwIfAborted();
      // 启动回执丢失也视为未知；没有明确许可绝不调用供应商。
      started = true;
      const receipt = workerStartReceiptSchema.parse(await call(execution, "startCall", {callId}, signal));
      if (receipt.callId !== callId) throw new Error("CALL_RECEIPT_MISMATCH");
      signal.throwIfAborted();
      const streamWriter=createPersistentStreamWriter(callId,data=>call(execution,"appendStreamEvents",data));
      const result = await (async()=>{
        try{return await deps.generate(input,model,signal,async text=>{
          await streamWriter.push({type:"text-delta",id:callId,delta:text});
          if(!signal.aborted)send({version:1,type:"progress",requestId,execution,seq:seq++,text});
        });}finally{await streamWriter.close();}
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
    ready() {send({version: 1, type: "ready", requestId: randomUUID(), capabilities});},
    receive(raw: unknown) {
      const parsed = hostMessageSchema.safeParse(raw);
      if (!parsed.success || closed) return;
      const message = parsed.data;
      if (message.type === "reply") {
        const item = pending.get(message.requestId);
        if (!item) return;
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
        void execute(message.execution, message.deadlineAt, message.requestId);
      }
    },
    close() {
      closed = true;
      active?.controller.abort();
      for (const item of [...pending.values()]) {item.cleanup(); item.reject(new Error("WORKER_DISCONNECTED"));}
    },
  };
}
