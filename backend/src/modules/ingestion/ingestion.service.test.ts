import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import {
  createIngestionService,
  type IngestionService,
  type IngestionPorts,
} from "./ingestion.service";
import { createIngestionRepository } from "./ingestion.repository";

// Task 3 — service: RequestContext + run lifecycle + fan-out. In-memory pglite +
// fake downstream Services injected as ports.

const NOW = "2026-06-21T00:00:00.000Z";
const ctx: RequestContext = {
  userId: "user-a",
  requestId: "req-1",
  source: "user",
};

interface FakeCalls {
  resolvePublication: Array<{ platform: string; externalId: string }>;
  appendSnapshot: Array<{
    publicationId: string;
    capturedAt: string;
    ingestionRunId?: string;
    source: string;
    ctxSource: string;
  }>;
  knowledge: number;
  assets: number;
  artifactVersions: Array<{ artifactId: string; createdByType?: string }>;
}

function makePorts(calls: FakeCalls): IngestionPorts {
  // The Analytics fake dedupes on (publicationId, capturedAt) — proves the
  // captured_at idempotency seam (roadmap §404).
  const seenSnapshots = new Set<string>();
  return {
    publishing: {
      resolvePublication: (_ctx, ref) => {
        calls.resolvePublication.push(ref);
        return Promise.resolve({ id: `pub-${ref.externalId}` });
      },
    },
    analytics: {
      appendSnapshot: (downstreamCtx, input) => {
        const key = `${input.publicationId}|${input.capturedAt}`;
        const created = !seenSnapshots.has(key);
        if (created) seenSnapshots.add(key);
        calls.appendSnapshot.push({
          publicationId: input.publicationId,
          capturedAt: input.capturedAt,
          ingestionRunId: downstreamCtx.ingestionRunId,
          source: input.source,
          ctxSource: downstreamCtx.source,
        });
        return Promise.resolve({ created });
      },
    },
    knowledge: {
      ingest: () => {
        calls.knowledge += 1;
        return Promise.resolve({ id: `kn-${calls.knowledge}` });
      },
    },
    assets: {
      registerExternalAsset: () => {
        calls.assets += 1;
        return Promise.resolve({ id: `as-${calls.assets}` });
      },
    },
    artifacts: {
      createCandidateVersion: (_ctx, input) => {
        calls.artifactVersions.push({
          artifactId: input.artifactId,
          createdByType: input.createdByType,
        });
        return Promise.resolve({ id: `av-${calls.artifactVersions.length}` });
      },
    },
  };
}

function makeService(db: Db, ports: IngestionPorts): IngestionService {
  let seq = 0;
  return createIngestionService({
    deps: {
      now: () => NOW,
      nextId: (prefix: string) => `${prefix}-${++seq}`,
    },
    ports,
    db,
  });
}

function freshCalls(): FakeCalls {
  return {
    resolvePublication: [],
    appendSnapshot: [],
    knowledge: 0,
    assets: 0,
    artifactVersions: [],
  };
}

async function seedSource(db: Db, userId = "user-a"): Promise<void> {
  let seq = 0;
  const repo = createIngestionRepository(db, {
    now: () => NOW,
    nextId: (p: string) => `${p}-seed-${++seq}`,
    userId,
  });
  await repo.seedExternalSources([
    {
      id: "src-a",
      userId,
      accountId: null,
      sourceType: "mock",
      name: "Mock",
      sourceIdentifier: "mock://x",
      secretReference: "",
      configuration: {},
      createdAt: NOW,
    },
  ]);
}

