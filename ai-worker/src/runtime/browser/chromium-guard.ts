
// [T-369] 弹窗/无头 Chromium 启动守卫 —— 治「内置浏览器经常打不开」三根因,四个
// launchPersistentContext / chromium.launch 调用点(douyin-cdp openContext、web-session
// realOpenWebContext、web-reader realOpenReaderContext、web-capture realOpenContext)共用,
// 不再各自复制 clearSingletonLocks:
//   ① 启动预检:上次 Chromium 没退干净(强杀/崩溃)会留残留进程 + SingletonLock,二次
//      launch 静默失败/超时。预检按 **profile 路径精确匹配** 杀残留 Chromium(绝不误杀用户
//      自己的 Chrome —— 用户 Chrome 命令行不含我们的 .auth 目录),再清 Singleton* 锁文件。
//      **只清锁、只杀残留进程,绝不动 profile 里的登录态数据(cookie 等)。**
//   ② 并发防抖:同一 profile 并发 launch(如「状态探针 headless」撞上「登录弹窗 headed」)
//      按 profile 串行化;且 profile 上还有**我们自己在用**的活 context(如跨请求保持打开的
//      登录窗)时跳过杀进程/清锁 —— 否则预检会把活窗户的锁删掉、把活进程杀掉。
//   ③ 失败诚实:launch 包超时(默认 15s)+ 失败抛人话 BrowserLaunchError,沿既有错误通道
//      回 UI(各调用方 route 已渲错误态),不再静默挂死。
//
// 附:--no-sandbox 警告横幅根因 —— 仓库代码从没传过它,是 Playwright 默认
// `chromiumSandbox !== true` 时自动注入(playwright-core coreBundle chromiumSwitches 后
// push("--no-sandbox")),真 Chrome(channel:"chrome")对该 flag 显「不受支持的命令行标记」
// 横幅。mac/win 上 Chrome 沙箱开箱即用,不需要禁用 → chromiumSandboxOpts() 显式开沙箱,
// 横幅消失;linux 沙箱依赖 setuid helper,保留 Playwright 默认(禁用)不冒险。

/** 浏览器启动失败(人话 message,直接可渲给用户)。 */
export class BrowserLaunchError extends Error {
  readonly code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = "BrowserLaunchError";
    this.code = code;
  }
}

/** 持久 profile 锁的稳定内部码；收藏链会映射为用户可操作的 contract code。 */
export const CHROMIUM_PROFILE_LOCKED_CODE = "CHROMIUM_PROFILE_LOCKED";

/** 默认 launch 超时(毫秒)。 */
export const DEFAULT_LAUNCH_TIMEOUT_MS = 15_000;

/**
 * [T-369] 显式开 Chromium 沙箱(darwin/win32),去掉 Playwright 默认注入的 --no-sandbox
 * → 弹窗顶部「不受支持的命令行标记 --no-sandbox」警告横幅消失。所有 launch 调用点 spread。
 */
export function chromiumSandboxOpts(): { chromiumSandbox?: boolean } {
  return process.platform === "darwin" || process.platform === "win32"
    ? { chromiumSandbox: true }
    : {};
}

// ── 可注入端口(单测注 fake,不碰真进程/真文件系统)────────────────────────────
export interface ChromiumGuardDeps {
  /** 列出命令行包含该 profile 路径的**Chromium**进程 pid(默认 pgrep+ps 双验)。 */
  listProfileProcesses?: (profileDir: string) => Promise<number[]>;
  /** 杀单个 pid(默认 SIGKILL —— 对象只可能是残留僵尸,活 context 已被 ② 挡在预检外)。 */
  killPid?: (pid: number) => Promise<void>;
  /** 删单个锁文件(默认 rm force;只删 Singleton*,绝不碰 profile 其他内容)。 */
  removeFile?: (path: string) => Promise<void>;
}

async function realListProfileProcesses(profileDir: string): Promise<number[]> {
  if (process.platform === "win32") return []; // win 无 pgrep;锁清理仍生效,进程侧交 T-365 树杀
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const run = promisify(execFile);
  // pgrep -f 是正则匹配 → 转义 profile 路径里的元字符,精确按路径命中。
  const pattern = profileDir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let pids: number[] = [];
  try {
    const { stdout } = await run("pgrep", ["-f", pattern]);
    pids = stdout
      .split("\n")
      .map((s) => Number.parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n) && n > 0 && n !== process.pid);
  } catch {
    return []; // pgrep 无匹配退出码 1 → 无残留
  }
  // 双验:ps 读回完整命令行,必须「像 Chromium」且真含该 profile 路径(带 user-data-dir),
  // 才认定是我们自起的残留 —— 绝不误杀用户自己的 Chrome(其命令行不含我们的 .auth 目录)。
  const confirmed: number[] = [];
  for (const pid of pids) {
    try {
      const { stdout } = await run("ps", ["-p", String(pid), "-o", "command="]);
      const cmd = stdout.trim();
      if (/chrom/i.test(cmd) && cmd.includes(profileDir)) confirmed.push(pid);
    } catch {
      // 进程已消失 → 跳过
    }
  }
  return confirmed;
}

