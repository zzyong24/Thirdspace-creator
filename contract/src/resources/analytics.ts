import { z } from "zod";
import { id, iso8601 } from "../primitives.js";

// All four entities extend BaseEntity ({ id }) only — no Timestamped spread.

// MetricSnapshot
export const metricSnapshotResource = z.object({
  id,
  publicationId: id,
  ingestionRunId: id.nullable(),
  capturedAt: iso8601,
  source: z.string(),
  rawMetrics: z.record(z.string(), z.unknown()),
  createdAt: iso8601,
});
export type MetricSnapshotResource = z.infer<typeof metricSnapshotResource>;

// MetricValue
export const metricValueResource = z.object({
  id,
  metricSnapshotId: id,
  metricKey: z.string(),
  numericValue: z.number(),
  unit: z.string(),
  dimensions: z.record(z.string(), z.string()),
});
export type MetricValueResource = z.infer<typeof metricValueResource>;

// RetentionPoint
export const retentionPointResource = z.object({
  id,
  publicationId: id,
  capturedAt: iso8601,
  positionMs: z.number().int(),
  retentionRate: z.number(),
  viewerCount: z.number().int(),
});
export type RetentionPointResource = z.infer<typeof retentionPointResource>;

// DimensionType — not exported by primitives.ts; defined locally from domain.ts.
const dimensionType = z.enum(["age", "gender", "region", "source", "device"]);

// AudienceSnapshot
export const audienceSnapshotResource = z.object({
  id,
  publicationId: id,
  capturedAt: iso8601,
  dimensionType,
  dimensionValue: z.string(),
  percentage: z.number(),
  audienceCount: z.number().int(),
});
export type AudienceSnapshotResource = z.infer<typeof audienceSnapshotResource>;
