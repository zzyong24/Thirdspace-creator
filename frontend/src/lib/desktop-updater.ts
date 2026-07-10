/**
 * `desktop-updater.ts` — [T-180] 桌面软件更新的前端薄封装(client-only)。
 *
 * Rust 侧 `tauri-plugin-updater` 已装 + 初始化,`tauri.conf.json` 已配 pubkey +
 * `createUpdaterArtifacts` + endpoint(见 lib.rs / tauri.conf.json)。本模块只在**桌面壳**里
 * 动态 import `@tauri-apps/plugin-updater` / `@tauri-apps/plugin-process` / `@tauri-apps/api/app`
 * 触发检查/下载/重启 —— web / SSR(无 `__TAURI_INTERNALS__`)一律安全降级,绝不 throw、绝不
 * 假装有更新(诚实铁律:非桌面态返回 `unavailable`,不误导用户)。
 *
 * 动态 import 是刻意的:这些插件模块在 web 环境 import 即会因缺 `__TAURI_INTERNALS__` 报错,
 * 故全部收敛到运行时按需 import + try/catch,SSR/web 走 `isDesktopRuntimeClient()` 前置短路。
 */

/**
 * 客户端「是否跑在桌面壳(Tauri)里」判别 —— SSR 安全(无 window → false)。
 * 与 server 侧 `isDesktopRuntime()`(读注入 env)不同:客户端探 Tauri 注入的全局
 * `__TAURI_INTERNALS__`(v2 内部桥)/ `isTauri`(withGlobalTauri 时)。web 浏览器无此全局 → false。
 */
export function isDesktopRuntimeClient(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as Record<string, unknown>;
  return "__TAURI_INTERNALS__" in w || "isTauri" in w;
}

/** 下载进度事件(归一化为累计已下载字节 + 可选总长)。 */
export type UpdateProgress =
  | { phase: "started"; contentLength?: number }
  | { phase: "downloading"; downloaded: number; contentLength?: number }
  | { phase: "finished" };

/** 「有可用更新」结果 —— 携带绑定到底层 Update 句柄的 downloadAndInstall。 */
export interface AvailableUpdate {
  kind: "available";
  /** 新版本号(如 "0.2.0")。 */
  version: string;
  /** 当前运行版本号。 */
  currentVersion: string;
  /** 更新说明(latest.json 的 notes/body),可能为空。 */
  notes?: string;
  /**
   * 下载并安装该更新。进度经 `onProgress` 回调回报(累计字节)。resolve 即安装完成
   * (随后应调 `relaunchApp()` 重启生效)。
   */
  downloadAndInstall: (onProgress?: (p: UpdateProgress) => void) => Promise<void>;
}

/** check() 归一化结果:诚实四态(有更新 / 已最新 / 非桌面 / 失败)。 */
export type CheckUpdateResult =
  | AvailableUpdate
  | { kind: "uptodate"; currentVersion: string }
  | { kind: "unavailable" }
  | { kind: "error"; message: string };

/**
 * 检查更新。非桌面态(web/SSR)直接返回 `unavailable`(不 import 插件、不 throw)。
 * 桌面态调插件 `check()`:返回 `null` → 已最新;返回 Update → 有更新(附 downloadAndInstall)。
 * 任何异常(网络失败 / endpoint 不可达 / 签名校验失败)→ `error` + 可读文案,绝不崩。
 */
export async function checkForUpdate(): Promise<CheckUpdateResult> {
  if (!isDesktopRuntimeClient()) return { kind: "unavailable" };
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check();
    if (!update) {
      // check() 返回 null = 无可用更新(当前即最新)。currentVersion 另经 getAppVersion 读。
      return { kind: "uptodate", currentVersion: "" };
    }
    return {
      kind: "available",
      version: update.version,
      currentVersion: update.currentVersion,
      notes: update.body,
      downloadAndInstall: async (onProgress) => {
        let downloaded = 0;
        let contentLength: number | undefined;
        await update.downloadAndInstall((event) => {
          if (!onProgress) return;
          switch (event.event) {
            case "Started":
              contentLength = event.data.contentLength;
              onProgress({ phase: "started", contentLength });
              break;
            case "Progress":
              downloaded += event.data.chunkLength;
              onProgress({ phase: "downloading", downloaded, contentLength });
              break;
            case "Finished":
              onProgress({ phase: "finished" });
              break;
          }
        });
      },
    };
  } catch (err) {
    return { kind: "error", message: readableError(err) };
  }
}

/**
 * 重启应用(安装完更新后生效)。走 `@tauri-apps/plugin-process` 的 relaunch。
 * 非桌面态或插件不可用 → 返回 false(调用方据此提示「请手动重启」),不 throw。
 */
export async function relaunchApp(): Promise<boolean> {
  if (!isDesktopRuntimeClient()) return false;
  try {
    const { relaunch } = await import("@tauri-apps/plugin-process");
    await relaunch();
    return true;
  } catch {
    return false;
  }
}

/**
 * 读当前应用版本(桌面态经 `@tauri-apps/api/app` getVersion;web/失败 → null)。
 */
export async function getAppVersion(): Promise<string | null> {
  if (!isDesktopRuntimeClient()) return null;
  try {
    const { getVersion } = await import("@tauri-apps/api/app");
    return await getVersion();
  } catch {
    return null;
  }
}

/** 把未知异常收敛成一句可读中文文案(网络失败等给友好提示,否则透传 message)。 */
function readableError(err: unknown): string {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : "";
  if (/network|fetch|timeout|connect|dns|reach/i.test(raw)) {
    return "检查更新失败:网络不可达,请检查网络后重试。";
  }
  return raw ? `检查更新失败:${raw}` : "检查更新失败,请稍后重试。";
}
