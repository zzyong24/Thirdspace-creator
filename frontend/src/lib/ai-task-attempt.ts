/**
 * T-513 AI task 原子执行的客户端 attempt 标识。
 *
 * 调用方应在一次用户/系统动作的边界只调用一次，然后把返回值放进将被发送（或重发）
 * 的同一个 createAITask 请求体。新的动作重新调用，传输层对同一请求的网络重试则复用
 * 已经写入请求体的 attemptId。
 */
export function createAiTaskAttemptId(): string {
  return globalThis.crypto.randomUUID();
}
