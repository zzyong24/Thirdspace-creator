/**
 * [T-284] sidecar 启动钩子 —— 把 `PLAYWRIGHT_BROWSERS_PATH` 指向**随 app 打包的 Chromium**
 * (build-sidecar 实拷到 `sidecar/frontend/browsers/`)。
 *
 * 病根:打包版 sidecar 的 playwright 在混淆 bundle runtime 里,对默认缓存
 * `~/Library/Caches/ms-playwright` 的浏览器路径解析失效——机器上明明有 chromium-<rev>、版本还对,
 * `executablePath()` 却指向找不到的路径 → 视频渲染报「Chromium 未就绪」;运行时自动下载也因同层
 * bundle 问题没跑起来。正解(用户拍板):Chromium 随包发货 + 这里显式设 `PLAYWRIGHT_BROWSERS_PATH`
 * → `executablePath()` 稳定命中 bundle 内浏览器,永不下载、永不「未就绪」。
 *
 * `register()` 在 Next server 启动时跑**一次**,早于任何路由用 playwright(douyin 采集 / 视频渲染)
 * → PLAYWRIGHT_BROWSERS_PATH 在 playwright registry 首次创建前就绪。
 *   - 仅 nodejs runtime(edge 无 playwright);已显式设过 → 不覆盖(尊重外部配置)。
 *   - dev / 未打包(无 browsers 目录)→ 不设 → 用默认缓存路径(开发机装过即可)。
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.PLAYWRIGHT_BROWSERS_PATH) return;
  try {
    const path = await import("node:path");
    const fs = await import("node:fs");
    // 打包版 server.js 从 sidecar/frontend 跑,故 process.cwd()=…/sidecar/frontend;
    //   Chromium 实拷在其下 browsers/。dev 没有这个目录 → 跳过(留默认路径)。
    const bundled = path.join(process.cwd(), "browsers");
    if (fs.existsSync(bundled)) {
      process.env.PLAYWRIGHT_BROWSERS_PATH = bundled;
      // eslint-disable-next-line no-console
      console.log(
        `[instrumentation] PLAYWRIGHT_BROWSERS_PATH → ${bundled}(随包 Chromium,视频渲染免下载)`,
      );
    }
  } catch {
    // 设不上就用默认路径,不阻塞启动。
  }
}
