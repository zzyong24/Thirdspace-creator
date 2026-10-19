import {createHash} from 'node:crypto';
import {createExecutionRoute} from '@creatoros/contract/execution-worker';
import {createPersistentTaskService} from '../execution/persistent-task.service';
import {createExecutionCallLedgerService} from '../execution/execution-call-ledger.service';
import {beforeAll,afterAll,it,expect,vi} from "vitest";
import {createDb,projects,contentOutputs,artifacts,artifactVersions,aiTasks,eq,type Db} from "@creatoros/backend";
import {createAiService,type ServiceDeps} from "./ai.service";
import {createScriptDraftTargetService} from "../artifacts/script-draft-target.service";
import {accountGroups,accountGroupMemberships} from '../../schema/account-groups';
import {platformAccounts} from '../../schema/platform-account';
import type {RequestContext} from '@creatoros/contract';
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

async function groupFixture(member=false){
 const now=()=>new Date().toISOString(),nextId=(prefix:string)=>`${prefix}-group-${++seq}`;
 const groupId=nextId('group'),projectId=nextId('project');
 const ctx:RequestContext={userId:'script-submission-group',accountId:null,groupId,groupVersion:1,requestId:'group-test',source:'ai'};
 await db.insert(accountGroups).values({id:groupId,userId:ctx.userId,name:'真实隔离组',status:'active',version:1,createdAt:now(),updatedAt:now()});
 let membershipId:string|undefined;
 if(member){ctx.accountId=nextId('account');ctx.membershipVersion=1;membershipId=nextId('membership');await db.insert(platformAccounts).values({id:ctx.accountId,userId:ctx.userId,platform:'douyin',accountHandle:'隔离成员',status:'active',createdAt:now(),updatedAt:now()});await db.insert(accountGroupMemberships).values({id:membershipId,userId:ctx.userId,groupId,accountId:ctx.accountId,version:1,joinedAt:now()});}
 await db.insert(projects).values({id:projectId,userId:ctx.userId,accountId:null,groupId,title:'纯组原稿',creationMode:'manual',status:'active',currentStage:'script',startedAt:now(),createdAt:now(),updatedAt:now()});
 const resolveTaskRuntimeData=vi.fn(async()=>({skillSnapshot:{revision:'group-original'}}));
 const service=createAiService({db,now,nextId,scriptDraftTargets:createScriptDraftTargetService({now,nextId}),resolveTaskRuntimeData} as unknown as ServiceDeps);
 const input={projectId,topic:'真实组主题',attemptId:nextId('group-original-attempt')};
 const binding=await originalParentCall(ctx,input,'codex');
 const readArtifacts=()=>db.select().from(artifacts).where(eq(artifacts.projectId,projectId));
 return {ctx,input,binding,service,readArtifacts,membershipId,resolveTaskRuntimeData};
}

it.each([false,true])('纯组/真实成员账号准备零实体，原Codex父事务提交且回执失败回滚，member=%s',async member=>{
 const f=await groupFixture(member),prepared=await f.service.prepareScriptDraftTaskCommit(f.ctx,f.input);
 expect(await f.readArtifacts()).toEqual([]);expect(await f.service.findTaskByAttempt(f.ctx,'script.draft',f.input.attemptId)).toBeNull();
 await expect(db.transaction(async tx=>{await prepared.commit(tx,f.binding);throw Error('真实父回执回滚');})).rejects.toThrow('真实父回执回滚');
 expect(await f.readArtifacts()).toEqual([]);expect(await f.service.findTaskByAttempt(f.ctx,'script.draft',f.input.attemptId)).toBeNull();
 const task=await db.transaction(tx=>prepared.commit(tx,f.binding));
 const rows=await f.readArtifacts();expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({artifactType:'output_script',groupId:f.ctx.groupId,accountId:null,contentOutputId:null});
 const [raw]=await db.select().from(aiTasks).where(eq(aiTasks.id,task.id));if(!raw)throw Error('真实任务持久行缺失');expect(raw).toMatchObject({groupId:f.ctx.groupId,accountId:f.ctx.accountId});expect(raw.runtimeData).toMatchObject({hostTaskSubmission:f.binding,executionRoute:{engine:'codex'}});
 expect((await db.transaction(tx=>prepared.commit(tx,f.binding))).id).toBe(task.id);expect(await f.readArtifacts()).toEqual(rows);
 for(const patch of [{callId:'foreign-call'},{inputDigest:'sha256:'+'f'.repeat(64)},{executionTaskId:'foreign-execution'}])await expect(db.transaction(tx=>prepared.commit(tx,{...f.binding,...patch}))).rejects.toThrow();
});

