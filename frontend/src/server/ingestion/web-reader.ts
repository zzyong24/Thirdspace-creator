import "server-only";

// [T-217b] Web Reader —— 带登录态读**正文全文**(取代 headless 截公开页首屏图的默认路径)。
//
// 与 web-capture.captureUrl 平级、复用其**三墙错误分类**(打不开 / HTTP 码 / 登录墙),但两点不同:
//   ① 启动方式:launchPersistentContext(webAuthDirFor(domain))(带 `.auth/web/` 登录态),
//      而非 web-capture 的干净无头 chromium.launch —— 于是能读「你登录后才看得到」的页;
//   ② 输出:抽**可读正文纯文本**(而非截图字节)。
//
// 抽取策略(SPEC §2.2,用户拍板:通用兜底 + ChatGPT 定制先落,其余站点按实际链接增量加):
//   · ChatGPT share 定制 extractor:chatgpt.com/share/* 是 React SPA,先试 __NEXT_DATA__ SSR
//     JSON 逐轮对话,回落 DOM `[data-message-author-role]`;
//   · 通用兜底:Mozilla Readability(去导航/广告/侧栏,抽文章正文)→ 纯文本。
//
// 分层(与 douyin-cdp / web-capture 一致):抽取函数(extractChatGptShare / extractReadable)是
// **纯函数**(HTML 字符串进、文本出),可确定性单测;readUrl 经 openContext 端口注入(默认真
// launchPersistentContext;单测注 fake page/context 返回 fixture HTML),不起真浏览器。

import { WebCaptureError, detectLoginWall } from "./web-capture";
import { webDomainFromUrl } from "./web-session";

/** 无有效会话 / 会话过期 —— 结构化降级信号(不截登录页糊弄)。携带 domain 供编导引导用户
 *  「去保管库登录一次」。是 WebCaptureError 的子类,复用三墙分类的 catch 通路。 */
export class WebReaderLoginRequiredError extends WebCaptureError {
  readonly domain: string;
  constructor(domain: string) {
    super(
      `「${domain}」需要先登录才能读到正文。请去设置 → 网站登录保管库登录一次,登好我再读。`,
    );
    this.name = "WebReaderLoginRequiredError";
    this.domain = domain;
  }
}

export interface ReadResult {
  /** 正文纯文本(已去导航/广告;ChatGPT 逐轮对话则含 user/assistant 每轮全文)。 */
  text: string;
  /** 页面标题(素材命名用)。 */
  title: string;
  /** 跟随重定向后的最终 URL。 */
  finalUrl: string;
  /** 命中的抽取器(chatgpt-share | readability),存证/可观测用。 */
  extractor: "chatgpt-share" | "readability";
}

const NAV_TIMEOUT_MS = 30_000; // SPA 正文渲染比截图慢,给 30s

// readUrl 只依赖 page/context 的这几个能力(收窄便于 fake page 单测)。真实 Playwright
// Page/BrowserContext 结构上满足(默认注入时向上转型目标)。
interface ReaderNavResponse {
  status(): number;
  url(): string;
}
export interface ReaderCapablePage {
  goto(
    url: string,
    opts?: { waitUntil?: string; timeout?: number },
  ): Promise<ReaderNavResponse | null>;
  url(): string;
  title(): Promise<string>;
  content(): Promise<string>;
  waitForTimeout(ms: number): Promise<void>;
  /** 等正文容器渲染(SPA);拿不到 selector 不抛(catch 成 noop),继续用当前 DOM 兜底。 */
  waitForSelector(
    selector: string,
    opts?: { timeout?: number },
  ): Promise<unknown>;
  /** 页内求值:滚动到底触发懒加载 + 读文档高度(注入 fake 时可 noop)。 */
  evaluate<R>(fn: () => R): Promise<R>;
}
export interface ReaderCapableContext {
  pages(): ReaderCapablePage[];
  newPage(): Promise<ReaderCapablePage>;
  close(): Promise<void>;
}

