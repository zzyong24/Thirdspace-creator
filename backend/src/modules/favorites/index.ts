// [T-235c] Favorites module(指定抖音收藏夹采集 —— 收藏夹跟拍信号源)—— ONLY
// public entry(foundation §1)。composite transport 只经本文件 import(不碰内部)。

export {
  createFavoritesService,
  type FavoritesService,
  type CreateFavoritesFolderInput,
  type EnabledFavoritesFolder,
  type RecordFavoriteItemInput,
  type PendingFavoriteItem,
} from "./favorites.service";

export {
  createFavoritesRepository,
  type FavoritesRepository,
  type RepoDeps,
  type FavoritesFolderRow,
  type FavoritesItemRow,
} from "./favorites.repository";

export {
  createFavoritesTransport,
  FAVORITES_OP_IDS,
} from "./favorites.transport";

export { FAVORITES_DDL } from "./favorites.db-schema";

export { OwnershipError, ValidationError } from "./favorites.errors";

export {
  favoritesFolderResource,
  toFavoritesFolderDto,
  type FavoritesFolderResource,
} from "./favorites.schema";
