import {afterAll,beforeAll,expect,it} from "vitest";
import {createDb,aiTasks,aiTaskResults,executionTasks,executionCalls,scriptReviewReports,eq,sql,type Db} from "@creatoros/backend";
import {createPersistentTaskService} from "../execution/persistent-task.service";
import {createExecutionCallLedgerService} from "../execution/execution-call-ledger.service";
import {createExecutionReviewReportService} from "./execution-review-report.service";
const ctx={userId:"review-user",accountId:"review-account",requestId:"test",source:"user" as const};
const stamp="2026-09-05T00:00:00.000Z",now=()=>stamp;
let db:Db,close:()=>Promise<void>;
beforeAll(async()=>{const c=await createDb();db=c.db;close=()=>c.client.close();});afterAll(async()=>close?.());
const finding={quote:"保证赚钱",category:"夸大",severity:"warn",reason:"需核实",suggestion:"描述实际结果",ruleRef:null};
const lint={ruleId:"official-rule",quote:"保证赚钱",offset:0,tier:"official_hard",category:"夸大",replacement:null,note:"硬规则"};
async function fixture(id:string,changes:{object?:unknown;modelLabel?:string|null;lintFindings?:unknown[];partial?:boolean}={}){
 const snapshot={projectId:`project-${id}`,artifactId:`script-${id}`,artifactVersion:2,script:"保证赚钱是不当承诺，应描述实际案例。",lintFindings:changes.lintFindings ?? [lint]};
 const modelInput={kind:"model.structured",skillId:"script.review",facets:{__reviewSnapshot:JSON.stringify(snapshot)}};
 const tasks=createPersistentTaskService(db,{now});const task=await tasks.enqueue(ctx,{kind:"ai_task",ownerType:"ai_task",ownerId:id,idempotencyKey:id,payload:{modelInput}});
 await db.insert(aiTasks).values({id,userId:ctx.userId,accountId:ctx.accountId,taskType:"script.review",projectId:snapshot.projectId,inputData:{projectId:snapshot.projectId},status:"running",executionTaskId:task.id,idempotencyKey:id,requestedAt:stamp});
 const claim=(await tasks.claimTask({taskId:task.id,workerId:"worker"}))!,ref={executionTaskId:task.id,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
 const ledger=createExecutionCallLedgerService(db,{now,budget:{maxCalls:5,maxTokens:1000,deadlineMs:60000}});
 const call=await ledger.reserve(ref,{operationKey:"review",kind:"model",inputDigest:"sha256:"+"a".repeat(64),reservedTokens:100});await ledger.start(ref,call.id);
 const text=JSON.stringify({...(changes.partial ? {validation:{status:"partial",errors:[],policySnapshot:{policy:{schemaVersion:1,minSegments:1,maxSegments:null,requiredSequence:[],repairAttempts:0},adapter:{id:"review",version:"1"}},originalSegmentCount:0,finalSegmentCount:0,repairAttemptsUsed:0,repairReasons:[]}} : {}),object:changes.object ?? {verdict:"pass",summary:"审核完成",findings:[finding,{...finding,quote:"原文没有的话"}]},...(changes.modelLabel===null?{}:{modelLabel:changes.modelLabel ?? "real-provider-model"}),generation:{finishReason:"stop",usage:{inputTokens:3,outputTokens:2,cachedTokens:0,totalTokens:5},attempts:[]}});
 await ledger.settle(ref,call.id,{status:"settled",usage:{totalTokens:5},resultText:text});
 return {task,tasks,ref,call,snapshot,modelInput,text,commit:{outcome:"succeeded",callId:call.id,text},service:createExecutionReviewReportService(db,{now})};
}
it("真实报告同事务提交且并发重放幂等，无候选写入，保留冻结版本与模型名",async()=>{
 const f=await fixture("review-once");const [a,b]=await Promise.all([f.service.commitResult(f.ref,f.commit),f.service.commitResult(f.ref,f.commit)]);expect(a).toEqual(b);expect(a).toEqual({resultId:`srreport:${f.call.id}`,aiTaskId:"review-once"});
 const rows=await db.select().from(scriptReviewReports).where(eq(scriptReviewReports.id,a.resultId));expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({projectId:f.snapshot.projectId,artifactId:f.snapshot.artifactId,artifactVersion:2,verdict:"block",summary:"审核完成",modelLabel:"real-provider-model",llmFindings:[finding],lintFindings:[lint]});
 expect(await db.select().from(aiTaskResults).where(eq(aiTaskResults.aiTaskId,"review-once"))).toHaveLength(0);
 expect((await db.select().from(aiTasks).where(eq(aiTasks.id,"review-once")))[0]).toMatchObject({status:"succeeded",completedAt:stamp});
 expect((await f.tasks.get(ctx,f.task.id)).status).toBe("succeeded");
 expect(await f.service.commitResult(f.ref,f.commit)).toEqual(a);
});
it.each([{verdict:"risk",summary:"模型报告风险",findings:[]},{verdict:"block",summary:"模型明确阻断",findings:[]}])("无L1也保留模型原始判定 %s",async object=>{
 const f=await fixture(`review-${object.verdict}`,{object,lintFindings:[]});const result=await f.service.commitResult(f.ref,f.commit);expect((await db.select().from(scriptReviewReports).where(eq(scriptReviewReports.id,result.resultId)))[0]?.verdict).toBe(object.verdict);
});
it.each([{summary:"缺判定",findings:[]},{verdict:"pass",summary:"缺命中项"},{verdict:"pass",findings:[]},{verdict:"pass",summary:"   ",findings:[]}])("原始审核顶层信息缺失不能补成通过 %s",async object=>{
 const f=await fixture(`invalid-${JSON.stringify(object)}`,{object});await expect(f.service.commitResult(f.ref,f.commit)).rejects.toThrow();expect((await f.tasks.get(ctx,f.task.id)).status).toBe("running");
});
it("模型名缺失不能猜；原文外lint也不能制造硬阻断",async()=>{
 const missing=await fixture("review-no-model",{modelLabel:null});await expect(missing.service.commitResult(missing.ref,missing.commit)).rejects.toThrow();
 const f=await fixture("review-quote",{lintFindings:[{...lint,quote:"不存在"}],object:{verdict:"pass",summary:"无风险",findings:[{...finding,quote:""}]}});const result=await f.service.commitResult(f.ref,f.commit);expect((await db.select().from(scriptReviewReports).where(eq(scriptReviewReports.id,result.resultId)))[0]).toMatchObject({verdict:"pass",lintFindings:[],llmFindings:[]});
});
it("取消、过期、旧fence、正文替换与跨项目映射均拒绝",async()=>{
 const f=await fixture("review-guards");await expect(f.service.commitResult({...f.ref,fenceToken:"old"},f.commit)).rejects.toThrow();await expect(f.service.commitResult(f.ref,{...f.commit,text:"伪造"})).rejects.toThrow();
 await db.update(aiTasks).set({inputData:{projectId:"foreign-project"}}).where(eq(aiTasks.id,"review-guards"));await expect(f.service.commitResult(f.ref,f.commit)).rejects.toThrow();
 await db.update(aiTasks).set({inputData:{projectId:f.snapshot.projectId}}).where(eq(aiTasks.id,"review-guards"));
 await db.update(executionTasks).set({deadlineAt:stamp}).where(eq(executionTasks.id,f.task.id));await expect(f.service.commitResult(f.ref,f.commit)).rejects.toThrow();
 await db.update(executionTasks).set({deadlineAt:null}).where(eq(executionTasks.id,f.task.id));await f.tasks.command(ctx,{taskIds:[f.task.id],command:"cancel",idempotencyKey:"cancel-review"});await expect(f.service.commitResult(f.ref,f.commit)).rejects.toThrow();
 expect(await db.select().from(scriptReviewReports).where(eq(scriptReviewReports.projectId,f.snapshot.projectId))).toHaveLength(0);
});
it("成功状态写失败会回滚报告和resultRef，原调用可恢复提交",async()=>{
 const f=await fixture("review-rollback");await db.execute(sql.raw(`CREATE FUNCTION fail_review_finish() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id = '${f.task.id}' AND NEW.status = 'succeeded' THEN RAISE EXCEPTION 'finish failed'; END IF; RETURN NEW; END $$;`));await db.execute(sql.raw("CREATE TRIGGER fail_review_finish BEFORE UPDATE ON execution_tasks FOR EACH ROW EXECUTE FUNCTION fail_review_finish();"));
 try{await expect(f.service.commitResult(f.ref,f.commit)).rejects.toThrow();expect(await db.select().from(scriptReviewReports).where(eq(scriptReviewReports.projectId,f.snapshot.projectId))).toHaveLength(0);expect((await db.select().from(executionCalls).where(eq(executionCalls.id,f.call.id)))[0]?.resultRef).toBeNull();}
 finally{await db.execute(sql.raw("DROP TRIGGER fail_review_finish ON execution_tasks;"));await db.execute(sql.raw("DROP FUNCTION fail_review_finish();"));}
 expect(await f.service.commitResult(f.ref,f.commit)).toMatchObject({resultId:`srreport:${f.call.id}`});
});
it("错误任务类型、冻结Skill、坏快照与跨账号映射均不能借审核端口提交",async()=>{
 const f=await fixture("review-scope");
 await db.update(aiTasks).set({taskType:"planning.outline"}).where(eq(aiTasks.id,"review-scope"));
 await expect(f.service.commitResult(f.ref,f.commit)).rejects.toThrow();
 await db.update(aiTasks).set({taskType:"script.review",accountId:"foreign-account"}).where(eq(aiTasks.id,"review-scope"));
 await expect(f.service.commitResult(f.ref,f.commit)).rejects.toThrow();
 await db.update(aiTasks).set({accountId:ctx.accountId}).where(eq(aiTasks.id,"review-scope"));
 for(const modelInput of [{...f.modelInput,skillId:"planning.outline"},{...f.modelInput,kind:"model.generate"},{...f.modelInput,facets:{__reviewSnapshot:JSON.stringify({...f.snapshot,script:42})}}]){
   await db.update(executionTasks).set({payload:{modelInput}}).where(eq(executionTasks.id,f.task.id));
   await expect(f.service.commitResult(f.ref,f.commit)).rejects.toThrow();
 }
 expect(await db.select().from(scriptReviewReports).where(eq(scriptReviewReports.projectId,f.snapshot.projectId))).toHaveLength(0);
 await db.update(executionTasks).set({payload:{modelInput:f.modelInput}}).where(eq(executionTasks.id,f.task.id));
 expect(await f.service.commitResult(f.ref,f.commit)).toEqual({resultId:`srreport:${f.call.id}`,aiTaskId:"review-scope"});
});

it("partial审核不能冒充完成报告",async()=>{ const f=await fixture("review-partial",{partial:true});await expect(f.service.commitResult(f.ref,f.commit)).rejects.toThrow("审核原始报告不完整");expect((await f.tasks.get(ctx,f.task.id)).status).toBe("running");expect(await db.select().from(scriptReviewReports).where(eq(scriptReviewReports.projectId,f.snapshot.projectId))).toHaveLength(0); });
