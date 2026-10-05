import {noteRelayLayout} from "./noterelay-layout";
import { projectScriptSourceRef,projectScriptContext,scriptMetadataSource } from "./project-script-source";
import { z } from "zod";
import { id, iso8601 } from "../primitives";
import {momentsSourceAnchor,workBasisSourceAnchor} from "./work-source-anchors";
import { outputConversionSourceAnchor } from "./output-conversions";

export const articleSourceRef = z.union([z.object({
  kind: z.enum(["project", "asset"]),
  id,
  versionId: z.string().min(1),
}).strict(), outputConversionSourceAnchor,momentsSourceAnchor,workBasisSourceAnchor,projectScriptSourceRef]);
export type ArticleSourceRef = z.infer<typeof articleSourceRef>;

export const articleSection = z.object({
  sectionId: id,
  order: z.number().int().min(0),
  heading: z.string(),
  headingLevel: z.number().int().min(1).max(6).default(2),
  body: z.string(),
  sourceRefs: z.array(articleSourceRef).default([]),
}).strict();
export type ArticleSection = z.infer<typeof articleSection>;

export const articleFactItem = z.object({
  id,
  text: z.string(),
  sourceRefs: z.array(articleSourceRef).default([]),
  reviewState: z.enum(["needs_confirmation", "confirmed"]),
}).strict();
export const articleVisualBrief = z.object({
  sectionId: id,
  brief: z.string(),
  proposedAssetId: id.optional(),
  proposedAssetFileId: id.optional(),
}).strict();
export const articleImageUse = z.object({
  sectionId: id,
  assetId: id,
  assetFileId: id,
  sourceKind: z.enum(["existing", "generated", "screenshot"]),
  reviewState: z.literal("selected"),
}).strict();

/** Cover is an output-level slot and does not pretend to belong to a body section. */
export const articleCoverImageUse = articleImageUse.omit({sectionId: true}).strict();

const jsonValue: z.ZodType<null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }> = z.lazy(() =>
  z.union([z.null(), z.boolean(), z.number().finite(), z.string(), z.array(jsonValue), z.record(z.string(), jsonValue)]),
);
type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
const jsonObject = z.record(z.string(), jsonValue).superRefine((value, context) => {
  const byteLength = new TextEncoder().encode(JSON.stringify(value)).length;
  if (byteLength > 65_536) context.addIssue({ code: "custom", message: "themeSettings exceeds 65536 UTF-8 bytes" });
});
export const doocsArticleNativeLayout = z.object({
  schemaVersion: z.literal(1),
  editor: z.literal("doocs-md"),
  editorCommit: z.literal("a7c17fc4cda92e3c13aa7e24f06615cfa4219b31"),
  themeId: z.string().min(1).max(128),
  themeSettings: jsonObject,
  customCss: z.string().superRefine((value, context) => {
    if (new TextEncoder().encode(value).length > 50 * 1024) context.addIssue({ code: "custom", message: "customCss exceeds 50 KiB" });
  }),
  exportOptions: z.object({ useIndent: z.boolean(), useJustify: z.boolean() }).strict(),
}).strict();
export const articleNativeLayout = z.union([doocsArticleNativeLayout,noteRelayLayout]);
export type ArticleNativeLayout = z.infer<typeof articleNativeLayout>;

export const articleDocument = z.object({
  schemaVersion: z.literal(1),
  title: z.string(),
  titleSourceRefs: z.array(articleSourceRef).optional(),
  summary: z.string(),
  summarySourceRefs: z.array(articleSourceRef).optional(),
  tags:z.array(z.string()).optional(),
  metadataSource:scriptMetadataSource.optional(),
  imageMatchWarnings:z.array(z.string()).optional(),
  sections: z.array(articleSection),
  factItems: z.array(articleFactItem),
  visualBriefs: z.array(articleVisualBrief),
  imageUses: z.array(articleImageUse),
  coverImageUse: articleCoverImageUse.nullable().optional(),
  nativeLayout: articleNativeLayout.optional(),
}).strict();
export type ArticleDocument = z.infer<typeof articleDocument>;

export const articleCandidateSection = articleSection.extend({
  op: z.enum(["insert", "replace"]),
  afterSectionId: id.nullable().optional(),
}).strict();
export const articleCandidateEdits = z.object({
  editedMetadata:z.object({title:z.string().optional(),summary:z.string().optional()}).strict().optional(),
  editedSections:z.array(articleCandidateSection).optional(),
}).strict();
export type ArticleCandidateEdits=z.infer<typeof articleCandidateEdits>;

export const articleCandidateProposal = z.object({
  proposedTitle: z.string(),
  proposedTitleSourceRefs: z.array(articleSourceRef),
  proposedSummary: z.string(),
  proposedSummarySourceRefs: z.array(articleSourceRef),
  proposedFactItems: z.array(articleFactItem),
  proposedSections: z.array(articleCandidateSection),
  proposedVisualBriefs: z.array(articleVisualBrief.superRefine((value,ctx)=>{
    // SEMANTIC_BOUNDARY_ALLOW: 仅核验冻结文件身份成对出现，不决定图片内容。
    if(value.proposedAssetFileId!==undefined&&value.proposedAssetId===undefined)ctx.addIssue({code:"custom",message:"候选配图缺少资产身份"});
  })),
  sourceRefs: z.array(articleSourceRef),
}).strict();
export type ArticleCandidateProposal = z.infer<typeof articleCandidateProposal>;

export const articleCandidate = articleCandidateProposal.extend({
  candidateId: id,
  projectId: id,
  outputId: id,
  artifactId: id,
  baseVersionId: id,
  methodVersion: z.string().min(1),
  brandProfileVersionId: id.nullable(),
  createdAt: iso8601,
}).strict();
export type ArticleCandidate = z.infer<typeof articleCandidate>;

export const articleVersionSummary = z.object({
  id,
  versionNumber: z.number().int().positive(),
  createdAt: iso8601,
  changeSummary: z.string(),
}).strict();
export const articleResource = z.object({
  projectId: id,
  outputId: id,
  artifactId: id,
  currentVersionId: id,
  current: articleDocument,
  scriptContext:projectScriptContext.optional(),
  versions: z.array(articleVersionSummary),
}).strict();
export type ArticleResource = z.infer<typeof articleResource>;

export const articleWriteResult = z.object({
  versionId: id,
  document: articleDocument,
}).strict();
export type ArticleWriteResult = z.infer<typeof articleWriteResult>;
