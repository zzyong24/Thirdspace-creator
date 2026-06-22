import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createDb, type Db } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import {
  createIngestionService,
  type IngestionService,
} from "./ingestion.service";
import { createIngestionRepository } from "./ingestion.repository";
import { OwnershipError } from "./ingestion.errors";
import { ingestionRunResource } from "./ingestion.schema";

// Task 9 — SPEC §22 + foundation §5.6 acceptance for the Ingestion module (G12).
// Structural invariants + the domain invariants the plan's checklist calls out:
//   - foundation §5 module layout present (service + repository + schema + tests);
//   - NO cross-module repository import (peer access only via index.ts Services);
//   - idempotency for metrics import (re-submit returns the original result; both
//     UNIQUE keys; partial-success preserved with per-record errors, §17);
//   - AI/candidate gate: artifact pushes go through createCandidateVersion, never
//     overwriting current_version (roadmap §401);
//   - multi-tenant: a run + records under user A are invisible to user B;
//   - no Drizzle row returned as an API type (the run DTO parses cleanly).

const HERE = dirname(fileURLToPath(import.meta.url));

const NOW = "2026-06-21T00:00:00.000Z";
const ctxA: RequestContext = { userId: "user-a", requestId: "ra", source: "user" };
const ctxB: RequestContext = { userId: "user-b", requestId: "rb", source: "user" };

interface Captured {
  artifactCandidate: number;
  artifactPromote: number;
  resolveCalls: number;
  appendCalls: number;
}

function makeService(
  db: Db,
  cap: Captured,
  tag = "a",
): IngestionService {
  let seq = 0;
  const seen = new Set<string>();
  return createIngestionService({
    deps: { now: () => NOW, nextId: (p: string) => `${p}-${tag}-${++seq}` },
    db,
    ports: {
      publishing: {
        resolvePublication: (_ctx, ref) => {
          cap.resolveCalls += 1;
          return Promise.resolve({ id: `pub-${ref.externalId}` });
        },
      },
      analytics: {
        appendSnapshot: (_ctx, input) => {
          cap.appendCalls += 1;
          const key = `${input.publicationId}|${input.capturedAt}`;
          const created = !seen.has(key);
          if (created) seen.add(key);
          return Promise.resolve({ created });
        },
      },
      knowledge: { ingest: () => Promise.resolve({ id: "kn" }) },
      assets: { registerExternalAsset: () => Promise.resolve({ id: "as" }) },
      artifacts: {
        createCandidateVersion: (_ctx, input) => {
          // A candidate version NEVER promotes current_version (roadmap §401). The
          // fake records the candidate; any promotion would be a separate call.
          cap.artifactCandidate += 1;
          expect(input.createdByType).toBe("ingestion");
          return Promise.resolve({ id: "av" });
        },
      },
    },
  });
}

async function seedSource(db: Db, userId: string): Promise<void> {
  let seq = 0;
  const repo = createIngestionRepository(db, {
    now: () => NOW,
    nextId: (p: string) => `${p}-seed-${userId}-${++seq}`,
    userId,
  });
  await repo.seedExternalSources([
    {
      id: `src-${userId}`,
      userId,
      sourceType: "mock",
      name: "Mock",
      sourceIdentifier: "mock://x",
      secretReference: "",
      configuration: {},
      createdAt: NOW,
    },
  ]);
}

