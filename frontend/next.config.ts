import type { NextConfig } from "next";
import { resolve } from "node:path";

// [T-063a] IA 收敛:旧一级路由 → 新宿主 tab 的永久重定向(HTTP 308,浏览器/爬虫
// 拿到真 3xx;app 层各 page 的 permanentRedirect 保留作 client 导航兜底)。
// SPEC §4-3:301 永久保留,书签/深链不断。带参深链(?sort= 等)不随迁,落 tab 即可。
const LEGACY_ROUTE_REDIRECTS = [
  { source: "/topics", destination: "/projects?tab=candidates" },
  { source: "/publishing", destination: "/projects?tab=published" },
  { source: "/calendar", destination: "/projects?tab=schedule" },
  { source: "/assets", destination: "/library?tab=assets" },
  { source: "/knowledge", destination: "/library?tab=knowledge" },
  { source: "/experience", destination: "/library?tab=experience" },
  { source: "/positioning", destination: "/settings?tab=positioning" },
  { source: "/calibration", destination: "/settings?tab=calibration" },
  { source: "/automations", destination: "/settings?tab=automations" },
  { source: "/accounts", destination: "/settings?tab=account" },
] as const;

const nextConfig: NextConfig = {
  turbopack: {
    root: resolve(import.meta.dirname, ".."),
  },
  async redirects() {
    return LEGACY_ROUTE_REDIRECTS.map((r) => ({ ...r, permanent: true }));
  },
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
