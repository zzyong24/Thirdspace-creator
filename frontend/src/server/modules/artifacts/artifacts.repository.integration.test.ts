import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import {
  createArtifactRepository,
  type ArtifactRepository,
} from "./artifacts.repository";
import { OwnershipError } from "./artifacts.errors";

// Step 1 (schema round-trip) + Step 2 (user-scoped repository) — pglite-backed.
// Ownership is the sole boundary (foundation §2/§5): user A cannot read user B's
// artifact; a cross-user id is indistinguishable from a missing one
// (OwnershipError → 404). Plus: schema round-trips, version-number monotonicity,
// restore clones content into a NEW version, replaceStructuredContent does
// delete-then-insert, getScriptSections is ordered by position.

const A = "user-a";
const B = "user-b";
const NOW = "2026-06-21T00:00:00.000Z";

function deterministicDeps(userId: string) {
  const counters = new Map<string, number>();
  return {
    now: () => NOW,
    // Namespace ids by userId so two repos sharing the same pglite db never mint
    // colliding PKs (in the real app one shared createSeq serves all ctx repos).
    nextId: (prefix: string) => {
      const n = (counters.get(prefix) ?? 0) + 1;
      counters.set(prefix, n);
      return `${prefix}-${userId}-${n}`;
    },
    userId,
  };
}

let db: Db;
let repoA: ArtifactRepository;

beforeEach(async () => {
  ({ db } = await createDb());
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
    projectId: overrides.projectId ?? "project-1",
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
    await makeArtifact(repoB, { projectId: "p-shared", title: "B1" });

    const aRows = await repoA.listByProject("p-shared");
    expect(aRows.map((r) => r.title)).toEqual(["A1"]);
  });
});

describe("artifacts.repository — append-only versioning (Step 2)", () => {
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

  it("restore clones the target version content into a NEW version (max+1)", async () => {
    const artifact = await makeArtifact(repoA);
    const v1Id = artifact.currentVersionId!;
    await repoA.createVersion(artifact.id, {
      contentText: "第二版",
      changeSummary: "edit",
    });

    const restored = await repoA.restore(artifact.id, v1Id);
    // currentVersionId is the NEW clone, never the old id.
    expect(restored.currentVersionId).not.toBe(v1Id);

    const versions = await repoA.listVersions(artifact.id);
    expect(versions).toHaveLength(3);
    const clone = versions[2]!;
    expect(clone.versionNumber).toBe(3);
    expect(clone.id).toBe(restored.currentVersionId);
    // Cloned the v1 (empty) content text.
    expect(clone.contentText).toBe(versions[0]!.contentText);
    expect(clone.changeSummary).toContain("restore");
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

  it("replaceStructuredContent writes thesis nodes for a version", async () => {
    const artifact = await makeArtifact(repoA, { artifactType: "thesis_tree" });
    const versionId = artifact.currentVersionId!;
    await repoA.replaceStructuredContent(versionId, {
      thesisNodes: [
        {
          nodeType: "root",
          parentNodeId: null,
          title: "核心论点",
          content: "...",
          position: 0,
        },
      ],
    });
    const nodes = await repoA.getThesisNodes(versionId);
    expect(nodes).toHaveLength(1);
    expect(nodes[0]!.nodeType).toBe("root");
  });
});
