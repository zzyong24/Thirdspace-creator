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
    // The Claude Agent SDK spawns the Claude Code binary as a subprocess — keep it out
    // of the bundle so its runtime resolves at server runtime (research-runner.ts).
    "@anthropic-ai/claude-agent-sdk",
  ],
};

export default nextConfig;
