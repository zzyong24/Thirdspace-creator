import {beforeEach,it,expect,vi} from 'vitest';
import type {RequestContext} from '@creatoros/contract';
const capture=vi.hoisted(()=>({options:undefined as unknown,control:{ready:Promise.resolve(),stop:vi.fn(async()=>{})}}));
vi.mock('../../modules/ai-runtime',async original=>({...await original<object>(),startAutomationDriver:vi.fn(options=>{capture.options=options;return capture.control;})}));
import {createSchedulingAutomation} from './automation';
import type {startAutomationDriver} from '../../modules/ai-runtime';
const ctx:RequestContext={userId:'u',accountId:'a',requestId:'test',source:'ingestion'};
beforeEach(()=>{capture.options=undefined;vi.clearAllMocks();});
function fixture(scheduledFor:string|null){
 const dispatch=vi.fn(async()=>({executionTaskId:'child'}));
 const getRun=vi.fn(async()=>({id:'r',status:'running',scheduledFor}));
 const markFailed=vi.fn();const updateRun=vi.fn();
 const ports={aiService:{listRunningTasksSystem:async()=>[],getTask:async()=>({executionTaskId:'child'}),markFailed},
  schedulingService:{getRun,getRunScheduledFor:async()=> (await getRun()).scheduledFor,updateRun,listRunningRuns:async()=>[],listJobsSystem:async()=>({rows:[],total:0}),listRunsByJob:async()=>({rows:[],total:0})},schedulerCtx:ctx,
  syncDailyExecutionRuns:async()=>({activeAiTaskIds:[],inconsistencies:[],finalized:0}),syncCollectionExecutionRuns:async()=>({activeAiTaskIds:[],inconsistencies:[],finalized:0}),staleJobRunMs:1800000,deps:{now:()=> '2026-09-14T02:00:00Z'},
  triggerDeps:{now:()=> '2026-09-14T02:00:00Z',ai:{createTask:vi.fn()},runs:{listRunsByJob:async()=>({rows:[{id:'r',aiTaskId:'ai',status:'running',startedAt:'2026-09-14T00:00:00Z'}],total:1}),createRun:vi.fn(),updateRun}},
  flywheelSourceKinds:new Set(['self.metrics']),dispatchScheduledCollection:dispatch,persistentTaskService:{},scheduledChildren:{},wakeDelegated:vi.fn()};
 const automation=createSchedulingAutomation(ports as unknown as Parameters<typeof createSchedulingAutomation>[0]);automation.start();
 const options=capture.options as Parameters<typeof startAutomationDriver>[0];
 return {handler:options.registry.resolve('scheduled_collection'),dispatch,getRun,markFailed,updateRun,automation};
}
it.each([1,3])('跨计划重叠在父任务第%d次领取仍跳过，不重绑旧执行',async attempt=>{
 const f=fixture('2026-09-14T00:00:00Z');
 const value=await f.handler(ctx,{job:{id:'j',sourceKind:'self.metrics',accountId:'a',target:{operationsSync:{version:1}},enabled:true,schedule:'0 */2 * * *'},scheduledFor:'2026-09-14T02:00:00Z',taskId:'parent',attempt});
 expect(value).toBeUndefined();expect(f.dispatch).not.toHaveBeenCalled();expect(f.markFailed).not.toHaveBeenCalled();expect(f.updateRun).not.toHaveBeenCalled();
});
it('同计划恢复复用原子任务，不能把真正的恢复也当作重叠跳过',async()=>{
 const f=fixture('2026-09-14T02:00:00Z');
 expect(await f.handler(ctx,{job:{id:'j',sourceKind:'self.metrics',accountId:'a',target:{operationsSync:{version:1}},enabled:true,schedule:'0 */2 * * *'},scheduledFor:'2026-09-14T02:00:00Z',taskId:'parent',attempt:2})).toEqual({executionTaskId:'child'});
 expect(f.dispatch).toHaveBeenCalledOnce();
});
it('异常回退也不能把另一个计划的已绑定任务返回给新父任务',async()=>{
 const f=fixture('2026-09-14T00:00:00Z');f.getRun.mockRejectedValueOnce(new Error('temporary read failure'));
 expect(await f.handler(ctx,{job:{id:'j',sourceKind:'self.metrics',accountId:'a',target:{operationsSync:{version:1}},enabled:true,schedule:'0 */2 * * *'},scheduledFor:'2026-09-14T02:00:00Z',taskId:'parent',attempt:2})).toBeUndefined();
 expect(f.dispatch).not.toHaveBeenCalled();expect(f.updateRun).not.toHaveBeenCalled();
});

it('应用调度装配持有实际driver句柄，重复start/stop幂等，停止后不再启动',async()=>{
 const f=fixture(null);await f.automation.start();expect(capture.options).toBeDefined();
 const first=f.automation.stop(),second=f.automation.stop();expect(first).toBe(second);await first;
 expect(capture.control.stop).toHaveBeenCalledOnce();await f.automation.start();expect(capture.control.stop).toHaveBeenCalledOnce();
});
