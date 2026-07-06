import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db, eq } from "@creatoros/backend";
import { publications, publicationRevisions } from "./publishing.db-schema";
import {
  createPublishingRepository,
  type PublishingRepository,
} from "./publishing.repository";
import { OwnershipError } from "./publishing.errors";

// Step 1 (schema round-trip) + Step 2 (user-scoped repository) — pglite-backed.
// Ownership is the sole boundary (foundation §2/§5): user A cannot read user B's
// publication; a cross-user id is indistinguishable from a missing one
// (OwnershipError → 404). Plus: two-table round-trip with jsonb defaults `[]`/`{}`,
// nullable timestamps `null`, status default 'draft', revisionNumber increment,
// list ordering/pagination, and findByExternalKey scoping.

const A = "user-a";
const B = "user-b";
const NOW = "2026-06-21T00:00:00.000Z";

function deterministicDeps(userId: string) {
  const counters = new Map<string, number>();
  return {
    now: () => NOW,
    // Namespace ids by userId so two repos sharing one pglite db never collide.
    nextId: (prefix: string) => {
      const n = (counters.get(prefix) ?? 0) + 1;
      counters.set(prefix, n);
      return `${prefix}-${userId}-${n}`;
    },
    userId,
  };
}

let db: Db;
let repoA: PublishingRepository;
let repoB: PublishingRepository;

beforeEach(async () => {
  ({ db } = await createDb());
  repoA = createPublishingRepository(db, deterministicDeps(A));
  repoB = createPublishingRepository(db, deterministicDeps(B));
});

describe("publishing.repository — schema round-trip (Step 1)", () => {
  it("round-trips both tables with jsonb defaults, nullable timestamps, status default", async () => {
    const pub = await repoA.createPublication("output-1", {
      platform: "bilibili",
      accountReference: "@creator",
    });
    expect(pub.status).toBe("draft");
    expect(pub.currentRevisionId).toBeNull();
    expect(pub.externalId).toBeNull();
    expect(pub.externalUrl).toBeNull();
    expect(pub.scheduledAt).toBeNull();
    expect(pub.publishedAt).toBeNull();
    expect(pub.removedAt).toBeNull();
    expect(pub.userId).toBe(A);

    // raw read confirms persisted columns
    const rawPub = await db
      .select()
      .from(publications)
      .where(eq(publications.id, pub.id));
    expect(rawPub[0]!.contentOutputId).toBe("output-1");

    const rev = await repoA.createRevision(pub.id, {
      title: "标题",
      description: "",
    });
    expect(rev.revisionNumber).toBe(1);
    expect(rev.platformTags).toEqual([]);
    expect(rev.platformSettings).toEqual({});
    expect(rev.coverAssetId).toBeNull();
    expect(rev.category).toBe("");
    expect(rev.series).toBe("");

    const rawRev = await db
      .select()
      .from(publicationRevisions)
      .where(eq(publicationRevisions.id, rev.id));
    expect(rawRev[0]!.userId).toBe(A);
  });
});

