import {z} from "zod";
import {and,eq,isNull,desc,aiTasks,executionTasks,executionCalls,OwnershipError,type Db} from "@creatoros/backend";
import {workReviewReport,workReviewOutcome} from "@creatoros/contract";
import {workerPortInputSchemas,workerStructuredResultSchema,workerProviderReceiptSchema,structuredGenerationInputSchema,type ExecutionRef} from "@creatoros/contract/execution-worker";
import {createExecutionLeaseService} from "../execution/execution-lease.service";
import {workReviewReports} from "../../schema/work-reviews";
import {canonical,freezeReview} from "./work-review-fingerprint";
/** 私有受控commitResult分支。沿原execution租约/调用账本，不接受模型自报执行身份。 */
export function createExecutionWorkReviewService(db:Db,deps:{now:()=>string}){
 const leases=createExecutionLeaseService(db,{now:deps.now});
 return{async commitResult(ref:ExecutionRef,raw:unknown){const input=workerPortInputSchemas.commitResult.parse(raw);if(input.outcome!=="succeeded")throw Error("REVIEW_FAILURE_USES_ORIGINAL_EXECUTION_PORT");
  return leases.withLease(ref,"settlement",async({tx,task,context})=>{
   if(task.kind!=="ai_task"||task.ownerType!=="ai_task")throw Error("REVIEW_TASK_OWNER_MISMATCH");
   const [business]=await tx.select().from(aiTasks).where(and(eq(aiTasks.id,task.ownerId),eq(aiTasks.executionTaskId,task.id),eq(aiTasks.userId,context.userId),context.groupId==null?isNull(aiTasks.groupId):eq(aiTasks.groupId,context.groupId),context.accountId==null?isNull(aiTasks.accountId):eq(aiTasks.accountId,context.accountId))).for("update");
   if(!business||business.taskType!=="work.review")throw new OwnershipError("审核原任务不一致");
   const source=z.object({projectId:z.string().min(1),workReviewReportId:z.string().min(1),snapshotFingerprint:z.string().min(1)}).strict().parse(business.inputData);
   const [report]=await tx.select().from(workReviewReports).where(and(eq(workReviewReports.id,source.workReviewReportId),eq(workReviewReports.userId,context.userId),context.groupId==null?isNull(workReviewReports.groupId):eq(workReviewReports.groupId,context.groupId),context.accountId==null?isNull(workReviewReports.accountId):eq(workReviewReports.accountId,context.accountId))).for("update");
   if(!report||report.taskId!==business.id||report.projectId!==source.projectId||business.projectId!==report.projectId||business.attemptId!==report.attemptId)throw new OwnershipError("审核预约与原任务冻结身份不一致");
   const snapshot=workReviewReport.shape.snapshot.parse(report.snapshot),frozen=freezeReview(snapshot.scope,report.frozenContext,snapshot.frozenAt);
   if(canonical(frozen.snapshot)!==canonical(snapshot)||snapshot.fingerprint!==source.snapshotFingerprint)throw Error("REVIEW_FROZEN_SNAPSHOT_MISMATCH");
   const model=structuredGenerationInputSchema.parse((task.payload as Record<string,unknown>).modelInput);
   if(model.skillId!=="work.review"||model.operationKey!=="work.review"||model.skillSnapshot.userId!==context.userId||model.skillSnapshot.accountId!==context.accountId||(model.skillSnapshot.groupId??null)!==(context.groupId??null))throw Error("REVIEW_MODEL_SKILL_OWNER_MISMATCH");
   if(canonical(JSON.parse(model.facets.__workReviewFrozen??"null"))!==canonical({reportId:report.id,snapshot})||canonical(JSON.parse(model.facets.reviewContext??"null"))!==canonical(frozen.modelContext))throw Error("REVIEW_MODEL_FROZEN_INPUT_MISMATCH");
   const [call]=await tx.select().from(executionCalls).where(and(eq(executionCalls.id,input.callId),eq(executionCalls.executionTaskId,task.id),eq(executionCalls.status,"settled"),eq(executionCalls.kind,"model")));
   if(!call||call.resultText!==input.text)throw Error("REVIEW_SETTLED_TEXT_MISMATCH");
   // 与原saveGenerationResult一致：必须是按sequence排序的最后根structured调用，保留供应商原回执。
   const [last]=await tx.select().from(executionCalls).where(eq(executionCalls.executionTaskId,task.id)).orderBy(desc(executionCalls.sequence)).limit(1);
   const prefix=`${model.operationKey}/model/`,suffix=call.operationKey.slice(prefix.length);
   if(last?.id!==call.id||call.parentCallId!==null||!call.providerResult||!call.operationKey.startsWith(prefix)||!/^[1-9][0-9]*$/.test(suffix))throw Error("REVIEW_STRUCTURED_ROOT_PROOF_MISSING");
   workerProviderReceiptSchema.parse(call.providerResult);
   if(report.status==="succeeded"){
    if(report.executionTaskId!==task.id||report.settledCallId!==call.id||call.resultRef!==report.id||task.status!=="succeeded"||business.status!=="succeeded")throw Error("REVIEW_REPLAY_RECEIPT_MISMATCH");
    return{resultId:report.id,aiTaskId:business.id};
   }
   const stamp=deps.now();if(call.resultRef||task.status!=="running"||!task.leaseOwner||!task.leaseExpiresAt||!(Date.parse(task.leaseExpiresAt)>Date.parse(stamp))||(task.deadlineAt&&!(Date.parse(task.deadlineAt)>Date.parse(stamp)))||!["queued","running"].includes(business.status))throw Error("REVIEW_TASK_NOT_COMMITTABLE");
   const structured=workerStructuredResultSchema.parse(JSON.parse(call.resultText!));z.string().trim().min(1).parse(structured.modelLabel);if(structured.validation?.status==="partial")throw Error("REVIEW_PARTIAL_REPORT");
   const rawOutcome=workReviewOutcome.parse(structured.object);
   // 当前适配器只有结构化文本，没有真实视觉证据；确定性降级，不能把模型自称审图当事实。
   // 不创建改稿候选。模型candidateRef只可经另一个真实owner生成端口获得，本报告统一为空。
   const files=snapshot.members.flatMap(member=>member.fields.flatMap(field=>field.files));
   const outcome={...rawOutcome,issues:rawOutcome.issues.map(issue=>({...issue,candidateRef:null})),visualVerification:files.length?"not_verified" as const:"not_applicable" as const};
   workReviewReport.parse({reportId:report.id,compositionId:report.compositionId,snapshot,status:"succeeded",taskId:business.id,executionTaskId:task.id,settledCallId:call.id,outcome,errorCode:null,createdAt:report.createdAt});
   await tx.update(workReviewReports).set({status:"succeeded",executionTaskId:task.id,settledCallId:call.id,outcome,errorCode:null}).where(eq(workReviewReports.id,report.id));
   await tx.update(aiTasks).set({status:"succeeded",completedAt:stamp,errorMessage:null,leaseOwner:null,leaseToken:null,leaseExpiresAt:null}).where(eq(aiTasks.id,business.id));
   await tx.update(executionCalls).set({resultRef:report.id,updatedAt:stamp}).where(eq(executionCalls.id,call.id));
   await tx.update(executionTasks).set({status:"succeeded",leaseOwner:null,leaseExpiresAt:null,heartbeatAt:null,retryAt:null,retryOfCallId:null,lastErrorCode:null,lastErrorMessage:null,updatedAt:stamp}).where(eq(executionTasks.id,task.id));
   return{resultId:report.id,aiTaskId:business.id};
  });
 }};
}
