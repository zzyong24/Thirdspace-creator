// [T-239b S1] 错误恢复层的纯函数核心 —— 错误分类 + 指数退避 + retry-after 解析 + 重试执行器。
// 参照 Claude Code 源码 services/api/withRetry.ts:170-548 的分类/退避维度做轻量化落地:
//   - 保留:可重试分类(5xx/429/网络断/流启动中断)、500ms×2^n 封顶 32s、25% jitter、
//     honor `retry-after` 头、可配次数(env CREATOROS_LLM_MAX_RETRIES,默认 3)。
//   - 不抄:多云 auth(Bedrock/Vertex)、529 容量级联、fast-mode 冷却、persistent 长退避
//     (那些是 CLI 多云场景;本产品用户自带 key,SPEC §3 边界)。
// 全部纯函数(random/sleep 可注入),不碰网络 —— 单测直接断言分类矩阵与退避区间。

/** 分类结果:可重试与否 + 机器可读原因(打点用)。 */
export interface LlmErrorClass {
  retryable: boolean;
  /** 机器可读原因,如 "http_429" / "network_econnreset" / "auth_401" / "unknown"。 */
  reason: string;
}

// 形如 AI SDK APICallError / @anthropic-ai/sdk APIError 的最小错误投影(duck-typing,
// 不 import 具体 SDK 错误类 —— 两条 SDK 路径 + 任意 relay 的错误都能进同一分类器)。
interface ErrorLike {
  statusCode?: unknown; // AI SDK APICallError
  status?: unknown; // @anthropic-ai/sdk APIError
  isRetryable?: unknown; // AI SDK APICallError 自带判断(尊重它的 true)
  code?: unknown; // Node 网络错误 (ECONNRESET…)
  name?: unknown;
  message?: unknown;
  cause?: unknown;
  responseHeaders?: unknown; // AI SDK: Record<string, string>
  headers?: unknown; // @anthropic-ai/sdk: Headers | Record
  responseBody?: unknown;
}

