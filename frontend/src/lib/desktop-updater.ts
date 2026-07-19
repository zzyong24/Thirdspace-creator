/**
 * `desktop-updater.ts` — [T-180 → T-396c] 桌面软件更新的前端薄封装(client-only)。
 *
 * [T-396c] 更新流已渠道化:检查走 Rust IPC `license_latest_version`(latest-version 端点 +
 * Ed25519 验签在 Rust,SPEC §4/§6),有新版跳渠道 downloadUrl 用户自行下载 —— 不再走
 * `tauri-plugin-updater` 的 check()/downloadAndInstall()(endpoint 已从 tauri.conf.json
 * 摘除;插件 + 签名产物链保留 = 可逆开关)。`relaunchApp` 仍供重置工作区等场景复用。
 *
 * web / SSR(无 `__TAURI_INTERNALS__`)一律安全降级,绝不 throw、绝不假装有更新
 * (诚实铁律:非桌面态返回 `unavailable`,不误导用户)。
 *
 * 动态 import 是刻意的:Tauri api 模块在 web 环境 import 即会因缺 `__TAURI_INTERNALS__` 报错,
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

/** [T-396c] Rust `license_latest_version` 的结果形状(license.rs LatestVersionInfo,serde camelCase)。 */
export interface LatestVersionInfo {
  currentVersion: string;
  /** null = 服务端未公告版本 / 授权失效不提示更新。 */
  latestVersion: string | null;
  releaseNotes: string | null;
  /**
   * 该码渠道的下载链接;null = 未激活/渠道未配 → UI 显「联系授权方」,
   * **绝不回退官方链接**(SPEC §5/§7 红线)。
   */
  downloadUrl: string | null;
  updateAvailable: boolean;
}

/** 检查结果归一化:诚实四态(有更新 / 已最新 / 非桌面 / 失败)。 */
export type CheckLatestResult =
  | { kind: "available"; info: LatestVersionInfo }
  | { kind: "uptodate"; currentVersion: string }
  | { kind: "unavailable" }
  | { kind: "error"; message: string };

/**
 * [T-396c] 检查更新(渠道化):非桌面态直接 `unavailable`;桌面态经 IPC
 * `license_latest_version` → Rust 调 latest-version 端点 + 验签 + 语义比较版本。
 * Rust 侧 Err 即人话文案(并入 T-412),直接展示;IPC 本身异常 → 通用友好文案,绝不崩。
 */
export async function checkLatestVersion(): Promise<CheckLatestResult> {
  if (!isDesktopRuntimeClient()) return { kind: "unavailable" };
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const info = await invoke<LatestVersionInfo>("license_latest_version");
    if (info.updateAvailable) {
      return { kind: "available", info };
    }
    return { kind: "uptodate", currentVersion: info.currentVersion };
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

/**
 * 把异常收敛成一句可读中文文案。[T-396c] Rust command 的 Err 已是人话(含中文),原样透传;
 * 其余(IPC 桥异常/英文技术串)收敛为友好提示,不把 `error sending request…` 甩给用户(T-412)。
 */
function readableError(err: unknown): string {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : "";
  // 含 CJK 字符 = Rust 侧人话文案,直接展示。
  if (/[一-鿿]/.test(raw)) {
    return raw;
  }
  if (
    /network|fetch|timeout|connect|dns|reach|sending request|request for url/i.test(
      raw,
    )
  ) {
    return "检查更新失败:网络不可达,请检查网络后重试。";
  }
  return "检查更新失败,请检查网络后重试。若多次失败,可稍后再试或联系作者。";
}
