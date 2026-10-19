import {afterAll,beforeAll,expect,it,vi} from 'vitest';
import {createDb,aiTasks,jobRuns,eq,type Db} from '@creatoros/backend';
import {ENDPOINTS,type RequestContext} from '@creatoros/contract';
import {createAiService} from '../../modules/ai/ai.service';
import {createSchedulingService} from '../../modules/scheduling/scheduling.service';
import {createScheduledRunIntentService} from '../../modules/scheduling/daily-topic-run-intent.service';
import {createSchedulingControls} from './controls';
import {triggerScheduledJob} from '../../modules/ai-runtime/scheduled-collection-scheduler';
import {createCommentsCollector} from '../collection/comments';
import {createPublicationSyncService} from '../../modules/analytics';
const ctx:RequestContext={userId:'controls-user',accountId:'controls-account',requestId:'window-one',source:'user'};
let db:Db,close:()=>Promise<void>,seq=0;
const now=()=> '2026-09-15T00:00:00.000Z',nextId=(prefix:string)=>`${prefix}-controls-${++seq}`;
beforeAll(async()=>{const isolated=await createDb();db=isolated.db;close=()=>isolated.client.close();});afterAll(async()=>close());
async function fixture(sourceKind:'self.metrics'|'comments'='self.metrics'){
 const owner={...ctx,accountId:`controls-account-${++seq}`};
 const unused=async()=>{throw Error('本用例不调用创作端口');};
 const aiService=createAiService({db,now,nextId,artifacts:{createVersion:unused,adoptThesisCandidate:unused},knowledge:{createKnowledge:unused},candidate:{createFromAIResult:unused,enrichCard:unused},learnings:{createLearning:unused},publishing:{createPublicationFromDraft:unused},materialLinks:{link:unused},positioning:{upsertProfile:unused,createStatementVersion:unused},calibration:{createDraftPrediction:unused}});
 const schedulingService=createSchedulingService({db,now,nextId});
 const job=await schedulingService.createJob(owner,{name:'作品数据同步',sourceKind,schedule:'0 */2 * * *',target:{}});
 const ensureDefault=vi.fn(async()=>{});
 const dispatch=vi.fn(async()=>{}),ensure=createScheduledRunIntentService(db,{now,nextId},['self.metrics','topic.daily','comments']).ensureRunForTask;
 const validate=vi.fn(async(c:RequestContext,ids:readonly string[])=>{if(c.accountId!==owner.accountId||ids.some(id=>!['p1','p2'].includes(id)))throw Error('作品不可采集');});
 const controls=createSchedulingControls({aiService,schedulingService,platformAccountService:{getAccount:async()=>({id:owner.accountId,userId:owner.userId,platform:'douyin',accountHandle:'fixture',externalAccountId:null,secretReference:null,followerBaseline:0,status:'active',createdAt:now(),updatedAt:now()})},dispatchScheduledCollection:dispatch,deps:{now},ensureDailyRun:ensure,ensureCollectionRun:ensure,ensureDefaultRubric:ensureDefault,migrateProfile:async()=>{},scheduling:{request:async()=>{throw Error('不应落入普通transport');}},...{assertCommentPublications:validate}});
 const run=async(c=owner,publicationIds?:string[])=>{
  const result=await controls.schedulingWithRunNow.request(ENDPOINTS.runScheduledJobNow,{params:{jobId:job.id},query:undefined,body:publicationIds?{publicationIds}:{}},c) as {data:unknown};
  return ENDPOINTS.runScheduledJobNow.response.parse(result.data);
 };
 return{ctx:owner,controls,job,aiService,schedulingService,dispatch,run,validate,ensureDefault};
}

it('显式少量范围不能被吞成全量，非comments拒绝且不创建task',async()=>{
 const f=await fixture();
 await expect(f.controls.schedulingWithRunNow.request(ENDPOINTS.runScheduledJobNow,{params:{jobId:f.job.id},body:{publicationIds:['p1']}} as never,f.ctx)).rejects.toThrow();
 expect(f.dispatch).not.toHaveBeenCalled();
});

