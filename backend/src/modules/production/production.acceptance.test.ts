import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createDb, type Db, projects, contentOutputs } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import {
  createProductionService,
  type ProductionService,
} from "./production.service";
import { OwnershipError } from "./production.errors";

// Step 6 — SPEC §22 + foundation §5.6 acceptance for the Production module.
// Asserts the structural invariants the plan's acceptance checklist calls out:
//   - foundation §5 module layout present (service + repository + schema + tests);
//   - NO cross-module repository import (peer access only via index.ts services);
//   - Production never touches S3 — no ObjectStorage/S3 import in the repo;
//   - ExportRecord export/complete is idempotent (a re-delivered complete returns
//     the already-ready row without re-running the cross-module fan-out);
//   - multi-tenant: user A cannot get/update/segment/export user B's production.

const HERE = dirname(fileURLToPath(import.meta.url));

const NOW = "2026-06-21T00:00:00.000Z";
const ctxA: RequestContext = { userId: "user-a", requestId: "ra", source: "user", accountId: "acct-a" };
const ctxB: RequestContext = { userId: "user-b", requestId: "rb", source: "user", accountId: "acct-b" };

// [T-332 S2] 父锚种子:production 的读写都要经 content_output → project 的 strict 门,
// 测试先种宿主 project + content_output(带号),再操作 production。
async function seedOutput(
  db: Db,
  outputId: string,
  userId: string,
  accountId: string,
): Promise<void> {
  const projectId = `proj-of-${outputId}`;
  await db
    .insert(projects)
    .values({
      id: projectId,
      userId,
      accountId,
      title: "宿主项目",
      brief: "",
      briefDetail: {},
      contentCategory: "",
      source: "manual",
      platformRef: {},
      creationMode: "guided",
      status: "active",
      currentStage: "production",
      progressPct: 0,
      starred: false,
      startedAt: NOW,
      targetCompletedAt: null,
      completedAt: null,
      archivedAt: null,
      createdAt: NOW,
      updatedAt: NOW,
    })
    .onConflictDoNothing();
  await db
    .insert(contentOutputs)
    .values({
      id: outputId,
      projectId,
      title: "宿主产出",
      contentType: "video",
      format: "",
      aspectRatio: "",
      targetDurationSeconds: 0,
      status: "drafting",
      contentRole: null,
      primaryAssetId: null,
      createdAt: NOW,
      updatedAt: NOW,
    })
    .onConflictDoNothing();
}


function makeService(
  db: Db,
  tag = "a",
): {
  service: ProductionService;
  calls: { setPrimary: number; index: number; activity: number };
} {
  let seq = 0;
  const calls = { setPrimary: 0, index: 0, activity: 0 };
  const service = createProductionService({
    db,
    now: () => NOW,
    // tag the id space per service so two owner-scoped services over the SAME
    // pglite db never collide on a globally-unique PK (id is the PK; ownership
    // is enforced by the user_id column, not the id).
    nextId: (prefix: string) => `${prefix}-${tag}-${++seq}`,
    setPrimaryOutputAsset: () => {
      calls.setPrimary += 1;
      return Promise.resolve();
    },
    searchIndexAsset: () => {
      calls.index += 1;
      return Promise.resolve();
    },
    recordExportActivity: () => {
      calls.activity += 1;
      return Promise.resolve();
    },
  });
  return { service, calls };
}

