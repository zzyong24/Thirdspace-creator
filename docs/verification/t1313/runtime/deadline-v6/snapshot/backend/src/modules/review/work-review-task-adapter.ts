import type {RequestContext} from "@creatoros/contract";
import type {Db} from "@creatoros/backend";
import type {AiService} from "../ai/ai.service";
import type {StructuredBusinessAdapter} from "../ai-runtime/structured-business-execution.service";
import type {WorkReviewsService,WorkReviewPorts} from "./work-reviews.service";
/** 原AI owner创建和查询端口；共享root事务时aiFor(tx)必须绑定同一连接。 */
export function createWorkReviewTaskPorts(aiFor:(tx:Db)=>Pick<AiService,"createTask"|"findTaskByAttempt"|"getTask"|"getTaskExecutionRuntime">,wakeTask:(ctx:RequestContext,id:string)=>Promise<void>):Pick<WorkReviewPorts,"findTaskByAttempt"|"submitTask"|"readTask"|"readTaskOwner"|"wakeTask">{
 return{
  findTaskByAttempt:(ctx,attempt,tx)=>aiFor(tx).findTaskByAttempt(ctx,"work.review",attempt),
  submitTask:(ctx,input,tx)=>aiFor(tx).createTask(ctx,{taskType:"work.review",attemptId:input.attemptId,inputData:{projectId:input.projectId,workReviewReportId:input.reportId,snapshotFingerprint:input.fingerprint}}),
  readTask:(ctx,id,tx)=>aiFor(tx).getTask(ctx,id),
  readTaskOwner:async(ctx,id,tx)=>(await aiFor(tx).getTaskExecutionRuntime(ctx,id)).owner,
  wakeTask,
 };
}
/** 注册于原createStructuredBusinessExecutionService.adapters；报告提交由dispatcher专用分支处理。 */
export function createWorkReviewBusinessAdapter(serviceFor:(ctx:RequestContext)=>Pick<WorkReviewsService,"readFrozenTask">):StructuredBusinessAdapter{
 return{skillId:"work.review",capability:"default",async prepare(ctx,task){
  const reportId=task.inputData.workReviewReportId,fingerprint=task.inputData.snapshotFingerprint;
  if(typeof reportId!=="string"||typeof fingerprint!=="string")throw Error("REVIEW_TASK_INPUT_INVALID");
  const frozen=await serviceFor(ctx).readFrozenTask(ctx,{taskId:task.id,reportId,fingerprint});
  return{reviewContext:JSON.stringify(frozen.modelContext),__workReviewFrozen:JSON.stringify({reportId:frozen.reportId,snapshot:frozen.snapshot})};
 },project(){throw Error("REVIEW_REPORT_REQUIRES_ORIGINAL_SETTLED_COMMIT_PORT");}};
}
