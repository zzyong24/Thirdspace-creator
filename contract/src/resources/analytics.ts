import { z } from "zod";
import { id, iso8601 } from "../primitives";

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
// Extended with monetization-weighted dimensions (§4.6): intent / paying.
// Additive: existing values still parse.
const dimensionType = z.enum([
  "age",
  "gender",
  "region",
  "source",
  "device",
  "intent",
  "paying",
]);

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

/** 平台原始流量来源；百分数0–100，缺值不是0，窗口未展示则null。 */
export const trafficSourcePayloadSchema = z.object({
  app: z.string().min(1),
  windowLabel: z.string().nullable(),
  complete: z.boolean(),
  entries: z.array(z.object({label:z.string().min(1),percentage:z.number().min(0).max(100).nullable()})).min(1),
});
export type TrafficSourcePayload = z.infer<typeof trafficSourcePayloadSchema>;
export const publicationTrafficResource = z.object({
  publicationId:id,externalId:z.string(),
  status:z.enum(['pending','succeeded','failed','needs_reconnect','unavailable']),
  requestedAt:iso8601,capturedAt:iso8601.nullable(),attemptedAt:iso8601.nullable(),
  error:z.string().nullable(),data:trafficSourcePayloadSchema.nullable(),
});
export type PublicationTrafficResource=z.infer<typeof publicationTrafficResource>;
