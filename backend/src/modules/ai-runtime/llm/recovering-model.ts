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
      wrapStream: async ({ doStream, params, model }) => {
        const run = (start: () => ReturnType<typeof doStream>) =>
          startWithRecovery({
            start,
            startFallback: fallback ? () => fallback.doStream(params) : null,
            maxRetries: opts.maxRetries,
            sleep: opts.sleep,
            random: opts.random,
            onEvent: opts.onEvent,
          });
        try {
          return await run(doStream);
        } catch (err) {
          if (!shouldDowngradeToolChoice(params, err)) throw err;
          opts.onEvent?.({ type: "retry", reason: TOOL_CHOICE_DOWNGRADE_REASON });
          return await run(() =>
            model.doStream({ ...params, toolChoice: { type: "auto" } }),
          );
        }
      },
      wrapGenerate: async ({ doGenerate, params, model }) => {
        const run = (start: () => ReturnType<typeof doGenerate>) =>
          startWithRecovery({
            start,
            startFallback: fallback ? () => fallback.doGenerate(params) : null,
            maxRetries: opts.maxRetries,
            sleep: opts.sleep,
            random: opts.random,
            onEvent: opts.onEvent,
          });
        try {
          return await run(doGenerate);
        } catch (err) {
          if (!shouldDowngradeToolChoice(params, err)) throw err;
          opts.onEvent?.({ type: "retry", reason: TOOL_CHOICE_DOWNGRADE_REASON });
          return await run(() =>
            model.doGenerate({ ...params, toolChoice: { type: "auto" } }),
          );
        }
      },
    },
  });
}

/** [T-443] 降级打点原因(chat-runner 消费 → console 可观测「这轮为什么变慢了」)。 */
export const TOOL_CHOICE_DOWNGRADE_REASON = "tool_choice_unsupported_downgrade";

/**
 * [T-443] 是否该把「强制指定工具」降级成 auto 重试一次。
 *
 * 背景:点界面按钮/深链时会下发 `toolChoice:{type:'tool'}` 让模型**第一步直接执行**该工具 ——
 * 这正是「MiniMax 一下就出卡」的原因(省掉模型自己决定要不要调工具的思考)。但推理/思考模型
 * (DeepSeek thinking「deepseek-v4-pro」、OpenAI o 系列)对它直接 400
 * 「Thinking mode does not support this tool_choice」。
 *
 * 这类错误**不可重试**(重试多少次都一样)但**可降级**:去掉强制退回 auto 即可跑通,强制意图由
 * system 强指令兜底(buildForcedToolInstruction)。故:**默认仍带强制**(支持的模型保持秒出),
 * 只有真被拒时才多花一次往返降级 —— 而不是一刀切改成 prompt 指令让**所有**模型都变慢
 * (2026-07-20 用户实测反馈:一刀切后 MiniMax 也从"一下就出来"变卡)。
 */
function shouldDowngradeToolChoice(
  params: { toolChoice?: { type?: string } | undefined },
  err: unknown,
): boolean {
  if (params.toolChoice?.type !== "tool") return false; // 本来就没强制,无可降级
  const e = err as { message?: unknown; responseBody?: unknown };
  const msg = `${e?.message ?? ""} ${e?.responseBody ?? ""}`.toLowerCase();
  return msg.includes("tool_choice") || msg.includes("tool choice");
}