describe("publishing.repository — user-scoped ownership (Step 2)", () => {
  it("user A's publication is invisible to user B (OwnershipError, not a leak)", async () => {
    const pub = await repoA.createPublication("output-1", {
      platform: "douyin",
      accountReference: "@a",
    });
    await expect(repoB.getPublication(pub.id)).rejects.toBeInstanceOf(
      OwnershipError,
    );
    // A can still read its own.
    await expect(repoA.getPublication(pub.id)).resolves.toMatchObject({
      userId: A,
    });
  });

  it("createRevision increments revisionNumber per publication, restarts for another", async () => {
    const p1 = await repoA.createPublication("output-1", {
      platform: "youtube",
      accountReference: "@a",
    });
    const p2 = await repoA.createPublication("output-1", {
      platform: "x",
      accountReference: "@a",
    });
    const r1 = await repoA.createRevision(p1.id, { title: "t1", description: "" });
    const r2 = await repoA.createRevision(p1.id, { title: "t2", description: "" });
    const r3 = await repoA.createRevision(p1.id, { title: "t3", description: "" });
    expect([r1.revisionNumber, r2.revisionNumber, r3.revisionNumber]).toEqual([
      1, 2, 3,
    ]);
    const other = await repoA.createRevision(p2.id, {
      title: "o1",
      description: "",
    });
    expect(other.revisionNumber).toBe(1);
  });

  it("listPublicationsByOutput is newest-first and respects limit/offset", async () => {
    const a = await repoA.createPublication("output-x", {
      platform: "bilibili",
      accountReference: "@a",
    });
    const b = await repoA.createPublication("output-x", {
      platform: "douyin",
      accountReference: "@a",
    });
    const c = await repoA.createPublication("output-x", {
      platform: "xiaohongshu",
      accountReference: "@a",
    });
    const all = await repoA.listPublicationsByOutput("output-x", {
      limit: 10,
      offset: 0,
    });
    // newest-first (createdAt desc; ties broken by insertion → c,b,a all share NOW
    // so assert the set membership + count rather than a fragile tie order).
    expect(all.map((r) => r.id).sort()).toEqual([a.id, b.id, c.id].sort());
    const page = await repoA.listPublicationsByOutput("output-x", {
      limit: 2,
      offset: 0,
    });
    expect(page.length).toBe(2);
    const page2 = await repoA.listPublicationsByOutput("output-x", {
      limit: 2,
      offset: 2,
    });
    expect(page2.length).toBe(1);
  });

  it("findByExternalKey finds the row only for the owning user", async () => {
    const pub = await repoA.createPublication("output-1", {
      platform: "bilibili",
      accountReference: "@a",
    });
    await repoA.updatePublicationStatus(pub.id, {
      status: "published",
      externalId: "ext-1",
      externalUrl: "https://example.com/ext-1",
      publishedAt: NOW,
    });
    const found = await repoA.findByExternalKey("bilibili", "ext-1");
    expect(found?.id).toBe(pub.id);
    // user B sees nothing.
    const notFound = await repoB.findByExternalKey("bilibili", "ext-1");
    expect(notFound).toBeNull();
  });

  it("setCurrentRevision points the publication at the new revision", async () => {
    const pub = await repoA.createPublication("output-1", {
      platform: "wechatVideo",
      accountReference: "@a",
    });
    const rev = await repoA.createRevision(pub.id, {
      title: "t",
      description: "",
    });
    const updated = await repoA.setCurrentRevision(pub.id, rev.id);
    expect(updated.currentRevisionId).toBe(rev.id);
  });
});

// [T-136 §D 切片 c] 激活 publications 预留的 account_id 列 —— 采集导入作品 create 时 stamp
//   归号(切号只见该号发布)。RepoDeps.accountId 从 ctx.accountId 下推。
describe("publishing.repository — account stamp (T-136)", () => {
  it("createImportedPublication stamps account_id from deps", async () => {
    const { db } = await createDb();
    const repo = createPublishingRepository(db, {
      ...deterministicDeps(A),
      accountId: "acct-1",
    });
    const pub = await repo.createImportedPublication("output-imp", {
      platform: "douyin",
      accountReference: "douyin 导入",
      externalId: "aweme-123",
    });
    expect(pub.status).toBe("published");
    const rows = await db
      .select()
      .from(publications)
      .where(eq(publications.id, pub.id));
    expect(rows[0]!.accountId).toBe("acct-1"); // 采集导入作品归当前号
  });

  it("createPublication stamps account_id; null deps → null (存量 / 未选号兜底)", async () => {
    const { db } = await createDb();
    const repoAcct = createPublishingRepository(db, {
      ...deterministicDeps(A),
      accountId: "acct-1",
    });
    const repoNull = createPublishingRepository(db, {
      ...deterministicDeps(B),
      accountId: null,
    });
    const withAcct = await repoAcct.createPublication("out-a", {
      platform: "douyin",
      accountReference: "@a",
    });
    const withNull = await repoNull.createPublication("out-b", {
      platform: "douyin",
      accountReference: "@b",
    });
    const [rowA] = await db
      .select()
      .from(publications)
      .where(eq(publications.id, withAcct.id));
    const [rowB] = await db
      .select()
      .from(publications)
      .where(eq(publications.id, withNull.id));
    expect(rowA!.accountId).toBe("acct-1");
    expect(rowB!.accountId).toBeNull();
  });
});
