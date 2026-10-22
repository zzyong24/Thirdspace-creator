import { wrapLanguageModel, type LanguageModel } from "ai";
import { createHash } from "node:crypto";
import type { LanguageModelV4, LanguageModelV4StreamPart } from "@ai-sdk/provider";
import {
  workerProviderReceiptSchema,
  type WorkerProviderReceipt,
  type ChatModelReplayFingerprint,
} from "@creatoros/contract/execution-worker";
import type { DurableGenerationPorts } from "./durable-generation-model";
import { GenerationFailure, generationFailure } from "./generation-error";

export interface ToolResultProjectionText {current:string;legacy:string}
const requestDigest=(value:unknown)=>`sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
/** SEMANTIC_BOUNDARY_ALLOW: legacy prompt 来自同一冻结历史的完整窗口与 SDK 规范化。
 * 只用于精确匹配历史已结算请求；供应商始终收到当前投影，账本身份不作宽松比较。
 */
export function selectChatReplayRequest(request:Record<string,unknown>,fingerprint:ChatModelReplayFingerprint|undefined,
  legacyPrompt?:unknown){
  if(!fingerprint || requestDigest(request)===fingerprint.inputDigest)return {request,replayOnly:false};
  const candidate=JSON.parse(JSON.stringify({...request,prompt:legacyPrompt})) as Record<string,unknown>;
  if(!Array.isArray(legacyPrompt) || requestDigest(candidate)!==fingerprint.inputDigest)
    throw new GenerationFailure("unknown_result","CHAT_MODEL_REQUEST_REPLAY_MISMATCH");
  // reserved 尚无可回放响应；不能按旧摘要预留、却向供应商发送另一个新请求。
  if(fingerprint.status!=="settled")throw new GenerationFailure("unknown_result","CHAT_RESERVED_REQUEST_REPLAY_MISMATCH");
  return {request:candidate,replayOnly:true};
}

/** 保留真实请求指纹，避免图片字节数组在 IPC JSON 中膨胀成数字对象。 */
function requestJson(value: unknown): unknown {
  if(value instanceof Uint8Array)return Buffer.from(value).toString("base64");
  if(value instanceof URL)return value.toString();
  if(Array.isArray(value))return value.map(requestJson);
  if(value && typeof value === "object")return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,requestJson(item)]));
  return value;
}
/** SDK文件数据统一成其支持的base64，URL和时间只在Worker边界复原。 */
function encode(part: LanguageModelV4StreamPart): Record<string, unknown> {
  let value: unknown = part;
  if (
    (part.type === "file" || part.type === "reasoning-file") &&
    part.data.type === "data" &&
    part.data.data instanceof Uint8Array
  )
    value = {
      ...part,
      data: {
        type: "data",
        data: Buffer.from(part.data.data).toString("base64"),
      },
    };
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}
function decode(raw: unknown): LanguageModelV4StreamPart {
  const part = raw as Record<string, any>;
  if (!part || typeof part.type !== "string")
    throw Error("STREAM_RECEIPT_INVALID");
  if (part.type === "response-metadata" && typeof part.timestamp === "string")
    return {
      ...part,
      timestamp: new Date(part.timestamp),
    } as LanguageModelV4StreamPart;
  if (
    (part.type === "file" || part.type === "reasoning-file") &&
    part.data?.type === "url"
  )
    return {
      ...part,
      data: { ...part.data, url: new URL(part.data.url) },
    } as LanguageModelV4StreamPart;
  return part as LanguageModelV4StreamPart;
}
/** 已确认完整模型流可回放；工具调用和finish只有在模型回执落库后才交给上层。 */
export function createDurableStreamModel(input: {
  model: LanguageModel;
  operationKey: string;
  /** 仅明确拒绝且尚未出流时使用已配置备用模型；仍走同一任务账本。 */
  fallbackModel?(operationKey:string):Promise<LanguageModel|null>;
  ports: DurableGenerationPorts;
  signal?: AbortSignal;
  replayFingerprints?:readonly ChatModelReplayFingerprint[];
  legacyPrompt?():Promise<unknown>;
  /** 仅新的已开始调用创建展示流；历史回放不再次写入。close必须在回执结算前完成。 */
  streamEvents?(callId:string):{push(part:LanguageModelV4StreamPart):Promise<void>;close():Promise<void>};
}):LanguageModelV4 {
  if (typeof input.model === "string")
    throw Error("DURABLE_MODEL_REQUIRES_RESOLVED_PROVIDER");
  let sequence = 0;
  const fingerprints=new Map(input.replayFingerprints?.map(value=>[value.operationKey,value]));
  return wrapLanguageModel({
    model: input.model,
    middleware: {
      specificationVersion: "v4",
      async transformParams({ params }) {
        const signals = [params.abortSignal, input.signal].filter(
          (s): s is AbortSignal => Boolean(s),
        );
        return {
          ...params,
          ...(signals.length ? { abortSignal: AbortSignal.any(signals) } : {}),
        };
      },
      async wrapGenerate() {
        throw Error("DURABLE_CHAT_REQUIRES_STREAM");
      },
      async wrapStream({ params, doStream, model }) {
        params.abortSignal?.throwIfAborted();
        const { abortSignal: _signal, headers: _headers, ...request } = params;
        const operationKey=`${input.operationKey}/model/${++sequence}`;
        const fallback=async()=>{
          const model=await input.fallbackModel?.(operationKey);
          if(!model)return undefined;
          params.abortSignal?.throwIfAborted();
          return createDurableStreamModel({...input,model,operationKey:`${operationKey}/fallback`,fallbackModel:undefined}).doStream(params);
        };
        const fingerprint=fingerprints.get(operationKey);
        const currentRequest=JSON.parse(JSON.stringify(requestJson({...request,modelId:model.modelId,provider:model.provider})));
        // 仅历史摘要不匹配时才重建旧窗口；普通新请求没有额外 SDK 调用。
        const legacyPrompt=fingerprint && requestDigest(currentRequest)!==fingerprint.inputDigest
          ? requestJson(await input.legacyPrompt?.()):undefined;
        const selected=selectChatReplayRequest(currentRequest,fingerprint,legacyPrompt);
        const reservation = await input.ports.reserve({operationKey,request:selected.request});
        if(fingerprint && (reservation.callId!==fingerprint.callId || (selected.replayOnly && (reservation.status!=="settled" || !reservation.providerResult))))
          throw new GenerationFailure("unknown_result","CHAT_MODEL_REPLAY_RECEIPT_MISMATCH");
        params.abortSignal?.throwIfAborted();
        if (reservation.status === "settled" && reservation.providerResult) {
          const saved = workerProviderReceiptSchema.parse(
            reservation.providerResult,
          );
          if (!saved.stream)
            throw new GenerationFailure(
              "unknown_result",
              "STREAM_RECEIPT_UNAVAILABLE",
            );
          return {
            stream: new ReadableStream<LanguageModelV4StreamPart>({
              start(c) {
                for (const part of saved.stream!.parts) c.enqueue(decode(part));
                c.close();
              },
            }),
          };
        }
        if(reservation.status==="rejected" && reservation.rejectionCode==="CHAT_MODEL_RETRYABLE_REJECTION"){
          const recovered=await fallback();
          if(recovered)return recovered;
          throw new GenerationFailure("retry_wait","CHAT_MODEL_RETRYABLE_REJECTION");
        }
        if (reservation.status !== "reserved")
          throw new GenerationFailure(
            "unknown_result",
            "MODEL_CALL_REQUIRES_RECONCILIATION",
          );
        try {
          await input.ports.start(reservation.callId);
        } catch {
          throw new GenerationFailure(
            "unknown_result",
            "MODEL_START_RECEIPT_UNKNOWN",
          );
        }
        let result: Awaited<ReturnType<typeof doStream>>;
        try {
          params.abortSignal?.throwIfAborted();
          result = await doStream();
        } catch (error) {
          const failure = generationFailure(error, false, {allowUnconfirmedModelRetry:true});
          const fallbackEligible=failure.outcome==="retry_wait" && Boolean(input.fallbackModel);
          try {
            await input.ports.settle(
              reservation.callId,
              failure.outcome === "unknown_result"
                ? { status: "unknown" }
                : failure.outcome === "retry_wait" && !fallbackEligible
                  ? {status:"superseded"}
                : { status: "rejected",...(failure.errorMessage?{errorDetail:failure.errorMessage}:{}),...(fallbackEligible?{rejectionCode:"CHAT_MODEL_RETRYABLE_REJECTION" as const}:{}) },
            );
          } catch {
            throw new GenerationFailure(
              "unknown_result",
              "MODEL_SETTLEMENT_RECEIPT_UNKNOWN",
            );
          }
          if(fallbackEligible){const recovered=await fallback();if(recovered)return recovered;}
          throw failure;
        }
        const events=input.streamEvents?.(reservation.callId);
        const reader = result.stream.getReader(),
          parts: Record<string, unknown>[] = [],
          content: Record<string, unknown>[] = [],
          active = new Map<string, Record<string, unknown>>(),
          deferred: LanguageModelV4StreamPart[] = [];
        let finish:
            Extract<LanguageModelV4StreamPart, { type: "finish" }> | undefined,
          warnings: unknown[] = [],
          settled = false,
          settling = false,
          stopped = false,
          defer = false,
          cancelled = false;
        const stop = async (status:"unknown"|"superseded") => {
          if (settled || settling || stopped) return;
          stopped = true;
          await events?.close().catch(()=>{});
          await input.ports
            .settle(reservation.callId, { status })
            .catch(() => {});
        };
        const accept = (part: LanguageModelV4StreamPart) => {
          if (part.type === "error")
            throw new GenerationFailure(
              "retry_wait",
              "MODEL_STREAM_INTERRUPTED",
            );
          if (part.type === "raw") return;
          const encoded = encode(part);
          parts.push(encoded);
          if (part.type === "stream-start") warnings = part.warnings;
          else if (part.type === "finish") {
            if (finish || part.finishReason.unified === "error")
              throw Error("STREAM_FINISH_INVALID");
            finish = part;
          } else if (
            part.type === "text-start" ||
            part.type === "reasoning-start"
          ) {
            const key = `${part.type.startsWith("text") ? "text" : "reasoning"}:${part.id}`;
            if (active.has(key)) throw Error("STREAM_PART_DUPLICATE");
            const value = {
              type: part.type.startsWith("text") ? "text" : "reasoning",
              text: "",
              ...(part.providerMetadata
                ? { providerMetadata: part.providerMetadata }
                : {}),
            };
            active.set(key, value);
            content.push(value);
          } else if (
            part.type === "text-delta" ||
            part.type === "reasoning-delta"
          ) {
            const key = `${part.type.startsWith("text") ? "text" : "reasoning"}:${part.id}`,
              value = active.get(key);
            if (!value) throw Error("STREAM_PART_MISSING");
            value.text = String(value.text) + part.delta;
            if (part.providerMetadata)
              value.providerMetadata = part.providerMetadata;
          } else if (
            part.type === "text-end" ||
            part.type === "reasoning-end"
          ) {
            const key = `${part.type.startsWith("text") ? "text" : "reasoning"}:${part.id}`,
              value = active.get(key);
            if (!value) throw Error("STREAM_PART_MISSING");
            if (part.providerMetadata)
              value.providerMetadata = part.providerMetadata;
            active.delete(key);
          } else if (
            ![
              "response-metadata",
              "tool-input-start",
              "tool-input-delta",
              "tool-input-end",
            ].includes(part.type)
          )
            content.push(encoded);
        };
        return {
          ...result,
          stream: new ReadableStream<LanguageModelV4StreamPart>({
            async pull(controller) {
              try {
                while (true) {
                  params.abortSignal?.throwIfAborted();
                  const next = await reader.read();
                  if (next.done) {
                    if (!finish || active.size)
                      throw new GenerationFailure("retry_wait","MODEL_STREAM_INCOMPLETE");
                    const receipt = workerProviderReceiptSchema.parse(
                      JSON.parse(
                        JSON.stringify({
                          content,
                          finishReason: finish.finishReason,
                          usage: finish.usage,
                          warnings,
                          providerMetadata: finish.providerMetadata,
                          stream: { schemaVersion: 1, parts },
                        }),
                      ),
                    ) as WorkerProviderReceipt;
                    await events?.close();
                    const usage = receipt.usage;
                    settling = true;
                    try {
                      await input.ports.settle(reservation.callId, {
                        status: "settled",
                        providerResult: receipt,
                        usage: {
                          inputTokens: usage.inputTokens.total,
                          outputTokens: usage.outputTokens.total,
                          inputTokenDetails: {
                            noCacheTokens: usage.inputTokens.noCache,
                            cacheReadTokens: usage.inputTokens.cacheRead,
                            cacheWriteTokens: usage.inputTokens.cacheWrite,
                          },
                          outputTokenDetails: {
                            textTokens: usage.outputTokens.text,
                            reasoningTokens: usage.outputTokens.reasoning,
                          },
                        },
                      });
                    } catch {
                      throw new GenerationFailure(
                        "unknown_result",
                        "MODEL_SETTLEMENT_RECEIPT_UNKNOWN",
                      );
                    }
                    settled = true;
                    if (cancelled) return;
                    params.abortSignal?.throwIfAborted();
                    for (const part of deferred) controller.enqueue(part);
                    controller.close();
                    reader.releaseLock();
                    return;
                  }
                  const part = next.value;
                  accept(part);
                  await events?.push(part);
                  if (
                    part.type === "tool-call" ||
                    part.type === "tool-approval-request" ||
                    part.type === "finish"
                  )
                    defer = true;
                  // 后续工具仍可能持续生成参数；仅前送参数流活性，完整调用等结算后释放。
                  if (defer && !["tool-input-start", "tool-input-delta", "tool-input-end"].includes(part.type)) {
                    deferred.push(part);
                    continue;
                  }
                  controller.enqueue(part);
                  return;
                }
              } catch (error) {
                const aborted=params.abortSignal?.aborted || cancelled;
                const failure=error instanceof GenerationFailure ? error : generationFailure(error,parts.length>0,{allowUnconfirmedModelRetry:true});
                await stop(!aborted && failure.outcome==="retry_wait" ? "superseded" : "unknown");
                await reader.cancel().catch(() => {});
                if (!cancelled) {
                  controller.enqueue({
                    type: "error",
                    error: aborted ? new GenerationFailure("unknown_result","MODEL_CANCELLED") : failure,
                  });
                  controller.close();
                }
              }
            },
            async cancel() {
              cancelled = true;
              await stop("unknown");
              await reader.cancel().catch(() => {});
            },
          }),
        };
      },
    },
  });
}
