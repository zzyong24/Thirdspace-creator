import { eq, and, asc } from "drizzle-orm";
import type { Db } from "../db";
import { platformAccounts } from "../schema/platform-account";

// Injected dependencies — mirrors project/knowledge repositories so the repo stays
// deterministic (no Date.now / Math.random / fetch inside) and user-scoped.
export interface RepoDeps {
  now: () => string; // ISO-8601 clock (injected for deterministic tests)
  nextId: (prefix: string) => string; // id generator (deterministic in tests)
  userId: string; // owner threaded from RequestContext
}

type AccountRow = typeof platformAccounts.$inferSelect;
type Platform = AccountRow["platform"];
type AccountStatus = AccountRow["status"];

export interface PlatformAccountRepository {
  seedAccounts(rows: AccountRow[]): Promise<void>;
  // list is owner-scoped; optional `platform` narrows to one matrix slot.
  list(filter?: { platform?: Platform }): Promise<AccountRow[]>;
  get(accountId: string): Promise<AccountRow>;
  // create dedups on the UNIQUE (user_id, platform, account_handle): a duplicate
  // registration is idempotent (onConflictDoNothing) and returns the existing row.
  create(input: {
    platform: Platform;
    accountHandle: string;
    secretReference?: string;
    followerBaseline?: number;
  }): Promise<AccountRow>;
  patch(
    accountId: string,
    patch: {
      accountHandle?: string;
      secretReference?: string;
      followerBaseline?: number;
      status?: AccountStatus;
    },
  ): Promise<AccountRow>;
  archive(accountId: string): Promise<AccountRow>;
}

export function createPlatformAccountRepository(
  db: Db,
  deps: RepoDeps,
): PlatformAccountRepository {
  // Owner-scoped read: a row owned by another user is invisible → same
  // "not found" surface project/knowledge repositories use for cross-user / missing.
  async function get(accountId: string): Promise<AccountRow> {
    const rows = await db
      .select()
      .from(platformAccounts)
      .where(
        and(
          eq(platformAccounts.id, accountId),
          eq(platformAccounts.userId, deps.userId),
        ),
      );
    const row = rows[0];
    if (!row) {
      throw new Error(`OwnershipError: account not found: ${accountId}`);
    }
    return row;
  }

  // Owner+platform+handle lookup — used to resolve the existing row after an
  // idempotent onConflictDoNothing create swallowed the duplicate insert.
  async function findByHandle(
    platform: Platform,
    accountHandle: string,
  ): Promise<AccountRow | undefined> {
    const rows = await db
      .select()
      .from(platformAccounts)
      .where(
        and(
          eq(platformAccounts.userId, deps.userId),
          eq(platformAccounts.platform, platform),
          eq(platformAccounts.accountHandle, accountHandle),
        ),
      );
    return rows[0];
  }

  return {
    async seedAccounts(rows) {
      if (rows.length === 0) return;
      await db.insert(platformAccounts).values(rows).onConflictDoNothing();
    },

    async list(filter) {
      const conditions = [eq(platformAccounts.userId, deps.userId)];
      if (filter?.platform !== undefined) {
        conditions.push(eq(platformAccounts.platform, filter.platform));
      }
      return db
        .select()
        .from(platformAccounts)
        .where(and(...conditions))
        .orderBy(asc(platformAccounts.createdAt));
    },

    get,

    async create({ platform, accountHandle, secretReference, followerBaseline }) {
      const ts = deps.now();
      const inserted = await db
        .insert(platformAccounts)
        .values({
          id: deps.nextId("account"),
          userId: deps.userId,
          platform,
          accountHandle,
          secretReference: secretReference ?? null,
          followerBaseline: followerBaseline ?? 0,
          status: "active",
          createdAt: ts,
          updatedAt: ts,
        })
        // Idempotent registration: the UNIQUE (user_id, platform, account_handle)
        // index makes a re-register a no-op rather than a duplicate matrix row.
        .onConflictDoNothing()
        .returning();
      // onConflictDoNothing returns [] when the row already existed → resolve the
      // canonical existing row (same user/platform/handle) so create is idempotent.
      if (inserted[0]) return inserted[0];
      const existing = await findByHandle(platform, accountHandle);
      if (!existing) {
        throw new Error(
          `ConflictError: account upsert lost row: ${platform}/${accountHandle}`,
        );
      }
      return existing;
    },

    async patch(accountId, patch) {
      await get(accountId); // ownership + existence gate
      const set: Partial<AccountRow> = { updatedAt: deps.now() };
      if (patch.accountHandle !== undefined) set.accountHandle = patch.accountHandle;
      if (patch.secretReference !== undefined)
        set.secretReference = patch.secretReference;
      if (patch.followerBaseline !== undefined)
        set.followerBaseline = patch.followerBaseline;
      if (patch.status !== undefined) set.status = patch.status;
      const updated = await db
        .update(platformAccounts)
        .set(set)
        .where(eq(platformAccounts.id, accountId))
        .returning();
      return updated[0]!;
    },

    async archive(accountId) {
      await get(accountId); // ownership + existence gate
      const ts = deps.now();
      const updated = await db
        .update(platformAccounts)
        .set({ status: "archived", updatedAt: ts })
        .where(eq(platformAccounts.id, accountId))
        .returning();
      return updated[0]!;
    },
  };
}
