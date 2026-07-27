/**
 * 从普通网页里发现站点公开提供的 RSS/Atom 地址。
 *
 * 这里只接受同源 http(s) 地址，避免网页通过 <link> 把服务端读取引向第三方目标。
 * EdgeOne 的人机挑战页不会暴露正文，但不少内容站仍保留同源 /feed.xml；识别到
 * 明确的 EO_Bot_Ssid 挑战标记时，仅尝试这一个约定地址，失败后仍由上层诚实报错。
 */
export function discoverSameOriginFeedUrl(
  html: string,
  pageUrl: string,
): string | null {
  let base: URL;
  try {
    base = new URL(pageUrl);
  } catch {
    return null;
  }
  if (base.protocol !== "https:" && base.protocol !== "http:") return null;

  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const attrs = parseLinkAttributes(tag);
    const rel = (attrs.rel ?? "").toLowerCase().split(/\s+/);
    const type = (attrs.type ?? "").toLowerCase();
    const href = attrs.href;
    if (
      !href ||
      !rel.includes("alternate") ||
      !/(?:application|text)\/(?:rss|atom)\+xml/.test(type)
    ) {
      continue;
    }
    const candidate = safeSameOriginUrl(href, base);
    if (candidate) return candidate;
  }

  if (/\bEO_Bot_Ssid\b/.test(html)) {
    return new URL("/feed.xml", base.origin).toString();
  }
  return null;
}

export function isSyndicationFeed(text: string): boolean {
  return /<(?:rss|feed)\b/i.test(text);
}

function parseLinkAttributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const pattern =
    /\b([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(tag)) !== null) {
    attrs[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? "";
  }
  return attrs;
}

function safeSameOriginUrl(value: string, base: URL): string | null {
  try {
    const candidate = new URL(value, base);
    if (
      (candidate.protocol !== "https:" && candidate.protocol !== "http:") ||
      candidate.origin !== base.origin
    ) {
      return null;
    }
    return candidate.toString();
  } catch {
    return null;
  }
}
