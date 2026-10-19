import {afterEach,beforeEach,expect,it} from "vitest";
import {createDb,sql,eq,and,aiTasks,executionTasks,executionCalls,projects,workCompositions,workCompositionVersions,OwnershipError,type Db} from "@creatoros/backend";
import {ENDPOINTS,ErrorCode,type WorkReviewScope,type RequestContext} from "@creatoros/contract";
import {createProjectsService,createProjectRepository} from "../projects/index";
import {createArtifactsService} from "../artifacts/index";
import {createMomentsService} from "../moments/index";
import {createWorkCompositionsService} from "../work-compositions/index";
import {createAiService,type ServiceDeps} from "../ai/ai.service";
import {createExecutionTransport} from "../execution/execution.transport";
import {createPersistentTaskService} from "../execution/persistent-task.service";
import {createExecutionGenerationPorts} from "../execution/execution-generation-ports.service";
import {createExecutionWorkerCallPorts} from "../execution/execution-worker-call-ports.service";
import {createExecutionCallLedgerService} from "../execution/execution-call-ledger.service";
import {createWorkReviewsService,type WorkReviewPorts} from "./work-reviews.service";
import {createExecutionWorkReviewService} from "./execution-work-review.service";
import {createWorkReviewTaskPorts,createWorkReviewBusinessAdapter} from "./work-review-task-adapter";
import {createWorkReviewsTransport} from "./work-reviews.transport";
import {freezeReview,digest,type FrozenReviewContext} from "./work-review-fingerprint";
import {workReviewStatus as workReviewStatusV2} from "@creatoros/contract";
import {workReviewReports,workReviewConfirmations,workReviewRequests} from "../../schema/work-reviews";
const ctx={userId:"review-user",accountId:"review-account",requestId:"test",source:"user" as const};
let legacySources:FrozenReviewContext["members"][number]["fields"][number]["sourceRefs"];
let db:Db,close:()=>Promise<void>,seq:number,tick:number,scope:WorkReviewScope,momentsId:string,compositionId:string,wakes:number,ports:WorkReviewPorts,extra:{sources:FrozenReviewContext["members"][number]["fields"][number]["sources"];files:FrozenReviewContext["members"][number]["fields"][number]["files"]};
const now=()=>new Date(Date.UTC(2026,9,2,7,0,tick++)).toISOString(),nextId=(p:string)=>`${p}-${++seq}`;
const art=(tx:Db)=>createArtifactsService({db:tx,now,nextId}),proj=(tx:Db)=>createProjectsService(createProjectRepository(tx),{now,nextId});
const unavailable=async()=>{throw Error("本测试未授权生成或物料");};
const moments=(tx=db)=>createMomentsService({db:tx,now,nextId,ports:{artifacts:art,assertProjectOwned:async(c,id,store,lock)=>{await proj(store).getProject(c,id,lock);},assertFile:unavailable,assertSource:unavailable}});
const compositions=(tx=db)=>createWorkCompositionsService({db:tx,now,nextId,ports:{artifacts:art,assertProjectOwned:async(c,id,store,lock)=>{await proj(store).getProject(c,id,lock);},readMember:async(c,id,member,store=tx)=>{if(member.kind!=="moments")throw new OwnershipError("成员未授权");const m=await moments(store).get(c,member.momentsId);if(m.projectId!==id)throw new OwnershipError("跨项目");return{kind:"artifact",artifactId:m.artifactId,versionId:m.currentVersionId};},createMember:unavailable,findCreatedMember:async()=>null,assertSource:unavailable,assertRule:unavailable}});
const ai=(tx:Db)=>createAiService({db:tx,now,nextId,artifacts:{} as never,knowledge:{} as never,candidate:{} as never,learnings:{} as never,publishing:{} as never,materialLinks:{} as never,positioning:{} as never,calibration:{} as never} satisfies ServiceDeps);
const service=()=>createWorkReviewsService({db,now,nextId,ports});
beforeEach(async()=>{seq=0;tick=0;wakes=0;legacySources=[];extra={sources:[],files:[]};const opened=await createDb();db=opened.db;close=()=>opened.client.close();
 await db.insert(projects).values({id:"project",userId:ctx.userId,accountId:ctx.accountId,title:"项目",creationMode:"guided",status:"active",currentStage:"planning",startedAt:now(),createdAt:now(),updatedAt:now()});
 const m=await moments().create(ctx,{projectId:"project",clientRequestId:"create-moments-test",document:{schemaVersion:1,text:"实际朋友圈文字",imageUses:[],sourceRefs:[]}});momentsId=m.momentsId;
 const c=await compositions().create(ctx,{projectId:"project",clientRequestId:"create-composition-test",title:"明确组合"});compositionId=c.compositionId;await compositions().bindMember(ctx,compositionId,{expectedRevision:0,clientRequestId:"bind-moments-test",member:{kind:"moments",momentsId}});
 scope={kind:"field",compositionId,member:{kind:"moments",momentsId},target:{kind:"moments_field",momentsId,field:"text"}};
 ports={...createWorkReviewTaskPorts(ai,async()=>{wakes++;}),
  async assertComposition(c,id,tx,lock=false){const [row]=await tx.select().from(workCompositions).where(and(eq(workCompositions.id,id),eq(workCompositions.userId,c.userId),eq(workCompositions.accountId,c.accountId??"")));if(!row)throw new OwnershipError("组合不存在");await proj(tx).getProject(c,row.projectId,lock);if(lock)await tx.select().from(workCompositions).where(eq(workCompositions.id,id)).for("update");return{projectId:row.projectId};},
  async readCurrent(c,s,tx,lock){const {projectId}=await ports.assertComposition(c,s.compositionId,tx,lock);const combination=await compositions(tx).get(c,s.compositionId);if(s.kind!=="field"||s.member.kind!=="moments"||s.target.kind!=="moments_field"||!combination.current.members.some(m=>m.member.kind==="moments"&&m.member.momentsId===(s.member as {kind:"moments";momentsId:string}).momentsId))throw new OwnershipError("触点未绑定");const m=await moments(tx).get(c,s.member.momentsId);if(m.projectId!==projectId)throw new OwnershipError("成员跨项目");const version={kind:"artifact" as const,artifactId:m.artifactId,versionId:m.currentVersionId};return{projectId,scope:s,basis:{artifactId:combination.current.basisArtifactId,versionId:combination.current.basisVersionId,value:combination.basis},selection:combination.current.selection,members:[{member:s.member,ownerVersion:version,fields:[{target:s.target,provenanceVersion:version,value:m.current[s.target.field],sources:extra.sources,sourceRefs:legacySources,files:extra.files,rules:[]}]}]};},
 };
});afterEach(async()=>close?.());
async function edit(text:string){const m=await moments().get(ctx,momentsId);return moments().save(ctx,momentsId,{clientRequestId:`edit-moments-${++seq}`,expectedCurrentVersionId:m.currentVersionId,document:{...m.current,text}});}
async function settle(reportId:string,outcome={conclusion:"no_issue_found",issues:[],visualVerification:"verified"}){
 const r=await service().get(ctx,reportId);const taskId=r.taskId!;const adapter=createWorkReviewBusinessAdapter(()=>service()),task=await ai(db).getTask(ctx,taskId);
 const facets=await adapter.prepare(ctx,{id:taskId,retryOfTaskId:null,projectId:"project",inputData:task.inputData,skillSnapshot:{} as never});
 const persistent=createPersistentTaskService(db,{now});const execution=await persistent.enqueue(ctx,{kind:"ai_task",ownerType:"ai_task",ownerId:taskId,idempotencyKey:`execution-${taskId}`,payload:{modelInput:{kind:"model.structured",operationKey:"work.review",skillId:"work.review",capability:"default",maxOutputTokens:100,facets,skillSnapshot:{snapshotVersion:1,userId:ctx.userId,accountId:ctx.accountId,resolvedAt:now(),platformPolicyVersion:"fixture-policy",platformPolicy:"明确测试fixture，不调用供应商",skills:[{skillId:"work.review",baseVersion:"fixture-v1",overlayRevision:null,overlayVersion:null,effective:{methodSystem:"fixture",template:"{{reviewContext}}",tools:[],requiredFacets:["reviewContext"],contextRequirements:[],outputSchema:{type:"object"},completionPolicy:null,completionPolicyAdapter:null}}]}}}});
 await db.update(aiTasks).set({executionTaskId:execution.id,status:"running"}).where(eq(aiTasks.id,taskId));const claim=(await persistent.claimTask({taskId:execution.id,workerId:"real-worker"}))!,ref={executionTaskId:execution.id,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
 const budget={maxCalls:5,maxTokens:100000,deadlineMs:600000},ledger=createExecutionCallLedgerService(db,{now,budget}),generation=createExecutionGenerationPorts(db,{now,budget}),calls=createExecutionWorkerCallPorts(db,{now,budget});
 const reserved=await generation.reserveGenerationCall(ref,{operationKey:"work.review/model/1",request:{maxOutputTokens:100,prompt:[{role:"user",content:[{type:"text",text:facets.reviewContext??""}]}]}});await calls.startCall(ref,{callId:reserved.callId});
 const providerResult={content:[{type:"text",text:JSON.stringify(outcome)}],finishReason:{unified:"stop"},usage:{inputTokens:{total:3},outputTokens:{total:2}},warnings:[]};
 const text=JSON.stringify({object:outcome,modelLabel:"fixture-explicit-no-model-call",generation:{finishReason:"stop",usage:{inputTokens:3,outputTokens:2,cachedTokens:0,totalTokens:5},attempts:[]}});
 await generation.settleGenerationCall(ref,{callId:reserved.callId,status:"settled",providerResult,usage:{inputTokens:3,outputTokens:2,totalTokens:5}});await generation.saveGenerationResult(ref,{callId:reserved.callId,text});const call=(await ledger.inspect(ref)).calls.find(row=>row.id===reserved.callId)!;
 return{ref,input:{outcome:"succeeded",callId:call.id,text},executor:createExecutionWorkReviewService(db,{now}),execution,call,persistent,generation,calls,ledger};
}
it("真实原owner冻结+AI原任务：同请求并发只生成一份报告和task，刷新回执完整",async()=>{const input={scope,clientRequestId:"review-create-concurrent"};const [a,b]=await Promise.all([service().create(ctx,input),service().create(ctx,input)]);expect(a.reportId).toBe(b.reportId);expect(a.taskId).toBe(b.taskId);expect(await db.select().from(workReviewReports)).toHaveLength(1);expect(await db.select().from(aiTasks)).toHaveLength(1);expect(await service().request(ctx,input.clientRequestId)).toMatchObject({operation:"create",status:"committed",reportId:a.reportId,input});});
it("任务准备丢响应后沿持久原请求恢复，不重冻后来稿件、不复制任务",async()=>{const saved=ports.wakeTask;ports.wakeTask=async()=>{throw Error("失回复");};const input={scope,clientRequestId:"review-create-lost"};await expect(service().create(ctx,input)).rejects.toThrow("失回复");const receipt=await service().request(ctx,input.clientRequestId);const old=await service().get(ctx,receipt.reportId!);await edit("后来手工文字");ports.wakeTask=saved;const recovered=await service().create(ctx,input);expect(recovered.reportId).toBe(old.reportId);expect(recovered.snapshot).toEqual(old.snapshot);expect(await db.select().from(aiTasks)).toHaveLength(1);});
it("异输入请求/跨账号/错误绑定拒绝，回执不泄露",async()=>{const input={scope,clientRequestId:"review-create-security"},r=await service().create(ctx,input);await expect(service().create(ctx,{...input,scope:{...scope,kind:"member"}})).rejects.toThrow();await expect(service().get({...ctx,accountId:"foreign"},r.reportId)).rejects.toThrow();await expect(service().request({...ctx,accountId:"foreign"},input.clientRequestId)).rejects.toThrow();await expect(service().create(ctx,{scope:{...scope,member:{kind:"moments",momentsId:"foreign"},target:{kind:"moments_field",momentsId:"foreign",field:"text"}},clientRequestId:"review-create-other-member"})).rejects.toThrow();});
it("手工确认是真实独立回执；同键重放不确认后来改稿",async()=>{const before=await service().status(ctx,scope);const input={mode:"manual",scope,clientRequestId:"review-confirm-manual",expectedFingerprint:before.currentFingerprint,historicalBasis:[]} as const;const confirmed=await service().confirm(ctx,input);expect(confirmed.status).toMatchObject({state:"confirmed_current",confirmedReport:null,modelVerification:"not_verified",visualVerification:"not_applicable"});await edit("后来改稿");const replay=await service().confirm(ctx,input);expect(replay.confirmation).toEqual(confirmed.confirmation);expect(replay.status.state).toBe("basis_updated");expect(await db.select().from(workReviewConfirmations)).toHaveLength(1);await expect(service().confirm(ctx,{...input,clientRequestId:"review-confirm-stale"})).rejects.toThrow("内容已更新");});
it("无关正式版本/selection/basis字段不影响field指纹，确切引用摘录和文件hash会影响",async()=>{const a=await service().status(ctx,scope),m=await moments().get(ctx,momentsId);await moments().save(ctx,momentsId,{expectedCurrentVersionId:m.currentVersionId,clientRequestId:"moments-new-same-field",document:m.current});let c=await compositions().get(ctx,compositionId);await compositions().saveSelection(ctx,compositionId,{expectedRevision:c.currentRevision,clientRequestId:"select-moments-review",selection:["moments"]});c=await compositions().get(ctx,compositionId);await compositions().saveBasis(ctx,compositionId,{expectedRevision:c.currentRevision,clientRequestId:"unrelated-basis-change",document:{...c.basis,topic:"无关主题"}});expect((await service().status(ctx,scope)).currentFingerprint).toBe(a.currentFingerprint);extra.sources=[{ref:{kind:"work_basis_version",compositionId,artifactId:c.current.basisArtifactId,versionId:c.current.basisVersionId,selectionDigest:digest("basis-excerpt"),selection:{mode:"whole"}},value:"明确所用摘录"}] as never;const b=await service().status(ctx,scope);expect(b.currentFingerprint).not.toBe(a.currentFingerprint);extra.sources[0]!.value="摘录内容变化";expect((await service().status(ctx,scope)).currentFingerprint).not.toBe(b.currentFingerprint);extra.files=[{ref:{assetId:"asset",assetFileId:"file"},contentHash:"actualhash-a"}];const f=await service().status(ctx,scope);extra.files[0]!.contentHash="actualhash-b";expect((await service().status(ctx,scope)).currentFingerprint).not.toBe(f.currentFingerprint);});
it("真实lease+settled call提交：幂等、无改稿候选、文本与旧fence拒绝",async()=>{const r=await service().create(ctx,{scope,clientRequestId:"review-create-execution"}),f=await settle(r.reportId);await expect(f.executor.commitResult({...f.ref,fenceToken:"stale"},f.input)).rejects.toThrow();await expect(f.executor.commitResult(f.ref,{...f.input,text:"替换结果"})).rejects.toThrow();const [a,b]=await Promise.all([f.executor.commitResult(f.ref,f.input),f.executor.commitResult(f.ref,f.input)]);expect(a).toEqual(b);const report=await service().get(ctx,r.reportId);expect(report).toMatchObject({status:"succeeded",executionTaskId:f.execution.id,settledCallId:f.call.id,outcome:{visualVerification:"not_applicable"}});expect((await moments().get(ctx,momentsId)).current.text).toBe("实际朋友圈文字");});
it("模型确认关联原报告，新报告为真实latest且不冒充旧确认报告",async()=>{const a=await service().create(ctx,{scope,clientRequestId:"review-create-first"}),fa=await settle(a.reportId);await fa.executor.commitResult(fa.ref,fa.input);await service().confirm(ctx,{mode:"model",scope,reportId:a.reportId,clientRequestId:"review-confirm-first",expectedFingerprint:a.snapshot.fingerprint,historicalBasis:[]});const b=await service().create(ctx,{scope,clientRequestId:"review-create-second"}),fb=await settle(b.reportId);await fb.executor.commitResult(fb.ref,fb.input);const status=await service().status(ctx,scope);expect(workReviewStatusV2.safeParse(status).success).toBe(true);expect(status).toMatchObject({state:"confirmed_current",latestReport:{reportId:b.reportId},confirmedReport:{reportId:a.reportId},confirmation:{reportId:a.reportId}});});
it("无视觉能力降级真实未验证，模型不能自造可采纳候选引用",async()=>{extra.files=[{ref:{assetId:"asset",assetFileId:"file"},contentHash:"hash"}];const r=await service().create(ctx,{scope,clientRequestId:"review-create-visual"}),f=await settle(r.reportId);await f.executor.commitResult(f.ref,f.input);expect((await service().get(ctx,r.reportId)).outcome?.visualVerification).toBe("not_verified");expect((await service().status(ctx,scope)).visualVerification).toBe("not_verified");});
it("原任务失败/取消真实投影、状态读取不提交新的task",async()=>{const r=await service().create(ctx,{scope,clientRequestId:"review-create-failure"}),count=(await db.select().from(aiTasks)).length;await db.update(aiTasks).set({status:"failed",errorMessage:"真实失败"}).where(eq(aiTasks.id,r.taskId!));expect(await service().get(ctx,r.reportId)).toMatchObject({status:"failed",errorCode:"MODEL_TASK_FAILED"});await service().status(ctx,scope);expect((await db.select().from(aiTasks)).length).toBe(count);await db.update(aiTasks).set({status:"cancelled"}).where(eq(aiTasks.id,r.taskId!));expect((await service().get(ctx,r.reportId)).status).toBe("cancelled");});
it("公开transport严格输入/真实回执/当前status，无发布权限或副作用",async()=>{const transport=createWorkReviewsTransport(()=>service());const response=await transport.request(ENDPOINTS.createWorkReview,{params:undefined,query:undefined,body:{scope,clientRequestId:"review-create-transport"}},ctx) as {data:unknown};expect(ENDPOINTS.createWorkReview.response.safeParse(response.data).success).toBe(true);const status=await transport.request(ENDPOINTS.getWorkReviewStatus,{params:undefined,query:undefined,body:{scope}},ctx) as {data:unknown};expect(workReviewStatusV2.safeParse(status.data).success).toBe(true);await expect(transport.request(ENDPOINTS.getWorkReviewStatus,{params:undefined,query:undefined,body:{scope,arbitrary:true}} as never,ctx)).rejects.toThrow();await expect(transport.request(ENDPOINTS.getWorkReview,{params:{reportId:"missing"},query:undefined,body:undefined},undefined)).rejects.toThrow();});

it("取消/过期和跨账号原task不能提交；所有旧报告和手改保持",async()=>{const r=await service().create(ctx,{scope,clientRequestId:"review-guard-cancel"}),f=await settle(r.reportId);await db.update(aiTasks).set({accountId:"foreign"}).where(eq(aiTasks.id,r.taskId!));await expect(f.executor.commitResult(f.ref,f.input)).rejects.toThrow();await db.update(aiTasks).set({accountId:ctx.accountId}).where(eq(aiTasks.id,r.taskId!));await db.update(executionTasks).set({leaseExpiresAt:"2026-01-01T00:00:00.000Z"}).where(eq(executionTasks.id,f.execution.id));await expect(f.executor.commitResult(f.ref,f.input)).rejects.toThrow();await db.update(executionTasks).set({leaseExpiresAt:"2027-01-01T00:00:00.000Z"}).where(eq(executionTasks.id,f.execution.id));await f.persistent.command(ctx,{taskIds:[f.execution.id],command:"cancel",idempotencyKey:"cancel-review-task"});await expect(f.executor.commitResult(f.ref,f.input)).rejects.toThrow();expect((await db.select().from(workReviewReports).where(eq(workReviewReports.id,r.reportId)))[0]?.outcome).toBeNull();});
it("原execution状态落库失败时报告/AI终态/call结果一起回滚，可沿原结算恢复",async()=>{const r=await service().create(ctx,{scope,clientRequestId:"review-atomic-rollback"}),f=await settle(r.reportId);await db.execute(sql.raw(`CREATE FUNCTION fail_work_review_finish() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id='${f.execution.id}' AND NEW.status='succeeded' THEN RAISE EXCEPTION 'finish failed'; END IF; RETURN NEW; END $$;`));await db.execute(sql.raw("CREATE TRIGGER fail_work_review_finish BEFORE UPDATE ON execution_tasks FOR EACH ROW EXECUTE FUNCTION fail_work_review_finish();"));try{await expect(f.executor.commitResult(f.ref,f.input)).rejects.toThrow();expect((await db.select().from(workReviewReports).where(eq(workReviewReports.id,r.reportId)))[0]?.status).toBe("queued");expect((await db.select().from(executionCalls).where(eq(executionCalls.id,f.call.id)))[0]?.resultRef).toBeNull();expect((await db.select().from(aiTasks).where(eq(aiTasks.id,r.taskId!)))[0]?.status).toBe("running");}finally{await db.execute(sql.raw("DROP TRIGGER fail_work_review_finish ON execution_tasks;"));await db.execute(sql.raw("DROP FUNCTION fail_work_review_finish();"));}expect(await f.executor.commitResult(f.ref,f.input)).toMatchObject({resultId:r.reportId});});
it("模型报告必须定位冻结触点；候选引用被降为空，不能产生假采纳按钮",async()=>{const r=await service().create(ctx,{scope,clientRequestId:"review-real-issues"});if(scope.kind!=="field")throw Error("fixture");const issue={issueId:"issue-1",member:scope.member,target:scope.target,severity:"needs_confirmation",reason:"具体内容需对照来源",suggestion:"请人工核实",candidateRef:{owner:"moments",candidateId:"fake-candidate"}};const f=await settle(r.reportId,{conclusion:"needs_confirmation",issues:[issue],visualVerification:"not_applicable"} as never);await f.executor.commitResult(f.ref,f.input);expect((await service().get(ctx,r.reportId)).outcome?.issues[0]?.candidateRef).toBeNull();const b=await service().create(ctx,{scope,clientRequestId:"review-wrong-issue-target"}),bad=await settle(b.reportId,{conclusion:"needs_changes",issues:[{...issue,member:{kind:"moments",momentsId:"other"},target:{kind:"moments_field",momentsId:"other",field:"text"}}],visualVerification:"not_applicable"} as never);await expect(bad.executor.commitResult(bad.ref,bad.input)).rejects.toThrow();});

it("原project/asset/intelligence来源精确冻结，不能丢失或伪装跨表达锚点",async()=>{legacySources=[{ref:{kind:"project",id:"project",versionId:"actual-project-version"},value:{fact:"用户提供的原事实"}}];const a=await service().create(ctx,{scope,clientRequestId:"review-legacy-sources"});expect(a.snapshot.members[0]?.fields[0]?.sourceRefs).toEqual([legacySources[0]!.ref]);const frozen=await service().readFrozenTask(ctx,{taskId:a.taskId!,reportId:a.reportId,fingerprint:a.snapshot.fingerprint});expect(JSON.stringify(frozen.modelContext)).toContain("用户提供的原事实");legacySources[0]!.value={fact:"实际来源摘录变化"};expect((await service().status(ctx,scope)).currentFingerprint).not.toBe(a.snapshot.fingerprint);});

it("整成员/组合保留每个实际触点正式版本，单字段排除该追溯版本",async()=>{const raw=await ports.readCurrent(ctx,scope,db,false);const memberScope={kind:"member" as const,compositionId,member:raw.members[0]!.member},memberRaw={...raw,scope:memberScope};const before=freezeReview(memberScope,memberRaw,now());const changed=structuredClone(memberRaw);const version=changed.members[0]!.fields[0]!.provenanceVersion;if(version.kind!=="artifact")throw Error("fixture");version.versionId="new-field-formal-version";expect(freezeReview(memberScope,changed,now()).snapshot.fingerprint).not.toBe(before.snapshot.fingerprint);const fieldBefore=freezeReview(scope,raw,now());const fieldChanged={...changed,scope};expect(freezeReview(scope,fieldChanged,now()).snapshot.fingerprint).toBe(fieldBefore.snapshot.fingerprint);});

it.each(["missingProvider","child","notLast","wrongOperation"] as const)("structured根调用proof拒绝 $0",async mode=>{const r=await service().create(ctx,{scope,clientRequestId:`review-proof-${mode}`}),f=await settle(r.reportId);if(mode==="missingProvider")await db.update(executionCalls).set({providerResult:null}).where(eq(executionCalls.id,f.call.id));if(mode==="child")await db.update(executionCalls).set({parentCallId:f.call.id}).where(eq(executionCalls.id,f.call.id));if(mode==="wrongOperation")await db.update(executionCalls).set({operationKey:"work.review/tool/1"}).where(eq(executionCalls.id,f.call.id));if(mode==="notLast")await createExecutionCallLedgerService(db,{now,budget:{maxCalls:5,maxTokens:1000,deadlineMs:600000}}).reserve(f.ref,{operationKey:"work.review/model/2",kind:"model",inputDigest:`sha256:${digest("later-call")}`,reservedTokens:0});await expect(f.executor.commitResult(f.ref,f.input)).rejects.toThrow();expect((await db.select().from(workReviewReports).where(eq(workReviewReports.id,r.reportId)))[0]?.outcome).toBeNull();});

it("真实原AI等待投影保留错误并允许人工确认，无新审核任务",async()=>{
 const r=await service().create(ctx,{scope,clientRequestId:"waiting-original"});
 const persistent=createPersistentTaskService(db,{now});const execution=await persistent.enqueue(ctx,{kind:"ai_task",ownerType:"ai_task",ownerId:r.taskId!,idempotencyKey:`waiting-${r.taskId}`,payload:{fixture:"原执行等待状态fixture，不调用模型"}});
 await db.update(aiTasks).set({executionTaskId:execution.id,status:"running"}).where(eq(aiTasks.id,r.taskId!));
 await db.update(executionTasks).set({status:"waiting_user",lastErrorCode:"MODEL_CREDENTIAL_UNAVAILABLE",lastErrorMessage:"当前模型凭据无法解密",updatedAt:now()}).where(eq(executionTasks.id,execution.id));
 const count=(await db.select().from(aiTasks)).length;
 expect(await ai(db).getTask(ctx,r.taskId!)).toMatchObject({status:"running",runtimeStatus:"waiting_user",errorCode:"MODEL_CREDENTIAL_UNAVAILABLE"});
 expect(await service().get(ctx,r.reportId)).toMatchObject({status:"waiting_user",executionTaskId:execution.id,errorCode:"MODEL_CREDENTIAL_UNAVAILABLE",errorMessage:"当前模型凭据无法解密"});
 await service().confirm(ctx,{mode:"manual",scope,clientRequestId:"waiting-manual",expectedFingerprint:r.snapshot.fingerprint,historicalBasis:[]});
 expect(await service().status(ctx,scope)).toMatchObject({state:"confirmed_current",latestReport:{status:"waiting_user"},confirmedReport:null,modelVerification:"not_verified"});
 expect((await db.select().from(aiTasks)).length).toBe(count);
});
it("等待DTO必须具有原task/execution且不能附模型成功证据",async()=>{
 const r=await service().create(ctx,{scope,clientRequestId:"waiting-contract"});
 const schema=ENDPOINTS.getWorkReview.response;
 expect(schema.safeParse({...r,status:"waiting_user",errorCode:"MODEL_TASK_WAITING_USER",executionTaskId:null}).success).toBe(false);
 expect(schema.safeParse({...r,status:"waiting_user",errorCode:"MODEL_TASK_WAITING_USER",executionTaskId:"actual-execution",settledCallId:"fake",outcome:{conclusion:"no_issue_found",issues:[],visualVerification:"not_applicable"}}).success).toBe(false);
 expect(schema.safeParse({...r,status:"waiting_user",errorCode:"MODEL_TASK_WAITING_USER",executionTaskId:"actual-execution"}).success).toBe(true);
});
it("原执行resume回执幂等：旧命令不重置后来等待，同task/attempt/预算保持",async()=>{
 const r=await service().create(ctx,{scope,clientRequestId:"waiting-receipt"});const persistent=createPersistentTaskService(db,{now});const execution=await persistent.enqueue(ctx,{kind:"ai_task",ownerType:"ai_task",ownerId:r.taskId!,idempotencyKey:`wait-receipt-${r.taskId}`,payload:{fixture:"原控制账本fixture"}});
 await db.update(aiTasks).set({executionTaskId:execution.id,status:"running"}).where(eq(aiTasks.id,r.taskId!));await db.update(executionTasks).set({status:"waiting_user",lastErrorCode:"MODEL_CREDENTIAL_UNAVAILABLE"}).where(eq(executionTasks.id,execution.id));
 const transport=createExecutionTransport(()=>({} as never),()=>persistent);const listed=await transport.request(ENDPOINTS.listExecutionTasks,{params:undefined,query:{accountId:ctx.accountId??undefined,kind:"ai_task",ownerId:r.taskId??undefined,page:1,pageSize:100},body:undefined},ctx) as {data:unknown};expect(ENDPOINTS.listExecutionTasks.response.array().parse(listed.data)[0]).toMatchObject({id:execution.id,ownerId:r.taskId,runtimeStatus:"waiting_user"});
 const original={taskIds:[execution.id],command:"resume" as const,idempotencyKey:"review-original-resume"};const first=await persistent.command(ctx,original);expect(first[0]?.status).toBe("queued");
 await db.update(executionTasks).set({status:"waiting_user",lastErrorCode:"MODEL_CREDENTIAL_UNAVAILABLE",updatedAt:now()}).where(eq(executionTasks.id,execution.id));expect(await persistent.command(ctx,original)).toEqual(first);expect((await persistent.get(ctx,execution.id)).runtimeStatus).toBe("waiting_user");
 const next=await persistent.command(ctx,{...original,idempotencyKey:"review-next-wait-resume"});expect(next[0]).toMatchObject({id:execution.id,ownerId:r.taskId,attempt:execution.attempt,maxAttempts:execution.maxAttempts,status:"queued"});expect((await db.select().from(aiTasks)).length).toBe(1);expect((await db.select().from(executionCalls)).length).toBe(0);
});

it("T1062 已迁移旧账号审核确认精确重放不造NULL行，双来源明确冲突",async()=>{
 const {accountGroups}=await import("../../schema/account-groups");const before=await service().status(ctx,scope),input={mode:"manual",scope,clientRequestId:"legacy-replay-review",expectedFingerprint:before.currentFingerprint,historicalBasis:[]} as const,result=await service().confirm(ctx,input);
 const groupId=`grp_legacy_${ctx.accountId}`;await db.insert(accountGroups).values({id:groupId,userId:ctx.userId,name:"历史组",status:"active",version:1,createdAt:now(),updatedAt:now()});
 for(const table of ["projects","artifacts","moments_anchors","moments_requests","work_compositions","work_composition_requests","work_review_requests","work_review_confirmations"])await db.execute(sql`UPDATE ${sql.identifier(table)} SET group_id=${groupId} WHERE user_id=${ctx.userId}`);
 await db.execute(sql`UPDATE work_composition_versions SET group_id=${groupId}`);
 const group={...ctx,groupId},rows=await db.select().from(workReviewRequests);expect((await service().confirm(group,input)).confirmation).toEqual(result.confirmation);expect(await db.select().from(workReviewRequests)).toEqual(rows);
 await db.insert(workReviewRequests).values({...rows[0]!,id:"second-legacy-review-receipt",accountId:"other-old-account"});const ambiguous=await db.select().from(workReviewRequests);
 await expect(service().confirm(group,input)).rejects.toMatchObject({code:"ConflictError"});expect(await db.select().from(workReviewRequests)).toEqual(ambiguous);
});

// T1313：受控历史库存只构造真实owner行；任务/幂等/事务仍走原AI和review服务。
async function legacyOwner() {
 const {platformAccounts}=await import('../../schema/platform-account');
 const {accountGroups,accountGroupMemberships}=await import('../../schema/account-groups');
 const groupId=`grp_legacy_${ctx.accountId}`;
 await db.insert(platformAccounts).values({id:ctx.accountId,userId:ctx.userId,platform:'bilibili',accountHandle:'受控旧账号',status:'active',createdAt:now(),updatedAt:now()});
 await db.insert(accountGroups).values({id:groupId,userId:ctx.userId,name:'受控历史组',status:'active',version:1,createdAt:now(),updatedAt:now()});
 await db.insert(accountGroupMemberships).values({id:'owned-member',userId:ctx.userId,accountId:ctx.accountId,groupId,version:1,joinedAt:now()});
 // 与公开新producer现场一致：project可被迁移trigger盖G，组合仍原null/A。
 await db.update(projects).set({groupId}).where(eq(projects.id,'project'));
 return {groupId,platformAccounts,accountGroups,accountGroupMemberships};
}
function sqlTrace() {
 const session=(db as any).session,old=session.logger,oldOption=session.options.logger;
 const queries:string[]=[];
 const logger={logQuery(query:string,params:unknown[]){queries.push(query);old?.logQuery?.(query,params);}};
 session.logger=logger;session.options.logger=logger;
 return {queries,restore(){session.logger=old;session.options.logger=oldOption;}};
}
it('T1313 两stage真实旧ctx锁序、预约后rename仍原report/attempt恢复',async()=>{
 const owner=await legacyOwner(),trace=sqlTrace(),submit=ports.submitTask;
 const seen:RequestContext[]=[];let fail=true;
 ports.submitTask=async(c,input,tx)=>{seen.push(c);if(fail)throw Error('stage2-owned-stop');return submit(c,input,tx);};
 const input={scope,clientRequestId:'t1313-stage-gap'};
 try {
  await expect(service().create(ctx,input)).rejects.toThrow('stage2-owned-stop');
  const [reserved]=await db.select().from(workReviewReports);
  expect(reserved).toMatchObject({groupId:owner.groupId,accountId:ctx.accountId,groupVersion:1,membershipVersion:1,taskId:null});
  expect(await db.select().from(aiTasks)).toHaveLength(0);
  expect((await service().request(ctx,input.clientRequestId)).status).toBe('reserved');
  const starts=trace.queries.flatMap((query,index)=>query.includes('from "platform_accounts"')&&query.includes('for update')?[index]:[]);
  expect(starts).toHaveLength(2);
  for(const start of starts){
   const stage=trace.queries.slice(start).join('\n');
   const account=stage.indexOf('from "platform_accounts"'),member=stage.indexOf('from "account_group_memberships"'),group=stage.indexOf('from "account_groups"'),report=stage.indexOf('"work_review_reports"');
   expect(member).toBeGreaterThan(account);expect(group).toBeGreaterThan(member);expect(report).toBeGreaterThan(group);
  }
  // Drizzle logger不输出PGlite事务控制SQL；真实持久report/receipt与0AI证明stage1已独立提交。
  await (await import('node:fs/promises')).writeFile(new URL('../../../../docs/verification/t1313/runtime/legacy-lock-order.json',import.meta.url),JSON.stringify({queries:trace.queries,report:reserved,requests:await db.select().from(workReviewRequests),tasks:await db.select().from(aiTasks)},null,2)+'\n');
  await db.update(owner.accountGroups).set({version:2,name:'仅改名'}).where(eq(owner.accountGroups.id,owner.groupId));
  fail=false;
  const recovered=await service().create(ctx,input);
  expect(recovered.reportId).toBe(reserved!.id);
  expect(recovered.taskId).toBeTruthy();expect(seen.every(c=>c.groupId===undefined&&c.accountId===ctx.accountId)).toBe(true);
  const [task]=await db.select().from(aiTasks);
  expect(task).toMatchObject({groupId:owner.groupId,accountId:ctx.accountId,groupVersion:2,attemptId:reserved!.attemptId});
  expect((await db.select().from(workReviewReports))[0]?.groupVersion).toBe(1);
  expect(await service().readFrozenTask(ctx,{taskId:recovered.taskId!,reportId:recovered.reportId,fingerprint:recovered.snapshot.fingerprint})).toMatchObject({reportId:recovered.reportId});
 } finally {trace.restore();}
});
it.each(['original','changed'] as const)('T1313 未绑定attempt经原createTask fingerprint校验 %s',async mode=>{
 const {groupId}=await legacyOwner(),submit=ports.submitTask;
 ports.submitTask=async()=>{throw Error('stage2-owned-stop');};
 const input={scope,clientRequestId:'t1313-unbound-'+mode};
 await expect(service().create(ctx,input)).rejects.toThrow('stage2-owned-stop');
 const [report]=await db.select().from(workReviewReports);expect(report).toBeDefined();
 const snapshot=ENDPOINTS.getWorkReview.response.shape.snapshot.parse(report!.snapshot);
 const task=await ai(db).createTask(mode==='original'?ctx:{...ctx,groupId},{taskType:'work.review',attemptId:report!.attemptId,inputData:{projectId:report!.projectId,workReviewReportId:report!.id,snapshotFingerprint:snapshot.fingerprint}});
 ports.submitTask=submit;
 if(mode==='changed') {
  await expect(service().create(ctx,input)).rejects.toMatchObject({code:ErrorCode.AttemptPayloadMismatch});
  expect((await db.select().from(workReviewReports))[0]?.taskId).toBeNull();expect(wakes).toBe(0);
 } else {
  expect(await service().create(ctx,input)).toMatchObject({reportId:report!.id,taskId:task.id});
 }
 expect(await db.select().from(aiTasks)).toHaveLength(1);
});
it('T1313 mapped恢复/终态重复不增任务；旧混合pending拒绝但公开可读取消',async()=>{
 await legacyOwner();const input={scope,clientRequestId:'t1313-mapped-loss'},wake=ports.wakeTask;
 ports.wakeTask=async()=>{throw Error('owned-wake-loss');};
 await expect(service().create(ctx,input)).rejects.toThrow('owned-wake-loss');
 const [report]=await db.select().from(workReviewReports),[task]=await db.select().from(aiTasks);
 ports.wakeTask=wake;
 expect(await service().create(ctx,input)).toMatchObject({reportId:report!.id,taskId:task!.id});
 await db.update(aiTasks).set({status:'cancelled'}).where(eq(aiTasks.id,task!.id));
 const before=wakes;await service().create(ctx,input);expect(wakes).toBe(before);
 await expect(service().create(ctx,{...input,scope:{kind:'composition',compositionId}})).rejects.toThrow('完整原输入');
 await db.update(workReviewReports).set({groupId:null,groupVersion:null,membershipVersion:null}).where(eq(workReviewReports.id,report!.id));
 const mixed=await db.select().from(workReviewReports);
 expect(await service().get(ctx,report!.id)).toMatchObject({reportId:report!.id,status:'cancelled'});
 await expect(service().create(ctx,input)).rejects.toThrow('冻结归属不一致');
 expect(await db.select().from(workReviewReports)).toEqual(mixed);expect(wakes).toBe(before);
 await db.update(aiTasks).set({status:'queued'}).where(eq(aiTasks.id,task!.id));
 expect(await ai(db).cancelTask(ctx,task!.id)).toMatchObject({id:task!.id,status:'cancelled'});
 expect(await db.select().from(aiTasks)).toHaveLength(1);
});
it('T1313 私有冻结不读当前父，完整owner和持久映射篡改拒绝',async()=>{
 await legacyOwner();const report=await service().create(ctx,{scope,clientRequestId:'t1313-private'});
 const args={taskId:report.taskId!,reportId:report.reportId,fingerprint:report.snapshot.fingerprint};
 const [original]=await db.select().from(workReviewReports),[task]=await db.select().from(aiTasks);
 expect(original).toBeDefined();expect(task).toBeDefined();
 const savedAssert=ports.assertComposition,savedRead=ports.readCurrent;
 ports.assertComposition=async()=>{throw Error('owned-public-parent-denied');};ports.readCurrent=async()=>{throw Error('owned-current-must-not-read');};
 expect(await service().readFrozenTask(ctx,args)).toMatchObject({reportId:report.reportId});
 await expect(service().get(ctx,report.reportId)).rejects.toThrow('owned-public-parent-denied');
 ports.assertComposition=savedAssert;ports.readCurrent=savedRead;
 for(const patch of [
  {userId:'foreign-user'},{groupId:'foreign-group'},{accountId:'foreign-account'},
  {taskId:'foreign-task'},{attemptId:'foreign-attempt'},{compositionId:'foreign-composition'},
  {scopeKey:'wrong-key'},{projectId:'foreign-project'},
  {frozenContext:{...(original!.frozenContext as object),projectId:'foreign-project'}},
  {snapshot:{...report.snapshot,fingerprint:'wrong-fingerprint'}},
 ]) {
  await db.update(workReviewReports).set(patch).where(eq(workReviewReports.id,report.reportId));
  await expect(service().readFrozenTask(ctx,args)).rejects.toThrow();
  const {ordinal,...restore}=original!;await db.update(workReviewReports).set(restore).where(eq(workReviewReports.id,report.reportId));
 }
 const originalInput=task!.inputData;
 if(!originalInput||typeof originalInput!=='object'||Array.isArray(originalInput))throw Error('fixture实际任务inputData必须为对象');
 for(const patch of [{accountId:'foreign-account'},{groupId:'foreign-group'},{inputData:{...originalInput,projectId:'foreign-project'}}]) {
  await db.update(aiTasks).set(patch).where(eq(aiTasks.id,task!.id));
  await expect(service().readFrozenTask(ctx,args)).rejects.toThrow();
  await db.update(aiTasks).set({accountId:task!.accountId,groupId:task!.groupId,inputData:task!.inputData}).where(eq(aiTasks.id,task!.id));
 }
 await expect(service().readFrozenTask({...ctx,userId:'foreign-user'},args)).rejects.toThrow();
 expect(await service().readFrozenTask(ctx,args)).toMatchObject({reportId:report.reportId});
 await proj(db).deleteProject(ctx,'project');
 await expect(service().readFrozenTask(ctx,args)).rejects.toThrow();
 expect(await db.select().from(workReviewReports)).toHaveLength(0);expect(await db.select().from(aiTasks)).toHaveLength(0);
});
it('T1313 两stage独立原子回滚，同key恢复原报告无孤儿AI',async()=>{
 await legacyOwner();
 await db.execute(sql.raw("CREATE FUNCTION owned_fail_review() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'owned report insert rollback'; END $$;"));
 await db.execute(sql.raw('CREATE TRIGGER owned_fail_review BEFORE INSERT ON work_review_reports FOR EACH ROW EXECUTE FUNCTION owned_fail_review();'));
 const input={scope,clientRequestId:'t1313-rollback'};
 await expect(service().create(ctx,input)).rejects.toThrow('owned report insert rollback');
 expect(await db.select().from(workReviewRequests)).toHaveLength(0);expect(await db.select().from(workReviewReports)).toHaveLength(0);
 await db.execute(sql.raw('DROP TRIGGER owned_fail_review ON work_review_reports;'));
 await db.execute(sql.raw("CREATE OR REPLACE FUNCTION owned_fail_review() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.task_id IS NOT NULL THEN RAISE EXCEPTION 'owned binding rollback'; END IF; RETURN NEW; END $$;"));
 await db.execute(sql.raw('CREATE TRIGGER owned_fail_review BEFORE UPDATE ON work_review_reports FOR EACH ROW EXECUTE FUNCTION owned_fail_review();'));
 await expect(service().create(ctx,input)).rejects.toThrow('owned binding rollback');
 const [reserved]=await db.select().from(workReviewReports);expect(reserved?.taskId).toBeNull();
 expect(await db.select().from(aiTasks)).toHaveLength(0);expect((await service().request(ctx,input.clientRequestId)).status).toBe('reserved');
 await db.execute(sql.raw('DROP TRIGGER owned_fail_review ON work_review_reports;'));await db.execute(sql.raw('DROP FUNCTION owned_fail_review();'));
 expect(await service().create(ctx,input)).toMatchObject({reportId:reserved!.id});expect(await db.select().from(aiTasks)).toHaveLength(1);
});
it.each(['archive','move'] as const)('T1313 stage间实际membership变化拒绝 %s，不重绑旧report',async mode=>{
 const owner=await legacyOwner(),submit=ports.submitTask;
 ports.submitTask=async()=>{throw Error('stage2-owned-stop');};const input={scope,clientRequestId:'t1313-membership-'+mode};
 await expect(service().create(ctx,input)).rejects.toThrow('stage2-owned-stop');
 const reports=await db.select().from(workReviewReports);
 if(mode==='archive')await db.update(owner.accountGroups).set({status:'archived'}).where(eq(owner.accountGroups.id,owner.groupId));
 else {
  await db.insert(owner.accountGroups).values({id:'moved-group',userId:ctx.userId,name:'实际另一组',status:'active',version:1,createdAt:now(),updatedAt:now()});
  await db.update(owner.accountGroupMemberships).set({groupId:'moved-group',version:2}).where(eq(owner.accountGroupMemberships.id,'owned-member'));
 }
 ports.submitTask=submit;
 await expect(service().create(ctx,input)).rejects.toThrow(mode==='archive'?'账号组不可用':'账号已转组');
 expect(await db.select().from(workReviewReports)).toEqual(reports);expect(await db.select().from(aiTasks)).toHaveLength(0);expect(wakes).toBe(0);
});
it('T1313 顶层task projectId与input/report/frozen项目不同，mapped/private同时拒绝',async()=>{
 await legacyOwner();const input={scope,clientRequestId:'t1313-top-project'},report=await service().create(ctx,input);
 await db.update(aiTasks).set({projectId:'foreign-top-project'}).where(eq(aiTasks.id,report.taskId!));
 const observed=await Promise.allSettled([
  service().create(ctx,input),
  service().readFrozenTask(ctx,{taskId:report.taskId!,reportId:report.reportId,fingerprint:report.snapshot.fingerprint}),
 ]);
 expect(observed.map(result=>result.status)).toEqual(['rejected','rejected']);
 expect(await db.select().from(aiTasks)).toHaveLength(1);
});
