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
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    setupFiles: ["./src/test/setup.ts"],
  },
});
