import { defineConfig } from "vitest/config";
// PGlite 初始化/清理与测试执行均保留至少两分钟；局部更长预算和产品任务 deadline 不变。
export default defineConfig({ test: { include: ["src/**/*.test.ts"], maxWorkers: 2, testTimeout: 120_000, hookTimeout: 120_000 } });
