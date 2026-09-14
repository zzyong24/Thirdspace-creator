import {listOfficialSkillBases} from '@creatoros/ai-worker';
import {createEffectiveSkillSnapshotResolver,requiredSkillIdsForTask} from './effective-skill-snapshot';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createDb,aiTasks,executionTasks,eq,scheduledJobs,type Db} from '@creatoros/backend';
import type {RequestContext} from '@creatoros/contract';
import {createSchedulingService} from '../scheduling/scheduling.service';
import {triggerScheduledJob} from './scheduled-collection-scheduler';
import {createScheduledFlywheelExecutionService,type ScheduledFlywheelCollector} from './scheduled-flywheel-execution.service';
import {createPersistentTaskService} from '../execution/persistent-task.service';

let db:Db,close:()=>Promise<void>,service:ReturnType<typeof createScheduledFlywheelExecutionService>,seq=0,tick=0;
const now=()=>new Date(Date.parse('2026-09-14T00:00:00Z')+tick).toISOString();
const nextId=(prefix:string)=>`${prefix}-concurrency-${++seq}`;
const ctx=(accountId:string):RequestContext=>({userId:'concurrency-user',accountId,requestId:nextId('req'),source:'user'});
const latch=()=>{let resolve!:()=>void;const promise=new Promise<void>(r=>{resolve=r;});return {promise,resolve};};
const until=async(check:()=>boolean)=>{for(let i=0;i<200&&!check();i++)await new Promise(r=>setTimeout(r,5));expect(check()).toBe(true);};
beforeEach(async()=>{tick=0;const result=await createDb();db=result.db;close=()=>result.client.close();service=createScheduledFlywheelExecutionService(db,{entryPath:'/never-spawn-worker',budget:{maxCalls:4,maxTokens:1000,deadlineMs:60000},resolveModelSpec:async()=>{throw new Error('模型不在本测试范围');},now});});
afterEach(async()=>{await service.stop();vi.useRealTimers();await close();});
async function enqueue(accountId:string,sourceKind='self.traffic'){
 tick++;
 const context=ctx(accountId),scheduling=createSchedulingService({db,now,nextId});
 const [job]=await db.insert(scheduledJobs).values({id:nextId('job'),userId:context.userId,accountId,name:'并发采集',sourceKind,schedule:'40 9 * * *',target:{},createdAt:now(),updatedAt:now()}).returning();
 const result=await triggerScheduledJob(context,{id:job!.id,sourceKind,target:{},accountId},{now,ai:{createTask:async(c,input)=>{const id=nextId('task');await db.insert(aiTasks).values({id,userId:c.userId,accountId:c.accountId!,taskType:input.taskType,inputData:input.inputData,idempotencyKey:id,requestFingerprint:'sha256:'+'a'.repeat(64),requestedAt:now(),runtimeData:{skillSnapshot:await createEffectiveSkillSnapshotResolver({officialSkills:{get:id=>listOfficialSkillBases().find(base=>base.skillId===id)??null,list:()=>listOfficialSkillBases(),platformPolicy:()=>({version:'1',text:'测试策略'})},accountOverlays:{listBySkillIds:async()=>[]},now})(c,requiredSkillIdsForTask(input.taskType,input.inputData??{}))}});return {id,status:'queued'};}},runs:scheduling,dispatch:(c,t)=>service.prepare(c,t.id)});
 await result.completion;
 const [task]=await db.select().from(aiTasks).where(eq(aiTasks.id,result.aiTaskId));
 return {context,id:result.aiTaskId,executionId:task!.executionTaskId!};
}

