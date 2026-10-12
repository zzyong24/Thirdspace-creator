import {platformAccounts as originalAccounts,type Db as OwnedFixtureDb} from "@creatoros/backend";
import {createAccountGroupService} from "../platform-account/account-group.service";
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
// [T-332 S2] strict 号维度:repo 一律要求非空 accountId(service 层 requireAccountId
// 已断言),测试里为两个 user 各配一个默认号。
const ACC_A = "acct-a";
const ACC_B = "acct-b";
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
  await seedOwnedKnowledgeAccount(db,A,ACC_A);
  await seedOwnedKnowledgeAccount(db,B,ACC_B);
  repo = createKnowledgeRepository(db, deterministicDeps());
});

// 战绩fixture使用真实项目父行及legacy平台账号，接受当前SQL父授权stamp。
async function seedStatsProjects(specs:ReadonlyArray<readonly [string,string,string]>) {
  const {projects,platformAccounts}=await import("@creatoros/backend");
  const groups=createAccountGroupService({db,...deterministicDeps()});
  for(const [id,userId,accountId] of specs){
    await db.insert(platformAccounts).values({id:accountId,userId,platform:"douyin",accountHandle:accountId,externalAccountId:`sec_${accountId}`,createdAt:NOW,updatedAt:NOW}).onConflictDoNothing();
    await groups.ensureLegacyGroups({userId,requestId:"stats-legacy-fixture",source:"user"});
    await db.insert(projects).values({id,userId,groupId:`grp_legacy_${accountId}`,accountId,title:id,creationMode:"free",status:"active",currentStage:"script",startedAt:NOW,createdAt:NOW,updatedAt:NOW});
  }
}

