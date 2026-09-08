export interface BundledBrowserSearchHit {
  readonly title: string;
  readonly url: string;
  readonly snippet: string;
  readonly publishedAt?: string;
  readonly siteName?: string;
}

export interface BrowserSearchAttempt {
  readonly engine: "baidu" | "duckduckgo";
  readonly status: "ok" | "empty" | "error" | "skipped";
  readonly resultCount: number;
  readonly durationMs: number;
  readonly error?: string;
}

export interface BrowserSearchFallbackState {
  baiduLoginWallBlockedUntil: number;
}

export interface BrowserSearchFallbackRuntime {
  readonly state: BrowserSearchFallbackState;
  readonly now?: () => number;
  readonly loginWallCooldownMs?: number;
}

const DEFAULT_LOGIN_WALL_COOLDOWN_MS = 5 * 60_000;
const MIN_LOGIN_WALL_COOLDOWN_MS = 30_000;
const MAX_LOGIN_WALL_COOLDOWN_MS = 10 * 60_000;

export function createBrowserSearchFallbackState(): BrowserSearchFallbackState {
  return { baiduLoginWallBlockedUntil: 0 };
}

function resolveLoginWallCooldownMs(requestedMs: number | undefined): number {
  if (requestedMs === undefined || !Number.isFinite(requestedMs)) {
    return DEFAULT_LOGIN_WALL_COOLDOWN_MS;
  }
  return Math.min(
    MAX_LOGIN_WALL_COOLDOWN_MS,
    Math.max(MIN_LOGIN_WALL_COOLDOWN_MS, Math.round(requestedMs)),
  );
}

function isConfirmedLoginWall(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /登录墙|反爬验证|captcha|人机验证/i.test(message);
}

const ENGINES = [
  { name: "baidu" as const, baseUrl: "https://www.baidu.com/s?wd={q}" },
  { name: "duckduckgo" as const, baseUrl: null },
] as const;

/**
 * 内置浏览器检索：国内中文默认百度；失败或零结果时切 DuckDuckGo HTML。
 * 两路都是真浏览器结果，绝不补模型记忆。只有两路都抛错才抛聚合错误；
 * 正常执行但均为 0 条则诚实返回空数组。
 */
export async function searchBundledBrowserWithFallback(
  query: string,
  options: { count?: number; signal?: AbortSignal } | undefined,
  runEngine: (
    baseUrl: string | null,
    query: string,
    options?: { count?: number; signal?: AbortSignal },
  ) => Promise<readonly BundledBrowserSearchHit[]>,
  onAttempt?: (attempt: BrowserSearchAttempt) => void,
  runtime?: BrowserSearchFallbackRuntime,
): Promise<BundledBrowserSearchHit[]> {
  const failures: string[] = [];
  let completedEngine = false;
  const now = runtime?.now ?? Date.now;
  for (const engine of ENGINES) {
    options?.signal?.throwIfAborted();
    if (
      engine.name === "baidu" &&
      runtime &&
      runtime.state.baiduLoginWallBlockedUntil > now()
    ) {
      onAttempt?.({
        engine: "baidu",
        status: "skipped",
        resultCount: 0,
        durationMs: 0,
        error: "已确认登录墙，冷却期内跳过",
      });
      continue;
    }
    const startedAt = Date.now();
    try {
      const rows = [...(await runEngine(engine.baseUrl, query, options))];
      options?.signal?.throwIfAborted();
      completedEngine = true;
      onAttempt?.({
        engine: engine.name,
        status: rows.length > 0 ? "ok" : "empty",
        resultCount: rows.length,
        durationMs: Date.now() - startedAt,
      });
      if (rows.length > 0) return rows;
    } catch (error) {
      options?.signal?.throwIfAborted();
      const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      if (engine.name === "baidu" && runtime && isConfirmedLoginWall(error)) {
        runtime.state.baiduLoginWallBlockedUntil =
          now() + resolveLoginWallCooldownMs(runtime.loginWallCooldownMs);
      }
      failures.push(`${engine.name}: ${message}`);
      onAttempt?.({
        engine: engine.name,
        status: "error",
        resultCount: 0,
        durationMs: Date.now() - startedAt,
        error: message,
      });
    }
  }
  if (completedEngine) return [];
  throw new Error(`内置浏览器检索失败：${failures.join("；")}`);
}
