import { and, desc, eq, type Db } from "@creatoros/backend";
import { platformAccounts } from "./platform-account.db-schema";
import { OwnershipError, ConflictError } from "./platform-account.errors";

// PlatformAccount repository (foundation §5.2) — user-scoped queries ONLY. `userId`
// is baked into deps (mirrors the candidate/monetization repos): EVERY query filters
// `eq(platformAccounts.userId, deps.userId)` and EVERY insert stamps
// `userId: deps.userId`. A getAccount(id) throws OwnershipError when the scoped select
// returns empty — never revealing cross-user existence (foundation §2: 404 not 403).
//
// createAccount surfaces the (user_id, platform, account_handle) unique-index
// violation as a ConflictError (duplicate 矩阵号 registration). archiveAccount is a
// SOFT flip (status → 'archived', no row delete) so historical Publication / metric
// attribution is preserved (§7.1 归账号 intent). existsOwnedActiveAccount backs the
// cross-module binding guard (assertOwnedAccount on the service).

export type PlatformAccountRow = typeof platformAccounts.$inferSelect;

export interface RepoDeps {
  now: () => string; // ISO-8601 clock (injected for deterministic tests)
  nextId: (prefix: string) => string; // id generator (deterministic in tests)
  userId: string; // the ownership boundary, baked in at construction
}

export interface CreateAccountInput {
  platform: string;
  accountHandle: string;
  secretReference?: string | null;
  followerBaseline?: number;
}

export interface ListAccountsQuery {
  platform?: string;
  limit?: number;
  offset?: number;
}

export interface UpdateAccountInput {
  accountHandle?: string;
  secretReference?: string | null;
  followerBaseline?: number;
  status?: "active" | "archived";
}

export interface PlatformAccountRepository {
  // Fixture hydration (insert with explicit user_id already on the row).
  seedAccounts(rows: PlatformAccountRow[]): Promise<void>;

  createAccount(input: CreateAccountInput): Promise<PlatformAccountRow>;
  listAccounts(
    query: ListAccountsQuery,
  ): Promise<{ rows: PlatformAccountRow[]; total: number }>;
  getAccount(accountId: string): Promise<PlatformAccountRow>;
  findByPlatformHandle(
    platform: string,
    accountHandle: string,
  ): Promise<PlatformAccountRow | null>;
  updateAccount(
    accountId: string,
    patch: UpdateAccountInput,
  ): Promise<PlatformAccountRow>;
  archiveAccount(accountId: string): Promise<PlatformAccountRow>;
  // Scoped boolean: row exists, userId matches, platform matches, status='active'.
  existsOwnedActiveAccount(
    accountId: string,
    platform: string,
  ): Promise<boolean>;
}

// pglite raises a unique-violation as a Postgres error with code "23505". Detect it
// structurally (not by message) so the dup surfaces as a 409 ConflictError.
function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const code = (err as { code?: unknown }).code;
  if (code === "23505") return true;
  // pglite wraps the cause; check the message as a fallback for the unique index name.
  const message = (err as { message?: unknown }).message;
  return (
    typeof message === "string" &&
    message.includes("platform_accounts_handle_ux")
  );
}

export function createPlatformAccountRepository(
  db: Db,
  deps: RepoDeps,
): PlatformAccountRepository {
  async function getAccount(accountId: string): Promise<PlatformAccountRow> {
    const rows = await db
      .select()
      .from(platformAccounts)
      .where(
        and(
          eq(platformAccounts.userId, deps.userId),
          eq(platformAccounts.id, accountId),
        ),
      );
    const row = rows[0];
    if (!row) {
      throw new OwnershipError(
        `OwnershipError: platform account not found: ${accountId}`,
      );
    }
    return row;
  }

  return {
    async seedAccounts(rows) {
      if (rows.length === 0) return;
      await db.insert(platformAccounts).values(rows).onConflictDoNothing();
    },

    async createAccount(input) {
      try {
        const inserted = await db
          .insert(platformAccounts)
          .values({
            id: deps.nextId("acct"),
            userId: deps.userId,
            platform: input.platform,
            accountHandle: input.accountHandle,
            secretReference: input.secretReference ?? null,
            followerBaseline: input.followerBaseline ?? 0,
            status: "active",
            createdAt: deps.now(),
            updatedAt: deps.now(),
          })
          .returning();
        return inserted[0]!;
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new ConflictError(
            `ConflictError: account already registered for ${input.platform} ${input.accountHandle}`,
          );
        }
        throw err;
      }
    },

    async listAccounts({ platform, limit = 100, offset = 0 }) {
      const filters = [eq(platformAccounts.userId, deps.userId)];
      if (platform) filters.push(eq(platformAccounts.platform, platform));
      const where = and(...filters);
      const rows = await db
        .select()
        .from(platformAccounts)
        .where(where)
        .orderBy(desc(platformAccounts.createdAt))
        .limit(limit)
        .offset(offset);
      const all = await db
        .select({ id: platformAccounts.id })
        .from(platformAccounts)
        .where(where);
      return { rows, total: all.length };
    },

    getAccount,

    async findByPlatformHandle(platform, accountHandle) {
      const rows = await db
        .select()
        .from(platformAccounts)
        .where(
          and(
            eq(platformAccounts.userId, deps.userId),
            eq(platformAccounts.platform, platform),
            eq(platformAccounts.accountHandle, accountHandle),
          ),
        )
        .limit(1);
      return rows[0] ?? null;
    },

    async updateAccount(accountId, patch) {
      await getAccount(accountId); // ownership gate before any write
      const set: Record<string, unknown> = { updatedAt: deps.now() };
      if (patch.accountHandle !== undefined)
        set.accountHandle = patch.accountHandle;
      if (patch.secretReference !== undefined)
        set.secretReference = patch.secretReference;
      if (patch.followerBaseline !== undefined)
        set.followerBaseline = patch.followerBaseline;
      if (patch.status !== undefined) set.status = patch.status;
      try {
        const updated = await db
          .update(platformAccounts)
          .set(set)
          .where(
            and(
              eq(platformAccounts.userId, deps.userId),
              eq(platformAccounts.id, accountId),
            ),
          )
          .returning();
        return updated[0]!;
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new ConflictError(
            `ConflictError: account handle already registered on this platform`,
          );
        }
        throw err;
      }
    },

    async archiveAccount(accountId) {
      await getAccount(accountId); // ownership gate
      const updated = await db
        .update(platformAccounts)
        .set({ status: "archived", updatedAt: deps.now() })
        .where(
          and(
            eq(platformAccounts.userId, deps.userId),
            eq(platformAccounts.id, accountId),
          ),
        )
        .returning();
      return updated[0]!;
    },

    async existsOwnedActiveAccount(accountId, platform) {
      const rows = await db
        .select({ id: platformAccounts.id })
        .from(platformAccounts)
        .where(
          and(
            eq(platformAccounts.userId, deps.userId),
            eq(platformAccounts.id, accountId),
            eq(platformAccounts.platform, platform),
            eq(platformAccounts.status, "active"),
          ),
        )
        .limit(1);
      return rows.length > 0;
    },
  };
}
