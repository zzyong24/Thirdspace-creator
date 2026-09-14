import {createAccountCollectionQueue} from './account-collection-queue';
import type {RequestContext} from "@creatoros/contract";
import {runScheduledCollection,type Collector as ScheduledCollector,type ScheduledFlywheelCollector} from "../../modules/ai-runtime";
/** 原调度任务绑定与串行采集；不持有第二任务权威。 */
export function createCollectionExecution(ports:{scheduledCollectors:Record<string,ScheduledCollector>;
scheduledSignals:Pick<import("node:async_hooks").AsyncLocalStorage<AbortSignal>,"run">;
flywheelSourceKinds:ReadonlySet<string>;
scheduledFlywheel:Pick<ReturnType<typeof import("../../modules/ai-runtime").createScheduledFlywheelExecutionService>,"prepare"|"recoverQueued">;
schedulingService:Pick<ReturnType<typeof import("../../modules/scheduling").createSchedulingService>,"updateRun"|"getRun"|"listRunsByJob">;
aiService:Pick<ReturnType<typeof import("../../modules/ai").createAiService>,"getTask"|"markRunning"|"recordStep"|"markSucceeded"|"markFailed">;
trafficQueue?:{
 snapshot:(ctx:RequestContext)=>Promise<Array<{publicationId:string;externalId:string;requestedAt:string}>>;
 fail:(ctx:RequestContext,rows:Array<{publicationId:string;externalId:string;requestedAt:string}>,message:string)=>Promise<unknown>;
};
deps:{now:()=>string};
wakeScheduledFlywheel:()=>void;
prepareDailyTopic:(ctx:RequestContext,id:string)=>Promise<{executionTaskId:string}>;
runTaskWithEffectiveSkillSnapshot:(ctx:RequestContext,id:string,run:(signal:AbortSignal)=>void|Promise<void>)=>Promise<void>;
isNotLoggedInError:(error:unknown)=>boolean;}){
const {scheduledCollectors,scheduledSignals,flywheelSourceKinds,scheduledFlywheel,schedulingService,aiService,deps,wakeScheduledFlywheel,prepareDailyTopic,runTaskWithEffectiveSkillSnapshot,isNotLoggedInError}=ports;
  const enqueueCollectionRun=createAccountCollectionQueue();
  const collectFlywheel:ScheduledFlywheelCollector=(ctx,task,scope)=>enqueueCollectionRun(ctx,()=>scheduledSignals.run(scope.signal,async()=>{
    scope.signal.throwIfAborted();
    await runScheduledCollection(ctx,task,{
      ai:scope.ai,runs:{updateRun:(c,id,patch)=>{scope.signal.throwIfAborted();return schedulingService.updateRun(c,id,patch);}},
      collectors:Object.fromEntries(Object.entries(scheduledCollectors).map(([kind,collect])=>{const guarded:ScheduledCollector=async(c,t,report,execution)=>{scope.signal.throwIfAborted();const result=await collect(c,t,progress=>{scope.signal.throwIfAborted();report(progress);},execution);scope.signal.throwIfAborted();return result;};return [kind,guarded];})),isNotLoggedInError:isNotLoggedInError,now:deps.now,
    });
  }),scope.signal);

  const dispatchScheduledCollection = async (ctx: RequestContext, task: {
    id: string;
    taskType: string;
    inputData: Record<string, unknown>;
  }) => {
    if(flywheelSourceKinds.has(task.taskType.replace(/^scheduled\./,""))){
      const pending=task.taskType==="scheduled.self.traffic"?await ports.trafficQueue?.snapshot(ctx):undefined;
      let bound;
      try { bound=await scheduledFlywheel.prepare(ctx,task.id); }
      catch(error){
        const message=error instanceof Error?error.message:"采集准备失败";
        const current=await aiService.getTask(ctx,task.id);
        // 已交接的执行权不由准备层改终态；旧任务/数据保留，错误仍交调用方显示。
        if(!current.executionTaskId){
          await aiService.markFailed(ctx,task.id,`采集准备失败：${message}`);
          const settled=await aiService.getTask(ctx,task.id);
          let runId=task.inputData.jobRunId;
          // 重启读到的持久input不一定带dispatch内存里的jobRunId，按真实task关联回查。
          if(runId===undefined && typeof settled.inputData?.jobId==='string'){
            const matches=[];
            for(let offset=0;;offset+=100){
              const page=await schedulingService.listRunsByJob(ctx,settled.inputData.jobId,{limit:100,offset});
              matches.push(...page.rows.filter(run=>run.aiTaskId===task.id));
              if(offset+page.rows.length>=page.total||!page.rows.length)break;
            }
            if(matches.length>1)throw new Error('采集失败运行绑定不唯一',{cause:error});
            runId=matches[0]?.id;
          }
          if(!settled.executionTaskId && ['failed','cancelled'].includes(settled.status) && typeof runId==='string'){
            const run=await schedulingService.getRun(ctx,runId);
            if(run.aiTaskId!==task.id || run.jobId!==task.inputData.jobId)throw new Error('采集失败运行归属与原任务不符',{cause:error});
            if(run.status==='running')await schedulingService.updateRun(ctx,runId,{status:'failed',finishedAt:deps.now(),error:`采集准备失败：${message}`});
          }
          if(!settled.executionTaskId && ['failed','cancelled'].includes(settled.status) && pending)await ports.trafficQueue?.fail(ctx,pending,`流量补采未能启动，已有数据已保留，请重试或查看任务中心。`);
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
    return runTaskWithEffectiveSkillSnapshot(ctx, task.id, signal =>
      enqueueCollectionRun(ctx, () =>
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
        signal,
      ),
    );
  };

  const recoverQueuedCollection=()=>scheduledFlywheel.recoverQueued(async(_ctx,_id,error)=>{throw new Error("采集恢复准备失败，请检查任务中心和恢复日志",{cause:error});},async(ctx,id)=>{
    const task=await aiService.getTask(ctx,id);
    return dispatchScheduledCollection(ctx,task);
  });
return {collectFlywheel,dispatchScheduledCollection,recoverQueuedCollection};
}
