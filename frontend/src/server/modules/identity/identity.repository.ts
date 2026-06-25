import { and, eq, type Db } from "@creatoros/backend";
import { users, sessions } from "./identity.db-schema";

// Identity repository (Module 00, Task 3). Mirrors the Projects exemplar shape
// (backend/src/repositories/project-repository.ts): a factory over the shared
// pglite Db + deterministic deps (injected clock + id generator — no Date.now /
// Math.random in this layer; foundation §1 determinism in the deterministic
// substrate).
//
// Identity's repo is the ONE place that *resolves* identity, so its lookups key
// on email / token hash / explicit userId rather than a fixed ctx.userId dep.
// But every method that touches a *session row by user* still filters
// eq(sessions.userId, userId) — a user can never revoke or read another user's
// session (foundation §1/§2, SPEC §10/§20). getUserById throws OwnershipError
// (→ 404, SPEC §14) for an unknown id, mirroring the Projects exemplar's
// not-found-as-OwnershipError convention (the proper error class lands in
// Task 4's identity.errors.ts; this layer signals it by message until then).

export interface RepoDeps {
  now: () => string; // ISO-8601 clock (injected for deterministic tests)
  nextId: (prefix: string) => string; // id generator (deterministic in tests)
}

export type UserRow = typeof users.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;

// The editable profile columns of a `users` row (every key optional; only the
// provided keys are written). Mirrors the contract `PATCH /me` body plus the
// service-stamped `updatedAt`.
export interface UserProfilePatch {
  displayName?: string;
  locale?: string;
  updatedAt: string;
}

export interface IdentityRepository {
  seedUser(row: UserRow): Promise<void>;
  createUser(row: UserRow): Promise<UserRow>;
  findUserByEmail(email: string): Promise<UserRow | undefined>;
  getUserById(userId: string): Promise<UserRow>;
  updateUser(userId: string, patch: UserProfilePatch): Promise<UserRow>;
  createSession(input: {
    userId: string;
    tokenHash: string;
    expiresAt: string;
  }): Promise<SessionRow>;
  findActiveSessionByTokenHash(
    tokenHash: string,
  ): Promise<SessionRow | undefined>;
  revokeSession(tokenHash: string, userId: string): Promise<void>;
  revokeAllForUser(userId: string): Promise<void>;
}

export function createIdentityRepository(
  db: Db,
  deps: RepoDeps,
): IdentityRepository {
  return {
    async seedUser(row) {
      // Idempotent seed: a re-run (e.g. a second buildPersistence()) is a no-op.
      await db.insert(users).values(row).onConflictDoNothing();
    },

    async createUser(row) {
      // Real INSERT (NOT onConflictDoNothing): a duplicate email must surface so
      // the service can raise EmailTakenError (409). The service guards email
      // uniqueness first via findUserByEmail; the DB's users_email_uk unique
      // index is the backstop for a race. `.returning()` yields the new row.
      const inserted = await db.insert(users).values(row).returning();
      return inserted[0]!;
    },

    async findUserByEmail(email) {
      const rows = await db
        .select()
        .from(users)
        .where(eq(users.email, email));
      return rows[0];
    },

    async getUserById(userId) {
      const rows = await db.select().from(users).where(eq(users.id, userId));
      const row = rows[0];
      if (!row) throw new Error(`OwnershipError: user not found: ${userId}`);
      return row;
    },

    async updateUser(userId, patch) {
      // User-scoped UPDATE: the WHERE clause pins the row to `userId` so a
      // patch can never reach another tenant's row. Only the provided profile
      // keys are written; `updatedAt` is always stamped (service-supplied). The
      // `.returning()` row is the refreshed DTO source.
      const typedSet: Partial<UserRow> = { updatedAt: patch.updatedAt };
      if (patch.displayName !== undefined) typedSet.displayName = patch.displayName;
      if (patch.locale !== undefined) typedSet.locale = patch.locale;
      const updated = await db
        .update(users)
        .set(typedSet)
        .where(eq(users.id, userId))
        .returning();
      const row = updated[0];
      if (!row) throw new Error(`OwnershipError: user not found: ${userId}`);
      return row;
    },

    async createSession({ userId, tokenHash, expiresAt }) {
      const inserted = await db
        .insert(sessions)
        .values({
          id: deps.nextId("session"),
          userId,
          tokenHash,
          createdAt: deps.now(),
          expiresAt,
          revokedAt: null,
        })
        .returning();
      return inserted[0]!;
    },

    async findActiveSessionByTokenHash(tokenHash) {
      const rows = await db
        .select()
        .from(sessions)
        .where(eq(sessions.tokenHash, tokenHash));
      const row = rows[0];
      if (!row) return undefined;
      // Active = not revoked and not past its expiry (ISO-8601 text compares
      // lexicographically === chronologically for same-offset timestamps).
      if (row.revokedAt !== null) return undefined;
      if (row.expiresAt <= deps.now()) return undefined;
      return row;
    },

    async revokeSession(tokenHash, userId) {
      // User-scoped: the AND on userId means a cross-user call matches no rows.
      await db
        .update(sessions)
        .set({ revokedAt: deps.now() })
        .where(
          and(eq(sessions.tokenHash, tokenHash), eq(sessions.userId, userId)),
        );
    },

    async revokeAllForUser(userId) {
      await db
        .update(sessions)
        .set({ revokedAt: deps.now() })
        .where(eq(sessions.userId, userId));
    },
  };
}