async function realKillPid(pid: number): Promise<void> {
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // ESRCH(已退出)等 → 幂等忽略
  }
}

async function realRemoveFile(path: string): Promise<void> {
  const { rm } = await import("node:fs/promises");
  await rm(path, { force: true }).catch(() => {});
}

/** Chromium 持久 profile 的单例锁文件(异常退出会残留,导致 relaunch abort)。 */
export const SINGLETON_LOCK_FILES = [
  "SingletonLock",
  "SingletonCookie",
  "SingletonSocket",
] as const;

/**
 * 启动预检:杀掉该 profile 的残留 Chromium 进程 + 清 Singleton* 锁文件。
 * **只清锁、只杀进程,绝不动 profile 内登录态数据。** 导出供单测直接验。
 */
export async function ensureChromiumLaunchable(
  profileDir: string,
  deps: ChromiumGuardDeps = {},
): Promise<void> {
  const list = deps.listProfileProcesses ?? realListProfileProcesses;
  const kill = deps.killPid ?? realKillPid;
  const remove = deps.removeFile ?? realRemoveFile;
  const pids = await list(profileDir).catch(() => [] as number[]);
  for (const pid of pids) {
    console.warn(
      `[chromium-guard] 清理残留 Chromium 进程 pid=${pid}(profile: ${profileDir})`,
    );
    await kill(pid);
  }
  const { join } = await import("node:path");
  for (const f of SINGLETON_LOCK_FILES) {
    await remove(join(profileDir, f));
  }
}

// ── 并发防抖 + 活 context 追踪(进程内单例状态)────────────────────────────────
// [T-567] Chromium 的 user-data-dir 锁覆盖的是整个 BrowserContext 生命周期，不只是
// launch 那一瞬间。旧实现只等前一个 launch Promise resolve，context 仍活着时第二个请求
// 已经开始 launchPersistentContext，必然撞 SingletonLock。队列尾因此必须一直持有到
// context close/close event，再放行同 profile 的后继请求。
const launchQueues = new Map<string, Promise<void>>();
const liveContexts = new Map<string, number>();

/** 单测辅助:读某 profile 当前活 context 数。 */
export function liveContextCount(profileDir: string): number {
  return liveContexts.get(profileDir) ?? 0;
}

interface Closable {
  close(): Promise<void>;
  // 方法签名(双变)—— 让 Playwright BrowserContext/Browser 的窄参 on 重载也结构满足。
  on?(event: string, cb: () => void): unknown;
}

export interface GuardedLaunchOptions {
  /** launch 超时毫秒(默认 DEFAULT_LAUNCH_TIMEOUT_MS)。 */
  timeoutMs?: number;
  /** 错误文案里的入口名(如「登录窗口」「网页读取」),默认「浏览器」。 */
  label?: string;
}

function isChromiumProfileLockedFailure(error: unknown): boolean {
  const record =
    error !== null && typeof error === "object"
      ? (error as { code?: unknown; name?: unknown; message?: unknown })
      : null;
  if (
    record?.code === CHROMIUM_PROFILE_LOCKED_CODE ||
    record?.code === "EBUSY" ||
    record?.code === "EACCES"
  ) {
    return true;
  }
  const name = typeof record?.name === "string" ? record.name : "";
  const message = typeof record?.message === "string" ? record.message : "";
  return (
    name === "BrowserProfileLockedError" ||
    /Singleton(?:Lock|Cookie|Socket)|profile.*(?:in use|locked)|browser.*lock|正在被占用/i.test(
      message,
    )
  );
}

/**
 * [T-369] 守卫式 launch:预检(杀残留+清锁,仅当该 profile 无活 context)→ 同 profile 串行
 * → 超时 + 人话报错。`profileDir=null` 表示无持久 profile(web-capture 干净无头),只做
 * 超时/报错包装。launch 闭包内可自由做 channel:"chrome" → 打包 chromium 的双试。
 */
