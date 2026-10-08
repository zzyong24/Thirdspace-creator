import {projects,type Db as FixtureDb} from '@creatoros/backend';
async function seedOwnedProjects(db:FixtureDb){
 const rows=([["project-1", "user-a", "acct-default"], ["project-b", "user-b", "acct-default"], ["p-shared", "user-a", "acct-default"], ["p-shared-b", "user-b", "acct-default"], ["p-recon", "user-a", "acct-default"], ["proj-shared-1", "user-a", "acct-1"], ["proj-shared-2", "user-a", "acct-2"]] as Array<[string,string,string]>).map(([id,userId,accountId])=>({id,userId,accountId,title:'真实测试父项目',brief:'',creationMode:'guided',status:'active',currentStage:'script',startedAt:new Date().toISOString(),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}));
 await db.insert(projects).values(rows).onConflictDoNothing();
}
import { describe, it, expect, beforeEach } from "vitest";
import { createDb, eq, type Db } from "@creatoros/backend";
import {
  createArtifactRepository,
  resolveNextOrigin,
  type ArtifactRepository,
} from "./artifacts.repository";
import { OwnershipError } from "./artifacts.errors";
import { timelineSegments } from "./artifacts.db-schema";

// Step 1 (schema round-trip) + Step 2 (user-scoped repository) — pglite-backed.
// Ownership is the sole boundary (foundation §2/§5): user A cannot read user B's
// artifact; a cross-user id is indistinguishable from a missing one
// (OwnershipError → 404). Plus: schema round-trips, version-number monotonicity,
// restore re-points to an existing immutable version, replaceStructuredContent does
// delete-then-insert, getScriptSections is ordered by position.

const A = "user-a";
const B = "user-b";
const NOW = "2026-06-21T00:00:00.000Z";

// [T-332 S2] RepoDeps.accountId 已收成必填 string(strict 门):缺省固定测试号,
// 「null 全局视图」形态随 SPEC §4.2 裁决删除。
function deterministicDeps(userId: string, accountId = "acct-default") {
  const counters = new Map<string, number>();
  return {
    now: () => NOW,
    // Namespace ids by userId+accountId so two repos sharing the same pglite db
    // never mint colliding PKs (in the real app one shared createSeq serves all
    // ctx repos).
    nextId: (prefix: string) => {
      const n = (counters.get(prefix) ?? 0) + 1;
      counters.set(prefix, n);
      return `${prefix}-${userId}-${accountId}-${n}`;
    },
    userId,
    accountId,
  };
}

let db: Db;
let repoA: ArtifactRepository;

beforeEach(async () => {
  ({ db } = await createDb());
  await seedOwnedProjects(db);
  repoA = createArtifactRepository(db, deterministicDeps(A));
});

async function makeArtifact(
  repo: ArtifactRepository,
  overrides: Partial<{
    projectId: string;
    title: string;
    artifactType: string;
    stage: string;
  }> = {},
) {
  return repo.create({
    projectId: overrides.projectId ?? (repo===repoA?"project-1":"project-b"),
    title: overrides.title ?? "脚本",
    artifactType: overrides.artifactType ?? "master_script",
    stage: overrides.stage ?? "script",
  });
}

describe("artifacts.repository — schema round-trip (Step 1)", () => {
  it("inserts an artifact + version #1 and reads them back", async () => {
    const artifact = await makeArtifact(repoA, { title: "主脚本" });
    expect(artifact.userId).toBe(A);
    expect(artifact.status).toBe("drafting");
    expect(artifact.currentVersionId).not.toBeNull();

    const reread = await repoA.requireArtifact(artifact.id);
    expect(reread.title).toBe("主脚本");

    const versions = await repoA.listVersions(artifact.id);
    expect(versions).toHaveLength(1);
    expect(versions[0]!.versionNumber).toBe(1);
    expect(versions[0]!.id).toBe(artifact.currentVersionId);
  });
});

describe("artifacts.repository — ownership boundary (Step 2)", () => {
  it("user A cannot read user B's artifact (OwnershipError)", async () => {
    const repoB = createArtifactRepository(db, deterministicDeps(B));
    const owned = await makeArtifact(repoB, { title: "B 的脚本" });

    await expect(repoA.requireArtifact(owned.id)).rejects.toBeInstanceOf(
      OwnershipError,
    );
  });

  it("listByProject only returns the caller's artifacts", async () => {
    const repoB = createArtifactRepository(db, deterministicDeps(B));
    await makeArtifact(repoA, { projectId: "p-shared", title: "A1" });
    await makeArtifact(repoB, { projectId: "p-shared-b", title: "B1" });

    const aRows = await repoA.listByProject("p-shared");
    expect(aRows.map((r) => r.title)).toEqual(["A1"]);
  });
});

