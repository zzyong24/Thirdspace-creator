import type { RequestContext } from "@creatoros/backend";
import type { IdentityRepository, UserRow } from "./identity.repository";

// FIXED clock for the canonical seed user's createdAt/updatedAt — decoupled from the
// frontend mock-backend (= fixtures FIXED_NOW 2026-06-13T10:00:00+08:00). identity 是后端
// 模块,不依赖前端 fixtures。
const FIXED_NOW_ISO = "2026-06-13T02:00:00.000Z";
import {
  generateSessionToken,
  hashPassword,
  hashToken,
  verifyPassword,
} from "./identity.crypto";
import { AuthenticationError, EmailTakenError } from "./identity.errors";

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

export interface RegisterInput {
  email: string;
  password: string;
  displayName?: string;
}

// The editable profile fields (`PATCH /me`). Every key optional — only the
// provided keys are written. `email` / `timezone` are intentionally NOT editable
// here (email is the login identifier + unique key; no timezone control exists).
export interface ProfilePatch {
  displayName?: string;
  locale?: string;
}

// Registration yields the same shape as login — a fresh user DTO plus an active
// session — so the route can set the session cookie and the new user lands
// authenticated, exactly like a post-login redirect.
export type RegisterResult = LoginResult;

export interface IdentityService {
  login(input: LoginInput): Promise<LoginResult>;
  register(input: RegisterInput): Promise<RegisterResult>;
  resolveContextFromToken(rawToken: string): Promise<RequestContext>;
  /** [T-046 单机免登录] 以本机主用户(最早创建)构造 ctx —— 无 session 请求的直通通道。
   *  库里没有任何用户(不该发生:启动 seed 兜底)时抛 AuthenticationError。 */
  resolveLocalContext(): Promise<RequestContext>;
  getCurrentUser(ctx: RequestContext): Promise<UserDTO>;
  updateProfile(ctx: RequestContext, patch: ProfilePatch): Promise<UserDTO>;
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

    async register({ email, password, displayName }) {
      // Email must be unique (users_email_uk). Guard explicitly so the caller
      // gets a clear EmailTakenError (409) rather than a raw DB constraint
      // violation; the unique index remains the backstop for a concurrent race.
      const existing = await repo.findUserByEmail(email);
      if (existing) throw new EmailTakenError();

      // A brand-new EMPTY account. displayName defaults to the email local-part
      // when omitted. timezone/locale take neutral defaults (matching the users
      // NOT NULL columns) — the user can change them later via settings.
      const nowIso = deps.now();
      const user = await repo.createUser({
        id: deps.nextId("user"),
        email,
        displayName: displayName?.trim() || email.split("@")[0]!,
        timezone: "UTC",
        locale: "en-US",
        passwordHash: hashPassword(password),
        createdAt: nowIso,
        updatedAt: nowIso,
      });

      // Issue a session exactly like login so the new user lands authenticated.
      const { raw, hash } = generateSessionToken();
      const expiresAt = new Date(
        new Date(nowIso).getTime() + SESSION_TTL_MS,
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

    async resolveLocalContext() {
      // [T-046] 单机免登录:本机主用户 = 最早创建的用户(seed 场景即 canonical user)。
      // 库里一个用户都没有(启动 seed 兜底,正常不发生)→ 与坏 token 同响应,不泄露状态。
      const user = await repo.findLocalUser();
      if (!user) throw new AuthenticationError();
      return {
        userId: user.id,
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

    async updateProfile(ctx, patch) {
      // User-scoped profile edit (`PATCH /me`). The repo's UPDATE is pinned to
      // ctx.userId, so a patch can never touch another tenant's row. Only the
      // provided keys (displayName / locale) are written; updatedAt is stamped
      // from the injected clock (deterministic in tests, never Date.now). An
      // empty patch is a no-op read so the caller still gets the current DTO
      // without a needless write.
      const hasChange =
        patch.displayName !== undefined || patch.locale !== undefined;
      if (!hasChange) {
        const current = await repo.getUserById(ctx.userId);
        return toUserDTO(current);
      }
      const row = await repo.updateUser(ctx.userId, {
        displayName: patch.displayName,
        locale: patch.locale,
        updatedAt: deps.now(),
      });
      return toUserDTO(row);
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
