import { createHash } from "node:crypto";
import type { LanguageModelV4 } from "@ai-sdk/provider";
import { generateText, type LanguageModel } from "ai";
import { createDurableGenerationModel } from "./durable-generation-model";
import { markStructuredOutputMode, type StructuredOutputMode } from "../runtime/provider-factory";
import type { RunStructuredNodeInput } from "../nodes/structured-node";

// SEMANTIC_BOUNDARY_ALLOW: JSON 键排序只核对调用身份，不判断提示词的内容含义。
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
}
export function generationRequestDigest(request: Record<string, unknown>) {
  return `sha256:${createHash("sha256").update(canonical(JSON.parse(JSON.stringify(request)))).digest("hex")}`;
}
export interface GenerationReplayReceipt {
  inputDigest: string;
  status: "settled" | "rejected" | "unknown";
  providerResult?: unknown;
  rejectionCode?: string | null;
}
export interface GenerationReplayInput {
  modelId: string;
  provider: string;
  structuredOutputMode?: StructuredOutputMode;
  receipts: readonly GenerationReplayReceipt[];
  signal?: AbortSignal;
  /** 仅当全部已确认回执已消费且节点自身失败时，返回失败而非伪造候选。 */
  captureNodeFailure?: boolean;
}
export type GenerationReplayResult<T> =
  | { status: "next-request"; request: Record<string, unknown>; consumed: number }
  | { status: "complete"; value: T; consumed: number }
  | { status: "failed"; consumed: number };

/** 无网络回放：同一节点只消费已确认回执，遇到下一请求立即停下供宿主核验。 */
export async function replayGenerationNode<T>(input: GenerationReplayInput, execute: (model: LanguageModel) => Promise<T>): Promise<GenerationReplayResult<T>> {
  const source = structuredClone({ modelId: input.modelId, provider: input.provider, receipts: input.receipts, structuredOutputMode: input.structuredOutputMode });
  input.signal?.throwIfAborted();
  let consumed = 0;
  let next: Record<string, unknown> | undefined;
  const stop = new Error("GENERATION_REPLAY_NEXT_REQUEST");
  const forbidden = async (): Promise<never> => { throw new Error("GENERATION_REPLAY_FORBIDS_IO"); };
  const provider: LanguageModelV4 = { specificationVersion: "v4", modelId: source.modelId, provider: source.provider, supportedUrls: {}, doGenerate: forbidden, doStream: forbidden };
  const model = createDurableGenerationModel({ model: markStructuredOutputMode(provider, source.structuredOutputMode ?? "native"), operationKey: "replay", signal: input.signal, ports: {
    async reserve({ request }) {
      input.signal?.throwIfAborted();
      const recorded = source.receipts[consumed];
      if (!recorded) { next = JSON.parse(JSON.stringify(request)); throw stop; }
      if (generationRequestDigest(request) !== recorded.inputDigest) throw new Error("GENERATION_REPLAY_REQUEST_MISMATCH");
      if (recorded.status === "unknown" || (recorded.status === "rejected" && recorded.rejectionCode !== "STRUCTURED_PROTOCOL_UNSUPPORTED")) throw new Error("GENERATION_REPLAY_REQUIRES_RECONCILIATION");
      if (recorded.status === "settled" && !recorded.providerResult) throw new Error("GENERATION_REPLAY_RECEIPT_MISSING");
      consumed += 1;
      return { callId: `replay-${consumed}`, status: recorded.status, providerResult: recorded.providerResult, rejectionCode: recorded.rejectionCode };
    },
    start: forbidden,
    settle: forbidden,
  } });
  try {
    const value = await execute(model);
    input.signal?.throwIfAborted();
    if (next) throw new Error("GENERATION_REPLAY_STOP_SWALLOWED");
    if (consumed !== source.receipts.length) throw new Error("GENERATION_REPLAY_UNUSED_RECEIPTS");
    return { status: "complete", value, consumed };
  } catch (error) {
    input.signal?.throwIfAborted();
    if (error === stop && next) return { status: "next-request", request: next, consumed };
    if(input.captureNodeFailure && !next && source.receipts.length>0 && consumed===source.receipts.length)return {status:"failed",consumed};
    throw error;
  }
}

export function replayTextGeneration(input: GenerationReplayInput & { system: string; prompt: string; maxOutputTokens: number }) {
  return replayGenerationNode(input, model => generateText({ model, system: input.system, prompt: input.prompt, maxOutputTokens: input.maxOutputTokens, maxRetries: 0, abortSignal: input.signal }));
}

export async function replayStructuredGeneration<T>(input: GenerationReplayInput, node: Omit<RunStructuredNodeInput<T>, "model" | "signal">) {
  const frozenInput = { ...input, receipts: structuredClone(input.receipts) };
  const frozenNode = { ...node, template: { ...node.template, requiredFacets: [...node.template.requiredFacets] }, facets: { ...node.facets } };
  input.signal?.throwIfAborted();
  const { runStructuredNode } = await import("../nodes/structured-node");
  return replayGenerationNode(frozenInput, model => runStructuredNode({ ...frozenNode, model, signal: input.signal }));
}
