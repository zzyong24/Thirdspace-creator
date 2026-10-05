import {afterAll,beforeAll,expect,it} from "vitest";
import {createDb,aiTasks,aiTaskResults,executionControlReceipts,eq,type Db} from "@creatoros/backend";
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
 expect(toTaskDto(row)).toMatchObject({id:f.id,status:"failed"});expect(toTaskDto(row).deterministicGeneration).toBeUndefined();
 await expect(f.control.retry(ctx,{taskId:f.id,requestId:nextId("corrupt-retry")})).rejects.toThrow("媒体处理轮次无效");
 expect((await db.select().from(executionControlReceipts).where(eq(executionControlReceipts.idempotencyKey,`ai-deterministic-retry:corrupt-retry-${seq}`)))).toHaveLength(0);
});

it("显式null轮次不冒充历史缺字段0，列表保留损坏任务且恢复零写",async()=>{
 const f=await fixture();await db.update(aiTasks).set({runtimeData:{probeRunGeneration:null}}).where(eq(aiTasks.id,f.id));
 const [row]=await db.select().from(aiTasks).where(eq(aiTasks.id,f.id));expect(toTaskDto(row).deterministicGeneration).toBeUndefined();
 const requestId=nextId("null-retry");await expect(f.control.retry(ctx,{taskId:f.id,requestId})).rejects.toThrow("媒体处理轮次无效");
 expect((await db.select().from(executionControlReceipts).where(eq(executionControlReceipts.idempotencyKey,`ai-deterministic-retry:${requestId}`)))).toHaveLength(0);
});