it('comments选择冻结在task target且不改cron配置，同选择可复用，不同选择/全量必须冲突',async()=>{
 const f=await fixture('comments');const before=await f.schedulingService.getJob(f.ctx,f.job.id);
 const first=await f.run(f.ctx,['p2','p1']);
 const task=await f.aiService.getTask(f.ctx,first.aiTaskId);
 expect(task.inputData.target).toMatchObject({publicationIds:['p1','p2']});
 expect(await f.schedulingService.getJob(f.ctx,f.job.id)).toEqual(before);
 expect(await f.run(f.ctx,['p1','p2'])).toEqual({...first,deduped:true});
 await expect(f.run(f.ctx,['p1'])).rejects.toThrow('范围');
 await expect(f.run()).rejects.toThrow('范围');
 expect(f.dispatch).toHaveBeenCalledOnce();
});

it('未知作品在创建前拒绝，已有全量运行时不能把少量选择当成已接受',async()=>{
 const f=await fixture('comments');
 await expect(f.run(f.ctx,['unknown'])).rejects.toThrow('作品不可采集');
 expect(f.dispatch).not.toHaveBeenCalled();
 const original=await f.run();
 await expect(f.run(f.ctx,['p1'])).rejects.toThrow('范围');
 expect(f.dispatch).toHaveBeenCalledOnce();
 expect((await f.aiService.getTask(f.ctx,original.aiTaskId)).inputData.target).toEqual({});
});

it.each([false,true])('并发全量与选集先进入=%s，不同范围不复用或另开任务',async(selectedFirst)=>{
 const f=await fixture('comments');let release!:()=>void,entered!:()=>void;
 const gate=new Promise<void>(resolve=>{release=resolve;}),started=new Promise<void>(resolve=>{entered=resolve;});
 const original=f.aiService.createTask.bind(f.aiService);
 vi.spyOn(f.aiService,'createTask').mockImplementationOnce(async(...args)=>{entered();await gate;return original(...args);});
 const first=f.run(f.ctx,selectedFirst?['p1']:undefined);await started;
 const second=f.run(f.ctx,selectedFirst?undefined:['p1']);
 const outcomes=Promise.allSettled([first,second]);release();
 const results=await outcomes;
 expect(results[0]!.status).toBe('fulfilled');expect(results[1]!.status).toBe('rejected');expect(f.dispatch).toHaveBeenCalledOnce();
 expect((await f.schedulingService.listRunsByJob(f.ctx,f.job.id,{limit:100,offset:0})).total).toBe(1);
});

it('createTask幂等返回不同范围旧task时在ensureRun/dispatch前阻断',async()=>{
 const f=await fixture('comments');const first=await f.run();f.dispatch.mockClear();
 const oldTask=await f.aiService.getTask(f.ctx,first.aiTaskId);
 // 隔离模拟run读投影尚未可见，但createTask持久幂等仍命中旧任务的边界。
 vi.spyOn(f.schedulingService,'listRunsByJob').mockResolvedValue({rows:[],total:0});
 vi.spyOn(f.aiService,'createTask').mockResolvedValue(oldTask);
 const ensure=vi.spyOn(f.controls.triggerDeps.runs,'createRun');
 await expect(f.run(f.ctx,['p1'])).rejects.toMatchObject({name:'ConflictError',details:{aiTaskId:first.aiTaskId}});
 expect(ensure).not.toHaveBeenCalled();expect(f.dispatch).not.toHaveBeenCalled();
});

