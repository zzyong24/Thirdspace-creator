import { z } from "zod";

const httpsUrl = z
  .string()
  .url()
  .refine((value) => value.startsWith("https://"), "HTTPS URL required")
  .refine((value) => {
    try {
      const parsed = new URL(value);
      return parsed.username === "" && parsed.password === "";
    } catch {
      return false;
    }
  }, "URL userinfo forbidden");

const nullableHttpsUrl = httpsUrl.nullable();

/**
 * API-TSB-001：Creator UI 唯一可见的已净化渠道运行时投影。
 *
 * 身份、版本、摘要、签名和授权字段都只在 Rust 验证/加密缓存层使用，禁止经本地 API
 * 透出。`runtimeState` 区分未配置与本地读取错误；链接 null 只表示当前入口不可用，
 * 不能由 Creator 推断渠道 lifecycle。
 */
export const localChannelRuntimeResponse = z
  .object({
    runtimeState: z.enum(["ready", "unavailable", "read_error"]),
    brandName: z.string().min(1).max(30).nullable(),
    purchaseUrl: nullableHttpsUrl,
    renewalUrl: nullableHttpsUrl,
    channelSupportUrl: nullableHttpsUrl,
    bugFeedbackUrl: nullableHttpsUrl,
    downloadUrl: nullableHttpsUrl,
  })
  .strict();

export type LocalChannelRuntimeResponse = z.infer<
  typeof localChannelRuntimeResponse
>;

const normalizeMultiline = (value: string) =>
  value.replace(/\r\n?/g, "\n");
const forbiddenFeedbackCharacter = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/u;

function feedbackText(min: number, max: number) {
  return z
    .string()
    .transform(normalizeMultiline)
    .refine(
      (value) => {
        const length = Array.from(value.trim()).length;
        return length >= min && length <= max;
      },
      `feedback text must contain ${min}..${max} Unicode scalars`,
    )
    .refine(
      (value) => !forbiddenFeedbackCharacter.test(value),
      "feedback text contains forbidden control characters",
    );
}

/**
 * API-CREATOR-001：Web → 本机可信 sidecar 的 closed request。
 *
 * 只允许屏幕上可预览的文字与非敏感运行摘要。渠道、优先级、激活码、机器标识与 AM token
 * 只能由 sidecar 从加密 `.license` 和 AM 响应取得，不能出现在该边界。
 */
export const localProductFeedbackRequest = z
  .object({
    summary: feedbackText(5, 160),
    description: feedbackText(1, 4000),
    reproductionSteps: feedbackText(0, 4000),
    appVersion: feedbackText(1, 64),
    osName: feedbackText(1, 128),
    locale: z.string().trim().min(2).max(35),
  })
  .strict();

export const localProductFeedbackSuccess = z
  .object({
    ok: z.literal(true),
    publicRef: z.string().min(1).max(64),
    status: z.literal("new"),
    channelBinding: z.literal("verified"),
  })
  .strict();

export const localProductFeedbackFailure = z
  .object({
    ok: z.literal(false),
    code: z.string().min(1).max(64),
    message: z.string().min(1).max(200),
    retryable: z.boolean(),
  })
  .strict();

export const localProductFeedbackResponse = z.discriminatedUnion("ok", [
  localProductFeedbackSuccess,
  localProductFeedbackFailure,
]);

export type LocalProductFeedbackRequest = z.infer<
  typeof localProductFeedbackRequest
>;
export type LocalProductFeedbackResponse = z.infer<
  typeof localProductFeedbackResponse
>;
