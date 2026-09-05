
import { isSafeWebDomain,webDomainFromUrl } from "./web-domain";

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

export {webDomainFromUrl,webSessionLookupDomains} from "./web-domain";

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

// ── [T-370a] storageState 注入/回写(SPEC 2026-07-17 browser-session-pool §2.5)──────────
// `launchPersistentContext` **不接受 storageState 选项** → 注入 = `context.addCookies(cookies)`
// + `addInitScript` 按 origin 回灌 localStorage(init script 每次导航都跑,只在 key 缺失时 set,
// 不覆盖站点会话中刷新的新值);回写 = `context.storageState()` 全量读(cookies+origins)。
// 本组纯函数/窄接口供 web-session 探针 + browser-pool(T-370b)共用。

/** playwright storageState 的结构子集(全量 JSON 原样存 DB,这里只解读两块)。 */
export interface StorageStateOrigin {
  origin: string;
  localStorage?: Array<{ name: string; value: string }>;
}
export interface StorageStateLike {
  cookies?: unknown[];
  origins?: StorageStateOrigin[];
}

/** 注入所需的最小 context 能力(真 BrowserContext 结构上满足;fake 可只实现用到的)。 */
export interface StorageInjectableContext {
  addCookies?(cookies: unknown[]): Promise<void>;
  addInitScript?(script: string): Promise<void>;
}

/**
 * 生成「按 origin 回灌 localStorage」的 init script(每次导航都执行,自包含、防
 * `</script>` 注入的 `<` 转义)。只在 key 缺失时 set —— 不覆盖站点自己刷新的新 token。
 */
export function buildLocalStorageInitScript(
  origins: readonly StorageStateOrigin[],
): string {
  const map: Record<string, Array<{ name: string; value: string }>> = {};
  for (const o of origins) {
    if (!o?.origin || !Array.isArray(o.localStorage) || !o.localStorage.length) continue;
    map[o.origin] = o.localStorage
      .filter((e) => typeof e?.name === "string" && typeof e?.value === "string")
      .map((e) => ({ name: e.name, value: e.value }));
  }
  const payload = JSON.stringify(map).replace(/</g, "\\u003c");
  return `(() => {
  try {
    var data = ${payload};
    var entries = data[window.location.origin];
    if (!entries) return;
    for (var i = 0; i < entries.length; i++) {
      try {
        if (window.localStorage.getItem(entries[i].name) === null) {
          window.localStorage.setItem(entries[i].name, entries[i].value);
        }
      } catch (e) {}
    }
  } catch (e) {}
})();`;
}

/**
 * 把 DB 里的 storageState JSON 注入一个(persistent)context:addCookies + localStorage
 * init script。JSON 损坏/空 state → 返 false(诚实视为无登录态,不抛)。
 */
export async function injectStorageState(
  ctx: StorageInjectableContext,
  stateJson: string,
): Promise<boolean> {
  let state: StorageStateLike;
  try {
    state = JSON.parse(stateJson) as StorageStateLike;
  } catch {
    return false;
  }
  let injected = false;
  if (Array.isArray(state.cookies) && state.cookies.length && ctx.addCookies) {
    await ctx.addCookies(state.cookies);
    injected = true;
  }
  if (Array.isArray(state.origins) && state.origins.length && ctx.addInitScript) {
    const script = buildLocalStorageInitScript(state.origins);
    await ctx.addInitScript(script);
    injected = true;
  }
  return injected;
}

/** 一份 storageState 是否携带任何登录材料(cookies 或 localStorage origins)。 */
export function storageStateHasData(state: unknown): state is StorageStateLike {
  if (!state || typeof state !== "object") return false;
  const s = state as StorageStateLike;
  return (
    (Array.isArray(s.cookies) && s.cookies.length > 0) ||
    (Array.isArray(s.origins) &&
      s.origins.some((o) => (o.localStorage?.length ?? 0) > 0))
  );
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
  // [T-370a] 注入/回写能力(可选:真 BrowserContext 都有;老 fake 不实现也不破)。
  storageState?(): Promise<unknown>;
  addCookies?(cookies: unknown[]): Promise<void>;
  addInitScript?(script: string): Promise<void>;
}

/** loginWeb / checkWebSessionStatus 的可注入依赖(默认真 openWebContext;单测注 fake ctx)。 */
export interface WebSessionDeps {
  openContext?: (
    authDir: string,
    headless: boolean,
  ) => Promise<WebSessionCapableContext>;
  // [T-370a] 登录态 DB 端口(persistence-client 绑 browserSessionsService + ctx 注入;缺省 =
  // 旧行为,只走 profile 目录)。saveState 失败(master-key 不可用)会**上抛人话错**(gate F-3
  // 拒存,绝不静默),getState 失败视为未登录。
  saveState?: (domain: string, stateJson: string) => Promise<void>;
  getState?: (domain: string) => Promise<string | null>;
  /** 存量惰性迁移 fs 端口(单测注 fake):旧 profile 目录是否有内容 / 归档(mv 加后缀)。 */
  legacyProfileHasData?: (authDir: string) => Promise<boolean>;
  archiveLegacyProfile?: (authDir: string) => Promise<void>;
}