it('真实controls task/run传入collector：选集覆盖旧awemeId，其他due作品不抓，账户旧失败不反杀选集成功',async()=>{
 const f=await fixture('comments');
 await f.schedulingService.updateJob(f.ctx,f.job.id,{target:{awemeId:'not-selected'}});
 const submitted=await f.run(f.ctx,['p1']);const task=await f.aiService.getTask(f.ctx,submitted.aiTaskId);
 const pubs=['p1','p2','p3'].map(id=>({id,externalId:`v-${id}`,platform:'douyin',status:'published',hiddenAt:null}));
 let collectorNow=now();
 const sync=createPublicationSyncService(db,{now:()=>collectorNow,assertPublication:async(_ctx,id)=>({externalId:`v-${id}`})});
 await sync.settle(f.ctx,'p3','comments',{success:false,error:'other work failed'});
 const read=vi.fn(async(_ctx:RequestContext,ids:string[])=>({works:ids.map(awemeId=>({awemeId,records:[],complete:true})),truncated:false,cooldownRemainMs:0}));
 const single=vi.fn(async()=>[]);
 const collector=createCommentsCollector({db,deps:{now,nextId},sync,checkScheduledSignal:()=>{},ingestionService:{ensureDouyinSource:async()=> 'src',createRun:async()=>({id:'fixture-run'}),completeRun:async()=>({})},candidateService:{listCommentsForPublication:async()=>[]},publishingService:{getRecentPublicationsWithTitle:async()=>pubs,resolvePublication:async()=>null},analyticsService:{getPublicationAnalytics:async()=>({rows:[]})},readComments:single,readCommentsForWorks:read} as never);
 const result=await collector(f.ctx,task.inputData.target as Record<string,unknown>,()=>{},{taskId:task.id});
 expect(single).not.toHaveBeenCalled();expect(read.mock.calls[0]![1]).toEqual(['v-p1']);expect(result.incomplete).toBe(false);
 const detail=JSON.parse(result.message!.split('评论抓取诊断：')[1]!);
 expect(detail.unresolvedSyncFailures).toMatchObject({count:0,scope:'selected_publications.comments'});
 expect(detail.accountUnresolvedSyncFailures).toMatchObject({count:1,scope:'account.comments'});
 // 恢复只读取原task的选择，不根据后来job设置或其他due作品扩大。
 expect((await f.aiService.getTask(f.ctx,submitted.aiTaskId)).inputData.target).toEqual(task.inputData.target);
 await f.schedulingService.updateJob(f.ctx,f.job.id,{target:{awemeId:'changed-job-target'}});
 collectorNow='2026-09-16T00:00:00.000Z'; // 所有作品重新due，原task范围仍不可扩大。
 const resumed=await f.aiService.getTask(f.ctx,submitted.aiTaskId);
 await collector(f.ctx,resumed.inputData.target as Record<string,unknown>,()=>{},{taskId:resumed.id});
 expect(read.mock.calls.map(call=>call[1])).toEqual([['v-p1'],['v-p1']]);
 read.mockClear();
 await expect(collector(f.ctx,{publicationIds:['p1','missing']},()=>{},{taskId:resumed.id})).rejects.toThrow('作品不存在');
 expect(read).not.toHaveBeenCalled();
});
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

it('新绑抖音号当次补齐账号级系统采集任务，普通创建仍被拒绝',async()=>{
 const f=await fixture();
 await f.controls.bootstrapDouyinOnBind(f.ctx);
 let kinds:string[]=[];
 for(let attempt=0;attempt<100;attempt++){
  const {rows}=await f.schedulingService.listJobs(f.ctx,{limit:100,offset:0});
  kinds=rows.map(row=>row.sourceKind);
  if(['self.metrics','self.traffic','comments','self.detail','topic.daily','intelligence.sync'].every(kind=>kinds.includes(kind)))break;
  await new Promise(resolve=>setTimeout(resolve,20));
 }
 expect(kinds).toEqual(expect.arrayContaining(['self.metrics','self.traffic','comments','self.detail','topic.daily','intelligence.sync']));
 await expect(f.schedulingService.createJob(f.ctx,{name:'手工流量',sourceKind:'self.traffic',schedule:'0 0 * * *'}))
  .rejects.toThrow('该采集任务由系统按账号管理');
});

// 默认初始化仅是原绑定成功事件的best-effort旁路；完整ctx不得被账号字符串替代。
it('真实绑定warmup薄接线传完整ctx，ensure拒绝仍保持bootstrap best-effort',async()=>{
 const f=await fixture(),selected={...f.ctx,groupId:'t1312-warmup-owned-group',groupVersion:7,membershipVersion:9};
 const warning=vi.spyOn(console,'warn').mockImplementation(()=>{}),error=vi.spyOn(console,'error').mockImplementation(()=>{});
 f.ensureDefault.mockRejectedValueOnce(new Error('受控默认初始化失败'));
 try{await expect(f.controls.bootstrapDouyinOnBind(selected)).resolves.toBeUndefined();expect(f.ensureDefault).toHaveBeenCalledExactlyOnceWith(selected);expect(warning).toHaveBeenCalled();}finally{warning.mockRestore();error.mockRestore();}
},3600000);
