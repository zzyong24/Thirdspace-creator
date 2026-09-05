// 自起 Chromium + 持久化 profile(.auth/),不连用户现成浏览器(connectOverCDP 那条路对真实
// [T-299] 解析已打包的**全量** chromium 可执行路径。根因:headless 的 launchPersistentContext 默认
//   找 chrome-headless-shell(playwright 的独立 headless 浏览器),而打包只 bundle 了全量 chromium-<rev>
//   (bundleChromiumBrowser,T-284),没打 headless_shell → 装机版采集(评论/收藏夹/选题,都 headless)
//   崩「Executable doesn't exist …chromium_headless_shell-…」。修:显式传 executablePath=全量 chromium
//   → headless 也用全量(--headless),复用已打包的 341MB,不再多打 ~100MB。优先确定性扫
//   PLAYWRIGHT_BROWSERS_PATH(打包混淆 runtime 稳,复用视频渲染 locateBundledChromium 同款),
//   回落 chromium.executablePath()(dev 系统缓存)。都取不到 → undefined(交回 playwright 默认,
//   dev 环境有 headless_shell 不受影响)。
export async function resolveChromiumExecutable(): Promise<string | undefined> {
  const { join } = await import("node:path");
  const { readdir, stat } = await import("node:fs/promises");
  const browsersDir =
    process.env.PLAYWRIGHT_BROWSERS_PATH || join(process.cwd(), "browsers");
  try {
    const entries = await readdir(browsersDir).catch(() => [] as string[]);
    const dir = entries
      .filter((e) => /^chromium-\d+$/.test(e))
      .sort((a, b) => Number(b.slice(9)) - Number(a.slice(9)))[0];
    if (dir) {
      const rels = [
        "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
        "chrome-mac/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
        "chrome-linux/chrome",
        "chrome-win/chrome.exe",
      ];
      for (const rel of rels) {
        const p = join(browsersDir, dir, rel);
        const st = await stat(p).catch(() => null);
        if (st?.isFile()) return p;
      }
    }
  } catch {
    // fall through → executablePath 兜底
  }
  try {
    const { chromium } = await import("@playwright/test");
    const { existsSync } = await import("node:fs");
    const p = chromium.executablePath();
    if (p && existsSync(p)) return p;
  } catch {
    // ignore → undefined(交回 playwright 默认)
  }
  return undefined;
}

// [T-307] 统一浏览器选择:**优先系统 Chrome**(channel:"chrome" —— 登录 profile 兼容 + OAuth 友好),
//   起不来回落**已打包全量 chromium**(executablePath,绕缺失的 chrome-headless-shell)。
//   `chromium.launch` 与 `launchPersistentContext` 都经此双试——关键是保证「谁写登录态、谁读登录态」
//   用**同一个浏览器**:否则系统 Chrome 用钥匙串加密的 cookie,Chromium-for-Testing 解不开 → 读不到登录态。
export interface LaunchWithBrowserDeps {
  desktop?: boolean;
  resolveBundledExecutable?: () => Promise<string | undefined>;
}

const BROWSER_RUNTIME_UNAVAILABLE_MESSAGE =
  "CreatorOS 无法启动浏览器：本机 Chrome 与 CreatorOS 内置浏览器均不可用。请重新安装当前版本；若仍失败，请在“帮助与反馈”导出诊断日志。";

export class BrowserRuntimeUnavailableError extends Error {
  constructor(cause?: unknown) {
    super(BROWSER_RUNTIME_UNAVAILABLE_MESSAGE, cause === undefined ? undefined : { cause });
    this.name = "BrowserRuntimeUnavailableError";
  }
}

export async function launchWithBrowser<T>(
  run: (sel: { channel?: string; executablePath?: string }) => Promise<T>,
  deps: LaunchWithBrowserDeps = {},
): Promise<T> {
  let systemChromeFailure: unknown;
  try {
    return await run({ channel: "chrome" });
  } catch (error) {
    systemChromeFailure = error;
  }

  const resolveBundledExecutable =
    deps.resolveBundledExecutable ?? resolveChromiumExecutable;
  const executablePath = await resolveBundledExecutable();
  if (executablePath) {
    try {
      return await run({ executablePath });
    } catch (bundledFailure) {
      console.error("[browser-runtime] system Chrome and bundled Chromium failed", {
        systemChromeFailure,
        bundledFailure,
      });
      throw new BrowserRuntimeUnavailableError(bundledFailure);
    }
  }

  if (deps.desktop ?? process.env.CREATOROS_DESKTOP === "1") {
    console.error("[browser-runtime] bundled Chromium executable is missing", {
      systemChromeFailure,
      browsersDir: process.env.CREATOROS_BROWSERS_DIR,
    });
    throw new BrowserRuntimeUnavailableError(systemChromeFailure);
  }

  // 本地开发环境保留 Playwright 默认缓存，方便贡献者不打完整桌面 runtime 调试。
  return run({});
}
