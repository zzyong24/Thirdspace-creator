import type { RequestContext } from "@creatoros/contract";
import type { Db } from "@creatoros/backend";
import {
  createFavoritesRepository,
  type FavoritesRepository,
  type RepoDeps,
  type FavoritesItemRow,
} from "./favorites.repository";
import {
  toFavoritesFolderDto,
  type FavoritesFolderResource,
} from "./favorites.schema";
import { ValidationError } from "./favorites.errors";

// [T-235c] Favorites service(foundation §5.3,照 trend-sources 先例)—— 每个公开方法 (ctx, …),
// 构 repo bound to ctx.userId 使 scoping 结构化。account_id 从 ctx.accountId stamp(按号隔离)。
// 收藏夹登记 CRUD(list/create/toggle/remove)+ 采集侧只读/写口:
//   listEnabledFolders(采集只读投影)/ updateFolderSync(首采按名匹配回填 collectsId)/
//   recordItems(aweme_id 幂等台账,只插新)/ listPendingItems + markItemPromoted(限量进池流转)。

export interface ServiceDeps {
  db: Db;
  now: () => string;
  nextId: (prefix: string) => string;
}

export interface CreateFavoritesFolderInput {
  name: string;
  note?: string | null;
  enabled?: boolean;
}

/** 采集用投影(collector 只需 id/名字/已匹配的 collectsId)。 */
export interface EnabledFavoritesFolder {
  id: string;
  accountId: string | null;
  name: string;
  collectsId: string | null;
  note: string | null;
}

/** 采集落台账的一条输入(collector 从 DouyinFavoriteVideo 映射)。 */
export interface RecordFavoriteItemInput {
  awemeId: string;
  title: string;
  authorNickname: string;
  url: string;
}

/** 待进池条目投影(collector promote 用)。 */
export interface PendingFavoriteItem {
  id: string;
  folderId: string;
  awemeId: string;
  title: string;
  authorNickname: string;
  url: string;
}

export interface FavoritesService {
  listFolders(
    ctx: RequestContext,
    query: { page: number; pageSize: number },
  ): Promise<{ rows: FavoritesFolderResource[]; total: number }>;
  createFolder(
    ctx: RequestContext,
    input: CreateFavoritesFolderInput,
  ): Promise<FavoritesFolderResource>;
  toggleFolder(
    ctx: RequestContext,
    folderId: string,
    enabled: boolean,
  ): Promise<FavoritesFolderResource>;
  removeFolder(
    ctx: RequestContext,
    folderId: string,
  ): Promise<FavoritesFolderResource>;
  /** 采集用:列该 ctx(含号)enabled 的收藏夹(投影)。 */
  listEnabledFolders(ctx: RequestContext): Promise<EnabledFavoritesFolder[]>;
  /** 首采按名匹配回填 collectsId + lastSyncedAt(collector 写)。 */
  updateFolderSync(
    ctx: RequestContext,
    folderId: string,
    patch: { collectsId?: string | null; lastSyncedAt?: string | null },
  ): Promise<FavoritesFolderResource>;
  /** 幂等落台账((user, aweme_id) 去重只插新);返回真写入条数。 */
  recordItems(
    ctx: RequestContext,
    folderId: string,
    items: RecordFavoriteItemInput[],
  ): Promise<{ recordedNew: number }>;
  /** 待进池条目(pending,FIFO,限量;collector 每 run ≤N 防灌库)。 */
  listPendingItems(
    ctx: RequestContext,
    limit: number,
  ): Promise<PendingFavoriteItem[]>;
  /** 进池流转:status→promoted + candidate_id 溯源。 */
  markItemPromoted(
    ctx: RequestContext,
    itemId: string,
    candidateId: string,
  ): Promise<void>;
}

function guardCreate(input: CreateFavoritesFolderInput): void {
  const name = (input.name ?? "").trim();
  if (!name) {
    throw new ValidationError("ValidationError: name must be non-empty");
  }
  if (name.length > 60) {
    // 抖音收藏夹名有长度上限;超长多半是误粘贴,登记时就挡住(匹配也必失败)。
    throw new ValidationError(
      `ValidationError: 收藏夹名过长(${name.length} 字,上限 60)`,
    );
  }
}

function toPendingItem(row: FavoritesItemRow): PendingFavoriteItem {
  return {
    id: row.id,
    folderId: row.folderId,
    awemeId: row.awemeId,
    title: row.title,
    authorNickname: row.authorNickname,
    url: row.url,
  };
}

export function createFavoritesService(deps: ServiceDeps): FavoritesService {
  const { db, now, nextId } = deps;

  function repoFor(ctx: RequestContext): FavoritesRepository {
    const repoDeps: RepoDeps = { now, nextId, userId: ctx.userId };
    return createFavoritesRepository(db, repoDeps);
  }

  return {
    async listFolders(ctx, query) {
      const { rows, total } = await repoFor(ctx).listFolders(
        ctx.accountId ?? null,
        {
          limit: query.pageSize,
          offset: (query.page - 1) * query.pageSize,
        },
      );
      return { rows: rows.map(toFavoritesFolderDto), total };
    },

    async createFolder(ctx, input) {
      guardCreate(input);
      const row = await repoFor(ctx).createFolder({
        accountId: ctx.accountId ?? null,
        name: input.name.trim(), // 幂等锚:trim 后同名 = 同一夹(抖音夹名精确匹配)
        note: input.note ?? null,
        enabled: input.enabled,
      });
      return toFavoritesFolderDto(row);
    },

    async toggleFolder(ctx, folderId, enabled) {
      const row = await repoFor(ctx).setFolderEnabled(folderId, enabled);
      return toFavoritesFolderDto(row);
    },

    async removeFolder(ctx, folderId) {
      const row = await repoFor(ctx).removeFolder(folderId);
      return toFavoritesFolderDto(row);
    },

    async listEnabledFolders(ctx) {
      const rows = await repoFor(ctx).listEnabledFolders(ctx.accountId ?? null);
      return rows.map((r) => ({
        id: r.id,
        accountId: r.accountId ?? null,
        name: r.name,
        collectsId: r.collectsId ?? null,
        note: r.note ?? null,
      }));
    },

    async updateFolderSync(ctx, folderId, patch) {
      const row = await repoFor(ctx).updateFolderSync(folderId, patch);
      return toFavoritesFolderDto(row);
    },

    async recordItems(ctx, folderId, items) {
      return repoFor(ctx).recordItems(
        items.map((item) => ({
          accountId: ctx.accountId ?? null,
          folderId,
          awemeId: item.awemeId,
          title: item.title,
          authorNickname: item.authorNickname,
          url: item.url,
        })),
      );
    },

    async listPendingItems(ctx, limit) {
      const rows = await repoFor(ctx).listPendingItems(
        ctx.accountId ?? null,
        limit,
      );
      return rows.map(toPendingItem);
    },

    async markItemPromoted(ctx, itemId, candidateId) {
      await repoFor(ctx).markItemPromoted(itemId, candidateId);
    },
  };
}
