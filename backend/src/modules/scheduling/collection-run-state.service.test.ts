import {afterAll,beforeAll,expect,it} from 'vitest';
import {createDb,aiTasks,executionTasks,jobRuns,scheduledJobs,eq,type Db} from '@creatoros/backend';
import {createCollectionRunStateService} from './collection-run-state.service';
const ctx={userId:'collection-user',accountId:'collection-account',requestId:'test',source:'ingestion' as const};
const now=()=> '2026-09-14T15:00:00.000Z';
const stale='自动化运行超时且无活跃执行(stale-run):该 run 仍悬挂在 running,标记为 failed';
let db:Db,close:()=>Promise<void>,seq=0;
beforeAll(async()=>{const f=await createDb();db=f.db;close=()=>f.client.close();});
afterAll(async()=>close?.());
async function fixture(status='running',options:{accountId?:string;userId?:string;combined?:boolean;sourceKind?:string}={}){
 const scope={...ctx,...options},id=`collect-${++seq}`,runId=`run-${seq}`,executionId=`exec-${seq}`,sourceKind=options.sourceKind??'self.metrics',jobId=`job-${scope.userId}-${scope.accountId}-${sourceKind}`;
 const target=options.combined?{operationsSync:{version:1,capabilities:{metrics:true,content:true,comments:true,traffic:true}}}:{};
 await db.insert(scheduledJobs).values({id:jobId,userId:scope.userId,accountId:scope.accountId,sourceKind,name:'作品指标',prompt:'',target:{},schedule:'0 */2 * * *',enabled:true,createdAt:now(),updatedAt:now()}).onConflictDoNothing();
 await db.insert(executionTasks).values({id:executionId,userId:scope.userId,accountId:scope.accountId,kind:'ai_task',ownerType:'ai_task',ownerId:id,status,idempotencyKey:id,payload:{aiTaskId:id,modelInput:{kind:'scheduled.flywheel',sourceKind,jobId,jobRunId:runId,target}},createdAt:now(),updatedAt:now(),executionBudget:{maxCalls:100},deadlineAt:'2026-10-01T00:00:00.000Z'});
 await db.insert(aiTasks).values({id,executionTaskId:executionId,userId:scope.userId,accountId:scope.accountId,taskType:`scheduled.${sourceKind}`,status:'running',inputData:{jobId,target},idempotencyKey:id,requestedAt:'2026-09-12T00:00:00.000Z'});
 await db.insert(jobRuns).values({id:runId,userId:scope.userId,jobId,aiTaskId:id,status:'running',startedAt:'2026-09-12T00:00:00.000Z',itemsNew:6,itemsUpdated:15,progress:{stage:'traffic',processed:13,total:20}});
 return {id,jobId,runId,executionId,scope,service:createCollectionRunStateService(db,{now})};
}
async function run(id:string){return (await db.select().from(jobRuns).where(eq(jobRuns.id,id)))[0]!;}
it.each(['running','queued','retry_wait','waiting_user','unknown_result','paused','blocked','pause_requested','cancel_requested'])('持久采集 %s 超过两天仍受保护，不改执行账本',async state=>{
 const f=await fixture(state),before=(await db.select().from(executionTasks).where(eq(executionTasks.id,f.executionId)))[0];
 expect((await f.service.syncExecutionRuns(ctx)).activeAiTaskIds).toContain(f.id);
 expect((await run(f.runId)).status).toBe('running');
 expect((await db.select().from(executionTasks).where(eq(executionTasks.id,f.executionId)))[0]).toEqual(before);
});
it('仅修复真实仍活跃的明确 stale-run 误判，保留进度和统计且幂等',async()=>{
 const f=await fixture('queued');
 await db.update(jobRuns).set({status:'failed',error:stale,finishedAt:now()}).where(eq(jobRuns.id,f.runId));
 expect((await f.service.syncExecutionRuns(ctx)).activeAiTaskIds).toContain(f.id);
 expect(await run(f.runId)).toMatchObject({status:'running',error:null,finishedAt:null,itemsNew:6,itemsUpdated:15,progress:{stage:'traffic',processed:13,total:20}});
 await f.service.syncExecutionRuns(ctx);expect((await run(f.runId)).status).toBe('running');
 const real=await fixture('running');await db.update(jobRuns).set({status:'failed',error:'页面已关闭',finishedAt:now()}).where(eq(jobRuns.id,real.runId));
 await real.service.syncExecutionRuns(ctx);expect((await run(real.runId)).status).toBe('failed');
});
it.each(['failed','cancelled','partial'])('真实执行 %s 只同步运行投影，保留采集结果',async status=>{
 const f=await fixture(status);expect((await f.service.syncExecutionRuns(ctx)).finalized).toBeGreaterThanOrEqual(1);
 expect(await run(f.runId)).toMatchObject({status:'failed',itemsNew:6,itemsUpdated:15,progress:{stage:'traffic',processed:13,total:20}});
 expect((await f.service.syncExecutionRuns(ctx)).finalized).toBe(0);
 const [e]=await db.select().from(executionTasks).where(eq(executionTasks.id,f.executionId));expect(e!.status).toBe(status);
});
it('成功缺回执及错误绑定只报告不一致，避免清理器伪造失败',async()=>{
 const success=await fixture('succeeded');let report=await success.service.syncExecutionRuns(ctx);
 expect(report.inconsistencies).toContainEqual(expect.objectContaining({jobRunId:success.runId}));expect(report.activeAiTaskIds).toContain(success.id);
 const bad=await fixture('failed');await db.update(executionTasks).set({ownerId:'wrong'}).where(eq(executionTasks.id,bad.executionId));
 report=await bad.service.syncExecutionRuns(ctx);expect(report.inconsistencies).toContainEqual(expect.objectContaining({jobRunId:bad.runId}));expect((await run(bad.runId)).status).toBe('running');
});
it('同步严格隔离用户和指定账号，无账号系统调用可遍历本人账号，不处理daily',async()=>{
 const f=await fixture('failed',{accountId:'other-account'}),daily=await fixture('failed',{sourceKind:'topic.daily'});
 await f.service.syncExecutionRuns(ctx);expect((await run(f.runId)).status).toBe('running');
 await f.service.syncExecutionRuns({...ctx,userId:'other-user',accountId:undefined});expect((await run(f.runId)).status).toBe('running');
 await f.service.syncExecutionRuns({...ctx,accountId:undefined});expect((await run(f.runId)).status).toBe('failed');expect((await run(daily.runId)).status).toBe('running');
});
