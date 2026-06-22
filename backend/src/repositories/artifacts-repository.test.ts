import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "../db";
import {
  createArtifactsRepository,
  type ArtifactsRepository,
} from "./artifacts-repository";

const FIXED_NOW = "2026-06-13T10:00:00+08:00";

function deterministicDeps(userId = "user-1") {
  const counters = new Map<string, number>();
  return {
    now: () => FIXED_NOW,
    // Namespace ids per userId so cross-user tests sharing a db don't collide on PK.
    nextId: (prefix: string) => {
      const n = (counters.get(prefix) ?? 0) + 1;
      counters.set(prefix, n);
      return `${prefix}-${userId}-${n}`;
    },
    userId,
  };
}

let db: Db;
let repo: ArtifactsRepository;

beforeEach(async () => {
  ({ db } = await createDb()); // fresh in-memory pglite per test
  repo = createArtifactsRepository(db, deterministicDeps());
});

describe("ArtifactsRepository (pglite-backed real persistence)", () => {
  it("creates an artifact with version #1 and reads it back from SQL", async () => {
    const created = await repo.create({
      projectId: "project-1",
      stage: "research",
      artifactType: "research_note",
      title: "选题调研",
      contentText: "first",
    });
    expect(created.id).toBe("artifact-user-1-1");
    expect(created.userId).toBe("user-1");
    expect(created.projectId).toBe("project-1");
    expect(created.status).toBe("drafting");
    expect(created.artifactType).toBe("research_note");
    // currentVersionId points at the freshly-minted version #1.
    expect(created.currentVersionId).toBe("artifactversion-user-1-1");

    const list = await repo.list();
    expect(list.map((a) => a.id)).toContain("artifact-user-1-1");

    const byProject = await repo.listByProject("project-1");
    expect(byProject.map((a) => a.id)).toContain("artifact-user-1-1");

    const fetched = await repo.get("artifact-user-1-1");
    expect(fetched.title).toBe("选题调研");

    const versions = await repo.listVersions("artifact-user-1-1");
    expect(versions).toHaveLength(1);
    expect(versions[0]!.versionNumber).toBe(1);
    expect(versions[0]!.contentText).toBe("first");
  });

  it("throws for a missing artifact", async () => {
    await expect(repo.get("nope")).rejects.toThrow(/not found/);
  });

  it("appends a version, preserves old rows, and moves currentVersionId (append-only)", async () => {
    const artifact = await repo.create({
      projectId: "project-1",
      stage: "research",
      artifactType: "research_note",
      title: "草稿",
      contentText: "v1",
    });
    const firstVersionId = artifact.currentVersionId;

    const appended = await repo.createVersion(artifact.id, {
      contentText: "v2",
      changeSummary: "tweak",
    });
    expect(appended.versionNumber).toBe(2);
    expect(appended.contentText).toBe("v2");
    expect(appended.changeSummary).toBe("tweak");
    expect(appended.id).not.toBe(firstVersionId);

    // Old version #1 is preserved unchanged (immutable append-only invariant).
    const versions = await repo.listVersions(artifact.id);
    expect(versions.map((v) => v.versionNumber)).toEqual([1, 2]);
    expect(versions[0]!.id).toBe(firstVersionId);
    expect(versions[0]!.contentText).toBe("v1");

    // currentVersionId now points at the appended version (persisted).
    const refetched = await repo.get(artifact.id);
    expect(refetched.currentVersionId).toBe(appended.id);
    expect(refetched.currentVersionId).not.toBe(firstVersionId);
  });

  it("keeps versionNumber monotonic across multiple edits", async () => {
    const artifact = await repo.create({
      projectId: "project-1",
      stage: "research",
      artifactType: "research_note",
      title: "T",
      contentText: "v1",
    });
    await repo.createVersion(artifact.id, { contentText: "v2" });
    const third = await repo.createVersion(artifact.id, { contentText: "v3" });
    expect(third.versionNumber).toBe(3);
    const versions = await repo.listVersions(artifact.id);
    expect(versions.map((v) => v.versionNumber)).toEqual([1, 2, 3]);
  });

  it("advances status through adjacent FSM transitions and archives", async () => {
    const a = await repo.create({
      projectId: "project-1",
      stage: "research",
      artifactType: "research_note",
      title: "T",
    });
    const inReview = await repo.transitionStatus(a.id, "in_review");
    expect(inReview.status).toBe("in_review");
    const approved = await repo.transitionStatus(a.id, "approved");
    expect(approved.status).toBe("approved");
    const archived = await repo.transitionStatus(a.id, "archived");
    expect(archived.status).toBe("archived");
    expect(archived.archivedAt).toBe(FIXED_NOW);
  });

  it("rejects an illegal (non-adjacent) status transition", async () => {
    const a = await repo.create({
      projectId: "project-1",
      stage: "research",
      artifactType: "research_note",
      title: "T",
    }); // drafting
    await expect(repo.transitionStatus(a.id, "approved")).rejects.toThrow(
      /illegal status transition/,
    );
  });

  it("patches title/stage with persisted updates", async () => {
    const a = await repo.create({
      projectId: "project-1",
      stage: "research",
      artifactType: "research_note",
      title: "T",
    });
    const patched = await repo.patch(a.id, { title: "改名", stage: "planning" });
    expect(patched.title).toBe("改名");
    expect(patched.stage).toBe("planning");
    // persisted: a fresh read reflects it
    const refetched = await repo.get(a.id);
    expect(refetched.title).toBe("改名");
    expect(refetched.stage).toBe("planning");
  });

  it("creates a relation between two artifacts", async () => {
    const a = await repo.create({
      projectId: "project-1",
      stage: "research",
      artifactType: "research_note",
      title: "A",
    });
    const b = await repo.create({
      projectId: "project-1",
      stage: "planning",
      artifactType: "content_outline",
      title: "B",
    });
    const relation = await repo.createRelation(a.id, {
      targetArtifactId: b.id,
      relationType: "derived_from",
    });
    expect(relation.sourceArtifactId).toBe(a.id);
    expect(relation.targetArtifactId).toBe(b.id);
    expect(relation.relationType).toBe("derived_from");
  });

  it("seeds artifacts idempotently", async () => {
    const seedRow = {
      id: "seed-artifact-1",
      userId: "user-1",
      projectId: "project-1",
      contentOutputId: null,
      currentVersionId: "seed-version-1",
      stage: "script",
      artifactType: "master_script",
      title: "种子稿",
      status: "drafting",
      archivedAt: null,
      createdAt: FIXED_NOW,
      updatedAt: FIXED_NOW,
    };
    await repo.seedArtifacts([seedRow]);
    await repo.seedArtifacts([seedRow]); // again — conflict ignored
    const list = await repo.list();
    expect(list.filter((a) => a.id === "seed-artifact-1")).toHaveLength(1);
  });

  it("denies cross-user access (ownership boundary)", async () => {
    const mine = await repo.create({
      projectId: "project-1",
      stage: "research",
      artifactType: "research_note",
      title: "私有产物",
    });

    // A repo bound to a different user must not see or mutate my artifact.
    const otherRepo = createArtifactsRepository(db, deterministicDeps("user-2"));
    await expect(otherRepo.get(mine.id)).rejects.toThrow(/not found/);
    await expect(
      otherRepo.createVersion(mine.id, { contentText: "intrusion" }),
    ).rejects.toThrow(/not found/);
    await expect(otherRepo.transitionStatus(mine.id, "in_review")).rejects.toThrow(
      /not found/,
    );

    // user-2's list does not include user-1's artifact.
    const otherList = await otherRepo.list();
    expect(otherList.map((a) => a.id)).not.toContain(mine.id);
  });
});
