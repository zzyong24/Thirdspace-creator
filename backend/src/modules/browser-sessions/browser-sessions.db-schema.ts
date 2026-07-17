// [T-370a] browser_sessions Drizzle table — canonical 定义在 shared infra(@creatoros/backend),
// createDb() 经迁移 0047 建表。本文件是模块内 surface,re-export 保 ONE source of truth
// (同 favorites.db-schema.ts ↔ backend/src/schema/favorites.ts)。
export { browserSessions, BROWSER_SESSIONS_DDL } from "@creatoros/backend";