// 旧 `.auth/web/<domain>` 目录是否存在且非空(有过登录/使用痕迹)。ENOENT → false。
async function realLegacyProfileHasData(authDir: string): Promise<boolean> {
  const { readdir } = await import("node:fs/promises");
  try {
    const entries = await readdir(authDir);
    return entries.some((e) => !e.startsWith(".") && !e.startsWith("Singleton"));
  } catch {
    return false;
  }
}

// 归档旧 profile 目录(mv 加后缀,不删 —— 可回滚;导入 DB 成功后才调)。
async function realArchiveLegacyProfile(authDir: string): Promise<void> {
  const { rename } = await import("node:fs/promises");
  await rename(authDir, `${authDir}.migrated-${Date.now()}`);
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
  const { guardedLaunch, chromiumSandboxOpts } = await import("./chromium-guard");
  await mkdir(authDir, { recursive: true }).catch(() => {});
  // [T-236] 登录窗优先用**系统正式 Chrome**(channel:"chrome"),而非 Playwright 自带的
  //   测试构建 Chromium:真机实测 Google OAuth 对测试构建/自动化痕迹格外警惕(强制 passkey
  //   /拒登「browser may not be secure」),正式 Chrome 构建接受度高得多。仍是**独立隔离
  //   profile(authDir)**,绝不连用户日常 Chrome(connectOverCDP 对用户 Chrome149 卡死,
  //   记忆有档)。系统没装 Chrome → 回落自带 Chromium(功能不减,只是 OAuth 兼容差些)。
  //   ignoreDefaultArgs 去掉 --enable-automation(减少「受自动化控制」横幅/检测面)。
  const baseOpts = {
    headless,
    viewport: { width: 1440, height: 900 },
    ...chromiumSandboxOpts(), // [T-369] 去掉 Playwright 默认 --no-sandbox(登录窗警告横幅根因)
    args: ["--disable-blink-features=AutomationControlled"],
    ignoreDefaultArgs: ["--enable-automation"],
  };
  // [T-307] 统一浏览器选择(优先系统 Chrome → 回落**打包全量 chromium**):原来 catch 分支回落
  //   裸 baseOpts(无 executablePath)→ 无系统 Chrome 时 headless 状态探针会找 chrome-headless-shell 崩;
  //   且必须和 web-reader 读取用**同一套**选择,登录态 profile 才互通。
  // [T-369] guardedLaunch:预检杀残留+清锁(只清锁,不动登录态)→ 同 profile 串行(登录窗跨请求
  //   保持打开时,同域状态探针不会把活窗的锁清掉/进程杀掉)→ 超时人话报错。
  const { launchWithBrowser } = await import("./browser-launch");
  const ctx = await guardedLaunch(
    authDir,
    () =>
      launchWithBrowser((sel) =>
        chromium.launchPersistentContext(authDir, { ...baseOpts, ...sel }),
      ),
    { label: "登录浏览器窗口" },
  );
  return ctx as unknown as WebSessionCapableContext;
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
      if (hasSessionCookie(cookies)) {
        // [T-370a] 登录成功检测点:storageState 全量读 → 经端口回写 DB(单一真值)。
        // 拒存(master-key 不可用)上抛人话错 —— 绝不静默假装保存成功。
        await persistContextState(ctx, opts.domain, deps);
        return { loggedIn: true };
      }
      await page.waitForTimeout(1000);
    }
    return { loggedIn: false };
  } finally {
    await ctx.close().catch(() => {}); // 关我们自起的独立 Chromium(非用户浏览器)
  }
}

