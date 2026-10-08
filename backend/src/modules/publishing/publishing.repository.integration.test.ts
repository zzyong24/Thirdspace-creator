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
// [T-332 S2] accountId 已是 RepoDeps 必填(strict 门):测试统一给默认号,双号用例显式传。
const ACCT = "acct-1";

function deterministicDeps(userId: string, accountId: string = ACCT) {
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
    accountId,
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

// [T-332 S2] 写路径按号 stamp(strict):accountId 是 RepoDeps 必填,create 出生即归号,
//   不存在「null 兜底」写路径(schema 已 NOT NULL,S1 收口)。
describe("publishing.repository — account stamp (T-332 S2 strict)", () => {
  it("createImportedPublication / createPublication 都 stamp deps.accountId", async () => {
    const { db } = await createDb();
    const repo = createPublishingRepository(db, deterministicDeps(A, "acct-1"));
    const imported = await repo.createImportedPublication("output-imp", {
      platform: "douyin",
      accountReference: "douyin 导入",
      externalId: "aweme-123",
    });
    expect(imported.status).toBe("published");
    const draft = await repo.createPublication("out-a", {
      platform: "douyin",
      accountReference: "@a",
    });
    const rows = await db
      .select()
      .from(publications)
      .where(eq(publications.userId, A));
    expect(rows.map((r) => r.accountId)).toEqual(["acct-1", "acct-1"]);
    expect(rows.map((r) => r.id).sort()).toEqual([imported.id, draft.id].sort());
  });
});

// [T-332 S2] 发布读路径 strict 按号隔离(SPEC §4.1/§4.5):切号 = 切工作区,
//   A 号 ctx 下 B 号的行完全不可见(列表读不到、by-id 404);lenient「当前号 OR
//   account_id IS NULL」与「未选号 → 全量」退化均已随用户拍板 ② 退役。
describe("publishing.repository — strict account isolation (T-332 S2)", () => {
  async function seedTwoAccounts(db: Db) {
    const repo1 = createPublishingRepository(db, {
      ...deterministicDeps(A, "acct-1"),
      nextId: (p: string) => `${p}-acct1-${Math.random().toString(36).slice(2)}`,
    });
    const repo2 = createPublishingRepository(db, {
      ...deterministicDeps(A, "acct-2"),
      nextId: (p: string) => `${p}-acct2-${Math.random().toString(36).slice(2)}`,
    });
    const p1 = await repo1.createPublication("out-shared", {
      platform: "douyin",
      accountReference: "@acct1",
    });
    const p2 = await repo2.createPublication("out-shared", {
      platform: "douyin",
      accountReference: "@acct2",
    });
    return { repo1, repo2, p1, p2 };
  }

  it("listPublicationsForUser:双号各见本号,交叉泄漏为 0(ISO-08)", async () => {
    const { db } = await createDb();
    const { repo1, repo2, p1, p2 } = await seedTwoAccounts(db);
    const seen1 = await repo1.listPublicationsForUser({ limit: 10, offset: 0 });
    expect(seen1.map((r) => r.id)).toEqual([p1.id]);
    const seen2 = await repo2.listPublicationsForUser({ limit: 10, offset: 0 });
    expect(seen2.map((r) => r.id)).toEqual([p2.id]);
  });

  it("listPublicationsByOutput / listPublicationIdsByOutputs strict 按号隔离", async () => {
    const { db } = await createDb();
    const { repo1, p1, p2 } = await seedTwoAccounts(db);
    const byOutput = await repo1.listPublicationsByOutput("out-shared", {
      limit: 10,
      offset: 0,
    });
    expect(byOutput.map((r) => r.id)).toEqual([p1.id]);
    expect(byOutput.map((r) => r.id)).not.toContain(p2.id);
    const ids = await repo1.listPublicationIdsByOutputs(["out-shared"]);
    expect(ids).toEqual([p1.id]);
    const rows = await repo1.listPublicationsByOutputs(["out-shared"]);
    expect(rows.map((r) => r.id)).toEqual([p1.id]);
  });

  it("by-id 读上号一致性门(SPEC §4.5):跨号 getPublication → OwnershipError 404", async () => {
    const { db } = await createDb();
    const { repo1, repo2, p1, p2 } = await seedTwoAccounts(db);
    // 跨号 by-id 与跨 user 同语义:404,不泄漏存在性(堵「列表看不见但 URL 能打开」裂缝)。
    await expect(repo1.getPublication(p2.id)).rejects.toBeInstanceOf(
      OwnershipError,
    );
    await expect(repo2.getPublication(p1.id)).rejects.toBeInstanceOf(
      OwnershipError,
    );
    // 本号 by-id 正常。
    await expect(repo1.getPublication(p1.id)).resolves.toMatchObject({
      accountId: "acct-1",
    });
  });

  it("findByExternalKey 查询保持 user 级幂等锚,但跨号命中 → 抛数据 bug 错(C-09)", async () => {
    const { db } = await createDb();
    const { repo1, repo2 } = await seedTwoAccounts(db);
    // acct-2 导入的作品(external key 落在 acct-2 行上)。
    const imported = await repo2.createImportedPublication("out-imp", {
      platform: "douyin",
      accountReference: "douyin 导入",
      externalId: "aweme-xkey",
    });
    // 本号命中:正常返回。
    const hit = await repo2.findByExternalKey("douyin", "aweme-xkey");
    expect(hit?.id).toBe(imported.id);
    // 跨号命中:平台唯一锚不可能跨号双属 → 数据 bug,诚实抛错,绝不静默返回。
    await expect(
      repo1.findByExternalKey("douyin", "aweme-xkey"),
    ).rejects.toBeInstanceOf(OwnershipError);
    // 未命中:诚实 null(不是错)。
    await expect(
      repo1.findByExternalKey("douyin", "aweme-missing"),
    ).resolves.toBeNull();
  });
});

describe("日报发布窗口窄读", () => {
  it("只返回当前用户当前账号已发布可见作品，按真实时间过滤，1000条历史不返回", async () => {
    const base = await repoA.createPublication("out-window", {platform:"douyin", accountReference:"@a"});
    await repoA.seedPublications([
      ...Array.from({length:1005}, (_,i)=>({...base,id:`history-${i}`,status:"published",publishedAt:"2025-12-01T00:00:00Z"})),
      {...base,id:"start",status:"published",publishedAt:"2026-02-28T00:00:00+08:00"},
      {...base,id:"inside",status:"published",publishedAt:"2026-02-28T15:59:59Z"},
      {...base,id:"end",status:"published",publishedAt:"2026-03-01T00:00:00+08:00"},
      {...base,id:"draft",publishedAt:"2026-02-28T12:00:00Z"},
      {...base,id:"hidden",status:"published",hiddenAt:NOW,publishedAt:"2026-02-28T12:00:00Z"},
      {...base,id:"removed",status:"published",removedAt:NOW,publishedAt:"2026-02-28T12:00:00Z"},
      {...base,id:"other-account",accountId:"acct-2",status:"published",publishedAt:"2026-02-28T12:00:00Z"},
      {...base,id:"other-user",userId:B,status:"published",publishedAt:"2026-02-28T12:00:00Z"},
    ]);
    const result=await repoA.listPublishedInWindow({start:"2026-02-27T16:00:00Z",end:"2026-02-28T16:00:00Z"});
    expect(result.map(p=>p.id)).toEqual(["inside","start"]);
  });
});
