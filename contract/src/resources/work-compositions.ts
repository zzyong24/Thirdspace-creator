import {z} from "zod";
import {id, iso8601} from "../primitives";
import {workRequestId, workRevision, workFingerprint, workAssetFile, workContentSource,
  workSourceRef, workRuleRef, workOwnerVersion, workCommitReceipt} from "./work-sources";
import {workBasisDocument, workBasisSaveBody} from "./work-basis";
import {momentsDocument} from "./moments";

export const workMemberKind = z.enum(["video", "article", "image", "moments"]);
/** 四项任意子集：15 个非空组合和合法空集。取消选择不删除成员。 */
export const workSelection = z.array(workMemberKind).max(4).refine(
  v => new Set(v).size === v.length, {message: "组合选项重复"});
export const workMemberRef = z.discriminatedUnion("kind", [
  z.object({kind: z.literal("video"), outputId: id}).strict(),
  z.object({kind: z.literal("article"), outputId: id}).strict(),
  z.object({kind: z.literal("image"), outputId: id}).strict(),
  z.object({kind: z.literal("moments"), momentsId: id}).strict(),
]);
// SEMANTIC_BOUNDARY_ALLOW: 只验证明确真实目标 ID 与成员 ID，不做归类。
export function sameWorkMember(a: z.infer<typeof workMemberRef>, b: z.infer<typeof workMemberRef>) {
  return a.kind === b.kind && (a.kind === "moments" ?
    b.kind === "moments" && a.momentsId === b.momentsId :
    b.kind !== "moments" && a.outputId === b.outputId);
}
export const workMemberBinding = z.object({
  member: workMemberRef, boundVersion: workOwnerVersion, boundAt: iso8601,
}).strict().superRefine((v, ctx) => {
  if (v.boundVersion.kind === "not_saved" && (v.member.kind !== "video" || v.boundVersion.outputId !== v.member.outputId))
    ctx.addIssue({code: "custom", message: "未保存状态只允许指向该视频成员"});
});
export const workMemberCreateInput = z.discriminatedUnion("kind", [
  z.object({kind: z.literal("video"), title: z.string(), targetPlatform: z.enum(["douyin", "kuaishou", "xiaohongshu"]).nullable(),
    contentRole: z.enum(["traffic", "trust", "conversion"]).nullable()}).strict(),
  z.object({kind: z.literal("article"), title: z.string(), targetPlatform: z.literal("wechatOfficialAccount").nullable(),
    contentRole: z.enum(["traffic", "trust", "conversion"]).nullable()}).strict(),
  z.object({kind: z.literal("image"), title: z.string(), targetPlatform: z.literal("xiaohongshu").nullable()}).strict(),
  z.object({kind: z.literal("moments"), document: momentsDocument}).strict(),
]);
const mutation = {expectedRevision: workRevision, clientRequestId: workRequestId};
export const workCompositionCreateBody = z.object({
  projectId: id, title: z.string(), clientRequestId: workRequestId,
}).strict();
export const workSelectionSaveBody = z.object({...mutation, selection: workSelection}).strict();
export const workMemberBindBody = z.object({...mutation, member: workMemberRef}).strict();
export const workMemberCreateBody = z.object({...mutation, memberInput: workMemberCreateInput}).strict();
export const workMemberCancelBody = z.object({...mutation, reservationRequestId: workRequestId}).strict();
export const workMemberReservation = z.object({
  clientRequestId: workRequestId, requestDigest: workFingerprint, kind: workMemberKind,
  ownerCreationKey: workRequestId, expectedMember: workMemberRef.nullable(),
  status: z.enum(["reserved", "owner_created", "bound", "conflict", "cancelled"]),
  target: workMemberRef.nullable(), createdAt: iso8601, updatedAt: iso8601,
}).strict().superRefine((v, ctx) => {
  if (v.target && v.target.kind !== v.kind)
    ctx.addIssue({code: "custom", message: "预约目标类型不一致"});
  if (v.expectedMember && v.expectedMember.kind !== v.kind)
    ctx.addIssue({code: "custom", message: "原槽位类型不一致"});
  if (["owner_created", "bound"].includes(v.status) && !v.target)
    ctx.addIssue({code: "custom", message: "状态缺少实际已创建目标"});
});
export const workCompositionVersion = z.object({
  compositionId: id, projectId: id, revision: workRevision, title: z.string(),
  basisArtifactId: id, basisVersionId: id, selection: workSelection,
  members: z.array(workMemberBinding).max(4), pendingMembers: z.array(workMemberReservation).max(4),
  createdAt: iso8601,
}).strict().superRefine((v, ctx) => {
  // SEMANTIC_BOUNDARY_ALLOW: 只核验明确槽位身份，绝不按类型自动归组。
  if (new Set(v.members.map(x => x.member.kind)).size !== v.members.length)
    ctx.addIssue({code: "custom", message: "成员槽位重复"});
  if (new Set(v.pendingMembers.map(x => x.kind)).size !== v.pendingMembers.length)
    ctx.addIssue({code: "custom", message: "待建槽位重复"});
  if (v.pendingMembers.some(x => !["reserved", "owner_created"].includes(x.status)))
    ctx.addIssue({code: "custom", message: "待建槽位包含已结束预约"});
});
export const workMemberCurrent = z.discriminatedUnion("availability", [
  z.object({availability: z.literal("available"), member: workMemberRef, currentVersion: workOwnerVersion}).strict(),
  z.object({availability: z.literal("unavailable"), member: workMemberRef, reasonCode: z.string().min(1)}).strict(),
]);
export const workCompositionResource = z.object({
  compositionId: id, projectId: id, currentRevision: workRevision,
  current: workCompositionVersion, basis: workBasisDocument,
  memberCurrent: z.array(workMemberCurrent).max(4), createdAt: iso8601, updatedAt: iso8601,
}).strict().superRefine((v, ctx) => {
  if (v.current.compositionId !== v.compositionId || v.current.projectId !== v.projectId ||
      v.current.revision !== v.currentRevision)
    ctx.addIssue({code: "custom", message: "组合当前版本不一致"});
  if (new Set(v.memberCurrent.map(x => x.member.kind)).size !== v.memberCurrent.length)
    ctx.addIssue({code: "custom", message: "当前成员重复"});
  if (v.memberCurrent.length !== v.current.members.length || v.memberCurrent.some(x =>
      !v.current.members.some(binding => sameWorkMember(binding.member, x.member))))
    ctx.addIssue({code: "custom", message: "当前投影必须逐项对应原成员身份"});
});
/** 严格命名字段/真实段落与图卡 ID，不接受任意 JSON path。 */
export const workFieldTarget = z.union([
  z.object({kind: z.literal("article_field"), outputId: id,
    field: z.enum(["title", "summary", "sections", "factItems", "coverImageUse", "imageUses"])}).strict(),
  z.object({kind: z.literal("article_section"), outputId: id, sectionId: id,
    field: z.enum(["heading", "body", "imageUse"])}).strict(),
  z.object({kind: z.literal("image_field"), outputId: id,
    field: z.enum(["title", "body", "summary", "tags", "cardBriefs", "imageUses", "coverImageUse"])}).strict(),
  z.object({kind: z.literal("image_card"), outputId: id, cardId: id,
    field: z.enum(["title", "body", "sourceRefs", "imageUse"])}).strict(),
  z.object({kind: z.literal("video_field"), outputId: id, field: z.enum(["script", "production"])}).strict(),
  z.object({kind: z.literal("moments_field"), momentsId: id, field: z.enum(["text", "imageUses"])}).strict(),
  z.object({kind: z.literal("publication_field"), outputId: id, publicationId: id,
    field: z.enum(["title", "description", "platformTags", "cover"])}).strict(),
]);
export const workMaterialTarget = z.union([
  z.object({kind: z.literal("article_cover"), outputId: id}).strict(),
  z.object({kind: z.literal("article_image"), outputId: id, sectionId: id}).strict(),
  z.object({kind: z.literal("image_cover"), outputId: id}).strict(),
  z.object({kind: z.literal("image_card"), outputId: id, cardId: id}).strict(),
  z.object({kind: z.literal("video_material"), outputId: id, itemId: id}).strict(),
  z.object({kind: z.literal("publication_cover"), outputId: id, publicationId: id}).strict(),
  z.object({kind: z.literal("moments_images"), momentsId: id}).strict(),
]);
export function workTargetBelongsToMember(
  member: z.infer<typeof workMemberRef>,
  target: z.infer<typeof workFieldTarget> | z.infer<typeof workMaterialTarget>,
) {
  if (member.kind === "moments") return "momentsId" in target && target.momentsId === member.momentsId;
  if (!("outputId" in target) || target.outputId !== member.outputId) return false;
  if (target.kind === "publication_field" || target.kind === "publication_cover") return true;
  if (member.kind === "article") return ["article_field", "article_section", "article_cover", "article_image"].includes(target.kind);
  if (member.kind === "image") return ["image_field", "image_card", "image_cover"].includes(target.kind);
  return ["video_field", "video_material"].includes(target.kind);
}
export const workMaterialAssociation = z.object({
  associationId: id, compositionId: id, member: workMemberRef, target: workMaterialTarget,
  file: workAssetFile, source: workContentSource.nullable(), ownerVersion: workOwnerVersion,
  clientRequestId: workRequestId, requestDigest: workFingerprint,
  status: z.enum(["pending", "attached", "detached"]), createdAt: iso8601,
}).strict().superRefine((v, ctx) => {
  if (!workTargetBelongsToMember(v.member, v.target))
    ctx.addIssue({code: "custom", message: "物料目标不属于明确成员"});
});
export const workMaterialAttachBody = z.object({
  clientRequestId: workRequestId, member: workMemberRef, target: workMaterialTarget,
  expectedOwnerVersion: workOwnerVersion, file: workAssetFile, source: workContentSource.nullable(),
  position: z.number().int().nonnegative().nullable(),
}).strict().superRefine((v, ctx) => {
  if (!workTargetBelongsToMember(v.member, v.target))
    ctx.addIssue({code: "custom", message: "物料目标不属于明确成员"});
});
export const workMaterialReplaceBody = z.object({
  clientRequestId: workRequestId, associationId: id, expectedOwnerVersion: workOwnerVersion,
  expectedFile: workAssetFile, file: workAssetFile, source: workContentSource.nullable(),
}).strict();
export const workMaterialDetachBody = z.object({
  clientRequestId: workRequestId, associationId: id, expectedOwnerVersion: workOwnerVersion, expectedFile: workAssetFile,
}).strict();
export const workDependency = z.object({
  dependencyId: id, compositionId: id, member: workMemberRef, target: workFieldTarget,
  targetVersion: workOwnerVersion, targetFingerprint: workFingerprint,
  sources: z.array(workContentSource), sourceRefs: z.array(workSourceRef), files: z.array(workAssetFile),
  ruleRefs: z.array(workRuleRef), commitReceipt: workCommitReceipt.nullable(),
  status: z.enum(["pending", "current", "historical", "needs_review"]), createdAt: iso8601,
}).strict().superRefine((v, ctx) => {
  if (!workTargetBelongsToMember(v.member, v.target))
    ctx.addIssue({code: "custom", message: "依赖目标不属于明确成员"});
  if (v.status !== "pending" && !v.commitReceipt)
    ctx.addIssue({code: "custom", message: "已落实依赖缺少真实 owner 提交回执"});
});
export const workCanvasContext = z.object({
  compositionId: id, member: workMemberRef, ownerVersion: workOwnerVersion,
  source: workContentSource, target: workMaterialTarget,
  availability: z.enum(["available", "unavailable"]), reasonCode: z.string().nullable(),
}).strict().superRefine((v, ctx) => {
  if (!workTargetBelongsToMember(v.member, v.target))
    ctx.addIssue({code: "custom", message: "画布目标不属于明确成员"});
  if (v.availability === "unavailable" && !v.reasonCode)
    ctx.addIssue({code: "custom", message: "画布不可用必须保留原因"});
});
const requestCommon = {
  compositionId: id, clientRequestId: workRequestId, requestDigest: workFingerprint,
  status: z.enum(["reserved", "committed", "conflict", "cancelled", "failed"]),
  resultRevision: workRevision.nullable(), memberReservation: workMemberReservation.nullable(),
  errorCode: z.string().nullable(), createdAt: iso8601,
};
export const workCompositionRequestResource = z.discriminatedUnion("operation", [
  z.object({...requestCommon, operation: z.literal("create"), input: workCompositionCreateBody}).strict(),
  z.object({...requestCommon, operation: z.literal("selection.save"), input: workSelectionSaveBody}).strict(),
  z.object({...requestCommon, operation: z.literal("basis.save"), input: workBasisSaveBody}).strict(),
  z.object({...requestCommon, operation: z.literal("members.bind"), input: workMemberBindBody}).strict(),
  z.object({...requestCommon, operation: z.literal("members.create"), input: workMemberCreateBody}).strict(),
  z.object({...requestCommon, operation: z.literal("members.cancel"), input: workMemberCancelBody}).strict(),
  z.object({...requestCommon, operation: z.literal("materials.attach"), input: workMaterialAttachBody}).strict(),
  z.object({...requestCommon, operation: z.literal("materials.replace"), input: workMaterialReplaceBody}).strict(),
  z.object({...requestCommon, operation: z.literal("materials.detach"), input: workMaterialDetachBody}).strict(),
]).superRefine((v, ctx) => {
  if (v.input.clientRequestId !== v.clientRequestId)
    ctx.addIssue({code: "custom", message: "回执与原请求号不一致"});
  if (v.status === "failed" && !v.errorCode)
    ctx.addIssue({code: "custom", message: "失败请求缺少原因"});
});
export type WorkMemberRef = z.infer<typeof workMemberRef>;
export type WorkCompositionResource = z.infer<typeof workCompositionResource>;
export type WorkCompositionVersion = z.infer<typeof workCompositionVersion>;
export type WorkMemberReservation = z.infer<typeof workMemberReservation>;
export type WorkCompositionRequestResource = z.infer<typeof workCompositionRequestResource>;
export type WorkFieldTarget = z.infer<typeof workFieldTarget>;
export type WorkMaterialTarget = z.infer<typeof workMaterialTarget>;
export type WorkMaterialAssociation = z.infer<typeof workMaterialAssociation>;
export type WorkDependency = z.infer<typeof workDependency>;