it('组间相同attempt独立，同组并发只一个任务，完整合法意图变化拒绝且无孤儿',async()=>{
 const a=await groupFixture(),b=await groupFixture();b.input.attemptId=a.input.attemptId;
 const [one,replay,other]=await Promise.all([a.service.createScriptDraftTask(a.ctx,a.input),a.service.createScriptDraftTask(a.ctx,a.input),b.service.createScriptDraftTask(b.ctx,b.input)]);
 expect(one.id).toBe(replay.id);expect(other.id).not.toBe(one.id);expect(one.inputData.artifactId).not.toBe(other.inputData.artifactId);expect(await a.readArtifacts()).toHaveLength(1);expect(await b.readArtifacts()).toHaveLength(1);
 const source='不能改变的一份真实输入。',digest=createHash('sha256').update(source).digest('hex');
 const mutations=[{topic:'不同主题'},{instruction:'不同完整指令'},{extraBrief:'不同原要求'},{projectId:b.input.projectId},{outputId:'different-output'},{instruction:'基于完整资料创作',sourceSnapshots:[{sourceType:'message' as const,sourceId:'source',label:'原文',order:0,charCount:source.length,sha256:digest,body:source,complete:true as const}]},{draftMode:'verbatim' as const,verbatimSourceRef:'original',verbatimSourceText:source,verbatimSourceLength:source.length,verbatimSourceSha256:digest}];
 const beforeA=await a.readArtifacts(),beforeB=await b.readArtifacts();
 for(const patch of mutations)await expect(a.service.createScriptDraftTask(a.ctx,{...a.input,...patch})).rejects.toMatchObject({code:'ATTEMPT_PAYLOAD_MISMATCH'});
 expect(await a.readArtifacts()).toEqual(beforeA);expect(await b.readArtifacts()).toEqual(beforeB);
 const prepared=await a.service.prepareScriptDraftTaskCommit(a.ctx,a.input);await db.delete(aiTasks).where(eq(aiTasks.id,one.id));await expect(db.transaction(tx=>prepared.commit(tx,a.binding))).rejects.toThrow('原整稿任务已不存在');
});

it.each(['missing','archived','foreign-user','no-workspace'] as const)('准备按当前真实可写工作区拒绝 %s，零目标/任务',async kind=>{
 const f=await groupFixture();let ctx={...f.ctx};
 if(kind==='missing')ctx.groupId='absent-owned-group';if(kind==='archived')await db.update(accountGroups).set({status:'archived'}).where(eq(accountGroups.id,f.ctx.groupId!));if(kind==='foreign-user')ctx.userId='other-user';if(kind==='no-workspace'){delete ctx.groupId;ctx.accountId=null;}
 await expect(f.service.prepareScriptDraftTaskCommit(ctx,f.input)).rejects.toThrow();expect(await f.readArtifacts()).toEqual([]);expect(await f.service.findTaskByAttempt(f.ctx,'script.draft',f.input.attemptId)).toBeNull();
});

it.each(['group-archived','membership-left','membership-version'] as const)('准备后状态变化由原commit锁重验且回滚 %s',async kind=>{
 const f=await groupFixture(kind!=='group-archived'),prepared=await f.service.prepareScriptDraftTaskCommit(f.ctx,f.input);
 if(kind==='group-archived')await db.update(accountGroups).set({status:'archived'}).where(eq(accountGroups.id,f.ctx.groupId!));
 else await db.update(accountGroupMemberships).set(kind==='membership-left'?{leftAt:new Date().toISOString()}:{version:2}).where(eq(accountGroupMemberships.id,f.membershipId!));
 await expect(db.transaction(tx=>prepared.commit(tx,f.binding))).rejects.toThrow();expect(await f.readArtifacts()).toEqual([]);expect(await f.service.findTaskByAttempt(f.ctx,'script.draft',f.input.attemptId)).toBeNull();
});

