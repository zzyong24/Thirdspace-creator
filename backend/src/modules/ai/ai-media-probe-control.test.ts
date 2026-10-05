import {afterAll,beforeAll,expect,it} from "vitest";
import {createDb,aiTasks,aiTaskResults,executionControlReceipts,eq,type Db} from "@creatoros/backend";
import {accountGroups} from "../../schema/account-groups";
import {accountGroupMemberships} from "../../schema/account-groups";
import {platformAccounts} from "../../schema/platform-account";
import {createHash} from "node:crypto";
import {canonicalJson} from "./canonical-json";
import type {RequestContext} from "@creatoros/contract";
import {toTaskDto} from "./ai.schema";
import {createMediaProbeControl} from "./ai-media-probe-control";
let db:Db,close:()=>Promise<void>,seq=0;
const now=()=>"2026-10-02T04:00:00.000Z",nextId=(prefix:string)=>`${prefix}-${++seq}`;
const ctx={userId:"probe-user",accountId:"probe-account",requestId:"probe-http",source:"user" as const};
beforeAll(async()=>{const opened=await createDb();db=opened.db;close=()=>opened.client.close();});afterAll(async()=>close());
async function fixture(){const id=nextId("probe"),inputData={spec:{taskType:"media.probe",goal:"读取媒体",inputs:[],params:{file:"source"},constraints:{timeoutSec:120,network:"deny",maxOutputMB:1}}};await db.insert(aiTasks).values({id,userId:ctx.userId,accountId:ctx.accountId,taskType:"exec.media.probe",status:"failed",inputData,runtimeData:{frozenSetting:"keep"},modelKey:"",idempotencyKey:id,attemptId:`original-attempt-${id}`,requestFingerprint:`sha256:${"a".repeat(64)}`,requestedAt:now(),errorMessage:"探针故障"});return{id,inputData,control:createMediaProbeControl({db,now,nextId})};}
it("原任务恢复与回执持久原子，回复丢失及再次失败后旧命令不重排",async()=>{
 const f=await fixture(),command={taskId:f.id,requestId:nextId("retry-request")};const first=await f.control.retry(ctx,command);
 expect(first).toMatchObject({taskId:f.id,generation:1});expect(await f.control.claim(ctx,f.id,1)).toBe(true);await f.control.markFailed(ctx,f.id,1,"第二次失败");
 expect(await createMediaProbeControl({db,now,nextId}).retry(ctx,command)).toEqual(first);const [task]=await db.select().from(aiTasks).where(eq(aiTasks.id,f.id));
 expect(task).toMatchObject({status:"failed",inputData:f.inputData,attemptId:`original-attempt-${f.id}`,runtimeData:{frozenSetting:"keep",probeRunGeneration:1},costUsd:null,modelCallStartedAt:null});
});
it("同请求并发恢复一次，同key异任务全回滚，跨账号拒绝",async()=>{
 const a=await fixture(),b=await fixture(),command={taskId:a.id,requestId:nextId("retry-request")};const receipts=await Promise.all([a.control.retry(ctx,command),a.control.retry(ctx,command)]);expect(receipts[0]).toEqual(receipts[1]);
 await expect(a.control.retry(ctx,{...command,taskId:b.id})).rejects.toThrow();await expect(a.control.retry({...ctx,accountId:"other"},command)).rejects.toThrow();
 const [other]=await db.select().from(aiTasks).where(eq(aiTasks.id,b.id));expect(other?.status).toBe("failed");expect((await db.select().from(executionControlReceipts).where(eq(executionControlReceipts.idempotencyKey,`ai-deterministic-retry:${command.requestId}`)))).toHaveLength(1);
});
it("旧取消轮次迟到结算不污染新轮次，claim同轮次只成功一次",async()=>{
 const f=await fixture();await db.update(aiTasks).set({status:"queued"}).where(eq(aiTasks.id,f.id));expect(await f.control.claim(ctx,f.id,0)).toBe(true);expect(await f.control.claim(ctx,f.id,0)).toBe(false);
 await db.update(aiTasks).set({status:"cancelled"}).where(eq(aiTasks.id,f.id));await f.control.retry(ctx,{taskId:f.id,requestId:nextId("retry-request")});expect(await f.control.claim(ctx,f.id,1)).toBe(true);
 await f.control.markFailed(ctx,f.id,0,"旧轮次迟到失败");await expect(f.control.recordCandidate(ctx,f.id,0,{resultType:"execution_manifest",resultData:{manifest:{meta:{deterministicGeneration:0}}}})).rejects.toThrow();
 expect((await db.select().from(aiTasks).where(eq(aiTasks.id,f.id)))[0]?.status).toBe("running");expect(await db.select().from(aiTaskResults).where(eq(aiTaskResults.aiTaskId,f.id))).toHaveLength(0);
});
it("其他执行类型及模型调用标记不可借探针恢复入口",async()=>{
 const f=await fixture();await db.update(aiTasks).set({taskType:"exec.video.render"}).where(eq(aiTasks.id,f.id));await expect(f.control.retry(ctx,{taskId:f.id,requestId:nextId("retry-request")})).rejects.toThrow();
 await db.update(aiTasks).set({taskType:"exec.media.probe",modelCallStartedAt:now()}).where(eq(aiTasks.id,f.id));await expect(f.control.retry(ctx,{taskId:f.id,requestId:nextId("retry-request")})).rejects.toThrow();
});
it("同请求不同任务并发只提交一个，另一任务保持失败并返回领域冲突",async()=>{
 const a=await fixture(),b=await fixture(),requestId=nextId("retry-request");const results=await Promise.allSettled([a.control.retry(ctx,{taskId:a.id,requestId}),a.control.retry(ctx,{taskId:b.id,requestId})]);
 expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);const failed=results.find(r=>r.status==="rejected") as PromiseRejectedResult;expect(failed.reason).toMatchObject({code:"ConflictError"});
 const statuses=await Promise.all([a.id,b.id].map(async id=>(await db.select().from(aiTasks).where(eq(aiTasks.id,id)))[0]?.status));expect(statuses.sort()).toEqual(["failed","queued"]);
});
it("当前轮次坏清单零写入，历史预演与旧轮次清单不能成为新探针结果",async()=>{
 const f=await fixture();await f.control.retry(ctx,{taskId:f.id,requestId:nextId("retry-request")});await f.control.claim(ctx,f.id,1);
 await expect(f.control.recordCandidate(ctx,f.id,1,{resultType:"execution_manifest",resultData:{manifest:{taskType:"media.probe",artifacts:"坏形状",meta:{deterministicGeneration:1}}}})).rejects.toThrow();
 expect((await db.select().from(aiTasks).where(eq(aiTasks.id,f.id)))[0]?.status).toBe("running");
 const {latestManifest}=await import("../execution/execution.schema");
 const result=(resultType:string,resultData:Record<string,unknown>)=>({id:nextId("result"),aiTaskId:f.id,resultType,resultData,artifactId:null,knowledgeItemId:null,assetId:null});
 const old=result("execution_manifest",{manifest:{taskType:"media.probe",artifacts:[],summary:"旧探针",meta:{}}});
 const plan=result("execution_plan",{taskType:"media.probe",summary:"历史预演"});expect(latestManifest([old,plan],1)).toBeNull();expect(latestManifest([old],0)?.summary).toBe("旧探针");
 const current=result("execution_manifest",{manifest:{taskType:"media.probe",artifacts:[],summary:"新探针",meta:{deterministicGeneration:1}}});expect(latestManifest([old,current,plan],1)?.summary).toBe("新探针");
});
it("旧轮次迟到清理保留新沙箱与控制器，不吞同任务的新执行",async()=>{
 const {mkdtemp,rm,stat}=await import("node:fs/promises"),{tmpdir}=await import("node:os"),{join}=await import("node:path");
 const {runExecutionTask,abortExecutionTask}=await import("../execution/run-execution-task"),{createExecutorRegistry}=await import("../execution/executor-registry");
 const root=await mkdtemp(join(tmpdir(),"creatoros-probe-race-")),f=await fixture();await db.update(aiTasks).set({status:"queued"}).where(eq(aiTasks.id,f.id));
 let releaseOld!:()=>void,releaseNew!:()=>void,startedOld!:()=>void,startedNew!:()=>void;
 const oldStarted=new Promise<void>(r=>startedOld=r),newStarted=new Promise<void>(r=>startedNew=r);
 const oldGate=new Promise<void>(r=>releaseOld=r),newGate=new Promise<void>(r=>releaseNew=r);let calls=0;
 const registry=createExecutorRegistry();registry.register({taskType:"media.probe",loopType:"deterministic",networkPosture:"none",run:async()=>{const first=++calls===1;if(first){startedOld();await oldGate;}else{startedNew();await newGate;}return{summary:"机械轮次fixture",meta:{}};}});
 const deps={workspacesRoot:root,registry,assets:{materializeAsset:async()=>null},ai:{probeControl:f.control,markRunning:async()=>{},recordStep:async()=>{},recordCandidate:async()=>{},markFailed:async()=>{throw Error("不得绕过围栏");}}};
 try{
  const oldRun=runExecutionTask(ctx,{id:f.id,inputData:f.inputData,deterministicGeneration:0},deps);await oldStarted;
  await db.update(aiTasks).set({status:"cancelled"}).where(eq(aiTasks.id,f.id));await f.control.retry(ctx,{taskId:f.id,requestId:nextId("retry-request")});
  const newRun=runExecutionTask(ctx,{id:f.id,inputData:f.inputData,deterministicGeneration:1},deps);await newStarted;releaseOld();await oldRun;
  expect((await db.select().from(aiTasks).where(eq(aiTasks.id,f.id)))[0]?.status).toBe("running");expect((await stat(join(root,`${f.id}-probe-1`))).isDirectory()).toBe(true);expect(abortExecutionTask(f.id,0)).toBe(false);expect(abortExecutionTask(f.id,1)).toBe(true);releaseNew();await newRun;
  expect((await db.select().from(aiTasks).where(eq(aiTasks.id,f.id)))[0]?.status).toBe("failed");expect(await db.select().from(aiTaskResults).where(eq(aiTaskResults.aiTaskId,f.id))).toHaveLength(0);
 }finally{releaseOld?.();releaseNew?.();await rm(root,{recursive:true,force:true});}
},15000);

