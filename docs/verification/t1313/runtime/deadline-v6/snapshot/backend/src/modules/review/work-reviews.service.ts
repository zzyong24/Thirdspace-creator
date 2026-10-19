import {workspaceFilter,workspaceStamp,workspaceKey} from "../../workspace-scope";
import {withWorkspaceWrite} from "../../workspace-write";
import {type FrozenWorkspace,lockWorkspaceMembership} from "../platform-account/membership-lock.service";
import {and,eq,isNull,desc,OwnershipError,requireAccountId,type Db} from "@creatoros/backend";
import {workReviewScope,workReviewReport,workReviewCreateBody,workReviewConfirmBody,workReviewConfirmation,workReviewRequestResource,ErrorCode,type RequestContext,type WorkReviewScope,type WorkReviewReport,type WorkReviewConfirmation} from "@creatoros/contract";
import {workReviewReports,workReviewConfirmations,workReviewRequests} from "../../schema/work-reviews";
import {freezeReview,canonical,digest,type FrozenReviewContext} from "./work-review-fingerprint";
import {workReviewStatus as workReviewStatusV2} from "@creatoros/contract";
class Conflict extends Error{readonly code=ErrorCode.ConflictError;}
export interface WorkReviewTask {id:string;projectId:string|null;taskType:string;attemptId:string;inputData:Record<string,unknown>;status:string;runtimeStatus?:string;executionTaskId?:string;errorCode?:string|null;errorMessage?:string|null;}
export interface WorkReviewPorts {
 /** 先锁项目后组合；forUpdate只在同一tx内有效。get/report历史只验组合归属。 */
 assertComposition(ctx:RequestContext,id:string,tx:Db,forUpdate?:boolean):Promise<{projectId:string}>;
 /** 锁当前原owner后读精确field值、明确依赖摘录/fileHash/ruleValue，不猜语义或血缘。 */
 readCurrent(ctx:RequestContext,scope:WorkReviewScope,tx:Db,forUpdate:boolean):Promise<FrozenReviewContext>;
 findTaskByAttempt(ctx:RequestContext,attemptId:string,tx:Db):Promise<WorkReviewTask|null>;
 /** 只创建原AI业务task；必须使用传入tx，禁止调用模型或起第二队列。 */
 submitTask(ctx:RequestContext,input:{reportId:string;projectId:string;attemptId:string;fingerprint:string},tx:Db):Promise<WorkReviewTask>;
 readTask(ctx:RequestContext,id:string,tx:Db):Promise<WorkReviewTask>;
 /** 同tx真实AI行归属；不进入公开任务DTO。 */
 readTaskOwner(ctx:RequestContext,id:string,tx:Db):Promise<FrozenWorkspace>;
 /** 原execution dispatcher prepare/wake；提交事务结束后调用。 */
 wakeTask(ctx:RequestContext,id:string):Promise<void>;
}
export function createWorkReviewsService(deps:{db:Db;now:()=>string;nextId:(prefix:string)=>string;ports:WorkReviewPorts}){
 const {db,now,nextId,ports}=deps,account=(ctx:RequestContext)=>requireAccountId(ctx.accountId);
 const reportWhere=(ctx:RequestContext,id:string)=>and(eq(workReviewReports.id,id),eq(workReviewReports.userId,ctx.userId),workspaceFilter(workReviewReports,ctx));
 const requestWhere=(ctx:RequestContext,id:string)=>and(eq(workReviewRequests.requestId,id),eq(workReviewRequests.userId,ctx.userId),workspaceFilter(workReviewRequests,ctx));
 async function row(ctx:RequestContext,id:string,tx=db,lock=false){const query=tx.select().from(workReviewReports).where(reportWhere(ctx,id));const [value]=await(lock?query.for("update"):query);if(!value)throw new OwnershipError("审核报告不存在");await ports.assertComposition(ctx,value.compositionId,tx);return value;}
 function originalTask(report:typeof workReviewReports.$inferSelect,task:WorkReviewTask){
  const snapshot=workReviewReport.shape.snapshot.parse(report.snapshot);
  if(task.taskType!=="work.review"||task.projectId!==report.projectId||task.attemptId!==report.attemptId||task.inputData.projectId!==report.projectId||task.inputData.workReviewReportId!==report.id||task.inputData.snapshotFingerprint!==snapshot.fingerprint||(report.taskId&&task.id!==report.taskId))throw new Conflict("原审核任务冻结映射不一致");
 }
 // 仅旧账号入口新增account→member→group锁；页面筛选账号不参与组创作归属。
 async function withReviewWrite<T>(ctx:RequestContext,submit:boolean,body:(tx:Db,owner:FrozenWorkspace)=>Promise<T>):Promise<T>{
  if(!ctx.groupId){
   return db.transaction(async outer=>{
    const owner=await lockWorkspaceMembership(outer,ctx);
    return withWorkspaceWrite(outer as unknown as Db,ctx,tx=>body(tx as unknown as Db,owner));
   });
  }
  const original={...ctx,...workspaceStamp(workspaceKey(ctx))};
  if(submit){
   return db.transaction(async outer=>{
    const owner=await lockWorkspaceMembership(outer,original);
    return withWorkspaceWrite(outer as unknown as Db,ctx,tx=>body(tx as unknown as Db,owner));
   });
  }
  return withWorkspaceWrite(db,ctx,tx=>body(tx as unknown as Db,{
   userId:ctx.userId,...workspaceStamp(workspaceKey(ctx)),groupVersion:null,membershipVersion:null,
  }));
 }
 function sameOwner(report:typeof workReviewReports.$inferSelect,owner:FrozenWorkspace){
  if(report.userId!==owner.userId||report.groupId!==owner.groupId||report.accountId!==owner.accountId){
   throw new Conflict("原审核报告与任务冻结归属不一致");
  }
 }
 async function verifyTask(tx:Db,ctx:RequestContext,report:typeof workReviewReports.$inferSelect,task:WorkReviewTask){
  originalTask(report,task);
  sameOwner(report,await ports.readTaskOwner(ctx,task.id,tx));
 }
 function validateSnapshot(report:typeof workReviewReports.$inferSelect){
  const snapshot=workReviewReport.shape.snapshot.parse(report.snapshot);
  const frozen=freezeReview(snapshot.scope,report.frozenContext,snapshot.frozenAt);
  if(snapshot.scope.compositionId!==report.compositionId||report.scopeKey!==canonical(snapshot.scope)||frozen.context.projectId!==report.projectId||canonical(frozen.snapshot)!==canonical(snapshot)){
   throw new Conflict("审核持久输入与快照不一致");
  }
  return frozen;
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

 async function requestRows(ctx:RequestContext,id:string,tx=db,lock=false){const q=tx.select().from(workReviewRequests).where(requestWhere(ctx,id)),rows=await(lock?q.for("update"):q);if(rows.length>1)throw new Conflict("原审核请求存在多个账号来源，请以原真实ID读取");return rows;}
 async function requestIdentity(tx:Db,ctx:RequestContext,id:string){const [row]=await requestRows(ctx,id,tx,true);if(!row)throw new Conflict("原审核请求缺失");return eq(workReviewRequests.id,row.id);}
 async function reserve(tx:Db,ctx:RequestContext,projectId:string,operation:string,input:{clientRequestId:string;scope:WorkReviewScope}){
  const requestDigest=digest({operation,input});const [prior]=await requestRows(ctx,input.clientRequestId,tx,true);if(prior){if(prior.requestDigest!==requestDigest)throw new Conflict("同一审核请求不能改变完整原输入");return prior;}await tx.insert(workReviewRequests).values({id:nextId("wr-request"),userId:ctx.userId,...workspaceStamp(workspaceKey(ctx)),projectId,compositionId:input.scope.compositionId,requestId:input.clientRequestId,requestDigest,operation,input,status:"reserved",createdAt:now()}).onConflictDoNothing();
  const [receipt]=await requestRows(ctx,input.clientRequestId,tx,true);if(!receipt||receipt.requestDigest!==requestDigest)throw new Conflict("同一审核请求不能改变完整原输入");return receipt;
 }
 async function get(ctx:RequestContext,id:string){return dto(ctx,await row(ctx,id));}
 async function status(ctx:RequestContext,raw:unknown){const scope=workReviewScope.parse(raw),current=freezeReview(scope,await ports.readCurrent(ctx,scope,db,false),now());
  const reports=await db.select().from(workReviewReports).where(and(eq(workReviewReports.userId,ctx.userId),workspaceFilter(workReviewReports,ctx),eq(workReviewReports.compositionId,scope.compositionId),eq(workReviewReports.scopeKey,canonical(scope)))).orderBy(desc(workReviewReports.ordinal)).limit(1);
  const confirmations=await db.select().from(workReviewConfirmations).where(and(eq(workReviewConfirmations.userId,ctx.userId),workspaceFilter(workReviewConfirmations,ctx),eq(workReviewConfirmations.compositionId,scope.compositionId),eq(workReviewConfirmations.scopeKey,canonical(scope)))).orderBy(desc(workReviewConfirmations.ordinal)).limit(1);
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
  async list(ctx:RequestContext,compositionId:string){await ports.assertComposition(ctx,compositionId,db);const rows=await db.select().from(workReviewReports).where(and(eq(workReviewReports.userId,ctx.userId),workspaceFilter(workReviewReports,ctx),eq(workReviewReports.compositionId,compositionId))).orderBy(desc(workReviewReports.ordinal));return Promise.all(rows.map(value=>dto(ctx,value)));},
  async request(ctx:RequestContext,id:string){const [receipt]=await requestRows(ctx,id);if(!receipt)throw new OwnershipError("审核请求不存在");await ports.assertComposition(ctx,receipt.compositionId,db);return workReviewRequestResource.parse({clientRequestId:receipt.requestId,requestDigest:receipt.requestDigest,operation:receipt.operation,input:receipt.input,status:receipt.status,reportId:receipt.reportId,confirmationId:receipt.confirmationId,errorCode:receipt.errorCode,createdAt:receipt.createdAt});},
  async create(ctx:RequestContext,raw:unknown){
   const input=workReviewCreateBody.parse(raw);
   // 阶段1独立提交：回执仍沿实际请求scope，新报告使用同事务真实冻结owner。
   const reportId=await withReviewWrite(ctx,false,async(tx,owner)=>{
    const {projectId}=await ports.assertComposition(ctx,input.scope.compositionId,tx,true);
    const receipt=await reserve(tx,ctx,projectId,"create",input);
    if(receipt.reportId)return receipt.reportId;
    const frozen=freezeReview(input.scope,await ports.readCurrent(ctx,input.scope,tx,true),now());
    if(input.scope.kind==="composition"&&!frozen.context.selection.length){
     throw new Conflict("没有所选表达，保留人工检查，不提交模型任务");
    }
    if(frozen.context.projectId!==projectId)throw new OwnershipError("审核上下文不属于当前项目");
    const id=nextId("wr-report");
    await tx.insert(workReviewReports).values({
     id,userId:owner.userId,groupId:owner.groupId,accountId:owner.accountId,
     groupVersion:owner.groupVersion,membershipVersion:owner.membershipVersion,
     projectId,compositionId:input.scope.compositionId,scopeKey:canonical(input.scope),
     snapshot:frozen.snapshot,frozenContext:frozen.context,attemptId:`work-review-${id}`,
     status:"queued",createdAt:now(),
    });
    await tx.update(workReviewRequests).set({reportId:id}).where(await requestIdentity(tx,ctx,input.clientRequestId));
    return id;
   });
   const pending=await row(ctx,reportId);
   // 阶段2再次锁实际ctx；不得从report.group反推旧入口，改变AI原幂等fingerprint。
   const taskId=await withReviewWrite(ctx,true,async(tx,owner)=>{
    await ports.assertComposition(ctx,input.scope.compositionId,tx,true);
    const report=await row(ctx,reportId,tx,true);
    sameOwner(report,owner);
    for(const key of ["userId","groupId","accountId","groupVersion","membershipVersion","projectId","compositionId","scopeKey","attemptId","snapshot","frozenContext"] as const){
     if(canonical(report[key])!==canonical(pending[key]))throw new Conflict("原审核冻结身份在预约后改变");
    }
    const [receipt]=await requestRows(ctx,input.clientRequestId,tx,true);
    if(!receipt||receipt.operation!=="create"||receipt.reportId!==report.id||receipt.projectId!==report.projectId||receipt.compositionId!==report.compositionId||receipt.requestDigest!==digest({operation:"create",input})||canonical(receipt.input)!==canonical(input)){
     throw new Conflict("原审核请求与报告映射不一致");
    }
    const frozen=validateSnapshot(report);
    // 普通组创作保持account=null；legacy保留实际noGroup ctxA供原AI幂等检查。
    const original=ctx.groupId?{...ctx,...workspaceStamp(workspaceKey(ctx))}:ctx;
    if(report.taskId){
     await verifyTask(tx,original,report,await ports.readTask(original,report.taskId,tx));
     return report.taskId;
    }
    // 未绑定同attempt仍必须进入原createTask分支，不能绕过其requestFingerprint。
    const task=await ports.submitTask(original,{
     reportId,projectId:report.projectId,attemptId:report.attemptId,fingerprint:frozen.snapshot.fingerprint,
    },tx);
    await verifyTask(tx,original,report,task);
    await tx.update(workReviewReports).set({taskId:task.id,executionTaskId:task.executionTaskId??null}).where(reportWhere(ctx,reportId));
    await tx.update(workReviewRequests).set({status:"committed"}).where(eq(workReviewRequests.id,receipt.id));
    return task.id;
   });
   const task=await ports.readTask(ctx,taskId,db);
   if(!["succeeded","failed","cancelled"].includes(task.status))await ports.wakeTask(ctx,taskId);
   return get(ctx,reportId);
  },
  async confirm(ctx:RequestContext,raw:unknown){const input=workReviewConfirmBody.parse(raw);const confirmation=await withWorkspaceWrite(db,ctx,async transaction=>{const tx=transaction as unknown as Db,{projectId}=await ports.assertComposition(ctx,input.scope.compositionId,tx,true),receipt=await reserve(tx,ctx,projectId,"confirm",input);
   if(receipt.status==="committed"&&receipt.confirmationId){const [saved]=await tx.select().from(workReviewConfirmations).where(and(eq(workReviewConfirmations.id,receipt.confirmationId),eq(workReviewConfirmations.userId,ctx.userId),workspaceFilter(workReviewConfirmations,ctx)));if(!saved)throw new Conflict("原确认回执缺失");return workReviewConfirmation.parse(saved.confirmation);}
   const current=freezeReview(input.scope,await ports.readCurrent(ctx,input.scope,tx,true),now());if(current.context.projectId!==projectId)throw new OwnershipError("审核上下文不属于当前项目");if(current.snapshot.fingerprint!==input.expectedFingerprint)throw new Conflict("内容已更新，请对照当前触点后确认");
   const refs=current.snapshot.members.flatMap(member=>member.fields.flatMap(field=>field.sources));for(const ref of input.historicalBasis)if(!refs.some(source=>canonical(source)===canonical(ref)))throw new Conflict("保留历史依据超出当前触点明确来源");
   if(input.mode==="model"){const report=await dto(ctx,await row(ctx,input.reportId,tx),tx);if(report.status!=="succeeded"||report.snapshot.fingerprint!==input.expectedFingerprint||canonical(report.snapshot.scope)!==canonical(input.scope))throw new Conflict("模型确认必须对应同触点同指纹真实报告");}
   const result=workReviewConfirmation.parse({confirmationId:nextId("wr-confirm"),scope:input.scope,fingerprint:input.expectedFingerprint,mode:input.mode,reportId:input.mode==="model"?input.reportId:null,historicalBasis:input.historicalBasis,clientRequestId:input.clientRequestId,requestDigest:receipt.requestDigest,confirmedAt:now()});
   await tx.insert(workReviewConfirmations).values({id:result.confirmationId,userId:ctx.userId,...workspaceStamp(workspaceKey(ctx)),projectId,compositionId:input.scope.compositionId,scopeKey:canonical(input.scope),confirmation:result,createdAt:now()});await tx.update(workReviewRequests).set({status:"committed",confirmationId:result.confirmationId,reportId:result.reportId}).where(await requestIdentity(tx,ctx,input.clientRequestId));return result;
  });return{confirmation,status:await status(ctx,input.scope)};},
  /** ai-runtime准备端口；只读取原task与持久冻结输入，不重冻当前稿件。 */
  async readFrozenTask(ctx:RequestContext,input:{taskId:string;reportId:string;fingerprint:string}){
   return db.transaction(async transaction=>{
    const tx=transaction as unknown as Db;
    const task=await ports.readTask(ctx,input.taskId,tx);
    const owner=await ports.readTaskOwner(ctx,input.taskId,tx);
    const [report]=await tx.select().from(workReviewReports).where(and(
     eq(workReviewReports.id,input.reportId),eq(workReviewReports.userId,owner.userId),
     owner.groupId===null?isNull(workReviewReports.groupId):eq(workReviewReports.groupId,owner.groupId),
     owner.accountId===null?isNull(workReviewReports.accountId):eq(workReviewReports.accountId,owner.accountId),
    ));
    if(!report)throw new OwnershipError("审核报告不存在");
    if(report.taskId!==task.id)throw new Conflict("原审核任务冻结映射不一致");
    originalTask(report,task);
    const frozen=validateSnapshot(report);
    if(frozen.snapshot.fingerprint!==input.fingerprint)throw new Conflict("审核任务指纹不一致");
    return{reportId:report.id,snapshot:frozen.snapshot,modelContext:frozen.modelContext};
   });
  },
 };
}
export type WorkReviewsService=ReturnType<typeof createWorkReviewsService>;
