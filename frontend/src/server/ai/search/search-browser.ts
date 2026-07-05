import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";

// 浏览器搜索适配器(T-126b)—— 实现 ai-worker SearchProviderAdapter,**免 key + 自截图**。
// 对应用户诉求「之前通过 Chrome DevTools 让 Agent 操作浏览器」:provider="browser" 时,服务端真开
// 无头 Chromium 导航到搜索引擎(默认 Bing,可 baseUrl 换)→ 抓 SERP HTML → 纯函数解析结果 →
// SearchResult[];同时 page.screenshot() 落 .cache/ 存证(不可抵赖的检索证据)。任意模型都能真联网。
//
// ── 分层(对齐 web-capture.ts 可测范式)──────────────────────────────────────────
//   ① openContext 端口注入(默认真 realOpenContext 起干净无头 Chromium;单测注 fake page/context,
//      不起真浏览器)→ 导航/登录墙/HTTP 报错分类可确定性单测;
//   ② parseBingResults 是**纯函数**(SERP HTML → SearchResult[]),用 fixture HTML 零成本单测。
//
// ── 诚实边界 ──────────────────────────────────────────────────────────────────
// 搜索引擎 SERP 结构会变、有反爬,本适配器天生**较脆弱**(SPEC §9 R2 标 ★★):导航失败 / HTTP 4xx-5xx
// / 命中登录墙·验证码 / 解析不出结果 → 抛 SearchExecutionError,上层 catch 成 model_memory 诚实降级
// (不产垃圾素材、不假装联网)。真链路(真 Bing 抓取)留用户环境验;解析/降级逻辑单测锁。

import {
  SearchExecutionError,
  type SearchProviderAdapter,
  type SearchResult,
  type SearchSpec,
  type SearchWebOptions,
} from "@creatoros/ai-worker";
import {
  detectLoginWall,
  realOpenContext,
  type CaptureCapableContext,
} from "../../ingestion/web-capture";

// 默认搜索引擎:Bing(相对抓取容忍)。baseUrl 可换成含 {q} 占位的 URL 模板(如自建/其它引擎)。
const DEFAULT_ENGINE = "https://www.bing.com/search?q={q}";
const NAV_TIMEOUT_MS = 20000;

// 从 spec.baseUrl 模板(或默认)构造搜索 URL,{q}=编码后的 query。无 {q} 占位则追加在末尾。
export function buildSearchUrl(spec: SearchSpec, query: string): string {
  const tpl = (spec.baseUrl ?? "").trim() || DEFAULT_ENGINE;
  const enc = encodeURIComponent(query.trim());
  return tpl.includes("{q}") ? tpl.replace(/\{q\}/g, enc) : `${tpl}${enc}`;
}

// 解 CDATA/HTML 标签 + 常见实体 → 纯文本。
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

/**
 * 纯函数:Bing SERP HTML → SearchResult[]。Bing 自然结果结构:
 *   <li class="b_algo"> ... <h2><a href="URL">Title</a></h2> ... <p>snippet</p> ... </li>
 * 天生脆弱(Bing 改版即失效)→ 解析不出即返 [],上层降级 model_memory(诚实,不硬凑)。导出供单测。
 */
export function parseBingResults(html: string): SearchResult[] {
  const out: SearchResult[] = [];
  const blocks = html.match(/<li class="b_algo"[\s\S]*?<\/li>/gi) ?? [];
  for (const block of blocks) {
    const a = /<h2[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(
      block,
    );
    if (!a) continue;
    const url = stripHtml(a[1] ?? "");
    if (!/^https?:\/\//i.test(url)) continue; // URL 一等公民,非 http(s) 丢弃
    const title = stripHtml(a[2] ?? "");
    const p = /<p[^>]*>([\s\S]*?)<\/p>/i.exec(block);
    const snippet = p ? stripHtml(p[1] ?? "") : "";
    let siteName = "";
    try {
      siteName = new URL(url).hostname;
    } catch {
      siteName = "";
    }
    out.push({
      title: title || url,
      url,
      snippet,
      ...(siteName ? { siteName } : {}),
    });
  }
  return out;
}

// query → 文件名安全 slug(截断 40)。
function slugify(query: string): string {
  return (
    query
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "q"
  );
}

// 默认截图 sink:落 .cache/search-browser/<slug>.png(存证/调试用,不进库、不提交)。best-effort。
async function defaultSaveScreenshot(
  bytes: Uint8Array,
  slug: string,
): Promise<void> {
  const dir = path.join(process.cwd(), ".cache", "search-browser");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, `${slug}.png`), bytes);
}

/** 可注入依赖(默认真 realOpenContext + 落 .cache 截图;单测注 fake context/noop sink 不碰浏览器/fs)。 */
export interface BrowserScrapeDeps {
  openContext?: () => Promise<CaptureCapableContext>;
  saveScreenshot?: (bytes: Uint8Array, slug: string) => Promise<void>;
}

export function createBrowserScrapeAdapter(
  deps: BrowserScrapeDeps = {},
): SearchProviderAdapter {
  const openContext = deps.openContext ?? realOpenContext;
  const saveScreenshot = deps.saveScreenshot ?? defaultSaveScreenshot;
  return {
    async search(
      spec: SearchSpec,
      query: string,
      opts: Required<SearchWebOptions>,
    ): Promise<SearchResult[]> {
      const url = buildSearchUrl(spec, query);
      const ctx = await openContext();
      try {
        const page = await ctx.newPage();
        let resp;
        try {
          resp = await page.goto(url, {
            waitUntil: "networkidle",
            timeout: Math.max(opts.timeoutMs, NAV_TIMEOUT_MS),
          });
        } catch (err) {
          throw new SearchExecutionError(
            `browser 检索导航失败:${err instanceof Error ? err.message : String(err)}`,
          );
        }
        const status = resp ? resp.status() : 0;
        if (status >= 400) {
          throw new SearchExecutionError(
            `browser 检索返回 HTTP ${status}(搜索页不可访问)`,
          );
        }
        const finalUrl = (resp ? resp.url() : "") || page.url();
        const html = await page.content().catch(() => "");
        if (detectLoginWall(finalUrl, html)) {
          throw new SearchExecutionError(
            "browser 检索命中登录墙 / 反爬验证 —— 换搜索引擎(baseUrl)或改用 rss provider。",
          );
        }
        // 自截图存证(best-effort;失败不阻断结果)。
        try {
          const bytes = await page.screenshot({ type: "png", fullPage: false });
          if (bytes && bytes.byteLength > 0) {
            await saveScreenshot(bytes, slugify(query));
          }
        } catch {
          /* 截图失败不阻断检索 */
        }
        return parseBingResults(html).slice(0, opts.count);
      } finally {
        await ctx.close().catch(() => {}); // 关我们自起的无头 Chromium(非用户浏览器)
      }
    },
  };
}
