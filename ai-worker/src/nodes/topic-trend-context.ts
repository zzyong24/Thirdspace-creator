export interface TrendHit {
  title: string;
  snippet?: string;
}
export interface TrendSourceSignal {
  title: string;
  url: string | null;
  heat: number | null;
  publishedAt: string | null;
  sourceName: string;
}
export function buildTrendQuery(positioningBrief: string): string {
  const seed = (positioningBrief ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  return seed ? `${seed} 最新热点 趋势` : "内容创作 最新热点 趋势";
}

/** [T-182c] 把联网检索到的热点结果拼成 trend 出题依据 brief(空数组 → 空串,诚实降级)。 */
export function formatTrendBrief(hits: ReadonlyArray<TrendHit>): string {
  const lines = hits
    .map((h) => {
      const title = (h.title ?? "").trim();
      if (!title) return "";
      const snip = (h.snippet ?? "").trim();
      return snip ? `${title} —— ${snip}` : title;
    })
    .filter((s) => s !== "")
    .map((s, i) => `${i + 1}. ${s}`);
  return lines.length > 0
    ? ["【当前热点(联网检索)】", ...lines].join("\n")
    : "";
}

export function formatTrendSourceBrief(
  signals: ReadonlyArray<TrendSourceSignal>,
): string {
  const lines = signals
    .map((s) => {
      const title = (s.title ?? "").trim();
      if (!title) return "";
      const parts = [title];
      if (s.heat != null) parts.push(`热度 ${s.heat}`);
      if (s.publishedAt) parts.push(`发布 ${s.publishedAt}`);
      if (s.url) parts.push(s.url);
      return `${parts.join(" —— ")}(来源:${s.sourceName})`;
    })
    .filter((s) => s !== "")
    .map((s, i) => `${i + 1}. ${s}`);
  return lines.length > 0 ? ["【已登记信源信号】", ...lines].join("\n") : "";
}