it('慢账号不挡其他账号、同账号不重入，并发唤醒不重复领取',async()=>{
 const a=await enqueue('a'),a2=await enqueue('a','comments'),b=await enqueue('b'),c=await enqueue('c');
 const gate=latch(),seen:string[]=[];
 const collect:ScheduledFlywheelCollector=async(context,task,scope)=>{seen.push(task.id);if(task.id===a.id)await Promise.race([gate.promise,new Promise<void>(r=>scope.signal.addEventListener('abort',()=>r(),{once:true}))]);scope.signal.throwIfAborted();await scope.ai.markSucceeded(context,task.id);};
 try{
  await Promise.race([service.drain(collect,5,{waitForCompletion:false}),new Promise<void>(r=>setTimeout(r,50))]);
  await until(()=>seen.includes(b.id));
  expect(seen).not.toContain(a2.id);
  await Promise.all(Array.from({length:3},()=>service.drain(collect,5,{waitForCompletion:false})));
  await until(()=>seen.includes(c.id));
  expect((await createPersistentTaskService(db).get(a2.context,a2.executionId)).status).toBe('queued');
  gate.resolve();await service.drain(collect,5);
  await until(()=>seen.includes(a2.id));
  for(const item of [a,a2,b,c])expect((await createPersistentTaskService(db).get(item.context,item.executionId)).attempt).toBe(1);
  expect(new Set(seen).size).toBe(seen.length);
 }finally{gate.resolve();}
});

it('批次交还执行权后释放槽位，重试等待不阻止第三账号',async()=>{
 const a=await enqueue('a'),b=await enqueue('b'),c=await enqueue('c');
 const seen:string[]=[];
 await service.drain(async(context,task,scope)=>{seen.push(task.id);if(task.id===a.id)await scope.ai.deferCollection!(context,task.id);else await scope.ai.markSucceeded(context,task.id);},5);
 expect(seen).toEqual(expect.arrayContaining([a.id,b.id,c.id]));
 const original=await createPersistentTaskService(db,{now}).get(a.context,a.executionId);
 expect(original.status).toBe('queued');expect(original.retryAt).toBeTruthy();expect(original.attempt).toBe(1);
 tick+=2001;
 await service.drain(async(context,task,scope)=>{expect(task.id).toBe(a.id);await scope.ai.markSucceeded(context,task.id);},1);
 expect((await createPersistentTaskService(db,{now}).get(a.context,a.executionId)).attempt).toBe(2);
});

it('取消与停止保留原任务执行权，停止后不再领取',async()=>{
 const a=await enqueue('a'),b=await enqueue('b'),c=await enqueue('c'),started:string[]=[],aborted:string[]=[];
 const collector:ScheduledFlywheelCollector=async(_ctx,task,scope)=>{started.push(task.id);await new Promise<void>(resolve=>scope.signal.addEventListener('abort',()=>{aborted.push(task.id);resolve();},{once:true}));scope.signal.throwIfAborted();};
 await Promise.race([service.drain(collector,5,{waitForCompletion:false}),new Promise<void>(r=>setTimeout(r,50))]);
 await until(()=>started.length===2);
 const tasks=createPersistentTaskService(db,{now});await tasks.command(a.context,{taskIds:[a.executionId],command:'cancel',idempotencyKey:'cancel-a'});
 expect((await tasks.get(a.context,a.executionId)).status).toBe('cancel_requested');
 await service.stop();
 expect(aborted.sort()).toEqual([a.id,b.id].sort());expect(started).not.toContain(c.id);
 expect(await service.drain(collector,5,{waitForCompletion:false})).toBe(0);
 expect((await tasks.get(c.context,c.executionId)).attempt).toBe(0);
});

it('用户取消活跃采集后真实退出并确认取消，同账号后续任务可以领取',async()=>{
 const a=await enqueue('a'),next=await enqueue('a','comments'),started:string[]=[],aborted:string[]=[];
 vi.useFakeTimers({toFake:['setInterval','clearInterval']});
 const collect:ScheduledFlywheelCollector=async(context,task,scope)=>{
  started.push(task.id);
  if(task.id===a.id){await new Promise<void>(resolve=>scope.signal.addEventListener('abort',()=>{aborted.push(task.id);resolve();},{once:true}));scope.signal.throwIfAborted();}
  else await scope.ai.markSucceeded(context,task.id);
 };
 await service.drain(collect,5,{waitForCompletion:false});await until(()=>started.includes(a.id));
 const tasks=createPersistentTaskService(db,{now});await tasks.command(a.context,{taskIds:[a.executionId],command:'cancel',idempotencyKey:'active-cancel'});
 await vi.advanceTimersByTimeAsync(10000);await until(()=>aborted.includes(a.id));
 await service.drain(collect,5);
 expect((await tasks.get(a.context,a.executionId)).status).toBe('cancelled');
 expect((await tasks.get(next.context,next.executionId)).status).toBe('succeeded');
});

