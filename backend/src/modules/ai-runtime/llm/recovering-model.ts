// [T-239b S1] 错误恢复模型包装器 —— 把「分类重试 + 退避 + fallback 模型」装进 AI SDK 的
// 模型装配层(wrapLanguageModel 中间件,官方 seam),而非散在每个 streamText/generateObject
// 调用点。语义边界(SPEC §2-S1):
//   - 只管「流开始前失败」:doStream()/doGenerate() 的 promise reject = 请求没起来/流没开始,
//     重发无副作用 → 分类重试;可重试耗尽 → 换用户配的 fallback 模型再启动一次。
//   - **流中途断不重发**:doStream resolve 之后流里的错误原样透传(streamText 的 error part →
//     前端错误气泡 → 用户手动 regenerate),避免工具副作用/文本重复。
// 调用方须把 streamText/generateText 的 `maxRetries` 置 0 —— 重试语义收归这里,SDK 原生
// 重试(不分类、固定退避)留着会与本层相乘(4 次 × 3 次 = 12 连击)。
import { wrapLanguageModel, type LanguageModel } from "ai";
import {
  startWithRecovery,
  type RecoveryEvent,
} from "./retry-policy";

export interface RecoveringModelOptions {
  /** 主模型(modelFor(spec) 的产物;不接受 global-provider 字符串 id)。 */
  model: LanguageModel;
  /** 备用模型(用户配了 chat.fallback 专配行才有;null/缺省 = 现状报错)。 */
  fallbackModel?: LanguageModel | null;
  /** 主模型「流开始前失败」的重试次数(env CREATOROS_LLM_MAX_RETRIES,默认 3)。 */
  maxRetries: number;
  /** 测试注入:等待/随机源。 */
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  /** 恢复过程打点(retry / fallback / exhausted)—— chat-runner 据此归纳 typed 终止原因。 */
  onEvent?: (e: RecoveryEvent) => void;
}

/**
 * 把主模型包成「自带错误恢复」的 LanguageModel。所有非 doStream/doGenerate 的模型元信息
 * (provider/modelId/supportedUrls)由 wrapLanguageModel 透传主模型的。
 */
export function createRecoveringModel(
  opts: RecoveringModelOptions,
): LanguageModel {
  if (typeof opts.model === "string") {
    // 装配层永远传 modelFor 的实例;字符串 id 走 global provider 无法包装(诚实抛错,不静默降级)。
    throw new Error(
      "createRecoveringModel 需要 LanguageModel 实例,不接受字符串模型 id",
    );
  }
  // fallback 归一到 V4(wrapLanguageModel 空中间件 = 官方 spec-version 升档),这样无论
  // provider 实现哪版 spec,都能用主模型中间件收到的 V4 params 直接调它的 doStream/doGenerate。
  const fallback =
    opts.fallbackModel && typeof opts.fallbackModel !== "string"
      ? wrapLanguageModel({ model: opts.fallbackModel, middleware: {} })
      : null;

  return wrapLanguageModel({
    model: opts.model,
    middleware: {
      wrapStream: ({ doStream, params }) =>
        startWithRecovery({
          start: doStream,
          startFallback: fallback ? () => fallback.doStream(params) : null,
          maxRetries: opts.maxRetries,
          sleep: opts.sleep,
          random: opts.random,
          onEvent: opts.onEvent,
        }),
      wrapGenerate: ({ doGenerate, params }) =>
        startWithRecovery({
          start: doGenerate,
          startFallback: fallback ? () => fallback.doGenerate(params) : null,
          maxRetries: opts.maxRetries,
          sleep: opts.sleep,
          random: opts.random,
          onEvent: opts.onEvent,
        }),
    },
  });
}
