import { describe, it, expect, beforeEach } from "vitest";
import { createDb } from "@creatoros/backend";

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

beforeEach(async () => {
  ({ client } = await createDb()); // fresh in-memory pglite per test
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
