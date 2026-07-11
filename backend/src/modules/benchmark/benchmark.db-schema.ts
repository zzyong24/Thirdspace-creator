// [T-212a] Benchmark Drizzle tables — canonical 定义在 shared infra(@creatoros/backend)，
// createDb() 经迁移 0032 建表。本文件是模块内 surface，re-export 保 ONE source of truth
// (同 material-links.db-schema.ts ↔ backend/src/schema/benchmark.ts)。
export { benchmarkSources, benchmarkWorks, BENCHMARK_DDL } from "@creatoros/backend";
