import "server-only";

// [T-370b] 持久 profile 池(SPEC 2026-07-17 browser-session-pool §2.3/§2.4/§3.2)——
// web 域读取用的 Chromium persistent profile 池(`.auth/pool/p1..pN`,N 默认 5,env
// CREATOROS_BROWSER_POOL_SIZE 可配)。成员无域绑定,checkout(domain) 时从 DB(browser_sessions
// 加密单一真值,T-370a)解密注入该域 storageState,return 时回写 DB → clearCookies → 归还。
//
// 跨域隔离双保险(gate F-1 HIGH):
//   · **域亲和 sticky(主)**:成员记 lastDomain,checkout 严格优先同域 idle 成员 → 其次
//     从未用过的成员 → 最后才征用他域成员;域数 ≤ 池上限时**永不跨域复用**。
//   · **目录级存储擦除(征用时)**:征用他域成员前删其 profile 内站点存储子目录
//     (Local Storage / IndexedDB / Session Storage / Service Worker / Cache* —— persistent
//     profile 的 localStorage/JWT 会泄给下一个域;另删 Cookies*/Network,防「上次进程死没
//     return、clearCookies 没跑」的残留 cookie 脏注入)。playwright persistent profile 实际
//     布局可能有/无 `Default/` 层 → 运行时两种布局都探测都删。**擦除失败 → 拒用该成员换
//     下一个**(诚实,绝不带脏注入)。
//
// 并发:成员选中即标 busy(同步预留,单线程事件循环下无 TOCTOU),全 busy → FIFO 排队;
// release 归还后唤醒队首。启动一律走调用方注入的 launch(persistence-client 绑 T-369
// chromium-guard 的 guardedLaunch —— **guard 零语义改动,只调用不修改**,gate F-4)。
//
// 红线(SPEC §2.1):抖音不进池 —— 本池只服务 web 域(web-reader 等);douyin-cdp 的
// `.auth/douyin/<accountId>` per-account persistent profile 零改动。
//
// deps 全注入(fake launch/fs/session 端口)可单测,不起真浏览器、不碰真文件系统。

import { injectStorageState, storageStateHasData } from "./web-session";

/** 池成员 context 的最小能力(真 BrowserContext 结构上满足;fake 只实现用到的)。 */
export interface PoolCapableContext {
  close(): Promise<void>;
  clearCookies?(): Promise<void>;
  storageState?(): Promise<unknown>;
  addCookies?(cookies: unknown[]): Promise<void>;
  addInitScript?(script: string): Promise<void>;
}

/** 登录态 DB 端口(per-checkout 绑 ctx:persistence-client 传 browserSessionsService 闭包)。 */
export interface PoolSessionPorts {
  getState: (domain: string) => Promise<string | null>;
  saveState: (domain: string, stateJson: string) => Promise<void>;
}

export interface PoolHandle<C extends PoolCapableContext = PoolCapableContext> {
  readonly context: C;
  readonly domain: string;
  readonly memberDir: string;
  /** 归还:storageState 回写 DB → clearCookies → close → 标 idle + 唤醒队首。幂等。 */
  release(): Promise<void>;
}

export interface BrowserPoolDeps<C extends PoolCapableContext = PoolCapableContext> {
  /** 池根目录(成员 = `<poolDir>/p1..pN`)。 */
  poolDir: string;
  /** 池上限(缺省读 env CREATOROS_BROWSER_POOL_SIZE,再缺省 5)。 */
  size?: number;
  /** 启动一个成员 persistent context(调用方绑 guardedLaunch + launchPersistentContext)。 */
  launch: (memberDir: string) => Promise<C>;
  /** 征用擦除(缺省真 fs wipeProfileStorage;单测注 fake)。失败抛错 = 拒用该成员。 */
  wipeMemberStorage?: (memberDir: string) => Promise<void>;
}

export interface PoolAcquireOptions {
  signal?: AbortSignal;
  deadlineAt?: number;
}

export interface BrowserPool<C extends PoolCapableContext = PoolCapableContext> {
  /** 取一个注入好该域登录态的成员 context。全 busy → FIFO 排队等归还。 */
  checkout(domain: string, session: PoolSessionPorts, options?: PoolAcquireOptions): Promise<PoolHandle<C>>;
  /** 可观测:池大小/忙碌数/排队数(诊断用)。 */
  stats(): { size: number; busy: number; queued: number };
}

