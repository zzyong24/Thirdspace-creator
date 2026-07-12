import { and, asc, desc, eq, type Db } from "@creatoros/backend";
import { favoritesFolders, favoritesItems } from "./favorites.db-schema";
import { OwnershipError } from "./favorites.errors";

// [T-235c] Favorites repository —— user-scoped(userId baked into deps,照 trend-sources 先例)。
// EVERY 查询 filter eq(userId) / EVERY insert stamp userId。toggle/remove/updateSync 先
// ownership-scoped select,缺失 → OwnershipError(404,不泄露跨用户行存在)。account_id 从输入
// stamp(按号隔离)。items 侧:aweme_id 幂等台账(recordItems 只插新)+ pending→promoted 流转。

export type FavoritesFolderRow = typeof favoritesFolders.$inferSelect;
export type FavoritesItemRow = typeof favoritesItems.$inferSelect;

export interface RepoDeps {
  now: () => string;
  nextId: (prefix: string) => string;
  userId: string; // 所有权边界,构造时 baked in
}

export interface CreateFolderInput {
  accountId?: string | null;
  name: string;
  note?: string | null;
  enabled?: boolean;
}

export interface RecordItemInput {
  accountId?: string | null;
  folderId: string;
  awemeId: string;
  title: string;
  authorNickname: string;
  url: string;
}

export interface FavoritesRepository {
  listFolders(
    accountId: string | null,
    query: { limit: number; offset: number },
  ): Promise<{ rows: FavoritesFolderRow[]; total: number }>;
  /** 采集用:列该号(accountId=null → 全量)enabled 的收藏夹。 */
  listEnabledFolders(accountId: string | null): Promise<FavoritesFolderRow[]>;
  /** 幂等 create:同 (user, name) 已存在 → 更新展示字段/enabled 并返回既有(不新建)。 */
  createFolder(input: CreateFolderInput): Promise<FavoritesFolderRow>;
  /** 切 enabled(ownership gate;不存在 → OwnershipError 404)。 */
  setFolderEnabled(folderId: string, enabled: boolean): Promise<FavoritesFolderRow>;
  /** 删收藏夹登记(ownership gate;items 台账保留溯源)。 */
  removeFolder(folderId: string): Promise<FavoritesFolderRow>;
  /** 首采匹配回填 collects_id / 最近采集时刻(ownership gate)。 */
  updateFolderSync(
    folderId: string,
    patch: { collectsId?: string | null; lastSyncedAt?: string | null },
  ): Promise<FavoritesFolderRow>;
  /** 幂等落台账:按 (user_id, aweme_id) 去重,只插新;返回真写入条数。 */
  recordItems(items: RecordItemInput[]): Promise<{ recordedNew: number }>;
  /** 待进池条目(status=pending,createdAt 升序 = 先收藏先进池),限量。 */
  listPendingItems(accountId: string | null, limit: number): Promise<FavoritesItemRow[]>;
  /** 进池流转:status→promoted + candidate_id 溯源(ownership gate)。 */
  markItemPromoted(itemId: string, candidateId: string): Promise<FavoritesItemRow>;
}