/** readUrl 的可注入依赖(默认真 launchPersistentContext(webAuthDirFor(domain));单测注 fake ctx)。 */
export interface ReadUrlDeps {
  openContext?: (authDir: string) => Promise<ReaderCapableContext>;
}

async function realOpenReaderContext(
  authDir: string,
): Promise<ReaderCapableContext> {
  const { chromium } = await import("@playwright/test");
  const { mkdir, rm } = await import("node:fs/promises");
  const { join } = await import("node:path");
  await mkdir(authDir, { recursive: true }).catch(() => {});
  for (const f of ["SingletonLock", "SingletonCookie", "SingletonSocket"]) {
    await rm(join(authDir, f), { force: true }).catch(() => {});
  }
  // 有头/无头:读取用 headless(不弹窗,复用 .auth/web 登录态);与 web-session.loginWeb 分工。
  const ctx = await chromium.launchPersistentContext(authDir, {
    headless: true,
    viewport: { width: 1440, height: 900 },
    args: ["--disable-blink-features=AutomationControlled"],
  });
  return ctx as unknown as ReaderCapableContext;
}

// ── ChatGPT share 定制 extractor(纯函数,可单测)────────────────────────────
/**
 * 从 chatgpt.com/share/* 的 HTML 抽逐轮对话全文。先试 __NEXT_DATA__ 里的 SSR JSON
 * (linear_conversation / mapping),回落 DOM `[data-message-author-role]`。抽不到 → null。
 */
export function extractChatGptShare(html: string): string | null {
  const fromNext = extractFromNextData(html);
  if (fromNext && fromNext.trim()) return fromNext;
  const fromDom = extractFromAuthorRoleDom(html);
  if (fromDom && fromDom.trim()) return fromDom;
  return null;
}

function extractFromNextData(html: string): string | null {
  const m = html.match(
    /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i,
  );
  if (!m) return null;
  let data: unknown;
  try {
    data = JSON.parse(m[1]);
  } catch {
    return null;
  }
  // 深搜任意 messages 数组:每条 message 形如 { author:{role}, content:{parts:[...]} }。
  const turns: string[] = [];
  const seen = new Set<unknown>();
  const walk = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    if (seen.has(node)) return;
    seen.add(node);
    const rec = node as Record<string, unknown>;
    const author = rec.author as { role?: string } | undefined;
    const content = rec.content as { parts?: unknown[] } | undefined;
    if (author && typeof author.role === "string" && content && Array.isArray(content.parts)) {
      const body = content.parts
        .filter((p): p is string => typeof p === "string")
        .join("\n")
        .trim();
      if (body) turns.push(`${roleLabel(author.role)}:\n${body}`);
    }
    for (const v of Object.values(rec)) {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") walk(v);
    }
  };
  walk(data);
  return turns.length ? turns.join("\n\n") : null;
}

function extractFromAuthorRoleDom(html: string): string | null {
  const turns: string[] = [];
  const re = /data-message-author-role="(user|assistant|system)"[^>]*>([\s\S]*?)(?=data-message-author-role=|$)/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const role = match[1];
    const text = stripHtml(match[2]).trim();
    if (text) turns.push(`${roleLabel(role)}:\n${text}`);
  }
  return turns.length ? turns.join("\n\n") : null;
}

function roleLabel(role: string): string {
  if (role === "user") return "用户";
  if (role === "assistant") return "ChatGPT";
  return role;
}

