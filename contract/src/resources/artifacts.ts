import { z } from "zod";
import {
  id,
  iso8601,
  projectStageName,
} from "../primitives";

// BaseEntity = { id }; Timestamped = { createdAt, updatedAt }.
const timestamps = { createdAt: iso8601, updatedAt: iso8601 };

// ArtifactStage = ProjectStageName (alias).
export const artifactStage = projectStageName;

export const artifactType = z.enum([
  "project_idea",
  "trend_analysis",
  "market_analysis",
  "competitor_analysis",
  "audience_research",
  "research_note",
  "content_contract",
  "thesis_tree",
  "evidence_map",
  "audience_profile",
  "differentiation",
  "content_outline",
  "master_script",
  "output_script",
  "golden_quotes",
  "script_review",
  "production_plan",
  "shot_list",
  "timeline",
  "subtitle_plan",
  "export_config",
  "publish_package",
  "platform_copy",
  "cover_brief",
  "review_report",
  "comparison_report",
  "optimization_plan",
]);

const artifactStatus = z.enum([
  "drafting",
  "in_review",
  "approved",
  "archived",
]);

// Artifact extends BaseEntity, Timestamped.
export const artifactResource = z.object({
  id,
  projectId: id,
  contentOutputId: id.nullable(),
  currentVersionId: id,
  stage: artifactStage,
  artifactType,
  title: z.string(),
  status: artifactStatus,
  archivedAt: iso8601.nullable(),
  // T-030-D4 (F1, SPEC §4.5): provenance of the CURRENT content. null ≡ legacy /
  // user-authored; "reconstructed" = AI history-back-inference (auto-fill) NOT yet
  // user-confirmed — the §5 原则3/§9 铁律2 audit tag. Consumers that treat an
  // artifact as a "user-confirmed premise" (F2, §7) MUST NOT silently consume a
  // "reconstructed" artifact as confirmed.
  origin: z.enum(["user", "reconstructed"]).nullable(),
  ...timestamps,
});
export type ArtifactResource = z.infer<typeof artifactResource>;

// ArtifactVersion extends BaseEntity only (has its own createdAt, no updatedAt).
export const artifactVersionResource = z.object({
  id,
  artifactId: id,
  versionNumber: z.number().int(),
  contentText: z.string(),
  contentData: z.record(z.string(), z.unknown()),
  changeSummary: z.string(),
  createdByType: z.enum(["user", "ai", "import"]),
  aiTaskId: id.nullable(),
  createdAt: iso8601,
});
export type ArtifactVersionResource = z.infer<typeof artifactVersionResource>;

const artifactRelationType = z.enum([
  "derived_from",
  "references",
  "replaces",
  "supports",
  "summarizes",
]);

// ArtifactRelation extends BaseEntity only.
export const artifactRelationResource = z.object({
  id,
  sourceArtifactId: id,
  targetArtifactId: id,
  relationType: artifactRelationType,
  createdAt: iso8601,
});
export type ArtifactRelationResource = z.infer<typeof artifactRelationResource>;

const thesisNodeType = z.enum([
  "root",
  "core_thesis",
  "supporting",
  "evidence",
  "counterpoint",
]);

// ThesisNode extends BaseEntity only.
export const thesisNodeResource = z.object({
  id,
  artifactVersionId: id,
  parentNodeId: id.nullable(),
  nodeType: thesisNodeType,
  title: z.string(),
  content: z.string(),
  position: z.number().int(),
});
export type ThesisNodeResource = z.infer<typeof thesisNodeResource>;

const scriptSectionType = z.enum([
  "hook",
  "intro",
  "body",
  "transition",
  "outro",
  "golden_quote",
]);

// ScriptSection extends BaseEntity only.
export const scriptSectionResource = z.object({
  id,
  artifactVersionId: id,
  parentSectionId: id.nullable(),
  sectionType: scriptSectionType,
  title: z.string(),
  content: z.string(),
  position: z.number().int(),
  startSeconds: z.number().nullable(),
  endSeconds: z.number().nullable(),
});
export type ScriptSectionResource = z.infer<typeof scriptSectionResource>;

// EvidenceLink extends BaseEntity only.
export const evidenceLinkResource = z.object({
  id,
  artifactVersionId: id,
  thesisNodeId: id.nullable(),
  knowledgeItemId: id.nullable(),
  assetId: id.nullable(),
  excerpt: z.string(),
  // EVIDENCE_LINK.relation_type is free-form `string` per spec.
  relationType: z.string(),
  confidence: z.number(),
  position: z.number().int(),
});
export type EvidenceLinkResource = z.infer<typeof evidenceLinkResource>;

// TimelineSegment extends BaseEntity only.
export const timelineSegmentResource = z.object({
  id,
  artifactVersionId: id,
  scriptSectionId: id.nullable(),
  title: z.string(),
  position: z.number().int(),
  startMs: z.number().int(),
  endMs: z.number().int(),
  productionData: z.record(z.string(), z.unknown()),
});
export type TimelineSegmentResource = z.infer<typeof timelineSegmentResource>;
