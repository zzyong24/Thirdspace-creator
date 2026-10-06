import {z} from "zod";
import {defineEndpoint} from "../endpoint-definition";
import {id, iso8601, paginationQuery} from "../primitives";
import {workRequestId, workFingerprint, workRevision, workOwnerVersion, workContentSource, workCommitReceipt} from "../resources/work-sources";
import {workBasisVersion, workBasisSaveBody} from "../resources/work-basis";
import {momentsCreateBody, momentsSaveBody, momentsResource, momentsVersion,
  momentsGenerateBody, momentsCandidate, momentsAdoptBody, momentsAdoptionResult,
  momentsRetryBody, momentsRequestResource} from "../resources/moments";
import {workCompositionCreateBody, workCompositionResource, workCompositionVersion,
  workCompositionRequestResource, workSelectionSaveBody, workMemberBindBody,
  workMemberCreateBody, workMemberCancelBody, workMemberReservation, workMemberRef,
  workMaterialTarget, workMaterialAssociation, workMaterialAttachBody,
  workMaterialReplaceBody, workMaterialDetachBody, workDependency, workCanvasContext} from "../resources/work-compositions";
import {workReviewScope, workReviewCreateBody, workReviewReport, workReviewConfirmBody,
  workReviewConfirmation, workReviewStatus} from "../resources/work-reviews";

const compositionParams = z.object({compositionId: id}).strict();
const momentsParams = z.object({momentsId: id}).strict();
const candidateParams = z.object({candidateId: id}).strict();
const compositionWriteResult = z.object({
  composition: workCompositionResource, request: workCompositionRequestResource,
}).strict();
const momentsWriteResult = z.object({version: momentsVersion, receipt: workCommitReceipt}).strict();
const projectListQuery = paginationQuery.extend({projectId: id}).strict();
const scopeReadBody = z.object({scope: workReviewScope}).strict();

/** 账号内原请求号读回；恢复 create/confirm 丢响应窗口，不再次提交模型。 */
const reviewRequestCommon = {
  clientRequestId:workRequestId, requestDigest:workFingerprint,
  status:z.enum(["reserved", "committed", "failed"]), reportId:id.nullable(),
  confirmationId:id.nullable(), errorCode:z.string().nullable(), createdAt:iso8601,
};
export const workReviewRequestResource = z.discriminatedUnion("operation", [
  z.object({...reviewRequestCommon, operation:z.literal("create"), input:workReviewCreateBody}).strict(),
  z.object({...reviewRequestCommon, operation:z.literal("confirm"), input:workReviewConfirmBody}).strict(),
]).superRefine((v,ctx)=>{
  if(v.input.clientRequestId!==v.clientRequestId)
    ctx.addIssue({code:"custom",message:"审核回执与原请求号不一致"});
  if(v.status==="committed" && (v.operation==="create" ? !v.reportId : !v.confirmationId))
    ctx.addIssue({code:"custom",message:"审核提交回执缺少真实目标"});
  if(v.operation==="create" && v.confirmationId)
    ctx.addIssue({code:"custom",message:"创建审核不能冒充用户确认"});
  if(v.status==="failed" && !v.errorCode)
    ctx.addIssue({code:"custom",message:"审核请求失败必须保留原因"});
});

