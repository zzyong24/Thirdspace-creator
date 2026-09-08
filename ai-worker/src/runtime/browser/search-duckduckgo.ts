import type { SearchResult } from "../search-factory";

/** 仅解码 HTML 字符引用与跳转协议，不判断来源可信度或内容相关性。 */
function decodeEntities(value: string): string {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", hellip: "…", ndash: "–", mdash: "—", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”" };
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (raw, entity: string) => {
    if (!entity.startsWith("#")) return named[entity] ?? raw;
    const code = entity[1]?.toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : "�";
  });
}
const text = (html: string) => decodeEntities(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
function attr(tag: string, name: string, decode = true): string | undefined {
  const match = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i").exec(tag);
  if (!match) return undefined;
  const value = match[1] ?? match[2] ?? "";
  return decode ? decodeEntities(value) : value;
}
const hasClass = (tag: string, name: string) => (attr(tag, "class") ?? "").split(/\s+/).includes(name);

// SEMANTIC_BOUNDARY_ALLOW: uddg 是 DuckDuckGo HTML 的落地 URL 传输字段，不做站点筛选。
export function resolveDuckDuckGoResultUrl(raw: string): string {
  try {
    if (!raw.trim()) return "";
    const url = new URL(decodeEntities(raw), "https://html.duckduckgo.com");
    if (!["http:", "https:"].includes(url.protocol)) return "";
    if ((url.hostname === "duckduckgo.com" || url.hostname.endsWith(".duckduckgo.com")) && url.pathname === "/l/") {
      const target = url.searchParams.get("uddg");
      if (!target) return "";
      const destination = new URL(target);
      return ["http:", "https:"].includes(destination.protocol) ? destination.href : "";
    }
    return url.href;
  } catch { return ""; }
}

/** 按独立 result 容器分块；缺字段不借下一条结果补齐。 */
export function parseDuckDuckGoResults(html: string): SearchResult[] {
  const blocks = [...html.matchAll(/<div\b[^>]*>/gi)].filter(match => hasClass(match[0], "result"));
  const results: SearchResult[] = [];
  for (const [index, opening] of blocks.entries()) {
    const block = html.slice(opening.index! + opening[0].length, blocks[index + 1]?.index ?? html.length);
    const anchors = [...block.matchAll(/(<a\b[^>]*>)([\s\S]*?)<\/a>/gi)];
    const titleAnchor = anchors.find(match => hasClass(match[1]!, "result__a"));
    if (!titleAnchor) continue;
    const url = resolveDuckDuckGoResultUrl(attr(titleAnchor[1]!, "href", false) ?? "");
    const title = text(titleAnchor[2]!);
    if (!url || !title) continue;
    const snippet = anchors.find(match => hasClass(match[1]!, "result__snippet"));
    results.push({ title, url, snippet: snippet ? text(snippet[2]!) : "", siteName: new URL(url).hostname });
  }
  return results;
}
