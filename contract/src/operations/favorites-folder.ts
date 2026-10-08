import { z } from "zod";
import { defineEndpoint } from "../endpoints";
import { id, paginationQuery } from "../primitives";
import { favoritesFolderResource } from "../resources/favorites-folder";

const folderParams = z.object({ folderId: id });

// [T-235c] 收藏夹登记 CRUD ops(list/create/toggle enabled/remove),照 trend.sources.* 先例。
// 破坏性/状态变更走 POST(同 accounts.archive / trend.sources.toggle 约定)。夹内条目
// (favorites_items)是采集侧内部台账(去重 + 限量进池),不暴露 wire 契约。
export const favoritesFolderOperations = {
  listFavoritesFolders: defineEndpoint({
    id: "favorites.folders.list",
    method: "GET",
    path: "/favorites/folders",
    query: paginationQuery,
    response: favoritesFolderResource,
    isList: true,
    fr: ["FR-FAVORITES-FOLDER-LIST"],
  }),
  createFavoritesFolder: defineEndpoint({
    id: "favorites.folders.create",
    method: "POST",
    path: "/favorites/folders",
    body: z.object({
      accountId:id.optional(),
      expectedMembershipVersion:z.number().int().positive().optional(),
      // 夹名(须与抖音收藏夹同名,首采按名精确匹配回填 collectsId)。
      name: z.string().min(1),
      note: z.string().nullable().optional(),
    }),
    response: favoritesFolderResource,
    fr: ["FR-FAVORITES-FOLDER-CREATE"],
  }),
  toggleFavoritesFolder: defineEndpoint({
    id: "favorites.folders.toggle",
    method: "POST",
    path: "/favorites/folders/:folderId/toggle",
    params: folderParams,
    body: z.object({ enabled: z.boolean() }),
    response: favoritesFolderResource,
    fr: ["FR-FAVORITES-FOLDER-TOGGLE"],
  }),
  removeFavoritesFolder: defineEndpoint({
    id: "favorites.folders.remove",
    method: "POST",
    path: "/favorites/folders/:folderId/remove",
    params: folderParams,
    response: favoritesFolderResource,
    fr: ["FR-FAVORITES-FOLDER-REMOVE"],
  }),
} as const;
