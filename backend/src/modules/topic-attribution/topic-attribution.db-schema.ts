// [T-235d] TopicAttribution Drizzle table — canonical 定义在 shared infra(@creatoros/backend),
// createDb() 经迁移 0036 建表。本文件是模块内 surface,re-export 保 ONE source of truth
// (同 benchmark.db-schema.ts / trend-sources.db-schema.ts ↔ backend/src/schema/*)。
export { topicAttributions, TOPIC_ATTRIBUTION_DDL } from "@creatoros/backend";
