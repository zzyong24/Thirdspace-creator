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

export interface IdentityRepository {
  seedUser(row: UserRow): Promise<void>;
  findUserByEmail(email: string): Promise<UserRow | undefined>;
  getUserById(userId: string): Promise<UserRow>;
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
