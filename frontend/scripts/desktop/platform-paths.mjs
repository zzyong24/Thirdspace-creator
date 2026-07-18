// [T-372 W-core W2] 桌面打包的平台路径纯函数(从 build-sidecar.mjs 抽出,便于平台分支单测)。
//
// 背景:bundleChromiumBrowser 此前写死「非 darwin 直接跳过」—— Windows 打包机上 Chromium
// 永远进不了包,装机用户首次扫码/渲染就要现场下载 341MB(违背 T-284「视频渲染永不下载」拍板)。
// 这里把 Playwright 浏览器缓存根目录按平台映射出来(与 playwright-core
// registry(`registryDirectory`)的默认约定一致):
//   macOS  : ~/Library/Caches/ms-playwright
//   Windows: %LOCALAPPDATA%\ms-playwright(LOCALAPPDATA 缺省回退 <home>\AppData\Local)
//   Linux  : $XDG_CACHE_HOME/ms-playwright(缺省回退 ~/.cache/ms-playwright)
// 未知平台 → null(调用方 warn + 跳过随包,回落运行时下载兜底,不阻塞打包)。
//
// 纯函数注入 platform/env/home —— macOS 上即可对 win32 分支跑单测(本机无 Windows 实机,
// SPEC §14 Part II「平台分支单测」的落点)。

import { join } from "node:path";

/**
 * Playwright 浏览器缓存根目录(按平台)。
 * @param {NodeJS.Platform | string} plat  平台标识(process.platform)
 * @param {Record<string, string | undefined>} env  环境变量(读 LOCALAPPDATA / XDG_CACHE_HOME)
 * @param {string} home  用户 home 目录(os.homedir())
 * @returns {string | null} 缓存根目录;未知平台返回 null
 */
export function playwrightBrowsersCacheRoot(plat, env, home) {
  if (plat === "darwin") return join(home, "Library", "Caches", "ms-playwright");
  if (plat === "win32") {
    const localAppData = env.LOCALAPPDATA?.trim()
      ? env.LOCALAPPDATA
      : join(home, "AppData", "Local");
    return join(localAppData, "ms-playwright");
  }
  if (plat === "linux") {
    const cacheHome = env.XDG_CACHE_HOME?.trim() ? env.XDG_CACHE_HOME : join(home, ".cache");
    return join(cacheHome, "ms-playwright");
  }
  return null;
}