it("旧取消不能取消新轮次，正式采用须在同事务锁定当前成功探针",async()=>{
 const f=await fixture();await db.update(aiTasks).set({status:"queued"}).where(eq(aiTasks.id,f.id));await f.control.claim(ctx,f.id,0);
 const probeDigest="b".repeat(64);await f.control.recordCandidate(ctx,f.id,0,{resultType:"execution_manifest",resultData:{manifest:{taskType:"media.probe",artifacts:[],summary:"机械fixture",meta:{deterministicGeneration:0,probe:{probeDigest}}}}});
 await db.transaction(async tx=>f.control.assertSettled(ctx,f.id,0,probeDigest,tx as unknown as Db));
 await f.control.cancel(ctx,f.id,0);await expect(db.transaction(async tx=>f.control.assertSettled(ctx,f.id,0,probeDigest,tx as unknown as Db))).rejects.toThrow("状态已变化");
 await f.control.retry(ctx,{taskId:f.id,requestId:nextId("retry-request")});await f.control.claim(ctx,f.id,1);await expect(f.control.cancel(ctx,f.id,0)).rejects.toThrow("轮次已变化");expect((await db.select().from(aiTasks).where(eq(aiTasks.id,f.id)))[0]?.status).toBe("running");
});

it("损坏历史轮次不阻断任务列表读取，恢复仍拒绝损坏状态且零写",async()=>{
 const f=await fixture();await db.update(aiTasks).set({runtimeData:{probeRunGeneration:"损坏历史"}}).where(eq(aiTasks.id,f.id));
 const [row]=await db.select().from(aiTasks).where(eq(aiTasks.id,f.id));
 if(!row)throw new Error("真实fixture任务缺失");expect(toTaskDto(row)).toMatchObject({id:f.id,status:"failed"});expect(toTaskDto(row).deterministicGeneration).toBeUndefined();
 await expect(f.control.retry(ctx,{taskId:f.id,requestId:nextId("corrupt-retry")})).rejects.toThrow("媒体处理轮次无效");
 expect((await db.select().from(executionControlReceipts).where(eq(executionControlReceipts.idempotencyKey,`ai-deterministic-retry:corrupt-retry-${seq}`)))).toHaveLength(0);
});

