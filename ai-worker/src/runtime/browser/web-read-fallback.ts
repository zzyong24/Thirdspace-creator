// [T-390] web.read 被拒(HTTP 403/404/5xx)后的**搜索引擎替代来源回退**——素材搜集韧性:
// 媒体站(36氪等)对无头浏览器常回 403/500,原文拿不到时不当场认输,按序尝试多路搜索
// (已配 search provider → 必应(免 key 浏览器采集)→ 百度(同))用原 URL 当 query 找
// 「同一内容的替代来源」,把候选列表(标题/URL/摘要)交回编导挑一条再 web.read。
//
// 分层:本模块是**纯编排**(searchers 端口注入,不碰浏览器/网络)——回退顺序、失败跳过、
// 原 URL 过滤、条数上限都在这里,可确定性单测;真实 searcher 由组合根(persistence-client)
// 用 searchWeb 工厂 + browser 适配器组装。
//
// 诚实边界:所有 searcher 都失败/空 → 返回 [](上层如实告知「原文没拿到、替代来源也没找到」,
// 绝不编内容);搜到的替代来源只是「可能相关」,由编导判断后再读,不自动采信。

/** 一条替代来源候选(SearchResult 的最小投影;model 据此挑 URL 再调 web.read)。 */
export interface WebReadAlternate {
  title: string;
  url: string;
  snippet: string;
}

/** 一路搜索器:query 进、候选出;失败抛错(由编排层 catch 跳到下一路)。 */
export type AlternateSearcher = (
  query: string,
  count: number,
  signal?: AbortSignal,
) => Promise<WebReadAlternate[]>;

const DEFAULT_ALTERNATES_COUNT = 5;

/** URL 归一(比对用):去协议、去尾斜杠、小写 host——过滤「搜到的就是原 URL 自己」。 */
// SEMANTIC_BOUNDARY_ALLOW: 沿用来源 URL 去重，不判断内容相关性或替模型选择创作来源。
function normalizeForCompare(url: string): string {
  return url
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "")
    .toLowerCase();
}

/** 搜索 query:原 URL 去协议(搜索引擎对裸 URL 串命中更稳,常能带出该文标题与同题报道)。 */
export function alternatesQueryForUrl(url: string): string {
  return url.trim().replace(/^https?:\/\//i, "");
}

/**
 * 按序尝试 searchers,返回第一路非空的替代来源(过滤原 URL 自身、去重、截前 count 条)。
 * 单路失败(抛错)静默跳下一路;全部失败/空 → [](诚实空,不抛)。
 */
export async function findAlternatesViaSearch(
  originalUrl: string,
  searchers: AlternateSearcher[],
  opts?: { count?: number; signal?: AbortSignal },
): Promise<WebReadAlternate[]> {
  opts?.signal?.throwIfAborted();
  const count = opts?.count ?? DEFAULT_ALTERNATES_COUNT;
  const query = alternatesQueryForUrl(originalUrl);
  if (!query) return [];
  const original = normalizeForCompare(originalUrl);
  for (const search of searchers) {
    opts?.signal?.throwIfAborted();
    let results: WebReadAlternate[];
    try {
      results = await search(query, count, opts?.signal);
    } catch {
      opts?.signal?.throwIfAborted();
      continue; // 单路失败不拖垮:跳下一路(引擎反爬/未配 key 都可能)
    }
    opts?.signal?.throwIfAborted();
    const seen = new Set<string>();
    const filtered = results.filter((r) => {
      if (!r || typeof r.url !== "string" || !/^https?:\/\//i.test(r.url)) {
        return false;
      }
      const key = normalizeForCompare(r.url);
      if (key === original || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (filtered.length) return filtered.slice(0, count);
  }
  return [];
}
