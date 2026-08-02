export type DiscoveryResearchMarket = "cn" | "global";
export type DiscoveryResearchLanguage = "zh-CN" | "any";

export interface DiscoveryResearchResult {
  title: string;
  url: string;
  snippet: string;
  publishedAt?: string;
  siteName?: string;
}

const DOMESTIC_DOMAINS = [
  "36kr.com",
  "baidu.com",
  "bilibili.com",
  "csdn.net",
  "douyin.com",
  "juejin.cn",
  "qq.com",
  "sina.com.cn",
  "sohu.com",
  "toutiao.com",
  "weixin.qq.com",
  "zhihu.com",
] as const;

const CJK_STOP_BIGRAMS = new Set([
  "中国",
  "大陆",
  "国内",
  "中文",
  "用户",
  "行业",
  "市场",
  "内容",
  "相关",
  "高频",
]);

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./u, "");
  } catch {
    return "";
  }
}

function isDomesticHost(host: string): boolean {
  return (
    host.endsWith(".cn") ||
    DOMESTIC_DOMAINS.some(
      (domain) => host === domain || host.endsWith(`.${domain}`),
    )
  );
}

function cjkCount(value: string): number {
  return value.match(/[\p{Script=Han}]/gu)?.length ?? 0;
}

function relevanceTerms(query: string): string[] {
  const normalized = query.normalize("NFKC").toLowerCase();
  const latin = normalized.match(/[a-z0-9][a-z0-9.+#-]{1,}/gu) ?? [];
  const cjkChunks = normalized.match(/[\p{Script=Han}]{2,}/gu) ?? [];
  const cjk = cjkChunks.flatMap((chunk) => {
    if (chunk.length <= 2) return [chunk];
    const terms: string[] = [];
    for (let size = 2; size <= Math.min(4, chunk.length); size += 1) {
      for (let index = 0; index <= chunk.length - size; index += 1) {
        const term = chunk.slice(index, index + size);
        if (size > 2 || !CJK_STOP_BIGRAMS.has(term)) terms.push(term);
      }
    }
    return terms;
  });
  return [...new Set([...latin, ...cjk])];
}

/**
 * 只在用户可见关键词后追加公开的地区/语言约束，不读取或拼接任何访谈答案。
 */
export function buildDiscoveryResearchQuery(
  query: string,
  scope: {
    market: DiscoveryResearchMarket;
    language: DiscoveryResearchLanguage;
  },
): string {
  const normalized = query.trim().replace(/\s+/gu, " ");
  const suffix: string[] = [];
  if (scope.market === "cn" && !/中国大陆/u.test(normalized)) {
    suffix.push("中国大陆");
  }
  if (scope.language === "zh-CN" && !/(?:中文|简体)/u.test(normalized)) {
    suffix.push("简体中文");
  }
  return [normalized, ...suffix].join(" ");
}

/**
 * 搜索 provider 只负责召回；定位前采在领域边界内再做相关性与中文市场筛选。
 * 宁可诚实返回空结果，也不把明显无关的英文境外页面塞进证据板。
 */
export function selectDiscoveryResearchResults(
  query: string,
  results: DiscoveryResearchResult[],
  scope: {
    market: DiscoveryResearchMarket;
    language: DiscoveryResearchLanguage;
  },
  limit: number,
): DiscoveryResearchResult[] {
  const terms = relevanceTerms(query);
  const seen = new Set<string>();
  return results
    .map((result, index) => {
      const text = `${result.title} ${result.snippet} ${result.siteName ?? ""}`
        .normalize("NFKC")
        .toLowerCase();
      const matched = terms.filter((term) => text.includes(term));
      const host = hostOf(result.url);
      const chineseChars = cjkCount(text);
      if (terms.length > 0 && matched.length === 0) return null;
      if (scope.language === "zh-CN" && chineseChars < 2) return null;
      const domestic = isDomesticHost(host);
      const score =
        matched.reduce((sum, term) => sum + Math.min(term.length, 4), 0) +
        (chineseChars >= 8 ? 4 : chineseChars >= 2 ? 2 : 0) +
        (scope.market === "cn" && domestic ? 4 : 0);
      return { result, score, index, url: result.url.trim() };
    })
    .filter(
      (
        row,
      ): row is {
        result: DiscoveryResearchResult;
        score: number;
        index: number;
        url: string;
      } => Boolean(row?.url),
    )
    .filter((row) => {
      if (seen.has(row.url)) return false;
      seen.add(row.url);
      return true;
    })
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((row) => row.result);
}