it("显式null轮次不冒充历史缺字段0，列表保留损坏任务且恢复零写",async()=>{
 const f=await fixture();await db.update(aiTasks).set({runtimeData:{probeRunGeneration:null}}).where(eq(aiTasks.id,f.id));
 const [row]=await db.select().from(aiTasks).where(eq(aiTasks.id,f.id));if(!row)throw Error("真实fixture任务缺失");expect(toTaskDto(row).deterministicGeneration).toBeUndefined();
 const requestId=nextId("null-retry");await expect(f.control.retry(ctx,{taskId:f.id,requestId})).rejects.toThrow("媒体处理轮次无效");
 expect((await db.select().from(executionControlReceipts).where(eq(executionControlReceipts.idempotencyKey,`ai-deterministic-retry:${requestId}`)))).toHaveLength(0);
});

async function groupFixture(groupId:string,status="failed"){
 await db.insert(accountGroups).values({id:groupId,userId:ctx.userId,name:groupId,status:"active",version:1,createdAt:now(),updatedAt:now()}).onConflictDoNothing();
 const f=await fixture();await db.update(aiTasks).set({accountId:null,groupId,groupVersion:1,membershipVersion:null,status}).where(eq(aiTasks.id,f.id));const groupCtx:RequestContext={...ctx,accountId:null,groupId};return{...f,ctx:groupCtx};
}
it("空组原probe回执NULLaccount，同组过滤共享、跨组拒绝且冻结身份不改",async()=>{
 const f=await groupFixture("probe-group-a"),command={taskId:f.id,requestId:nextId("group-retry")},before=(await db.select().from(aiTasks).where(eq(aiTasks.id,f.id)))[0]!;
 const receipt=await f.control.retry(f.ctx,command);expect(await f.control.retry({...f.ctx,accountId:"仅筛选"},command)).toEqual(receipt);
 const rows=await db.select().from(executionControlReceipts).where(eq(executionControlReceipts.idempotencyKey,`ai-deterministic-retry:${command.requestId}`));expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({groupId:f.ctx.groupId,accountId:null,result:receipt});
 const after=(await db.select().from(aiTasks).where(eq(aiTasks.id,f.id)))[0]!;for(const field of ["inputData","attemptId","requestFingerprint","groupId","accountId","groupVersion","membershipVersion","costUsd","modelCallStartedAt"] as const)expect(after[field]).toEqual(before[field]);
 for(const other of [{...f.ctx,groupId:"foreign"},{...f.ctx,userId:"foreign"}]){await expect(f.control.retry(other,command)).rejects.toThrow();await expect(f.control.claim(other,f.id,1)).rejects.toThrow();await expect(f.control.cancel(other,f.id,1)).rejects.toThrow();await expect(f.control.recordCandidate(other,f.id,1,{resultType:"execution_manifest",resultData:{}})).rejects.toThrow();await expect(db.transaction(tx=>f.control.assertSettled(other,f.id,1,"b".repeat(64),tx))).rejects.toThrow();}
 expect(await f.control.claim({...f.ctx,accountId:"platform-filter"},f.id,1)).toBe(true);
});
it("归档只拒绝新claim/retry，原generation可结算取消且旧receipt不重排",async()=>{
 const started=await groupFixture("probe-group-archive"),queued=await groupFixture("probe-group-archive","queued"),failed=await groupFixture("probe-group-archive");const command={taskId:started.id,requestId:nextId("archive-original-retry")},receipt=await started.control.retry(started.ctx,command);await started.control.claim(started.ctx,started.id,1);
 await db.update(accountGroups).set({status:"archived"}).where(eq(accountGroups.id,started.ctx.groupId!));await expect(queued.control.claim(queued.ctx,queued.id,0)).rejects.toThrow();await expect(failed.control.retry(failed.ctx,{taskId:failed.id,requestId:nextId("archive-new-retry")})).rejects.toThrow();
 await started.control.recordStep(started.ctx,started.id,1,{stepNo:1,kind:"text",text:"原generation已开始",toolCalls:[]});await started.control.recordCandidate(started.ctx,started.id,1,{resultType:"execution_manifest",resultData:{manifest:{taskType:"media.probe",artifacts:[],summary:"原真实回执fixture",meta:{deterministicGeneration:1,probe:{probeDigest:"b".repeat(64)}}}}});
 await db.transaction(tx=>started.control.assertSettled(started.ctx,started.id,1,"b".repeat(64),tx));expect(await started.control.retry(started.ctx,command)).toEqual(receipt);expect((await db.select().from(aiTasks).where(eq(aiTasks.id,started.id)))[0]?.status).toBe("awaiting_confirmation");await started.control.cancel(started.ctx,started.id,1);expect((await db.select().from(aiTasks).where(eq(aiTasks.id,started.id)))[0]?.status).toBe("cancelled");
});
it("不同组同恢复key独立，同组不同task竞争一次，版本变更拒绝新动作",async()=>{
 const a=await groupFixture("probe-race-a"),other=await groupFixture("probe-race-a"),b=await groupFixture("probe-race-b"),key=nextId("same-group-key"),results=await Promise.allSettled([a.control.retry(a.ctx,{taskId:a.id,requestId:key}),other.control.retry(other.ctx,{taskId:other.id,requestId:key})]);expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);const rejected=results.find(r=>r.status==="rejected");if(!rejected||rejected.status!=="rejected")throw Error("应有真实失败方");expect(rejected.reason).toMatchObject({code:"ConflictError"});expect((await b.control.retry(b.ctx,{taskId:b.id,requestId:key})).generation).toBe(1);
 await db.update(accountGroups).set({version:2}).where(eq(accountGroups.id,b.ctx.groupId!));await expect(b.control.claim(b.ctx,b.id,1)).rejects.toThrow();
});

