import {z} from "zod";
import {id, iso8601} from "../primitives";
import {workRequestId, workFingerprint, workOwnerVersion, workContentSource,
  workAssetFile, workRuleRef, workSourceRef} from "./work-sources";
import {workMemberRef, workSelection, workFieldTarget, sameWorkMember, workTargetBelongsToMember} from "./work-compositions";

export const workReviewScope = z.discriminatedUnion("kind", [
  z.object({kind: z.literal("field"), compositionId: id, member: workMemberRef, target: workFieldTarget}).strict(),
  z.object({kind: z.literal("member"), compositionId: id, member: workMemberRef}).strict(),
  z.object({kind: z.literal("composition"), compositionId: id}).strict(),
]).superRefine((v, ctx) => {
  if (v.kind === "field" && !workTargetBelongsToMember(v.member, v.target))
    ctx.addIssue({code: "custom", message: "审核字段不属于明确成员"});
});
// SEMANTIC_BOUNDARY_ALLOW: 比较已解析的明确审核触点身份，不判断内容语义。
export function sameWorkReviewScope(a: z.infer<typeof workReviewScope>, b: z.infer<typeof workReviewScope>) {
  return JSON.stringify(a) === JSON.stringify(b);
}
export const workFieldReviewSnapshot = z.object({
  target: workFieldTarget,
  /** 版本用于追溯；field 指纹必须排除无关整稿版本。 */
  provenanceVersion: workOwnerVersion, valueDigest: workFingerprint,
  sources: z.array(workContentSource), sourceRefs: z.array(workSourceRef), files: z.array(workAssetFile), ruleRefs: z.array(workRuleRef),
}).strict();
export const workMemberReviewSnapshot = z.object({
  member: workMemberRef, ownerVersion: workOwnerVersion, fields: z.array(workFieldReviewSnapshot),
}).strict();
export const workReviewSnapshot = z.object({
  scope: workReviewScope, basisArtifactId: id, basisVersionId: id,
  selection: workSelection, members: z.array(workMemberReviewSnapshot).max(4),
  fingerprint: workFingerprint, frozenAt: iso8601,
}).strict().superRefine((v, ctx) => {
  // SEMANTIC_BOUNDARY_ALLOW: 核验真实快照成员身份，不判断内容一致性。
  if (new Set(v.members.map(x => x.member.kind)).size !== v.members.length)
    ctx.addIssue({code: "custom", message: "审核成员重复"});
  if (v.members.some(member => member.fields.some(field => !workTargetBelongsToMember(member.member, field.target))))
    ctx.addIssue({code: "custom", message: "审核快照字段与成员不一致"});
  if (v.scope.kind !== "composition") {
    const scope = v.scope;
    if (v.members.length !== 1 || !sameWorkMember(v.members[0]!.member, scope.member))
      ctx.addIssue({code: "custom", message: "单项审核不能携带其他成员快照"});
    if (scope.kind === "field" && (v.members[0]?.fields.length !== 1 ||
        JSON.stringify(v.members[0]?.fields[0]?.target) !== JSON.stringify(scope.target)))
      ctx.addIssue({code: "custom", message: "字段审核必须仅绑定明确字段"});
  } else if (v.members.length !== v.selection.length ||
      v.members.some(member => !v.selection.includes(member.member.kind))) {
    ctx.addIssue({code: "custom", message: "组合审核必须覆盖确切所选成员"});
  }
});
export const workReviewIssue = z.object({
  issueId: id, member: workMemberRef, target: workFieldTarget,
  severity: z.enum(["information", "needs_confirmation", "needs_changes"]),
  reason: z.string().min(1), suggestion: z.string().nullable(),
  candidateRef: z.object({
    owner: z.enum(["wechat_article", "graphic_post", "output_script", "publication", "moments"]), candidateId: id,
  }).strict().nullable(),
}).strict().superRefine((v, ctx) => {
  if (!workTargetBelongsToMember(v.member, v.target))
    ctx.addIssue({code: "custom", message: "审核问题定位不属于明确成员"});
});
export const workReviewOutcome = z.object({
  conclusion: z.enum(["no_issue_found", "needs_confirmation", "needs_changes"]),
  issues: z.array(workReviewIssue),
  visualVerification: z.enum(["verified", "not_verified", "not_applicable"]),
}).strict();
export const workReviewReport = z.object({
  reportId: id, compositionId: id, snapshot: workReviewSnapshot,
  status: z.enum(["queued", "running", "waiting_user", "succeeded", "failed", "cancelled"]),
  taskId: id.nullable(), executionTaskId: id.nullable(), settledCallId: id.nullable(),
  outcome: workReviewOutcome.nullable(), errorCode: z.string().nullable(), errorMessage: z.string().nullable().optional(), createdAt: iso8601,
}).strict().superRefine((v, ctx) => {
  if (v.snapshot.scope.compositionId !== v.compositionId)
    ctx.addIssue({code: "custom", message: "审核组合身份不一致"});
  if (v.status === "succeeded" && (!v.taskId || !v.executionTaskId || !v.settledCallId || !v.outcome))
    ctx.addIssue({code: "custom", message: "成功审核缺少真实执行或报告回执"});
  if (v.outcome?.issues.some(issue => !v.snapshot.members.some(member =>
      sameWorkMember(member.member, issue.member) && member.fields.some(field =>
        JSON.stringify(field.target) === JSON.stringify(issue.target)))))
    ctx.addIssue({code: "custom", message: "审核问题超出冻结快照触点"});
  if (v.status === "waiting_user" && (!v.taskId || !v.executionTaskId || !v.errorCode || v.outcome || v.settledCallId))
    ctx.addIssue({code: "custom", message: "等待审核必须对应原执行且不能冒充成功报告"});
  if (v.status === "failed" && !v.errorCode)
    ctx.addIssue({code: "custom", message: "审核失败缺少原因"});
});
export const workReviewCreateBody = z.object({clientRequestId: workRequestId, scope: workReviewScope}).strict();
export const workReviewConfirmBody = z.discriminatedUnion("mode", [
  z.object({mode: z.literal("model"), clientRequestId: workRequestId, scope: workReviewScope,
    expectedFingerprint: workFingerprint, reportId: id, historicalBasis: z.array(workContentSource)}).strict(),
  z.object({mode: z.literal("manual"), clientRequestId: workRequestId, scope: workReviewScope,
    expectedFingerprint: workFingerprint, historicalBasis: z.array(workContentSource)}).strict(),
]);
export const workReviewConfirmation = z.object({
  confirmationId: id, scope: workReviewScope, fingerprint: workFingerprint,
  mode: z.enum(["model", "manual"]), reportId: id.nullable(), historicalBasis: z.array(workContentSource),
  clientRequestId: workRequestId, requestDigest: workFingerprint, confirmedAt: iso8601,
}).strict().superRefine((v, ctx) => {
  if ((v.mode === "model") !== (v.reportId !== null))
    ctx.addIssue({code: "custom", message: "确认模式与模型报告引用不一致"});
});
export const workReviewStatus=z.object({
 scope:workReviewScope,currentFingerprint:workFingerprint,
 state:z.enum(["not_reviewed","running","waiting_user","awaiting_confirmation","needs_changes","confirmed_current","basis_updated"]),
 latestReport:workReviewReport.nullable(),confirmedReport:workReviewReport.nullable(),confirmation:workReviewConfirmation.nullable(),
 modelVerification:z.enum(["verified","not_verified"]),visualVerification:z.enum(["verified","not_verified","not_applicable"]),
}).strict().superRefine((v,ctx)=>{
 const same=sameWorkReviewScope;
 const valid=(report:typeof v.latestReport)=>report?.status==="succeeded"&&same(report.snapshot.scope,v.scope)&&report.snapshot.fingerprint===v.currentFingerprint;
 if(v.state==="waiting_user"&&(!v.latestReport||v.latestReport.status!=="waiting_user"||v.latestReport.snapshot.fingerprint!==v.currentFingerprint))ctx.addIssue({code:"custom",message:"等待状态缺少当前指纹原审核任务"});
 if(v.latestReport&&!same(v.latestReport.snapshot.scope,v.scope))ctx.addIssue({code:"custom",message:"最新报告触点不一致"});
 if(v.confirmation&&!same(v.confirmation.scope,v.scope))ctx.addIssue({code:"custom",message:"确认触点不一致"});
 if(v.state==="confirmed_current"&&(!v.confirmation||v.confirmation.fingerprint!==v.currentFingerprint))ctx.addIssue({code:"custom",message:"确认不匹配当前指纹"});
 if(v.confirmation?.mode==="model"){
  const report=v.confirmedReport;
  if(!report||report.status!=="succeeded"||report.reportId!==v.confirmation.reportId||!same(report.snapshot.scope,v.confirmation.scope)||report.snapshot.fingerprint!==v.confirmation.fingerprint)ctx.addIssue({code:"custom",message:"模型确认缺少原报告证据"});
 }else if(v.confirmedReport)ctx.addIssue({code:"custom",message:"手工或空确认不能附模型确认报告"});
 const evidence=[v.latestReport,v.confirmedReport].filter(valid);
 if(v.modelVerification==="verified"&&!evidence.length)ctx.addIssue({code:"custom",message:"模型验证缺少同指纹真实报告"});
 if(v.visualVerification==="verified"&&!evidence.some(report=>report?.outcome?.visualVerification==="verified"))ctx.addIssue({code:"custom",message:"视觉验证缺少真实证据"});
});
export type WorkReviewScope = z.infer<typeof workReviewScope>;
export type WorkReviewSnapshot = z.infer<typeof workReviewSnapshot>;
export type WorkReviewReport = z.infer<typeof workReviewReport>;
export type WorkReviewConfirmation = z.infer<typeof workReviewConfirmation>;
export type WorkReviewStatus = z.infer<typeof workReviewStatus>;
