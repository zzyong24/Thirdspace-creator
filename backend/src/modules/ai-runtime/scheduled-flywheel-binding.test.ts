import {listOfficialSkillBases} from '@creatoros/ai-worker';
import {createEffectiveSkillSnapshotResolver,requiredSkillIdsForTask} from './effective-skill-snapshot';
import {beforeEach,afterEach,it,expect} from 'vitest';
import {createDb,aiTasks,executionTasks,eq,jobRuns,scheduledJobs,type Db} from '@creatoros/backend';
import {createSchedulingService} from '../scheduling/scheduling.service';
import {runScheduledCollection} from './scheduled-collection-runner';
import {triggerScheduledJob} from './scheduled-collection-scheduler';
import {createScheduledFlywheelExecutionService,type ScheduledFlywheelCollector} from './scheduled-flywheel-execution.service';
import {createPersistentTaskService} from '../execution/persistent-task.service';
import {createExecutionLeaseService} from '../execution/execution-lease.service';
import {bindScheduledFlywheel} from '../execution/scheduled-flywheel-binding';
const ctx={userId:'t951-user',accountId:'t951-account',requestId:'t951',source:'user' as const};
let tick=0;const now=()=> new Date(Date.parse('2026-09-11T01:00:00.000Z')+tick).toISOString();let db:Db,close:()=>Promise<void>,seq=0;
const nextId=(p:string)=>`${p}-t951-${++seq}`;
beforeEach(async()=>{tick=0;const r=await createDb();db=r.db;close=()=>r.client.close();});afterEach(async()=>close?.());
const deps={entryPath:'/never-start-a-worker-for-prepare',resolveModelSpec:async()=>{throw new Error('no model in binding test');},budget:{maxCalls:4,maxTokens:1000,deadlineMs:60000},now};
it('一个旧任务恢复失败不会阻止队列里的下一个账号任务准备',async()=>{
 const service=createScheduledFlywheelExecutionService(db,deps);const seen:string[]=[];
 await db.insert(aiTasks).values(['old-invalid','next-valid'].map((id,i)=>({id,userId:ctx.userId,accountId:ctx.accountId,taskType:'scheduled.self.metrics',idempotencyKey:id,requestedAt:new Date(Date.parse(now())+i).toISOString()})));
 try{
  await expect(service.recoverQueued(async()=>{throw new Error('旧任务已记失败');},async(_c,id)=>{seen.push(id);if(id==='old-invalid')throw new Error('missing snapshot');})).rejects.toThrow();
  expect(seen).toEqual(['old-invalid','next-valid']);
 }finally{await service.stop();}
});
async function trigger(sourceKind:string,skipHeavyBackfill=false,defer=false,recoverBeforeRun=false){
 const scheduling=createSchedulingService({db,now,nextId}),service=createScheduledFlywheelExecutionService(db,deps);
 const [job]=await db.insert(scheduledJobs).values({id:nextId('job'),userId:ctx.userId,accountId:ctx.accountId,name:'采集',sourceKind,schedule:'40 9 * * *',target:{source:'fixture'},createdAt:now(),updatedAt:now()}).returning();
 if(!job)throw new Error('fixture job missing');
 const result=await triggerScheduledJob(ctx,{id:job.id,sourceKind,target:{source:'fixture'},accountId:ctx.accountId},{now,ai:{createTask:async(c,input)=>{
  const id=nextId('task');await db.insert(aiTasks).values({id,userId:c.userId,accountId:c.accountId!,taskType:input.taskType,inputData:input.inputData,idempotencyKey:id,requestFingerprint:'sha256:'+'a'.repeat(64),requestedAt:now(),runtimeData:{skillSnapshot:await createEffectiveSkillSnapshotResolver({officialSkills:{get:id=>listOfficialSkillBases().find(base=>base.skillId===id)??null,list:()=>listOfficialSkillBases(),platformPolicy:()=>({version:'1',text:'binding fixture policy'})},accountOverlays:{listBySkillIds:async()=>[]},now})(c,requiredSkillIdsForTask(input.taskType,input.inputData ?? {}))}});return {id,status:'queued'};
 }},runs:{...scheduling,createRun:async(c,input)=>{
  if(recoverBeforeRun){
   await service.recoverQueued(async(_c,id)=>{await db.update(aiTasks).set({status:'failed'}).where(eq(aiTasks.id,id));});
   const existing=await db.select().from(jobRuns).where(eq(jobRuns.aiTaskId,input.aiTaskId!));
   expect(existing).toHaveLength(1);
   return service.ensureRunForTask(c,input.aiTaskId!);
  }
  return scheduling.createRun(c,input);
 }},dispatch:(c,t)=>defer?Promise.resolve({executionTaskId:"deferred-fixture"}):service.prepare(c,t.id)},{skipHeavyBackfill});
 return {result,service,scheduling,job};
}
it.each(['self.metrics','self.detail','self.traffic','comments','benchmark','favorites'])('真实trigger落库后prepare与claim保持真实run绑定：%s',async kind=>{
 const f=await trigger(kind,true);await f.result.completion;
 const [task]=await db.select().from(aiTasks).where(eq(aiTasks.id,f.result.aiTaskId));if(!task)throw new Error('fixture task missing');expect(task.executionTaskId).toBeTruthy();if(kind==='self.traffic'||kind==='comments')expect((task.runtimeData as {skillSnapshot:{skills:unknown[]}}).skillSnapshot.skills).toEqual([]);
 const [execution]=await db.select().from(executionTasks).where(eq(executionTasks.id,task.executionTaskId!));if(!execution)throw new Error('fixture execution missing');expect(execution.payload).toMatchObject({modelInput:{jobRunId:f.result.jobRunId,target:{__skipHeavyBackfill:true}}});
 await f.service.drain((c,t,scope)=>runScheduledCollection(c,t,{ai:scope.ai,runs:f.scheduling,isNotLoggedInError:()=>false,collectors:{[kind]:async(_c,target)=>{expect(target.__skipHeavyBackfill).toBe(true);return {itemsNew:1200,itemsUpdated:0};}},now}),1);
 const run=await f.scheduling.getRun(ctx,f.result.jobRunId);expect(run).toMatchObject({status:'succeeded',itemsNew:1200});
 const [finished]=await db.select().from(executionTasks).where(eq(executionTasks.id,execution.id));expect(finished?.status).toBe('succeeded');
 await f.service.stop();
});
it('跨账号准备及已冻结run被篡改时拒绝',async()=>{
 const f=await trigger('self.metrics');await f.result.completion;
 await expect(f.service.prepare({...ctx,accountId:'another'},f.result.aiTaskId)).rejects.toThrow();
 // 已冻结任务的run被换到错误任务时，运行阶段仍拒绝。
 const [task]=await db.select().from(aiTasks).where(eq(aiTasks.id,f.result.aiTaskId));
 if(!task?.executionTaskId)throw new Error("fixture binding missing");
 {await db.update(jobRuns).set({aiTaskId:'other'}).where(eq(jobRuns.id,f.result.jobRunId));const claim=await createPersistentTaskService(db,{now}).claimTask({taskId:task.executionTaskId,workerId:'fixture'});await expect(createExecutionLeaseService(db,{now}).withLease({executionTaskId:task.executionTaskId,attempt:claim!.lease.attempt,fenceToken:claim!.lease.fenceToken},'admission',bindScheduledFlywheel)).rejects.toThrow();}
 await f.service.stop();
});

