import { z } from "zod";
import { id, iso8601, platformId, publicationStatus } from "../primitives";

// BaseEntity = { id }; Timestamped = { createdAt, updatedAt }.
const timestamps = { createdAt: iso8601, updatedAt: iso8601 };

// Publication extends BaseEntity, Timestamped.
export const publicationResource = z.object({
  id,
  contentOutputId: id,
  platform: platformId,
  accountReference: z.string(),
  status: publicationStatus,
  currentRevisionId: id,
  externalId: z.string().nullable(),
  externalUrl: z.string().nullable(),
  scheduledAt: iso8601.nullable(),
  publishedAt: iso8601.nullable(),
  removedAt: iso8601.nullable(),
  ...timestamps,
});
export type PublicationResource = z.infer<typeof publicationResource>;

// PublicationRevision extends BaseEntity only (no Timestamped).
export const publicationRevisionResource = z.object({
  id,
  publicationId: id,
  revisionNumber: z.number().int(),
  title: z.string(),
  description: z.string(),
  coverAssetId: id.nullable(),
  category: z.string(),
  series: z.string(),
  platformTags: z.array(z.string()),
  platformSettings: z.record(z.string(), z.unknown()),
  createdAt: iso8601,
});
export type PublicationRevisionResource = z.infer<
  typeof publicationRevisionResource
>;
