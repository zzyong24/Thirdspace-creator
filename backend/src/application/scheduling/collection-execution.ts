import type {RequestContext} from "@creatoros/contract";
import {runScheduledCollection,type Collector as ScheduledCollector,type ScheduledFlywheelCollector} from "../../modules/ai-runtime";
/** 原调度任务绑定与串行采集；不持有第二任务权威。 */
export function createCollectionExecution(ports:{scheduledCollectors:Record<string,ScheduledCollector>;
scheduledSignals:Pick<import("node:async_hooks").AsyncLocalStorage<AbortSignal>,"run">;
flywheelSourceKinds:ReadonlySet<string>;
scheduledFlywheel:Pick<ReturnType<typeof import("../../modules/ai-runtime").createScheduledFlywheelExecutionService>,"prepare">;
schedulingService:Pick<ReturnType<typeof import("../../modules/scheduling").createSchedulingService>,"updateRun">;
aiService:Pick<ReturnType<typeof import("../../modules/ai").createAiService>,"markRunning"|"recordStep"|"markSucceeded"|"markFailed">;
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
      const bound=await scheduledFlywheel.prepare(ctx,task.id);
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
