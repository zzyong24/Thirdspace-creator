import { z } from "zod";
import { defineEndpoint } from "../endpoints.js";
import { id } from "../primitives.js";
import { ingestionRunResource } from "../resources/ingestion.js";

const runParams = z.object({ runId: id });

// SPEC §13 "数据采集 (ingestion)" group. Batch-push endpoints accept opaque
// record arrays; the contract validates the run envelope shape only.
export const ingestionOperations = {
  createRun: defineEndpoint({
    id: "ingestion.runs.create",
    method: "POST",
    path: "/ingestion/runs",
    body: z.object({
      externalSourceId: id,
      runType: z.string().min(1),
      idempotencyKey: z.string().min(1),
    }),
    response: ingestionRunResource,
    fr: ["FR-INGESTION-CREATE"],
  }),
  pushMetrics: defineEndpoint({
    id: "ingestion.runs.metrics",
    method: "POST",
    path: "/ingestion/runs/:runId/metrics",
    params: runParams,
    body: z.object({ records: z.array(z.record(z.string(), z.unknown())) }),
    response: ingestionRunResource,
    fr: ["FR-INGESTION-METRICS"],
  }),
  pushKnowledge: defineEndpoint({
    id: "ingestion.runs.knowledge",
    method: "POST",
    path: "/ingestion/runs/:runId/knowledge",
    params: runParams,
    body: z.object({ records: z.array(z.record(z.string(), z.unknown())) }),
    response: ingestionRunResource,
    fr: ["FR-INGESTION-KNOWLEDGE"],
  }),
  pushAssets: defineEndpoint({
    id: "ingestion.runs.assets",
    method: "POST",
    path: "/ingestion/runs/:runId/assets",
    params: runParams,
    body: z.object({ records: z.array(z.record(z.string(), z.unknown())) }),
    response: ingestionRunResource,
    fr: ["FR-INGESTION-ASSETS"],
  }),
  pushArtifacts: defineEndpoint({
    id: "ingestion.runs.artifacts",
    method: "POST",
    path: "/ingestion/runs/:runId/artifacts",
    params: runParams,
    body: z.object({ records: z.array(z.record(z.string(), z.unknown())) }),
    response: ingestionRunResource,
    fr: ["FR-INGESTION-ARTIFACTS"],
  }),
  completeRun: defineEndpoint({
    id: "ingestion.runs.complete",
    method: "POST",
    path: "/ingestion/runs/:runId/complete",
    params: runParams,
    body: z.object({ status: z.string().optional() }),
    response: ingestionRunResource,
    fr: ["FR-INGESTION-COMPLETE"],
  }),
  getRun: defineEndpoint({
    id: "ingestion.runs.get",
    method: "GET",
    path: "/ingestion/runs/:runId",
    params: runParams,
    response: ingestionRunResource,
    fr: ["FR-INGESTION-GET"],
  }),
} as const;
