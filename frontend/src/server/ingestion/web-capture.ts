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

import {
  UrlBlockedError,
  assertUrlAllowed,
  collectRedirectChainUrls,
} from "./url-guard";

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
  /** [T-239c] 中断信号(additive):用户停止本轮对话 → 关无头浏览器提前退出,抛 AbortError
   *  (name='AbortError',与 retry-policy 的「aborted 不可重试」分类对齐,不会被误判成
   *  「页面打不开」去转述/重试)。 */
  signal?: AbortSignal;
}

/** [T-239c] 中断错误(name='AbortError'):Playwright 的 goto/screenshot 不吃 AbortSignal,
 *  这里用「abort 监听 → 关 context」让挂起的导航立刻 reject,再统一改抛本错误。 */
export function makeAbortError(what: string): Error {
  const err = new Error(`已中断:用户停止了本轮对话,${what}已取消。`);
  err.name = "AbortError";
  return err;
}

/** 截图失败 —— 逐类诚实(导航打不开 / HTTP 错误码 / 登录墙·验证码)。工具 execute 接住原样
 *  转述给模型(honestyBlock #5)。区别于「成功但空图」——本类是根本没截成。
 *  [T-390] status:HTTP 错误码分类时携带结构化状态码(403/500 等),供上层多路回退判定
 *  (登录态重试 / 搜索引擎找替代来源),不再靠解析 message 文本;非 HTTP 类失败为 null。 */
export class WebCaptureError extends Error {
  readonly status: number | null;
  constructor(message: string, opts?: { status?: number }) {
    super(message);
    this.name = "WebCaptureError";
    this.status = opts?.status ?? null;
  }
}

/** [T-390] 是否「被站点拒之门外」的 HTTP 失败(403 反爬拒绝 / 5xx 服务端错)——多路回退的
 *  触发判定:material.screenshot 用它决定是否带登录态(web-session 池)重试;web.read 用
 *  更宽的 status≥400(404 已下架同样值得搜替代来源)。纯函数,导出供单测。 */
export function isBlockedHttpCaptureError(err: unknown): boolean {
  return (
    err instanceof WebCaptureError &&
    err.status !== null &&
    (err.status === 403 || err.status >= 500)
  );
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
  /** [T-326·RT-H04] 真实 Playwright Response 有 request()(供重定向链复检);fake 可缺省。 */
  request?(): unknown;
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
  /** [T-326·RT-H04] SSRF 守卫(默认真 assertUrlAllowed:协议白名单 + 私网/回环/链路本地/
   *  云元数据阻断 + DNS 解析复核);单测可注 fake lookup 的守卫,不打真 DNS。 */
  guardUrl?: (url: string) => Promise<void>;
}

/** UrlBlockedError → WebCaptureError(保持三墙错误分类通路;message 已是人话原样带过)。 */
function toCaptureError(err: unknown): Error {
  if (err instanceof UrlBlockedError) return new WebCaptureError(err.message);
  return err instanceof Error ? err : new Error(String(err));
}

// 自起干净无头 Chromium(不带 .auth/ 登录态 —— 只做公开页)。反自动化标记 + 跳系统代理
// (对齐 douyin-cdp openContext 的成熟做法),桌面 UA/视口在 newContext 层设。
// [T-126b] 导出复用:浏览器搜索适配器(search-browser.ts)复用同一套干净无头 context 起法。
export async function realOpenContext(): Promise<CaptureCapableContext> {
  const { chromium } = await import("@playwright/test");
  const { launchWithBrowser } = await import("./douyin-cdp");
  const { guardedLaunch, chromiumSandboxOpts } = await import("./chromium-guard");
  // [T-307] 统一浏览器选择(优先系统 Chrome → 回落打包全量 chromium):原来裸 chromium.launch
  //   在打包版 headless 下找 chrome-headless-shell(没打)→ 截图崩,同 T-299 漏网点。
  // [T-369] guardedLaunch(无持久 profile → 传 null,只做超时+人话报错包装,不做锁预检)。
  const browser = await guardedLaunch(
    null,
    () =>
      launchWithBrowser((sel) =>
        chromium.launch({
          headless: true,
          ...sel,
          ...chromiumSandboxOpts(), // [T-369] 去掉 Playwright 默认 --no-sandbox
          args: [
            "--disable-blink-features=AutomationControlled",
            "--no-proxy-server",
          ],
        }),
      ),
    { label: "截图浏览器" },
  );
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
  // [T-221] ChatGPT 分享页登出态的登录门 CTA(用户实测:未登录读 share 链接读出「Log in to get
  //   answers」当正文)。用 ChatGPT 特有短语精确命中(避免误伤含 "log in" 的普通页脚),让 web.read
  //   返 needLogin(去保管库登录)而非把登录引导页当正文落素材。
  "log in to get answers",
  "log in to get smarter responses",
];

