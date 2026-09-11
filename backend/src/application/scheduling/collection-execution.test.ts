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
 deps:{now:()=> '2026-09-11T00:00:00.000Z'},enqueueCollectionRun:async(fn:()=>Promise<void>)=>fn(),wakeScheduledFlywheel:wake,prepareDailyTopic:async()=>({executionTaskId:'e'}),runTaskWithEffectiveSkillSnapshot:async()=>{},isNotLoggedInError:()=>false};
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
