/**
 * 从 AI SDK 的非 2xx Error 中恢复 `/api/chat` 已策展的可行动提示。
 *
 * SDK 会把 JSON response body 整体塞进 `Error.message`；通用错误收口会把 JSON
 * 视为技术噪声，于是原本明确的“PDF 解析失败”被压成“出错了，请重试”。这里只允许
 * 一组由 chat route 生成的附件/当前稿面文案通过，未知错误和内部细节仍然不透传。
 */
type ChatApiErrorPayload = {
  readonly error?: unknown;
  readonly code?: unknown;
};

function parseChatApiErrorPayload(error: unknown): ChatApiErrorPayload | null {
  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  if (!raw.trim()) return null;

  try {
    const parsed = JSON.parse(raw.trim()) as ChatApiErrorPayload;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * 这些错误说明当前段落命令已经不可能靠“重试上一轮”恢复。继续保留锚点只会让每条后续
 * 消息重复命中同一个 409，因此 UI 必须结束局部模式，让普通项目对话立即恢复。
 */
export function isTerminalScriptSelectionError(error: unknown): boolean {
  const payload = parseChatApiErrorPayload(error);
  const code = payload?.code;
  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const message =
    typeof payload?.error === "string" ? payload.error.trim() : raw.trim();
  return (
    code === "SCRIPT_SELECTION_STALE" ||
    code === "SCRIPT_SELECTION_REQUIRED" ||
    code === "SCRIPT_SELECTION_RESOLVER_UNAVAILABLE" ||
    message ===
      "稿面刚刚切换过版本，这一段已不在当前稿中。请在当前稿面目标段重新点一次“AI 改写本段”。" ||
    message ===
      "这次局部改稿的段落上下文没有随消息送达。请在当前稿面目标段重新点一次“AI 改写本段”；系统不会因此改写整稿。" ||
    message === "当前版本尚未启用稿面实时校验，请更新后重试。"
  );
}

export function extractChatApiPublicError(error: unknown): string | null {
  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  if (!raw.trim()) return null;

  let candidate = raw.trim();
  const payload = parseChatApiErrorPayload(error);
  if (payload) {
    if (typeof payload.error !== "string") return null;
    candidate = payload.error.trim();
  } else {
    // DefaultChatTransport 可能直接使用纯文本 response；同样经过下面的白名单。
  }

  const publicPatterns = [
    /^聊天执行服务尚未就绪，输入已保留。请重启应用；仍失败时请提供诊断日志。$/,
    /^任务已经提交，但回复连接暂时中断。输入和任务已保留，请重新打开当前对话。$/,
    /^本轮请求准备或提交未完成，输入已保留。请重试；仍失败时请提供诊断日志。$/,
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
