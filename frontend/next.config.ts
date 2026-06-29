import type { NextConfig } from "next";
import { resolve } from "node:path";

const nextConfig: NextConfig = {
  turbopack: {
    root: resolve(import.meta.dirname, ".."),
  },
  // pglite ships WASM; keep it external so the server bundler requires it at
  // runtime instead of trying to bundle the WASM asset.
  serverExternalPackages: [
    "@electric-sql/pglite",
    // node-postgres (P1 runtime driver) — keep external so its native/dynamic deps resolve
    // at server runtime instead of being bundled.
    "pg",
    // The Claude Agent SDK spawns the Claude Code binary as a subprocess — keep it out
    // of the bundle so its runtime resolves at server runtime (research-runner.ts).
    "@anthropic-ai/claude-agent-sdk",
    // Phase 3 Agent Runtime — Vercel AI SDK + providers are lazily imported via
    // @creatoros/ai-worker (topic-task-adapter). Keep external so the dynamic import
    // resolves at server runtime instead of being bundled into the Next server output.
    "ai",
    "@ai-sdk/openai",
    "@ai-sdk/anthropic",
    "@ai-sdk/deepseek",
    "@ai-sdk/openai-compatible",
  ],
};

export default nextConfig;