export function createFavoritesRepository(
  db: Db,
  deps: RepoDeps,
): FavoritesRepository {
  return {
    async listFolders(accountId, { limit, offset }) {
      const where = accountId
        ? and(
            eq(favoritesFolders.userId, deps.userId),
            eq(favoritesFolders.accountId, accountId),
          )
        : eq(favoritesFolders.userId, deps.userId);
      const rows = await db
        .select()
        .from(favoritesFolders)
        .where(where)
        .orderBy(desc(favoritesFolders.createdAt))
        .limit(limit)
        .offset(offset);
      const all = await db
        .select({ id: favoritesFolders.id })
        .from(favoritesFolders)
        .where(where);
      return { rows, total: all.length };
    },

    async listEnabledFolders(accountId) {
      const where = accountId
        ? and(
            eq(favoritesFolders.userId, deps.userId),
            eq(favoritesFolders.accountId, accountId),
            eq(favoritesFolders.enabled, true),
          )
        : and(
            eq(favoritesFolders.userId, deps.userId),
            eq(favoritesFolders.enabled, true),
          );
      return db.select().from(favoritesFolders).where(where);
    },

    async createFolder(input) {
      const nowIso = deps.now();
      const inserted = await db
        .insert(favoritesFolders)
        .values({
          id: deps.nextId("favfld"),
          userId: deps.userId,
          accountId: input.accountId ?? null,
          name: input.name,
          collectsId: null, // 首采按名匹配回填(登记时用户只知道夹名)
          note: input.note ?? null,
          enabled: input.enabled ?? true,
          lastSyncedAt: null,
          createdAt: nowIso,
          updatedAt: nowIso,
        })
        // 幂等:命中 (user, name) 唯一 → 更新展示字段/enabled(不冒重复夹;collectsId 保留既有匹配)。
        .onConflictDoUpdate({
          target: [favoritesFolders.userId, favoritesFolders.name],
          set: {
            note: input.note ?? null,
            enabled: input.enabled ?? true,
            updatedAt: nowIso,
          },
        })
        .returning();
      return inserted[0]!;
    },

    async setFolderEnabled(folderId, enabled) {
      await requireOwnedFolder(db, deps.userId, folderId);
      const updated = await db
        .update(favoritesFolders)
        .set({ enabled, updatedAt: deps.now() })
        .where(
          and(
            eq(favoritesFolders.userId, deps.userId),
            eq(favoritesFolders.id, folderId),
          ),
        )
        .returning();
      return updated[0]!;
    },

    async removeFolder(folderId) {
      const row = await requireOwnedFolder(db, deps.userId, folderId);
      await db
        .delete(favoritesFolders)
        .where(
          and(
            eq(favoritesFolders.userId, deps.userId),
            eq(favoritesFolders.id, folderId),
          ),
        );
      return row;
    },

    async updateFolderSync(folderId, patch) {
      await requireOwnedFolder(db, deps.userId, folderId);
      const set: Partial<typeof favoritesFolders.$inferInsert> = {
        updatedAt: deps.now(),
      };
      if (patch.collectsId !== undefined) set.collectsId = patch.collectsId;
      if (patch.lastSyncedAt !== undefined) set.lastSyncedAt = patch.lastSyncedAt;
      const updated = await db
        .update(favoritesFolders)
        .set(set)
        .where(
          and(
            eq(favoritesFolders.userId, deps.userId),
            eq(favoritesFolders.id, folderId),
          ),
        )
        .returning();
      return updated[0]!;
    },

    async recordItems(items) {
      let recordedNew = 0;
      const nowIso = deps.now();
      for (const item of items) {
        if (!item.awemeId) continue; // 无锚脏条目跳过(不落台账)
        const inserted = await db
          .insert(favoritesItems)
          .values({
            id: deps.nextId("favitm"),
            userId: deps.userId,
            accountId: item.accountId ?? null,
            folderId: item.folderId,
            awemeId: item.awemeId,
            title: item.title,
            authorNickname: item.authorNickname,
            url: item.url,
            status: "pending",
            candidateId: null,
            createdAt: nowIso,
            updatedAt: nowIso,
          })
          // 幂等:命中 (user, aweme_id) 唯一 → 跳过(已记过的视频不重复进台账/进池)。
          .onConflictDoNothing({
            target: [favoritesItems.userId, favoritesItems.awemeId],
          })
          .returning({ id: favoritesItems.id });
        if (inserted.length > 0) recordedNew += 1;
      }
      return { recordedNew };
    },

    async listPendingItems(accountId, limit) {
      const where = accountId
        ? and(
            eq(favoritesItems.userId, deps.userId),
            eq(favoritesItems.accountId, accountId),
            eq(favoritesItems.status, "pending"),
          )
        : and(
            eq(favoritesItems.userId, deps.userId),
            eq(favoritesItems.status, "pending"),
          );
      return db
        .select()
        .from(favoritesItems)
        .where(where)
        .orderBy(asc(favoritesItems.createdAt)) // 先收藏先进池(FIFO,可预期)
        .limit(limit);
    },

    async markItemPromoted(itemId, candidateId) {
      const rows = await db
        .select()
        .from(favoritesItems)
        .where(
          and(
            eq(favoritesItems.userId, deps.userId),
            eq(favoritesItems.id, itemId),
          ),
        );
      if (!rows[0]) {
        throw new OwnershipError(
          `OwnershipError: favorites item not found: ${itemId}`,
        );
      }
      const updated = await db
        .update(favoritesItems)
        .set({ status: "promoted", candidateId, updatedAt: deps.now() })
        .where(
          and(
            eq(favoritesItems.userId, deps.userId),
            eq(favoritesItems.id, itemId),
          ),
        )
        .returning();
      return updated[0]!;
    },
  };
}

// Ownership gate:跨用户 / 未知 id select 空 → OwnershipError(404,不泄露行存在)。
async function requireOwnedFolder(
  db: Db,
  userId: string,
  folderId: string,
): Promise<FavoritesFolderRow> {
  const rows = await db
    .select()
    .from(favoritesFolders)
    .where(
      and(eq(favoritesFolders.userId, userId), eq(favoritesFolders.id, folderId)),
    );
  const row = rows[0];
  if (!row) {
    throw new OwnershipError(
      `OwnershipError: favorites folder not found: ${folderId}`,
    );
  }
  return row;
}