export async function guardedLaunch<T extends Closable>(
  profileDir: string | null,
  launch: () => Promise<T>,
  opts: GuardedLaunchOptions = {},
  deps: ChromiumGuardDeps = {},
): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_LAUNCH_TIMEOUT_MS;
  const label = opts.label ?? "浏览器";

  const attempt = async (runPreflight = true): Promise<T> => {
    if (runPreflight && profileDir && liveContextCount(profileDir) === 0) {
      await ensureChromiumLaunchable(profileDir, deps);
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const launching = launch();
    try {
      const result = await Promise.race([
        launching,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new BrowserLaunchError(
                  `${label}启动超时(${Math.round(timeoutMs / 1000)} 秒)——可能有浏览器残留进程未退干净,已自动清理,请重试;若反复失败请重启应用。`,
                ),
              ),
            timeoutMs,
          );
        }),
      ]);
      return result;
    } catch (err) {
      // 超时后底层 launch 若迟到成功 → 顺手关掉,别泄漏进程。
      launching.then((ctx) => void ctx.close().catch(() => {})).catch(() => {});
      if (err instanceof BrowserLaunchError) throw err;
      if (isChromiumProfileLockedFailure(err)) {
        throw new BrowserLaunchError(
          `${label}的登录档案仍被占用。已自动清理并重试一次；请关闭相关登录窗口后再试。`,
          CHROMIUM_PROFILE_LOCKED_CODE,
        );
      }
      const msg = err instanceof Error ? err.message : String(err);
      throw new BrowserLaunchError(
        `${label}没能启动:${msg.split("\n")[0]}。已自动清理残留进程与锁,请重试;若反复失败请重启应用。`,
      );
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  const runGuarded = async (): Promise<T> => {
    let ctx: T;
    try {
      ctx = await attempt();
    } catch (error) {
      // profile 锁只允许在进程内确认无活 context 后恢复一次。预检仍按 profile
      // 精确匹配残留 Chromium，绝不碰用户自己的 Chrome；第二次失败直接上抛。
      if (
        !profileDir ||
        liveContextCount(profileDir) !== 0 ||
        !isChromiumProfileLockedFailure(error)
      ) {
        throw error;
      }
      console.warn(
        "[chromium-guard] profile 锁启动失败，确认无活 context 后清理并重试一次",
      );
      await ensureChromiumLaunchable(profileDir, deps);
      ctx = await attempt(false);
    }
    if (profileDir) {
      liveContexts.set(profileDir, liveContextCount(profileDir) + 1);
      let released = false;
      const release = (): void => {
        if (released) return;
        released = true;
        liveContexts.set(profileDir, Math.max(0, liveContextCount(profileDir) - 1));
      };
      // close 正常关 → 释放;浏览器崩溃(close 事件)也释放,避免 refcount 卡死让预检永远跳过。
      const origClose = ctx.close.bind(ctx);
      ctx.close = async () => {
        try {
          await origClose();
        } finally {
          release();
        }
      };
      try {
        ctx.on?.("close", release);
      } catch {
        // fake/收窄 context 无 on → close 包装已兜底
      }
    }
    return ctx;
  };

  if (!profileDir) return runGuarded();

  // 同 profile 串行化到 context close：后来者不只等 launch 完成，还要等前一个 context
  // 释放用户目录。失败路径立即释放；正常 close 与浏览器崩溃的 close event 都幂等释放。
  const previousLease = launchQueues.get(profileDir) ?? Promise.resolve();
  let resolveLease!: () => void;
  const leaseOpen = new Promise<void>((resolve) => {
    resolveLease = resolve;
  });
  const leaseTail = previousLease.catch(() => {}).then(() => leaseOpen);
  launchQueues.set(profileDir, leaseTail);
  void leaseTail.finally(() => {
    if (launchQueues.get(profileDir) === leaseTail) {
      launchQueues.delete(profileDir);
    }
  });

  await previousLease.catch(() => {});
  let leaseReleased = false;
  const releaseLease = (): void => {
    if (leaseReleased) return;
    leaseReleased = true;
    resolveLease();
  };

  try {
    const ctx = await runGuarded();
    const originalClose = ctx.close.bind(ctx);
    ctx.close = async () => {
      try {
        await originalClose();
      } finally {
        releaseLease();
      }
    };
    try {
      ctx.on?.("close", releaseLease);
    } catch {
      // fake/收窄 context 无 on → close 包装已兜底
    }
    return ctx;
  } catch (error) {
    releaseLease();
    throw error;
  }
}