// [T-370a] 从活 context 读 storageState 全量 JSON → saveState 端口回写 DB。
//   · 端口缺省 / context 无 storageState 能力(老 fake)→ no-op(旧行为);
//   · 读不到 state(浏览器已崩等)→ no-op(profile 目录仍是兜底);
//   · saveState 抛(master-key 不可用,gate F-3 拒存)→ **原样上抛**(人话错到 UI)。
async function persistContextState(
  ctx: WebSessionCapableContext,
  domain: string,
  deps: WebSessionDeps,
): Promise<void> {
  if (!deps.saveState || typeof ctx.storageState !== "function") return;
  let stateJson: string | null = null;
  try {
    const state = await ctx.storageState();
    if (storageStateHasData(state)) stateJson = JSON.stringify(state);
  } catch {
    return; // 读不到 → 不回写(诚实 no-op,不编造)
  }
  if (stateJson) await deps.saveState(domain, stateJson);
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
      // [T-370a] 用户确认登录成功 = 回写点:先趁 context 还活着读 storageState 全量,
      // 关窗后再经端口落 DB(拒存错误上抛人话 —— 窗已关、profile 已落盘,登录本身不丢)。
      let stateJson: string | null = null;
      if (!settled && deps.saveState && typeof ctx.storageState === "function") {
        try {
          const state = await ctx.storageState();
          if (storageStateHasData(state)) stateJson = JSON.stringify(state);
        } catch {
          // 读不到(窗被用户手关等)→ 不回写,仍走关窗确认
        }
      }
      await closeOnce();
      if (stateJson && deps.saveState) await deps.saveState(opts.domain, stateJson);
      return { loggedIn: true };
    },
    cancel: async () => {
      await closeOnce();
    },
  };
}

// ── [T-370a] 存量惰性迁移(SPEC §3.3,一次性 best-effort)────────────────────────
/**
 * DB 无该域记录时,尝试从旧 `.auth/web/<domain>` persistent profile 导入:目录非空 → 起一次
 * headless context 读 storageState → saveState 落 DB → **成功后**才归档旧目录(mv 加后缀,
 * 不删可回滚)。任何一步不成 → 返 null(诚实要求重新登录,不硬凑)。saveState 拒存
 * (master-key 不可用)→ warn + 不归档,本次仍可用读到的 state(下次再迁)。
 */
export async function importLegacyProfileState(
  opts: { authDir: string; domain: string },
  deps: WebSessionDeps = {},
): Promise<string | null> {
  if (!deps.saveState) return null;
  // [T-378] 迁移候选只认**裸域名**:归档目录名(`x.migrated-<ts>`)被当域名传进来 → 直接跳过,
  //   绝不对归档目录再触发「迁移→归档」(否则产出 `x.migrated-a.migrated-b` 嵌套 + DB 脏行增殖)。
  if (!isSafeWebDomain(opts.domain)) return null;
  const hasData = deps.legacyProfileHasData ?? realLegacyProfileHasData;
  const archive = deps.archiveLegacyProfile ?? realArchiveLegacyProfile;
  const openContext = deps.openContext ?? realOpenWebContext;
  if (!(await hasData(opts.authDir).catch(() => false))) return null;
  let stateJson: string | null = null;
  const ctx = await openContext(opts.authDir, true);
  try {
    if (typeof ctx.storageState === "function") {
      const state = await ctx.storageState().catch(() => null);
      if (storageStateHasData(state)) stateJson = JSON.stringify(state);
    }
  } finally {
    await ctx.close().catch(() => {});
  }
  if (!stateJson) return null; // 目录坏/无登录材料 → 诚实要求重新登录
  try {
    await deps.saveState(opts.domain, stateJson);
  } catch (err) {
    // 拒存(master-key 不可用等)→ 不归档(旧目录仍是唯一真值),本次探针仍可用读到的 state。
    console.warn(
      `[web-session] ${opts.domain} 存量登录态导入 DB 失败(旧目录保留,未归档):`,
      err instanceof Error ? err.message : String(err),
    );
    return stateJson;
  }
  await archive(opts.authDir).catch((err) => {
    console.warn(
      `[web-session] ${opts.domain} 旧 profile 归档失败(DB 已导入,不影响使用):`,
      err instanceof Error ? err.message : String(err),
    );
  });
  return stateJson;
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
  // [T-370a] DB 单一真值优先:有该域加密 state → 注入回灌(addCookies + localStorage init
  // script,§2.5)后按 cookie 判定(Chromium 会丢弃过期 cookie,注入后读回 = 真实有效性);
  // 无 → 存量惰性迁移(旧 `.auth/web/<domain>` 目录导入 DB 后归档);都无 → 旧行为
  // (profile 目录裸探针,通常未登录)。
  let stateJson: string | null = null;
  if (deps.getState) {
    stateJson = await deps.getState(opts.domain).catch(() => null);
  }
  if (!stateJson) {
    stateJson = await importLegacyProfileState(opts, deps);
  }
  const ctx = await openContext(opts.authDir, true);
  try {
    if (stateJson) await injectStorageState(ctx, stateJson);
    const cookies = await ctx
      .cookies(`https://${opts.domain}`)
      .catch(() => [] as CookieLike[]);
    return { loggedIn: hasSessionCookie(cookies) };
  } finally {
    await ctx.close().catch(() => {});
  }
}