// [T-311] 只保留**可见文本**再匹配登录墙关键词:剥掉 <script>/<style>/<noscript>/注释/标签。
//   否则裸子串会撞进内联 JS/JSON——GitHub 登录后首页把 feature-flag 名 `octocaptcha_origin_optimization`
//   写在内联脚本里,让 "captcha" 误命中 → 明明登录了却报"需要登录"(用户实测:ChatGPT 能读、GitHub 不行,
//   正因 GitHub 页含 octocaptcha 而 ChatGPT 不含)。真验证码页的可见文案(验证码 / verify you are human)照样命中。
function visibleText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ");
}

export function detectLoginWall(finalUrl: string, html: string): boolean {
  const url = finalUrl.toLowerCase();
  if (LOGIN_URL_HINTS.some((h) => url.includes(h))) return true;
  const body = visibleText(html).toLowerCase();
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
  // [T-326·RT-H04] SSRF 前置守卫:私网/回环/链路本地/云元数据地址在**起浏览器之前**就拒
  // (协议白名单 + IP 字面量直接判 + 域名 DNS 解析逐地址判;DNS 解析失败放行,goto 会诚实失败)。
  const guardUrl = deps.guardUrl ?? assertUrlAllowed;
  try {
    await guardUrl(target);
  } catch (err) {
    throw toCaptureError(err);
  }
  // [T-239c] 入口即断:已中断的信号不再起浏览器(省一次 launch)。
  const signal = opts.signal;
  if (signal?.aborted) throw makeAbortError("截图");
  const openContext = deps.openContext ?? realOpenContext;
  const ctx = await openContext();
  // [T-239c] abort → 关 context:Playwright goto/screenshot 不吃 AbortSignal,关掉浏览器让
  // 挂起操作立刻 reject(下方各 catch 先查 signal.aborted,改抛 AbortError 不误报「打不开」)。
  const onAbort = () => {
    void ctx.close().catch(() => {});
  };
  signal?.addEventListener("abort", onAbort, { once: true });
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
      if (signal?.aborted) throw makeAbortError("截图");
      throw new WebCaptureError(
        `页面打不开:${err instanceof Error ? err.message : String(err)}`,
      );
    }
    if (signal?.aborted) throw makeAbortError("截图");
    // HTTP 4xx/5xx → 带状态码诚实报错(有 response 才判;about:blank 等无 response 不判)。
    const status = resp ? resp.status() : 0;
    if (status >= 400) {
      throw new WebCaptureError(
        `页面返回 HTTP ${status}:该链接不可访问(可能已下架或需要权限)`,
        { status },
      );
    }
    const finalUrl = (resp ? resp.url() : "") || page.url();
    // [T-326·RT-H04] 重定向逐跳复检(事后链审计,选型见 url-guard 文件头):goto 已跟随的每一跳
    // + 最终 URL 逐个重过守卫 —— 命中私网/元数据即抛错,内容绝不返回。残留:命中跳的 HTTP 请求
    // 本身已被浏览器发出(无法事前拦,Playwright route 不触发于 redirect 跳)。
    {
      const checked = new Set<string>([target]);
      for (const hop of [...collectRedirectChainUrls(resp), finalUrl]) {
        if (!hop || checked.has(hop)) continue;
        checked.add(hop);
        try {
          await guardUrl(hop);
        } catch (err) {
          throw toCaptureError(err);
        }
      }
    }
    // 登录墙 / 验证码启发式:命中 → 诚实报错,不产垃圾图。
    const html = await page.content().catch(() => "");
    if (detectLoginWall(finalUrl, html)) {
      throw new WebCaptureError(
        "该页面需要登录 / 有反爬验证,当前只支持公开页面 —— 换一个公开可访问的链接再试。",
      );
    }
    const title = (await page.title().catch(() => "")).trim();
    let bytes: Uint8Array;
    try {
      bytes = await page.screenshot({
        type: "png",
        fullPage: opts.fullPage === true,
      });
    } catch (err) {
      // [T-239c] 中断关 context 会让 screenshot reject —— 如实抛 AbortError,不误报渲染失败。
      if (signal?.aborted) throw makeAbortError("截图");
      throw err;
    }
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
    signal?.removeEventListener("abort", onAbort);
    await ctx.close().catch(() => {}); // 关我们自起的 Chromium(独立无头,非用户浏览器)
  }
}