it('显式run与drain共用账号槽，超过容量和同账号任务保持未领取',async()=>{
 const a=await enqueue('a'),a2=await enqueue('a','comments'),b=await enqueue('b'),c=await enqueue('c');
 const gate=latch(),seen:string[]=[];
 const collect:ScheduledFlywheelCollector=async(context,task,scope)=>{seen.push(task.id);if([a.id,b.id].includes(task.id))await Promise.race([gate.promise,new Promise<void>(r=>scope.signal.addEventListener('abort',()=>r(),{once:true}))]);scope.signal.throwIfAborted();await scope.ai.markSucceeded(context,task.id);};
 const running=service.run(a.context,a.id,collect);
 try{
  await until(()=>seen.includes(a.id));
  await service.run(a2.context,a2.id,collect);
  await service.drain(collect,1,{waitForCompletion:false});await until(()=>seen.includes(b.id));
  await service.run(c.context,c.id,collect);
  const tasks=createPersistentTaskService(db,{now});
  for(const item of [a2,c])expect((await tasks.get(item.context,item.executionId)).attempt).toBe(0);
  expect(seen).toEqual([a.id,b.id]);
 }finally{gate.resolve();await running;}
 await service.drain(collect,5);
 expect(new Set(seen).size).toBe(4);
});

it('停止与领取竞争时等待入场收口，不向已取消的signal启动采集器',async()=>{
 await enqueue('a');let started=false;
 const draining=service.drain(async()=>{started=true;},5,{waitForCompletion:false});
 await Promise.resolve();
 await service.stop();await draining;
 expect(started).toBe(false);
});

it('经账号队列运行的采集取消后，stop必须等采集器真实退出',async()=>{
 const {createAccountCollectionQueue}=await import('../../application/scheduling/account-collection-queue');
 const queue=createAccountCollectionQueue(),a=await enqueue('a'),gate=latch();let started=false,stopped=false;
 await service.drain((context,task,scope)=>queue(context,async()=>{started=true;await gate.promise;scope.signal.throwIfAborted();await scope.ai.markSucceeded(context,task.id);},scope.signal),1,{waitForCompletion:false});
 await until(()=>started);
 const tasks=createPersistentTaskService(db,{now});await tasks.command(a.context,{taskIds:[a.executionId],command:'cancel',idempotencyKey:'queued-active-cancel'});
 const stopping=service.stop().then(()=>{stopped=true;});
 try{
  await new Promise(r=>setTimeout(r,20));
  expect(stopped).toBe(false);
  expect((await tasks.get(a.context,a.executionId)).status).toBe('cancel_requested');
 }finally{gate.resolve();await stopping;}
 expect(stopped).toBe(true);expect((await tasks.get(a.context,a.executionId)).status).toBe('cancelled');
});

it('同账号真实队列按作品100、流量80、评论40、封面20领取，优先级高于入队先后',async()=>{
 const covers=await enqueue('priority-account','self.detail'),comments=await enqueue('priority-account','comments'),traffic=await enqueue('priority-account','self.traffic'),works=await enqueue('priority-account','self.metrics');
 const expected=[works,traffic,comments,covers],priorities=[100,80,40,20],seen:string[]=[];
 const tasks=createPersistentTaskService(db,{now});
 for(const [index,item] of expected.entries())expect((await tasks.get(item.context,item.executionId)).priority).toBe(priorities[index]);
 await service.drain(async(context,task,scope)=>{seen.push(task.id);await scope.ai.markSucceeded(context,task.id);},4);
 expect(seen).toEqual(expected.map(item=>item.id));
 for(const item of expected)expect(await tasks.get(item.context,item.executionId)).toMatchObject({status:'succeeded',attempt:1});
});
