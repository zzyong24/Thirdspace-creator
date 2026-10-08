import {workspaceFilter,workspaceKey} from "../../workspace-scope";
import { and, asc, desc, eq, isNull, type Db } from "@creatoros/backend";
import { favoritesFolders, favoritesItems } from "./favorites.db-schema";
import { OwnershipError,requireAccountId } from "./favorites.errors";

// [T-235c → T-332 S2] Favorites repository —— user+account scoped(userId/accountId baked
// into deps,照 trend-sources 先例)。EVERY 查询 filter eq(userId) AND eq(accountId)
// (strict,SPEC §4.1)/ EVERY insert stamp userId+accountId(repo 不接受调用方显式传号,
// §4.6)。toggle/remove/updateSync 先 ownership-scoped select(叠号门),缺失/跨号 →
// OwnershipError(404)。items 侧:(user, account, aweme_id) 幂等台账(recordItems 只插新)
// + pending→promoted 流转。

export type FavoritesFolderRow = Omit<typeof favoritesFolders.$inferSelect,"groupId"> & {groupId?:string|null};
export type FavoritesItemRow = Omit<typeof favoritesItems.$inferSelect,"groupId"> & {groupId?:string|null};

export interface RepoDeps {
  now: () => string;
  nextId: (prefix: string) => string;
  userId: string; // 所有权边界,构造时 baked in
  // [T-332 S2] 第二属主维度(账号全域隔离)。必填:service 入口经 requireAccountId 收窄后传入。
  accountId: string|null;
  groupId?:string|null;
}

export interface CreateFolderInput {
  name: string;
  note?: string | null;
  enabled?: boolean;
}

export interface RecordItemInput {
  folderId: string;
  awemeId: string;
  title: string;
  authorNickname: string;
  url: string;
}

export interface FavoritesRepository {
  listFolders(query: {
    limit: number;
    offset: number;
  }): Promise<{ rows: FavoritesFolderRow[]; total: number }>;
  /** 采集用:列该号(deps.accountId,strict)enabled 的收藏夹。 */
  listEnabledFolders(): Promise<FavoritesFolderRow[]>;
  /** 幂等 create:同 (user, account, name) 已存在 → 更新展示字段/enabled 并返回既有(不新建)。 */
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
  /** 幂等落台账:按 (user_id, account_id, aweme_id) 去重,只插新;返回真写入条数。 */
  recordItems(items: RecordItemInput[]): Promise<{ recordedNew: number }>;
  /** 待进池条目(status=pending,createdAt 升序 = 先收藏先进池),限量。该号 strict。 */
  listPendingItems(limit: number): Promise<FavoritesItemRow[]>;
  /** 进池流转:status→promoted + candidate_id 溯源(ownership gate)。 */
  markItemPromoted(itemId: string, candidateId: string): Promise<FavoritesItemRow>;

  // ── [T-235d-distill] 蒸馏链落点(与进池 status 正交:一条收藏既是跟拍候选,又可判知识) ──
  /** 待入蒸馏链条目(distill_status IS NULL,createdAt 升序 = 先收藏先蒸),限量。该号 strict。 */
  listItemsForDistill(limit: number,collectorAccountOnly?:boolean): Promise<FavoritesItemRow[]>;
  /** 落逐字稿(他人作品独立落点,不建 project artifact;ownership gate)。 */
  saveTranscript(itemId: string, transcript: string): Promise<FavoritesItemRow>;
  /** 落判库裁决 + 蒸馏产物(distill_status + distill_result;ownership gate)。 */
  saveDistillVerdict(
    itemId: string,
    verdict: { status: string; result: Record<string, unknown> },
  ): Promise<FavoritesItemRow>;
  /** 知识确认门待采纳读面(distill_status='knowledge',updatedAt 降序 = 新蒸的先看),限量。该号 strict。 */
  listDistillPending(limit: number): Promise<FavoritesItemRow[]>;
}