it("历史双account同group同key精确恢复原task，未知组命令不任取首行",async()=>{
 const a=await fixture(),b=await fixture(),key=nextId("legacy-shared-key"),other={...ctx,accountId:"probe-old-account-b"};await db.update(aiTasks).set({accountId:other.accountId}).where(eq(aiTasks.id,b.id));const ar=await a.control.retry(ctx,{taskId:a.id,requestId:key}),br=await b.control.retry(other,{taskId:b.id,requestId:key});
 await db.insert(accountGroups).values({id:"probe-old-shared-group",userId:ctx.userId,name:"历史组",status:"archived",version:3,createdAt:now(),updatedAt:now()});for(const task of [a,b])await db.update(aiTasks).set({groupId:"probe-old-shared-group",groupVersion:1}).where(eq(aiTasks.id,task.id));await db.update(executionControlReceipts).set({groupId:"probe-old-shared-group"}).where(eq(executionControlReceipts.idempotencyKey,`ai-deterministic-retry:${key}`));const original=await db.select().from(executionControlReceipts).where(eq(executionControlReceipts.idempotencyKey,`ai-deterministic-retry:${key}`));expect(original).toHaveLength(2);
 const groupCtx:RequestContext={...ctx,groupId:"probe-old-shared-group",accountId:null};expect(await a.control.retry(groupCtx,{taskId:a.id,requestId:key})).toEqual(ar);expect(await b.control.retry({...groupCtx,accountId:ctx.accountId},{taskId:b.id,requestId:key})).toEqual(br);expect(await db.select().from(executionControlReceipts).where(eq(executionControlReceipts.idempotencyKey,`ai-deterministic-retry:${key}`))).toEqual(original);
 const unknown=await fixture();await db.update(aiTasks).set({groupId:groupCtx.groupId,groupVersion:3,accountId:null}).where(eq(aiTasks.id,unknown.id));await expect(unknown.control.retry(groupCtx,{taskId:unknown.id,requestId:key})).rejects.toThrow("原真实任务");expect((await db.select().from(aiTasks).where(eq(aiTasks.id,unknown.id)))[0]?.status).toBe("failed");
});