it.each(['missing','duplicate','forged'])('运行绑定%s时不能绑定执行',async mode=>{
 const f=await trigger('self.metrics',false,true);await f.result.completion;
 if(mode==='missing'){await db.delete(jobRuns).where(eq(jobRuns.id,f.result.jobRunId));await db.update(aiTasks).set({inputData:{jobId:f.job.id,target:{source:'fixture'}}}).where(eq(aiTasks.id,f.result.aiTaskId));}
 if(mode==='duplicate')await f.scheduling.createRun(ctx,{jobId:f.job.id,aiTaskId:f.result.aiTaskId});
 if(mode==='forged')await db.update(aiTasks).set({inputData:{jobId:f.job.id,jobRunId:'forged',target:{source:'fixture'}}}).where(eq(aiTasks.id,f.result.aiTaskId));
 await expect(f.service.prepare(ctx,f.result.aiTaskId)).rejects.toThrow();
 const [task]=await db.select().from(aiTasks).where(eq(aiTasks.id,f.result.aiTaskId));expect(task?.executionTaskId).toBeNull();await f.service.stop();
});

it.each(['self.metrics','self.detail','self.traffic','comments','benchmark','favorites'])('恢复器在task创建与run落库之间执行，不误杀原任务：%s',async kind=>{
 const f=await trigger(kind,false,false,true);await f.result.completion;
 const [task]=await db.select().from(aiTasks).where(eq(aiTasks.id,f.result.aiTaskId));
 expect(task?.status).not.toBe('failed');expect(task?.executionTaskId).toBeTruthy();
 expect(await db.select().from(jobRuns).where(eq(jobRuns.aiTaskId,f.result.aiTaskId))).toHaveLength(1);
 await f.service.stop();
});
it('采集器意外抛错时同时收口run，下一次合法采集不被假运行中阻断',async()=>{
 const f=await trigger('self.metrics');await f.result.completion;
 await f.scheduling.updateRun(ctx,f.result.jobRunId,{itemsNew:3});
 await f.service.drain(async()=>{throw new Error('fixture collector unavailable');},1);
 const run=await f.scheduling.getRun(ctx,f.result.jobRunId);
 expect(run).toMatchObject({status:'failed',itemsNew:3});expect(run.finishedAt).toBeTruthy();
 await f.service.stop();
});

