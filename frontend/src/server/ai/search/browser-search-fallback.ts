export interface BundledBrowserSearchHit {
  readonly title: string;
  readonly url: string;
  readonly snippet: string;
  readonly publishedAt?: string;
  readonly siteName?: string;
}

export interface BrowserSearchAttempt {
  readonly engine: "baidu" | "bing";
  readonly status: "ok" | "empty" | "error";
  readonly resultCount: number;
  readonly durationMs: number;
  readonly error?: string;
}

const ENGINES = [
  { name: "baidu" as const, baseUrl: "https://www.baidu.com/s?wd={q}" },
  { name: "bing" as const, baseUrl: null },
] as const;

/**
 * 内置浏览器检索：国内中文默认百度；失败或零结果时切 Bing。
 * 两路都是真浏览器结果，绝不补模型记忆。只有两路都抛错才抛聚合错误；
 * 正常执行但均为 0 条则诚实返回空数组。
 */
export async function searchBundledBrowserWithFallback(
  query: string,
  options: { count?: number } | undefined,
  runEngine: (
    baseUrl: string | null,
    query: string,
    options?: { count?: number },
  ) => Promise<readonly BundledBrowserSearchHit[]>,
  onAttempt?: (attempt: BrowserSearchAttempt) => void,
): Promise<BundledBrowserSearchHit[]> {
  const failures: string[] = [];
  let completedEngine = false;
  for (const engine of ENGINES) {
    const startedAt = Date.now();
    try {
      const rows = [...(await runEngine(engine.baseUrl, query, options))];
      completedEngine = true;
      onAttempt?.({
        engine: engine.name,
        status: rows.length > 0 ? "ok" : "empty",
        resultCount: rows.length,
        durationMs: Date.now() - startedAt,
      });
      if (rows.length > 0) return rows;
    } catch (error) {
      const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
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