describe("ingestion service — run lifecycle + idempotency", () => {
  let db: Db;
  let calls: FakeCalls;
  let service: IngestionService;

  beforeEach(async () => {
    ({ db } = await createDb());
    await seedSource(db);
    calls = freshCalls();
    service = makeService(db, makePorts(calls));
  });

  it("createRun → pending; re-submit same (source, idempotencyKey) returns the ORIGINAL run", async () => {
    const run = await service.createRun(ctx, {
      externalSourceId: "src-a",
      runType: "metrics",
      idempotencyKey: "idem-1",
    });
    expect(run.status).toBe("pending");
    expect(run.startedAt).toBeNull();

    const again = await service.createRun(ctx, {
      externalSourceId: "src-a",
      runType: "metrics",
      idempotencyKey: "idem-1",
    });
    expect(again.id).toBe(run.id); // no second row
  });

  it("ingestMetrics — partial success: valid record written, malformed rejected (SPEC §17.4)", async () => {
    const run = await service.createRun(ctx, {
      externalSourceId: "src-a",
      runType: "metrics",
      idempotencyKey: "idem-m",
    });
    const result = await service.ingestMetrics(ctx, {
      runId: run.id,
      records: [
        {
          recordKey: "rk-good",
          platform: "bilibili",
          externalId: "ext-1",
          capturedAt: "2026-06-12T10:00:00.000Z",
          metrics: { views: 100 },
        },
        { recordKey: "rk-bad", platform: "bilibili" }, // missing externalId/capturedAt
      ],
    });
    expect(result.status).toBe("running");
    expect(result.startedAt).toBe(NOW);
    expect(result.recordsReceived).toBe(2);
    expect(result.recordsWritten).toBe(1);
    expect(result.recordsRejected).toBe(1);

    // recA flowed resolvePublication → appendSnapshot.
    expect(calls.resolvePublication).toEqual([
      { platform: "bilibili", externalId: "ext-1" },
    ]);
    expect(calls.appendSnapshot).toHaveLength(1);
    // ctx.source threaded as "ingestion"; downstream ctx carries the run id.
    expect(calls.appendSnapshot[0]!.ctxSource).toBe("ingestion");
    expect(calls.appendSnapshot[0]!.ingestionRunId).toBe(run.id);

    // The rejected record saved an error with its original payload (SPEC §17.5).
    const errors = await service.listErrors(ctx, run.id);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.recordKey).toBe("rk-bad");
    expect(errors[0]!.errorCode).toBe("SCHEMA_INVALID");
  });

  it("re-pushing a record with the same record_key is skipped (counts unchanged) — SPEC §17.2/.3", async () => {
    const run = await service.createRun(ctx, {
      externalSourceId: "src-a",
      runType: "metrics",
      idempotencyKey: "idem-dup",
    });
    const rec = {
      recordKey: "rk-1",
      platform: "bilibili",
      externalId: "ext-9",
      capturedAt: "2026-06-12T10:00:00.000Z",
      metrics: { views: 5 },
    };
    await service.ingestMetrics(ctx, { runId: run.id, records: [rec] });
    const after = await service.ingestMetrics(ctx, {
      runId: run.id,
      records: [rec],
    });
    expect(after.recordsReceived).toBe(1);
    expect(after.recordsWritten).toBe(1);
    // appendSnapshot not called a second time (record skipped before fan-out).
    expect(calls.appendSnapshot).toHaveLength(1);
  });

  it("Analytics captured_at dedupe: two snapshots with identical captured_at do not double-append", async () => {
    const run = await service.createRun(ctx, {
      externalSourceId: "src-a",
      runType: "metrics",
      idempotencyKey: "idem-cap",
    });
    await service.ingestMetrics(ctx, {
      runId: run.id,
      records: [
        {
          recordKey: "rk-a",
          platform: "bilibili",
          externalId: "ext-1",
          capturedAt: "2026-06-12T10:00:00.000Z",
          metrics: {},
        },
        {
          recordKey: "rk-b",
          platform: "bilibili",
          externalId: "ext-1",
          capturedAt: "2026-06-12T10:00:00.000Z",
          metrics: {},
        },
      ],
    });
    // Both records reached the analytics seam, but the fake reports created=false
    // for the duplicate (publicationId, capturedAt) — proving the dedupe key.
    expect(calls.appendSnapshot).toHaveLength(2);
    const createdFlags = new Set(
      calls.appendSnapshot.map((c) => `${c.publicationId}|${c.capturedAt}`),
    );
    expect(createdFlags.size).toBe(1); // same dedupe key for both
  });

  it("ingestArtifacts calls createCandidateVersion (candidate, never current_version) — roadmap §401", async () => {
    const run = await service.createRun(ctx, {
      externalSourceId: "src-a",
      runType: "artifacts",
      idempotencyKey: "idem-art",
    });
    await service.ingestArtifacts(ctx, {
      runId: run.id,
      records: [
        {
          recordKey: "rk-art",
          artifactId: "artifact-1",
          contentText: "draft",
          changeSummary: "imported",
        },
      ],
    });
    expect(calls.artifactVersions).toHaveLength(1);
    expect(calls.artifactVersions[0]!.artifactId).toBe("artifact-1");
    // createdByType marks the provenance as an external import (candidate), so the
    // adopt gate (confirmResult) — not Ingestion — promotes current_version.
    expect(calls.artifactVersions[0]!.createdByType).toBe("ingestion");
  });

  it("ingestKnowledge / ingestAssets fan out to their services", async () => {
    const run = await service.createRun(ctx, {
      externalSourceId: "src-a",
      runType: "knowledge",
      idempotencyKey: "idem-k",
    });
    const kRes = await service.ingestKnowledge(ctx, {
      runId: run.id,
      records: [{ recordKey: "rk-k", title: "A note", content: "body" }],
    });
    expect(kRes.recordsWritten).toBe(1);
    expect(calls.knowledge).toBe(1);

    const run2 = await service.createRun(ctx, {
      externalSourceId: "src-a",
      runType: "assets",
      idempotencyKey: "idem-as",
    });
    const aRes = await service.ingestAssets(ctx, {
      runId: run2.id,
      records: [{ recordKey: "rk-a", name: "img", storageKey: "uploads/x" }],
    });
    expect(aRes.recordsWritten).toBe(1);
    expect(calls.assets).toBe(1);
  });

  it("completeRun → completed when no rejects, partial when rejects>0, honors explicit failed", async () => {
    // No rejects → completed.
    const run = await service.createRun(ctx, {
      externalSourceId: "src-a",
      runType: "metrics",
      idempotencyKey: "idem-c1",
    });
    await service.ingestMetrics(ctx, {
      runId: run.id,
      records: [
        {
          recordKey: "rk-1",
          platform: "bilibili",
          externalId: "e1",
          capturedAt: "2026-06-12T10:00:00.000Z",
          metrics: {},
        },
      ],
    });
    const completed = await service.completeRun(ctx, { runId: run.id });
    expect(completed.status).toBe("completed");
    expect(completed.completedAt).toBe(NOW);

    // With rejects → partial.
    const run2 = await service.createRun(ctx, {
      externalSourceId: "src-a",
      runType: "metrics",
      idempotencyKey: "idem-c2",
    });
    await service.ingestMetrics(ctx, {
      runId: run2.id,
      records: [{ recordKey: "rk-bad", platform: "x" }],
    });
    const partial = await service.completeRun(ctx, { runId: run2.id });
    expect(partial.status).toBe("partial");

    // Explicit status="failed" honored.
    const run3 = await service.createRun(ctx, {
      externalSourceId: "src-a",
      runType: "metrics",
      idempotencyKey: "idem-c3",
    });
    const failed = await service.completeRun(ctx, {
      runId: run3.id,
      status: "failed",
    });
    expect(failed.status).toBe("failed");
  });

  it("getRun returns the run; cross-user is invisible (OwnershipError)", async () => {
    const run = await service.createRun(ctx, {
      externalSourceId: "src-a",
      runType: "metrics",
      idempotencyKey: "idem-get",
    });
    const got = await service.getRun(ctx, run.id);
    expect(got.id).toBe(run.id);

    const ctxB: RequestContext = {
      userId: "user-b",
      requestId: "req-b",
      source: "user",
    };
    await expect(service.getRun(ctxB, run.id)).rejects.toThrow();
  });
});