it('带冻结意图的孤儿任务并发补建只返回同一run，篡改时刻拒绝',async()=>{
 const f=await trigger('self.metrics',false,true);await f.result.completion;
 await db.delete(jobRuns).where(eq(jobRuns.id,f.result.jobRunId));
 const recovered=await Promise.all(Array.from({length:4},()=>f.service.ensureRunForTask(ctx,f.result.aiTaskId)));
 expect(new Set(recovered.map(run=>run.id)).size).toBe(1);
 expect(await db.select().from(jobRuns).where(eq(jobRuns.aiTaskId,f.result.aiTaskId))).toHaveLength(1);
 await db.update(jobRuns).set({scheduledFor:'2026-09-11T00:00:00.000Z'}).where(eq(jobRuns.id,recovered[0]!.id));
 await expect(f.service.prepare(ctx,f.result.aiTaskId)).rejects.toThrow();
 await f.service.stop();
});
it('孤儿任务带不存在的显式run引用时不补造新run',async()=>{
 const f=await trigger('self.metrics',false,true);await f.result.completion;
 await db.delete(jobRuns).where(eq(jobRuns.id,f.result.jobRunId));
 await db.update(aiTasks).set({inputData:{jobId:f.job.id,jobRunId:'missing',target:{},scheduledRun:{version:1,scheduledFor:null}}}).where(eq(aiTasks.id,f.result.aiTaskId));
 await expect(f.service.prepare(ctx,f.result.aiTaskId)).rejects.toThrow();
 expect(await db.select().from(jobRuns).where(eq(jobRuns.aiTaskId,f.result.aiTaskId))).toHaveLength(0);
 await f.service.stop();
});
it('最终回填端口异常时，已完成执行的运行记录仍能结束',async()=>{
 const f=await trigger('self.metrics');await f.result.completion;
 await f.service.drain((c,t,scope)=>runScheduledCollection(c,t,{ai:scope.ai,runs:{updateRun:async()=>{throw new Error('fixture final projection failed');}},isNotLoggedInError:()=>false,collectors:{'self.metrics':async()=>({itemsNew:0,itemsUpdated:0})},now}),1);
 expect(await f.scheduling.getRun(ctx,f.result.jobRunId)).toMatchObject({status:'succeeded',finishedAt:now()});
 await f.service.stop();
});