it("实际旧账号协议任务仅回填legacy组后仍可claim与原账号恢复，不补写冻结版本",async()=>{
 const accountId=nextId("migrated-old-account"),groupId=`grp_legacy_${accountId}`,f=await fixture();
 await db.insert(platformAccounts).values({id:accountId,userId:ctx.userId,platform:"douyin",accountHandle:"旧原账号",status:"active",createdAt:now(),updatedAt:now()});
 await db.insert(accountGroups).values({id:groupId,userId:ctx.userId,name:"原账号迁移组",status:"active",version:2,createdAt:now(),updatedAt:now()});
 await db.insert(accountGroupMemberships).values({id:nextId("legacy-member"),userId:ctx.userId,accountId,groupId,version:4,joinedAt:now()});
 // fixture使用c5316506原createTask canonical请求与key；随后模拟0128仅backfill group_id，不是当前membership重签。
 const attemptId=`original-attempt-${f.id}`,requestFingerprint=`sha256:${createHash("sha256").update(canonicalJson({userId:ctx.userId,accountId,taskType:"exec.media.probe",inputData:f.inputData,retryOfTaskId:null})).digest("hex")}`;
 await db.update(aiTasks).set({accountId,groupId,groupVersion:null,membershipVersion:null,status:"queued",attemptId,requestFingerprint,idempotencyKey:`${accountId}:exec.media.probe:${attemptId}`}).where(eq(aiTasks.id,f.id));
 const original=(await db.select().from(aiTasks).where(eq(aiTasks.id,f.id)))[0]!,originalCtx={...ctx,accountId,groupId};expect(await f.control.claim(originalCtx,f.id,0)).toBe(true);await f.control.markFailed(originalCtx,f.id,0,"原探针失败");
 const command={taskId:f.id,requestId:nextId("old-migrated-retry")},receipt=await f.control.retry(originalCtx,command);expect(receipt).toEqual({taskId:f.id,generation:1});expect(await f.control.claim(originalCtx,f.id,1)).toBe(true);await f.control.markFailed(originalCtx,f.id,1,"再次失败");
 const rows=await db.select().from(executionControlReceipts).where(eq(executionControlReceipts.idempotencyKey,`ai-deterministic-retry:${command.requestId}`));expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({userId:ctx.userId,accountId,groupId,result:receipt});
 const after=(await db.select().from(aiTasks).where(eq(aiTasks.id,f.id)))[0]!;for(const field of ["userId","accountId","groupId","groupVersion","membershipVersion","attemptId","requestFingerprint","inputData","idempotencyKey","costUsd","modelCallStartedAt"] as const)expect(after[field]).toEqual(original[field]);
 await db.update(accountGroups).set({status:"archived"}).where(eq(accountGroups.id,groupId));expect(await f.control.retry(originalCtx,command)).toEqual(receipt);await expect(f.control.retry(originalCtx,{taskId:f.id,requestId:nextId("archived-old-retry")})).rejects.toThrow();
});