/** 只读复杂上下文用 POST 承载严格结构；CLI effect 显式为 read，绝不产生任务或回执。 */
export const workCompositionsOperations = {
  createWorkComposition: defineEndpoint({id:"workCompositions.create", method:"POST", path:"/work-compositions", body:workCompositionCreateBody, response:compositionWriteResult, fr:["FR-1045-1"]}),
  listWorkCompositions: defineEndpoint({id:"workCompositions.list", method:"GET", path:"/work-compositions", query:projectListQuery, response:workCompositionResource, isList:true, fr:["FR-1045-1"]}),
  getWorkComposition: defineEndpoint({id:"workCompositions.get", method:"GET", path:"/work-compositions/:compositionId", params:compositionParams, response:workCompositionResource, fr:["FR-1045-1"]}),
  listWorkCompositionVersions: defineEndpoint({id:"workCompositions.versions.list", method:"GET", path:"/work-compositions/:compositionId/versions", params:compositionParams, query:paginationQuery, response:workCompositionVersion, isList:true, fr:["FR-1045-1"]}),
  getWorkCompositionVersion: defineEndpoint({id:"workCompositions.versions.get", method:"GET", path:"/work-compositions/:compositionId/versions/:revision", params:z.object({compositionId:id, revision:z.coerce.number().pipe(workRevision)}).strict(), response:workCompositionVersion, fr:["FR-1045-1"]}),
  getWorkCompositionRequest: defineEndpoint({id:"workCompositions.requests.get", method:"GET", path:"/work-compositions/requests/:clientRequestId", params:z.object({clientRequestId:workRequestId}).strict(), response:workCompositionRequestResource, fr:["FR-1045-1"]}),
  saveWorkCompositionSelection: defineEndpoint({id:"workCompositions.selection.save", method:"POST", path:"/work-compositions/:compositionId/selection", params:compositionParams, body:workSelectionSaveBody, response:compositionWriteResult, fr:["FR-1045-1"]}),
  saveWorkCompositionBasis: defineEndpoint({id:"workCompositions.basis.save", method:"POST", path:"/work-compositions/:compositionId/basis/versions", params:compositionParams, body:workBasisSaveBody, response:z.object({composition:workCompositionResource, basis:workBasisVersion, request:workCompositionRequestResource}).strict(), fr:["FR-1045-2"]}),
  getWorkCompositionBasisVersion: defineEndpoint({id:"workCompositions.basis.versions.get", method:"GET", path:"/work-compositions/:compositionId/basis/versions/:versionId", params:z.object({compositionId:id, versionId:id}).strict(), response:workBasisVersion, fr:["FR-1045-2"]}),
  bindWorkCompositionMember: defineEndpoint({id:"workCompositions.members.bind", method:"POST", path:"/work-compositions/:compositionId/members/bind", params:compositionParams, body:workMemberBindBody, response:compositionWriteResult, fr:["FR-1045-1"]}),
  createWorkCompositionMember: defineEndpoint({id:"workCompositions.members.create", method:"POST", path:"/work-compositions/:compositionId/members/create", params:compositionParams, body:workMemberCreateBody, response:compositionWriteResult, fr:["FR-1045-1"]}),
  cancelWorkCompositionMemberReservation: defineEndpoint({id:"workCompositions.members.cancel", method:"POST", path:"/work-compositions/:compositionId/members/cancel", params:compositionParams, body:workMemberCancelBody, response:compositionWriteResult, fr:["FR-1045-1"]}),
  getWorkCompositionMemberReservation: defineEndpoint({id:"workCompositions.members.requests.get", method:"GET", path:"/work-compositions/:compositionId/members/requests/:clientRequestId", params:z.object({compositionId:id, clientRequestId:workRequestId}).strict(), response:workMemberReservation, fr:["FR-1045-1"]}),
  attachWorkCompositionMaterial: defineEndpoint({id:"workCompositions.materials.attach", method:"POST", path:"/work-compositions/:compositionId/materials/attach", params:compositionParams, body:workMaterialAttachBody, response:z.object({association:workMaterialAssociation, request:workCompositionRequestResource}).strict(), fr:["FR-1045-4"]}),
  replaceWorkCompositionMaterial: defineEndpoint({id:"workCompositions.materials.replace", method:"POST", path:"/work-compositions/:compositionId/materials/replace", params:compositionParams, body:workMaterialReplaceBody, response:z.object({association:workMaterialAssociation, request:workCompositionRequestResource}).strict(), fr:["FR-1045-4"]}),
  detachWorkCompositionMaterial: defineEndpoint({id:"workCompositions.materials.detach", method:"POST", path:"/work-compositions/:compositionId/materials/detach", params:compositionParams, body:workMaterialDetachBody, response:z.object({association:workMaterialAssociation, request:workCompositionRequestResource}).strict(), fr:["FR-1045-4"]}),
  listWorkCompositionMaterials: defineEndpoint({id:"workCompositions.materials.list", method:"GET", path:"/work-compositions/:compositionId/materials", params:compositionParams, query:paginationQuery, response:workMaterialAssociation, isList:true, fr:["FR-1045-4"]}),
  getWorkCompositionDependencies: defineEndpoint({id:"workCompositions.dependencies.get", method:"GET", path:"/work-compositions/:compositionId/dependencies", params:compositionParams, query:paginationQuery, response:workDependency, isList:true, fr:["FR-1045-3"]}),
  getWorkCompositionCanvasContext: defineEndpoint({id:"workCompositions.canvasContext.get", method:"POST", path:"/work-compositions/:compositionId/canvas-context/read", params:compositionParams, body:z.object({member:workMemberRef, ownerVersion:workOwnerVersion, source:workContentSource, target:workMaterialTarget}).strict(), response:workCanvasContext, fr:["FR-1045-4"]}),
} as const;

