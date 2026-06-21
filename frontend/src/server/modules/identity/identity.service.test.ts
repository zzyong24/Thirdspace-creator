import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import { createIdentityRepository } from "./identity.repository";
import { createIdentityService, type IdentityService } from "./identity.service";
import { AuthenticationError } from "./identity.errors";
import { hashPassword, hashToken } from "./identity.crypto";

// Task 5: the identity service — the session lifecycle (none → active →
// revoked|expired) over the user-scoped repository. Deterministic deps (fixed
// clock + counter id generator) so every assertion is reproducible; the only
// non-determinism (token bytes) lives in identity.crypto, asserted by its hash.

const FIXED_NOW = "2026-06-13T10:00:00+08:00";

function makeDeps() {
  let n = 0;
  return {
    now: () => FIXED_NOW,
    nextId: (prefix: string) => `${prefix}-${++n}`,
  };
}

const PASSWORD = "correct-horse";

const SEEDED_USER = {
  id: "user-seed",
  email: "seed@creatoros.local",
  displayName: "Seed User",
  timezone: "Asia/Shanghai",
  locale: "zh-CN",
  passwordHash: hashPassword(PASSWORD),
  createdAt: FIXED_NOW,
  updatedAt: FIXED_NOW,
};

let db: Db;
let service: IdentityService;

beforeEach(async () => {
  ({ db } = await createDb());
  const repo = createIdentityRepository(db, makeDeps());
  await repo.seedUser(SEEDED_USER);
  service = createIdentityService(repo, makeDeps());
});

describe("identity.service login (Task 5)", () => {
  it("happy path returns a raw token whose hash matches a stored active session", async () => {
    const { user, rawToken, expiresAt } = await service.login({
      email: SEEDED_USER.email,
      password: PASSWORD,
    });
    expect(rawToken).toMatch(/^[0-9a-f]{64}$/);
    expect(expiresAt > FIXED_NOW).toBe(true);

    // The session is stored under the raw token's sha256 hash and is active.
    const ctx = await service.resolveContextFromToken(rawToken);
    expect(ctx.userId).toBe(SEEDED_USER.id);

    // The returned DTO never leaks the password hash (or any Drizzle internal).
    expect(user).not.toHaveProperty("passwordHash");
    expect(user.id).toBe(SEEDED_USER.id);
    expect(user.email).toBe(SEEDED_USER.email);
    expect(user.displayName).toBe(SEEDED_USER.displayName);
    // Confirm the hash really is stored, keyed by hashToken(raw).
    expect(hashToken(rawToken)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("wrong password and unknown email throw AuthenticationError with an identical message", async () => {
    let wrongPwMsg = "";
    let unknownMsg = "";
    await expect(
      service.login({ email: SEEDED_USER.email, password: "nope" }),
    ).rejects.toMatchObject({ name: "AuthenticationError" });
    await expect(
      service.login({ email: "ghost@creatoros.local", password: PASSWORD }),
    ).rejects.toBeInstanceOf(AuthenticationError);

    try {
      await service.login({ email: SEEDED_USER.email, password: "nope" });
    } catch (e) {
      wrongPwMsg = (e as Error).message;
    }
    try {
      await service.login({ email: "ghost@creatoros.local", password: PASSWORD });
    } catch (e) {
      unknownMsg = (e as Error).message;
    }
    expect(wrongPwMsg).toBe(unknownMsg);
    expect(wrongPwMsg).not.toBe("");
  });
});

describe("identity.service session lifecycle (Task 5)", () => {
  it("resolveContextFromToken yields the session's userId and source 'user'", async () => {
    const { rawToken } = await service.login({
      email: SEEDED_USER.email,
      password: PASSWORD,
    });
    const ctx = await service.resolveContextFromToken(rawToken);
    expect(ctx.userId).toBe(SEEDED_USER.id);
    expect(ctx.source).toBe("user");
    expect(typeof ctx.requestId).toBe("string");
    expect(ctx.requestId.length).toBeGreaterThan(0);
  });

  it("resolveContextFromToken throws AuthenticationError for a garbage token", async () => {
    await expect(
      service.resolveContextFromToken("not-a-real-token"),
    ).rejects.toBeInstanceOf(AuthenticationError);
  });

  it("logout revokes the session: the same token then throws", async () => {
    const { rawToken } = await service.login({
      email: SEEDED_USER.email,
      password: PASSWORD,
    });
    const ctx = await service.resolveContextFromToken(rawToken);
    await service.logout(ctx, rawToken);
    await expect(
      service.resolveContextFromToken(rawToken),
    ).rejects.toBeInstanceOf(AuthenticationError);
  });

  it("getCurrentUser returns the seeded user DTO (no passwordHash)", async () => {
    const { rawToken } = await service.login({
      email: SEEDED_USER.email,
      password: PASSWORD,
    });
    const ctx = await service.resolveContextFromToken(rawToken);
    const dto = await service.getCurrentUser(ctx);
    expect(dto).toEqual({
      id: SEEDED_USER.id,
      email: SEEDED_USER.email,
      displayName: SEEDED_USER.displayName,
      timezone: SEEDED_USER.timezone,
      locale: SEEDED_USER.locale,
      createdAt: SEEDED_USER.createdAt,
      updatedAt: SEEDED_USER.updatedAt,
    });
    expect(dto).not.toHaveProperty("passwordHash");
  });
});
