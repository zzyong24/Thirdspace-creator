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

  it("rejects a duplicate (user_id, platform, account_handle)", async () => {
    const base = {
      userId: "user-a",
      platform: "bilibili",
      accountHandle: "@dup",
      createdAt: "2026-06-21T00:00:00.000Z",
      updatedAt: "2026-06-21T00:00:00.000Z",
    };
    await db.insert(platformAccounts).values({ id: "acct-a", ...base });
    await expect(
      db.insert(platformAccounts).values({ id: "acct-b", ...base }),
    ).rejects.toBeTruthy();
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
