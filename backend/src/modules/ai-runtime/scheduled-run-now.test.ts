import {expect,it,vi} from 'vitest';
import type {RequestContext} from '@creatoros/contract';
import {runJobNow,type TriggerDeps,type RunNowJobPort} from './scheduled-collection-scheduler';

const ctx:RequestContext={userId:'run-now-user',accountId:'account-a',requestId:'one-window',source:'user'};
type Row={id:string;aiTaskId:string|null;status:string;startedAt:string};
function fixture(){
 const rows:Row[]=[],states=new Map<string,{status:string;executionTaskId?:string;runtimeStatus?:string}>();
 const currentJob={id:'job',sourceKind:'self.metrics',target:{},accountId:'account-a',enabled:true};let seq=0;
 const createTask=vi.fn(async()=>{const id=`task-${++seq}`;states.set(id,{status:'queued',executionTaskId:`exec-${seq}`,runtimeStatus:'queued'});return{id,status:'queued'};});
 const createRun=vi.fn(async(_ctx:RequestContext,input:{aiTaskId?:string|null})=>{const row={id:`run-${seq}`,aiTaskId:input.aiTaskId??null,status:'running',startedAt:'2026-09-15T00:00:00Z'};rows.unshift(row);return row;});
 const dispatch=vi.fn(async()=>{}),getJob=vi.fn(async()=>currentJob);
 const getTaskState=vi.fn(async(_c:RequestContext,id:string)=>{const state=states.get(id);if(!state)throw Error('task not found');return state;});
 const deps:TriggerDeps&{job:RunNowJobPort}={ai:{createTask},runs:{createRun,listRunsByJob:async(_c,_j,q)=>({rows:rows.slice(q.offset,q.offset+q.limit),total:rows.length}),updateRun:vi.fn(async()=>({}))},dispatch,now:()=>`2026-09-15T00:00:0${seq}.000Z`,getTaskState,job:{getJob}};
 const active=(status='running',runStatus='running')=>{rows.push({id:'old-run',aiTaskId:'old-task',status:runStatus,startedAt:'2026-09-12T00:00:00Z'});states.set('old-task',{status:'failed',executionTaskId:'old-execution',runtimeStatus:status});};
 return{deps,rows,states,currentJob,createTask,createRun,dispatch,getJob,getTaskState,active};
}
it.each(['queued','running','retry_wait','blocked','waiting_user','paused','unknown_result'])('跨日真实执行%s复用原运行，不重复dispatch',async state=>{
 const f=fixture();f.active(state,'failed');
 expect(await runJobNow(ctx,'job',f.deps)).toMatchObject({jobRunId:'old-run',aiTaskId:'old-task',deduped:true});
 expect(f.createTask).not.toHaveBeenCalled();expect(f.dispatch).not.toHaveBeenCalled();
});
it('超过20条历史后仍定位跨天活跃运行，所有类型统一处理',async()=>{
 const f=fixture();f.currentJob.sourceKind='topic.daily';
 f.rows.push(...Array.from({length:25},(_,i)=>({id:`completed-${i}`,aiTaskId:`done-${i}`,status:'succeeded',startedAt:'2026-09-14T00:00:00Z'})));f.active('queued');
 expect(await runJobNow(ctx,'job',f.deps)).toMatchObject({jobRunId:'old-run',deduped:true});expect(f.dispatch).not.toHaveBeenCalled();
});
it('关闭任务有活跃运行仍可查看，无活跃运行不能新建',async()=>{
 const f=fixture();f.currentJob.enabled=false;f.active('queued');
 expect(await runJobNow(ctx,'job',f.deps)).toMatchObject({jobRunId:'old-run',deduped:true});
 f.rows[0]!.status='failed';f.states.set('old-task',{status:'failed',executionTaskId:'old-execution',runtimeStatus:'failed'});
 await expect(runJobNow(ctx,'job',f.deps)).rejects.toThrow('任务已关闭');expect(f.createTask).not.toHaveBeenCalled();
});
it('双击和多窗口并发只提交一次，任务终态后可启动新一次',async()=>{
 const f=fixture();let resume!:()=>void;const gate=new Promise<void>(r=>{resume=r;});
 const create=f.createTask.getMockImplementation()!;
 f.createTask.mockImplementationOnce(async()=>{await gate;return create();});
 const first=runJobNow(ctx,'job',f.deps),second=runJobNow({...ctx,requestId:'other-window'},'job',{...f.deps,job:{getJob:f.getJob}});
 await new Promise(r=>setTimeout(r,0));resume();
 const results=await Promise.all([first,second]);expect(new Set(results.map(r=>r.jobRunId)).size).toBe(1);
 expect(f.createTask).toHaveBeenCalledOnce();expect(f.createRun).toHaveBeenCalledOnce();expect(f.dispatch).toHaveBeenCalledOnce();
 f.rows[0]!.status='succeeded';f.states.set('task-1',{status:'succeeded'});
 const next=await runJobNow(ctx,'job',f.deps);
 expect(next).toMatchObject({deduped:false});expect(next.aiTaskId).not.toBe(results[0]!.aiTaskId);expect(f.createTask).toHaveBeenCalledTimes(2);
});
it('读取失败不推断没有活跃任务，并发锁异常后可再次使用',async()=>{
 const f=fixture();f.active();f.getTaskState.mockRejectedValueOnce(Error('read unavailable'));
 await expect(runJobNow(ctx,'job',f.deps)).rejects.toThrow('read unavailable');expect(f.createTask).not.toHaveBeenCalled();
 expect(await runJobNow(ctx,'job',f.deps)).toMatchObject({jobRunId:'old-run',deduped:true});
});
it('不同用户或账号不会共享另一个请求的运行结果',async()=>{
 const a=fixture(),b=fixture();b.currentJob.accountId='account-b';b.rows.push({id:'b-run',aiTaskId:'b-task',status:'running',startedAt:'2026-09-15T00:00:00Z'});b.states.set('b-task',{status:'queued'});
 const [ar,br]=await Promise.all([runJobNow(ctx,'job',a.deps),runJobNow({...ctx,userId:'other-user',accountId:'account-b'},'job',b.deps)]);
 expect(ar.jobRunId).not.toBe(br.jobRunId);expect(br.jobRunId).toBe('b-run');expect(b.dispatch).not.toHaveBeenCalled();
});
it('只有手动新建流量任务刷新全账号到期队列，复用不重派发',async()=>{
 const f=fixture();f.currentJob.sourceKind='self.traffic';
 await runJobNow(ctx,'job',f.deps);
 expect(f.createTask).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({inputData:expect.objectContaining({target:{__refreshDueTraffic:true}})}));
 expect(f.dispatch).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({inputData:expect.objectContaining({target:{__refreshDueTraffic:true}})}));
 await runJobNow(ctx,'job',f.deps);expect(f.dispatch).toHaveBeenCalledOnce();
});
it('同毫秒终结多次后仍各建新attempt，数据库同时间行顺序不会吞掉新运行',async()=>{
 const f=fixture();f.deps.now=()=> '2026-09-15T00:00:00.000Z';
 // 数据库 startedAt 同值时顺序未承诺；固定返回最早插入在前。
 f.deps.runs.listRunsByJob=async(_c,_j,q)=>({rows:[...f.rows].reverse().slice(q.offset,q.offset+q.limit),total:f.rows.length});
 for(let i=0;i<3;i++){
  const r=await runJobNow(ctx,'job',f.deps);f.rows.find(row=>row.id===r.jobRunId)!.status='succeeded';f.states.set(r.aiTaskId,{status:'succeeded'});
 }
 const calls=f.createTask.mock.calls as unknown as Array<[RequestContext,{attemptId:string}]>;
 expect(new Set(calls.map(c=>c[1].attemptId)).size).toBe(3);
});

it.each(['succeeded','partial','failed','cancelled'])('运行投影仍running但执行已%s时允许新建一次',async status=>{
 const f=fixture();f.active(status);
 const next=await runJobNow(ctx,'job',f.deps);expect(next.jobRunId).not.toBe('old-run');expect(f.dispatch).toHaveBeenCalledOnce();
});
it('执行ID存在但当前执行状态缺失时保留原运行，不猜终态',async()=>{
 const f=fixture();f.active();f.states.set('old-task',{status:'failed',executionTaskId:'old-execution'});
 expect(await runJobNow(ctx,'job',f.deps)).toMatchObject({jobRunId:'old-run',deduped:true});expect(f.dispatch).not.toHaveBeenCalled();
});