export const momentsOperations = {
  createMoments: defineEndpoint({id:"moments.create", method:"POST", path:"/moments", body:momentsCreateBody, response:z.object({moments:momentsResource, request:momentsRequestResource}).strict(), fr:["FR-1045-5"]}),
  listMoments: defineEndpoint({id:"moments.list", method:"GET", path:"/moments", query:projectListQuery, response:momentsResource, isList:true, fr:["FR-1045-5"]}),
  getMoments: defineEndpoint({id:"moments.get", method:"GET", path:"/moments/:momentsId", params:momentsParams, response:momentsResource, fr:["FR-1045-5"]}),
  listMomentsVersions: defineEndpoint({id:"moments.versions.list", method:"GET", path:"/moments/:momentsId/versions", params:momentsParams, query:paginationQuery, response:momentsVersion, isList:true, fr:["FR-1045-5"]}),
  getMomentsVersion: defineEndpoint({id:"moments.versions.get", method:"GET", path:"/moments/:momentsId/versions/:versionId", params:z.object({momentsId:id, versionId:id}).strict(), response:momentsVersion, fr:["FR-1045-5"]}),
  createMomentsVersion: defineEndpoint({id:"moments.versions.create", method:"POST", path:"/moments/:momentsId/versions", params:momentsParams, body:momentsSaveBody, response:momentsWriteResult, fr:["FR-1045-5"]}),
  generateMomentsCandidate: defineEndpoint({id:"moments.candidates.generate", method:"POST", path:"/moments/:momentsId/candidates/generate", params:momentsParams, body:momentsGenerateBody, response:momentsCandidate, fr:["FR-1045-5"]}),
  getMomentsCandidate: defineEndpoint({id:"moments.candidates.get", method:"GET", path:"/moments/candidates/:candidateId", params:candidateParams, response:momentsCandidate, fr:["FR-1045-5"]}),
  retryMomentsCandidate: defineEndpoint({id:"moments.candidates.retry", method:"POST", path:"/moments/candidates/:candidateId/retry", params:candidateParams, body:momentsRetryBody, response:momentsCandidate, fr:["FR-1045-5"]}),
  adoptMomentsCandidate: defineEndpoint({id:"moments.candidates.adopt", method:"POST", path:"/moments/candidates/:candidateId/adopt", params:candidateParams, body:momentsAdoptBody, response:momentsAdoptionResult, fr:["FR-1045-5"]}),
  getMomentsRequest: defineEndpoint({id:"moments.requests.get", method:"GET", path:"/moments/requests/:clientRequestId", params:z.object({clientRequestId:workRequestId}).strict(), response:momentsRequestResource, fr:["FR-1045-5"]}),
} as const;

export const workReviewsOperations = {
  getWorkReviewRequest: defineEndpoint({id:"workReviews.requests.get", method:"GET", path:"/work-reviews/requests/:clientRequestId", params:z.object({clientRequestId:workRequestId}).strict(), response:workReviewRequestResource, fr:["FR-1045-6"]}),
  createWorkReview: defineEndpoint({id:"workReviews.create", method:"POST", path:"/work-reviews", body:workReviewCreateBody, response:workReviewReport, fr:["FR-1045-6"]}),
  getWorkReview: defineEndpoint({id:"workReviews.get", method:"GET", path:"/work-reviews/:reportId", params:z.object({reportId:id}).strict(), response:workReviewReport, fr:["FR-1045-6"]}),
  listWorkReviews: defineEndpoint({id:"workReviews.list", method:"GET", path:"/work-reviews", query:paginationQuery.extend({compositionId:id}).strict(), response:workReviewReport, isList:true, fr:["FR-1045-6"]}),
  confirmWorkReview: defineEndpoint({id:"workReviews.confirm", method:"POST", path:"/work-reviews/confirm", body:workReviewConfirmBody, response:z.object({confirmation:workReviewConfirmation, status:workReviewStatus}).strict(), fr:["FR-1045-6"]}),
  getWorkReviewStatus: defineEndpoint({id:"workReviews.status", method:"POST", path:"/work-reviews/status/read", body:scopeReadBody, response:workReviewStatus, fr:["FR-1045-6"]}),
} as const;

/** 以下是 cli-policy.ts 五张表的候选增量；本文件不导入 CLI registry，避免反向循环。
 * 保留当前 gateway 幂等包装；owner 同时必须核验 clientRequestId 原生回执。
 * cancel 仅结束预约、不删除已创建作品；detach 仅修改正式物料关联，均 write/apply。
 */
export const T1045_CLI_READ_OPERATIONS = [
  "workCompositions.list", "workCompositions.get", "workCompositions.versions.list", "workCompositions.versions.get", "workCompositions.requests.get", "workCompositions.basis.versions.get", "workCompositions.members.requests.get", "workCompositions.materials.list", "workCompositions.dependencies.get", "workCompositions.canvasContext.get",
  "moments.list", "moments.get", "moments.versions.list", "moments.versions.get", "moments.candidates.get", "moments.requests.get",
  "workReviews.get", "workReviews.list", "workReviews.status", "workReviews.requests.get",
] as const;
export const T1045_CLI_MUTATION_OPERATIONS = [
  "workCompositions.create", "workCompositions.selection.save", "workCompositions.basis.save", "workCompositions.members.bind", "workCompositions.members.create", "workCompositions.members.cancel", "workCompositions.materials.attach", "workCompositions.materials.replace", "workCompositions.materials.detach",
  "moments.create", "moments.versions.create", "moments.candidates.generate", "moments.candidates.retry", "moments.candidates.adopt",
  "workReviews.create", "workReviews.confirm",
] as const;
export const T1045_CLI_EXTERNAL_OPERATIONS = ["moments.candidates.generate", "moments.candidates.retry", "workReviews.create"] as const;
export const T1045_CLI_ASYNC_TASK_OPERATIONS = ["moments.candidates.generate", "moments.candidates.retry", "workReviews.create"] as const;
export const T1045_CLI_DESTRUCTIVE_OPERATIONS = [] as const;
