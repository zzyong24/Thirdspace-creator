from pathlib import Path
p=Path('backend/src/modules/review/work-reviews.service.ts')
s=p.read_text().replace('and,eq,desc,OwnershipError','and,eq,isNull,desc,OwnershipError')
s=s.replace('import {lockWorkspaceMembership}', 'import {type FrozenWorkspace,lockWorkspaceMembership}')
s=s.replace(' readTask(ctx:RequestContext,id:string,tx:Db):Promise<WorkReviewTask>;',''' readTask(ctx:RequestContext,id:string,tx:Db):Promise<WorkReviewTask>;
 /** 同tx真实AI行归属；不进入公开任务DTO。 */
 readTaskOwner(ctx:RequestContext,id:string,tx:Db):Promise<FrozenWorkspace>;''')
anchor=' async function dto(ctx:RequestContext'
pos=s.index(anchor)
s=s[:pos]+''' // 仅旧账号入口新增account→member→group锁；页面筛选账号不参与组创作归属。
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
''' + s[pos:]
a=s.index('  async create(ctx:RequestContext,raw:unknown)');b=s.index('  async confirm(',a)
s=s[:a]+'''  async create(ctx:RequestContext,raw:unknown){
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
''' +s[b:]
a=s.index('  async readFrozenTask(');b=s.index('\n };',a)
s=s[:a]+'''  async readFrozenTask(ctx:RequestContext,input:{taskId:string;reportId:string;fingerprint:string}){
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
  },''' +s[b:]
p.write_text(s)
p=Path('backend/src/modules/review/work-review-task-adapter.ts');s=p.read_text().replace('"createTask"|"findTaskByAttempt"|"getTask"','"createTask"|"findTaskByAttempt"|"getTask"|"getTaskExecutionRuntime"').replace('"submitTask"|"readTask"|"wakeTask"','"submitTask"|"readTask"|"readTaskOwner"|"wakeTask"').replace('readTask:(ctx,id,tx)=>aiFor(tx).getTask(ctx,id),wakeTask,','''readTask:(ctx,id,tx)=>aiFor(tx).getTask(ctx,id),
  readTaskOwner:async(ctx,id,tx)=>(await aiFor(tx).getTaskExecutionRuntime(ctx,id)).owner,
  wakeTask,''');p.write_text(s)
p=Path('backend/src/application/generation/work-review-root.ts');s=p.read_text().replace("'createTask'|'findTaskByAttempt'|'getTask'","'createTask'|'findTaskByAttempt'|'getTask'|'getTaskExecutionRuntime'");p.write_text(s)