it('纯组跨项目/输出拒绝；两个video输出与项目级目标独立；旧master不写入',async()=>{
 const a=await groupFixture(),b=await groupFixture();
 await expect(a.service.createScriptDraftTask(a.ctx,{...a.input,projectId:b.input.projectId})).rejects.toThrow();expect(await a.readArtifacts()).toEqual([]);expect(await b.readArtifacts()).toEqual([]);
 const now=new Date().toISOString(),videoA=`group-video-${++seq}`,videoB=`group-video-${++seq}`,foreign=`group-video-${++seq}`,article=`group-article-${++seq}`;
 await db.insert(contentOutputs).values([{id:videoA,projectId:a.input.projectId,title:'视频一',contentType:'video',groupId:a.ctx.groupId},{id:videoB,projectId:a.input.projectId,title:'视频二',contentType:'video',groupId:a.ctx.groupId},{id:foreign,projectId:b.input.projectId,title:'另一组视频',contentType:'video',groupId:b.ctx.groupId},{id:article,projectId:a.input.projectId,title:'文章',contentType:'article',groupId:a.ctx.groupId}].map(row=>({...row,status:'drafting',createdAt:now,updatedAt:now})));
 for(const outputId of [foreign,article])await expect(a.service.createScriptDraftTask(a.ctx,{...a.input,outputId,attemptId:`group-rejected-output-${++seq}`})).rejects.toThrow();expect(await a.readArtifacts()).toEqual([]);
 const master=`group-master-${++seq}`;await db.insert(artifacts).values({id:master,userId:a.ctx.userId,groupId:a.ctx.groupId!,accountId:null,projectId:a.input.projectId,title:'历史母稿',artifactType:'master_script',stage:'script',createdAt:now,updatedAt:now});
 const original=(await a.readArtifacts())[0];
 const tasks=await Promise.all([videoA,videoB,undefined].map(outputId=>a.service.createScriptDraftTask(a.ctx,{...a.input,...(outputId?{outputId}:{}),attemptId:`group-output-distinct-${++seq}`})));
 const rows=await a.readArtifacts();expect(new Set(tasks.map(row=>row.inputData.artifactId)).size).toBe(3);expect(rows.find(row=>row.id===master)).toEqual(original);
 expect(tasks).toHaveLength(3);for(let index=0;index<3;index++){const task=tasks[index];if(!task)throw Error('真实输出任务缺失');expect(rows.find(row=>row.id===task.inputData.artifactId)).toMatchObject({artifactType:'output_script',contentOutputId:[videoA,videoB,null][index]});if(index<2)expect(task.inputData.baseVersionId).toBeTruthy();}
});

it('纯组准备前clone原上下文/完整输入/配置；项目删除与坏保真原文仍拒绝',async()=>{
 const f=await groupFixture();let release!:()=>void;const gate=new Promise<void>(r=>{release=r;}),runtime={skillSnapshot:{revision:'frozen-group'}};
 f.resolveTaskRuntimeData.mockImplementation(async()=>{await gate;return runtime;});const ctx=structuredClone(f.ctx),input=structuredClone(f.input);
 const pending=f.service.prepareScriptDraftTaskCommit(f.ctx,f.input);f.ctx.groupId='caller-mutated-group';f.input.topic='caller-mutated-topic';release();const prepared=await pending;runtime.skillSnapshot.revision='caller-mutated-runtime';
 const task=await db.transaction(tx=>prepared.commit(tx,f.binding));expect(task.inputData.topic).toBe(input.topic);const [raw]=await db.select().from(aiTasks).where(eq(aiTasks.id,task.id));if(!raw)throw Error('冻结上下文真实任务持久行缺失');expect(raw.groupId).toBe(ctx.groupId);expect(raw.runtimeData).toMatchObject({skillSnapshot:{revision:'frozen-group'}});
 await expect(f.service.createScriptDraftTask(ctx,{...input,attemptId:`group-bad-verbatim-${++seq}`,draftMode:'verbatim',verbatimSourceRef:'ref',verbatimSourceText:'原文',verbatimSourceLength:2,verbatimSourceSha256:'0'.repeat(64)})).rejects.toThrow('保真');
 const g=await groupFixture(),removed=await g.service.prepareScriptDraftTaskCommit(g.ctx,g.input);await db.delete(projects).where(eq(projects.id,g.input.projectId));await expect(db.transaction(tx=>removed.commit(tx,g.binding))).rejects.toThrow();expect(await g.readArtifacts()).toEqual([]);expect(await g.service.findTaskByAttempt(g.ctx,'script.draft',g.input.attemptId)).toBeNull();
});
