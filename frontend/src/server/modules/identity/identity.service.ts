import type { IdentityRepository, UserRow } from "./identity.repository";
import {
  generateSessionToken,
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
 * scopes against. Task 6 lifts this definition into shared infra
 * (`@creatoros/backend`) so every module imports one definition; until then the
 * identity service owns the canonical shape (it is the one place that *derives*
 * a context from a session). Tasks 8/9 consume `resolveContextFromToken`.
 */
export interface RequestContext {
  userId: string;
  requestId: string;
  source: "user" | "ingestion" | "ai";
  ingestionRunId?: string;
  aiTaskId?: string;
}

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
