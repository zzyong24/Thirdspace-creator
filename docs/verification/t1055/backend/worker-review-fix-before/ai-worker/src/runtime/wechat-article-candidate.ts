import { z } from "zod";
import {outputConversionContext,articleDocument,projectImageSource} from "@creatoros/contract";
import { bindPrompt } from "../prompt/template";
import {
  WECHAT_ARTICLE_DRAFT_TEMPLATE,
  WECHAT_ARTICLE_METHOD,
  articleSourceRefSchema,
  wechatArticleCandidateSchema,
  type WechatArticleCandidate,
} from "../prompt/templates/wechat-article-draft";
export { WECHAT_ARTICLE_METHOD, wechatArticleCandidateSchema, articleSourceRefSchema } from "../prompt/templates/wechat-article-draft";

export const wechatArticleMethodInputSchema = z.object({
  conversion:outputConversionContext.optional(),
  conversionConstraints:z.object({factItems:z.array(z.unknown()),sourceRefs:z.array(z.object({location:z.string(),refs:z.array(z.unknown())}).strict()),ruleSnapshotRef:z.unknown()}).strict().optional(),
  generationIntent: z.object({outputId:z.string().min(1),brandProfileVersionId:z.string().nullable(),sourceAssets:z.array(z.object({assetId:z.string().min(1),assetFileId:z.string().min(1)}).strict())}).strict().optional(),
  methodVersion: z.literal(WECHAT_ARTICLE_METHOD.version).optional(),
  projectId: z.string().min(1),
  outputId: z.string().min(1),
  artifactId: z.string().min(1),
  baseVersionId: z.string().min(1),
  brief: z.string().trim().min(1),
  editingInstruction: z.string().optional(),
  current: articleDocument,
  metadata:z.object({title:z.string(),summary:z.string(),tags:z.array(z.string())}).strict().optional(),
  imageLibrary:z.array(projectImageSource).optional(),
  imageLibraryMessage:z.string().optional(),
  sourceRefs: z.array(articleSourceRefSchema),
  sourceMaterials: z.array(z.object({
    ref: articleSourceRefSchema,
    label: z.string().min(1),
    text: z.string(),
  }).strict()),
  brandProfileVersionId: z.string().min(1).nullable(),
  brandProfile: z.object({
    profileId: z.string().min(1),
    versionId: z.string().min(1),
    guidance: z.string().min(1),
  }).strict().nullable(),
}).strict();

export type WechatArticleMethodInput = z.input<typeof wechatArticleMethodInputSchema>;

function refKey(ref: z.infer<typeof articleSourceRefSchema>): string {
  return JSON.stringify(["output_version", "moments_version", "work_basis_version"].includes(ref.kind) ? ref : [ref.kind, "id" in ref ? ref.id : undefined, ref.versionId]);
}

/**
 * 只校验真实 ID、引用范围、段落操作和已冻结品牌版本，不对文章语义作硬编码判断。
 * SEMANTIC_BOUNDARY_ALLOW: 下列集合检查只防虚构 ID / 覆盖错误段落，创作取舍仍由模型与用户决定。
 */
