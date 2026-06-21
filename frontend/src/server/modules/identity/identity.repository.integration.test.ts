import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import {
  createIdentityRepository,
  type IdentityRepository,
} from "./identity.repository";

// Raw pglite client type, derived from createDb's return so the frontend test
// needs no direct @electric-sql/pglite dependency (it is a transitive dep of
// @creatoros/backend, not declared in the frontend package).
type PgliteClient = Awaited<ReturnType<typeof createDb>>["client"];

// Task 1 schema slice: after createDb() the identity tables + unique indexes
// exist (IDENTITY_DDL is applied alongside PROJECTS_DDL). Raw inserts round-trip;
// the email + token-hash unique indexes reject duplicates. Driven through the raw
// pglite client (parameterized SQL) so this slice asserts only the DDL, no repo.

const FIXED_NOW = "2026-06-13T10:00:00+08:00";
const FUTURE = "2099-01-01T00:00:00+08:00";

let client: PgliteClient;
let db: Db;

beforeEach(async () => {
  ({ client, db } = await createDb()); // fresh in-memory pglite per test
});

async function insertUser(over: Partial<Record<string, string>> = {}) {
  const row = {
    id: over.id ?? "user-a",
    email: over.email ?? "a@creatoros.local",
    display_name: over.display_name ?? "User A",
    timezone: over.timezone ?? "Asia/Shanghai",
    locale: over.locale ?? "zh-CN",
    password_hash: over.password_hash ?? "salt:hash",
    created_at: over.created_at ?? FIXED_NOW,
    updated_at: over.updated_at ?? FIXED_NOW,
  };
  await client.query(
    `INSERT INTO users (id, email, display_name, timezone, locale, password_hash, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      row.id,
      row.email,
      row.display_name,
      row.timezone,
      row.locale,
      row.password_hash,
      row.created_at,
      row.updated_at,
    ],
  );
  return row;
}

async function insertSession(over: Partial<Record<string, string | null>> = {}) {
  const row = {
    id: (over.id as string) ?? "session-a",
    user_id: (over.user_id as string) ?? "user-a",
    token_hash: (over.token_hash as string) ?? "token-hash-a",
    created_at: (over.created_at as string) ?? FIXED_NOW,
    expires_at: (over.expires_at as string) ?? FUTURE,
    revoked_at: (over.revoked_at as string | null) ?? null,
  };
  await client.query(
    `INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at, revoked_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [row.id, row.user_id, row.token_hash, row.created_at, row.expires_at, row.revoked_at],
  );
  return row;
}

describe("identity db-schema (pglite, Task 1 slice)", () => {
  it("round-trips a raw users then sessions insert", async () => {
    await insertUser();
    await insertSession();

    const users = await client.query<{ id: string; email: string }>(
      `SELECT id, email FROM users`,
    );
    expect(users.rows.map((r: { id: string }) => r.id)).toContain("user-a");

    const sessions = await client.query<{
      id: string;
      user_id: string;
      token_hash: string;
    }>(`SELECT id, user_id, token_hash FROM sessions`);
    expect(sessions.rows[0]?.user_id).toBe("user-a");
    expect(sessions.rows[0]?.token_hash).toBe("token-hash-a");
  });

  it("users_email_uk rejects a duplicate email", async () => {
    await insertUser({ id: "user-a", email: "dup@creatoros.local" });
    await expect(
      insertUser({ id: "user-b", email: "dup@creatoros.local" }),
    ).rejects.toThrow();
  });

  it("sessions_token_hash_uk rejects a duplicate token hash", async () => {
    await insertUser();
    await insertSession({ id: "session-a", token_hash: "dup-token-hash" });
    await expect(
      insertSession({ id: "session-b", token_hash: "dup-token-hash" }),
    ).rejects.toThrow();
  });
});

// Task 3 slice: the user-scoped identity repository over the same pglite store.
// Deterministic deps — a fixed clock + a counter-based id generator — so every
// assertion is reproducible (no Date.now / Math.random in the repo layer).

const PAST = "2000-01-01T00:00:00+08:00";

function makeDeps() {
  let n = 0;
  return {
    now: () => FIXED_NOW,
    nextId: (prefix: string) => `${prefix}-${++n}`,
  };
}

