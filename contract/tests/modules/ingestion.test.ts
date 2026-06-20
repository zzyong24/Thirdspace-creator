import { describe, it, expect } from "vitest";
import { ingestionRunResource } from "../../src/resources/ingestion.js";
import { ingestionOperations } from "../../src/operations/ingestion.js";

describe("ingestion contract", () => {
  it("parses an IngestionRun resource", () => {
    const run = ingestionRunResource.parse({
      id: "run-1",
      externalSourceId: "extsource-bilibili-metrics",
      runType: "metrics",
      idempotencyKey: "run-1-2026-06-12",
      status: "completed",
      recordsReceived: 8,
      recordsWritten: 7,
      recordsRejected: 1,
      startedAt: "2026-06-12T02:00:00.000Z",
      completedAt: "2026-06-12T02:01:00.000Z",
    });
    expect(run.recordsWritten).toBe(7);
    expect(run.status).toBe("completed");
  });

  it("allows null start/completion timestamps", () => {
    const run = ingestionRunResource.parse({
      id: "run-2",
      externalSourceId: "extsource-bilibili-metrics",
      runType: "metrics",
      idempotencyKey: "run-2",
      status: "pending",
      recordsReceived: 0,
      recordsWritten: 0,
      recordsRejected: 0,
      startedAt: null,
      completedAt: null,
    });
    expect(run.startedAt).toBeNull();
  });

  it("registers the create-run and metrics endpoints", () => {
    expect(ingestionOperations.createRun.method).toBe("POST");
    expect(ingestionOperations.createRun.path).toBe("/ingestion/runs");
    expect(ingestionOperations.pushMetrics.method).toBe("POST");
    expect(ingestionOperations.pushMetrics.path).toBe(
      "/ingestion/runs/:runId/metrics",
    );
    expect(ingestionOperations.createRun.fr.length).toBeGreaterThan(0);
  });
});
