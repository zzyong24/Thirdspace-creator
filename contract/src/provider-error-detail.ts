/** 受管模型的固定产品诊断；HTTP 402 本身不能证明余额不足。 */
export const CHANNEL_MODEL_PAYMENT_REQUIRED_MESSAGE =
  "官方模型服务返回支付或权益核验拒绝（HTTP 402）。请在设置查看 AI 额度与消耗，核对后继续原任务。";
export const MANAGED_AI_CREDIT_EXHAUSTED_MESSAGE = "AI 额度不足，请充值后再试。";

/** 供应商诊断只保留短消息；不接受请求、响应头或任意 JSON 正文。 */
export function redactProviderErrorDetail(value: string, secrets: readonly string[] = []): string {
  let text = value;
  for (const secret of secrets) if (secret) text = text.replaceAll(secret, "[REDACTED]");
  return text
    .replace(/https?:\/\/[^\s"'<>]+/gi, "[URL]")
    .replace(/bearer\s+[^\s,;"']+/gi, "Bearer [REDACTED]")
    .replace(/\b(?:sk-|sk_|key-)[a-z0-9_-]+/gi, "[REDACTED]")
    .replace(/(["']?(?:api[_-]?key|secret(?:_value)?|token|authorization|password)["']?\s*[:=]\s*)(?:"[^"\n]*"|'[^'\n]*'|[^\s,;}]+)/gi, "$1[REDACTED]")
    .replace(/[\x00-\x1f\x7f<>]/g, " ")
    .replace(/\s+/g, " ").trim().slice(0, 512);
}

/** 只投影 error 的短消息、code/type；受管来源仍须经领域白名单分类，不能直接对外透传。 */
export function providerErrorDetail(status: number, raw: string, secrets: readonly string[] = []): string {
  let detail = raw;
  try {
    const parsed = JSON.parse(raw.replace(/^\d{3}[:\s]+/, ""));
    const error = parsed?.error ?? parsed;
    detail = typeof error === "string" ? error
      : [error?.code, error?.type, error?.message].filter(v => typeof v === "string" || typeof v === "number").join(": ");
  } catch {
    // SDK 常返回“400 message”，不保留可能含完整请求或响应对象的 JSON。
    if (/[{}]/.test(raw)) detail = "";
  }
  const safe = redactProviderErrorDetail(detail, secrets);
  return `http_${status}${safe ? ": " + safe : ""}`.slice(0, 512);
}

/** SEMANTIC_BOUNDARY_ALLOW: 只翻译内部白名单阶段/HTTP分类，不解释供应商正文或推断扣费。 */
export function assetGenerationFailureMessage(code: string | null | undefined): string | null {
  if (code != null && code.trim() !== code) return null;
  if (code === 'ASSET_RESULT_UNKNOWN' || code === 'ASSET_ORIGINAL_RESULT_UNKNOWN' || code === 'ASSET_SUBMIT_RESULT_UNKNOWN')
    return '生成请求没有取得确认结果，已暂停。请先核对原结果和扣费，暂勿重新生成。';
  if (code === 'ASSET_SUBMIT_NETWORK_UNKNOWN')
    return '提交生成请求时连接中断，结果尚未确认。已停止自动提交，请先核对原结果和扣费。';
  if (code === 'ASSET_RESPONSE_INVALID_UNKNOWN')
    return '生成服务返回的内容无法识别为图片，已暂停。请核对原调用结果或联系官方处理。';
  if (code === 'ASSET_SAVE_RESULT_UNKNOWN')
    return '已收到图片，但本地保存结果尚未确认。请先核对原结果，暂勿重新生成。';
  if (code === 'ASSET_DOWNLOAD_NETWORK_UNKNOWN' || /^ASSET_DOWNLOAD_HTTP_[45]\d{2}_UNKNOWN$/.test(code ?? ''))
    return '图片结果下载失败，尚未保存。请核对原结果或联系官方处理，暂勿重新生成。';
  if (/^ASSET_SUBMIT_HTTP_[45]\d{2}_UNKNOWN$/.test(code ?? ''))
    return '生成服务返回异常，未取得确认结果。已暂停自动提交，请核对原结果后处理。';
  return null;
}
