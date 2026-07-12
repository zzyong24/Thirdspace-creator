// [T-235c] Favorites 模块 schema surface —— re-export 契约 DTO + Row→DTO mapper(DTO 由显式
// mapper 构建,NEVER Drizzle row 直出;同 trend-sources / candidate 约定)。
import { favoritesFolderResource } from "@creatoros/contract";
import type { FavoritesFolderRow } from "./favorites.repository";

export { favoritesFolderResource };

export type FavoritesFolderResource = (typeof favoritesFolderResource)["_output"];

export function toFavoritesFolderDto(
  row: FavoritesFolderRow,
): FavoritesFolderResource {
  return {
    id: row.id,
    userId: row.userId,
    accountId: row.accountId ?? null,
    name: row.name,
    collectsId: row.collectsId ?? null,
    note: row.note ?? null,
    enabled: row.enabled,
    lastSyncedAt: row.lastSyncedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
