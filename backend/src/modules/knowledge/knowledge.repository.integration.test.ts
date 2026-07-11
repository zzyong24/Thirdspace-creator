import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import {
  createKnowledgeRepository,
  type KnowledgeRepository,
} from "./knowledge.repository";
import { OwnershipError, ConflictError } from "./knowledge.errors";

// B1 — user-scoped repository integration test (pglite-backed). Ownership is the
// sole boundary (foundation §2): user A cannot list/get/revise/relate user B's
// knowledge; a cross-user id is indistinguishable from a missing one
// (OwnershipError → 404). Plus the §12 invariants: create stamps revision #1 +
// currentRevisionId; a second revision yields #2 and repoints currentRevisionId
// while #1 is unchanged (append-only).

const A = "user-a";
const B = "user-b";
const NOW = "2026-06-21T00:00:00.000Z";

function deterministicDeps() {
  const counters = new Map<string, number>();
  return {
    now: () => NOW,
    nextId: (prefix: string) => {
      const n = (counters.get(prefix) ?? 0) + 1;
      counters.set(prefix, n);
      return `${prefix}-${n}`;
    },
  };
}

let db: Db;
let repo: KnowledgeRepository;

beforeEach(async () => {
  ({ db } = await createDb());
  repo = createKnowledgeRepository(db, deterministicDeps());
});