export function createFavoritesRepository(
  db: Db,
  deps: RepoDeps,
): FavoritesRepository {
  return {
    async listFolders({ limit, offset }) {
      // [T-332 S2] strict:无条件叠号门(无「无号 → 全量」退化)。
      const where = and(
        eq(favoritesFolders.userId, deps.userId),
        workspaceFilter(favoritesFolders,workspaceKey(deps)),
      );
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

    async listEnabledFolders() {
      requireAccountId(deps.accountId,"真实收藏采集账号");
      const where = and(
        eq(favoritesFolders.userId, deps.userId),
        workspaceFilter(favoritesFolders,workspaceKey(deps)),
        eq(favoritesFolders.enabled, true),
        eq(favoritesFolders.accountId,requireAccountId(deps.accountId)),
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
          // [T-332 S2] stamp 当前号(repo 不接受调用方显式传号,§4.6)。
          accountId: requireAccountId(deps.accountId),
          groupId: deps.groupId??null,
          name: input.name,
          collectsId: null, // 首采按名匹配回填(登记时用户只知道夹名)
          note: input.note ?? null,
          enabled: input.enabled ?? true,
          lastSyncedAt: null,
          createdAt: nowIso,
          updatedAt: nowIso,
        })
        // [T-326 DATA-H02 → T-332 S2] 幂等:命中 ux_favorites_folders_identity_v2
        // (user, account, name)(迁移 0041)→ 更新展示字段/enabled(不冒重复夹;collectsId
        // 保留既有匹配)。不同号可各自登记同名夹(第二账号不再复用/改写第一账号的登记);
        // account_id 已 NOT NULL(0042),NULL 桶不复存在。
        .onConflictDoNothing()
        .returning();
      const owned=inserted[0]??(await db.select().from(favoritesFolders).where(and(eq(favoritesFolders.userId,deps.userId), workspaceFilter(favoritesFolders,workspaceKey(deps)), eq(favoritesFolders.accountId,requireAccountId(deps.accountId)), eq(favoritesFolders.name,input.name))).limit(1))[0];
      if(!owned)throw new OwnershipError("研究资料不存在");
      const [updated]=await db.update(favoritesFolders).set({
            note: input.note ?? null,
            enabled: input.enabled ?? true,
            updatedAt: nowIso,
      }).where(and(eq(favoritesFolders.userId,deps.userId), workspaceFilter(favoritesFolders,workspaceKey(deps)), eq(favoritesFolders.accountId,requireAccountId(deps.accountId)), eq(favoritesFolders.name,input.name),eq(favoritesFolders.id,owned.id))).returning();
      if(!updated)throw new OwnershipError("研究资料不存在");
      return updated;
    },

    async setFolderEnabled(folderId, enabled) {
      await requireOwnedFolder(db, deps, folderId);
      const updated = await db
        .update(favoritesFolders)
        .set({ enabled, updatedAt: deps.now() })
        .where(
          and(
            eq(favoritesFolders.userId, deps.userId),
            workspaceFilter(favoritesFolders,workspaceKey(deps)),
            eq(favoritesFolders.id, folderId),
          ),
        )
        .returning();
      return updated[0]!;
    },

    async removeFolder(folderId) {
      const row = await requireOwnedFolder(db, deps, folderId);
      await db
        .delete(favoritesFolders)
        .where(
          and(
            eq(favoritesFolders.userId, deps.userId),
            workspaceFilter(favoritesFolders,workspaceKey(deps)),
            eq(favoritesFolders.id, folderId),
          ),
        );
      return row;
    },

    async updateFolderSync(folderId, patch) {
      const parent=await requireOwnedFolder(db, deps, folderId);if(parent.accountId!==requireAccountId(deps.accountId))throw new OwnershipError("收藏采集账号与登记目标不一致");
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
            workspaceFilter(favoritesFolders,workspaceKey(deps)),
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
        const parent=deps.groupId?await requireOwnedFolder(db,deps,item.folderId):await requireOwnedFolder(db,deps,item.folderId).catch(()=>null);if(parent&&parent.accountId!==requireAccountId(deps.accountId))throw new OwnershipError("收藏采集账号与登记目标不一致");
        if (!item.awemeId) continue; // 无锚脏条目跳过(不落台账)
        const inserted = await db
          .insert(favoritesItems)
          .values({
            id: deps.nextId("favitm"),
            userId: deps.userId,
            // [T-332 S2] stamp 当前号(repo 不接受调用方显式传号,§4.6)。
            accountId: requireAccountId(deps.accountId),
          groupId: parent?.groupId??deps.groupId??null,
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
          // [T-326 DATA-H02 → T-332 S2] 幂等:命中 ux_favorites_items_identity_v2
          // (user, account, aweme_id)(迁移 0041)→ 跳过(同号已记过的视频不重复进台账/
          // 进池)。不同号收藏同一视频各记一行(账号隔离,第二账号不再被第一账号的台账
          // 吞掉);account_id 已 NOT NULL(0042)。
          .onConflictDoNothing()
          .returning({ id: favoritesItems.id });
        if (inserted.length > 0) recordedNew += 1;
      }
      return { recordedNew };
    },

    async listPendingItems(limit) {
      // [T-332 S2] strict:无条件叠号门。
      const where = and(
        eq(favoritesItems.userId, deps.userId),
        workspaceFilter(favoritesItems,workspaceKey(deps)),
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
      // [T-332 S2] by-id 读写叠号一致性门(跨号 → OwnershipError 404,§4.5)。
      const rows = await db
        .select()
        .from(favoritesItems)
        .where(
          and(
            eq(favoritesItems.userId, deps.userId),
            workspaceFilter(favoritesItems,workspaceKey(deps)),
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
            workspaceFilter(favoritesItems,workspaceKey(deps)),
            eq(favoritesItems.id, itemId),
          ),
        )
        .returning();
      return updated[0]!;
    },

    // ── [T-235d-distill] 蒸馏链落点 ──
    async listItemsForDistill(limit,collectorAccountOnly=false) {
      // [T-332 S2] strict:无条件叠号门。
      const where = and(
        eq(favoritesItems.userId, deps.userId),
        workspaceFilter(favoritesItems,workspaceKey(deps)),
        isNull(favoritesItems.distillStatus),
        collectorAccountOnly?eq(favoritesItems.accountId,requireAccountId(deps.accountId,"真实蒸馏任务账号")):undefined,
      );
      return db
        .select()
        .from(favoritesItems)
        .where(where)
        .orderBy(asc(favoritesItems.createdAt)) // 先收藏先蒸(FIFO,可预期)
        .limit(limit);
    },

    async saveTranscript(itemId, transcript) {
      const updated = await db
        .update(favoritesItems)
        .set({ transcript, updatedAt: deps.now() })
        .where(
          and(
            eq(favoritesItems.userId, deps.userId),
            workspaceFilter(favoritesItems,workspaceKey(deps)),
            eq(favoritesItems.id, itemId),
          ),
        )
        .returning();
      if (!updated[0]) {
        throw new OwnershipError(
          `OwnershipError: favorites item not found: ${itemId}`,
        );
      }
      return updated[0];
    },

    async saveDistillVerdict(itemId, verdict) {
      const updated = await db
        .update(favoritesItems)
        .set({
          distillStatus: verdict.status,
          distillResult: verdict.result,
          updatedAt: deps.now(),
        })
        .where(
          and(
            eq(favoritesItems.userId, deps.userId),
            workspaceFilter(favoritesItems,workspaceKey(deps)),
            eq(favoritesItems.id, itemId),
          ),
        )
        .returning();
      if (!updated[0]) {
        throw new OwnershipError(
          `OwnershipError: favorites item not found: ${itemId}`,
        );
      }
      return updated[0];
    },

    async listDistillPending(limit) {
      // [T-332 S2] strict:无条件叠号门。
      const where = and(
        eq(favoritesItems.userId, deps.userId),
        workspaceFilter(favoritesItems,workspaceKey(deps)),
        eq(favoritesItems.distillStatus, "knowledge"),
      );
      return db
        .select()
        .from(favoritesItems)
        .where(where)
        .orderBy(desc(favoritesItems.updatedAt)) // 新蒸的先看(确认门读面)
        .limit(limit);
    },
  };
}

// Ownership gate:跨用户 / 跨号 / 未知 id select 空 → OwnershipError(404,不泄露行存在;
// [T-332 S2] by-id 读叠号一致性门,SPEC §4.5)。
async function requireOwnedFolder(
  db: Db,
  deps: Pick<RepoDeps, "userId" | "accountId">,
  folderId: string,
): Promise<FavoritesFolderRow> {
  const rows = await db
    .select()
    .from(favoritesFolders)
    .where(
      and(
        eq(favoritesFolders.userId, deps.userId),
        workspaceFilter(favoritesFolders,workspaceKey(deps)),
        eq(favoritesFolders.id, folderId),
      ),
    );
  const row = rows[0];
  if (!row) {
    throw new OwnershipError(
      `OwnershipError: favorites folder not found: ${folderId}`,
    );
  }
  return row;
}