export const DEFAULT_POOL_SIZE = 5;

/** 解析池上限(env 非法/缺失 → 默认 5;下限 1)。导出供单测。 */
export function resolvePoolSize(raw: string | undefined, fallback = DEFAULT_POOL_SIZE): number {
  const n = Number.parseInt((raw ?? "").trim(), 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return n;
}

// ── 征用擦除(真 fs 实现;导出供单测直验两种布局)────────────────────────────────
// 站点存储子目录(泄漏面):localStorage/JWT 类登录态住这里,clearCookies 清不掉。
const STORAGE_DIR_NAMES = new Set([
  "Local Storage",
  "IndexedDB",
  "Session Storage",
  "Service Worker",
]);
// 附加防线:残留 cookie(进程死没 return、clearCookies 没跑)+ 新 Chrome 的 Network/Cookies。
const COOKIE_ENTRY_PREFIXES = ["Cookies", "Network"];

function isWipeTarget(name: string): boolean {
  if (STORAGE_DIR_NAMES.has(name)) return true;
  if (/cache/i.test(name)) return true; // Cache / Code Cache / GPUCache / ShaderCache…
  return COOKIE_ENTRY_PREFIXES.some((p) => name === p || name.startsWith(`${p}`));
}

/**
 * 目录级存储擦除:对 profile 根 + `Default/` 两种布局都探测,删站点存储/缓存/cookie 条目。
 * 任一删除失败 → 抛错(调用方拒用该成员)。profile 目录不存在(从未用过)→ no-op。
 */
export async function wipeProfileStorage(memberDir: string): Promise<void> {
  const { readdir, rm } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const roots = [memberDir, join(memberDir, "Default")];
  for (const root of roots) {
    let entries: string[];
    try {
      entries = await readdir(root);
    } catch {
      continue; // 布局无此层(或成员从未启动过)→ 跳过
    }
    for (const name of entries) {
      if (!isWipeTarget(name)) continue;
      // 不 force-吞错:删不掉(权限/占用)必须抛 —— 拒用该成员,绝不带脏注入。
      await rm(join(root, name), { recursive: true, force: true });
    }
  }
}

interface Member {
  id: string;
  dir: string;
  busy: boolean;
  lastDomain: string | null;
}

interface Waiter {
  options: PoolAcquireOptions;
  cleanup: () => void;
  domain: string;
  session: PoolSessionPorts;
  resolve: (h: PoolHandle) => void;
  reject: (err: unknown) => void;
}

export function createBrowserPool<C extends PoolCapableContext>(
  deps: BrowserPoolDeps<C>,
): BrowserPool<C> {
  const size = deps.size ?? resolvePoolSize(process.env.CREATOROS_BROWSER_POOL_SIZE);
  const wipe = deps.wipeMemberStorage ?? wipeProfileStorage;
  const members: Member[] = Array.from({ length: size }, (_, i) => ({
    id: `p${i + 1}`,
    dir: `${deps.poolDir}/p${i + 1}`,
    busy: false,
    lastDomain: null,
  }));
  const waiters: Waiter[] = [];

  // 域亲和 sticky 选序(SPEC §2.4):同域 idle → 从未用过的 idle → 他域 idle(征用)。
  const pickIdle = (domain: string, excluded: Set<string>): Member | null => {
    const idle = members.filter((m) => !m.busy && !excluded.has(m.id));
    return (
      idle.find((m) => m.lastDomain === domain) ??
      idle.find((m) => m.lastDomain === null) ??
      idle[0] ??
      null
    );
  };

  const wakeNext = (): void => {
    const w = waiters.shift(); // 严格 FIFO
    if (!w) return;
    w.cleanup();
    acquire(w.domain, w.session, w.options).then(w.resolve, (error) => {
      w.reject(error);
      // 队首可能在 timer 执行前已过期，尚未取得成员便失败；不能让后续队列失去唤醒。
      if (members.some((member) => !member.busy)) wakeNext();
    });
  };

  const makeHandle = (
    member: Member,
    ctx: C,
    domain: string,
    session: PoolSessionPorts,
  ): PoolHandle<C> => {
    let released = false;
    return {
      context: ctx,
      domain,
      memberDir: member.dir,
      release: async () => {
        if (released) return;
        released = true;
        try {
          // ① 回写:storageState 全量读 → DB(登录态更新不丢)。拒存(master-key 不可用)
          //   → warn(诚实 log,不阻断归还 —— DB 旧值仍在,下次登录可自愈)。
          if (typeof ctx.storageState === "function") {
            const state = await ctx.storageState().catch(() => null);
            if (storageStateHasData(state)) {
              await session
                .saveState(domain, JSON.stringify(state))
                .catch((err) => {
                  console.warn(
                    `[browser-pool] ${domain} 登录态回写 DB 失败(本次更新未保存):`,
                    err instanceof Error ? err.message : String(err),
                  );
                });
            }
          }
          // ② 清成员 cookie(persistent 落盘的也清)—— 成员归还后不携带上一个域的会话。
          await ctx.clearCookies?.().catch(() => {});
        } finally {
          await ctx.close().catch(() => {});
          member.busy = false;
          member.lastDomain = domain;
          wakeNext();
        }
      },
    };
  };

  const acquire = async (
    domain: string,
    session: PoolSessionPorts,
    options: PoolAcquireOptions = {},
  ): Promise<PoolHandle<C>> => {
    const check = () => {
      options.signal?.throwIfAborted();
      if (options.deadlineAt !== undefined && Date.now() >= options.deadlineAt) throw new Error("浏览器等待已超时");
    };
    check();
    const excluded = new Set<string>(); // 本次 acquire 内擦除失败被拒用的成员
    for (;;) {
      check();
      const member = pickIdle(domain, excluded);
      if (!member) {
        if (members.some((m) => m.busy)) {
          // 全 busy(或余下的都被拒用)→ FIFO 排队,等归还唤醒。
          return new Promise<PoolHandle<C>>((resolve, reject) => {
            let timer: ReturnType<typeof setTimeout> | undefined;
            const waiter: Waiter = {
              domain, session, options,
              resolve: resolve as (h: PoolHandle) => void, reject,
              cleanup: () => { options.signal?.removeEventListener("abort", cancel); if (timer) clearTimeout(timer); },
            };
            const cancel = () => {
              const index = waiters.indexOf(waiter);
              if (index < 0) return;
              waiters.splice(index, 1);
              waiter.cleanup();
              reject(options.signal?.reason ?? new Error("浏览器等待已超时"));
            };
            waiters.push(waiter);
            options.signal?.addEventListener("abort", cancel, {once: true});
            if (options.deadlineAt !== undefined) timer = setTimeout(cancel, Math.max(0, options.deadlineAt - Date.now()));
            if (options.signal?.aborted) cancel();
          });
        }
        // 无 busy 成员却无可用成员 = 所有 idle 成员擦除都失败 → 诚实报错(不带脏注入)。
        throw new Error(
          "浏览器池没有可用成员:征用他域成员时存储擦除失败,拒绝带残留数据启动。请重启应用后再试。",
        );
      }
      member.busy = true; // 同步预留(先占后做异步事,防并发重复选中)
      // 征用他域成员 → 目录级存储擦除;失败 → 拒用该成员(释放预留,保持其原 lastDomain),换下一个。
      if (member.lastDomain !== null && member.lastDomain !== domain) {
        try {
          await wipe(member.dir);
        } catch (err) {
          console.warn(
            `[browser-pool] 成员 ${member.id} 存储擦除失败,拒用(换下一个):`,
            err instanceof Error ? err.message : String(err),
          );
          member.busy = false;
          excluded.add(member.id);
          continue;
        }
        member.lastDomain = null; // 擦干净 = 如新
      }
      let ctx: C | undefined;
      try {
        check();
        ctx = await deps.launch(member.dir);
        check();
        // 注入(§2.5):DB 有该域 state → addCookies + localStorage init script 回灌;
        // 无/解密失败(getState 已 logged 返 null)→ 干净 context(读取会诚实撞登录墙)。
        const stateJson = await session.getState(domain).catch(() => null);
        check();
        if (stateJson) await injectStorageState(ctx, stateJson);
        check();
        return makeHandle(member, ctx, domain, session);
      } catch (err) {
        await ctx?.close().catch(() => {});
        // launch/注入失败 → 释放预留 + 唤醒队列(别把成员卡成永久 busy),错误原样上抛。
        member.busy = false;
        wakeNext();
        throw err;
      }
    }
  };

  return {
    checkout: (domain, session, options) => acquire(domain, session, options),
    stats: () => ({
      size,
      busy: members.filter((m) => m.busy).length,
      queued: waiters.length,
    }),
  };
}
