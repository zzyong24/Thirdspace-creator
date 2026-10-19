import {z} from "zod";
import {publicationTextCandidateSchema} from "../prompt/templates/publication-text";
export {publicationTextCandidateSchema} from "../prompt/templates/publication-text";

export const publicationTextInputSchema = z.object({
  projectId: z.string().min(1), outputId: z.string().min(1),
  platform: z.enum(["xiaohongshu", "douyin", "kuaishou"]),
  kind: z.enum(["publish_title", "description", "publish_tags"]),
  publicationId: z.string().min(1).nullable(), baseRevisionId: z.string().min(1).nullable(),
  outputType: z.enum(["image", "video"]), title: z.string(), brief: z.string(),
  current: z.object({title: z.string(), description: z.string(), platformTags: z.array(z.string())}).strict(),
  sourceRefs: z.array(z.object({kind: z.literal("project"), id: z.string().min(1), versionId: z.string().min(1)}).strict()),
  ruleSnapshotRef: z.object({versionId: z.string().min(1)}).strict().nullable(),
  ruleGuidance: z.string(), ruleOverrides: z.record(z.string(), z.unknown()),
}).strict();
export function buildPublicationTextFacets(raw: unknown) {
  const input = publicationTextInputSchema.parse(raw);
  if (input.ruleSnapshotRef === null && input.ruleGuidance.trim()) throw new Error("PUBLICATION_RULE_SNAPSHOT_MISMATCH");
  if (input.outputType === "image" && input.platform !== "xiaohongshu") throw new Error("PUBLICATION_PLATFORM_TYPE_MISMATCH");
  return {publicationContext: JSON.stringify(input)};
}
/** SEMANTIC_BOUNDARY_ALLOW: kind and value shape checks are protocol checks, not editorial scoring. */
export function validatePublicationTextCandidate(raw: unknown, frozen: unknown) {
  const input = publicationTextInputSchema.parse(frozen);
  const candidate = publicationTextCandidateSchema.parse(raw);
  if (candidate.kind !== input.kind) throw new Error("PUBLICATION_TEXT_KIND_MISMATCH");
  if (Array.isArray(candidate.value) && (candidate.value.some(value => !value.trim()) || new Set(candidate.value).size !== candidate.value.length)) {
    throw new Error("PUBLICATION_TAGS_INVALID");
  }
  return candidate;
}
