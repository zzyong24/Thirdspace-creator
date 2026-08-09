/**
 * 从 AI SDK 的非 2xx Error 中恢复 `/api/chat` 已策展的可行动提示。
 *
 * SDK 会把 JSON response body 整体塞进 `Error.message`；通用错误收口会把 JSON
 * 视为技术噪声，于是原本明确的“PDF 解析失败”被压成“出错了，请重试”。这里只允许
 * 一组由 chat route 生成的附件/当前稿面文案通过，未知错误和内部细节仍然不透传。
 */
export function extractChatApiPublicError(error: unknown): string | null {
  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  if (!raw.trim()) return null;

  let candidate = raw.trim();
  try {
    const parsed = JSON.parse(candidate) as { error?: unknown };
    if (typeof parsed.error !== "string") return null;
    candidate = parsed.error.trim();
  } catch {
    // DefaultChatTransport 可能直接使用纯文本 response；同样经过下面的白名单。
  }

  const publicPatterns = [
    /^每轮最多添加 \d+ 个有效附件。$/,
    /^当前版本尚未启用附件读取，请更新后重试。$/,
    /^本轮附件合计需小于 \d+MB，请分开上传。$/,
    /^附件不存在或不属于当前账号。$/,
    /^附件内容解析失败，请确认文件未损坏后重试。$/,
    /^附件暂时无法读取，请重新添加后再试。$/,
    /^附件“[^”]{1,100}”没有可读取的文字内容。$/,
    /^暂不支持读取附件“[^”]{1,100}”的格式。$/,
    /^这次局部改稿的段落上下文没有随消息送达。请在当前稿面目标段重新点一次“AI 改写本段”；系统不会因此改写整稿。$/,
    /^当前版本尚未启用稿面实时校验，请更新后重试。$/,
    /^稿面刚刚切换过版本，这一段已不在当前稿中。请在当前稿面目标段重新点一次“AI 改写本段”。$/,
    /^当前稿面不存在或不属于当前账号。$/,
    /^本次局部改写中断，稿面未被修改，目标段落已保留。参考号：chat-[a-f0-9]{10}。请直接重试。$/,
  ] as const;

  return candidate.length <= 160 && publicPatterns.some((pattern) => pattern.test(candidate))
    ? candidate
    : null;
}