describe("G10 — module-structure acceptance", () => {
  it("has the foundation §5 layout files", () => {
    const required = [
      "production.db-schema.ts",
      "production.repository.ts",
      "production.service.ts",
      "production.schema.ts",
      "production.transport.ts",
      "production.errors.ts",
      "index.ts",
      "production.repository.integration.test.ts",
      "production.service.test.ts",
      "production.contract.test.ts",
    ];
    for (const file of required) {
      expect(existsSync(join(HERE, file)), `missing ${file}`).toBe(true);
    }
  });

  it("has NO cross-module repository import in production.repository.ts", () => {
    const src = readFileSync(join(HERE, "production.repository.ts"), "utf8");
    const crossModule = /from\s+["']@\/server\/modules\/(?!production)/.test(src);
    expect(crossModule).toBe(false);
  });

  it("Production never touches S3: the repository imports no ObjectStorage/S3 port", () => {
    // SPEC §15 — object writes go through MockObjectStorage upstream; the
    // Production repository deals only in db rows, never an S3/storage client.
    const src = readFileSync(join(HERE, "production.repository.ts"), "utf8");
    expect(/ObjectStorage/i.test(src)).toBe(false);
    expect(/\bS3\b/.test(src)).toBe(false);
  });

  it("cross-module fan-out is reached only through injected service seams (no repo import in service)", () => {
    const src = readFileSync(join(HERE, "production.service.ts"), "utf8");
    const crossModuleRepo =
      /from\s+["']@\/server\/modules\/(?!production)[^"']*repository/.test(src);
    expect(crossModuleRepo).toBe(false);
  });
});

describe("G10 — domain acceptance (SPEC §22)", () => {
  let db: Db;

  beforeEach(async () => {
    ({ db } = await createDb());
    // [T-332 S2] 父锚种子:各租户/各号的宿主 output。
    await seedOutput(db, "output-acc-1", "user-a", "acct-a");
    await seedOutput(db, "output-a", "user-a", "acct-a");
    await seedOutput(db, "output-b", "user-b", "acct-b");
  });

  it("ExportRecord export/complete is idempotent — second complete does not re-fan-out", async () => {
    const { service, calls } = makeService(db);
    const prod = await service.getProduction(ctxA, "output-acc-1");
    const exp = await service.requestExport(ctxA, prod.id, {
      format: "mp4",
      resolution: "1080p",
      aspectRatio: "16:9",
    });
    const first = await service.completeExport(ctxA, exp.id, {
      resultAssetId: "asset-acc-1",
    });
    expect(first.status).toBe("ready");
    const second = await service.completeExport(ctxA, exp.id, {
      resultAssetId: "asset-acc-2",
    });
    // already-ready row returned unchanged; fan-out ran exactly once total.
    expect(second.status).toBe("ready");
    expect(second.resultAssetId).toBe("asset-acc-1");
    expect(calls).toEqual({ setPrimary: 1, index: 1, activity: 1 });
  });

  it("multi-tenant smoke: user A cannot get/update/segment/export user B's production", async () => {
    const { service: svcA } = makeService(db, "a");
    const { service: svcB } = makeService(db, "b");

    // ContentOutputs are user-owned upstream, so each tenant has its own output id
    // (the UNIQUE(content_output_id) is global per the data-model 0..1 relation).
    const a = await svcA.getProduction(ctxA, "output-a");
    const b = await svcB.getProduction(ctxB, "output-b");
    expect(a.id).not.toBe(b.id);
    expect(a.userId).toBe(ctxA.userId);
    expect(b.userId).toBe(ctxB.userId);

    // A's own output resolves to A's own row.
    await expect(
      svcA.updateProduction(ctxA, "output-a", { status: "recording" }),
    ).resolves.toMatchObject({ userId: ctxA.userId });
    // A cannot resolve B's output (scoped get → OwnershipError 404).
    await expect(
      svcA.updateProduction(ctxA, "output-b", { status: "recording" }),
    ).rejects.toBeInstanceOf(OwnershipError);
    await expect(svcA.createSegment(ctxA, b.id, {
      title: "x",
      position: 0,
      startMs: 0,
      endMs: 1000,
    })).rejects.toBeInstanceOf(OwnershipError);
    await expect(
      svcA.requestExport(ctxA, b.id, {
        format: "mp4",
        resolution: "1080p",
        aspectRatio: "16:9",
      }),
    ).rejects.toBeInstanceOf(OwnershipError);
    await expect(svcA.listSegments(ctxA, b.id)).rejects.toBeInstanceOf(
      OwnershipError,
    );
  });
});
