import "server-only";

// 通用网页截图模块(T-084b,SPEC 2026-07-03 §2.1)—— 与 douyin-cdp 平级、同款依赖注入范式:
// 给一个**公开** URL,服务端真开无头 Chromium 导航 → 截图 PNG 字节 → 落素材中心
// (createGeneratedAsset)。截图 = 不可抵赖的真证据(区别于 material.gather 的模型记忆素材)。
//
// 分层(与 douyin-cdp 一致):
//   ① captureUrl —— openContext 端口注入(默认真 launch chromium;单测注 fake page/context,
//      不起真浏览器),故导航/截图/三类报错分类可确定性单测;
//   ② 只做公开页(干净无头 context,不带 .auth/ 登录态)——登录墙/验证码启发式命中即诚实报错,
//      不产垃圾图;登录墙页面截图归 SPEC §4 未来(接 .auth/ 按站点持久 profile,超出本期)。
//
// 错误逐类诚实(SPEC §2.1,不含糊):导航超时/DNS → 「页面打不开」;HTTP 4xx/5xx → 带状态码;
// 命中登录墙/验证码启发式 → 「需要登录/有反爬验证,当前只支持公开页面」。错误原样进对话工具
// 结果,模型如实转述(honestyBlock #5:做不到就直说)。

// captureUrl 结果:PNG 字节 + 内容类型 + 最终 URL(跟随重定向后)+ 页面标题(素材命名用)。
export interface CaptureResult {
  bytes: Uint8Array;
  contentType: string;
  finalUrl: string;
  title: string;
}

export interface CaptureUrlOptions {
  /** true = 全页截图;缺省/false = 视口截图(默认视口,SPEC §2.1)。 */
  fullPage?: boolean;
}

/** 截图失败 —— 逐类诚实(导航打不开 / HTTP 错误码 / 登录墙·验证码)。工具 execute 接住原样
 *  转述给模型(honestyBlock #5)。区别于「成功但空图」——本类是根本没截成。 */
export class WebCaptureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebCaptureError";
  }
}

// 桌面 UA(对齐 douyin-cdp 做法:桌面 UA 头 + 慢速导航节奏,尽量拿到公开页正常渲染)。
const DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/126.0.0.0 Safari/537.36";

const NAV_TIMEOUT_MS = 20000; // SPEC §2.1:goto timeout 20s

// captureUrl 只依赖 page/context 的这几个能力(收窄便于 fake page 单测,不起真 Chromium)。
// 真实 Playwright Page/BrowserContext 结构上满足(默认注入时向上转型目标)。
interface CaptureNavResponse {
  status(): number;
  url(): string;
}
export interface CaptureCapablePage {
  goto(
    url: string,
    opts?: { waitUntil?: string; timeout?: number },
  ): Promise<CaptureNavResponse | null>;
  url(): string;
  title(): Promise<string>;
  content(): Promise<string>;
  screenshot(opts?: { fullPage?: boolean; type?: "png" }): Promise<Uint8Array>;
}
export interface CaptureCapableContext {
  newPage(): Promise<CaptureCapablePage>;
  close(): Promise<void>;
}

/** captureUrl 的可注入依赖(默认真 openContext(干净无头 chromium);单测注 fake context)。 */
export interface CaptureUrlDeps {
  openContext?: () => Promise<CaptureCapableContext>;
}

// 自起干净无头 Chromium(不带 .auth/ 登录态 —— 只做公开页)。反自动化标记 + 跳系统代理
// (对齐 douyin-cdp openContext 的成熟做法),桌面 UA/视口在 newContext 层设。
// [T-126b] 导出复用:浏览器搜索适配器(search-browser.ts)复用同一套干净无头 context 起法。
export async function realOpenContext(): Promise<CaptureCapableContext> {
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-proxy-server",
    ],
  });
  const context = await browser.newContext({
    userAgent: DESKTOP_UA,
    viewport: { width: 1440, height: 900 },
  });
  // 收窄成 CaptureCapableContext:close 连带关掉 browser(避免泄漏进程)。
  return {
    newPage: () => context.newPage() as unknown as Promise<CaptureCapablePage>,
    close: async () => {
      await context.close().catch(() => {});
      await browser.close().catch(() => {});
    },
  };
}

