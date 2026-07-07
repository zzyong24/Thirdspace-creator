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
    ? { "/**": ["src-tauri/**/*"] }
    : {},
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
  ],
};

export default nextConfig;
