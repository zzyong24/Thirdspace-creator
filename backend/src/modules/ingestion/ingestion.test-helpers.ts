import type { IngestionPorts } from "./ingestion.service";

// Deterministic no-op downstream ports for the contract test (the run-envelope
// shape is what the contract test validates; the fan-out targets are unit-tested in
// ingestion.service.test.ts). No Date.now / Math.random / fetch — pure fakes.
export function makeFakePorts(): IngestionPorts {
  return {
    publishing: {
      resolvePublication: (_ctx, ref) =>
        Promise.resolve({ id: `pub-${ref.externalId}` }),
    },
    analytics: {
      appendSnapshot: () => Promise.resolve({ created: true }),
    },
    knowledge: {
      ingest: () => Promise.resolve({ id: "kn-1" }),
    },
    assets: {
      registerExternalAsset: () => Promise.resolve({ id: "as-1" }),
    },
    artifacts: {
      createCandidateVersion: () => Promise.resolve({ id: "av-1" }),
    },
  };
}
