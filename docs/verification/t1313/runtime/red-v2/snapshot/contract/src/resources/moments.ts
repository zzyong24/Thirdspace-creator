import {z} from "zod";
import {id, iso8601} from "../primitives";
import {workAssetFile, workSourceRef, workContentSource, workRuleRef,
  workRequestId, workFingerprint, workAdoptionReceipt} from "./work-sources";

export const momentsImageUse = workAssetFile.extend({order: z.number().int().nonnegative()}).strict();
export const momentsImageUses = z.array(momentsImageUse).superRefine((v, ctx) => {
  // SEMANTIC_BOUNDARY_ALLOW: 明确文件身份及数组顺序，不做配图匹配。
  if (v.some((x, index) => x.order !== index))
    ctx.addIssue({code: "custom", message: "配图顺序无效"});
  if (new Set(v.map(x => JSON.stringify([x.assetId, x.assetFileId]))).size !== v.length)
    ctx.addIssue({code: "custom", message: "配图文件重复"});
});
export const momentsDocument = z.object({
  schemaVersion: z.literal(1), text: z.string(), imageUses: momentsImageUses,
  sourceRefs: z.array(workSourceRef),
}).strict();
export const momentsVersion = z.object({
  momentsId: id, artifactId: id, versionId: id, document: momentsDocument, createdAt: iso8601,
}).strict();
export const momentsResource = z.object({
  momentsId: id, projectId: id, artifactId: id, currentVersionId: id,
  current: momentsDocument, createdAt: iso8601, updatedAt: iso8601,
}).strict();
export const momentsCreateBody = z.object({
  projectId: id, clientRequestId: workRequestId, document: momentsDocument,
}).strict();
export const momentsSaveBody = z.object({
  expectedCurrentVersionId: id, clientRequestId: workRequestId, document: momentsDocument,
}).strict();
export const momentsField = z.enum(["text", "imageUses"]);
export const momentsGenerateBody = z.object({
  clientRequestId: workRequestId, expectedCurrentVersionId: id, field: momentsField,
  source: workContentSource, ruleRefs: z.array(workRuleRef), allowedImageFiles: z.array(workAssetFile),
}).strict().superRefine((v, ctx) => {
  // SEMANTIC_BOUNDARY_ALLOW: 只约束用户明确允许的文件和规则，不选择配图。
  if (new Set(v.allowedImageFiles.map(x => JSON.stringify([x.assetId, x.assetFileId]))).size !== v.allowedImageFiles.length)
    ctx.addIssue({code: "custom", message: "允许的素材文件重复"});
  if (new Set(v.ruleRefs.map(x => x.versionId)).size !== v.ruleRefs.length)
    ctx.addIssue({code: "custom", message: "规则引用重复"});
});
const candidateCommon = {
  candidateId: id, taskId: id.nullable(), momentsId: id, artifactId: id, baseVersionId: id,
  status: z.enum(["queued", "running", "waiting_user", "unknown_result", "succeeded", "failed", "cancelled"]),
  executionTaskId: id.nullable().optional(), runtimeStatus: z.string().nullable().optional(),
  source: workContentSource, sourceRefs: z.array(workSourceRef), ruleRefs: z.array(workRuleRef),
  requestDigest: workFingerprint, errorCode: z.string().nullable(), retryOf: id.nullable(),
  retryRequestId: workRequestId.nullable(),
  retryReservation: z.object({originalCandidateId: id, clientRequestId: workRequestId,
    requestDigest: workFingerprint, originalTaskId: id.nullable()}).strict().nullable(),
  createdAt: iso8601,
};
export const momentsCandidate = z.discriminatedUnion("field", [
  z.object({...candidateCommon, field: z.literal("text"),
    frozenBefore: z.object({text: z.string(), sourceRefs: z.array(workSourceRef)}).strict(),
    value: z.string().nullable(),
  }).strict(),
  z.object({...candidateCommon, field: z.literal("imageUses"),
    frozenBefore: momentsImageUses, value: momentsImageUses.nullable(),
  }).strict(),
]).superRefine((v, ctx) => {
  if (["waiting_user", "unknown_result"].includes(v.status) &&
      (!v.taskId || !v.executionTaskId || v.runtimeStatus !== v.status || !v.errorCode))
    ctx.addIssue({code: "custom", message: "等待或未知状态缺少原执行身份及原因"});
  if (["running", "succeeded"].includes(v.status) && !v.taskId)
    ctx.addIssue({code: "custom", message: "生成状态缺少真实任务"});
  if (v.status === "succeeded" && v.value === null)
    ctx.addIssue({code: "custom", message: "成功状态缺少候选"});
  if (v.status === "failed" && !v.errorCode)
    ctx.addIssue({code: "custom", message: "失败必须保留原因"});
  if ((v.retryOf !== null) !== (v.retryReservation !== null) ||
      (v.retryReservation && v.retryReservation.originalCandidateId !== v.retryOf) ||
      (v.retryRequestId && v.retryReservation?.clientRequestId !== v.retryRequestId))
    ctx.addIssue({code: "custom", message: "重试必须绑定原候选及持久预约回执"});
  if (v.retryRequestId && (!v.retryOf || v.taskId || v.status !== "queued"))
    ctx.addIssue({code: "custom", message: "恢复请求号只用于未绑定重试预约"});
});
export const momentsAdoptBody = z.discriminatedUnion("field", [
  z.object({field: z.literal("text"), expectedCurrentVersionId: id,
    clientRequestId: workRequestId, editedValue: z.string()}).strict(),
  z.object({field: z.literal("imageUses"), expectedCurrentVersionId: id,
    clientRequestId: workRequestId, editedValue: momentsImageUses}).strict(),
]);
export const momentsAdoptionResult = z.object({
  momentsId: id, version: momentsVersion, receipt: workAdoptionReceipt,
}).strict().superRefine((v, ctx) => {
  if (v.version.momentsId !== v.momentsId || v.receipt.owner !== "moments" ||
      v.receipt.version.kind !== "artifact" ||
      v.receipt.version.artifactId !== v.version.artifactId ||
      v.receipt.version.versionId !== v.version.versionId)
    ctx.addIssue({code: "custom", message: "朋友圈采用回执与正式版本不一致"});
});
export const momentsRetryBody = z.object({clientRequestId: workRequestId}).strict();
const requestCommon = {
  clientRequestId: workRequestId, requestDigest: workFingerprint,
  target: z.union([
    z.object({kind: z.literal("moments"), momentsId: id}).strict(),
    z.object({kind: z.literal("candidate"), candidateId: id}).strict(),
  ]).nullable(),
  status: z.enum(["reserved", "committed", "failed"]), errorCode: z.string().nullable(),
  versionId: id.nullable(), createdAt: iso8601,
};
/** 原完整输入可回读；真实路径身份由 owner 连同请求回执核验。 */
export const momentsRequestResource = z.discriminatedUnion("operation", [
  z.object({...requestCommon, operation: z.literal("create"), params: z.null(), input: momentsCreateBody}).strict(),
  z.object({...requestCommon, operation: z.literal("save"), params: z.object({momentsId: id}).strict(), input: momentsSaveBody}).strict(),
  z.object({...requestCommon, operation: z.literal("generate"), params: z.object({momentsId: id}).strict(), input: momentsGenerateBody}).strict(),
  z.object({...requestCommon, operation: z.literal("adopt"), params: z.object({candidateId: id}).strict(), input: momentsAdoptBody}).strict(),
  z.object({...requestCommon, operation: z.literal("retry"), params: z.object({candidateId: id}).strict(), input: momentsRetryBody}).strict(),
]).superRefine((v, ctx) => {
  if (v.input.clientRequestId !== v.clientRequestId)
    ctx.addIssue({code: "custom", message: "回执与原请求号不一致"});
  if (v.status === "committed" && !v.target)
    ctx.addIssue({code: "custom", message: "已提交请求缺少真实目标"});
  if (v.status === "failed" && !v.errorCode)
    ctx.addIssue({code: "custom", message: "失败请求缺少原因"});
});
export type MomentsDocument = z.infer<typeof momentsDocument>;
export type MomentsResource = z.infer<typeof momentsResource>;
export type MomentsVersion = z.infer<typeof momentsVersion>;
export type MomentsCandidate = z.infer<typeof momentsCandidate>;
export type MomentsCreateBody = z.infer<typeof momentsCreateBody>;
export type MomentsSaveBody = z.infer<typeof momentsSaveBody>;
export type MomentsGenerateBody = z.infer<typeof momentsGenerateBody>;
export type MomentsAdoptBody = z.infer<typeof momentsAdoptBody>;
export type MomentsRequestResource = z.infer<typeof momentsRequestResource>;