function stripHtml(fragment: string): string {
  return fragment
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

// ── 通用 Readability(jsdom + @mozilla/readability,Node 侧执行;dynamic import 不进顶层 bundle)──
/**
 * 通用正文抽取:jsdom 解析 HTML → Mozilla Readability → { title, text }。抽不到(极短页/纯
 * 交互页)→ null。**Node 侧执行**(不往 page 里注脚本):readUrl 拿 page.content() 的 HTML 字符串
 * 后调它,故可脱离浏览器单测(传 fixture HTML)。
 */
export async function extractReadable(
  html: string,
  url: string,
): Promise<{ title: string; text: string } | null> {
  const { JSDOM } = await import("jsdom");
  const { Readability } = await import("@mozilla/readability");
  const dom = new JSDOM(html, { url });
  const parsed = new Readability(dom.window.document).parse();
  if (!parsed) return null;
  const text = (parsed.textContent ?? "").replace(/\n{3,}/g, "\n\n").trim();
  if (!text) return null;
  return { title: (parsed.title ?? "").trim(), text };
}

/**
 * [T-217b] 带登录态读一个 URL 的正文全文。launchPersistentContext(authDir) → goto(复用
 * web-capture 三墙分类:打不开 / HTTP 码 / 登录墙)→ 等 SPA 正文渲染 + 滚动懒加载 → 抽正文
 * (ChatGPT share 定制 → 通用 Readability 兜底)。无会话/过期(登录墙命中)→ 抛
 * WebReaderLoginRequiredError(结构化降级,不截登录页)。openContext 端口注入,故错误分类 +
 * 抽取器选择可单测。
 */
export async function readUrl(
  url: string,
  opts: { authDir: string },
  deps: ReadUrlDeps = {},
): Promise<ReadResult> {
  const target = url.trim();
  if (!/^https?:\/\//i.test(target)) {
    throw new WebCaptureError(
      `页面打不开:只支持 http/https 链接(收到「${target.slice(0, 80)}」)`,
    );
  }
  const domain = webDomainFromUrl(target);
  const openContext = deps.openContext ?? realOpenReaderContext;
  const ctx = await openContext(opts.authDir);
  try {
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    let resp: ReaderNavResponse | null;
    try {
      resp = await page.goto(target, {
        waitUntil: "domcontentloaded",
        timeout: NAV_TIMEOUT_MS,
      });
    } catch (err) {
      throw new WebCaptureError(
        `页面打不开:${err instanceof Error ? err.message : String(err)}`,
      );
    }
    const status = resp ? resp.status() : 0;
    if (status >= 400) {
      throw new WebCaptureError(
        `页面返回 HTTP ${status}:该链接不可访问(可能已下架或需要权限)`,
      );
    }
    const finalUrl = (resp ? resp.url() : "") || page.url();
    // 等 SPA 正文渲染 + 滚动到底触发懒加载/长对话全量(拿不到 selector/滚动失败都不抛,兜底用当前 DOM)。
    await page.waitForSelector("main, article, [data-message-author-role]", { timeout: 8_000 }).catch(() => {});
    await page
      .evaluate(() => {
        // 滚到底几次,触发懒加载(ChatGPT 长对话按需渲染)。
        return new Promise<void>((resolve) => {
          let n = 0;
          const timer = setInterval(() => {
            window.scrollTo(0, document.body.scrollHeight);
            if (++n >= 6) {
              clearInterval(timer);
              resolve();
            }
          }, 300);
        });
      })
      .catch(() => {});
    await page.waitForTimeout(500);
    const html = await page.content().catch(() => "");
    // 登录墙 / 验证码启发式命中 → 结构化降级(有 .auth 登录态仍撞墙 = 会话过期/未登录该站)。
    if (detectLoginWall(finalUrl, html)) {
      throw new WebReaderLoginRequiredError(domain);
    }
    const title = (await page.title().catch(() => "")).trim();

    // ChatGPT share 定制优先。
    if (domain === "chatgpt.com" || domain.endsWith(".chatgpt.com")) {
      const convo = extractChatGptShare(html);
      if (convo) {
        return { text: convo, title: title || finalUrl, finalUrl, extractor: "chatgpt-share" };
      }
    }
    // 通用 Readability 兜底。
    const readable = await extractReadable(html, finalUrl).catch(() => null);
    if (readable && readable.text) {
      return {
        text: readable.text,
        title: (readable.title || title || finalUrl).trim(),
        finalUrl,
        extractor: "readability",
      };
    }
    throw new WebCaptureError(
      "读到页面但抽不出正文(可能是纯交互页/空页)——换一个有正文内容的链接,或用截图存网页样子。",
    );
  } finally {
    await ctx.close().catch(() => {});
  }
}
