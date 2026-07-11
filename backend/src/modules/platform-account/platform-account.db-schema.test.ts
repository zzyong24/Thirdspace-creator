import { describe, it, expect, beforeEach } from "vitest";
import { createDb, eq, and, type Db } from "@creatoros/backend";
import { platformAccounts } from "./platform-account.db-schema";

// Step 1 (db-schema, first red) — a row inserted into platform_accounts round-trips
// via db.select() with all columns intact (followerBaseline defaults 0,
// secretReference null, status 'active'); the (user_id, platform, account_handle)
// unique index rejects a duplicate insert. Mirrors the realized monetization/candidate
// schema tests (pglite-backed, deterministic).

describe("platform-account db-schema", () => {
  let db: Db;
  beforeEach(async () => {
    ({ db } = await createDb());
  });

  it("round-trips a platform_accounts row with column defaults", async () => {
    await db.insert(platformAccounts).values({
      id: "acct-1",
      userId: "user-a",
      platform: "douyin",
      accountHandle: "@matrix-main",
      // secretReference omitted → null; followerBaseline omitted → 0; status → 'active'
      createdAt: "2026-06-21T00:00:00.000Z",
      updatedAt: "2026-06-21T00:00:00.000Z",
    });
    const rows = await db
      .select()
      .from(platformAccounts)
      .where(eq(platformAccounts.id, "acct-1"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "acct-1",
      userId: "user-a",
      platform: "douyin",
      accountHandle: "@matrix-main",
      secretReference: null,
      followerBaseline: 0,
      status: "active",
    });
  });

  // [T-201b] 身份唯一键从可变 account_handle 换到稳定 external_account_id(sec_uid):
  //   同 (user_id, platform, external_account_id) 撞唯一 → reject。
  it("rejects a duplicate (user_id, platform, external_account_id)", async () => {
    const base = {
      userId: "user-a",
      platform: "bilibili",
      accountHandle: "@dup",
      externalAccountId: "sec-uid-dup",
      createdAt: "2026-06-21T00:00:00.000Z",
      updatedAt: "2026-06-21T00:00:00.000Z",
    };
    await db.insert(platformAccounts).values({ id: "acct-a", ...base });
    await expect(
      db.insert(platformAccounts).values({ id: "acct-b", ...base }),
    ).rejects.toBeTruthy();
  });

  // [T-201b] account_handle 降级为非唯一显示名:同 (user, platform, handle) 但身份键(NULL)不撞 → 允许。
  //   (PG 多个 NULL external_account_id 不冲突。)
  it("allows duplicate account_handle when external_account_id differs / is null (display 非唯一)", async () => {
    const ts = "2026-06-21T00:00:00.000Z";
    await db.insert(platformAccounts).values({
      id: "acct-h1",
      userId: "user-a",
      platform: "douyin",
      accountHandle: "@same-display",
      createdAt: ts,
      updatedAt: ts,
    });
    await db.insert(platformAccounts).values({
      id: "acct-h2",
      userId: "user-a",
      platform: "douyin",
      accountHandle: "@same-display", // 同显示名,身份键都 NULL → 允许共存
      createdAt: ts,
      updatedAt: ts,
    });
    const rows = await db
      .select()
      .from(platformAccounts)
      .where(eq(platformAccounts.accountHandle, "@same-display"));
    expect(rows).toHaveLength(2);
  });

  it("same handle different platform / different user is allowed (per-user scoped)", async () => {
    const ts = "2026-06-21T00:00:00.000Z";
    await db.insert(platformAccounts).values({
      id: "acct-1",
      userId: "user-a",
      platform: "douyin",
      accountHandle: "@same",
      createdAt: ts,
      updatedAt: ts,
    });
    // different platform, same user → OK
    await db.insert(platformAccounts).values({
      id: "acct-2",
      userId: "user-a",
      platform: "bilibili",
      accountHandle: "@same",
      createdAt: ts,
      updatedAt: ts,
    });
    // same platform+handle, different user → OK
    await db.insert(platformAccounts).values({
      id: "acct-3",
      userId: "user-b",
      platform: "douyin",
      accountHandle: "@same",
      createdAt: ts,
      updatedAt: ts,
    });
    const all = await db
      .select()
      .from(platformAccounts)
      .where(
        and(
          eq(platformAccounts.platform, "douyin"),
          eq(platformAccounts.accountHandle, "@same"),
        ),
      );
    expect(all).toHaveLength(2); // user-a + user-b, both douyin @same
  });
});