const USER_A = {
  id: "user-a",
  email: "a@creatoros.local",
  displayName: "User A",
  timezone: "Asia/Shanghai",
  locale: "zh-CN",
  passwordHash: "salt:hash-a",
  createdAt: FIXED_NOW,
  updatedAt: FIXED_NOW,
};
const USER_B = {
  id: "user-b",
  email: "b@creatoros.local",
  displayName: "User B",
  timezone: "Asia/Shanghai",
  locale: "zh-CN",
  passwordHash: "salt:hash-b",
  createdAt: FIXED_NOW,
  updatedAt: FIXED_NOW,
};

describe("identity repository (pglite, Task 3 slice)", () => {
  let repo: IdentityRepository;

  beforeEach(async () => {
    repo = createIdentityRepository(db, makeDeps());
    await repo.seedUser(USER_A);
    await repo.seedUser(USER_B);
  });

  it("seedUser is idempotent (onConflictDoNothing)", async () => {
    await repo.seedUser(USER_A); // second call — no throw, no duplicate
    const found = await repo.findUserByEmail(USER_A.email);
    expect(found?.id).toBe(USER_A.id);
    expect(found?.displayName).toBe("User A");
  });

  it("findUserByEmail is exact-match", async () => {
    expect((await repo.findUserByEmail(USER_A.email))?.id).toBe("user-a");
    expect(await repo.findUserByEmail("A@CREATOROS.LOCAL")).toBeUndefined();
    expect(await repo.findUserByEmail("nobody@creatoros.local")).toBeUndefined();
  });

  it("getUserById throws OwnershipError for an unknown id", async () => {
    expect((await repo.getUserById("user-a")).id).toBe("user-a");
    await expect(repo.getUserById("user-ghost")).rejects.toThrow(/OwnershipError/);
  });

  it("revokeSession is user-scoped: B cannot revoke A's session", async () => {
    const sessionA = await repo.createSession({
      userId: USER_A.id,
      tokenHash: "hash-a",
      expiresAt: FUTURE,
    });
    await repo.createSession({
      userId: USER_B.id,
      tokenHash: "hash-b",
      expiresAt: FUTURE,
    });

    // Cross-user revoke is a no-op: A's session stays active.
    await repo.revokeSession(sessionA.tokenHash, USER_B.id);
    expect(
      await repo.findActiveSessionByTokenHash("hash-a"),
    ).toBeDefined();

    // Owner revoke succeeds: the session is no longer active.
    await repo.revokeSession(sessionA.tokenHash, USER_A.id);
    expect(
      await repo.findActiveSessionByTokenHash("hash-a"),
    ).toBeUndefined();
  });

  it("findActiveSessionByTokenHash excludes revoked and expired sessions", async () => {
    await repo.createSession({
      userId: USER_A.id,
      tokenHash: "active",
      expiresAt: FUTURE,
    });
    await repo.createSession({
      userId: USER_A.id,
      tokenHash: "expired",
      expiresAt: PAST,
    });
    const revoked = await repo.createSession({
      userId: USER_A.id,
      tokenHash: "revoked",
      expiresAt: FUTURE,
    });
    await repo.revokeSession(revoked.tokenHash, USER_A.id);

    expect((await repo.findActiveSessionByTokenHash("active"))?.tokenHash).toBe(
      "active",
    );
    expect(await repo.findActiveSessionByTokenHash("expired")).toBeUndefined();
    expect(await repo.findActiveSessionByTokenHash("revoked")).toBeUndefined();
    expect(await repo.findActiveSessionByTokenHash("missing")).toBeUndefined();
  });

  it("revokeAllForUser revokes only that user's sessions", async () => {
    await repo.createSession({
      userId: USER_A.id,
      tokenHash: "a1",
      expiresAt: FUTURE,
    });
    await repo.createSession({
      userId: USER_A.id,
      tokenHash: "a2",
      expiresAt: FUTURE,
    });
    await repo.createSession({
      userId: USER_B.id,
      tokenHash: "b1",
      expiresAt: FUTURE,
    });

    await repo.revokeAllForUser(USER_A.id);

    expect(await repo.findActiveSessionByTokenHash("a1")).toBeUndefined();
    expect(await repo.findActiveSessionByTokenHash("a2")).toBeUndefined();
    // B's session is untouched.
    expect((await repo.findActiveSessionByTokenHash("b1"))?.userId).toBe(
      USER_B.id,
    );
  });
});