it("新组冻结版本损坏与未知legacy出处不被NULL版本适配豁免",async()=>{
 const f=await groupFixture("probe-missing-new-freeze","queued");await db.update(aiTasks).set({groupVersion:null}).where(eq(aiTasks.id,f.id));await expect(f.control.claim(f.ctx,f.id,0)).rejects.toThrow();
 const old=await fixture();await db.update(aiTasks).set({groupId:`grp_legacy_${ctx.accountId}`,groupVersion:null,membershipVersion:null,status:"queued"}).where(eq(aiTasks.id,old.id));await expect(old.control.claim({...ctx,groupId:`grp_legacy_${ctx.accountId}`},old.id,0)).rejects.toThrow();expect((await db.select().from(aiTasks).where(eq(aiTasks.id,old.id)))[0]?.status).toBe("queued");
});

it("现代组两个真实账号的原probe同恢复key竞争一次，组回执统一NULLaccount",async()=>{
 const groupId=nextId("modern-real-member-group"),accounts=[nextId("modern-account"),nextId("modern-account")];await db.insert(accountGroups).values({id:groupId,userId:ctx.userId,name:"现代真实成员组",status:"active",version:2,createdAt:now(),updatedAt:now()});
 const tasks=[];for(const accountId of accounts){await db.insert(platformAccounts).values({id:accountId,userId:ctx.userId,platform:"douyin",accountHandle:accountId,status:"active",createdAt:now(),updatedAt:now()});await db.insert(accountGroupMemberships).values({id:nextId("modern-member"),userId:ctx.userId,accountId,groupId,version:3,joinedAt:now()});const f=await fixture(),attemptId=`modern-attempt-${f.id}`,requestFingerprint=`sha256:${createHash("sha256").update(canonicalJson({userId:ctx.userId,accountId,groupId,taskType:"exec.media.probe",inputData:f.inputData,retryOfTaskId:null})).digest("hex")}`;await db.update(aiTasks).set({accountId,groupId,groupVersion:2,membershipVersion:3,attemptId,requestFingerprint,idempotencyKey:`group:${groupId}:exec.media.probe:${attemptId}`}).where(eq(aiTasks.id,f.id));tasks.push({...f,ctx:{...ctx,accountId,groupId}});}
 const requestId=nextId("modern-group-duplicate-key"),results=await Promise.allSettled(tasks.map(f=>f.control.retry(f.ctx,{taskId:f.id,requestId})));expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);expect(results.filter(r=>r.status==="rejected")).toHaveLength(1);
 const receipts=await db.select().from(executionControlReceipts).where(eq(executionControlReceipts.idempotencyKey,`ai-deterministic-retry:${requestId}`));expect(receipts).toHaveLength(1);expect(receipts[0]).toMatchObject({userId:ctx.userId,groupId,accountId:null});const winner=results.find(r=>r.status==="fulfilled");if(!winner||winner.status!=="fulfilled")throw Error("缺少真实winner");const f=tasks.find(t=>t.id===winner.value.taskId)!;expect(await f.control.retry({...f.ctx,accountId:accounts.find(a=>a!==f.ctx.accountId)!},{taskId:f.id,requestId})).toEqual(winner.value);expect((await db.select().from(aiTasks).where(eq(aiTasks.id,f.id)))[0]).toMatchObject({accountId:f.ctx.accountId,groupId,groupVersion:2,membershipVersion:3});
});
