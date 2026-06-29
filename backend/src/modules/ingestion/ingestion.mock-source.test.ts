import { describe, it, expect } from "vitest";
import { createMockIngestionSource } from "./ingestion.mock-source";

// Task 6 — MockIngestionSource determinism / idempotency (foundation §4).

describe("MockIngestionSource", () => {
  it("returns a deterministic fixed batch keyed by runType", async () => {
    const source = createMockIngestionSource();
    const metrics = await source.fetchBatch("src-a", "metrics");
    expect(metrics).toHaveLength(2);
    expect(metrics[0]!.recordKey).toBe("mock-metric-1");
    expect(metrics[0]!.capturedAt).toBe("2026-06-12T10:00:00.000Z");

    const knowledge = await source.fetchBatch("src-a", "knowledge");
    expect(knowledge).toHaveLength(1);
    expect(knowledge[0]!.title).toBe("Imported reference");
  });

  it("calling twice with the same args returns identical records (idempotent)", async () => {
    const source = createMockIngestionSource();
    const first = await source.fetchBatch("src-a", "metrics");
    const second = await source.fetchBatch("src-a", "metrics");
    expect(second).toEqual(first);
  });

  it("returns a fresh copy each call (caller mutation does not poison the next fetch)", async () => {
    const source = createMockIngestionSource();
    const first = await source.fetchBatch("src-a", "metrics");
    (first[0] as Record<string, unknown>).recordKey = "tampered";
    const second = await source.fetchBatch("src-a", "metrics");
    expect(second[0]!.recordKey).toBe("mock-metric-1");
  });

  it("an unknown runType returns an empty batch", async () => {
    const source = createMockIngestionSource();
    expect(await source.fetchBatch("src-a", "nope")).toEqual([]);
  });
});
