// MockIngestionSource (foundation §4) — the deterministic PRODUCER side of the
// ingestion seam. `IngestionSourcePort.fetchBatch(externalSourceId, runType)`
// returns a FIXED array of fake records keyed by runType; calling twice with the
// same args returns identical records (idempotent, NO network, no Date.now /
// Math.random). Used only in dev/seeds and the acceptance smoke — the contract ops
// accept pushed records directly, so the mock is the record source, not a consumer.
// A real source adapter is a stage-N swap behind this same port.

export interface IngestionSourcePort {
  fetchBatch(
    externalSourceId: string,
    runType: string,
  ): Promise<Array<Record<string, unknown>>>;
}

export type MockIngestionSource = IngestionSourcePort;

// Deterministic fixtures per runType. Record keys are stable so a re-fetch +
// re-push is a no-op (SPEC §17.2). capturedAt is a fixed ISO string (the Analytics
// idempotency anchor) — no clock read.
const FIXTURES: Record<string, Array<Record<string, unknown>>> = {
  metrics: [
    {
      recordKey: "mock-metric-1",
      platform: "bilibili",
      externalId: "mock-ext-1",
      capturedAt: "2026-06-12T10:00:00.000Z",
      metrics: { views: 18420, likes: 1240 },
    },
    {
      recordKey: "mock-metric-2",
      platform: "douyin",
      externalId: "mock-ext-2",
      capturedAt: "2026-06-12T11:00:00.000Z",
      metrics: { views: 9210, likes: 640 },
    },
  ],
  knowledge: [
    {
      recordKey: "mock-knowledge-1",
      title: "Imported reference",
      content: "A deterministic imported knowledge note.",
      knowledgeType: "reference",
    },
  ],
  assets: [
    {
      recordKey: "mock-asset-1",
      name: "imported-cover.png",
      assetType: "image",
      storageKey: "uploads/mock-asset-1",
    },
  ],
  artifacts: [
    {
      recordKey: "mock-artifact-1",
      artifactId: "artifact-mock-1",
      contentText: "Imported candidate draft.",
      changeSummary: "external import",
    },
  ],
};

export function createMockIngestionSource(): MockIngestionSource {
  return {
    fetchBatch(_externalSourceId, runType) {
      // Return a deep copy so a caller mutating the batch can't poison the next
      // deterministic fetch.
      const rows = FIXTURES[runType] ?? [];
      return Promise.resolve(rows.map((r) => ({ ...r })));
    },
  };
}