it.each(['self.traffic','self.metrics'])('%s 跨多批、等待登录、暂停和进程恢复仍使用原任务',async(kind)=>{
 const f=await trigger(kind);await f.result.completion;
 const tasks=createPersistentTaskService(db,{now});
 const [task]=await db.select().from(aiTasks).where(eq(aiTasks.id,f.result.aiTaskId));
 const id=task!.executionTaskId!;let batches=0;
 const collect:ScheduledFlywheelCollector=async(c,t,scope)=>runScheduledCollection(c,t,{ai:scope.ai,runs:f.scheduling,isNotLoggedInError:(e)=>e instanceof Error&&e.message==='login',collectors:{[kind]:async()=>{batches++;if(batches===5)throw new Error('login');return {itemsNew:0,itemsUpdated:batches*20,countMode:'cumulative',continueCollection:batches<8};}},now});
 for(let i=0;i<5;i++){expect(await f.service.drain(collect,1)).toBe(1);tick+=3000;}
 expect((await tasks.get(ctx,id)).runtimeStatus).toBe('waiting_user');
 await tasks.command(ctx,{taskIds:[id],command:'resume',idempotencyKey:'login-restored'});
 await tasks.command(ctx,{taskIds:[id],command:'pause',idempotencyKey:'pause-between-batches'});
 expect(await f.service.drain(collect,1)).toBe(0);
 await tasks.command(ctx,{taskIds:[id],command:'resume',idempotencyKey:'resume-batches'});
 await f.service.stop();
 const restarted=createScheduledFlywheelExecutionService(db,deps);
 for(let i=0;i<3;i++){tick+=3000;expect(await restarted.drain(collect,1)).toBe(1);}
 expect((await tasks.get(ctx,id)).status).toBe('succeeded');
 expect((await tasks.get(ctx,id)).attempt).toBeGreaterThan(4);
 expect(await f.scheduling.getRun(ctx,f.result.jobRunId)).toMatchObject({status:'succeeded',aiTaskId:task!.id,itemsUpdated:160});
 await restarted.stop();
});
it('纯补采空snapshot仍核对快照归属，其他采集不允许空Skill',async()=>{
 const traffic=await trigger('self.traffic',false,true);await traffic.result.completion;
 const [task]=await db.select().from(aiTasks).where(eq(aiTasks.id,traffic.result.aiTaskId));
 const runtime=task!.runtimeData as {skillSnapshot:Record<string,unknown>};
 await db.update(aiTasks).set({runtimeData:{...runtime,skillSnapshot:{...runtime.skillSnapshot,accountId:'foreign'}}}).where(eq(aiTasks.id,task!.id));
 await expect(traffic.service.prepare(ctx,task!.id)).rejects.toThrow('授权快照');await traffic.service.stop();
 const model=await trigger('self.metrics',false,true);await model.result.completion;
 const [modelTask]=await db.select().from(aiTasks).where(eq(aiTasks.id,model.result.aiTaskId));
 const modelRuntime=modelTask!.runtimeData as {skillSnapshot:Record<string,unknown>};
 await db.update(aiTasks).set({runtimeData:{...modelRuntime,skillSnapshot:{...modelRuntime.skillSnapshot,skills:[]}}}).where(eq(aiTasks.id,modelTask!.id));
 await expect(model.service.prepare(ctx,modelTask!.id)).rejects.toThrow();
 expect((await db.select().from(aiTasks).where(eq(aiTasks.id,modelTask!.id)))[0]?.executionTaskId).toBeNull();await model.service.stop();
});
it.each(['self.traffic','self.metrics'])('%s真实1005作品队列遇共享锁只读一次，原执行退避60秒后续采',async kind=>{
 const {publications}=await import('../../schema/publishing');
 const {createTrafficService}=await import('../analytics/traffic.service');
 const {createTrafficCollector}=await import('../../application/collection/traffic');
 const {createOperationsSyncCollector}=await import('../../application/collection/operations-sync');
 const f=await trigger(kind);await f.result.completion;
 const [task]=await db.select().from(aiTasks).where(eq(aiTasks.id,f.result.aiTaskId));const executionId=task!.executionTaskId!;
 const pubs=Array.from({length:1005},(_,i)=>({id:`traffic-${i.toString().padStart(4,'0')}`,userId:ctx.userId,accountId:ctx.accountId,externalId:`v${i}`,platform:'douyin',hiddenAt:null,status:'published',contentOutputId:'out',accountReference:'account',createdAt:now(),updatedAt:now()}));
 await db.insert(publications).values(pubs);
 const service=createTrafficService(db,{now,publishing:{getPublication:async(_c:unknown,id:string)=>pubs.find(p=>p.id===id)!,listPublicationIdsByProject:async()=>pubs.map(p=>p.id),listPublicationsForUser:async(_c:unknown,p:{limit:number;offset:number})=>pubs.slice(p.offset,p.offset+p.limit)} as never});
 await service.enqueueVisible(ctx);
 const data={app:'抖音 App' as const,windowLabel:null,complete:true,entries:[{label:'推荐页',percentage:95}]};
 const [first]=await service.pending(ctx);await service.settle(ctx,first!,{data},task!.id);
 let busy=true,reads=0;
 const traffic=createTrafficCollector({service,read:async()=>{reads++;if(busy)throw Object.assign(new Error('profile occupied'),{code:'BROWSER_PROFILE_BUSY'});return data;},checkSignal:()=>{},isNotLoggedIn:()=>false});
 const noop=async()=>({itemsNew:0,itemsUpdated:0});
 const unified=createOperationsSyncCollector({metrics:noop,comments:noop,traffic,checkSignal:()=>{},isNotLoggedIn:()=>false});
 const collector=kind==='self.metrics'?((c:Parameters<typeof traffic>[0],target:Record<string,unknown>,report:Parameters<typeof traffic>[2],execution:Parameters<typeof traffic>[3])=>unified(c,{...target,operationsSync:{version:1,capabilities:{metrics:true,comments:true,traffic:true,content:true}}},report,execution)):traffic;
 const run:ScheduledFlywheelCollector=(c,t,scope)=>runScheduledCollection(c,t,{ai:scope.ai,runs:f.scheduling,isNotLoggedInError:()=>false,collectors:{[kind]:collector},now});
 expect(await f.service.drain(run,10)).toBe(1);expect(reads).toBe(1);
 expect(await service.pending(ctx,2000)).toHaveLength(1004);expect(await service.summary(ctx,task!.id)).toEqual({written:1,failed:0});
 const [deferred]=await db.select().from(executionTasks).where(eq(executionTasks.id,executionId));
 expect(deferred).toMatchObject({status:'queued',retryAt:'2026-09-11T01:01:00.000Z',leaseOwner:null});
 expect(await f.scheduling.getRun(ctx,f.result.jobRunId)).toMatchObject({status:'running',finishedAt:null,error:null});
 tick=59000;expect(await f.service.drain(run,10)).toBe(0);expect(reads).toBe(1);
 await f.service.stop();const restarted=createScheduledFlywheelExecutionService(db,deps);busy=false;tick=60000;
 for(let i=0;i<51;i++){await restarted.drain(run,1);tick+=2000;}
 expect(reads).toBe(1005);expect(await service.pending(ctx,2000)).toHaveLength(0);
 expect(await service.summary(ctx,task!.id)).toEqual({written:1005,failed:0});
 expect((await db.select().from(executionTasks).where(eq(executionTasks.id,executionId)))[0]?.status).toBe('succeeded');
 expect(await db.select().from(aiTasks)).toHaveLength(1);expect(await db.select().from(jobRuns)).toHaveLength(1);
 expect(await f.scheduling.getRun(ctx,f.result.jobRunId)).toMatchObject({status:'succeeded',aiTaskId:task!.id,itemsUpdated:1005});
 await restarted.stop();
},30000);

