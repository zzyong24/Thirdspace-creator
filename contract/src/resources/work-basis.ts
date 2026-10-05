import {z} from "zod";
import {id, iso8601} from "../primitives";
import {workSourceRef, workRuleRef, workRequestId, workRevision} from "./work-sources";

export const workBasisClaim = z.object({id, text: z.string(), sourceRefs: z.array(workSourceRef)}).strict();
export const workBasisFactItem = z.object({
  id, text: z.string(), reviewState: z.enum(["needs_confirmation", "confirmed"]),
  sourceRefs: z.array(workSourceRef),
}).strict();
export const workBasisDocument = z.object({
  schemaVersion: z.literal(1), topic: z.string(), claims: z.array(workBasisClaim),
  factItems: z.array(workBasisFactItem), sourceRefs: z.array(workSourceRef), ruleRefs: z.array(workRuleRef),
}).strict().superRefine((v, ctx) => {
  // SEMANTIC_BOUNDARY_ALLOW: 仅拒绝正式文档重复 ID，不确认事实内容。
  if (new Set(v.claims.map(x => x.id)).size !== v.claims.length)
    ctx.addIssue({code: "custom", message: "观点 ID 重复", path: ["claims"]});
  if (new Set(v.factItems.map(x => x.id)).size !== v.factItems.length)
    ctx.addIssue({code: "custom", message: "事实 ID 重复", path: ["factItems"]});
  if (new Set(v.ruleRefs.map(x => x.versionId)).size !== v.ruleRefs.length)
    ctx.addIssue({code: "custom", message: "规则引用重复", path: ["ruleRefs"]});
});
export const workBasisVersion = z.object({
  compositionId: id, artifactId: id, versionId: id, document: workBasisDocument, createdAt: iso8601,
}).strict();
export const workBasisSaveBody = z.object({
  expectedRevision: workRevision, clientRequestId: workRequestId, document: workBasisDocument,
}).strict();
export type WorkBasisDocument = z.infer<typeof workBasisDocument>;
export type WorkBasisVersion = z.infer<typeof workBasisVersion>;
export type WorkBasisSaveBody = z.infer<typeof workBasisSaveBody>;
