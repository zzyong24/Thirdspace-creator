import { z } from "zod";
import { id, iso8601 } from "../primitives";

// All three entities extend BaseEntity only. ExternalSource additionally
// carries a single `createdAt` field (it does NOT extend Timestamped).

export const externalSourceResource = z.object({
  id,
  userId: id,
  sourceType: z.string(),
  name: z.string(),
  sourceIdentifier: z.string(),
  secretReference: z.string(),
  configuration: z.record(z.string(), z.unknown()),
  createdAt: iso8601,
});
export type ExternalSourceResource = z.infer<typeof externalSourceResource>;

export const ingestionRunResource = z.object({
  id,
  externalSourceId: id,
  runType: z.string(),
  idempotencyKey: z.string(),
  status: z.string(),
  recordsReceived: z.number().int(),
  recordsWritten: z.number().int(),
  recordsRejected: z.number().int(),
  startedAt: iso8601.nullable(),
  completedAt: iso8601.nullable(),
});
export type IngestionRunResource = z.infer<typeof ingestionRunResource>;

export const ingestionErrorResource = z.object({
  id,
  ingestionRunId: id,
  recordKey: z.string(),
  errorCode: z.string(),
  errorMessage: z.string(),
  rejectedPayload: z.record(z.string(), z.unknown()),
});
export type IngestionErrorResource = z.infer<typeof ingestionErrorResource>;
