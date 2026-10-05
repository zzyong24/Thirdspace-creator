import {and,eq,desc,OwnershipError,requireAccountId,type Db} from "@creatoros/backend";
import {workReviewScope,workReviewReport,workReviewCreateBody,workReviewConfirmBody,workReviewConfirmation,workReviewRequestResource,ErrorCode,type RequestContext,type WorkReviewScope,type WorkReviewReport,type WorkReviewConfirmation} from "@creatoros/contract";
import {workReviewReports,workReviewConfirmations,workReviewRequests} from "../../schema/work-reviews";
import {freezeReview,canonical,digest,type FrozenReviewContext} from "./work-review-fingerprint";
import {workReviewStatus as workReviewStatusV2} from "@creatoros/contract";
class Conflict extends Error{readonly code=ErrorCode.ConflictError;}
export interface WorkReviewTask {id:string;taskType:string;attemptId:string;inputData:Record<string,unknown>;status:string;runtimeStatus?:string;executionTaskId?:string;errorCode?:string|null;errorMessage?:string|null;}
export interface WorkReviewPorts {
 /** 先锁项目后组合；forUpdate只在同一tx内有效。get/report历史只验组合归属。 */
 assertComposition(ctx:RequestContext,id:string,tx:Db,forUpdate?:boolean):Promise<{projectId:string}>;
 /** 锁当前原owner后读精确field值、明确依赖摘录/fileHash/ruleValue，不猜语义或血缘。 */
 readCurrent(ctx:RequestContext,scope:WorkReviewScope,tx:Db,forUpdate:boolean):Promise<FrozenReviewContext>;
 findTaskByAttempt(ctx:RequestContext,attemptId:string,tx:Db):Promise<WorkReviewTask|null>;
 /** 只创建原AI业务task；必须使用传入tx，禁止调用模型或起第二队列。 */
 submitTask(ctx:RequestContext,input:{reportId:string;projectId:string;attemptId:string;fingerprint:string},tx:Db):Promise<WorkReviewTask>;
 readTask(ctx:RequestContext,id:string,tx:Db):Promise<WorkReviewTask>;
 /** 原execution dispatcher prepare/wake；提交事务结束后调用。 */
 wakeTask(ctx:RequestContext,id:string):Promise<void>;
}
export function createWorkReviewsService(deps:{db:Db;now:()=>string;nextId:(prefix:string)=>string;ports:WorkReviewPorts}){
 const {db,now,nextId,ports}=deps,account=(ctx:RequestContext)=>requireAccountId(ctx.accountId);
 const reportWhere=(ctx:RequestContext,id:string)=>and(eq(workReviewReports.id,id),eq(workReviewReports.userId,ctx.userId),eq(workReviewReports.accountId,account(ctx)));
 const requestWhere=(ctx:RequestContext,id:string)=>and(eq(workReviewRequests.requestId,id),eq(workReviewRequests.userId,ctx.userId),eq(workReviewRequests.accountId,account(ctx)));
 async function row(ctx:RequestContext,id:string,tx=db,lock=false){const query=tx.select().from(workReviewReports).where(reportWhere(ctx,id));const [value]=await(lock?query.for("update"):query);if(!value)throw new OwnershipError("审核报告不存在");await ports.assertComposition(ctx,value.compositionId,tx);return value;}
 function originalTask(report:typeof workReviewReports.$inferSelect,task:WorkReviewTask){
  const snapshot=workReviewReport.shape.snapshot.parse(report.snapshot);
  if(task.taskType!=="work.review"||task.attemptId!==report.attemptId||task.inputData.projectId!==report.projectId||task.inputData.workReviewReportId!==report.id||task.inputData.snapshotFingerprint!==snapshot.fingerprint||(report.taskId&&task.id!==report.taskId))throw new Conflict("原审核任务冻结映射不一致");
 }
 async function dto(ctx:RequestContext,value:typeof workReviewReports.$inferSelect,tx=db):Promise<WorkReviewReport>{
  const snapshot=workReviewReport.shape.snapshot.parse(value.snapshot);let status=value.status,taskId=value.taskId,executionTaskId=value.executionTaskId,errorCode=value.errorCode,errorMessage:string|null=null;
  if(status!=="succeeded"){
   const task=taskId?await ports.readTask(ctx,taskId,tx):await ports.findTaskByAttempt(ctx,value.attemptId,tx);
   if(task){originalTask(value,task);taskId=task.id;executionTaskId=task.executionTaskId??null;
    status=task.runtimeStatus==="waiting_user"&&executionTaskId?"waiting_user":task.status==="failed"?"failed":task.status==="cancelled"||task.status==="cancel_requested"?"cancelled":task.status==="succeeded"?"failed":task.status==="running"?"running":"queued";
    errorCode=status==="waiting_user"?(task.errorCode??"MODEL_TASK_WAITING_USER"):status==="failed"?(task.errorCode??(task.status==="succeeded"?"REVIEW_COMMIT_MISSING":"MODEL_TASK_FAILED")):null;
    errorMessage=task.errorMessage??null;
   }
  }
  return workReviewReport.parse({reportId:value.id,compositionId:value.compositionId,snapshot,status,taskId,executionTaskId,settledCallId:value.settledCallId,outcome:value.outcome,errorCode,errorMessage,createdAt:value.createdAt});
 }
 async function reserve(tx:Db,ctx:RequestContext,projectId:string,operation:string,input:{clientRequestId:string;scope:WorkReviewScope}){
  const requestDigest=digest({operation,input});await tx.insert(workReviewRequests).values({id:nextId("wr-request"),userId:ctx.userId,accountId:account(ctx),projectId,compositionId:input.scope.compositionId,requestId:input.clientRequestId,requestDigest,operation,input,status:"reserved",createdAt:now()}).onConflictDoNothing();
  const [receipt]=await tx.select().from(workReviewRequests).where(requestWhere(ctx,input.clientRequestId)).for("update");if(!receipt||receipt.requestDigest!==requestDigest)throw new Conflict("同一审核请求不能改变完整原输入");return receipt;
 }
 async function get(ctx:RequestContext,id:string){return dto(ctx,await row(ctx,id));}
 async function status(ctx:RequestContext,raw:unknown){const scope=workReviewScope.parse(raw),current=freezeReview(scope,await ports.readCurrent(ctx,scope,db,false),now());
  const reports=await db.select().from(workReviewReports).where(and(eq(workReviewReports.userId,ctx.userId),eq(workReviewReports.accountId,account(ctx)),eq(workReviewReports.compositionId,scope.compositionId),eq(workReviewReports.scopeKey,canonical(scope)))).orderBy(desc(workReviewReports.ordinal)).limit(1);
  const confirmations=await db.select().from(workReviewConfirmations).where(and(eq(workReviewConfirmations.userId,ctx.userId),eq(workReviewConfirmations.accountId,account(ctx)),eq(workReviewConfirmations.compositionId,scope.compositionId),eq(workReviewConfirmations.scopeKey,canonical(scope)))).orderBy(desc(workReviewConfirmations.ordinal)).limit(1);
  const latestReport=reports[0]?await dto(ctx,reports[0]):null,confirmation=confirmations[0]?workReviewConfirmation.parse(confirmations[0].confirmation):null;
  const confirmedRow=confirmation?.mode==="model"?(reports[0]?.id===confirmation.reportId?reports[0]:await row(ctx,confirmation.reportId!)):undefined;
  const confirmedReport=confirmedRow?await dto(ctx,confirmedRow):null;
  const currentReport=latestReport?.snapshot.fingerprint===current.snapshot.fingerprint?latestReport:null;
  const currentConfirmation=confirmation?.fingerprint===current.snapshot.fingerprint;
  const state=currentConfirmation?"confirmed_current":currentReport?.status==="running"||currentReport?.status==="queued"?"running":currentReport?.status==="waiting_user"?"waiting_user":currentReport?.status==="succeeded"?(currentReport.outcome?.conclusion==="needs_changes"?"needs_changes":"awaiting_confirmation"):(confirmation&&confirmation.fingerprint!==current.snapshot.fingerprint)||(latestReport&&latestReport.snapshot.fingerprint!==current.snapshot.fingerprint)?"basis_updated":"not_reviewed";
  const evidence=[latestReport,confirmedReport].filter(report=>report?.status==="succeeded"&&report.snapshot.fingerprint===current.snapshot.fingerprint);
  const files=current.snapshot.members.flatMap(member=>member.fields.flatMap(field=>field.files));
  return workReviewStatusV2.parse({scope,currentFingerprint:current.snapshot.fingerprint,state,latestReport,confirmedReport,confirmation,modelVerification:evidence.length?"verified":"not_verified",visualVerification:evidence.some(report=>report?.outcome?.visualVerification==="verified")?"verified":files.length?"not_verified":"not_applicable"});
 }
 return{
  get,status,
  async list(ctx:RequestContext,compositionId:string){await ports.assertComposition(ctx,compositionId,db);const rows=await db.select().from(workReviewReports).where(and(eq(workReviewReports.userId,ctx.userId),eq(workReviewReports.accountId,account(ctx)),eq(workReviewReports.compositionId,compositionId))).orderBy(desc(workReviewReports.ordinal));return Promise.all(rows.map(value=>dto(ctx,value)));},
  async request(ctx:RequestContext,id:string){const [receipt]=await db.select().from(workReviewRequests).where(requestWhere(ctx,id));if(!receipt)throw new OwnershipError("审核请求不存在");await ports.assertComposition(ctx,receipt.compositionId,db);return workReviewRequestResource.parse({clientRequestId:receipt.requestId,requestDigest:receipt.requestDigest,operation:receipt.operation,input:receipt.input,status:receipt.status,reportId:receipt.reportId,confirmationId:receipt.confirmationId,errorCode:receipt.errorCode,createdAt:receipt.createdAt});},
  async create(ctx:RequestContext,raw:unknown){const input=workReviewCreateBody.parse(raw);
   const reportId=await db.transaction(async transaction=>{const tx=transaction as unknown as Db,{projectId}=await ports.assertComposition(ctx,input.scope.compositionId,tx,true),receipt=await reserve(tx,ctx,projectId,"create",input);if(receipt.reportId)return receipt.reportId;
    const frozen=freezeReview(input.scope,await ports.readCurrent(ctx,input.scope,tx,true),now());if(input.scope.kind==="composition"&&!frozen.context.selection.length)throw new Conflict("没有所选表达，保留人工检查，不提交模型任务");if(frozen.context.projectId!==projectId)throw new OwnershipError("审核上下文不属于当前项目");
    const id=nextId("wr-report");await tx.insert(workReviewReports).values({id,userId:ctx.userId,accountId:account(ctx),projectId,compositionId:input.scope.compositionId,scopeKey:canonical(input.scope),snapshot:frozen.snapshot,frozenContext:frozen.context,attemptId:`work-review-${id}`,status:"queued",createdAt:now()});await tx.update(workReviewRequests).set({reportId:id}).where(requestWhere(ctx,input.clientRequestId));return id;
   });
   const taskId=await db.transaction(async transaction=>{const tx=transaction as unknown as Db;await ports.assertComposition(ctx,input.scope.compositionId,tx,true);const report=await row(ctx,reportId,tx,true);if(report.taskId)return report.taskId;
    const snapshot=workReviewReport.shape.snapshot.parse(report.snapshot),task=await ports.findTaskByAttempt(ctx,report.attemptId,tx)??await ports.submitTask(ctx,{reportId,projectId:report.projectId,attemptId:report.attemptId,fingerprint:snapshot.fingerprint},tx);originalTask(report,task);
    await tx.update(workReviewReports).set({taskId:task.id,executionTaskId:task.executionTaskId??null}).where(reportWhere(ctx,reportId));await tx.update(workReviewRequests).set({status:"committed"}).where(requestWhere(ctx,input.clientRequestId));return task.id;
   });
   const task=await ports.readTask(ctx,taskId,db);if(!["succeeded","failed","cancelled"].includes(task.status))await ports.wakeTask(ctx,taskId);return get(ctx,reportId);
  },
  async confirm(ctx:RequestContext,raw:unknown){const input=workReviewConfirmBody.parse(raw);const confirmation=await db.transaction(async transaction=>{const tx=transaction as unknown as Db,{projectId}=await ports.assertComposition(ctx,input.scope.compositionId,tx,true),receipt=await reserve(tx,ctx,projectId,"confirm",input);
   if(receipt.status==="committed"&&receipt.confirmationId){const [saved]=await tx.select().from(workReviewConfirmations).where(and(eq(workReviewConfirmations.id,receipt.confirmationId),eq(workReviewConfirmations.userId,ctx.userId),eq(workReviewConfirmations.accountId,account(ctx))));if(!saved)throw new Conflict("原确认回执缺失");return workReviewConfirmation.parse(saved.confirmation);}
   const current=freezeReview(input.scope,await ports.readCurrent(ctx,input.scope,tx,true),now());if(current.context.projectId!==projectId)throw new OwnershipError("审核上下文不属于当前项目");if(current.snapshot.fingerprint!==input.expectedFingerprint)throw new Conflict("内容已更新，请对照当前触点后确认");
   const refs=current.snapshot.members.flatMap(member=>member.fields.flatMap(field=>field.sources));for(const ref of input.historicalBasis)if(!refs.some(source=>canonical(source)===canonical(ref)))throw new Conflict("保留历史依据超出当前触点明确来源");
   if(input.mode==="model"){const report=await dto(ctx,await row(ctx,input.reportId,tx),tx);if(report.status!=="succeeded"||report.snapshot.fingerprint!==input.expectedFingerprint||canonical(report.snapshot.scope)!==canonical(input.scope))throw new Conflict("模型确认必须对应同触点同指纹真实报告");}
   const result=workReviewConfirmation.parse({confirmationId:nextId("wr-confirm"),scope:input.scope,fingerprint:input.expectedFingerprint,mode:input.mode,reportId:input.mode==="model"?input.reportId:null,historicalBasis:input.historicalBasis,clientRequestId:input.clientRequestId,requestDigest:receipt.requestDigest,confirmedAt:now()});
   await tx.insert(workReviewConfirmations).values({id:result.confirmationId,userId:ctx.userId,accountId:account(ctx),projectId,compositionId:input.scope.compositionId,scopeKey:canonical(input.scope),confirmation:result,createdAt:now()});await tx.update(workReviewRequests).set({status:"committed",confirmationId:result.confirmationId,reportId:result.reportId}).where(requestWhere(ctx,input.clientRequestId));return result;
  });return{confirmation,status:await status(ctx,input.scope)};},
  /** ai-runtime准备端口；只读取原task与持久冻结输入，不重冻当前稿件。 */
  async readFrozenTask(ctx:RequestContext,input:{taskId:string;reportId:string;fingerprint:string}){const report=await row(ctx,input.reportId),task=await ports.readTask(ctx,input.taskId,db);originalTask(report,task);const snapshot=workReviewReport.shape.snapshot.parse(report.snapshot);if(snapshot.fingerprint!==input.fingerprint)throw new Conflict("审核任务指纹不一致");const frozen=freezeReview(snapshot.scope,report.frozenContext,snapshot.frozenAt);if(canonical(frozen.snapshot)!==canonical(snapshot))throw new Conflict("审核持久输入与快照不一致");return{reportId:report.id,snapshot:frozen.snapshot,modelContext:frozen.modelContext};},
 };
}
export type WorkReviewsService=ReturnType<typeof createWorkReviewsService>;
