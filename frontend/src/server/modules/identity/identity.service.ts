import type { RequestContext } from "@creatoros/backend";
import { FIXED_NOW_ISO } from "@/server/mock-backend/store";
import type { IdentityRepository, UserRow } from "./identity.repository";
import {
  generateSessionToken,
  hashPassword,
  hashToken,
  verifyPassword,
} from "./identity.crypto";
import { AuthenticationError } from "./identity.errors";

// Identity service (Module 00, Task 5). The auth state actions + RequestContext
// derivation. There is no §12 *business* state machine for Identity (foundation
// §4: "No machine for … Identity"); the lifecycle enforced here is the SESSION
// lifecycle `none → active → revoked|expired`:
//   - login        : none → active  (mint token, persist its hash)
//   - resolveFromToken / getCurrentUser : read an *active* session/user
//   - logout       : active → revoked (user-scoped revoke)
//
// Determinism: the service takes injected deps (clock + id generator) like the
// repository, so tests are reproducible. The only non-determinism — the random
// session-token bytes — is isolated in identity.crypto (asserted via its hash).
// This is the real server/identity layer, where real auth (hashing, sessions)
// is allowed; it never runs in the deterministic selector/fixture/mock layer.

/**
 * RequestContext (SPEC §10) — the per-request ownership boundary every module
 * scopes against. Task 6 lifted the canonical definition into shared infra
 * (`@creatoros/backend`) so every module imports ONE definition; the identity
 * service (the one place that *derives* a context from a session) imports it and
 * re-exports it for back-compat with existing module consumers. Tasks 8/9 thread
 * `resolveContextFromToken`'s result through the transport.
 */
export type { RequestContext };

/**
 * Public user payload. An EXPLICIT DTO — never the Drizzle `UserRow` — so the
 * internal `passwordHash` (and any future internal column) can never leak across
 * the service boundary (SPEC §9). Shape mirrors the contract `userResource`.
 */
export interface UserDTO {
  id: string;
  email: string;
  displayName: string;
  timezone: string;
  locale: string;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceDeps {
  now: () => string; // ISO-8601 clock (injected for deterministic tests)
  nextId: (prefix: string) => string; // id generator (deterministic in tests)
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface LoginResult {
  user: UserDTO;
  rawToken: string;
  expiresAt: string;
}

export interface IdentityService {
  login(input: LoginInput): Promise<LoginResult>;
  resolveContextFromToken(rawToken: string): Promise<RequestContext>;
  getCurrentUser(ctx: RequestContext): Promise<UserDTO>;
  logout(ctx: RequestContext, rawToken: string): Promise<void>;
}

// 30-day session lifetime, expressed in milliseconds. `now()` returns ISO-8601
// text; we parse → add → re-serialise so the stored `expiresAt` stays ISO-8601
// (the repository compares it lexicographically against `now()`).
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Project a Drizzle `UserRow` onto the public DTO (drops `passwordHash`). */
function toUserDTO(row: UserRow): UserDTO {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    timezone: row.timezone,
    locale: row.locale,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function createIdentityService(
  repo: IdentityRepository,
  deps: ServiceDeps,
): IdentityService {
  return {
    async login({ email, password }) {
      const user = await repo.findUserByEmail(email);
      // Same AuthenticationError (identical default message) for an unknown
      // email and a wrong password — no user enumeration (SPEC §20).
      if (!user || !verifyPassword(password, user.passwordHash)) {
        throw new AuthenticationError();
      }

      const { raw, hash } = generateSessionToken();
      const expiresAt = new Date(
        new Date(deps.now()).getTime() + SESSION_TTL_MS,
      ).toISOString();
      await repo.createSession({ userId: user.id, tokenHash: hash, expiresAt });

      return { user: toUserDTO(user), rawToken: raw, expiresAt };
    },

    async resolveContextFromToken(rawToken) {
      const session = await repo.findActiveSessionByTokenHash(
        hashToken(rawToken),
      );
      // Missing / revoked / expired → unauthenticated (the repository already
      // filters revoked + expired out of `findActiveSessionByTokenHash`).
      if (!session) throw new AuthenticationError();
      return {
        userId: session.userId,
        requestId: deps.nextId("req"),
        source: "user",
      };
    },

    async getCurrentUser(ctx) {
      // getUserById throws OwnershipError (→404) if the user is gone; for a
      // context derived from a live session that should not normally happen.
      const user = await repo.getUserById(ctx.userId);
      return toUserDTO(user);
    },

    async logout(ctx, rawToken) {
      // User-scoped revoke: the token hash is revoked only when it belongs to
      // ctx.userId (a cross-user logout matches no rows).
      await repo.revokeSession(hashToken(rawToken), ctx.userId);
    },
  };
}

// ---------------------------------------------------------------------------
// Canonical-user seed (Module 00, Task 7)
// ---------------------------------------------------------------------------
//
// Every existing fixture-backed page and the Projects persistence seed resolve
// against `id:"user-zyongzhu"` (the canonical fixture user, frontend/src/
// fixtures/canonical.ts). To make real login resolve to that same id — so all
// those fixtures keep working under the seeded ctx — we seed a row whose values
// are EXACTLY the fixture's, plus the identity-infra `passwordHash`.
//
// Determinism: `createdAt/updatedAt` use the fixtures' FIXED_NOW_ISO (never
// Date.now). The dev credential is read from CREATOROS_DEV_PASSWORD (default
// "creatoros-dev", documented) — it is hashed at seed time and NEVER logged
// (SPEC §20/§21). The seed itself is idempotent: the repo's seedUser uses
// onConflictDoNothing, so a second buildPersistence()/seed call is a no-op and
// never overwrites an existing row or trips the users_email_uk unique index.

/** Canonical fixture user id — the seeded login resolves to this. */
export const CANONICAL_USER_ID = "user-zyongzhu";

/**
 * Dev login credential for the seeded canonical user. Read from env so a deploy
 * can override it; the documented default is "creatoros-dev". Never logged.
 */
export const DEV_PASSWORD =
  process.env.CREATOROS_DEV_PASSWORD ?? "creatoros-dev";

/** Canonical user row values — EXACTLY the fixture's (canonical.ts L113-118). */
const CANONICAL_USER = {
  id: CANONICAL_USER_ID,
  email: "zyongzhu@creatoros.local",
  displayName: "Zyong Zhu",
  timezone: "Asia/Shanghai",
  locale: "zh-CN",
  createdAt: FIXED_NOW_ISO,
  updatedAt: FIXED_NOW_ISO,
} as const;

/**
 * Idempotently seed the canonical user so every fixture-backed page and the
 * Projects persistence seed keep resolving under a real session ctx. The
 * password hash is derived from DEV_PASSWORD at call time (salted scrypt). Safe
 * to call on every buildPersistence() — onConflictDoNothing makes re-runs no-ops.
 */
export async function seedCanonicalUser(
  repo: IdentityRepository,
  _deps: ServiceDeps,
): Promise<void> {
  await repo.seedUser({
    ...CANONICAL_USER,
    passwordHash: hashPassword(DEV_PASSWORD),
  });
}
