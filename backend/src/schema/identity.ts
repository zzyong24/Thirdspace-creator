import { pgTable, text } from "drizzle-orm/pg-core";

// Identity tables live in shared infra (@creatoros/backend) because createDb()
// applies their DDL at init alongside PROJECTS_DDL (foundation §1: the db
// factory is shared-infra). The identity module (frontend/src/server/modules/
// identity) re-exports these from @creatoros/backend so there is ONE source of
// truth. Conventions mirror the Projects exemplar: text PKs, ISO-8601 text
// timestamps, enums-as-text; owned rows carry user_id.
//
// `passwordHash` is an identity-infra column not present in the data-model ER
// (docs/CreatorOS-data-model.md) — added per foundation §2 / SPEC §20 (hashed
// credentials). `sessions.tokenHash` stores only the sha256 of the raw session
// token; the raw token lives solely in the httpOnly cookie.

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  timezone: text("timezone").notNull(),
  locale: text("locale").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  tokenHash: text("token_hash").notNull(),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull(),
  revokedAt: text("revoked_at"),
});

// Raw DDL applied at db init alongside PROJECTS_DDL (pglite has no migration
// runner wired here yet). The unique indexes enforce one account per email and
// one row per session token hash.
export const IDENTITY_DDL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  timezone TEXT NOT NULL,
  locale TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_uk ON users(email);
CREATE UNIQUE INDEX IF NOT EXISTS sessions_token_hash_uk ON sessions(token_hash);
`;
