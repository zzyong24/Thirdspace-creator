import { z } from "zod";
import { articleDocument, articleSourceRef } from "@creatoros/contract";
import { bindPrompt } from "../prompt/template";
import { WECHAT_ARTICLE_TEXT_METHOD, WECHAT_ARTICLE_TEXT_TEMPLATE, wechatArticleTextCandidateSchema } from "../prompt/templates/wechat-article-text";
export {WECHAT_ARTICLE_TEXT_METHOD, wechatArticleTextCandidateSchema} from "../prompt/templates/wechat-article-text";

export const wechatArticleTextInputSchema = z.object({
  projectId: z.string().min(1), outputId: z.string().min(1), artifactId: z.string().min(1),
  baseVersionId: z.string().min(1), kind: z.enum(["title", "summary", "body"]),
  brief: z.string(), current: articleDocument,
  sourceRefs: z.array(articleSourceRef),
  sourceMaterials: z.array(z.object({ref: articleSourceRef, label: z.string(), text: z.string()}).strict()),
  ruleSnapshotRef: z.object({versionId: z.string().min(1)}).strict().nullable(),
  ruleGuidance: z.string(), ruleOverrides: z.record(z.string(), z.unknown()),
  targetPlatform: z.string().nullable(),
}).strict();
export type WechatArticleTextInput = z.infer<typeof wechatArticleTextInputSchema>;
function refKey(ref: z.infer<typeof articleSourceRef>) { return JSON.stringify(["output_version", "moments_version", "work_basis_version"].includes(ref.kind) ? ref : [ref.kind, "id" in ref ? ref.id : undefined, ref.versionId]); }

/** SEMANTIC_BOUNDARY_ALLOW: exact source scope and result kind checks enforce protocol, not editorial meaning. */
export function buildWechatArticleTextFacets(raw: unknown): Record<string, string> {
  const input = wechatArticleTextInputSchema.parse(raw);
  if (input.ruleSnapshotRef === null && input.ruleGuidance.trim()) throw new Error("ARTICLE_TEXT_RULE_SNAPSHOT_MISMATCH");
  const allowed = new Set(input.sourceRefs.map(refKey));
  for (const source of input.sourceMaterials) if (!allowed.has(refKey(source.ref))) throw new Error("ARTICLE_TEXT_SOURCE_MATERIAL_UNBOUND");
  return {articleTextContext: JSON.stringify(input)};
}
export function validateWechatArticleTextCandidate(raw: unknown, inputRaw: unknown) {
  const input = wechatArticleTextInputSchema.parse(inputRaw);
  const candidate = wechatArticleTextCandidateSchema.parse(raw);
  if (candidate.kind !== input.kind) throw new Error("ARTICLE_TEXT_KIND_MISMATCH");
  return candidate;
}
export function buildWechatArticleTextPrompt(input: WechatArticleTextInput) {
  return bindPrompt(WECHAT_ARTICLE_TEXT_TEMPLATE, buildWechatArticleTextFacets(input));
}
