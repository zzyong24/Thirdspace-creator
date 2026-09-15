import {afterAll,beforeAll,expect,it,vi} from 'vitest';
import {createDb,aiTasks,jobRuns,eq,type Db} from '@creatoros/backend';
import {ENDPOINTS,type RequestContext} from '@creatoros/contract';
import {createAiService} from '../../modules/ai/ai.service';
import {createSchedulingService} from '../../modules/scheduling/scheduling.service';
import {createScheduledRunIntentService} from '../../modules/scheduling/daily-topic-run-intent.service';
import {createSchedulingControls} from './controls';
import {triggerScheduledJob} from '../../modules/ai-runtime/scheduled-collection-scheduler';
const ctx:RequestContext={userId:'controls-user',accountId:'controls-account',requestId:'window-one',source:'user'};
let db:Db,close:()=>Promise<void>,seq=0;
const now=()=> '2026-09-15T00:00:00.000Z',nextId=(prefix:string)=>`${prefix}-controls-${++seq}`;
beforeAll(async()=>{const isolated=await createDb();db=isolated.db;close=()=>isolated.client.close();});afterAll(async()=>close());
async function fixture(){
 const owner={...ctx,accountId:`controls-account-${++seq}`};
 const unused=async()=>{throw Error('本用例不调用创作端口');};
 const aiService=createAiService({db,now,nextId,artifacts:{createVersion:unused,adoptThesisCandidate:unused},knowledge:{createKnowledge:unused},candidate:{createFromAIResult:unused,enrichCard:unused},learnings:{createLearning:unused},publishing:{createPublicationFromDraft:unused},materialLinks:{link:unused},positioning:{upsertProfile:unused,createStatementVersion:unused},calibration:{createDraftPrediction:unused}});
 const schedulingService=createSchedulingService({db,now,nextId});
 const job=await schedulingService.createJob(owner,{name:'作品数据同步',sourceKind:'self.metrics',schedule:'0 */2 * * *',target:{}});
 const dispatch=vi.fn(async()=>{}),ensure=createScheduledRunIntentService(db,{now,nextId},['self.metrics','topic.daily']).ensureRunForTask;
 const controls=createSchedulingControls({aiService,schedulingService,platformAccountService:{getAccount:async()=>({id:owner.accountId,userId:owner.userId,platform:'douyin',accountHandle:'fixture',externalAccountId:null,secretReference:null,followerBaseline:0,status:'active',createdAt:now(),updatedAt:now()})},dispatchScheduledCollection:dispatch,deps:{now},ensureDailyRun:ensure,ensureCollectionRun:ensure,ensureCanonicalRubricForAccount:async()=>{},migrateProfile:async()=>{},scheduling:{request:async()=>{throw Error('不应落入普通transport');}}});
 const run=async(c=owner)=>{
  const result=await controls.schedulingWithRunNow.request(ENDPOINTS.runScheduledJobNow,{params:{jobId:job.id},query:undefined,body:{}},c) as {data:unknown};
  return ENDPOINTS.runScheduledJobNow.response.parse(result.data);
 };
 return{ctx:owner,controls,job,aiService,schedulingService,dispatch,run};
}
it('公共runNow组合真实AI幂等与run intent：多窗口一次、结束后三次同毫秒均可新建',async()=>{
 const f=await fixture();
 const first=await Promise.all([f.run(),f.run({...f.ctx,requestId:'window-two'})]);
 expect(first[0]!.jobRunId).toBe(first[1]!.jobRunId);expect(f.dispatch).toHaveBeenCalledOnce();
 const ids=[first[0]!.aiTaskId];
 for(let i=0;i<2;i++){
  await db.update(aiTasks).set({status:'succeeded',completedAt:now()}).where(eq(aiTasks.id,ids.at(-1)!));
  await db.update(jobRuns).set({status:'succeeded',finishedAt:now()}).where(eq(jobRuns.aiTaskId,ids.at(-1)!));
  const next=await f.run();expect(next.deduped).toBe(false);ids.push(next.aiTaskId);
 }
 expect(new Set(ids).size).toBe(3);expect(f.dispatch).toHaveBeenCalledTimes(3);
 expect((await f.schedulingService.listRunsByJob(f.ctx,f.job.id,{limit:20,offset:0})).total).toBe(3);
});
it('公共runNow透传关闭状态和归属：活跃可查看，关闭无活跃不能新建，其他账号不能加入',async()=>{
 const f=await fixture();await f.schedulingService.setEnabled(f.ctx,f.job.id,false);
 await expect(f.run()).rejects.toThrow('任务已关闭');expect(f.dispatch).not.toHaveBeenCalled();
 await f.schedulingService.setEnabled(f.ctx,f.job.id,true);const first=await f.run();
 await f.schedulingService.setEnabled(f.ctx,f.job.id,false);
 expect(await f.run()).toEqual({...first,deduped:true});expect(f.dispatch).toHaveBeenCalledOnce();
 await expect(f.run({...f.ctx,accountId:'other-account'})).rejects.toThrow();
 expect(f.dispatch).toHaveBeenCalledOnce();
});

it.each(['manual','cron'])('公共组合%s先进入：立即运行与到点同时查空只产一次真实task/run',async firstKind=>{
 const f=await fixture();let release!:()=>void,entered!:()=>void;
 const gate=new Promise<void>(r=>{release=r;}),started=new Promise<void>(r=>{entered=r;});
 const original=f.aiService.createTask.bind(f.aiService);
 vi.spyOn(f.aiService,'createTask').mockImplementationOnce(async(...args)=>{entered();await gate;return original(...args);});
 const cron=()=>triggerScheduledJob({...f.ctx,source:'ingestion'},f.job,f.controls.triggerDeps,{scheduledFor:now()});
 const first=firstKind==='manual'?f.run():cron();await started;
 const second=firstKind==='manual'?cron():f.run();
 await new Promise(r=>setTimeout(r,10));release();
 const results=await Promise.all([first,second]);
 expect(results[0]!.jobRunId).toBe(results[1]!.jobRunId);expect(f.dispatch).toHaveBeenCalledOnce();
 expect((await f.schedulingService.listRunsByJob(f.ctx,f.job.id,{limit:20,offset:0})).total).toBe(1);
 const scheduledFor=await f.schedulingService.getRunScheduledFor(f.ctx,results[0]!.jobRunId);
 expect(scheduledFor).toBe(firstKind==='cron'?now():null);
});