it.each([['self.metrics',100],['self.traffic',80],['comments',40],['self.detail',20]] as const)('独立%s按后台优先级领取且无总体截止',async(kind,priority)=>{
 const f=await trigger(kind,true);await f.result.completion;
 const [task]=await db.select().from(aiTasks).where(eq(aiTasks.id,f.result.aiTaskId));
 const [execution]=await db.select().from(executionTasks).where(eq(executionTasks.id,task!.executionTaskId!));
 if(!execution)throw new Error('测试任务缺少持久执行记录');
 expect(execution.priority).toBe(priority);expect(execution.deadlineAt).toBeNull();
 expect(execution.executionBudget).toMatchObject({policy:'continuous',deadlineMs:null});
 tick=3*24*3600000;
 await f.service.drain((c,t,scope)=>runScheduledCollection(c,t,{ai:scope.ai,runs:f.scheduling,isNotLoggedInError:()=>false,collectors:{[kind]:async()=>({itemsNew:1,itemsUpdated:0})},now}),1);
 expect((await f.scheduling.getRun(ctx,f.result.jobRunId)).status).toBe('succeeded');await f.service.stop();
});

it('封面等待15分钟后恢复同一持久任务与运行记录，等待期间保留已有进度',async()=>{
 const f=await trigger('self.detail');await f.result.completion;
 const [task]=await db.select().from(aiTasks).where(eq(aiTasks.id,f.result.aiTaskId));
 const executionId=task!.executionTaskId!,tasks=createPersistentTaskService(db,{now});let batches=0;
 const collect:ScheduledFlywheelCollector=(c,t,scope)=>runScheduledCollection(c,t,{ai:{...scope.ai,async recordCollectionResult(owner,id,result){await scope.ai.recordCollectionResult!(owner,id,result);await scope.ai.recordCollectionResult!(owner,id,result);}},runs:f.scheduling,isNotLoggedInError:()=>false,collectors:{'self.detail':async()=>{batches++;return {itemsNew:0,itemsUpdated:batches===1?7:2,continueCollection:batches===1,retryAfterMs:900000};}},now});
 try{
  expect(await f.service.drain(collect,1)).toBe(1);
  expect(await tasks.get(ctx,executionId)).toMatchObject({id:executionId,status:'queued',attempt:1,retryAt:'2026-09-11T01:15:00.000Z'});
  expect(await f.scheduling.getRun(ctx,f.result.jobRunId)).toMatchObject({status:'running',finishedAt:null,error:null,itemsUpdated:7});
 }finally{await f.service.stop();}
 const restarted=createScheduledFlywheelExecutionService(db,deps);
 try{
  tick=899999;expect(await restarted.drain(collect,1)).toBe(0);expect(batches).toBe(1);
  tick=900000;expect(await restarted.drain(collect,1)).toBe(1);
  expect(await tasks.get(ctx,executionId)).toMatchObject({id:executionId,status:'succeeded',attempt:2});
  expect(await f.scheduling.getRun(ctx,f.result.jobRunId)).toMatchObject({id:f.result.jobRunId,aiTaskId:task!.id,status:'succeeded',itemsUpdated:9});
  expect(await db.select().from(aiTasks)).toHaveLength(1);expect(await db.select().from(executionTasks)).toHaveLength(1);expect(await db.select().from(jobRuns)).toHaveLength(1);
 }finally{await restarted.stop();}
});

