// Tavily Search 适配器(SPEC 2026-07-03 §1.1 T-084a)—— 实现 SearchProviderAdapter,直连 Tavily
// 官方 REST(api.tavily.com)。面向英文/全球内容检索。
//
// ── 诚实边界(SPEC §7)────────────────────────────────────────────────────────
// HTTP 结构按 Tavily 官方文档(docs.tavily.com):
//   POST /search,Bearer 鉴权,body{ query, max_results, search_depth, topic }
//   resp: results[] { title, url, content, score, published_date? }
// 响应映射逻辑由 fake fetch 单测零成本覆盖。真产物验收留给用户配 key。

import {
  SearchExecutionError,
  type SearchProviderAdapter,
  type SearchResult,
  type SearchSpec,
  type SearchWebOptions,
} from "./search-factory";
import { fetchWithTimeout, safeText, toStr } from "./search-http";

const DEFAULT_BASE_URL = "https://api.tavily.com";

function base(spec: SearchSpec): string {
  return (spec.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
}

/** Tavily 响应形状(字段全 optional,防端点差异)。 */
interface TavilyResponse {
  results?: Array<{
    title?: string;
    url?: string;
    content?: string;
    score?: number;
    published_date?: string;
  }>;
}

/** 从 url 提取域名当 siteName(Tavily 不回站点名字段)。失败 → 空。 */
function siteNameFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function createTavilyAdapter(
  fetchImpl: typeof fetch = fetch,
): SearchProviderAdapter {
  return {
    async search(
      spec: SearchSpec,
      query: string,
      opts: Required<SearchWebOptions>,
    ): Promise<SearchResult[]> {
      const res = await fetchWithTimeout(
        fetchImpl,
        `${base(spec)}/search`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${spec.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query,
            max_results: opts.count,
            search_depth: "basic",
            topic: "general",
          }),
        },
        opts.timeoutMs,
        "tavily",
      );
      if (!res.ok) {
        throw new SearchExecutionError(
          `Tavily search HTTP ${res.status}: ${await safeText(res)}`,
        );
      }
      const json = (await res.json()) as TavilyResponse;
      const rows = json.results ?? [];
      return rows
        .map((r): SearchResult | null => {
          const url = toStr(r.url);
          if (!url) return null;
          const title = toStr(r.title);
          const publishedAt = toStr(r.published_date);
          const siteName = siteNameFromUrl(url);
          return {
            title: title || url,
            url,
            snippet: toStr(r.content),
            ...(publishedAt ? { publishedAt } : {}),
            ...(siteName ? { siteName } : {}),
          };
        })
        .filter((x): x is SearchResult => x !== null)
        .slice(0, opts.count);
    },
  };
}
