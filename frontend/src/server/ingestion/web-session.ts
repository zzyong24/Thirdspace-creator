import "server-only";

// [T-217a] Web Session Vault(登录态保管库)—— 把抖音采集已有的「launchPersistentContext +
// .auth/ 持久 profile + 被动探针」(douyin-cdp.ts)**泛化成任意域名**的登录态保管库。
//
// 与 douyin-cdp 完全同款分层/依赖注入范式:
//   ① openWebContext —— 自起独立 Chromium + 按目录持久 profile(`.auth/web/<domain>/`),
//      不连用户日常 Chrome(connectOverCDP 对用户 Chrome149 卡死,记忆「douyin-collection-approach」);
//   ② loginWeb(有头)—— 弹窗让用户**自己**完成登录(账密/扫码/SSO 都行,系统不碰凭据),
//      轮询「该域出现会话 cookie」判成功(泛化 douyin-cdp:830 的 sessionid 轮询;不硬编码单一
//      cookie 名 —— 不同站会话 cookie 名不同,用一组启发式 hint 匹配);
//   ③ checkWebSessionStatus(headless 不弹窗)—— 快查 `.auth/web/<domain>/` 是否有有效会话
//      (泛化 douyin-cdp:813 被动探针;profile 存在≠有效登录,cookie 失效同样返回未登录)。
//
// 隐私红线(与抖音登录态同规格):cookie/session **只活在本机持久 profile**,绝不外传任何后端/
// 云端;登录全程由用户在有头浏览器里自己做,系统只持久化登录**结果**(profile),绝不代填账密。

// ── 域名归一 ────────────────────────────────────────────────────────────────
/**
 * 从 URL 解析出稳定的域名 key(保管库目录名 + 会话归属键)。小写、去掉前导 `www.`,
 * 让 `https://www.chatgpt.com/share/x` 与 `https://chatgpt.com/share/y` 归到同一保管库目录。
 * 非法/非 http(s) URL → 抛错(调用方接住转人话)。
 */
export function webDomainFromUrl(url: string): string {
  const trimmed = (url ?? "").trim();
  let host: string;
  try {
    const u = new URL(trimmed);
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      throw new Error("only http/https");
    }
    host = u.hostname;
  } catch {
    throw new Error(
      `无法从链接解析域名(只支持 http/https):「${trimmed.slice(0, 80)}」`,
    );
  }
  return host.toLowerCase().replace(/^www\./, "");
}

// ── 会话 cookie 启发式 ──────────────────────────────────────────────────────
// 不硬编码单一 cookie 名(不同站会话 cookie 名不同):匹配一组常见「会话/登录态」cookie 名
// 子串(大小写不敏感)。保守偏「宁可少判已登录」——误判只是徽标显未登录(低成本,读取时真失败
// 会再落「去登录」降级),绝不因徽标误显已登录而糊弄用户。
export const SESSION_COOKIE_HINTS = [
  "sessionid",
  "session-token",
  "session_token",
  "session", // 覆盖 laravel_session / _session 等
  "__secure-next-auth", // ChatGPT / NextAuth 会话
  "next-auth.session",
  "logged_in",
  "passport", // 抖音等
  "sso",
  "access_token",
  "auth_token",
  "sid", // 放末位:较泛,只在前面都没命中时兜底
];

interface CookieLike {
  name: string;
}

/** 一组 cookie 里是否存在「会话/登录态」cookie(启发式,见 SESSION_COOKIE_HINTS)。 */
export function hasSessionCookie(cookies: readonly CookieLike[]): boolean {
  return cookies.some((c) => {
    const n = (c.name ?? "").toLowerCase();
    return SESSION_COOKIE_HINTS.some((h) => n.includes(h));
  });
}

// ── 可注入端口(收窄浏览器能力,便于 fake ctx 单测,不起真 Chromium)─────────────
// 真实 Playwright BrowserContext/Page 结构上满足(默认注入时向上转型目标),与 douyin-cdp 一致。
export interface WebSessionCapablePage {
  goto(url: string, opts?: { waitUntil?: string; timeout?: number }): Promise<unknown>;
  waitForTimeout(ms: number): Promise<void>;
}
export interface WebSessionCapableContext {
  pages(): WebSessionCapablePage[];
  newPage(): Promise<WebSessionCapablePage>;
  cookies(url?: string): Promise<CookieLike[]>;
  close(): Promise<void>;
}