it.each(['failed','busy'] as const)('保存首批统计后下一批%s仍保留原运行记录的7条进度',async mode=>{
 const f=await trigger('self.detail');await f.result.completion;
 const [task]=await db.select().from(aiTasks).where(eq(aiTasks.id,f.result.aiTaskId));
 const executionId=task!.executionTaskId!,tasks=createPersistentTaskService(db,{now});let batches=0;
 const collect:ScheduledFlywheelCollector=(c,t,scope)=>runScheduledCollection(c,t,{ai:scope.ai,runs:f.scheduling,isNotLoggedInError:()=>false,collectors:{'self.detail':async()=>{
  if(++batches===1)return {itemsNew:0,itemsUpdated:7,continueCollection:true};
  if(mode==='busy')throw Object.assign(new Error('profile occupied'),{code:'BROWSER_PROFILE_BUSY'});
  throw new Error('第二批采集失败');
 }},now});
 try{
  expect(await f.service.drain(collect,1)).toBe(1);
  expect(await f.scheduling.getRun(ctx,f.result.jobRunId)).toMatchObject({status:'running',itemsUpdated:7});
  tick=2000;expect(await f.service.drain(collect,1)).toBe(1);
  expect(await f.scheduling.getRun(ctx,f.result.jobRunId)).toMatchObject({id:f.result.jobRunId,aiTaskId:task!.id,status:mode==='busy'?'running':'failed',itemsUpdated:7});
  expect(await tasks.get(ctx,executionId)).toMatchObject({id:executionId,status:mode==='busy'?'queued':'failed',attempt:2});
  if(mode==='busy')expect((await tasks.get(ctx,executionId)).retryAt).toBe('2026-09-11T01:01:02.000Z');
  expect(await db.select().from(aiTasks)).toHaveLength(1);expect(await db.select().from(jobRuns)).toHaveLength(1);
 }finally{await f.service.stop();}
});

