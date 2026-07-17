import { and, eq, type Db } from "@creatoros/backend";
import { browserSessions } from "./browser-sessions.db-schema";

// [T-370a] Browser Sessions repository —— user-scoped(userId baked into deps,照 favorites
// 先例但更小)。EVERY 查询 filter eq(userId) / EVERY insert stamp userId。**只存密文**:
// 本层不碰 crypto(state_encrypted 由 service 层加密后传入,service 保证绝不传明文)。
// (user_id, scope_kind, scope_key) 唯一(迁移 0047)→ upsertState 先查后写 + 竞态撞唯一索引
// catch 后重查更新(同 scheduling.createJob 幂等范式,轻量版)。

export type BrowserSessionRow = typeof browserSessions.$inferSelect;

export interface RepoDeps {
  now: () => string;
  nextId: (prefix: string) => string;
  userId: string; // 所有权边界,构造时 baked in(web 保管库为用户级域名维,无 accountId)
}

export interface BrowserSessionsRepository {
  /** 取一条(该 user + scope);无 → null。 */
  getState(scopeKind: string, scopeKey: string): Promise<BrowserSessionRow | null>;
  /** upsert(唯一键 (user_id, scope_kind, scope_key)):已存在 → 更新密文 + updated_at。 */
  upsertState(
    scopeKind: string,
    scopeKey: string,
    stateEncrypted: string,
  ): Promise<BrowserSessionRow>;
  /** 删一条(登出/移除保管库会话);不存在 → 幂等 false。 */
  deleteState(scopeKind: string, scopeKey: string): Promise<boolean>;
  /** 列该 user 某 scope_kind 的全部 scope_key(保管库列表用;不解密、不返密文)。 */
  listScopeKeys(
    scopeKind: string,
  ): Promise<Array<{ scopeKey: string; updatedAt: string }>>;
}

export function createBrowserSessionsRepository(
  db: Db,
  deps: RepoDeps,
): BrowserSessionsRepository {
  const scopeFilter = (scopeKind: string, scopeKey: string) =>
    and(
      eq(browserSessions.userId, deps.userId),
      eq(browserSessions.scopeKind, scopeKind),
      eq(browserSessions.scopeKey, scopeKey),
    );

  const getState = async (
    scopeKind: string,
    scopeKey: string,
  ): Promise<BrowserSessionRow | null> => {
    const rows = await db
      .select()
      .from(browserSessions)
      .where(scopeFilter(scopeKind, scopeKey))
      .limit(1);
    return rows[0] ?? null;
  };

  return {
    getState,

    upsertState: async (scopeKind, scopeKey, stateEncrypted) => {
      const now = deps.now();
      const existing = await getState(scopeKind, scopeKey);
      if (existing) {
        const rows = await db
          .update(browserSessions)
          .set({ stateEncrypted, updatedAt: now })
          .where(scopeFilter(scopeKind, scopeKey))
          .returning();
        return rows[0]!;
      }
      try {
        const rows = await db
          .insert(browserSessions)
          .values({
            id: deps.nextId("bsess"),
            userId: deps.userId,
            scopeKind,
            scopeKey,
            stateEncrypted,
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        return rows[0]!;
      } catch (err) {
        // 并发插入撞唯一索引(TOCTOU)→ 改走更新(该行此刻必已存在)。
        const rows = await db
          .update(browserSessions)
          .set({ stateEncrypted, updatedAt: now })
          .where(scopeFilter(scopeKind, scopeKey))
          .returning();
        if (rows[0]) return rows[0];
        throw err;
      }
    },

    deleteState: async (scopeKind, scopeKey) => {
      const rows = await db
        .delete(browserSessions)
        .where(scopeFilter(scopeKind, scopeKey))
        .returning({ id: browserSessions.id });
      return rows.length > 0;
    },

    listScopeKeys: async (scopeKind) => {
      const rows = await db
        .select({
          scopeKey: browserSessions.scopeKey,
          updatedAt: browserSessions.updatedAt,
        })
        .from(browserSessions)
        .where(
          and(
            eq(browserSessions.userId, deps.userId),
            eq(browserSessions.scopeKind, scopeKind),
          ),
        );
      return rows;
    },
  };
}
