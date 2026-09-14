import {it,expect,vi} from 'vitest';
import {AsyncLocalStorage} from 'node:async_hooks';
import {scheduledFlywheelTaskInputSchema} from '@creatoros/contract/execution-worker';
import {createCollectionExecution} from './collection-execution';
const ctx={userId:'u',accountId:'a',requestId:'r',source:'ingestion' as const};
const task={id:'t',taskType:'scheduled.self.traffic',inputData:{jobId:'j',jobRunId:'r'}};
function fixture(bound=false){
 let status='queued';
 const updateRun=vi.fn(async()=>({}));const markFailed=vi.fn(async()=>{status='failed';});
 const wake=vi.fn();
 const ports={scheduledCollectors:{},scheduledSignals:new AsyncLocalStorage<AbortSignal>(),flywheelSourceKinds:new Set(['self.traffic']),
 scheduledFlywheel:{prepare:async()=>{scheduledFlywheelTaskInputSchema.parse({kind:'scheduled.flywheel',sourceKind:'self.traffic',jobId:'j',jobRunId:'r',target:{},skillSnapshot:null});throw new Error('unreachable');}},
 schedulingService:{getRun:vi.fn(async()=>({id:'r',aiTaskId:'t',jobId:'j',status:'running'})),updateRun},
 aiService:{getTask:async()=>({status,...(bound?{executionTaskId:'e'}:{})}),markFailed},
 deps:{now:()=> '2026-09-11T00:00:00.000Z'},wakeScheduledFlywheel:wake,prepareDailyTopic:async()=>({executionTaskId:'e'}),runTaskWithEffectiveSkillSnapshot:async()=>{},isNotLoggedInError:()=>false};
 return {runner:createCollectionExecution(ports as unknown as Parameters<typeof createCollectionExecution>[0]),updateRun,markFailed,wake,ports};
}
it('公开dispatch的真实契约异常结算原task和run，并保留拒绝供入口显示',async()=>{
 const f=fixture();await expect(f.runner.dispatchScheduledCollection(ctx,task)).rejects.toThrow();
 expect(f.markFailed).toHaveBeenCalledWith(ctx,'t',expect.stringContaining('采集准备失败'));
 expect(f.updateRun).toHaveBeenCalledWith(ctx,'r',expect.objectContaining({status:'failed'}));expect(f.wake).not.toHaveBeenCalled();
});
it('准备重入发现已绑定执行权，不覆盖该任务或运行',async()=>{
 const f=fixture(true);await expect(f.runner.dispatchScheduledCollection(ctx,task)).rejects.toThrow();expect(f.markFailed).not.toHaveBeenCalled();expect(f.updateRun).not.toHaveBeenCalled();
});
it('不结算其它任务的run',async()=>{
 const f=fixture();f.ports.schedulingService.getRun.mockResolvedValue({id:'r',aiTaskId:'another',jobId:'j',status:'running'});
 await expect(f.runner.dispatchScheduledCollection(ctx,task)).rejects.toThrow('归属');expect(f.updateRun).not.toHaveBeenCalled();
});

it('真实持久恢复入口：无内存jobRunId的prepare失败同步原run和冻结队列，不伤新请求',async()=>{
 const {createDb,aiTasks,eq,jobRuns}=await import('@creatoros/backend');
 const {publications}=await import('../../schema/publishing');
 const {publicationTraffic}=await import('../../schema/analytics');
 const {createTrafficRepository}=await import('../../modules/analytics/traffic.repository');
 const {createSchedulingService}=await import('../../modules/scheduling/scheduling.service');
 const {createScheduledFlywheelExecutionService}=await import('../../modules/ai-runtime/scheduled-flywheel-execution.service');
 const f=await createDb();let seq=0;const stamp='2026-09-11T00:00:00.000Z',later='2026-09-11T01:00:00.000Z';const now=()=>stamp;
 const service=createScheduledFlywheelExecutionService(f.db,{entryPath:'/never-start',resolveModelSpec:async()=>{throw new Error('no model');},budget:{maxCalls:1,maxTokens:1,deadlineMs:60000},now});
 try{
  const scheduling=createSchedulingService({db:f.db,now,nextId:p=>`${p}-${++seq}`});
  const job=await scheduling.createJob(ctx,{name:'流量',sourceKind:'self.traffic',schedule:'0 0 * * *',systemManaged:true});
  await f.db.insert(aiTasks).values({id:'recover-task',userId:ctx.userId,accountId:ctx.accountId,taskType:'scheduled.self.traffic',inputData:{jobId:job.id,target:{},scheduledRun:{version:1,scheduledFor:null}},runtimeData:{skillSnapshot:null},idempotencyKey:'recover-task',requestedAt:stamp});
  const run=await scheduling.createRun(ctx,{jobId:job.id,aiTaskId:'recover-task'});
  await f.db.insert(publications).values(['old','new'].map(id=>({id,userId:ctx.userId,accountId:ctx.accountId,platform:'douyin',externalId:id,contentOutputId:'output',accountReference:'a',status:'published',createdAt:stamp,updatedAt:stamp})));
  const queue=createTrafficRepository(f.db);await queue.enqueue('u','a','old','old',stamp,true);await queue.enqueue('u','a','new','new',stamp,true);
  const savedData={app:'抖音 App',windowLabel:null,complete:true,entries:[{label:'推荐页',percentage:95}]};
  await f.db.update(publicationTraffic).set({data:savedData,capturedAt:stamp}).where(eq(publicationTraffic.publicationId,'old'));
  const getTask=async()=>{const [row]=await f.db.select().from(aiTasks).where(eq(aiTasks.id,'recover-task'));return row!;};
  const ports={scheduledCollectors:{},scheduledSignals:new AsyncLocalStorage<AbortSignal>(),flywheelSourceKinds:new Set(['self.traffic']),scheduledFlywheel:service,schedulingService:scheduling,
   aiService:{getTask,markFailed:async()=>{await f.db.update(aiTasks).set({status:'failed'}).where(eq(aiTasks.id,'recover-task'));}},
   trafficQueue:{snapshot:async()=>{const rows=await queue.pending('u','a',20);await f.db.update(publicationTraffic).set({requestedAt:later}).where(eq(publicationTraffic.publicationId,'new'));return rows;},fail:async(_c:unknown,rows:Parameters<typeof queue.failPending>[2],message:string)=>queue.failPending('u','a',rows,stamp,message)},
   deps:{now},wakeScheduledFlywheel:vi.fn(),prepareDailyTopic:async()=>({executionTaskId:'never'}),runTaskWithEffectiveSkillSnapshot:async()=>{},isNotLoggedInError:()=>false};
  const execution=createCollectionExecution(ports as unknown as Parameters<typeof createCollectionExecution>[0]);
  await expect(execution.recoverQueuedCollection()).rejects.toThrow('部分旧采集任务未能恢复');
  expect(await getTask()).toMatchObject({status:'failed',executionTaskId:null});
  expect((await f.db.select().from(jobRuns).where(eq(jobRuns.id,run.id)))[0]).toMatchObject({status:'failed'});
  const rows=await queue.list('u','a',['old','new']);expect(rows.find(r=>r.publicationId==='old')).toMatchObject({status:'failed',data:savedData,capturedAt:stamp});expect(rows.find(r=>r.publicationId==='new')).toMatchObject({status:'pending',requestedAt:later});
 }finally{await service.stop();await f.client.close();}
});