function statusOf(err: ErrorLike): number | null {
  const raw = err.statusCode ?? err.status;
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

// 网络层可重试信号(Node error code / undici / fetch 文案)。流开始前的连接失败没有副作用,
// 重发安全。
const NETWORK_RETRYABLE_PATTERNS: ReadonlyArray<[RegExp, string]> = [
  [/econnreset/i, "network_econnreset"],
  [/etimedout/i, "network_etimedout"],
  [/econnrefused/i, "network_econnrefused"],
  [/eai_again|enotfound/i, "network_dns"],
  [/epipe/i, "network_epipe"],
  [/fetch failed/i, "network_fetch_failed"],
  [/socket hang up/i, "network_socket_hangup"],
  [/connection (?:closed|reset)/i, "network_connection_closed"],
  [/network error/i, "network_generic"],
  [/und_err|terminated|other side closed/i, "network_terminated"],
  // provider 侧「过载/取消」类流启动失败(Anthropic overloaded_error;MiniMax cancelled
  // 曾整轮崩 —— SPEC §1 实锤病例):流没开始,重试无副作用。
  [/overloaded/i, "provider_overloaded"],
  [/\bcancell?ed\b/i, "provider_cancelled"],
];

// 内容审核类拒绝:换着重发也不会通过,且反复重发审核敏感内容有害 → 不可重试。
// (MiniMax new_sensitive/1026 实录;OpenAI 兼容端点的 content_filter 同类。)
const CONTENT_MODERATION_PATTERN =
  /new_sensitive|content_filter|content policy|sensitive|输入内容含敏感/i;

function collectText(err: ErrorLike): string {
  const parts: string[] = [];
  if (typeof err.message === "string") parts.push(err.message);
  if (typeof err.code === "string") parts.push(err.code);
  if (typeof err.name === "string") parts.push(err.name);
  if (typeof err.responseBody === "string") parts.push(err.responseBody);
  // 网络错误常包在 cause 里(undici TypeError: fetch failed → cause: ECONNRESET)。
  const cause = err.cause as ErrorLike | undefined;
  if (cause && typeof cause === "object") {
    if (typeof cause.message === "string") parts.push(cause.message);
    if (typeof cause.code === "string") parts.push(cause.code);
    if (typeof cause.name === "string") parts.push(cause.name);
  }
  return parts.join(" | ");
}

/**
 * 错误分类器(纯函数)。可重试:5xx / 429 / 408 / 409 / 网络断(ECONNRESET·ETIMEDOUT·
 * fetch failed…)/ overloaded / cancelled 类流启动中断。不可重试:400/401/403/404/422
 * (参数与鉴权错,换着重发也不会好)、内容审核拒绝、用户主动 abort、其余未知错误
 * (保守默认 —— 不认识的错误不盲目重发)。
 */
export function classifyLlmError(err: unknown): LlmErrorClass {
  if (err === null || typeof err !== "object") {
    return { retryable: false, reason: "unknown" };
  }
  const e = err as ErrorLike;
  const text = collectText(e);

  // 用户主动中断:绝不自动重发(那是用户意图,不是故障)。
  if (/abort/i.test(typeof e.name === "string" ? e.name : "")) {
    return { retryable: false, reason: "aborted" };
  }
  // 内容审核拒绝:重发无意义,先于状态码判(常伪装成 400/200 带错误体)。
  if (CONTENT_MODERATION_PATTERN.test(text)) {
    return { retryable: false, reason: "content_moderation" };
  }

  const status = statusOf(e);
  if (status !== null) {
    if (status === 429) return { retryable: true, reason: "http_429" };
    if (status === 408) return { retryable: true, reason: "http_408" };
    if (status === 409) return { retryable: true, reason: "http_409" };
    if (status >= 500 && status <= 599) {
      return { retryable: true, reason: `http_${status}` };
    }
    if (status === 401 || status === 403) {
      return { retryable: false, reason: `auth_${status}` };
    }
    // 其余 4xx(400 参数错 / 404 模型不存在 / 422 校验失败…):请求本身不对,重发不会好。
    return { retryable: false, reason: `http_${status}` };
  }

  // AI SDK APICallError 自带 isRetryable(尊重它的 true;false 时仍过下面的网络断兜底)。
  if (e.isRetryable === true) {
    return { retryable: true, reason: "sdk_retryable" };
  }

  for (const [pattern, reason] of NETWORK_RETRYABLE_PATTERNS) {
    if (pattern.test(text)) return { retryable: true, reason };
  }

  return { retryable: false, reason: "unknown" };
}

/** 退避封顶(CC withRetry.ts:543 同款 32s)。 */
export const MAX_BACKOFF_MS = 32_000;
/** 退避基数(CC BASE_DELAY_MS 同款 500ms)。 */
export const BASE_BACKOFF_MS = 500;
/** honor retry-after 的上限 —— 对话产品一轮不值得等更久,超出按封顶退避走。 */
export const MAX_RETRY_AFTER_MS = 60_000;

/**
 * 指数退避(纯函数):500ms × 2^(attempt-1) 封顶 32s,再加 25% jitter。
 * attempt 从 1 起(第 1 次失败后的等待)。random 可注入(默认 Math.random)测试可控。
 */
export function computeBackoffMs(
  attempt: number,
  random: () => number = Math.random,
): number {
  const base = Math.min(
    BASE_BACKOFF_MS * Math.pow(2, Math.max(0, attempt - 1)),
    MAX_BACKOFF_MS,
  );
  return base + random() * 0.25 * base;
}

/**
 * 从错误里解析 `retry-after` 头(拿得到时 honor 服务端指令,CC getRetryAfter 同款):
 * 支持 AI SDK 的 responseHeaders Record 与 @anthropic-ai/sdk 的 Headers.get;支持秒数
 * 与 HTTP-date 两种格式。解析不出 / 非正数 / 超上限(60s)→ null(退回指数退避)。
 */
export function getRetryAfterMs(
  err: unknown,
  now: () => number = Date.now,
  maxDelayMs: number = MAX_RETRY_AFTER_MS,
): number | null {
  if (err === null || typeof err !== "object") return null;
  const e = err as ErrorLike;
  let raw: string | null = null;
  const rh = e.responseHeaders;
  if (rh && typeof rh === "object") {
    const v = (rh as Record<string, unknown>)["retry-after"];
    if (typeof v === "string") raw = v;
  }
  if (raw === null) {
    const h = e.headers as
      | { get?: (k: string) => string | null }
      | Record<string, unknown>
      | undefined;
    if (h && typeof (h as { get?: unknown }).get === "function") {
      raw = (h as { get: (k: string) => string | null }).get("retry-after");
    } else if (h && typeof h === "object") {
      const v = (h as Record<string, unknown>)["retry-after"];
      if (typeof v === "string") raw = v;
    }
  }
  if (!raw) return null;
  let ms: number | null = null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) {
    ms = seconds * 1000;
  } else {
    const date = Date.parse(raw);
    if (!Number.isNaN(date)) ms = date - now();
  }
  if (ms === null || !Number.isFinite(ms) || ms <= 0 || ms > maxDelayMs) return null;
  return ms;
}

