/**
 * `desktop-updater.ts` — [T-180 → T-396c → T-459] 桌面软件更新的前端薄封装(client-only)。
 *
 * [T-729] 更新检查与激活完全拆开：只 GET 当前包编译期固定的公开 manifest，不发送激活码、
 * machineId、projectKey 或 nonce。只信 version/notes；下载入口同样来自包级清单，绝不采纳
 * 远端 JSON 的任意 URL，也不让渠道包回退 CreatorOS 官方入口。
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

import {
  PACKAGE_DOWNLOAD_URL,
  PACKAGE_UPDATE_MANIFEST_URL,
  PACKAGE_WEBSITE_URL,
} from "./package-brand";

export {
  PACKAGE_DOWNLOAD_URL,
  PACKAGE_UPDATE_MANIFEST_URL,
  PACKAGE_WEBSITE_URL,
};

interface OfficialUpdateManifest {
  version?: unknown;
  notes?: unknown;
}

/** 前端归一化后的版本检查结果。 */
export interface LatestVersionInfo {
  currentVersion: string;
  /** null 仅用于兼容旧调用形状；公开 manifest 格式异常时会直接返回 error。 */
  latestVersion: string | null;
  releaseNotes: string | null;
  /**
 * 有新版时固定为当前包下载页；远端 manifest 不能覆盖。
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
 * [T-729] 检查更新:非桌面态直接 `unavailable`;桌面态读壳版本 + GET 包级公开 manifest。
 * 不调用授权 IPC，不携带任何用户/授权字段。远端只提供 version/notes，下载地址固定官网。
 */
export async function checkLatestVersion(): Promise<CheckLatestResult> {
  if (!isDesktopRuntimeClient()) return { kind: "unavailable" };
  try {
    const currentVersion = await getAppVersion();
    if (!currentVersion) {
      return {
        kind: "error",
        message: "暂时无法读取当前版本,请重启软件后重试。",
      };
    }
    if (!PACKAGE_UPDATE_MANIFEST_URL) {
      return {
        kind: "error",
        message: "当前安装包没有可用的更新入口，请联系授权方。",
      };
    }
    const response = await fetch(PACKAGE_UPDATE_MANIFEST_URL, {
      method: "GET",
      cache: "no-store",
      redirect: "error",
    });
    if (!response.ok) {
      return {
        kind: "error",
        message: "更新服务暂时不可用,请稍后重试。",
      };
    }
    const manifest = (await response.json()) as OfficialUpdateManifest;
    const latestVersion =
      typeof manifest.version === "string" ? manifest.version.trim() : "";
    if (!latestVersion || versionParts(latestVersion).length === 0) {
      return {
        kind: "error",
        message: "更新服务响应格式有误,请稍后重试。",
      };
    }
    const info: LatestVersionInfo = {
      currentVersion,
      latestVersion,
      releaseNotes:
        typeof manifest.notes === "string" && manifest.notes.trim()
          ? manifest.notes.trim()
          : null,
      downloadUrl: PACKAGE_DOWNLOAD_URL,
      updateAvailable: versionNewer(latestVersion, currentVersion),
    };
    if (info.updateAvailable) {
      return { kind: "available", info };
    }
    return { kind: "uptodate", currentVersion };
  } catch (err) {
    return { kind: "error", message: readableError(err) };
  }
}

function versionParts(version: string): number[] {
  return version
    .trim()
    .replace(/^[vV]/, "")
    .split(/[^0-9]+/)
    .filter(Boolean)
    .map((part) => Number.parseInt(part, 10));
}

/** latest 是否比 current 新；数字段比较，`v` 前缀与缺位均兼容。 */
export function versionNewer(latest: string, current: string): boolean {
  const latestParts = versionParts(latest);
  const currentParts = versionParts(current);
  if (latestParts.length === 0) return false;
  const length = Math.max(latestParts.length, currentParts.length);
  for (let index = 0; index < length; index += 1) {
    const a = latestParts[index] ?? 0;
    const b = currentParts[index] ?? 0;
    if (a !== b) return a > b;
  }
  return false;
}

/**
 * 重启应用。只调用 Rust 暴露的无参窄 command，不授予 remote WebView plugin-process。
 * 非桌面态或插件不可用 → 返回 false(调用方据此提示「请手动重启」),不 throw。
 */
export async function relaunchApp(): Promise<boolean> {
  if (!isDesktopRuntimeClient()) return false;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("relaunch_app");
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
 * 把异常收敛成一句可读中文文案。已有中文人话原样透传；其余网络/英文技术串
 * 收敛为友好提示，不把 `fetch failed` 一类底层报错甩给用户(T-412)。
 */
function readableError(err: unknown): string {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : "";
  // 含 CJK 字符 = 上游已给人话文案，直接展示。
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
