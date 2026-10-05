import {noteRelayLayout} from "./noterelay-layout";
import { projectScriptSourceRef,projectScriptContext,scriptMetadataSource,proposedProjectImage } from "./project-script-source";
import { z } from "zod";
import { id, iso8601, platformId } from "../primitives";
import {momentsSourceAnchor,workBasisSourceAnchor} from "./work-source-anchors";
import { outputConversionSourceAnchor } from "./output-conversions";
import {graphicReferenceDesigns} from './reference-editor';

/** A selected image is an immutable file version, never a model description. */
export const graphicPostImageUse = z.object({
  assetId: id,
  assetFileId: id,
  order: z.number().int().min(0),
  role: z.enum(["cover", "card"]),
  cardId: id.optional(),
}).strict();

export const graphicPostSourceRef = z.union([z.object({
  kind: z.enum(["project", "asset", "intelligence"]),
  id,
  versionId: z.string().min(1),
}).strict(), outputConversionSourceAnchor,momentsSourceAnchor,workBasisSourceAnchor,projectScriptSourceRef]);
export type GraphicPostSourceRef = z.infer<typeof graphicPostSourceRef>;

/** 图卡文字仍是稿面内容，不能冒充已生成图片。数组顺序是用户明确顺序。 */
export const graphicPostCardBrief = z.object({
  cardId:id, title:z.string(), body:z.string(), visualBrief:z.string().max(10000).optional(), sourceRefs:z.array(graphicPostSourceRef),
  proposedImage:proposedProjectImage.optional(),
}).strict();
// SEMANTIC_BOUNDARY_ALLOW: 仅拒绝同一稿面重复 ID，不判断图卡内容或创作质量。
export const graphicPostCardBriefs = z.array(graphicPostCardBrief).refine(cards =>
  new Set(cards.map(card => card.cardId)).size === cards.length, {message:"图卡 ID 不能重复"});
export type GraphicPostCardBrief = z.infer<typeof graphicPostCardBrief>;

export const graphicPostDocument = z.object({
  schemaVersion: z.literal(1),
  nativeLayout: noteRelayLayout.optional(),
  title: z.string(),
  body: z.string(),
  summary: z.string(),
  tags: z.array(z.string()),
  metadataSource:scriptMetadataSource.optional(),
  imageMatchWarnings:z.array(z.string()).optional(),
  imageUses: z.array(graphicPostImageUse),
  cardBriefs: graphicPostCardBriefs.optional(),
  seriesProfile: z.object({visualDirection:z.string().max(10000),aspectRatio:z.string().max(32),referenceImage:z.object({assetId:id,assetFileId:id}).strict().optional()}).strict().optional(),
  designs: graphicReferenceDesigns.optional(),
  sourceRefs: z.array(graphicPostSourceRef),
  ruleSnapshotRef: z.object({versionId: id}).strict().nullable(),
}).strict();
export type GraphicPostDocument = z.infer<typeof graphicPostDocument>;

export const graphicPostWriteResult = z.object({
  versionId: id,
  document: graphicPostDocument,
}).strict();
export type GraphicPostWriteResult = z.infer<typeof graphicPostWriteResult>;

export const graphicPostResource = z.object({
  projectId: id,
  outputId: id,
  targetPlatform: platformId.nullable(),
  artifactId: id,
  currentVersionId: id,
  current: graphicPostDocument,
  scriptContext:projectScriptContext.optional(),
  versions: z.array(z.object({
    id,
    versionNumber: z.number().int().positive(),
    createdAt: iso8601,
    changeSummary: z.string(),
  }).strict()),
}).strict();
export type GraphicPostResource = z.infer<typeof graphicPostResource>;

export const graphicPostTextKind = z.enum(["title", "body", "summary", "tags", "cardBriefs"]);
export type GraphicPostTextKind = z.infer<typeof graphicPostTextKind>;

export const graphicPostTextValue=z.union([z.string(),z.array(z.string()),graphicPostCardBriefs]);
export type GraphicPostTextValue=z.infer<typeof graphicPostTextValue>;
export const graphicPostTextCandidate = z.object({
  candidateId: id,
  outputId: id,
  kind: graphicPostTextKind,
  status: z.enum(["queued", "running", "succeeded", "failed", "cancelled"]),
  value: graphicPostTextValue.nullable(),
  baseVersionId: id,
  sourceRefs: z.array(graphicPostSourceRef),
  ruleSnapshotRef: z.object({versionId: id}).strict().nullable(),
  appliedRules: z.enum(["applied", "not_applied"]),
}).strict();
export type GraphicPostTextCandidate = z.infer<typeof graphicPostTextCandidate>;