describe("artifacts.repository — append-only versioning (Step 2)", () => {
  it("[T-833] two writes from the same current version allow only one atomic winner", async () => {
    const artifact = await makeArtifact(repoA);
    const expectedCurrentVersionId = artifact.currentVersionId!;

    const results = await Promise.allSettled([
      repoA.createVersion(artifact.id, {
        contentText: "并发版本 A",
        changeSummary: "A",
        expectedCurrentVersionId,
      }),
      repoA.createVersion(artifact.id, {
        contentText: "并发版本 B",
        changeSummary: "B",
        expectedCurrentVersionId,
      }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(await repoA.listVersions(artifact.id)).toHaveLength(2);
  });

  it("[T-833] stale conditional restore changes nothing", async () => {
    const artifact = await makeArtifact(repoA);
    const v1Id = artifact.currentVersionId!;
    const v2 = await repoA.createVersion(artifact.id, {
      contentText: "第二版",
      changeSummary: "edit",
    });
    const v3 = await repoA.createVersion(artifact.id, {
      contentText: "第三版",
      changeSummary: "edit again",
    });

    await expect(repoA.restore(artifact.id, v1Id, v2.id)).rejects.toThrow();
    expect((await repoA.requireArtifact(artifact.id)).currentVersionId).toBe(v3.id);
  });

  it("createVersion appends max+1 and re-points currentVersionId", async () => {
    const artifact = await makeArtifact(repoA);
    const v2 = await repoA.createVersion(artifact.id, {
      contentText: "第二版",
      changeSummary: "edit",
    });
    expect(v2.versionNumber).toBe(2);

    const reread = await repoA.requireArtifact(artifact.id);
    expect(reread.currentVersionId).toBe(v2.id);

    const v3 = await repoA.createVersion(artifact.id, {
      contentText: "第三版",
      changeSummary: "edit2",
    });
    expect(v3.versionNumber).toBe(3);
  });

  it("createVersion records AI provenance when createdByType=ai", async () => {
    const artifact = await makeArtifact(repoA);
    const v = await repoA.createVersion(artifact.id, {
      contentText: "AI 草稿",
      changeSummary: "ai",
      createdByType: "ai",
      aiTaskId: "ai-task-1",
    });
    expect(v.createdByType).toBe("ai");
    expect(v.aiTaskId).toBe("ai-task-1");
  });

  it("restore re-points to the selected immutable version without appending", async () => {
    const artifact = await makeArtifact(repoA);
    const v1Id = artifact.currentVersionId!;
    await repoA.createVersion(artifact.id, {
      contentText: "第二版",
      changeSummary: "edit",
    });

    const restored = await repoA.restore(artifact.id, v1Id);
    expect(restored.currentVersionId).toBe(v1Id);

    const versions = await repoA.listVersions(artifact.id);
    expect(versions).toHaveLength(2);
  });

  it("restore is idempotent when the selected snapshot is already the current content", async () => {
    const artifact = await makeArtifact(repoA);
    const v1Id = artifact.currentVersionId!;
    await repoA.createVersion(artifact.id, {
      contentText: "第二版",
      changeSummary: "edit",
    });

    const firstRestore = await repoA.restore(artifact.id, v1Id);
    const secondRestore = await repoA.restore(artifact.id, v1Id);

    expect(secondRestore.currentVersionId).toBe(firstRestore.currentVersionId);
    expect(await repoA.listVersions(artifact.id)).toHaveLength(2);
  });

  it("restore exposes the selected version's exact script sections and timeline segments", async () => {
    const artifact = await makeArtifact(repoA);
    const v1Id = artifact.currentVersionId!;
    await repoA.replaceStructuredContent(v1Id, {
      scriptSections: [
        {
          sectionType: "hook",
          title: "开场",
          content: "当下稿面里的开场",
          position: 0,
          startSeconds: 0,
          endSeconds: 5,
        },
      ],
    });
    const sourceSections = await repoA.getScriptSections(v1Id);
    await repoA.replaceStructuredContent(v1Id, {
      timelineSegments: [
        {
          scriptSectionId: sourceSections[0]!.id,
          title: "开场镜头",
          position: 0,
          startMs: 0,
          endMs: 5000,
          productionData: { kind: "talking_head" },
        },
      ],
    });
    await repoA.createVersion(artifact.id, {
      contentText: "第二版",
      changeSummary: "edit",
    });

    const restored = await repoA.restore(artifact.id, v1Id);
    const restoredVersionId = restored.currentVersionId!;
    const restoredSections = await repoA.getScriptSections(restoredVersionId);
    const restoredTimeline = await db
      .select()
      .from(timelineSegments)
      .where(eq(timelineSegments.artifactVersionId, restoredVersionId));

    expect(restoredVersionId).toBe(v1Id);
    expect(restoredSections).toHaveLength(1);
    expect(restoredSections[0]!.id).toBe(sourceSections[0]!.id);
    expect(restoredSections[0]).toMatchObject({
      sectionType: "hook",
      title: "开场",
      content: "当下稿面里的开场",
      position: 0,
    });
    expect(restoredTimeline).toHaveLength(1);
    expect(restoredTimeline[0]).toMatchObject({
      scriptSectionId: restoredSections[0]!.id,
      title: "开场镜头",
      startMs: 0,
      endMs: 5000,
      productionData: { kind: "talking_head" },
    });
  });

  it("createRelation requires both ends owned by the caller", async () => {
    const repoB = createArtifactRepository(db, deterministicDeps(B));
    const a = await makeArtifact(repoA, { title: "A source" });
    const bTarget = await makeArtifact(repoB, { title: "B target" });

    await expect(
      repoA.createRelation(a.id, {
        targetArtifactId: bTarget.id,
        relationType: "references",
      }),
    ).rejects.toBeInstanceOf(OwnershipError);

    const a2 = await makeArtifact(repoA, { title: "A target" });
    const rel = await repoA.createRelation(a.id, {
      targetArtifactId: a2.id,
      relationType: "references",
    });
    expect(rel.sourceArtifactId).toBe(a.id);
    expect(rel.targetArtifactId).toBe(a2.id);
  });
});

describe("artifacts.repository — structured content (Step 2)", () => {
  it("replaceStructuredContent does delete-then-insert, ordered read-back", async () => {
    const artifact = await makeArtifact(repoA);
    const versionId = artifact.currentVersionId!;

    await repoA.replaceStructuredContent(versionId, {
      scriptSections: [
        { sectionType: "intro", title: "开场", content: "...", position: 1 },
        { sectionType: "hook", title: "钩子", content: "...", position: 0 },
      ],
    });
    let sections = await repoA.getScriptSections(versionId);
    expect(sections.map((s) => s.position)).toEqual([0, 1]);
    expect(sections.map((s) => s.sectionType)).toEqual(["hook", "intro"]);

    // Replace wipes prior rows (delete-then-insert).
    await repoA.replaceStructuredContent(versionId, {
      scriptSections: [
        { sectionType: "outro", title: "结尾", content: "...", position: 0 },
      ],
    });
    sections = await repoA.getScriptSections(versionId);
    expect(sections).toHaveLength(1);
    expect(sections[0]!.sectionType).toBe("outro");
  });

  // [T-055f] thesis_nodes 表退役(用户拍板③,迁移 0015)—— 写入用例随之删除。
});

// F1 (T-030-D4, SPEC §4.5) — `artifacts.origin` provenance + lifecycle.
// Test 5 (migration): the `origin` column exists after createDb() applies
// migration 0010 (a round-trip write/read of origin proves the column).
// Test 4 (lifecycle): a user edit (createdByType !== 'ai') flips a
// 'reconstructed' artifact back to 'user'; an AI edit does NOT.
describe("artifacts.repository — origin provenance (F1)", () => {
  it("migration 0010: origin column round-trips (create with origin='reconstructed')", async () => {
    const artifact = await repoA.create({
      projectId: "p-recon",
      title: "AI 反推研究",
      artifactType: "research_note",
      stage: "research",
      origin: "reconstructed",
    });
    // Column exists + persisted (would throw on a missing column at migrate/insert).
    expect(artifact.origin).toBe("reconstructed");
    const reread = await repoA.requireArtifact(artifact.id);
    expect(reread.origin).toBe("reconstructed");
  });

  it("create without origin defaults to null (≡ user-authored / legacy)", async () => {
    const artifact = await makeArtifact(repoA);
    expect(artifact.origin).toBeNull();
  });

  it("user edit flips a 'reconstructed' artifact's origin to 'user'", async () => {
    const artifact = await repoA.create({
      projectId: "p-recon",
      title: "AI 反推策划",
      artifactType: "content_contract",
      stage: "planning",
      origin: "reconstructed",
    });
    expect(artifact.origin).toBe("reconstructed");

    // User edits it (new version, createdByType defaults to 'user') → confirmed.
    await repoA.createVersion(artifact.id, {
      contentText: "用户改过的策划",
      changeSummary: "用户编辑",
    });
    const afterUserEdit = await repoA.requireArtifact(artifact.id);
    expect(afterUserEdit.origin).toBe("user");
  });

  it("AI edit does NOT flip a 'reconstructed' artifact (only a user edit confirms)", async () => {
    const artifact = await repoA.create({
      projectId: "p-recon",
      title: "AI 反推研究",
      artifactType: "trend_analysis",
      stage: "research",
      origin: "reconstructed",
    });
    // An AI-authored version leaves origin as 'reconstructed' (AI never confirms).
    await repoA.createVersion(artifact.id, {
      contentText: "AI 又改了一版",
      changeSummary: "ai",
      createdByType: "ai",
      aiTaskId: "ai-task-x",
    });
    const afterAiEdit = await repoA.requireArtifact(artifact.id);
    expect(afterAiEdit.origin).toBe("reconstructed");
  });

  it("resolveNextOrigin: pure lifecycle table", () => {
    // explicit request always wins
    expect(resolveNextOrigin(null, "reconstructed", "ai")).toBe("reconstructed");
    expect(resolveNextOrigin("reconstructed", "user", "ai")).toBe("user");
    // user edit flips reconstructed → user
    expect(resolveNextOrigin("reconstructed", undefined, "user")).toBe("user");
    expect(resolveNextOrigin("reconstructed", undefined, undefined)).toBe("user");
    // AI edit leaves reconstructed untouched
    expect(resolveNextOrigin("reconstructed", undefined, "ai")).toBe(
      "reconstructed",
    );
    // non-reconstructed origins are left as-is
    expect(resolveNextOrigin("user", undefined, "user")).toBe("user");
    expect(resolveNextOrigin(null, undefined, "user")).toBeNull();
    expect(resolveNextOrigin(null, undefined, "ai")).toBeNull();
  });
});

// [T-332 S2 · ISO-02/08] 同一 user 下按号(account_id)strict 隔离门。artifacts 是
// owned-root;子表经 requireArtifact 父锚门透传继承。无「null 全局视图」形态。
describe("artifacts.repository — per-account strict isolation (T-332 S2)", () => {
  it("accountId 设时 listByProject 只返该号的 artifact", async () => {
    const repoAcct1 = createArtifactRepository(db, deterministicDeps(A, "acct-1"));
    const repoAcct2 = createArtifactRepository(db, deterministicDeps(A, "acct-2"));
    await repoAcct1.create({
      projectId: "proj-shared-1",
      title: "号1稿",
      artifactType: "master_script",
      stage: "script",
    });
    await repoAcct2.create({
      projectId: "proj-shared-2",
      title: "号2稿",
      artifactType: "master_script",
      stage: "script",
    });
    const list1 = await repoAcct1.listByProject("proj-shared-1");
    expect(list1.map((a) => a.title)).toEqual(["号1稿"]);
    const list2 = await repoAcct2.listByProject("proj-shared-2");
    expect(list2.map((a) => a.title)).toEqual(["号2稿"]);
  });

  it("accountId 设时 requireArtifact 拿不到别号的行 → OwnershipError", async () => {
    const repoAcct1 = createArtifactRepository(db, deterministicDeps(A, "acct-1"));
    const repoAcct2 = createArtifactRepository(db, deterministicDeps(A, "acct-2"));
    const a2 = await repoAcct2.create({
      projectId: "proj-shared-2",
      title: "号2稿",
      artifactType: "master_script",
      stage: "script",
    });
    await expect(repoAcct1.requireArtifact(a2.id)).rejects.toBeInstanceOf(
      OwnershipError,
    );
    // 归属号能拿到。
    expect((await repoAcct2.requireArtifact(a2.id)).id).toBe(a2.id);
  });

  it("create stamp:artifact 行落库带 accountId", async () => {
    const repoAcct1 = createArtifactRepository(db, deterministicDeps(A, "acct-1"));
    const a = await repoAcct1.create({
      projectId: "proj-shared-1",
      title: "号1稿",
      artifactType: "master_script",
      stage: "script",
    });
    expect(a.accountId).toBe("acct-1");
  });

  // [T-332 S2 · §4.5 父锚继承核验] 子表 script_sections 经父锚门透传:跨号 version id
  // 读 getScriptSections → OwnershipError 404(不再依赖调用方先 getArtifact 的口头约定)。
  it("getScriptSections 跨号 version → OwnershipError;本号读回结构化内容", async () => {
    const repoAcct1 = createArtifactRepository(db, deterministicDeps(A, "acct-1"));
    const repoAcct2 = createArtifactRepository(db, deterministicDeps(A, "acct-2"));
    const a1 = await repoAcct1.create({
      projectId: "proj-shared-1",
      title: "号1稿",
      artifactType: "master_script",
      stage: "script",
    });
    await repoAcct1.replaceStructuredContent(a1.currentVersionId!, {
      scriptSections: [{ sectionType: "hook", title: "开场", content: "钩子", position: 0 }],
    });
    // 本号:父锚门放行,读回结构化内容。
    const sections = await repoAcct1.getScriptSections(a1.currentVersionId!);
    expect(sections.map((x) => x.title)).toEqual(["开场"]);
    // 跨号:父锚门 404,子表行零泄漏。
    await expect(
      repoAcct2.getScriptSections(a1.currentVersionId!),
    ).rejects.toBeInstanceOf(OwnershipError);
  });
});