describe("knowledge.repository — ownership enforced (multi-tenant)", () => {
  it("list is user-scoped: A sees only A's items", async () => {
    await repo.create(A, ACC_A, { title: "A 的笔记" });
    await repo.create(B, ACC_B, { title: "B 的笔记" });
    const aRows = await repo.list(A, ACC_A);
    expect(aRows).toHaveLength(1);
    expect(aRows[0]!.title).toBe("A 的笔记");
    expect(aRows[0]!.userId).toBe(A);
  });

  it("[T-547] list 按写入时间倒序返回，最新导入排在最前", async () => {
    let tick = 0;
    const deps = deterministicDeps();
    const orderedRepo = createKnowledgeRepository(db, {
      ...deps,
      now: () =>
        new Date(Date.UTC(2026, 6, 26, 0, 0, tick++)).toISOString(),
    });
    const older = await orderedRepo.create(A, ACC_A, { title: "先导入" });
    const newer = await orderedRepo.create(A, ACC_A, { title: "后导入" });

    const rows = await orderedRepo.list(A, ACC_A);
    expect(rows.map((row) => row.id)).toEqual([newer.id, older.id]);
  });

  it("get(B, aItemId) throws OwnershipError (no existence leak)", async () => {
    const a = await repo.create(A, ACC_A, { title: "A 的笔记" });
    await expect(repo.get(B, ACC_B, a.id)).rejects.toBeInstanceOf(OwnershipError);
    // A can still get its own.
    const got = await repo.get(A, ACC_A, a.id);
    expect(got.id).toBe(a.id);
  });

  it("createRevision(B, aItemId) throws — cannot revise A's item", async () => {
    const a = await repo.create(A, ACC_A, { title: "A 的笔记" });
    await expect(
      repo.createRevision(B, ACC_B, a.id, { content: "篡改" }),
    ).rejects.toBeInstanceOf(OwnershipError);
  });

  it("[T-211] renameTitle 只改标题(content/status/currentRevisionId 不变)", async () => {
    const a = await repo.create(A, ACC_A, { title: "旧标题", content: "正文" });
    const renamed = await repo.renameTitle(A, ACC_A, a.id, "新标题");
    expect(renamed.title).toBe("新标题");
    expect(renamed.status).toBe("active");
    // 不新建 revision:currentRevisionId 保持,内容不变。
    expect(renamed.currentRevisionId).toBe(a.currentRevisionId);
    const rev = await repo.getRevision(A, ACC_A, renamed.currentRevisionId);
    expect(rev.content).toBe("正文");
    // 读回确认落库。
    const got = await repo.get(A, ACC_A, a.id);
    expect(got.title).toBe("新标题");
  });

  it("[T-211] renameTitle(B, aItemId) throws — 跨用户不能改 A 的标题", async () => {
    const a = await repo.create(A, ACC_A, { title: "A 的标题" });
    await expect(
      repo.renameTitle(B, ACC_B, a.id, "被篡改"),
    ).rejects.toBeInstanceOf(OwnershipError);
    // A 的标题未被动。
    expect((await repo.get(A, ACC_A, a.id)).title).toBe("A 的标题");
  });

  it("createRelation cannot link to B's item (both ends must be owned)", async () => {
    const a1 = await repo.create(A, ACC_A, { title: "A1" });
    const b1 = await repo.create(B, ACC_B, { title: "B1" });
    await expect(
      repo.createRelation(A, ACC_A, a1.id, {
        targetKnowledgeId: b1.id,
        relationType: "references",
      }),
    ).rejects.toBeInstanceOf(OwnershipError);
  });

  it("createRelation rejects a self-link with ConflictError", async () => {
    const a1 = await repo.create(A, ACC_A, { title: "A1" });
    await expect(
      repo.createRelation(A, ACC_A, a1.id, {
        targetKnowledgeId: a1.id,
        relationType: "references",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("create produces revision #1 and sets currentRevisionId", async () => {
    const a = await repo.create(A, ACC_A, { title: "A", content: "v1" });
    expect(a.status).toBe("active");
    expect(a.sourceType).toBe("manual");
    const rev = await repo.getRevision(A, ACC_A, a.currentRevisionId);
    expect(rev.revisionNumber).toBe(1);
    expect(rev.content).toBe("v1");
  });

  it("a second revision yields #2, repoints currentRevisionId, leaves #1 unchanged (append-only)", async () => {
    const a = await repo.create(A, ACC_A, { title: "A", content: "v1" });
    const firstRevId = a.currentRevisionId;
    const firstRevBefore = await repo.getRevision(A, ACC_A, firstRevId);

    const rev2 = await repo.createRevision(A, ACC_A, a.id, { content: "v2" });
    expect(rev2.revisionNumber).toBe(2);
    expect(rev2.content).toBe("v2");

    const itemAfter = await repo.get(A, ACC_A, a.id);
    expect(itemAfter.currentRevisionId).toBe(rev2.id);
    expect(itemAfter.currentRevisionId).not.toBe(firstRevId);

    // Revision #1 row is byte-identical (append-only — never UPDATEd/DELETEd).
    const firstRevAfter = await repo.getRevision(A, ACC_A, firstRevId);
    expect(firstRevAfter).toEqual(firstRevBefore);
  });

  it("createRelation between two owned items returns a numeric strength", async () => {
    const a1 = await repo.create(A, ACC_A, { title: "A1" });
    const a2 = await repo.create(A, ACC_A, { title: "A2" });
    const rel = await repo.createRelation(A, ACC_A, a1.id, {
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

  // [T-332 S2] 号维度 strict 隔离(SPEC §4.1/§4.5):同一 user 下两个抖音号,
  // 读写一律 eq(account_id)——无 OR-NULL 兼容分支、无 null 退化全量。
  it("accountId scopes reads strictly within a user (A 号知识 B 号不可见)", async () => {
    const ACC_1 = "account-1";
    const ACC_2 = "account-2";
    for(const account of [ACC_1,ACC_2])await seedOwnedKnowledgeAccount(db,A,account);
    // 同一 user A,分别以两个号 create(号维度随调用透传)。
    const k1 = await repo.create(A, ACC_1, { title: "号1 笔记" });
    const k2 = await repo.create(A, ACC_2, { title: "号2 笔记" });
    // create stamp:account_id 落到行上(NOT NULL,ISO-01)。
    expect(k1.accountId).toBe(ACC_1);
    expect(k2.accountId).toBe(ACC_2);

    // strict list:每号只见自己的行,双向零泄漏(ISO-02/ISO-08)。
    const list1 = await repo.list(A, ACC_1);
    expect(list1.map((r) => r.id)).toEqual([k1.id]);
    const list2 = await repo.list(A, ACC_2);
    expect(list2.map((r) => r.id)).toEqual([k2.id]);

    // 跨号 by-id:号2 视角取号1 的行 → OwnershipError(404,不泄露存在,§4.5)。
    await expect(repo.get(A, ACC_2, k1.id)).rejects.toBeInstanceOf(
      OwnershipError,
    );
    await expect(repo.get(A, ACC_1, k2.id)).rejects.toBeInstanceOf(
      OwnershipError,
    );
    // 本号 get 正常。
    expect((await repo.get(A, ACC_1, k1.id)).id).toBe(k1.id);
    expect((await repo.get(A, ACC_2, k2.id)).id).toBe(k2.id);
  });

  // [T-332 S2 · ISO-06 例外口] 组合根种子巡检:user 级跨号读 + 跨号标题修复。
  it("listAllAccountsSystem / renameTitleSystem are user-level (跨号可见/可改,仅系统巡检用)", async () => {
    for(const account of ["account-1","account-2"])await seedOwnedKnowledgeAccount(db,A,account);
    const k1 = await repo.create(A, "account-1", { title: "号1 笔记" });
    const k2 = await repo.create(A, "account-2", { title: "号2 笔记" });
    await repo.create(B, ACC_B, { title: "别人的" });

    // user 级全量:同 user 跨号全见;他人不可见。
    const all = await repo.listAllAccountsSystem(A);
    expect(all.map((r) => r.id).sort()).toEqual([k1.id, k2.id].sort());

    // 跨号标题修复:无 account 门,但 user 门仍在。
    const renamed = await repo.renameTitleSystem(A, k2.id, "改过的号2 笔记");
    expect(renamed.title).toBe("改过的号2 笔记");
    expect(renamed.currentRevisionId).toBe(k2.currentRevisionId);
    await expect(
      repo.renameTitleSystem(B, k1.id, "越权"),
    ).rejects.toBeInstanceOf(OwnershipError);
  });
});

// [T-079a] 出处 + 战绩投影(SPEC 2026-07-03-knowledge-asset-redesign §1)。
describe("knowledge.repository — sourceNote 往返 + 战绩投影 (T-079a)", () => {
  it("create 透传 sourceNote,get/list 原样读回;缺省为 NULL", async () => {
    const withNote = await repo.create(A, ACC_A, {
      title: "时区、UA、TLS 指纹任何两项一致就会被标记",
      knowledgeType: "quote",
      sourceNote: "Reddit r/ClaudeAI 用户 @sysadmthrowaway 原帖,需核实",
    });
    expect(withNote.knowledgeType).toBe("quote");
    expect(withNote.sourceNote).toBe(
      "Reddit r/ClaudeAI 用户 @sysadmthrowaway 原帖,需核实",
    );

    const without = await repo.create(A, ACC_A, { title: "无出处" });
    expect(without.sourceNote).toBeNull();

    const listed = await repo.list(A, ACC_A);
    expect(listed.find((r) => r.id === withNote.id)!.sourceNote).toContain(
      "需核实",
    );
    expect(listed.find((r) => r.id === without.id)!.sourceNote).toBeNull();
  });

  it("四原子类型可落库(claim/evidence/quote/qa)", async () => {
    for (const t of ["claim", "evidence", "quote", "qa"]) {
      const row = await repo.create(A, ACC_A, { title: `原子-${t}`, knowledgeType: t });
      expect(row.knowledgeType).toBe(t);
    }
  });

  it("usedCount = materialLinks(entity_type='knowledge') 反查计数;无用料 = 0", async () => {
    const { materialLinks,assets } = await import("@creatoros/backend");
    await seedStatsProjects([["proj-1",A,ACC_A],["proj-2",A,ACC_A],["proj-9",B,ACC_B]]);
    const used = await repo.create(A, ACC_A, { title: "被用两次" });
    const unused = await repo.create(A, ACC_A, { title: "没被用" });
    const bUsed=await repo.create(B,ACC_B,{title:"B真实干扰知识"});
    await db.insert(assets).values({id:used.id,userId:A,accountId:ACC_A,groupId:`grp_legacy_${ACC_A}`,assetType:"image",name:"同ID真实素材干扰",createdAt:NOW,updatedAt:NOW});
    await db.insert(materialLinks).values([
      {
        id: "ml-1",
        userId: A,
        accountId: ACC_A,
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
        accountId: ACC_A,
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
        accountId: ACC_A,
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
        accountId: ACC_B,
        projectId: "proj-9",
        contentOutputId: null,
        entityType: "knowledge",
        entityId: bUsed.id,
        role: "reference",
        stage: "research",
        addedByType: "user",
        createdAt: NOW,
      },
    ]);

    const listed = await repo.list(A, ACC_A);
    expect(listed.find((r) => r.id === used.id)!.usedCount).toBe(2);
    expect(listed.find((r) => r.id === unused.id)!.usedCount).toBe(0);
    const got = await repo.get(A, ACC_A, used.id);
    expect(got.usedCount).toBe(2);
    expect(got.usedInPublished).toBe(false); // 无 published publication
  });

  it("usedInPublished = 所挂项目存在 status='published' 的 publication", async () => {
    const { materialLinks, contentOutputs, publications } = await import(
      "@creatoros/backend"
    );
    await seedStatsProjects([["proj-pub",A,ACC_A],["proj-draft",A,ACC_A]]);
    const hit = await repo.create(A, ACC_A, { title: "进过已发布项目" });
    const miss = await repo.create(A, ACC_A, { title: "只进过草稿项目" });
    await db.insert(materialLinks).values([
      {
        id: "ml-p1",
        userId: A,
        accountId: ACC_A,
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
        accountId: ACC_A,
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
        // [T-332 S1] publications.account_id NOT NULL 收口后,测试夹具必须带号。
        accountId: ACC_A,
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
        accountId: ACC_A,
        contentOutputId: "co-draft",
        platform: "douyin",
        accountReference: "acc-1",
        status: "draft",
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]);

    const listed = await repo.list(A, ACC_A);
    expect(listed.find((r) => r.id === hit.id)!.usedInPublished).toBe(true);
    expect(listed.find((r) => r.id === hit.id)!.usedCount).toBe(1);
    expect(listed.find((r) => r.id === miss.id)!.usedInPublished).toBe(false);
    expect((await repo.get(A, ACC_A, hit.id)).usedInPublished).toBe(true);
  });
});

async function seedOwnedKnowledgeAccount(db:OwnedFixtureDb,userId:string,accountId:string){
 const stamp="2026-06-21T00:00:00.000Z";
 await db.insert(originalAccounts).values({id:accountId,userId,platform:'douyin',accountHandle:accountId,createdAt:stamp,updatedAt:stamp}).onConflictDoNothing();
 await createAccountGroupService({db,now:()=>stamp,nextId:prefix=>`${prefix}-${accountId}-fixture`}).ensureLegacyGroups({userId,requestId:'original-knowledge-fixture',source:'user'});
}
