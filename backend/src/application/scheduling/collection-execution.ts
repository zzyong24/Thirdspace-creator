import type {RequestContext} from "@creatoros/contract";
import {runScheduledCollection,type Collector as ScheduledCollector,type ScheduledFlywheelCollector} from "../../modules/ai-runtime";
/** 原调度任务绑定与串行采集；不持有第二任务权威。 */
export function createCollectionExecution(ports:{scheduledCollectors:Record<string,ScheduledCollector>;
scheduledSignals:Pick<import("node:async_hooks").AsyncLocalStorage<AbortSignal>,"run">;
flywheelSourceKinds:ReadonlySet<string>;
scheduledFlywheel:Pick<ReturnType<typeof import("../../modules/ai-runtime").createScheduledFlywheelExecutionService>,"prepare">;
schedulingService:Pick<ReturnType<typeof import("../../modules/scheduling").createSchedulingService>,"updateRun"|"getRun">;
aiService:Pick<ReturnType<typeof import("../../modules/ai").createAiService>,"getTask"|"markRunning"|"recordStep"|"markSucceeded"|"markFailed">;
deps:{now:()=>string};
enqueueCollectionRun:(run:()=>Promise<void>)=>Promise<void>;
wakeScheduledFlywheel:()=>void;
prepareDailyTopic:(ctx:RequestContext,id:string)=>Promise<{executionTaskId:string}>;
runTaskWithEffectiveSkillSnapshot:(ctx:RequestContext,id:string,run:(signal:AbortSignal)=>void|Promise<void>)=>Promise<void>;
isNotLoggedInError:(error:unknown)=>boolean;}){
const {scheduledCollectors,scheduledSignals,flywheelSourceKinds,scheduledFlywheel,schedulingService,aiService,deps,enqueueCollectionRun,wakeScheduledFlywheel,prepareDailyTopic,runTaskWithEffectiveSkillSnapshot,isNotLoggedInError}=ports;
  const collectFlywheel:ScheduledFlywheelCollector=(ctx,task,scope)=>enqueueCollectionRun(()=>scheduledSignals.run(scope.signal,async()=>{
    scope.signal.throwIfAborted();
    await runScheduledCollection(ctx,task,{
      ai:scope.ai,runs:{updateRun:(c,id,patch)=>{scope.signal.throwIfAborted();return schedulingService.updateRun(c,id,patch);}},
      collectors:Object.fromEntries(Object.entries(scheduledCollectors).map(([kind,collect])=>{const guarded:ScheduledCollector=async(c,t,report,execution)=>{scope.signal.throwIfAborted();const result=await collect(c,t,progress=>{scope.signal.throwIfAborted();report(progress);},execution);scope.signal.throwIfAborted();return result;};return [kind,guarded];})),isNotLoggedInError:isNotLoggedInError,now:deps.now,
    });
  }));

  const dispatchScheduledCollection = async (ctx: RequestContext, task: {
    id: string;
    taskType: string;
    inputData: Record<string, unknown>;
  }) => {
    if(flywheelSourceKinds.has(task.taskType.replace(/^scheduled\./,""))){
      let bound;
      try { bound=await scheduledFlywheel.prepare(ctx,task.id); }
      catch(error){
        const message=error instanceof Error?error.message:"采集准备失败";
        const current=await aiService.getTask(ctx,task.id);
        // 已交接的执行权不由准备层改终态；旧任务/数据保留，错误仍交调用方显示。
        if(!current.executionTaskId){
          await aiService.markFailed(ctx,task.id,`采集准备失败：${message}`);
          const settled=await aiService.getTask(ctx,task.id);
          const runId=task.inputData.jobRunId;
          if(!settled.executionTaskId && ['failed','cancelled'].includes(settled.status) && typeof runId==='string'){
            const run=await schedulingService.getRun(ctx,runId);
            if(run.aiTaskId!==task.id || run.jobId!==task.inputData.jobId)throw new Error('采集失败运行归属与原任务不符',{cause:error});
            if(run.status==='running')await schedulingService.updateRun(ctx,runId,{status:'failed',finishedAt:deps.now(),error:`采集准备失败：${message}`});
          }
        }
        throw error;
      }
      wakeScheduledFlywheel();
      return {executionTaskId:bound.executionTaskId};
    }
    if(task.taskType==="scheduled.topic.daily"){
      const bound=await prepareDailyTopic(ctx,task.id);
      return {executionTaskId:bound.executionTaskId};
    }
    return runTaskWithEffectiveSkillSnapshot(ctx, task.id, () =>
      enqueueCollectionRun(() =>
        runScheduledCollection(ctx, task, {
          ai: {
            markRunning: (c, id) => aiService.markRunning(c, id),
            recordStep: (c, id, input) => aiService.recordStep(c, id, input),
            markSucceeded: (c, id) => aiService.markSucceeded(c, id),
            markFailed: (c, id, err) => aiService.markFailed(c, id, err),
          },
          runs: {
            updateRun: (c, runId, patch) =>
              schedulingService.updateRun(c, runId, patch),
          },
          collectors: scheduledCollectors,
          // runner 不 import douyin-cdp:未登录判别经注入(→ needs_reconnect,§6)。
          isNotLoggedInError: isNotLoggedInError,
          now: deps.now,
        }),
      ),
    );
  };

return {collectFlywheel,dispatchScheduledCollection};
}
