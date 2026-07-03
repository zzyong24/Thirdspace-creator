import { z } from "zod";
import { id, iso8601 } from "../primitives";

// BaseEntity = { id }; Timestamped = { createdAt, updatedAt }.
const timestamps = { createdAt: iso8601, updatedAt: iso8601 };

// Enums not in primitives.ts — mirror frontend/src/types/domain.ts exactly.
// [T-079a] 四原子(claim/evidence/quote/qa)是知识资产重做的创作用途特化类型
// (SPEC 2026-07-03-knowledge-asset-redesign §1)。旧值保留兼容存量与出处存档
// (reference 仍用于「外部参考/原文存档」),枚举纯 additive(gate-F3 零删除)。
const knowledgeType = z.enum([
  "note",
  "reference",
  "inspiration",
  "snippet",
  "transcript",
  "claim",
  "evidence",
  "quote",
  "qa",
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
  // [T-079a] 出处与可信度一等公民(如「Reddit r/ClaudeAI @sysadmthrowaway 原帖,
  // 需核实」),从标题里解放出来(SPEC §1)。
  sourceNote: z.string().nullable(),
  // [T-079a] 战绩投影(SPEC §1):usedCount = materialLinks entity_type='knowledge'
  // 反查计数;usedInPublished = 所挂项目存在 status='published' 的 publication。
  // 服务端只读派生值,非落库列。
  usedCount: z.number().int(),
  usedInPublished: z.boolean(),
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
