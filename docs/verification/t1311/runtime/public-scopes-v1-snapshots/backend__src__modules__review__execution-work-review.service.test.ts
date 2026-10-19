import {beforeAll,afterAll,expect,it} from 'vitest';
import {createDb,aiTasks,aiTaskResults,executionTasks,executionCalls,eq,sql,type Db} from '@creatoros/backend';
import type {RequestContext,WorkReviewScope} from '@creatoros/contract';
import {createPersistentTaskService} from '../execution/persistent-task.service';
import {createExecutionCallLedgerService} from '../execution/execution-call-ledger.service';
import {createAccountGroupService} from '../platform-account/account-group.service';
import {createPlatformAccountService} from '../platform-account/platform-account.service';
import {workReviewReports} from '../../schema/work-reviews';
import {createExecutionWorkReviewService} from './execution-work-review.service';
import {freezeReview,canonical} from './work-review-fingerprint';
let db:Db,close:()=>Promise<void>,serial=0;
const stamp='2026-10-16T08:00:00.000Z',now=()=>stamp,nextId=(p:string)=>`${p}-t1311-work-${++serial}`;
beforeAll(async()=>{const opened=await createDb();db=opened.db;close=()=>opened.client.close();},180000);
afterAll(async()=>close?.(),180000);
// 第二层受控库存：真实账号/组owner、冻结输入、authority租约及ledger；不冒公共worker主RED。
async function fixture(scope:'legacy'|'old-legacy'|'group'|'group-account'='group',options:{partial?:boolean;object?:unknown}={}){
 const id=nextId('fixture'),user:RequestContext={userId:id,requestId:id,source:'user'};
 const groups=createAccountGroupService({db,now,nextId}),accounts=createPlatformAccountService({db,now,nextId});
 const group=scope==='legacy'||scope==='old-legacy'?null:await groups.create(user,{name:id,idempotencyKey:id});
 const account=scope==='group'||scope==='old-legacy'?null:await accounts.createAccount(group?{...user,groupId:group.id}:user,{platform:'bilibili',accountHandle:id});
 const membership=account?await groups.forAccount(user,account.id):null,frozenGroupId=group?.id??membership?.groupId??null;
 const ctx:RequestContext={...user,accountId:scope==='old-legacy'?nextId('historical-account'):account?.id??null,...(group?{groupId:group.id,groupVersion:group.version}:{})};
 const projectId=nextId('project'),compositionId=nextId('composition'),reportId=nextId('report'),attemptId=nextId('attempt');
 const member={kind:'moments' as const,momentsId:nextId('moments')},target={kind:'moments_field' as const,momentsId:member.momentsId,field:'text' as const};
 const workScope:WorkReviewScope={kind:'field',compositionId,member,target},version={kind:'artifact' as const,artifactId:nextId('artifact'),versionId:nextId('version')};
 const frozen=freezeReview(workScope,{projectId,scope:workScope,basis:{artifactId:nextId('basis'),versionId:nextId('basis-version'),value:{}},selection:[],members:[{member,ownerVersion:version,fields:[{target,provenanceVersion:version,value:'第二层受控冻结正文',sources:[],sourceRefs:[],files:[],rules:[]}]}]},stamp);
 const model={kind:'model.structured',skillId:'work.review',operationKey:'work.review',capability:'default',maxOutputTokens:1024,skillSnapshot:{snapshotVersion:1,userId:ctx.userId,accountId:ctx.accountId,...(frozenGroupId?{groupId:frozenGroupId}:{}),resolvedAt:stamp,platformPolicyVersion:'controlled',platformPolicy:'受控业务库存，不调用供应商',skills:[{skillId:'work.review',baseVersion:'1',overlayRevision:null,overlayVersion:null,effective:{methodSystem:'受控',template:'{{reviewContext}}',tools:[],requiredFacets:[],contextRequirements:[],outputSchema:{type:'object'},completionPolicy:null,completionPolicyAdapter:null}}]},facets:{reviewContext:JSON.stringify(frozen.modelContext),__workReviewFrozen:JSON.stringify({reportId,snapshot:frozen.snapshot})}};
 const tasks=createPersistentTaskService(db,{now}),created=await tasks.enqueue(ctx,{kind:'ai_task',ownerType:'ai_task',ownerId:id,idempotencyKey:id,payload:{modelInput:model}}),task=(await db.select().from(executionTasks).where(eq(executionTasks.id,created.id)))[0]!;
 const inputData={projectId,workReviewReportId:reportId,snapshotFingerprint:frozen.snapshot.fingerprint};
 await db.insert(aiTasks).values({id,userId:ctx.userId,accountId:ctx.accountId,groupId:task.groupId,groupVersion:task.groupVersion,membershipVersion:task.membershipVersion,taskType:'work.review',projectId,attemptId,inputData,status:'running',executionTaskId:task.id,idempotencyKey:id,requestedAt:stamp});
 await db.insert(workReviewReports).values({id:reportId,userId:ctx.userId,accountId:ctx.accountId,groupId:task.groupId,projectId,compositionId,scopeKey:canonical(workScope),snapshot:frozen.snapshot,frozenContext:frozen.context,attemptId,taskId:id,status:'queued',createdAt:stamp});
 const claim=(await tasks.claimTask({taskId:task.id,workerId:'t1311-controlled-inventory'}))!,ref={executionTaskId:task.id,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
 const ledger=createExecutionCallLedgerService(db,{now,budget:{maxCalls:8,maxTokens:100000,deadlineMs:120000}}),call=await ledger.reserve(ref,{operationKey:'work.review/model/1',kind:'model',inputDigest:'sha256:'+'a'.repeat(64),reservedTokens:100});await ledger.start(ref,call.id);
 const object=options.object??{conclusion:'no_issue_found',issues:[],visualVerification:'not_applicable'};
 const text=JSON.stringify({object,modelLabel:'controlled-receipt',...(options.partial?{validation:{status:'partial',errors:[],policySnapshot:{policy:{schemaVersion:1,minSegments:1,maxSegments:null,requiredSequence:[],repairAttempts:0},adapter:{id:'review',version:'1'}},originalSegmentCount:0,finalSegmentCount:0,repairAttemptsUsed:0,repairReasons:[]}}:{}),generation:{finishReason:'stop',usage:{inputTokens:3,outputTokens:2,cachedTokens:0,totalTokens:5},attempts:[]}});
 await ledger.settle(ref,call.id,{status:'settled',usage:{totalTokens:5},resultText:text,providerResult:{content:[{type:'text',text:JSON.stringify(object)}],finishReason:{unified:'stop',raw:'stop'},usage:{inputTokens:{total:3},outputTokens:{total:2}},warnings:[]}});
 const service=createExecutionWorkReviewService(db,{now}),commit={outcome:'succeeded',callId:call.id,text};
 return {id,ctx,group,groups,tasks,task,ref,call,ledger,model,reportId,inputData,service,commit,complete:()=>service.commitResult(ref,commit)};
}
async function report(id:string){return (await db.select().from(workReviewReports).where(eq(workReviewReports.id,id)))[0]!;}
it.each(['legacy','group','group-account'] as const)('受控库存%s完整结算及并发幂等，report默认null版本不等于execution仍合法',async scope=>{
 const f=await fixture(scope);const [a,b]=await Promise.all([f.complete(),f.complete()]);expect(a).toEqual(b);expect(a).toEqual({resultId:f.reportId,aiTaskId:f.id});
 expect(await report(f.reportId)).toMatchObject({status:'succeeded',groupVersion:null,membershipVersion:null,taskId:f.id,executionTaskId:f.task.id,settledCallId:f.call.id,outcome:{conclusion:'no_issue_found',visualVerification:'not_applicable'}});
 expect((await db.select().from(aiTasks).where(eq(aiTasks.id,f.id)))[0]!.status).toBe('succeeded');expect((await f.tasks.get(f.ctx,f.task.id)).status).toBe('succeeded');expect((await db.select().from(executionCalls).where(eq(executionCalls.id,f.call.id)))[0]!.resultRef).toBe(f.reportId);expect(await db.select().from(aiTaskResults).where(eq(aiTaskResults.aiTaskId,f.id))).toEqual([]);
});
it('旧冻结null-group库存的optional skillSnapshot.group省略归一null仍合法',async()=>{const f=await fixture('old-legacy');expect(f.task.groupId).toBeNull();expect(f.model.skillSnapshot).not.toHaveProperty('groupId');await f.complete();});
it('business冻结user/group/account/task/project/attempt逐一精确拒绝，同组错账号不放行',async()=>{
 const f=await fixture('group-account'),original=(await db.select().from(aiTasks).where(eq(aiTasks.id,f.id)))[0]!;
 for(const change of [{userId:'foreign'},{groupId:null},{groupId:'foreign-group'},{accountId:null},{accountId:'foreign-account'},{executionTaskId:null},{projectId:'foreign-project'},{attemptId:'foreign-attempt'},{taskType:'script.review'}]){
  await db.update(aiTasks).set(change).where(eq(aiTasks.id,f.id));await expect(f.complete()).rejects.toThrow();expect((await report(f.reportId)).status).toBe('queued');await db.update(aiTasks).set(original).where(eq(aiTasks.id,f.id));
 }
 await f.complete();
});
it('report冻结user/group/account/原task/project/attempt映射逐一拒绝',async()=>{
 const f=await fixture('group-account'),original=await report(f.reportId);
 for(const change of [{userId:'foreign'},{groupId:null},{groupId:'foreign-group'},{accountId:null},{accountId:'foreign-account'},{taskId:'foreign-task'},{projectId:'foreign-project'},{attemptId:'foreign-attempt'}]){
  await db.update(workReviewReports).set(change).where(eq(workReviewReports.id,f.reportId));await expect(f.complete()).rejects.toThrow();await db.update(workReviewReports).set(original).where(eq(workReviewReports.id,f.reportId));
 }
 await f.complete();
});
it('纯组不能借同组非null账号库存完成，null与非null双向严格',async()=>{
 const f=await fixture();await db.update(aiTasks).set({accountId:'not-frozen'}).where(eq(aiTasks.id,f.id));await expect(f.complete()).rejects.toThrow('审核原任务不一致');await db.update(aiTasks).set({accountId:null}).where(eq(aiTasks.id,f.id));
 await db.update(workReviewReports).set({accountId:'not-frozen'}).where(eq(workReviewReports.id,f.reportId));await expect(f.complete()).rejects.toThrow('审核预约与原任务冻结身份不一致');await db.update(workReviewReports).set({accountId:null}).where(eq(workReviewReports.id,f.reportId));await f.complete();
});
it('work模型冻结group缺省只与legacy null匹配，错user/account/group/operation与snapshot拒绝',async()=>{
 const f=await fixture(),original=f.task.payload;
 for(const model of [{...f.model,skillSnapshot:{...f.model.skillSnapshot,groupId:undefined}},{...f.model,skillSnapshot:{...f.model.skillSnapshot,groupId:'other'}},{...f.model,skillSnapshot:{...f.model.skillSnapshot,userId:'other'}},{...f.model,skillSnapshot:{...f.model.skillSnapshot,accountId:'other'}},{...f.model,operationKey:'other'},{...f.model,facets:{...f.model.facets,__workReviewFrozen:'{}'}},{...f.model,facets:{...f.model.facets,reviewContext:'{}'}}]){
  await db.update(executionTasks).set({payload:{modelInput:model}}).where(eq(executionTasks.id,f.task.id));await expect(f.complete()).rejects.toThrow();
 }
 await db.update(executionTasks).set({payload:original}).where(eq(executionTasks.id,f.task.id));await f.complete();
});
it('业务report ID/fingerprint与冻结库存损坏拒绝，不重读当前内容',async()=>{
 const f=await fixture();for(const inputData of [{...f.inputData,workReviewReportId:'foreign-report'},{...f.inputData,snapshotFingerprint:'wrong'}]){await db.update(aiTasks).set({inputData}).where(eq(aiTasks.id,f.id));await expect(f.complete()).rejects.toThrow();}
 await db.update(aiTasks).set({inputData:f.inputData}).where(eq(aiTasks.id,f.id));const original=await report(f.reportId);await db.update(workReviewReports).set({frozenContext:{}}).where(eq(workReviewReports.id,f.reportId));await expect(f.complete()).rejects.toThrow();await db.update(workReviewReports).set({frozenContext:original.frozenContext}).where(eq(workReviewReports.id,f.reportId));await f.complete();
});
it('原call/text/provider/operation/parent/最后根调用证明不能替换',async()=>{
 const f=await fixture(),original=(await db.select().from(executionCalls).where(eq(executionCalls.id,f.call.id)))[0]!;
 await expect(f.service.commitResult(f.ref,{...f.commit,callId:'foreign'})).rejects.toThrow('REVIEW_SETTLED_TEXT_MISMATCH');await expect(f.service.commitResult(f.ref,{...f.commit,text:'changed'})).rejects.toThrow('REVIEW_SETTLED_TEXT_MISMATCH');
 for(const change of [{status:'unknown'},{kind:'tool'},{providerResult:null},{operationKey:'other/model/1'},{operationKey:'work.review/model/0'},{parentCallId:f.call.id}]){
  await db.update(executionCalls).set(change).where(eq(executionCalls.id,f.call.id));await expect(f.complete()).rejects.toThrow();await db.update(executionCalls).set(original).where(eq(executionCalls.id,f.call.id));
 }
 const later=await f.ledger.reserve(f.ref,{operationKey:'later-root',kind:'model',inputDigest:'sha256:'+'b'.repeat(64),reservedTokens:1});await expect(f.complete()).rejects.toThrow('REVIEW_STRUCTURED_ROOT_PROOF_MISSING');expect(later.id).not.toBe(f.call.id);
});
it.each([{partial:true},{object:{conclusion:'no_issue_found',issues:[]}}])('partial/缺完整结构拒绝 %j',async options=>{const f=await fixture('group',options);await expect(f.complete()).rejects.toThrow();expect((await report(f.reportId)).status).toBe('queued');expect((await db.select().from(executionCalls).where(eq(executionCalls.id,f.call.id)))[0]!.resultRef).toBeNull();});
it('取消、deadline、lease过期与旧fence拒绝，不写报告',async()=>{
 const f=await fixture();await expect(f.service.commitResult({...f.ref,fenceToken:'stale'},f.commit)).rejects.toThrow('执行凭证已失效');
 await db.update(executionTasks).set({deadlineAt:stamp}).where(eq(executionTasks.id,f.task.id));await expect(f.complete()).rejects.toThrow('REVIEW_TASK_NOT_COMMITTABLE');await db.update(executionTasks).set({deadlineAt:null,leaseExpiresAt:stamp}).where(eq(executionTasks.id,f.task.id));await expect(f.complete()).rejects.toThrow('REVIEW_TASK_NOT_COMMITTABLE');
 await db.update(executionTasks).set({leaseExpiresAt:'2026-10-17T08:00:00.000Z'}).where(eq(executionTasks.id,f.task.id));await f.tasks.command(f.ctx,{taskIds:[f.task.id],command:'cancel',idempotencyKey:nextId('cancel')});await expect(f.complete()).rejects.toThrow('REVIEW_TASK_NOT_COMMITTABLE');expect((await report(f.reportId)).status).toBe('queued');
});
it('真实trigger在最后execution写失败时回滚report/business/call，原ref可恢复',async()=>{
 const f=await fixture();await db.execute(sql`CREATE FUNCTION t1311_work_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.status='succeeded' THEN RAISE EXCEPTION 'T1311_WORK_ROLLBACK'; END IF; RETURN NEW; END $$`);await db.execute(sql`CREATE TRIGGER t1311_work_fail BEFORE UPDATE ON execution_tasks FOR EACH ROW EXECUTE FUNCTION t1311_work_fail()`);
 try{await expect(f.complete()).rejects.toThrow('T1311_WORK_ROLLBACK');expect((await report(f.reportId)).status).toBe('queued');expect((await db.select().from(aiTasks).where(eq(aiTasks.id,f.id)))[0]!.status).toBe('running');expect((await db.select().from(executionCalls).where(eq(executionCalls.id,f.call.id)))[0]!.resultRef).toBeNull();expect((await f.tasks.get(f.ctx,f.task.id)).status).toBe('running');}
 finally{await db.execute(sql`DROP TRIGGER t1311_work_fail ON execution_tasks`);await db.execute(sql`DROP FUNCTION t1311_work_fail()`);}await f.complete();
});
it('归档前已结算可沿原ref完成及只读严格replay，归档新claim拒绝',async()=>{
 const f=await fixture(),queued=await f.tasks.enqueue(f.ctx,{kind:'ai_task',ownerType:'ai_task',ownerId:nextId('new-owner'),idempotencyKey:nextId('new-key'),payload:{modelInput:f.model}});
 await f.groups.archive(f.ctx,f.group!.id,f.group!.version);const receipt=await f.complete();
 const before={report:await report(f.reportId),task:(await db.select().from(executionTasks).where(eq(executionTasks.id,f.task.id)))[0]};expect(await f.complete()).toEqual(receipt);expect(await report(f.reportId)).toEqual(before.report);expect((await db.select().from(executionTasks).where(eq(executionTasks.id,f.task.id)))[0]).toEqual(before.task);
 expect(await f.tasks.claimTask({taskId:queued.id,workerId:'new-after-archive'})).toBeNull();expect((await db.select().from(executionTasks).where(eq(executionTasks.id,queued.id)))[0]!.status).toBe('queued');await expect(f.tasks.enqueue(f.ctx,{kind:'ai_task',ownerType:'ai_task',ownerId:'after',idempotencyKey:nextId('after'),payload:{modelInput:f.model}})).rejects.toThrow();
 for(const change of [{settledCallId:'wrong'},{executionTaskId:'wrong'},{taskId:'wrong'}]){await db.update(workReviewReports).set(change).where(eq(workReviewReports.id,f.reportId));await expect(f.complete()).rejects.toThrow();await db.update(workReviewReports).set(before.report).where(eq(workReviewReports.id,f.reportId));}
 await db.update(executionCalls).set({resultRef:'wrong'}).where(eq(executionCalls.id,f.call.id));await expect(f.complete()).rejects.toThrow('REVIEW_REPLAY_RECEIPT_MISMATCH');
});
