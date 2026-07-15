import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createDb, type Db } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import { createArtifactsService } from "./artifacts.service";
import { OwnershipError } from "./artifacts.errors";

// Step 7 — SPEC §22 + foundation §5.6 acceptance for the Artifacts module.

const HERE = dirname(fileURLToPath(import.meta.url));

const NOW = "2026-06-21T00:00:00.000Z";
// [T-332 S2] strict 门下 ctx 必带号。
const ctxA: RequestContext = { userId: "user-a", requestId: "ra", source: "user", accountId: "acct-a" };
const ctxB: RequestContext = { userId: "user-b", requestId: "rb", source: "user", accountId: "acct-b" };

function makeService(db: Db) {
  let seq = 0;
  return createArtifactsService({
    db,
    now: () => NOW,
    nextId: (prefix: string) => `${prefix}-${++seq}`,
  });
}

describe("G1 — module-structure acceptance", () => {
  it("has the foundation §5 layout files", () => {
    const required = [
      "artifacts.db-schema.ts",
      "artifacts.repository.ts",
      "artifacts.service.ts",
      "artifacts.schema.ts",
      "artifacts.transport.ts",
      "artifacts.errors.ts",
      "index.ts",
      "artifacts.repository.integration.test.ts",
      "artifacts.service.test.ts",
      "artifacts.contract.test.ts",
    ];
    for (const file of required) {
      expect(existsSync(join(HERE, file)), `missing ${file}`).toBe(true);
    }
  });

  it("has NO cross-module repository import in artifacts.repository.ts", () => {
    const src = readFileSync(join(HERE, "artifacts.repository.ts"), "utf8");
    const crossModule = /from\s+["']@\/server\/modules\/(?!artifacts)/.test(src);
    expect(crossModule).toBe(false);
  });

  it("ArtifactVersion is immutable: repo never UPDATEs or DELETEs an artifact_versions row", () => {
    // SPEC §22 + data-model §9 rule 6 — grep the repo source. Versions are only
    // ever INSERTed; edits/restores mint a NEW row and move artifacts.currentVersionId.
    const src = readFileSync(join(HERE, "artifacts.repository.ts"), "utf8");
    expect(/update\(\s*artifactVersions\s*\)/.test(src)).toBe(false);
    expect(/delete\(\s*artifactVersions\s*\)/.test(src)).toBe(false);
  });
});

describe("G2 — domain acceptance (SPEC §22)", () => {
  let db: Db;
  let service: ReturnType<typeof createArtifactsService>;

  beforeEach(async () => {
    ({ db } = await createDb());
    service = makeService(db);
  });

  async function seed(ctx: RequestContext, title = "脚本") {
    return service.createArtifact(ctx, {
      projectId: "project-1",
      title,
      artifactType: "master_script",
      stage: "script",
    });
  }

  it("ArtifactVersion immutable: v1 byte-identical after v2 appended", async () => {
    const artifact = await seed(ctxA);
    const before = (await service.listVersions(ctxA, artifact.id))[0];
    await service.createVersion(ctxA, artifact.id, {
      contentText: "v2",
      changeSummary: "edit",
    });
    const after = (await service.listVersions(ctxA, artifact.id))[0];
    expect(after).toEqual(before);
  });

  it("currentVersionId always points at a version of the SAME artifact (rule 7)", async () => {
    const artifact = await seed(ctxA);
    const v2 = await service.createVersion(ctxA, artifact.id, {
      contentText: "v2",
      changeSummary: "edit",
    });
    const reread = await service.getArtifact(ctxA, artifact.id);
    expect(reread.currentVersionId).toBe(v2.id);
    const versions = await service.listVersions(ctxA, artifact.id);
    expect(versions.some((v) => v.id === reread.currentVersionId)).toBe(true);
    expect(versions.every((v) => v.artifactId === artifact.id)).toBe(true);
  });

  it("AI candidate-confirm: AI only supplies a candidate via createVersion(createdByType:'ai')", async () => {
    const artifact = await seed(ctxA);
    // This is the only seam AI touches — there is no AI-bypass that writes a
    // current version directly. The candidate is promoted through createVersion.
    const candidate = await service.createVersion(ctxA, artifact.id, {
      contentText: "AI 候选",
      changeSummary: "ai",
      createdByType: "ai",
      aiTaskId: "ai-task-1",
    });
    expect(candidate.createdByType).toBe("ai");
    const reread = await service.getArtifact(ctxA, artifact.id);
    expect(reread.currentVersionId).toBe(candidate.id);
  });

  it("multi-tenant smoke: user A cannot list/get/version/restore/relate user B's artifacts", async () => {
    const a = await seed(ctxA, "A 的");
    const b = await seed(ctxB, "B 的");

    const aList = await service.listProjectArtifacts(ctxA, "project-1");
    expect(aList.every((row) => row.userId === ctxA.userId)).toBe(true);
    expect(aList.some((row) => row.id === b.id)).toBe(false);

    await expect(service.getArtifact(ctxA, b.id)).rejects.toBeInstanceOf(
      OwnershipError,
    );
    await expect(
      service.createVersion(ctxA, b.id, { contentText: "x", changeSummary: "x" }),
    ).rejects.toBeInstanceOf(OwnershipError);
    await expect(
      service.restoreVersion(ctxA, b.id, b.currentVersionId!),
    ).rejects.toBeInstanceOf(OwnershipError);
    await expect(
      service.createRelation(ctxA, a.id, {
        targetArtifactId: b.id,
        relationType: "references",
      }),
    ).rejects.toBeInstanceOf(OwnershipError);
  });
});
