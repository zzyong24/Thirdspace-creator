import { z } from "zod";
import { chatProviderNonTextSchema, agenticToolOutcomeSchema, checkpointToolCallSchema, workerProviderReceiptSchema, workerToolResultReceiptSchema, chatToolProviderName, type chatWorkerInputSchema } from "@creatoros/contract/execution-worker";
import { ConflictError } from "../execution/execution.errors";
type Json = z.infer<ReturnType<typeof z.json>>;
type Call = {
    id: string;
    kind: string;
    providerResult: unknown;
    resultText: string | null;
};
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
/** 私有持久协议到既有聊天 parts 的投影；不执行模型、不采纳工具候选。 */
export function projectChatReceipts(calls: Call[], input: z.infer<typeof chatWorkerInputSchema>) {
    const parts: Record<string, Json>[] = [], pending = new Map<string, Record<string, Json>>(), seen = new Set<string>(), invalidInputs = new Set<string>();
    let finishReason = "", hasOutput = false;
    for (const call of calls) {
        if (call.kind === "model") {
            if (pending.size)
                throw new ConflictError("前一模型回合尚有工具未完成");
            const receipt = workerProviderReceiptSchema.parse(call.providerResult);
            finishReason = receipt.finishReason.unified;
            if (["error", "unknown"].includes(finishReason))
                throw new ConflictError("模型结束结果未确认");
            parts.push({ type: "step-start" });
            let modelTools = 0;
            for (const raw of receipt.content) {
                const part = object(raw);
                if (part.type === "text" || part.type === "reasoning") {
                    if (typeof part.text !== "string")
                        throw new ConflictError("模型文字回执不完整");
                    parts.push({ type: part.type, text: part.text, state: "done", ...(part.providerMetadata ? { providerMetadata: z.json().parse(part.providerMetadata) } : {}) });
                    if (part.type === "text" && part.text.trim())
                        hasOutput = true;
                }
                else if (part.type === "tool-call") {
                    const tool = checkpointToolCallSchema.parse(part);
                    if (seen.has(tool.toolCallId) || !input.tools.some(def => chatToolProviderName(def.name) === tool.toolName))
                        throw new ConflictError("工具调用重复或超出冻结范围");
                    let params: Json;
                    try {
                        params = z.json().parse(JSON.parse(tool.input));
                    }
                    catch {
                        params = tool.input;
                        invalidInputs.add(tool.toolCallId);
                    }
                    const projected: Record<string, Json> = { type: `tool-${tool.toolName}`, toolCallId: tool.toolCallId, input: params, state: "input-available", ...(part.providerMetadata ? {callProviderMetadata:z.json().parse(part.providerMetadata)} : {}) };
                    parts.push(projected);
                    pending.set(tool.toolCallId, projected);
                    seen.add(tool.toolCallId);
                    modelTools++;
                }
                else {
                    const parsed=chatProviderNonTextSchema.safeParse(part);
                    if(!parsed.success)throw new ConflictError("模型回执类型尚未完成聊天投影");
                    const value=parsed.data;
                    const metadata:Record<string,Json>=value.providerMetadata?{providerMetadata:value.providerMetadata}:{};
                    if(value.type==="source") {
                        parts.push(value.sourceType==="url"
                            ? {type:"source-url",sourceId:value.id,url:value.url,...(value.title!==undefined?{title:value.title}:{}),...metadata}
                            : {type:"source-document",sourceId:value.id,mediaType:value.mediaType,title:value.title,...(value.filename!==undefined?{filename:value.filename}:{}),...metadata});
                    } else {
                        parts.push({type:value.type,mediaType:value.mediaType,url:value.data.type==="url"?value.data.url:`data:${value.mediaType};base64,${value.data.data}`,...metadata});
                        if(value.type==="file")hasOutput=true;
                    }
                }
            }
            if ((finishReason === "tool-calls") !== (modelTools > 0))
                throw new ConflictError("模型结束原因与工具回执不一致");
        }
        else if (call.kind === "tool") {
            const receipt = workerToolResultReceiptSchema.parse(JSON.parse(call.resultText ?? ""));
            const part = pending.get(receipt.toolCallId);
            if (!part || part.type !== `tool-${receipt.toolName}`)
                throw new ConflictError("工具回执未关联模型调用");
            hasOutput = applyChatToolOutcome(part,call.id,receipt.output,invalidInputs.has(receipt.toolCallId)) || hasOutput;
            pending.delete(receipt.toolCallId);
        }
        else
            throw new ConflictError("聊天账本包含非聊天调用");
    }
    if (pending.size)
        throw new ConflictError("聊天仍有待授权或未完成工具");
    if (!hasOutput)
        throw new ConflictError("聊天没有可保存产物");
    return { parts, content: parts.filter(part => part.type === "text").map(part => part.text).join(""), finishReason, outcome: finishReason === "stop" ? "succeeded" as const : "partial" as const };
}

/** 已确认工具结果到UI part的唯一规则；流事件和最终消息共用。 */
export function applyChatToolOutcome(part:Record<string,Json>,callId:string,raw:unknown,invalidInput:boolean){
    const output = agenticToolOutcomeSchema.parse(raw);
    if (output.sideEffect === "unknown" || output.error?.code === "unknown_commit")
        throw new ConflictError("未知工具结果不能完成聊天");
    if (invalidInput) {
        if(output.status!=="error" || output.sideEffect!=="none" || output.error?.code!=="invalid_input")throw new ConflictError("坏参数缺少已确认的参数错误回执");
        // SEMANTIC_BOUNDARY_ALLOW: 只投影已确认未执行的协议错误，不执行工具或选择创作内容。
        part.state="output-error";part.rawInput=part.input!;delete part.input;part.errorText=output.summary;
        return false;
    }
    const denied = output.sideEffect === "none" && output.error?.code === "permission" && object(output.data).denied === true;
    part.state = denied ? "output-denied" : "output-available";
    if (denied)
        part.approval = { id: `receipt:${callId}`, approved: false, reason: output.error!.recovery };
    else {
        part.output = z.json().parse(output.data ?? output);
        return true;
    }
    return false;
}