export function validateWechatArticleCandidate(raw: unknown, inputRaw: unknown): WechatArticleCandidate {
  const input = wechatArticleMethodInputSchema.parse(inputRaw);
  const candidate = wechatArticleCandidateSchema.parse(raw);
  if (input.brandProfileVersionId !== (input.brandProfile?.versionId ?? null)) {
    throw new Error("ARTICLE_BRAND_SNAPSHOT_MISMATCH");
  }
  const request=input.conversion?.request;
  if(request && request.targetType!=="article")throw new Error("ARTICLE_CONVERSION_TARGET_MISMATCH");
  if(request?.mode==="selected"){
    if((!request.targetFields.includes("title") && (candidate.proposedTitle!=="" || candidate.proposedTitleSourceRefs.length)) ||
       (!request.targetFields.includes("summary") && (candidate.proposedSummary!=="" || candidate.proposedSummarySourceRefs.length)) ||
       (!request.targetFields.includes("sections") && (candidate.proposedSections.length || candidate.proposedFactItems.length || candidate.proposedVisualBriefs.length)))
      throw new Error("ARTICLE_CONVERSION_FIELD_UNAUTHORIZED");
    if((request.targetFields.includes("title") && !candidate.proposedTitle.trim()) ||
       (request.targetFields.includes("summary") && !candidate.proposedSummary.trim()) ||
       (request.targetFields.includes("sections") && !candidate.proposedSections.length))throw new Error("ARTICLE_CONVERSION_FIELD_MISSING");
  }else if(!candidate.proposedTitle.trim() || !candidate.proposedSummary.trim() || !candidate.proposedSections.length)
    throw new Error("ARTICLE_WHOLE_CANDIDATE_INCOMPLETE");
  if(!request && ((input.current.title.trim()&&candidate.proposedTitle!==input.current.title)||(input.current.summary.trim()&&candidate.proposedSummary!==input.current.summary)))throw new Error("ARTICLE_METADATA_CHANGED");
  const allowed = new Set(input.sourceRefs.map(refKey));
  const assertRefs = (refs: WechatArticleCandidate["sourceRefs"]) => {
    for (const ref of refs) if (!allowed.has(refKey(ref))) throw new Error("ARTICLE_SOURCE_REF_UNBOUND");
  };
  assertRefs(candidate.sourceRefs);
  assertRefs(candidate.proposedTitleSourceRefs);
  assertRefs(candidate.proposedSummarySourceRefs);
  for (const fact of candidate.proposedFactItems) assertRefs(fact.sourceRefs);
  const existing = new Set(input.current.sections.map(section => section.sectionId));
  const seenSections = new Set<string>();
  for (const [index, section] of candidate.proposedSections.entries()) {
    if (section.order !== index) throw new Error("ARTICLE_SECTION_ORDER_INVALID");
    if (seenSections.has(section.sectionId)) throw new Error("ARTICLE_SECTION_DUPLICATED");
    seenSections.add(section.sectionId);
    if (section.op === "replace") {
      if (!existing.has(section.sectionId) || section.afterSectionId !== null) throw new Error("ARTICLE_REPLACE_TARGET_INVALID");
    } else if (existing.has(section.sectionId) || (section.afterSectionId !== null && !existing.has(section.afterSectionId))) {
      throw new Error("ARTICLE_INSERT_TARGET_INVALID");
    }
    assertRefs(section.sourceRefs);
  }
  const facts = new Set<string>();
  for (const fact of candidate.proposedFactItems) {
    if (facts.has(fact.id)) throw new Error("ARTICLE_FACT_DUPLICATED");
    facts.add(fact.id);
  }
  const briefs = new Set<string>();
  for (const brief of candidate.proposedVisualBriefs) {
    if (briefs.has(brief.sectionId) || !seenSections.has(brief.sectionId)) throw new Error("ARTICLE_VISUAL_BRIEF_TARGET_INVALID");
    briefs.add(brief.sectionId);
    if(brief.proposedAssetId!==undefined && !(input.imageLibrary??[]).some(image=>image.assetId===brief.proposedAssetId&&image.assetFileId===brief.proposedAssetFileId))throw new Error("ARTICLE_IMAGE_PAIR_UNBOUND");
  }
  return candidate;
}

/** 后端按账号验证项目、来源和品牌归属后，冻结为 Worker facets；这里不读取磁盘或数据库。 */
export function buildWechatArticleFacets(inputRaw: unknown): Record<string, string> {
  const input = wechatArticleMethodInputSchema.parse(inputRaw);
  if (input.brandProfileVersionId !== (input.brandProfile?.versionId ?? null)) throw new Error("ARTICLE_BRAND_SNAPSHOT_MISMATCH");
  const allowed = new Set(input.sourceRefs.map(refKey));
  for (const source of input.sourceMaterials) if (!allowed.has(refKey(source.ref))) throw new Error("ARTICLE_SOURCE_MATERIAL_UNBOUND");
  const articleContext = JSON.stringify({
    methodVersion: WECHAT_ARTICLE_METHOD.version,
    projectId: input.projectId,
    outputId: input.outputId,
    artifactId: input.artifactId,
    baseVersionId: input.baseVersionId,
    brief: input.brief,
    ...(input.conversion?{conversion:input.conversion,conversionConstraints:input.conversionConstraints}:{}),
    editingInstruction: input.editingInstruction ?? "",
    current: input.current,
    metadata:{title:input.current.title,summary:input.current.summary,tags:input.current.tags??[]},
    ...(input.imageLibrary?{imageLibrary:input.imageLibrary}:{}),
    ...(input.imageLibraryMessage?{imageLibraryMessage:input.imageLibraryMessage}:{}),
    sourceRefs: input.sourceRefs,
    sourceMaterials: input.sourceMaterials,
    brandProfileVersionId: input.brandProfileVersionId,
    brandProfile: input.brandProfile,
  });
  return { articleContext, __wechatArticleGrounding: JSON.stringify({
    currentSectionIds: input.current.sections.map(section => section.sectionId),
    sourceRefs: input.sourceRefs,
    brandProfileVersionId: input.brandProfileVersionId,
  }) };
}

export function buildWechatArticlePrompt(input: WechatArticleMethodInput) {
  return bindPrompt(WECHAT_ARTICLE_DRAFT_TEMPLATE, buildWechatArticleFacets(input));
}