/** 单次重试等待:优先 honor retry-after(拿得到且 ≤60s),否则指数退避 + jitter。 */
export function retryDelayMs(
  attempt: number,
  err: unknown,
  random: () => number = Math.random,
  now: () => number = Date.now,
): number {
  return getRetryAfterMs(err, now) ?? computeBackoffMs(attempt, random);
}

/** 重试次数可配:env CREATOROS_LLM_MAX_RETRIES,默认 3,夹在 [0, 10]。 */
export function resolveLlmMaxRetries(
  env: Record<string, string | undefined>,
): number {
  const raw = env.CREATOROS_LLM_MAX_RETRIES?.trim();
  if (!raw) return 3;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 3;
  return Math.min(10, Math.max(0, Math.floor(n)));
}

/** 恢复过程打点事件(recovering-model / chat-runner 消费,落 console 可观测)。 */
export interface RecoveryEvent {
  type: "retry" | "fallback" | "exhausted";
  /** 第几次失败(1 起)。 */
  attempt?: number;
  /** 本次等待毫秒数。 */
  delayMs?: number;
  /** 分类原因(classifyLlmError.reason)。 */
  reason?: string;
}

export interface StartWithRecoveryOptions<T> {
  /** 启动主模型(流开始前的那一步 —— doStream/doGenerate 的 promise)。 */
  start: () => PromiseLike<T>;
  /** 备用模型启动(用户配了 chat.fallback 才有);仅在主模型可重试错误耗尽后调一次。 */
  startFallback?: (() => PromiseLike<T>) | null;
  /** 主模型的重试次数(失败后再试几次;总尝试 = maxRetries + 1)。 */
  maxRetries: number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  onEvent?: (e: RecoveryEvent) => void;
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * 「流开始前失败」的分类重试执行器(SPEC §2-S1 语义边界):
 *   - 主模型 start() 失败 → 分类:不可重试 → 立刻抛(现状报错,不 fallback —— 参数/鉴权错
 *     换模型重发同样的坏请求没有意义,且会掩盖真错误);可重试 → 退避后重试,共 maxRetries 次。
 *   - 可重试且耗尽 → 配了 fallback → 换 fallback 启动一次(fallback 自身失败原样抛);
 *     未配 → 抛最后一次主模型错误(现状报错)。
 *   - **流中途断不在此层**:start() resolve 后流的中途失败由上层直接暴露给用户手动 regenerate
 *     (避免重复副作用,SPEC 边界)。
 */
export async function startWithRecovery<T>(
  opts: StartWithRecoveryOptions<T>,
): Promise<T> {
  const sleep = opts.sleep ?? defaultSleep;
  const random = opts.random ?? Math.random;
  let lastError: unknown;
  for (let attempt = 1; attempt <= opts.maxRetries + 1; attempt++) {
    try {
      return await opts.start();
    } catch (err) {
      lastError = err;
      const cls = classifyLlmError(err);
      if (!cls.retryable) throw err;
      if (attempt <= opts.maxRetries) {
        const delayMs = retryDelayMs(attempt, err, random);
        opts.onEvent?.({ type: "retry", attempt, delayMs, reason: cls.reason });
        await sleep(delayMs);
      }
    }
  }
  if (opts.startFallback) {
    opts.onEvent?.({
      type: "fallback",
      reason: classifyLlmError(lastError).reason,
    });
    try {
      return await opts.startFallback();
    } catch (fallbackErr) {
      opts.onEvent?.({ type: "exhausted" });
      throw fallbackErr;
    }
  }
  opts.onEvent?.({ type: "exhausted" });
  throw lastError;
}
