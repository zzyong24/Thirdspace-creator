import { z } from "zod";
import { id, iso8601 } from "../primitives.js";

// BaseEntity = { id }; Timestamped = { createdAt, updatedAt }.
const timestamps = { createdAt: iso8601, updatedAt: iso8601 };

// Enums not in primitives.ts — mirror frontend/src/types/domain.ts exactly.
const knowledgeType = z.enum([
  "note",
  "reference",
  "inspiration",
  "snippet",
  "transcript",
]);
const sourceType = z.enum(["manual", "web", "import", "ai"]);
const knowledgeStatus = z.enum(["active", "archived"]);
const createdByType = z.enum(["user", "ai"]);

// KnowledgeItem extends BaseEntity, Timestamped.
export const knowledgeItemResource = z.object({
  id,
  userId: id,
  currentRevisionId: id,
  knowledgeType,
  title: z.string(),
  sourceType,
  sourceUrl: z.string().nullable(),
  sourceMetadata: z.record(z.string(), z.unknown()),
  status: knowledgeStatus,
  archivedAt: iso8601.nullable(),
  ...timestamps,
});
export type KnowledgeItemResource = z.infer<typeof knowledgeItemResource>;

// KnowledgeRevision extends BaseEntity only (no Timestamped); has its own createdAt.
export const knowledgeRevisionResource = z.object({
  id,
  knowledgeItemId: id,
  revisionNumber: z.number().int(),
  content: z.string(),
  structuredData: z.record(z.string(), z.unknown()),
  createdAt: iso8601,
});
export type KnowledgeRevisionResource = z.infer<
  typeof knowledgeRevisionResource
>;

// KnowledgeRelation extends BaseEntity only (no Timestamped).
export const knowledgeRelationResource = z.object({
  id,
  sourceKnowledgeId: id,
  targetKnowledgeId: id,
  relationType: z.string(),
  strength: z.number(),
  createdByType,
});
export type KnowledgeRelationResource = z.infer<
  typeof knowledgeRelationResource
>;

// ProjectKnowledge extends BaseEntity only (no Timestamped).
export const projectKnowledgeResource = z.object({
  id,
  projectId: id,
  knowledgeItemId: id,
  relationType: z.string(),
});
export type ProjectKnowledgeResource = z.infer<
  typeof projectKnowledgeResource
>;

// ArtifactKnowledge extends BaseEntity only (no Timestamped).
export const artifactKnowledgeResource = z.object({
  id,
  artifactId: id,
  knowledgeItemId: id,
  citationNote: z.string(),
});
export type ArtifactKnowledgeResource = z.infer<
  typeof artifactKnowledgeResource
>;
