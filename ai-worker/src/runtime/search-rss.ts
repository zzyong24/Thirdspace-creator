// RSS/Atom 联网检索适配器(T-126a)—— 实现 SearchProviderAdapter,**免 key**。与付费搜索 API
// (bocha/tavily/serpapi)并列的一层免费检索路径:用户在设置「联网搜索」把 provider 配成 `rss`、
// baseUrl 填一个或多个(逗号/换行分隔)RSS/Atom feed URL,即可**任意模型真联网**(不需搜索 API key)。
//
// ── 语义(SPEC 2026-07-05 联网搜索解耦 §B)──────────────────────────────────────
// RSS 不是搜索引擎,是话题订阅流。故本适配器把「search(query)」实现为:拉配置的 feed → 解析条目 →
// 按 query 关键词过滤(标题/摘要命中任一 token)→ 按发布时间倒序 → 取 top N。query 无命中 → 返 []
// (诚实:该 feed 没这个话题;上层 gather 空结果时降级 model_memory + 黄条,不假装)。用户配话题相关
// feed(如行业站 RSS)效果最好。
//
// ── 诚实边界 ────────────────────────────────────────────────────────────────
// 无 key、走公开 feed;解析用最小正则(RSS <item> / Atom <entry>),响应映射由 fake-fetch 单测零成本
// 覆盖。多 feed 逐个带超时拉,单个失败只丢该 feed(不整体崩);全失败/无 baseUrl → SearchExecutionError
// (上层 catch 成 model_memory 降级)。

import {
  SearchExecutionError,
  type SearchProviderAdapter,
  type SearchResult,
  type SearchSpec,
  type SearchWebOptions,
} from "./search-factory";
import { fetchWithTimeout, safeText, toStr } from "./search-http";

// 把 spec.baseUrl 拆成一组 feed URL(逗号/换行/空白分隔,去空)。
function feedUrls(spec: SearchSpec): string[] {
  return (spec.baseUrl ?? "")
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// 解 CDATA + 去 HTML 标签 + 常见实体解码 → 纯文本(条目字段防御性归一)。
function stripHtml(raw: string): string {
  return raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// 取一个条目块里第一个 <tag>...</tag> 的内文(大小写不敏感);无则 ""。
function firstTag(block: string, tag: string): string {
  const m = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i").exec(block);
  return m ? stripHtml(m[1] ?? "") : "";
}

// 取链接:RSS `<link>URL</link>`(内文)优先;Atom `<link href="URL"/>`(属性)兜底。
function linkOf(block: string): string {
  const inner = firstTag(block, "link");
  if (inner) return inner;
  const attr = /<link[^>]*href="([^"]+)"[^>]*>/i.exec(block);
  return attr ? stripHtml(attr[1] ?? "") : "";
}

// 把一段 RSS/Atom XML 解析成条目(title/url/snippet/publishedAt/siteName)。
// [T-235b] export:热点信源辅路(rss 型 trend_source)直接 fetch feed 后复用本解析,不重造。
export function parseFeed(xml: string, siteName: string): SearchResult[] {
  const blocks = xml.match(/<(item|entry)\b[\s\S]*?<\/(item|entry)>/gi) ?? [];
  const out: SearchResult[] = [];
  for (const block of blocks) {
    const url = linkOf(block);
    if (!url) continue; // URL 一等公民,无链接的条目丢弃
    const title = firstTag(block, "title");
    const snippet =
      firstTag(block, "description") ||
      firstTag(block, "summary") ||
      firstTag(block, "content");
    const publishedAt =
      firstTag(block, "pubDate") ||
      firstTag(block, "updated") ||
      firstTag(block, "published");
    out.push({
      title: title || url,
      url,
      snippet,
      ...(publishedAt ? { publishedAt } : {}),
      ...(siteName ? { siteName } : {}),
    });
  }
  return out;
}

// query → 归一 token(长度≥2,小写);中文按整串也算一个 token(方便包含匹配)。
function queryTokens(query: string): string[] {
  const lowered = query.toLowerCase();
  const parts = lowered.split(/[\s,、，。;；]+/).filter((t) => t.length >= 2);
  return parts.length > 0 ? parts : [lowered].filter((t) => t.length > 0);
}

// 条目是否命中 query(标题或摘要包含任一 token)。
function matchesQuery(item: SearchResult, tokens: string[]): boolean {
  const hay = `${item.title} ${item.snippet}`.toLowerCase();
  return tokens.some((t) => hay.includes(t));
}

// 发布时间字符串 → 可排序数值(解析失败排最后)。
function timeKey(publishedAt?: string): number {
  if (!publishedAt) return 0;
  const ts = Date.parse(publishedAt);
  return Number.isFinite(ts) ? ts : 0;
}

export function createRssAdapter(
  fetchImpl: typeof fetch = fetch,
): SearchProviderAdapter {
  return {
    async search(
      spec: SearchSpec,
      query: string,
      opts: Required<SearchWebOptions>,
    ): Promise<SearchResult[]> {
      const urls = feedUrls(spec);
      if (urls.length === 0) {
        throw new SearchExecutionError(
          "RSS 适配器需在设置「联网搜索」的 baseUrl 填一个或多个 RSS/Atom feed URL",
        );
      }

      // 多 feed 逐个带超时拉;单个失败只丢该 feed(记原因),不整体崩。
      const merged: SearchResult[] = [];
      const errors: string[] = [];
      await Promise.all(
        urls.map(async (url) => {
          try {
            const res = await fetchWithTimeout(
              fetchImpl,
              url,
              { method: "GET", headers: { Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*" } },
              opts.timeoutMs,
              "rss",
            );
            if (!res.ok) {
              errors.push(`${url} HTTP ${res.status}: ${await safeText(res)}`);
              return;
            }
            const xml = toStr(await res.text());
            let siteName = "";
            try {
              siteName = new URL(url).hostname;
            } catch {
              siteName = "";
            }
            merged.push(...parseFeed(xml, siteName));
          } catch (err) {
            errors.push(
              `${url}: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        }),
      );

      // 全部 feed 都失败(无一成功解析)→ 抛错让上层降级 model_memory(不静默返空假成功)。
      if (merged.length === 0 && errors.length === urls.length) {
        throw new SearchExecutionError(`RSS 检索全部失败:${errors.join(" | ")}`);
      }

      // 去重(同 url 保留其一)。
      const seen = new Set<string>();
      const deduped = merged.filter((r) => {
        if (seen.has(r.url)) return false;
        seen.add(r.url);
        return true;
      });

      // query token 过滤(命中标题/摘要);按发布时间倒序;取 top N。无命中 → [](诚实降级)。
      const tokens = queryTokens(query);
      return deduped
        .filter((r) => matchesQuery(r, tokens))
        .sort((a, b) => timeKey(b.publishedAt) - timeKey(a.publishedAt))
        .slice(0, opts.count);
    },
  };
}