describe("knowledge.repository — ownership enforced (multi-tenant)", () => {
  it("list is user-scoped: A sees only A's items", async () => {
    await repo.create(A, null, { title: "A 的笔记" });
    await repo.create(B, null, { title: "B 的笔记" });
    const aRows = await repo.list(A, null);
    expect(aRows).toHaveLength(1);
    expect(aRows[0]!.title).toBe("A 的笔记");
    expect(aRows[0]!.userId).toBe(A);
  });

  it("get(B, aItemId) throws OwnershipError (no existence leak)", async () => {
    const a = await repo.create(A, null, { title: "A 的笔记" });
    await expect(repo.get(B, null, a.id)).rejects.toBeInstanceOf(OwnershipError);
    // A can still get its own.
    const got = await repo.get(A, null, a.id);
    expect(got.id).toBe(a.id);
  });

  it("createRevision(B, aItemId) throws — cannot revise A's item", async () => {
    const a = await repo.create(A, null, { title: "A 的笔记" });
    await expect(
      repo.createRevision(B, null, a.id, { content: "篡改" }),
    ).rejects.toBeInstanceOf(OwnershipError);
  });

  it("[T-211] renameTitle 只改标题(content/status/currentRevisionId 不变)", async () => {
    const a = await repo.create(A, null, { title: "旧标题", content: "正文" });
    const renamed = await repo.renameTitle(A, null, a.id, "新标题");
    expect(renamed.title).toBe("新标题");
    expect(renamed.status).toBe("active");
    // 不新建 revision:currentRevisionId 保持,内容不变。
    expect(renamed.currentRevisionId).toBe(a.currentRevisionId);
    const rev = await repo.getRevision(A, null, renamed.currentRevisionId);
    expect(rev.content).toBe("正文");
    // 读回确认落库。
    const got = await repo.get(A, null, a.id);
    expect(got.title).toBe("新标题");
  });

  it("[T-211] renameTitle(B, aItemId) throws — 跨用户不能改 A 的标题", async () => {
    const a = await repo.create(A, null, { title: "A 的标题" });
    await expect(
      repo.renameTitle(B, null, a.id, "被篡改"),
    ).rejects.toBeInstanceOf(OwnershipError);
    // A 的标题未被动。
    expect((await repo.get(A, null, a.id)).title).toBe("A 的标题");
  });

  it("createRelation cannot link to B's item (both ends must be owned)", async () => {
    const a1 = await repo.create(A, null, { title: "A1" });
    const b1 = await repo.create(B, null, { title: "B1" });
    await expect(
      repo.createRelation(A, null, a1.id, {
        targetKnowledgeId: b1.id,
        relationType: "references",
      }),
    ).rejects.toBeInstanceOf(OwnershipError);
  });

  it("createRelation rejects a self-link with ConflictError", async () => {
    const a1 = await repo.create(A, null, { title: "A1" });
    await expect(
      repo.createRelation(A, null, a1.id, {
        targetKnowledgeId: a1.id,
        relationType: "references",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("create produces revision #1 and sets currentRevisionId", async () => {
    const a = await repo.create(A, null, { title: "A", content: "v1" });
    expect(a.status).toBe("active");
    expect(a.sourceType).toBe("manual");
    const rev = await repo.getRevision(A, null, a.currentRevisionId);
    expect(rev.revisionNumber).toBe(1);
    expect(rev.content).toBe("v1");
  });

  it("a second revision yields #2, repoints currentRevisionId, leaves #1 unchanged (append-only)", async () => {
    const a = await repo.create(A, null, { title: "A", content: "v1" });
    const firstRevId = a.currentRevisionId;
    const firstRevBefore = await repo.getRevision(A, null, firstRevId);

    const rev2 = await repo.createRevision(A, null, a.id, { content: "v2" });
    expect(rev2.revisionNumber).toBe(2);
    expect(rev2.content).toBe("v2");

    const itemAfter = await repo.get(A, null, a.id);
    expect(itemAfter.currentRevisionId).toBe(rev2.id);
    expect(itemAfter.currentRevisionId).not.toBe(firstRevId);

    // Revision #1 row is byte-identical (append-only — never UPDATEd/DELETEd).
    const firstRevAfter = await repo.getRevision(A, null, firstRevId);
    expect(firstRevAfter).toEqual(firstRevBefore);
  });

  it("createRelation between two owned items returns a numeric strength", async () => {
    const a1 = await repo.create(A, null, { title: "A1" });
    const a2 = await repo.create(A, null, { title: "A2" });
    const rel = await repo.createRelation(A, null, a1.id, {
      targetKnowledgeId: a2.id,
      relationType: "references",
    });
    expect(rel.sourceKnowledgeId).toBe(a1.id);
    expect(rel.targetKnowledgeId).toBe(a2.id);
    expect(rel.relationType).toBe("references");
    expect(typeof rel.strength).toBe("number");
    expect(rel.strength).toBe(1);
    expect(rel.createdByType).toBe("user");
  });

  // [T-136 切片 b] 号维度隔离:同一 user 下两个抖音号(account-a / account-b)。
  // 存量 account_id=null 的知识是历史/全局知识,选中具体号时也要能读(否则
  // 服务端列表无号门可见,客户端预览带 x-account-id 后 404)。
  it("accountId scopes reads within a user while including legacy null-account knowledge", async () => {
    const ACC_A = "account-a";
    const ACC_B = "account-b";
    const legacy = await repo.create(A, null, { title: "存量全局笔记" });
    // 同一 user A,分别以两个号 create(号维度随调用透传)。
    const kA = await repo.create(A, ACC_A, { title: "号a 笔记" });
    const kB = await repo.create(A, ACC_B, { title: "号b 笔记" });
    // create stamp:account_id 落到行上。
    expect(kA.accountId).toBe(ACC_A);
    expect(kB.accountId).toBe(ACC_B);

    // 号a 视角 list 见号a + 存量 null;号b 见号b + 存量 null。
    const listA = await repo.list(A, ACC_A);
    expect(listA.map((r) => r.id).sort()).toEqual([legacy.id, kA.id].sort());
    const listB = await repo.list(A, ACC_B);
    expect(listB.map((r) => r.id).sort()).toEqual([legacy.id, kB.id].sort());
    // null 号(未选号/存量)→ 退化不过滤,两条都见。
    const listNull = await repo.list(A, null);
    expect(listNull.map((r) => r.id).sort()).toEqual(
      [legacy.id, kA.id, kB.id].sort(),
    );

    // 跨号 get:号b 视角取号a 的行 → OwnershipError(404,不泄露存在)。
    await expect(repo.get(A, ACC_B, kA.id)).rejects.toBeInstanceOf(
      OwnershipError,
    );
    // 本号 get 正常;任意选中号可取存量 null;null 号可取任意本人行。
    expect((await repo.get(A, ACC_A, kA.id)).id).toBe(kA.id);
    expect((await repo.get(A, ACC_A, legacy.id)).id).toBe(legacy.id);
    expect((await repo.get(A, ACC_B, legacy.id)).id).toBe(legacy.id);
    expect((await repo.get(A, null, kB.id)).id).toBe(kB.id);
  });
});

// [T-079a] 出处 + 战绩投影(SPEC 2026-07-03-knowledge-asset-redesign §1)。
describe("knowledge.repository — sourceNote 往返 + 战绩投影 (T-079a)", () => {
  it("create 透传 sourceNote,get/list 原样读回;缺省为 NULL", async () => {
    const withNote = await repo.create(A, null, {
      title: "时区、UA、TLS 指纹任何两项一致就会被标记",
      knowledgeType: "quote",
      sourceNote: "Reddit r/ClaudeAI 用户 @sysadmthrowaway 原帖,需核实",
    });
    expect(withNote.knowledgeType).toBe("quote");
    expect(withNote.sourceNote).toBe(
      "Reddit r/ClaudeAI 用户 @sysadmthrowaway 原帖,需核实",
    );

    const without = await repo.create(A, null, { title: "无出处" });
    expect(without.sourceNote).toBeNull();

    const listed = await repo.list(A, null);
    expect(listed.find((r) => r.id === withNote.id)!.sourceNote).toContain(
      "需核实",
    );
    expect(listed.find((r) => r.id === without.id)!.sourceNote).toBeNull();
  });

  it("四原子类型可落库(claim/evidence/quote/qa)", async () => {
    for (const t of ["claim", "evidence", "quote", "qa"]) {
      const row = await repo.create(A, null, { title: `原子-${t}`, knowledgeType: t });
      expect(row.knowledgeType).toBe(t);
    }
  });

  it("usedCount = materialLinks(entity_type='knowledge') 反查计数;无用料 = 0", async () => {
    const { materialLinks } = await import("@creatoros/backend");
    const used = await repo.create(A, null, { title: "被用两次" });
    const unused = await repo.create(A, null, { title: "没被用" });
    await db.insert(materialLinks).values([
      {
        id: "ml-1",
        userId: A,
        projectId: "proj-1",
        contentOutputId: null,
        entityType: "knowledge",
        entityId: used.id,
        role: "reference",
        stage: "research",
        addedByType: "user",
        createdAt: NOW,
      },
      {
        id: "ml-2",
        userId: A,
        projectId: "proj-2",
        contentOutputId: null,
        entityType: "knowledge",
        entityId: used.id,
        role: "evidence",
        stage: "research",
        addedByType: "ai",
        createdAt: NOW,
      },
      // 干扰项:asset 链不计入;他人(B)的链不计入。
      {
        id: "ml-3",
        userId: A,
        projectId: "proj-1",
        contentOutputId: null,
        entityType: "asset",
        entityId: used.id,
        role: "broll",
        stage: "research",
        addedByType: "user",
        createdAt: NOW,
      },
      {
        id: "ml-4",
        userId: B,
        projectId: "proj-9",
        contentOutputId: null,
        entityType: "knowledge",
        entityId: used.id,
        role: "reference",
        stage: "research",
        addedByType: "user",
        createdAt: NOW,
      },
    ]);

    const listed = await repo.list(A, null);
    expect(listed.find((r) => r.id === used.id)!.usedCount).toBe(2);
    expect(listed.find((r) => r.id === unused.id)!.usedCount).toBe(0);
    const got = await repo.get(A, null, used.id);
    expect(got.usedCount).toBe(2);
    expect(got.usedInPublished).toBe(false); // 无 published publication
  });

  it("usedInPublished = 所挂项目存在 status='published' 的 publication", async () => {
    const { materialLinks, contentOutputs, publications } = await import(
      "@creatoros/backend"
    );
    const hit = await repo.create(A, null, { title: "进过已发布项目" });
    const miss = await repo.create(A, null, { title: "只进过草稿项目" });
    await db.insert(materialLinks).values([
      {
        id: "ml-p1",
        userId: A,
        projectId: "proj-pub",
        contentOutputId: null,
        entityType: "knowledge",
        entityId: hit.id,
        role: "reference",
        stage: "research",
        addedByType: "user",
        createdAt: NOW,
      },
      {
        id: "ml-p2",
        userId: A,
        projectId: "proj-draft",
        contentOutputId: null,
        entityType: "knowledge",
        entityId: miss.id,
        role: "reference",
        stage: "research",
        addedByType: "user",
        createdAt: NOW,
      },
    ]);
    // publications 无 project_id 列,经 content_output 归属项目。
    await db.insert(contentOutputs).values([
      {
        id: "co-pub",
        projectId: "proj-pub",
        title: "已发布产出",
        contentType: "video",
        status: "completed",
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: "co-draft",
        projectId: "proj-draft",
        title: "草稿产出",
        contentType: "video",
        status: "in_progress",
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]);
    await db.insert(publications).values([
      {
        id: "pub-1",
        userId: A,
        contentOutputId: "co-pub",
        platform: "douyin",
        accountReference: "acc-1",
        status: "published",
        publishedAt: NOW,
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: "pub-2",
        userId: A,
        contentOutputId: "co-draft",
        platform: "douyin",
        accountReference: "acc-1",
        status: "draft",
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]);

    const listed = await repo.list(A, null);
    expect(listed.find((r) => r.id === hit.id)!.usedInPublished).toBe(true);
    expect(listed.find((r) => r.id === hit.id)!.usedCount).toBe(1);
    expect(listed.find((r) => r.id === miss.id)!.usedInPublished).toBe(false);
    expect((await repo.get(A, null, hit.id)).usedInPublished).toBe(true);
  });
});
