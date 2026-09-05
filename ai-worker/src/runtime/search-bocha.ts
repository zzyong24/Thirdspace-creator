// 博查(Bocha)Web Search 适配器(SPEC 2026-07-03 §1.1 T-084a)—— 实现 SearchProviderAdapter,
// 直连博查官方 REST(api.bochaai.com)。中文内容检索优。
//
// ── 诚实边界(SPEC §7)────────────────────────────────────────────────────────
// 本环境无 web.search 真 key,无法零成本端到端验。HTTP 结构按博查官方公开文档
// (open.bochaai.com,Bing 兼容 envelope):
//   POST /v1/web-search,Bearer 鉴权,body{ query, count, freshness?, summary }
//   resp: data.webPages.value[] { name, url, snippet, summary, siteName, datePublished }
// 响应映射逻辑由 fake fetch 单测零成本覆盖(见 search-factory.test.ts)。真产物验收留给用户配 key。

import {
  SearchExecutionError,
  type SearchProviderAdapter,
  type SearchResult,
  type SearchSpec,
  type SearchWebOptions,
} from "./search-factory";
import { fetchWithTimeout, safeText, toStr } from "./search-http";

const DEFAULT_BASE_URL = "https://api.bochaai.com";

function base(spec: SearchSpec): string {
  return (spec.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
}

/** 博查响应形状(Bing 兼容 envelope,data 包 webPages)。字段全 optional,防端点差异。 */
interface BochaResponse {
  data?: {
    webPages?: {
      value?: Array<{
        name?: string;
        url?: string;
        snippet?: string;
        summary?: string;
        siteName?: string;
        datePublished?: string;
        dateLastCrawled?: string;
      }>;
    };
  };
  // 部分端点/版本可能不套 data(直接 webPages.value)—— 防御性兜底。
  webPages?: {
    value?: Array<{
      name?: string;
      url?: string;
      snippet?: string;
      summary?: string;
      siteName?: string;
      datePublished?: string;
      dateLastCrawled?: string;
    }>;
  };
}

export function createBochaAdapter(
  fetchImpl: typeof fetch = fetch,
): SearchProviderAdapter {
  return {
    async search(
      spec: SearchSpec,
      query: string,
      opts: Required<Pick<SearchWebOptions, "count" | "timeoutMs">> & Pick<SearchWebOptions, "signal">,
    ): Promise<SearchResult[]> {
      const res = await fetchWithTimeout(
        fetchImpl,
        `${base(spec)}/v1/web-search`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${spec.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query,
            count: opts.count,
            // summary=true 让博查回带 summary 字段(比 snippet 更完整),映射时优先用它。
            summary: true,
          }),
        },
        opts.timeoutMs,
        "bocha",
        opts.signal,
      );
      if (!res.ok) {
        throw new SearchExecutionError(
          `Bocha web-search HTTP ${res.status}: ${await safeText(res)}`,
        );
      }
      const json = (await res.json()) as BochaResponse;
      const rows = json.data?.webPages?.value ?? json.webPages?.value ?? [];
      return rows
        .map((r): SearchResult | null => {
          const url = toStr(r.url);
          const title = toStr(r.name);
          if (!url) return null; // URL 是一等公民,无 URL 的结果丢弃(诚实,不留空链)
          const snippet = toStr(r.summary) || toStr(r.snippet);
          const publishedAt = toStr(r.datePublished) || toStr(r.dateLastCrawled);
          const siteName = toStr(r.siteName);
          return {
            title: title || url,
            url,
            snippet,
            ...(publishedAt ? { publishedAt } : {}),
            ...(siteName ? { siteName } : {}),
          };
        })
        .filter((x): x is SearchResult => x !== null)
        .slice(0, opts.count);
    },
  };
}
