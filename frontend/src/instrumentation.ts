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
 *
 * [T-451] **verdict-token 硬门 — sidecar 启动最早期**:
 *   Rust 壳启动时先本地跑 verdict → 仅 allowed=true 才 Ed25519 签 payload → 注入
 *   env CREATOROS_SIDECAR_VERDICT_TOKEN。dynamic import 一个只在 Node runtime 加载的
 *   verdict-token-gate 模块,它 verify 签名/过期/端口/machineId,任一不通过 process.exit(1)。
 *   dynamic import 是必需的:直接 static import node:crypto/fs/path 会让 Next 编译 edge
 *   runtime chunks 时报"Dynamic Code Evaluation not allowed in Edge Runtime"——虽然运行时
 *   永远走不到那分支(NEXT_RUNTIME=nodejs),但 Next 打包时静态分析跨 runtime 一起看。
 */

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // [T-451] 最早期:sidecar 进程刚起来还没挂路由,先验 verdict-token,不通过 exit(1)。
  //   dynamic import → Next 只把此模块编译进 node runtime chunk,edge chunk 天然不见 node:*。
  const { verifyVerdictTokenOrExit } = await import("@/server/verdict-token-gate");
  verifyVerdictTokenOrExit();

  if (process.env.CREATOROS_DESKTOP === "1") {
    // 必须早于任何 storage service / route 创建；失败直接拒绝 sidecar 启动。
    const { installBlobTrustRootFromInheritedFd } = await import(
      "@/server/blob-trust-bootstrap"
    );
    await installBlobTrustRootFromInheritedFd();
  }

  // [T-365/T-362] 桌面态装 sidecar 生命周期守护:SIGTERM 优雅退出(flush PGlite)+ 孤儿自检
  //   (ppid==1 自杀,盖壳崩溃/强退)。dev(next dev)不装——ppid 是终端 shell,SIGINT 归 next 管。
  if (process.env.CREATOROS_DESKTOP === "1") {
    try {
      const { installSidecarLifecycle } = await import("@/server/sidecar-lifecycle");
      installSidecarLifecycle(process as never);
      console.log(
        "[instrumentation] sidecar lifecycle guard installed (SIGTERM drain + orphan check)",
      );
    } catch {
      /* 装不上不阻塞启动(守护是兜底,主线在壳侧 killpg) */
    }
  }
  if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
    try {
      // 正式桌面包只接受 Rust 壳注入的绝对资源目录。开发态未设置时继续使用
      // Playwright 默认缓存；不要用 process.cwd() 回退，否则 Next output tracing 会把
      // 整个工作区误判为运行时资源，连源码、测试和 src-tauri 一起带入发布闭包。
      const bundled = process.env.CREATOROS_BROWSERS_DIR?.trim();
      if (bundled) {
        process.env.PLAYWRIGHT_BROWSERS_PATH = bundled;
        console.log("[instrumentation] bundled Chromium path configured");
      }
    } catch {
      // 设不上就用默认路径,不阻塞启动。
    }
  }

  // [T-535] 壳不能再把 Next 短暂 TCP listen 当成“业务已可用”。只有 verdict 校验、
  // 生命周期守护和其余 instrumentation 全跑完才发固定哨兵；Rust 同时等本哨兵 + TCP。
  console.log("[CreatorOS] SIDECAR_STARTUP_VERIFIED");
}
