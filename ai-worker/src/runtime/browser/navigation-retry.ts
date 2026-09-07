/** gotoWithRetry 只依赖 page 的 goto + waitForTimeout(三处调用点的 page 接口都满足;
 *  fake page 单测同样只需这两件事)。 */
export interface GotoCapablePage {
  goto(url: string, opts?: unknown): Promise<unknown>;
  waitForTimeout(ms: number): Promise<void>;
}

export interface GotoWithRetryOptions {
  signal?: AbortSignal;
  /** 重试次数(不含首次尝试);默认 3(共 4 次)。 */
  retries?: number;
  /** 每次 goto 的超时(ms);默认 60000(与原裸 goto 一致)。 */
  timeoutMs?: number;
  /** 每次失败后的退避序列(ms);默认 [2000, 5000, 10000],超出长度取末位。 */
  backoffMs?: number[];
  /** goto 的 waitUntil(默认 domcontentloaded,与三处原调用一致)。 */
  waitUntil?: "domcontentloaded" | "load" | "networkidle" | "commit";
  /** 日志用短标签(默认取 url);标识是哪一步导航失败/自愈。 */
  label?: string;
  /** 敏感会话路径可关闭通用原错日志，由调用方记录脱敏分类。 */
  logRetries?: boolean;
}

/**
 * [T-202] 带退避重试的 page.goto。瞬时导航抖动(超时/网络)→ 退避后重试;直到成功或用尽重试
 * 抛**最后一次的原错**(不吞、不改类型 —— 上层 mapExportErr / catch 分类逻辑不变)。成功但曾
 * 失败过会 console.log 一行自愈记录,真机可观测「本轮是否踩到瞬时超时」。退避用 page.waitForTimeout
 * (真 Playwright / fake page 都有),不额外引 timer 依赖,保持可注入单测。
 */
export async function gotoWithRetry(
  page: GotoCapablePage,
  url: string,
  opts: GotoWithRetryOptions = {},
): Promise<void> {
  const retries = opts.retries ?? 3;
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const backoff = opts.backoffMs ?? [2_000, 5_000, 10_000];
  const waitUntil = opts.waitUntil ?? "domcontentloaded";
  const label = opts.label ?? url;
  const logRetries = opts.logRetries ?? true;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    opts.signal?.throwIfAborted();
    try {
      await page.goto(url, { waitUntil, timeout: timeoutMs });
      opts.signal?.throwIfAborted();
      if (attempt > 0 && logRetries) {
        console.log(
          `[douyin-goto] ${label} 第 ${attempt + 1} 次尝试成功(前 ${attempt} 次瞬时失败已自愈)`,
        );
      }
      return;
    } catch (err) {
      opts.signal?.throwIfAborted();
      lastErr = err;
      if (attempt >= retries) break; // 用尽重试 → 跳出抛原错
      const waitMs = backoff[Math.min(attempt, backoff.length - 1)] ?? 2_000;
      if (logRetries) {
        console.warn(
          `[douyin-goto] ${label} 第 ${attempt + 1} 次导航失败(${String(
            (err as { message?: unknown })?.message ?? err,
          ).slice(0, 160)}),${waitMs}ms 后重试`,
        );
      }
      await page.waitForTimeout(waitMs);
    }
  }
  throw lastErr;
}

