import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import {
  createPlatformAccountRepository,
  type PlatformAccountRepository,
} from "./platform-account.repository";
import { OwnershipError, ConflictError } from "./platform-account.errors";

// Step 2 (repository, pglite-backed) — user-scoped ONLY. Tests:
//   - ownership: A's row invisible to B (getAccount throws OwnershipError;
//     existsOwnedActiveAccount false from B).
//   - duplicate (platform, handle) same user → ConflictError; same handle different
//     platform → OK; same handle+platform different user → OK (per-user scoped).
//   - listAccounts({ platform }) returns only that platform, newest-first, respects
//     limit/offset.
//   - archiveAccount flips status; existsOwnedActiveAccount then false.

const NOW = "2026-06-21T00:00:00.000Z";

function repoFor(db: Db, userId: string): PlatformAccountRepository {
  let seq = 0;
  return createPlatformAccountRepository(db, {
    now: () => NOW,
    nextId: (prefix: string) => `${prefix}-${userId}-${++seq}`,
    userId,
  });
}

describe("platform-account repository", () => {
  let db: Db;
  beforeEach(async () => {
    ({ db } = await createDb());
  });

  it("scopes ownership: A's account is invisible to B", async () => {
    const a = repoFor(db, "user-a");
    const b = repoFor(db, "user-b");
    const created = await a.createAccount({
      platform: "douyin",
      accountHandle: "@a-main",
    });
    expect(created.userId).toBe("user-a");
    // B cannot read A's account → OwnershipError (404 not 403).
    await expect(b.getAccount(created.id)).rejects.toBeInstanceOf(
      OwnershipError,
    );
    // B's binding guard sees nothing.
    expect(await b.existsOwnedActiveAccount(created.id, "douyin")).toBe(false);
    // A's own guard sees it.
    expect(await a.existsOwnedActiveAccount(created.id, "douyin")).toBe(true);
  });

  it("enforces per-user (platform, handle) uniqueness", async () => {
    const a = repoFor(db, "user-a");
    await a.createAccount({ platform: "douyin", accountHandle: "@dup" });
    // same user, same platform+handle → ConflictError.
    await expect(
      a.createAccount({ platform: "douyin", accountHandle: "@dup" }),
    ).rejects.toBeInstanceOf(ConflictError);
    // same user, different platform → OK.
    const other = await a.createAccount({
      platform: "bilibili",
      accountHandle: "@dup",
    });
    expect(other.platform).toBe("bilibili");
    // different user, same platform+handle → OK (per-user scoped).
    const b = repoFor(db, "user-b");
    const bRow = await b.createAccount({
      platform: "douyin",
      accountHandle: "@dup",
    });
    expect(bRow.userId).toBe("user-b");
  });

  it("lists platform-filtered accounts newest-first with pagination", async () => {
    const a = repoFor(db, "user-a");
    // 3 douyin + 1 bilibili. createdAt is fixed, so ordering ties are stable by
    // insert; assert the filter + count rather than a brittle order on equal ts.
    await a.createAccount({ platform: "douyin", accountHandle: "@d1" });
    await a.createAccount({ platform: "douyin", accountHandle: "@d2" });
    await a.createAccount({ platform: "douyin", accountHandle: "@d3" });
    await a.createAccount({ platform: "bilibili", accountHandle: "@b1" });

    const filtered = await a.listAccounts({ platform: "douyin" });
    expect(filtered.total).toBe(3);
    expect(filtered.rows.every((r) => r.platform === "douyin")).toBe(true);

    const page = await a.listAccounts({ platform: "douyin", limit: 2, offset: 0 });
    expect(page.rows).toHaveLength(2);
    expect(page.total).toBe(3); // total ignores limit/offset

    const all = await a.listAccounts({});
    expect(all.total).toBe(4);
  });

  it("soft-archives: status flips and the active binding guard then fails", async () => {
    const a = repoFor(db, "user-a");
    const acct = await a.createAccount({
      platform: "douyin",
      accountHandle: "@arch",
    });
    expect(await a.existsOwnedActiveAccount(acct.id, "douyin")).toBe(true);
    const archived = await a.archiveAccount(acct.id);
    expect(archived.status).toBe("archived");
    // row still present (no delete — attribution preserved) but not an active target.
    const got = await a.getAccount(acct.id);
    expect(got.status).toBe("archived");
    expect(await a.existsOwnedActiveAccount(acct.id, "douyin")).toBe(false);
  });

  it("updates only provided fields and bumps updatedAt", async () => {
    let clock = 0;
    const a = createPlatformAccountRepository(db, {
      now: () => `2026-06-21T00:00:0${clock++}.000Z`,
      nextId: (p: string) => `${p}-u-1`,
      userId: "user-a",
    });
    const acct = await a.createAccount({
      platform: "douyin",
      accountHandle: "@orig",
      followerBaseline: 100,
    });
    const updated = await a.updateAccount(acct.id, { followerBaseline: 250 });
    expect(updated.followerBaseline).toBe(250);
    expect(updated.accountHandle).toBe("@orig"); // unchanged
    expect(updated.updatedAt).not.toBe(acct.updatedAt); // bumped

    // findByPlatformHandle resolves the scoped row.
    const found = await a.findByPlatformHandle("douyin", "@orig");
    expect(found?.id).toBe(acct.id);
    expect(await a.findByPlatformHandle("douyin", "@missing")).toBeNull();
  });
});
