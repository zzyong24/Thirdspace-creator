import {afterAll,beforeAll,expect,it} from "vitest";
import {createDb,aiTasks,aiTaskResults,executionTasks,executionCalls,scriptReviewReports,eq,sql,type Db} from "@creatoros/backend";
import {createPersistentTaskService} from "../execution/persistent-task.service";
import {createExecutionCallLedgerService} from "../execution/execution-call-ledger.service";
import {createExecutionReviewReportService} from "./execution-review-report.service";
import type {RequestContext} from '@creatoros/contract';
import {createAccountGroupService} from '../platform-account/account-group.service';
import {createPlatformAccountService} from '../platform-account/platform-account.service';
const ctx={userId:"review-user",accountId:"review-account",requestId:"test",source:"user" as const};
const stamp="2026-09-05T00:00:00.000Z",now=()=>stamp;
let db:Db,close:()=>Promise<void>;
beforeAll(async()=>{const c=await createDb();db=c.db;close=()=>c.client.close();});afterAll(async()=>close?.());
const finding={quote:"保证赚钱",category:"夸大",severity:"warn",reason:"需核实",suggestion:"描述实际结果",ruleRef:null};
const lint={ruleId:"official-rule",quote:"保证赚钱",offset:0,tier:"official_hard",category:"夸大",replacement:null,note:"硬规则"};
async function fixture(id:string,changes:{object?:unknown;modelLabel?:string|null;lintFindings?:unknown[];partial?:boolean;script?:string;ctx?:RequestContext}={}){
 const scope=changes.ctx??ctx;
 const snapshot={projectId:`project-${id}`,artifactId:`script-${id}`,artifactVersion:2,script:changes.script ?? "保证赚钱是不当承诺，应描述实际案例。",lintFindings:changes.lintFindings ?? [lint]};
 const modelInput={kind:"model.structured",skillId:"script.review",facets:{__reviewSnapshot:JSON.stringify(snapshot)}};
 const tasks=createPersistentTaskService(db,{now});const task=await tasks.enqueue(scope,{kind:"ai_task",ownerType:"ai_task",ownerId:id,idempotencyKey:id,payload:{modelInput}});
 await db.insert(aiTasks).values({id,userId:scope.userId,accountId:scope.accountId,groupId:task.groupId,groupVersion:task.groupVersion,membershipVersion:task.membershipVersion,taskType:"script.review",projectId:snapshot.projectId,inputData:{projectId:snapshot.projectId},status:"running",executionTaskId:task.id,idempotencyKey:id,requestedAt:stamp});
 const claim=(await tasks.claimTask({taskId:task.id,workerId:"worker"}))!,ref={executionTaskId:task.id,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
 const ledger=createExecutionCallLedgerService(db,{now,budget:{maxCalls:5,maxTokens:1000,deadlineMs:120000}});
 const call=await ledger.reserve(ref,{operationKey:"review",kind:"model",inputDigest:"sha256:"+"a".repeat(64),reservedTokens:100});await ledger.start(ref,call.id);
 const text=JSON.stringify({...(changes.partial ? {validation:{status:"partial",errors:[],policySnapshot:{policy:{schemaVersion:1,minSegments:1,maxSegments:null,requiredSequence:[],repairAttempts:0},adapter:{id:"review",version:"1"}},originalSegmentCount:0,finalSegmentCount:0,repairAttemptsUsed:0,repairReasons:[]}} : {}),object:changes.object ?? {verdict:"pass",summary:"审核完成",findings:[finding,{...finding,quote:"原文没有的话"}]},...(changes.modelLabel===null?{}:{modelLabel:changes.modelLabel ?? "real-provider-model"}),generation:{finishReason:"stop",usage:{inputTokens:3,outputTokens:2,cachedTokens:0,totalTokens:5},attempts:[]}});
 await ledger.settle(ref,call.id,{status:"settled",usage:{totalTokens:5},resultText:text});
 return {task,tasks,ctx:scope,ref,call,snapshot,modelInput,text,commit:{outcome:"succeeded",callId:call.id,text},service:createExecutionReviewReportService(db,{now})};
}
it("真实报告同事务提交且并发重放幂等，无候选写入，保留冻结版本与模型名",async()=>{
 const f=await fixture("review-once");const [a,b]=await Promise.all([f.service.commitResult(f.ref,f.commit),f.service.commitResult(f.ref,f.commit)]);expect(a).toEqual(b);expect(a).toEqual({resultId:`srreport:${f.call.id}`,aiTaskId:"review-once"});
 const rows=await db.select().from(scriptReviewReports).where(eq(scriptReviewReports.id,a.resultId));expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({projectId:f.snapshot.projectId,artifactId:f.snapshot.artifactId,artifactVersion:2,verdict:"pass",summary:"审核完成",modelLabel:"real-provider-model",llmFindings:[finding],lintFindings:[lint]});
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

it.each([
 {id:"keyboard",script:"按QQ键释放技能，再移动角色。",verdict:"pass",summary:"按键操作无站外联络意图",findings:[]},
 {id:"contact",script:"加我QQ领取资料，再联系报名。",verdict:"block",summary:"明确要求站外联系领取资料",findings:[{quote:"加我QQ领取资料",category:"导流",severity:"block",reason:"要求观众站外联系以领取资料",suggestion:null,ruleRef:"公约34"}]},
])("同一词表命中由语义复核决定：$id",async ({id,script,verdict,summary,findings})=>{
 const hit={...lint,quote:"QQ",category:"导流",offset:script.indexOf("QQ")};
 const f=await fixture(`semantic-${id}`,{script,lintFindings:[hit],object:{verdict,summary,findings}});
 const result=await f.service.commitResult(f.ref,f.commit);
 expect((await db.select().from(scriptReviewReports).where(eq(scriptReviewReports.id,result.resultId)))[0]).toMatchObject({verdict,summary,lintFindings:[hit],llmFindings:findings});
});
it.each(["official_hard","empirical","doudplus"])("词表层级与命中数量不能覆写语义结论 %s",async tier=>{
 const f=await fixture(`many-${tier}`,{lintFindings:Array.from({length:8},(_,i)=>({...lint,tier,ruleId:`rule-${i}`})),object:{verdict:"pass",summary:"原文在解释不当承诺，没有作出承诺",findings:[]}});
 const result=await f.service.commitResult(f.ref,f.commit);
 expect((await db.select().from(scriptReviewReports).where(eq(scriptReviewReports.id,result.resultId)))[0]?.verdict).toBe("pass");
});

let sequence=0;
const nextId=(p:string)=>`${p}-t1311-script-${++sequence}`;
async function ownedScope(mode:'legacy'|'group'|'group-account'){
 const user:RequestContext={userId:nextId('user'),requestId:'script-scope',source:'user'},groups=createAccountGroupService({db,now,nextId});
 const group=mode==='legacy'?null:await groups.create(user,{name:'脚本审核真实组',idempotencyKey:nextId('group-key')});
 const account=mode==='group'?null:await createPlatformAccountService({db,now,nextId}).createAccount(group?{...user,groupId:group.id}:user,{platform:'bilibili',accountHandle:nextId('account')});
 return {group,groups,ctx:{...user,...(group?{groupId:group.id,groupVersion:group.version}:{}),accountId:account?.id??null}};
}
it.each(['legacy','group','group-account'] as const)('脚本真实owner库存%s原call完成及严格replay',async mode=>{
 const owner=await ownedScope(mode),f=await fixture(nextId('script-scope'),{ctx:owner.ctx}),result=await f.service.commitResult(f.ref,f.commit);
 expect(await f.service.commitResult(f.ref,f.commit)).toEqual(result);expect((await f.tasks.get(owner.ctx,f.task.id)).status).toBe('succeeded');
});
it('脚本business冻结user/group/account/execution映射逐一严格，纯组null不匹配非null',async()=>{
 for(const mode of ['group','group-account'] as const){const owner=await ownedScope(mode),id=nextId('business'),f=await fixture(id,{ctx:owner.ctx}),original=(await db.select().from(aiTasks).where(eq(aiTasks.id,id)))[0]!;
  for(const change of [{userId:'foreign'},{groupId:null},{groupId:'foreign-group'},{accountId:mode==='group'?'foreign-account':null},{accountId:'wrong-account'},{executionTaskId:null}]){await db.update(aiTasks).set(change).where(eq(aiTasks.id,id));await expect(f.service.commitResult(f.ref,f.commit)).rejects.toThrow('审核任务映射或归属不一致');await db.update(aiTasks).set(original).where(eq(aiTasks.id,id));}
  await f.service.commitResult(f.ref,f.commit);
 }
});
it('脚本归档前已结算沿原ref完成，归档后严格replay不产生新写，新claim拒绝',async()=>{
 const owner=await ownedScope('group'),f=await fixture(nextId('archive-script'),{ctx:owner.ctx}),queued=await f.tasks.enqueue(owner.ctx,{kind:'ai_task',ownerType:'ai_task',ownerId:'after',idempotencyKey:nextId('queued'),payload:{modelInput:f.modelInput}});
 await owner.groups.archive(owner.ctx,owner.group!.id,owner.group!.version);const result=await f.service.commitResult(f.ref,f.commit),original=(await db.select().from(scriptReviewReports).where(eq(scriptReviewReports.id,result.resultId)))[0]!;
 expect(await f.service.commitResult(f.ref,f.commit)).toEqual(result);expect((await db.select().from(scriptReviewReports).where(eq(scriptReviewReports.id,result.resultId)))[0]).toEqual(original);expect(await f.tasks.claimTask({taskId:queued.id,workerId:'after-archive'})).toBeNull();await expect(f.tasks.enqueue(owner.ctx,{kind:'ai_task',ownerType:'ai_task',ownerId:'after2',idempotencyKey:nextId('new-after'),payload:{modelInput:f.modelInput}})).rejects.toThrow();
 for(const change of [{userId:'foreign'},{projectId:'foreign'},{artifactId:'foreign'},{artifactVersion:999}]){await db.update(scriptReviewReports).set(change).where(eq(scriptReviewReports.id,original.id));await expect(f.service.commitResult(f.ref,f.commit)).rejects.toThrow('审核报告回执不一致');await db.update(scriptReviewReports).set(original).where(eq(scriptReviewReports.id,original.id));}
 await db.update(executionCalls).set({resultRef:'wrong'}).where(eq(executionCalls.id,f.call.id));await expect(f.service.commitResult(f.ref,f.commit)).rejects.toThrow('审核报告回执不一致');
});
