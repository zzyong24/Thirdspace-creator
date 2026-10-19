import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const emptyModule = fileURLToPath(
  new URL("./src/test/empty-module.ts", import.meta.url),
);

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    css: true,
    environment: "jsdom",
    // 重集成测(__module_integration__ / persistence-client.ctx / auth-routes)每例
    // 现建一个完整 persistence-client(跑全部 pglite 迁移 + 装配 services),隔离下 ~3-5s;
    // 127 文件并发时会撞穿默认 5s → 假超时。给足余量(仍能抓真 hang,只是更慢才失败)。
    testTimeout: 20000,
    hookTimeout: 20000,
    // knowledge 域重集成测在满套件高负载下偶发 `Timeout starting forks runner`(fork 池
    // 启动型 flaky,单文件跑必绿、失败文件轮换)→ retry 2 次消除,不掩盖真失败(真 hang 仍 3 连败)。
    retry: 2,
    // `server-only` / `client-only` throw outside the Next build conditions;
    // stub them for tests. The guards stay active in the Turbopack build.
    alias: {
      "server-only": emptyModule,
      "client-only": emptyModule,
    },
    exclude: [
      "**/node_modules/**",
      "**/.next/**",
      "tests/e2e/**",
      "tests/visual/**",
      "tests/accessibility/**",
    ],
    // [T-164] 桌面打包脚本(scripts/desktop)的 .mjs 单测也纳入发现范围(纯增量,不动现有 src 规则)。
    include: ["src/**/*.{test,spec}.{ts,tsx}", "scripts/**/*.{test,spec}.mjs"],
    setupFiles: ["./src/test/setup.ts"],
  },
});
