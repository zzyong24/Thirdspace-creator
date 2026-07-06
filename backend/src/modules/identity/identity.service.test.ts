import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import { createIdentityRepository } from "./identity.repository";
import {
  createIdentityService,
  seedCanonicalUser,
  CANONICAL_USER_ID,
  type IdentityService,
} from "./identity.service";
import { AuthenticationError, EmailTakenError } from "./identity.errors";
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

describe("identity.service register (P2 — 用户注册真账号)", () => {
  it("creates a fresh account, mints an active session, and never leaks the hash", async () => {
    const { user, rawToken, expiresAt } = await service.register({
      email: "newbie@creatoros.local",
      password: "a-new-password",
      displayName: "New Bie",
    });

    expect(rawToken).toMatch(/^[0-9a-f]{64}$/);
    expect(expiresAt > FIXED_NOW).toBe(true);
    expect(user).not.toHaveProperty("passwordHash");
    expect(user.email).toBe("newbie@creatoros.local");
    expect(user.displayName).toBe("New Bie");

    // The new user can authenticate via the issued session AND via login.
    const ctx = await service.resolveContextFromToken(rawToken);
    expect(ctx.userId).toBe(user.id);

    const relogin = await service.login({
      email: "newbie@creatoros.local",
      password: "a-new-password",
    });
    expect(relogin.user.id).toBe(user.id);
  });

  it("defaults displayName to the email local-part when omitted", async () => {
    const { user } = await service.register({
      email: "solo@creatoros.local",
      password: "pw",
    });
    expect(user.displayName).toBe("solo");
  });

  it("throws EmailTakenError when the email is already registered", async () => {
    await expect(
      service.register({ email: SEEDED_USER.email, password: "whatever" }),
    ).rejects.toBeInstanceOf(EmailTakenError);
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

describe("identity.service updateProfile (PATCH /me)", () => {
  async function ctxFor() {
    const { rawToken } = await service.login({
      email: SEEDED_USER.email,
      password: PASSWORD,
    });
    return service.resolveContextFromToken(rawToken);
  }

  it("writes only the provided keys (displayName + locale) and returns the refreshed DTO", async () => {
    const ctx = await ctxFor();
    const dto = await service.updateProfile(ctx, {
      displayName: "Renamed",
      locale: "en-US",
    });
    expect(dto.displayName).toBe("Renamed");
    expect(dto.locale).toBe("en-US");
    // Email / timezone are untouched (not in the editable surface).
    expect(dto.email).toBe(SEEDED_USER.email);
    expect(dto.timezone).toBe(SEEDED_USER.timezone);
    expect(dto).not.toHaveProperty("passwordHash");

    // The write persisted — a fresh read sees the new values.
    const reread = await service.getCurrentUser(ctx);
    expect(reread.displayName).toBe("Renamed");
    expect(reread.locale).toBe("en-US");
  });

  it("a partial patch leaves the un-provided field unchanged", async () => {
    const ctx = await ctxFor();
    const dto = await service.updateProfile(ctx, { locale: "ja-JP" });
    expect(dto.locale).toBe("ja-JP");
    expect(dto.displayName).toBe(SEEDED_USER.displayName);
  });

  it("an empty patch is a no-op read that still returns the current DTO", async () => {
    const ctx = await ctxFor();
    const dto = await service.updateProfile(ctx, {});
    expect(dto.displayName).toBe(SEEDED_USER.displayName);
    expect(dto.locale).toBe(SEEDED_USER.locale);
  });

  it("is user-scoped — patching under ctxA never touches another user's row", async () => {
    // Seed a second user and assert ctxA's patch leaves it untouched.
    const repo2 = createIdentityRepository(db, makeDeps());
    await repo2.seedUser({
      ...SEEDED_USER,
      id: "user-other",
      email: "other@creatoros.local",
    });
    const ctx = await ctxFor();
    await service.updateProfile(ctx, { displayName: "Only Mine" });
    const other = await repo2.getUserById("user-other");
    expect(other.displayName).toBe(SEEDED_USER.displayName);
  });
});

describe("identity.service seedCanonicalUser (Task 7)", () => {
  it("seeds the canonical user with BLANK 身份属性 (用户自填), id + locale 保留", async () => {
    const { db } = await createDb();
    const repo = createIdentityRepository(db, makeDeps());
    await seedCanonicalUser(repo, makeDeps());
    const svc = createIdentityService(repo, makeDeps());

    // [用户裁决 2026-07-06]「用户属性不该配置任何 seed」——不再 email-login(canonical email
    // 已置空),改走运行时免登录路径(T-046 resolveLocalContext = 本机主用户 = seed canonical)。
    const ctx = await svc.resolveLocalContext();
    expect(ctx.userId).toBe(CANONICAL_USER_ID);
    expect(ctx.userId).toBe("user-zyongzhu");

    const user = await svc.getCurrentUser(ctx);
    // 身份属性 blank:email/displayName 空,由用户经 onboarding/设置自填。
    expect(user.email).toBe("");
    expect(user.displayName).toBe("");
    // 功能性 locale 默认保留(非身份 seed;空 locale 会崩 Intl)。
    expect(user.timezone).toBe("Asia/Shanghai");
    expect(user.locale).toBe("zh-CN");
  });

  it("is idempotent — a second seed is a no-op (onConflictDoNothing)", async () => {
    const { db } = await createDb();
    const repo = createIdentityRepository(db, makeDeps());
    await seedCanonicalUser(repo, makeDeps());
    // A second seed must not throw (e.g. unique-email violation on "" ) and must
    // not overwrite the existing row — 免登录仍解析到同一 canonical user。
    await seedCanonicalUser(repo, makeDeps());
    const svc = createIdentityService(repo, makeDeps());

    const ctx = await svc.resolveLocalContext();
    expect(ctx.userId).toBe("user-zyongzhu");
  });
});
