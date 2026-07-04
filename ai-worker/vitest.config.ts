import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["smoke/**"],
    // 与 frontend 对齐:满套件高负载下 fork 池启动型 flaky → retry 2 次消除(真失败仍 3 连败)。
    retry: 2,
  },
});
