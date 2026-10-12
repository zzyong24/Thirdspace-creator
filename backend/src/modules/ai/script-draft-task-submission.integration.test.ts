import {createHash} from 'node:crypto';
import {createExecutionRoute} from '@creatoros/contract/execution-worker';
import {createPersistentTaskService} from '../execution/persistent-task.service';
import {createExecutionCallLedgerService} from '../execution/execution-call-ledger.service';
import {beforeAll,afterAll,it,expect,vi} from "vitest";
import {createDb,projects,contentOutputs,artifacts,artifactVersions,aiTasks,eq,type Db} from "@creatoros/backend";
import {createAiService,type ServiceDeps} from "./ai.service";
import {createScriptDraftTargetService} from "../artifacts/script-draft-target.service";
let db:Db,close:()=>Promise<void>,seq=0;
beforeAll(async()=>{const f=await createDb();db=f.db;close=()=>f.client.close();});
afterAll(async()=>close());
async function fixture(){
 const ctx={userId:"script-submission",accountId:`account-${++seq}`,requestId:"test",source:"ai" as const};
 const now=()=>new Date().toISOString(),nextId=(prefix:string)=>`${prefix}-${++seq}`,projectId=nextId("project");
 await db.insert(projects).values({id:projectId,userId:ctx.userId,accountId:ctx.accountId,title:"原稿项目",creationMode:"manual",status:"active",currentStage:"script",startedAt:now(),createdAt:now(),updatedAt:now()});
 const resolveTaskRuntimeData=vi.fn(async()=>({skillSnapshot:{revision:"first"}}));
 const targets=createScriptDraftTargetService({now,nextId});
 const service=createAiService({db,now,nextId,scriptDraftTargets:targets,resolveTaskRuntimeData} as unknown as ServiceDeps);
 const input={projectId,topic:"原主题",attemptId:`script-task-attempt-${++seq}`};
 const binding=await originalParentCall(ctx,input);
 const readArtifacts=()=>db.select().from(artifacts).where(eq(artifacts.projectId,projectId));
 return {ctx,service,input,binding,resolveTaskRuntimeData,readArtifacts,targets};
}
it("准备不创建稿件或任务，父回执失败时整单回滚",async()=>{
 const f=await fixture(),prepared=await f.service.prepareScriptDraftTaskCommit(f.ctx,f.input);
 expect(await f.readArtifacts()).toEqual([]);
 const versionsBefore=await db.select().from(artifactVersions);
 await expect(db.transaction(async tx=>{await prepared.commit(tx,f.binding);throw new Error("父回执失败");})).rejects.toThrow("父回执失败");
 expect(await db.select().from(artifactVersions)).toEqual(versionsBefore);
 expect(await f.readArtifacts()).toEqual([]);expect(await f.service.findTaskByAttempt(f.ctx,"script.draft",f.input.attemptId)).toBeNull();
 const task=await db.transaction(tx=>prepared.commit(tx,f.binding));
 const rows=await f.readArtifacts();expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({artifactType:"output_script",stage:"script",currentVersionId:expect.any(String)});
 expect((await db.select().from(artifactVersions).where(eq(artifactVersions.id,rows[0]!.currentVersionId!)))[0]!.contentText).toBe("");
 expect(task.inputData).toMatchObject({artifactId:rows[0]!.id,projectId:f.input.projectId,topic:"原主题"});
 expect((await db.select().from(aiTasks).where(eq(aiTasks.id,task.id)))[0]!.runtimeData).toMatchObject({hostTaskSubmission:f.binding});
 expect(f.resolveTaskRuntimeData).toHaveBeenCalledTimes(1);
});
it("同键并发只建一个任务，不同任务共用同项目 output_script",async()=>{
 const f=await fixture();
 const [a,b,c]=await Promise.all([f.service.createScriptDraftTask(f.ctx,f.input),f.service.createScriptDraftTask(f.ctx,f.input),f.service.createScriptDraftTask(f.ctx,{...f.input,attemptId:f.input.attemptId+"-other"})]);
 expect(a.id).toBe(b.id);expect(c.id).not.toBe(a.id);expect(a.inputData.artifactId).toBe(c.inputData.artifactId);expect(await f.readArtifacts()).toHaveLength(1);
 await expect(f.service.createScriptDraftTask(f.ctx,{...f.input,topic:"另一个意图"})).rejects.toMatchObject({code:"ATTEMPT_PAYLOAD_MISMATCH"});
});
it("重放不重新创建后来删除的稿件，也不接管其他父调用",async()=>{
 const f=await fixture(),prepared=await f.service.prepareScriptDraftTaskCommit(f.ctx,f.input),task=await db.transaction(tx=>prepared.commit(tx,f.binding));
 await db.delete(artifacts).where(eq(artifacts.id,task.inputData.artifactId as string));
 expect((await db.transaction(tx=>prepared.commit(tx,f.binding))).id).toBe(task.id);expect(await f.readArtifacts()).toEqual([]);
 await expect(db.transaction(tx=>prepared.commit(tx,{...f.binding,callId:"another"}))).rejects.toThrow("来源");
});
it("缺账号、跨账号、已删项目与坏原文均不创建稿件或任务",async()=>{
 const f=await fixture();
 await expect(f.service.createScriptDraftTask({...f.ctx,accountId:null},f.input)).rejects.toThrow();
 await expect(f.service.createScriptDraftTask({...f.ctx,accountId:"other"},f.input)).rejects.toThrow();
 await expect(f.service.createScriptDraftTask(f.ctx,{...f.input,draftMode:"verbatim",verbatimSourceRef:"ref",verbatimSourceText:"正文",verbatimSourceLength:2,verbatimSourceSha256:"0".repeat(64)})).rejects.toThrow("保真");
 const prepared=await f.service.prepareScriptDraftTaskCommit(f.ctx,f.input);
 await db.delete(projects).where(eq(projects.id,f.input.projectId));
 await expect(db.transaction(tx=>prepared.commit(tx,f.binding))).rejects.toThrow();
 expect(await f.readArtifacts()).toEqual([]);expect(await f.service.findTaskByAttempt(f.ctx,"script.draft",f.input.attemptId)).toBeNull();
});
it("旧 master_script 不成为写入目标，原文与配置冻结后不受调用方修改",async()=>{
 const f=await fixture();let release!:()=>void;
 const gate=new Promise<void>(r=>{release=r;}),runtime={skillSnapshot:{revision:"original"}};
 f.resolveTaskRuntimeData.mockImplementation(async()=>{await gate;return runtime;});
 const owner=structuredClone(f.ctx),original=structuredClone(f.input);
 const work=f.service.prepareScriptDraftTaskCommit(f.ctx,f.input);f.ctx.accountId="changed";f.input.topic="changed";release();
 const prepared=await work;runtime.skillSnapshot.revision="changed";
 await db.insert(artifacts).values({id:`master-${++seq}`,projectId:original.projectId,userId:owner.userId,accountId:owner.accountId,title:"旧稿",artifactType:"master_script",stage:"script",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
 const task=await db.transaction(tx=>prepared.commit(tx,f.binding));
 expect(task.inputData.topic).toBe("原主题");
 expect((await f.readArtifacts()).filter(row=>row.artifactType==="output_script")).toHaveLength(1);
 expect((await db.select().from(aiTasks).where(eq(aiTasks.id,task.id)))[0]!.runtimeData).toMatchObject({skillSnapshot:{revision:"original"}});
});

it("同键不同项目并发只有一个赢家，失败方的稿件和初始版本回滚",async()=>{
 const a=await fixture(),b=await fixture();
 // 在同一真实账号下建立第二个项目，保持 attempt 的唯一域相同。
 await db.update(projects).set({userId:a.ctx.userId,accountId:a.ctx.accountId}).where(eq(projects.id,b.input.projectId));
 const results=await Promise.allSettled([a.service.createScriptDraftTask(a.ctx,a.input),a.service.createScriptDraftTask(a.ctx,{...a.input,projectId:b.input.projectId})]);
 expect(results.filter(result=>result.status==="fulfilled")).toHaveLength(1);
 const rejected=results.find(result=>result.status==="rejected") as PromiseRejectedResult;expect(rejected.reason).toMatchObject({code:"ATTEMPT_PAYLOAD_MISMATCH"});
 const rows=[...await a.readArtifacts(),...await b.readArtifacts()];expect(rows).toHaveLength(1);
 const task=(results.find(result=>result.status==="fulfilled") as PromiseFulfilledResult<Awaited<ReturnType<typeof a.service.createScriptDraftTask>>>).value;
 expect(rows[0]!.id).toBe(task.inputData.artifactId);
});

it("同项目两个视频 output 有独立脚本；旧项目任务仍复用无 output 的稿件",async()=>{
 const f=await fixture();
 const outputIds=[`video-output-${++seq}`,`video-output-${++seq}`];
 await db.insert(contentOutputs).values(outputIds.map(id=>({id,projectId:f.input.projectId,title:id,
  contentType:"video",status:"drafting",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()})));
 const now=()=>new Date().toISOString(),nextId=(prefix:string)=>`${prefix}-${++seq}`;
 const serviceDeps={db,now,nextId,scriptDraftTargets:createScriptDraftTargetService({now,nextId})} as unknown as ServiceDeps;
 const ai=createAiService(serviceDeps);
 const first=await ai.createScriptDraftTask(f.ctx,{...f.input,outputId:outputIds[0],attemptId:`script-output-${++seq}-first`});
 const second=await ai.createScriptDraftTask(f.ctx,{...f.input,outputId:outputIds[1],attemptId:`script-output-${++seq}-second`});
 const old=await ai.createScriptDraftTask(f.ctx,{...f.input,attemptId:`script-output-${++seq}-legacy`});
 expect(new Set([first.inputData.artifactId,second.inputData.artifactId,old.inputData.artifactId]).size).toBe(3);
 const rows=await f.readArtifacts();
 expect(rows.find(row=>row.id===first.inputData.artifactId)?.contentOutputId).toBe(outputIds[0]);
 expect(rows.find(row=>row.id===second.inputData.artifactId)?.contentOutputId).toBe(outputIds[1]);
 expect(rows.find(row=>row.id===old.inputData.artifactId)?.contentOutputId).toBeNull();
 expect(first.inputData.baseVersionId).toBeTruthy();
 await expect(ai.createScriptDraftTask({...f.ctx,accountId:"another-account"},
  {...f.input,outputId:outputIds[0],attemptId:`script-output-${++seq}-cross`})).rejects.toThrow();
});

async function originalParentCall(ctx:import('@creatoros/contract').RequestContext,input:unknown,engine:'pi'|'codex'='pi'){
 const now=()=>new Date().toISOString(),budget={maxCalls:8,maxTokens:100000,deadlineMs:600000};
 const tasks=createPersistentTaskService(db,{now,nextId:prefix=>`${prefix}-${++seq}`});
 const parent=await tasks.enqueue(ctx,{kind:'ai_task',ownerType:'ai_task',ownerId:`original-host-parent-${++seq}`,idempotencyKey:`original-host-parent-${++seq}`,executionBudget:budget,payload:{executionRoute:createExecutionRoute(engine)}});
 const claim=await tasks.claimTask({taskId:parent.id,workerId:'original-host'});if(!claim)throw Error('本case真实父执行没有claim');
 const ref={executionTaskId:parent.id,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
 const ledger=createExecutionCallLedgerService(db,{now,budget}),inputDigest=`sha256:${createHash('sha256').update(JSON.stringify(input)).digest('hex')}`;
 const call=await ledger.reserve(ref,{operationKey:`original-task-submit-${++seq}`,kind:'tool',inputDigest,reservedTokens:0});
 await ledger.start(ref,call.id);
 expect((await ledger.inspect(ref)).calls).toMatchObject([{id:call.id,inputDigest,status:'started',startedAttempt:ref.attempt}]);
 return {executionTaskId:parent.id,callId:call.id,inputDigest};
}