/** loginWeb / checkWebSessionStatus 的可注入依赖(默认真 openWebContext;单测注 fake ctx)。 */
export interface WebSessionDeps {
  openContext?: (
    authDir: string,
    headless: boolean,
  ) => Promise<WebSessionCapableContext>;
}

// 自起独立 Chromium + 持久化 profile(与 douyin-cdp.openContext 同款做法:反自动化标记)。
// **不加 `--no-proxy-server`**(抖音是国内直连才跳代理;通用 web —— 如 chatgpt.com —— 用户常
// 需系统代理才可达,故这里走系统默认代理)。首启若无 Chromium,由 douyin-cdp 的下载逻辑覆盖
// (同一 @playwright/test 浏览器),此处直接 launchPersistentContext。
async function realOpenWebContext(
  authDir: string,
  headless: boolean,
): Promise<WebSessionCapableContext> {
  const { chromium } = await import("@playwright/test");
  const { mkdir } = await import("node:fs/promises");
  await mkdir(authDir, { recursive: true }).catch(() => {});
  await clearSingletonLocks(authDir);
  const ctx = await chromium.launchPersistentContext(authDir, {
    headless,
    viewport: { width: 1440, height: 900 },
    args: ["--disable-blink-features=AutomationControlled"],
  });
  return ctx as unknown as WebSessionCapableContext;
}

// 持久 profile 的 Singleton 锁清理(与 douyin-cdp 同问题:上次异常退出残留锁会让 launch 失败)。
async function clearSingletonLocks(authDir: string): Promise<void> {
  const { rm } = await import("node:fs/promises");
  const { join } = await import("node:path");
  for (const f of ["SingletonLock", "SingletonCookie", "SingletonSocket"]) {
    await rm(join(authDir, f), { force: true }).catch(() => {});
  }
}

/**
 * [T-217a 能力 A] 有头登录:弹 Chromium 窗口,导航到目标 URL,让用户**自己**登录;轮询「该域
 * 出现会话 cookie」判成功(泛化 douyin-cdp:833 loginDouyin)。成功即落持久 profile 到 authDir。
 * 仅在用户机器(sidecar)跑;单测经 deps.openContext 注 fake ctx。
 */
export async function loginWeb(
  opts: { authDir: string; url: string; domain: string; timeoutSec?: number },
  deps: WebSessionDeps = {},
): Promise<{ loggedIn: boolean }> {
  const timeoutSec = opts.timeoutSec ?? 300;
  const openContext = deps.openContext ?? realOpenWebContext;
  const ctx = await openContext(opts.authDir, false);
  const cookieUrl = `https://${opts.domain}`;
  try {
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    await page
      .goto(opts.url, { waitUntil: "domcontentloaded", timeout: 30_000 })
      .catch(() => {}); // 打不开也不阻断登录窗口(用户可手动导航)
    for (let i = 0; i < timeoutSec; i++) {
      const cookies = await ctx.cookies(cookieUrl).catch(() => [] as CookieLike[]);
      if (hasSessionCookie(cookies)) return { loggedIn: true };
      await page.waitForTimeout(1000);
    }
    return { loggedIn: false };
  } finally {
    await ctx.close().catch(() => {}); // 关我们自起的独立 Chromium(非用户浏览器)
  }
}

/**
 * [T-217a 能力 B] 被动状态探针:headless 起 context 快查 `.auth/web/<domain>/` 里是否有会话
 * cookie(泛化 douyin-cdp:818 checkDouyinStatus),**不弹窗**。profile 存在≠有效登录 —— cookie
 * 失效(过期)同样返回 false,前端据此显「需重登」。单测经 deps.openContext 注 fake ctx。
 */
export async function checkWebSessionStatus(
  opts: { authDir: string; domain: string },
  deps: WebSessionDeps = {},
): Promise<{ loggedIn: boolean }> {
  const openContext = deps.openContext ?? realOpenWebContext;
  const ctx = await openContext(opts.authDir, true);
  try {
    const cookies = await ctx
      .cookies(`https://${opts.domain}`)
      .catch(() => [] as CookieLike[]);
    return { loggedIn: hasSessionCookie(cookies) };
  } finally {
    await ctx.close().catch(() => {});
  }
}
