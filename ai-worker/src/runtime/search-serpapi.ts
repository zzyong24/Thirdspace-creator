// SerpApi 适配器(SPEC 2026-07-03 §1.1 T-084a)—— 实现 SearchProviderAdapter,直连 SerpApi
// 官方 REST(serpapi.com)。SerpApi 是 Google/Bing 等搜索引擎的结构化代理(默认 engine=google)。
//
// ── 诚实边界(SPEC §7)────────────────────────────────────────────────────────
// HTTP 结构按 SerpApi 官方文档(serpapi.com/search-api):
//   GET /search?engine=google&q=…&api_key=…&num=…(GET + query params,api_key 在 query)
//   resp: organic_results[] { title, link, snippet, source?, date? }
// 响应映射逻辑由 fake fetch 单测零成本覆盖。真产物验收留给用户配 key。
//
// 注:SerpApi 把 api_key 放 query string(非 header,官方约定)。这是官方 REST 形状,不是硬编码。

import {
  SearchExecutionError,
  type SearchProviderAdapter,
  type SearchResult,
  type SearchSpec,
  type SearchWebOptions,
} from "./search-factory";
import { fetchWithTimeout, safeText, toStr } from "./search-http";

const DEFAULT_BASE_URL = "https://serpapi.com";

function base(spec: SearchSpec): string {
  return (spec.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
}

/** SerpApi 响应形状(字段全 optional,防端点差异)。 */
interface SerpApiResponse {
  organic_results?: Array<{
    title?: string;
    link?: string;
    snippet?: string;
    source?: string;
    date?: string;
  }>;
  error?: string;
}

/** 从 url 提取域名当 siteName 兜底(SerpApi source 缺失时)。 */
function siteNameFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function createSerpapiAdapter(
  fetchImpl: typeof fetch = fetch,
): SearchProviderAdapter {
  return {
    async search(
      spec: SearchSpec,
      query: string,
      opts: Required<SearchWebOptions>,
    ): Promise<SearchResult[]> {
      // engine 走 spec.model(用户可配,默认 google);api_key 走 query(SerpApi 官方约定)。
      const engine = spec.model.trim() || "google";
      const params = new URLSearchParams({
        engine,
        q: query,
        api_key: spec.token,
        num: String(opts.count),
      });
      const res = await fetchWithTimeout(
        fetchImpl,
        `${base(spec)}/search?${params.toString()}`,
        { method: "GET" },
        opts.timeoutMs,
        "serpapi",
      );
      if (!res.ok) {
        throw new SearchExecutionError(
          `SerpApi search HTTP ${res.status}: ${await safeText(res)}`,
        );
      }
      const json = (await res.json()) as SerpApiResponse;
      if (json.error) {
        throw new SearchExecutionError(`SerpApi search 返回错误: ${json.error}`);
      }
      const rows = json.organic_results ?? [];
      return rows
        .map((r): SearchResult | null => {
          const url = toStr(r.link);
          if (!url) return null;
          const title = toStr(r.title);
          const date = toStr(r.date);
          const siteName = toStr(r.source) || siteNameFromUrl(url);
          return {
            title: title || url,
            url,
            snippet: toStr(r.snippet),
            ...(date ? { publishedAt: date } : {}),
            ...(siteName ? { siteName } : {}),
          };
        })
        .filter((x): x is SearchResult => x !== null)
        .slice(0, opts.count);
    },
  };
}
