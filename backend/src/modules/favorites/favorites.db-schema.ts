// [T-235c] Favorites Drizzle tables — canonical 定义在 shared infra(@creatoros/backend),
// createDb() 经迁移 0038 建表。本文件是模块内 surface,re-export 保 ONE source of truth
// (同 trend-sources.db-schema.ts ↔ backend/src/schema/trend-sources.ts)。
export {
  favoritesFolders,
  favoritesItems,
  FAVORITES_DDL,
} from "@creatoros/backend";