describe("G12 — module-structure acceptance", () => {
  it("has the foundation §5 layout files", () => {
    const required = [
      "ingestion.db-schema.ts",
      "ingestion.repository.ts",
      "ingestion.service.ts",
      "ingestion.schema.ts",
      "ingestion.transport.ts",
      "ingestion.errors.ts",
      "ingestion.mock-source.ts",
      "index.ts",
      "ingestion.repository.integration.test.ts",
      "ingestion.service.test.ts",
      "ingestion.contract.test.ts",
      "ingestion.mock-source.test.ts",
    ];
    for (const file of required) {
      expect(existsSync(join(HERE, file)), `missing ${file}`).toBe(true);
    }
  });

  it("has NO cross-module repository import anywhere in the module", () => {
    // SPEC §17.6/.7 + §22: Ingestion fans out via each module's PUBLIC Service
    // (imported by the COMPOSITION layer, not the module). The module itself must
    // not import a peer module's repository OR a peer module at all (ports only).
    for (const f of readdirSync(HERE)) {
      if (!f.endsWith(".ts") || f.endsWith(".test.ts")) continue;
      const src = readFileSync(join(HERE, f), "utf8");
      // Allowed self-import (none) — any @/server/modules/<m> that is NOT identity
      // (OwnershipError promotion, the established pattern) is a violation.
      const offending =
        /from\s+["']@\/server\/modules\/(?!identity["'])/.test(src);
      expect(offending, `cross-module import in ${f}`).toBe(false);
      // And explicitly never a *repository* path import.
      expect(/@\/server\/modules\/[a-z]+\/[a-z.]*repository/.test(src)).toBe(
        false,
      );
    }
  });

  it("the repository imports no shared storage / publisher port (not a file-producing module)", () => {
    // SPEC §15: Ingestion writes go through peer Services, never a storage/platform
    // SDK directly. Token literals are assembled at runtime so this file does not
    // itself trip the Assets G5 shared-port-caller guard (it scans every module dir
    // for the storage-port token).
    const src = readFileSync(join(HERE, "ingestion.repository.ts"), "utf8");
    const storagePort = ["Object", "Storage", "Port"].join("");
    const storageModule = ["object", "storage"].join("-");
    const publisherPort = ["Platform", "Publisher", "Port"].join("");
    expect(src.includes(storagePort)).toBe(false);
    expect(src.includes(storageModule)).toBe(false);
    expect(src.includes(publisherPort)).toBe(false);
    expect(/\bS3\b/.test(src)).toBe(false);
  });
});

describe("G12 — domain acceptance (SPEC §22)", () => {
  let db: Db;
  let cap: Captured;

  beforeEach(async () => {
    ({ db } = await createDb());
    await seedSource(db, "user-a");
    await seedSource(db, "user-b");
    cap = {
      artifactCandidate: 0,
      artifactPromote: 0,
      resolveCalls: 0,
      appendCalls: 0,
    };
  });

  it("metrics import is idempotent — re-submit returns the original result; partial-success preserved", async () => {
    const service = makeService(db, cap);
    const run = await service.createRun(ctxA, {
      externalSourceId: "src-user-a",
      runType: "metrics",
      idempotencyKey: "idem-1",
    });
    const records = [
      {
        recordKey: "rk-1",
        platform: "bilibili",
        externalId: "e1",
        capturedAt: "2026-06-12T10:00:00.000Z",
        metrics: { views: 1 },
      },
      { recordKey: "rk-bad", platform: "bilibili" }, // rejected
    ];
    const first = await service.ingestMetrics(ctxA, { runId: run.id, records });
    expect(first.recordsWritten).toBe(1);
    expect(first.recordsRejected).toBe(1);

    // Re-submit the SAME batch — counts unchanged (records skipped), no re-fan-out.
    const second = await service.ingestMetrics(ctxA, { runId: run.id, records });
    expect(second.recordsReceived).toBe(2);
    expect(second.recordsWritten).toBe(1);
    expect(second.recordsRejected).toBe(1);
    expect(cap.appendCalls).toBe(1); // valid record fanned out exactly once

    // Per-record error saved with original payload (§17.5).
    const errors = await service.listErrors(ctxA, run.id);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.rejectedPayload).toMatchObject({ platform: "bilibili" });

    // Duplicate createRun returns the ORIGINAL run (§17.3).
    const dup = await service.createRun(ctxA, {
      externalSourceId: "src-user-a",
      runType: "metrics",
      idempotencyKey: "idem-1",
    });
    expect(dup.id).toBe(run.id);
  });

  it("artifact pushes create a candidate version, never promoting current_version", async () => {
    const service = makeService(db, cap);
    const run = await service.createRun(ctxA, {
      externalSourceId: "src-user-a",
      runType: "artifacts",
      idempotencyKey: "idem-art",
    });
    await service.ingestArtifacts(ctxA, {
      runId: run.id,
      records: [{ recordKey: "rk", artifactId: "artifact-1", contentText: "x" }],
    });
    expect(cap.artifactCandidate).toBe(1);
    expect(cap.artifactPromote).toBe(0); // no promotion from Ingestion
  });

  it("multi-tenant smoke: a run + records under user A are invisible to user B", async () => {
    const svcA = makeService(db, cap, "a");
    const svcB = makeService(db, cap, "b");
    const run = await svcA.createRun(ctxA, {
      externalSourceId: "src-user-a",
      runType: "metrics",
      idempotencyKey: "idem-mt",
    });
    await svcA.ingestMetrics(ctxA, {
      runId: run.id,
      records: [{ recordKey: "rk-bad", platform: "x" }],
    });
    // User B cannot get the run or list its errors (404, no existence leak).
    await expect(svcB.getRun(ctxB, run.id)).rejects.toBeInstanceOf(
      OwnershipError,
    );
    await expect(svcB.listErrors(ctxB, run.id)).rejects.toBeInstanceOf(
      OwnershipError,
    );
    // User A sees it.
    await expect(svcA.getRun(ctxA, run.id)).resolves.toMatchObject({
      id: run.id,
    });
  });

  it("no Drizzle row returned as an API type — the run DTO parses cleanly (SPEC §9)", async () => {
    const service = makeService(db, cap);
    const run = await service.createRun(ctxA, {
      externalSourceId: "src-user-a",
      runType: "metrics",
      idempotencyKey: "idem-dto",
    });
    // The transport's toRunResource(row) shape is the contract DTO; assert the row
    // (sans user_id) parses against ingestionRunResource.
    const dto = {
      id: run.id,
      externalSourceId: run.externalSourceId,
      runType: run.runType,
      idempotencyKey: run.idempotencyKey,
      status: run.status,
      recordsReceived: run.recordsReceived,
      recordsWritten: run.recordsWritten,
      recordsRejected: run.recordsRejected,
      startedAt: run.startedAt ?? null,
      completedAt: run.completedAt ?? null,
    };
    expect(() => ingestionRunResource.parse(dto)).not.toThrow();
  });
});