// 登录墙 / 验证码启发式(SPEC §2.1):最终 URL 重定向到登录页,或页面 HTML 含验证码/登录墙
// 特征串。命中 → 诚实报错「需要登录/有反爬验证」,不产垃圾图。保守匹配(宁可漏报也别把正常
// 公开页误判 —— 误判只是少截一张,不是造假)。导出供单测。
const LOGIN_URL_HINTS = [
  "/login",
  "/signin",
  "/sign-in",
  "/auth/login",
  "accounts.google.com",
  "passport.",
];
const WALL_CONTENT_HINTS = [
  "请先登录",
  "登录后查看",
  "扫码登录",
  "captcha",
  "验证码",
  "人机验证",
  "安全验证",
  "unusual traffic",
  "verify you are human",
];

export function detectLoginWall(finalUrl: string, html: string): boolean {
  const url = finalUrl.toLowerCase();
  if (LOGIN_URL_HINTS.some((h) => url.includes(h))) return true;
  const body = html.toLowerCase();
  return WALL_CONTENT_HINTS.some((h) => body.includes(h.toLowerCase()));
}

/**
 * 给一个**公开** URL 真开无头 Chromium 截图 → PNG 字节(视口或全页)+ 最终 URL + 标题。
 * openContext 端口注入(默认真 chromium.launch),故导航/HTTP/登录墙三类报错分类可单测。
 *
 * 逐类诚实报错(SPEC §2.1):
 *   - goto reject(导航超时 / DNS 失败 / net error）→ WebCaptureError「页面打不开:<原因>」;
 *   - HTTP 4xx/5xx（response.status ≥ 400）→ WebCaptureError「页面返回 HTTP <code>」;
 *   - 登录墙/验证码启发式命中 → WebCaptureError「需要登录/有反爬验证,当前只支持公开页面」。
 */
export async function captureUrl(
  url: string,
  opts: CaptureUrlOptions = {},
  deps: CaptureUrlDeps = {},
): Promise<CaptureResult> {
  const target = url.trim();
  if (!/^https?:\/\//i.test(target)) {
    throw new WebCaptureError(
      `页面打不开:只支持 http/https 链接(收到「${target.slice(0, 80)}」)`,
    );
  }
  const openContext = deps.openContext ?? realOpenContext;
  const ctx = await openContext();
  try {
    const page = await ctx.newPage();
    // 导航:networkidle + 20s 超时。导航失败(超时/DNS/net error)→ 「页面打不开」。
    let resp: CaptureNavResponse | null;
    try {
      resp = await page.goto(target, {
        waitUntil: "networkidle",
        timeout: NAV_TIMEOUT_MS,
      });
    } catch (err) {
      throw new WebCaptureError(
        `页面打不开:${err instanceof Error ? err.message : String(err)}`,
      );
    }
    // HTTP 4xx/5xx → 带状态码诚实报错(有 response 才判;about:blank 等无 response 不判)。
    const status = resp ? resp.status() : 0;
    if (status >= 400) {
      throw new WebCaptureError(
        `页面返回 HTTP ${status}:该链接不可访问(可能已下架或需要权限)`,
      );
    }
    const finalUrl = (resp ? resp.url() : "") || page.url();
    // 登录墙 / 验证码启发式:命中 → 诚实报错,不产垃圾图。
    const html = await page.content().catch(() => "");
    if (detectLoginWall(finalUrl, html)) {
      throw new WebCaptureError(
        "该页面需要登录 / 有反爬验证,当前只支持公开页面 —— 换一个公开可访问的链接再试。",
      );
    }
    const title = (await page.title().catch(() => "")).trim();
    const bytes = await page.screenshot({
      type: "png",
      fullPage: opts.fullPage === true,
    });
    if (!bytes || bytes.byteLength === 0) {
      throw new WebCaptureError("截图失败:页面渲染为空(可能是纯白页或加载被拦)。");
    }
    return {
      bytes,
      contentType: "image/png",
      finalUrl,
      title: title || finalUrl,
    };
  } finally {
    await ctx.close().catch(() => {}); // 关我们自起的 Chromium(独立无头,非用户浏览器)
  }
}
