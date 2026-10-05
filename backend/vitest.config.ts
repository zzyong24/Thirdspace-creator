import { defineConfig } from "vitest/config";
// 后端真实 PGlite 迁移与服务组合测试统一使用有限执行预算；不改变产品、模型或 runner 的 deadline。
export default defineConfig({ test: { include: ["src/**/*.test.ts"], testTimeout: 30_000 } });
