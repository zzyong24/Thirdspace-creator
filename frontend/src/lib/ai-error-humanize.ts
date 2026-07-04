// [T-094] AI 链路错误 → 人话的共享映射(单一真值)。
//
// 背景(实录):倾倒场蒸馏报 `Failed after 3 attempts. AI_APICallError: input new_sensitive (1026)`
// —— MiniMax 平台内容安全审核拦截了**输入原文**,SDK 重试 3 次全拦,用户看到一串机器码,完全
// 不知道发生了什么、该干什么。本表把这类「模型方平台错误码」翻译成用户能行动的人话。
//
// 落点与消费方(与 lib/chat-tool-labels 同款:纯常量/纯函数,无 "use client" / "server-only",
// 前后端都可安全 import):
//   - server:/api/knowledge/distill 路由(旧蒸馏管线)、/api/chat 的 onError、
//     chat-tools 的 knowledge.distill 工具 execute(错误随工具结果卡渲染);
//   - client:Copilot 对话错误气泡 / 蒸馏确认门卡的错误态。
//
// 原则:只翻译**能识别的**错误(规则不命中返回 null,调用方回落原始 message —— 诚实,
// 不把未知错误包装成似是而非的人话)。规则表可扩展,其他 AI 链路直接复用。

/** 翻译结果:人话 message + 是否建议「去设置换模型」(渲染层据此挂设置深链)。 */
export interface HumanAiError {
  /** 给人看的错误说明(含建议动作)。 */
  message: string;
  /** true = 建议用户换模型(渲染层附「去设置」链接;不做自动切换 —— 确认门原则)。 */
  suggestSwitchModel: boolean;
}

interface AiErrorRule {
  /** 命中原始错误串的特征(错误码/关键词;对 message 全文做不区分大小写匹配)。 */
  pattern: RegExp;
  human: HumanAiError;
}

/**
 * 错误码 → 人话规则表(按序匹配,先命中先用)。
 * MiniMax 平台码参考:1026=输入敏感,1027=输出敏感,1008=余额不足,1002/1039=限流。
 */
export const AI_ERROR_HUMAN_RULES: readonly AiErrorRule[] = [
  {
    // 输入被内容安全审核拦截(实录主案例):new_sensitive / 1026。
    pattern: /new_sensitive|input[\s_-]*sensitive|\(1026\)|\b1026\b/i,
    human: {
      message:
        "内容触发了模型方(MiniMax)的内容安全审核,已重试仍被拦。建议:在设置里换一个模型再试,或删去疑似敏感段落后重试。",
      suggestSwitchModel: true,
    },
  },
  {
    // 输出被内容安全审核拦截:1027 / output sensitive。
    pattern: /output[\s_-]*sensitive|\(1027\)|\b1027\b/i,
    human: {
      message:
        "模型生成的内容触发了模型方(MiniMax)的内容安全审核,结果被拦截。建议:在设置里换一个模型再试,或调整措辞后重试。",
      suggestSwitchModel: true,
    },
  },
  {
    // 限流:1002/1039 / rate limit。
    pattern: /rate[\s_-]*limit|\(1002\)|\(1039\)|too many requests|\b429\b/i,
    human: {
      message: "模型方限流了(请求太频繁)。稍等几十秒再试;频繁出现可在设置里换一个模型。",
      suggestSwitchModel: false,
    },
  },
  {
    // 余额/配额不足:1008 / insufficient balance|quota。
    pattern: /insufficient[\s_-]*(balance|quota)|\(1008\)|\b1008\b/i,
    human: {
      message: "模型方账户余额/配额不足,请求被拒。去模型方平台充值,或在设置里换一个模型。",
      suggestSwitchModel: true,
    },
  },
] as const;

/**
 * 原始错误串 → 人话(命中规则表)。不命中返回 null —— 调用方回落原串,不装懂。
 */
export function humanizeAiErrorMessage(raw: string): HumanAiError | null {
  if (!raw) return null;
  for (const rule of AI_ERROR_HUMAN_RULES) {
    if (rule.pattern.test(raw)) return rule.human;
  }
  return null;
}

/** Error/unknown → 人话(取 message 走规则表)。不命中返回 null。 */
export function humanizeAiError(err: unknown): HumanAiError | null {
  const raw =
    err instanceof Error
      ? // AI SDK 的 APICallError 常把平台码藏在 cause/responseBody 里,message 只有一层 —— 一并扫。
        [
          err.message,
          (err as { responseBody?: unknown }).responseBody,
          err.cause instanceof Error
            ? err.cause.message
            : typeof err.cause === "string"
              ? err.cause
              : "",
        ]
          .filter((v): v is string => typeof v === "string" && v.length > 0)
          .join(" | ")
      : String(err ?? "");
  return humanizeAiErrorMessage(raw);
}
