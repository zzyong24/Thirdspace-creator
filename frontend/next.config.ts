import type { NextConfig } from "next";
import { resolve } from "node:path";

// [T-147 P1] 桌面壳(Tauri)只在打桌面包时才需要 standalone 产物;设 CREATOROS_DESKTOP=1
// 触发。additive:web 运行(pnpm dev / pnpm build)不设该 env,行为完全不变。
const isDesktopBuild = process.env.CREATOROS_DESKTOP === "1";

const nextConfig: NextConfig = {
  turbopack: {
    root: resolve(import.meta.dirname, ".."),
  },
  // [T-147 P1] 桌面 sidecar 需要自包含的 next standalone 产物(server.js + traced
  // node_modules)。原型已验:此产物含 PGlite 的 postgres.wasm/.data(被 output file
  // tracing 自动带入),`node server.js` 端到端 200 + PGlite 落盘通过。仅桌面构建开启,
  // 不影响现有 web build/dev。
  ...(isDesktopBuild ? { output: "standalone" as const } : {}),
  // [T-565] 桌面安装目录是只读产品运行时，不是 Next 的数据目录。默认 ISR /
  // Image Optimizer 会在 `.next/cache` 回写文件，既污染版本化 runtime，也会让首启
  // 看起来仍在处理小文件。桌面包改用 Next 已有的内存缓存；web 部署保持原默认值。
  ...(isDesktopBuild
    ? { experimental: { isrFlushToDisk: false } }
    : {}),
  // [T-147 P1] drizzle 迁移是 non-JS 数据文件(meta/_journal.json + *.sql),Next output
  // tracing 只 trace import 的 JS,不带这些 → standalone 里 db.ts 找不到迁移目录会 500。
  // 原型踩坑已定位并修复:显式 include backend/drizzle 全量。仅桌面构建注入,web build 留空无害。
  outputFileTracingIncludes: isDesktopBuild
    ? { "/**": ["../backend/drizzle/**/*"] }
    : {},
  // [T-147 P1] 排除桌面壳自身:standalone 默认把 frontend/ 整棵源树 trace 进产物,会把
  // src-tauri/(含 Rust target/ 数百 MB + 上一次 sidecar 组装)自引用式塞进来,导致体积爆炸
  // + resources 拷贝踩 target 权限。显式排除 src-tauri。仅桌面构建。
  outputFileTracingExcludes: isDesktopBuild
    ? {
        "/**": [
          "src-tauri/**/*",
          // T-565 closure RAT:运行代码中的 cwd/data-dir fallback 会让 NFT 保守地追踪整个
          // frontend 工作区；这些目录已经编译进 .next，且现有 build-sidecar 随后也会
          // 删除它们。提前从 trace 排除，避免把源码、测试、文档和构建脚本带进发布闭包。
          "src/**/*",
          "tests/**/*",
          "docs/**/*",
          "specs/**/*",
          "scripts/**/*",
        ],
      }
    : {},
  // [T-415 P0-B] handshake fail-closed 烘焙开关:桌面**打包产物**把 `CREATOROS_HANDSHAKE_REQUIRED`
  //   内联成字面量 "1"(Next env 在 build 时替换 `process.env.CREATOROS_HANDSHAKE_REQUIRED`,
  //   裸 `node server.js` 运行时省不掉、改不了)。loopback-guard 据此在**缺握手 token**时 fail-CLOSED
  //   (堵「解压 sidecar 裸跑」白嫖);web/dev 不烘焙 → undefined → fail-open,行为完全不变(不变式)。
  //   诚实边界:明文 sidecar 的检查终可 patch,此层是把白嫖从「一条命令」抬到「须 patch 混淆产物」。
  env: isDesktopBuild ? { CREATOROS_HANDSHAKE_REQUIRED: "1" } : {},
  // pglite ships WASM; keep it external so the server bundler requires it at
  // runtime instead of trying to bundle the WASM asset.
  serverExternalPackages: [
    "@electric-sql/pglite",
    // node-postgres (P1 runtime driver) — keep external so its native/dynamic deps resolve
    // at server runtime instead of being bundled.
    "pg",
    // Phase 3 Agent Runtime — Vercel AI SDK + providers are lazily imported via
    // @creatoros/ai-worker (topic-task-adapter / research-runner / …). Keep external so the
    // dynamic import resolves at server runtime instead of being bundled into the Next
    // server output. (The Claude Agent SDK external was removed when 全程 Vercel AI SDK
    // landed — 产品定位 §9 铁律1: no Claude Agent SDK anywhere in the frontend.)
    "ai",
    "@ai-sdk/openai",
    "@ai-sdk/anthropic",
    "@ai-sdk/deepseek",
    "@ai-sdk/openai-compatible",
    // [T-173/T-469] 采集/扫码用 Playwright(douyin-cdp/web-capture 动态 import；CLI 只做确定性 fs 扫描)。
    //   保持外置:不让 Next 打包(playwright 有 ESM 入口 → 打包报 "require() resolves to a EcmaScript
    //   module")。运行时从 node_modules 解析(桌面包由 build-sidecar bundlePlaywright 实拷进去)。
    "playwright",
    "playwright-core",
    "@playwright/test",
    // [T-254c] video.render executor 运行时 require.resolve 定位 hyperframes CLI
    // (dist/cli.js,子进程 spawn 跑渲染)与 gsap 单文件构建(注入渲染模板)。保持外置:
    // 不打包、运行时从 node_modules 解析(Turbopack 对动态 resolve 会直接 Build Error,
    // 必须字面量 specifier + 外置)。
    "hyperframes",
    "gsap",
    // [T-313] Pi 受控自主运行时:pi-engine 运行时**深导入** `@earendil-works/pi-coding-agent`
    //   的 `dist/core/*.js`(绕 barrel 的 TUI/main;确定性 fs 定位)+ `@earendil-works/pi-ai`
    //   自建 provider。保持外置:不让 Next 打包(纯 ESM + typebox/undici/photon-node 动态加载)。
    //   桌面包由 build-sidecar **实拷完整包**(含 dist 全树 + 依赖树:pi-agent-core/pi-ai/pi-tui/
    //   photon-node/openai/@anthropic-ai/sdk 等);Next tracing 对深 file-URL import 会漏 → 主 agent
    //   打包时按 playwright/hyperframes 同款「覆盖 Next-traced 残缺版」机制实拷(本任务不做打包)。
    "@earendil-works/pi-coding-agent",
    "@earendil-works/pi-ai",
    "@earendil-works/pi-agent-core",
    "@earendil-works/pi-tui",
  ],
};

export default nextConfig;