it('旧统一任务混合每批作品2条与流量累计20/40，重启后真实统计为22到44',async()=>{
 const {createOperationsSyncCollector}=await import('../../application/collection/operations-sync');
 const f=await trigger('self.metrics');await f.result.completion;
 const [task]=await db.select().from(aiTasks).where(eq(aiTasks.id,f.result.aiTaskId));
 if(!task?.executionTaskId)throw new Error('测试任务缺少持久执行记录');
 const executionId=task.executionTaskId;let trafficBatches=0;
 const merged=createOperationsSyncCollector({
  metrics:async()=>({itemsNew:0,itemsUpdated:2}),comments:async()=>({itemsNew:0,itemsUpdated:0}),
  traffic:async()=>({itemsNew:0,itemsUpdated:++trafficBatches*20,countMode:'cumulative',continueCollection:trafficBatches<2}),
  checkSignal:()=>{},isNotLoggedIn:()=>false,
 });
 const collect:ScheduledFlywheelCollector=(c,t,scope)=>runScheduledCollection(c,t,{ai:scope.ai,runs:f.scheduling,isNotLoggedInError:()=>false,collectors:{'self.metrics':(owner,target,report,execution)=>merged(owner,{...target,operationsSync:{version:1,capabilities:{metrics:true,comments:false,traffic:true,content:false}}},report,execution)},now});
 try{
  expect(await f.service.drain(collect,1)).toBe(1);
  expect(await f.scheduling.getRun(ctx,f.result.jobRunId)).toMatchObject({id:f.result.jobRunId,aiTaskId:task.id,status:'running',itemsUpdated:22});
 }finally{await f.service.stop();}
 const restarted=createScheduledFlywheelExecutionService(db,deps);
 try{
  tick=2000;expect(await restarted.drain(collect,1)).toBe(1);
  expect(await f.scheduling.getRun(ctx,f.result.jobRunId)).toMatchObject({id:f.result.jobRunId,aiTaskId:task.id,status:'succeeded',itemsUpdated:44});
  expect(await createPersistentTaskService(db,{now}).get(ctx,executionId)).toMatchObject({id:executionId,status:'succeeded',attempt:2});
  expect(await db.select().from(aiTasks)).toHaveLength(1);expect(await db.select().from(jobRuns)).toHaveLength(1);
 }finally{await restarted.stop();}
});
