import type { RequestContext } from "@creatoros/contract";
import type { ModelSpec } from "@creatoros/ai-worker";
import { LlmCredentialError } from "./llm/provider";
import {
  TRANSCRIPT_POSTPROCESS_CAPABILITY, runTranscriptPostprocessRuntime,
  isTranscriptExecutionControlError,
  type TranscriptPostprocessInput, type TranscriptPostprocessOutcome,
  type TranscriptPostprocessRuntimeDeps,
} from "@creatoros/ai-worker/transcript-postprocess";
export * from "@creatoros/ai-worker/transcript-postprocess";

export interface TranscriptPostprocessDeps extends TranscriptPostprocessRuntimeDeps {
  resolveModelSpec: (ctx: RequestContext, capability: string) => Promise<ModelSpec>;
}
/** Backend 只解析当前用户模型；执行与保真校验由 Worker runtime 承担。 */
export async function runTranscriptPostprocess(ctx: RequestContext, input: TranscriptPostprocessInput, deps: TranscriptPostprocessDeps): Promise<TranscriptPostprocessOutcome> {
  input.signal?.throwIfAborted();
  if (!input.transcript.trim()) return {applied: false, transcript: input.transcript, reason: "原文为空,跳过"};
  let spec: ModelSpec;
  try {
    spec = await deps.resolveModelSpec(ctx, TRANSCRIPT_POSTPROCESS_CAPABILITY);
    input.signal?.throwIfAborted();
  } catch (error) {
    input.signal?.throwIfAborted();
    if (isTranscriptExecutionControlError(error)) throw error;
    return {applied: false, transcript: input.transcript, reason: error instanceof LlmCredentialError
      ? "模型未配置(无可用 LLM 凭据)" : `模型解析失败:${error instanceof Error ? error.message : String(error)}`};
  }
  return runTranscriptPostprocessRuntime(spec, input, deps);
}
