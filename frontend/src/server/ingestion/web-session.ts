import "server-only";

// [T-217a] Web Session Vault(登录态保管库)—— 把抖音采集已有的「launchPersistentContext +
// .auth/ 持久 profile + 被动探针」(douyin-cdp.ts)**泛化成任意域名**的登录态保管库。
//
// 与 douyin-cdp 完全同款分层/依赖注入范式:
//   ① openWebContext —— 自起独立 Chromium + 按目录持久 profile(`.auth/web/<domain>/`),
//      不连用户日常 Chrome(connectOverCDP 对用户 Chrome149 卡死,记忆「douyin-collection-approach」);
//   ② [T-221] openWebLoginWindow(有头,主路径)—— 弹窗让用户**自己**登录后**保持打开**,由用户
//      在 vault 卡显式点「我登好了」→ handle.confirm() 关窗持久化。**不轮询 cookie 自动关**(治
//      「浏览器秒关」:收紧前的 cookie 启发式会把登录页匿名 cookie 误判已登录,首轮就关窗)。
//      loginWeb(轮询「该域出现会话 cookie」判成功)保留为低层测试基元,不再是 vault 登录主路径。
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
// 不硬编码单一 cookie 名(不同站会话 cookie 名不同):匹配一组常见「会话/登录态」cookie 名。
// [T-221] **收紧**:去掉裸子串 "session" / "sid" / "sso" —— 它们太泛,会命中登录页刚 set 的匿名
// 会话 cookie(如 chatgpt.com 登录页的 `__Host-next-auth.*` / datadome 等),导致「未登录也判已登录」
// → loginWeb 首轮轮询即成功关窗(用户看到浏览器秒关)。改用**全等名 + 强特征子串**白名单
// (如 `_session` 必带下划线,避开裸 `session`;`session-token`/`sessionid` 是真实登录态 cookie)。
// 保守偏「宁可少判已登录」——徽标误显未登录只是低成本(读取时真失败会再落「去登录」降级),
// 绝不因误显已登录而糊弄用户。登录成功判定改由「用户显式确认」兜底(见 openWebLoginWindow),
// 不再赌 cookie 名。
export const SESSION_COOKIE_HINTS = [
  "sessionid",
  "session-token",
  "session_token",
  "_session", // laravel_session / xxx_session(必带下划线,避开裸 "session" 匿名会话)
  "__secure-next-auth", // ChatGPT / NextAuth 登录后会话(登录页不 set 此名)
  "next-auth.session",
  "logged_in",
  "passport", // 抖音等
  "access_token",
  "auth_token",
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

// ── [T-221] 显式确认登录窗口(治「浏览器秒关」)──────────────────────────────
// 根因:loginWeb 靠 hasSessionCookie 首轮命中就 return 并 close(finally),而收紧前的启发式会把
// 登录页刚 set 的匿名 cookie 误判「已登录」→ 弹窗瞬间被关,用户来不及登。SPEC
// 2026-07-11-web-session-vault-reader-design 允许「用户显式确认 或 cookie 出现」二选一——这里选
// **显式确认**(最稳,完全不赌 cookie 名):
//   openWebLoginWindow 只负责**开着**独立 Chromium 让用户自己登(不轮询、不自动关);返回一个
//   handle,由组合根(persistence-client webSessionRuntime)跨请求持有。用户在 vault 卡点「我登好了」
//   → handle.confirm() 关窗(launchPersistentContext 关闭时把登录态持久化到 authDir);点「取消」
//   或超时 → handle.cancel() 关窗不留承诺。
//
// 隔离/隐私不变:独立 Chromium + 按域持久 profile,登录全程用户自己做,系统只持久化结果。
// 端口注入(deps.openContext)同 loginWeb,单测注 fake ctx 验「开窗不自动关 / confirm|cancel 才关」。

export interface WebLoginHandle {
  readonly domain: string;
  /** 用户显式「我登好了」:关窗(持久化 profile),认可登录成功(不赌 cookie 名)。幂等。 */
  confirm(): Promise<{ loggedIn: boolean }>;
  /** 用户「取消」/ 超时:关窗,不留登录承诺。幂等(与 confirm 互斥,先到先关)。 */
  cancel(): Promise<void>;
}

/**
 * [T-221] 开一个有头登录窗口并**保持打开**(不轮询、不自动关),返回待确认 handle。导航到目标
 * URL(打不开不阻断,用户可手动导航)。真实采集只在用户机器(sidecar)跑;单测经 deps.openContext
 * 注 fake ctx。**不在此关 ctx** —— 关窗交给 handle.confirm() / handle.cancel()(跨 HTTP 请求)。
 */
export async function openWebLoginWindow(
  opts: { authDir: string; url: string; domain: string },
  deps: WebSessionDeps = {},
): Promise<WebLoginHandle> {
  const openContext = deps.openContext ?? realOpenWebContext;
  const ctx = await openContext(opts.authDir, false); // 有头,让用户自己登
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await page
    .goto(opts.url, { waitUntil: "domcontentloaded", timeout: 30_000 })
    .catch(() => {}); // 打不开也不阻断(用户可在窗口里手动导航)
  let settled = false;
  const closeOnce = async (): Promise<void> => {
    if (settled) return; // confirm/cancel/超时 只关一次
    settled = true;
    await ctx.close().catch(() => {}); // 关我们自起的独立 Chromium(persistentContext 关闭即落盘登录态)
  };
  return {
    domain: opts.domain,
    confirm: async () => {
      await closeOnce();
      return { loggedIn: true };
    },
    cancel: async () => {
      await closeOnce();
    },
  };
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
