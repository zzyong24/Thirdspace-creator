// [T-235b] TrendSources Drizzle table — canonical 定义在 shared infra(@creatoros/backend),
// createDb() 经迁移 0035 建表。本文件是模块内 surface,re-export 保 ONE source of truth
// (同 benchmark.db-schema.ts ↔ backend/src/schema/benchmark.ts)。
export { trendSources, TREND_SOURCES_DDL } from "@creatoros/backend";
