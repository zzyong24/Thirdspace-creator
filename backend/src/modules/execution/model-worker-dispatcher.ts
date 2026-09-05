import {createExecutionBrowserProfileLeaseService,BrowserProfileBusyError} from "./execution-browser-profile-lease.service";
import {createExecutionBrowserActionService} from "./execution-browser-action.service";
import {createExecutionBrowserLoginSnapshotService,BrowserLoginSnapshotInvalidError} from "./execution-browser-login-snapshot.service";
import {createExecutionBrowserSessionService} from "./execution-browser-session.service";
import {createExecutionScriptLocalService} from "./execution-script-local.service";
import {createExecutionScriptCheckpointService} from "./execution-script-checkpoint.service";
import {createScriptPartialFinalizationService} from "../ai/script-partial-finalization.service";
import {createExecutionReviewReportService} from "../review/execution-review-report.service";
import type {BrowserSessionsService} from "../browser-sessions";
import {createExecutionResearchEvidenceService} from "./execution-research-evidence.service";
import { createExecutionAgenticModelPorts } from "./execution-agentic-model-ports.service";
import { createExecutionAgenticToolPorts, type AgenticBackendTool } from "./execution-agentic-tool-ports.service";
import { createExecutionAgenticCandidateService } from "../ai/execution-agentic-candidate.service";
import { createExecutionCheckpointService } from "./execution-checkpoint.service";
import { createExecutionGenerationPorts } from "./execution-generation-ports.service";
import { eq,executionTasks,executionCalls,type Db } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import { workerPortInputSchemas,workerModelSpecSchema,type ExecutionRef } from "@creatoros/contract/execution-worker";
import { createExecutionCandidateService,type ExecutionCandidateDeps } from "../ai/execution-candidate.service";
import { createExecutionLeaseService } from "./execution-lease.service";
import { createExecutionWorkerCallPorts } from "./execution-worker-call-ports.service";
import { createExecutionWorkerOutcomeService } from "./execution-worker-outcome.service";
import { createPersistentTaskService } from "./persistent-task.service";
import { createWorkerSupervisor } from "./worker-supervisor";

interface WorkerDispatcherDeps {
  now?:()=>string;
  entryPath:string;
  workerId:string;
  budget:{maxCalls:number;maxTokens:number;deadlineMs:number};
  /** 生产适配器须按业务任务读取已冻结模型权威；不能只按当前账号设置猜测。 */
  resolveModelCredential(context:RequestContext,capability:string,owner:{aiTaskId:string;executionTaskId:string}):Promise<unknown>;
  pollMs?:number;
  /** 每个后端宿主的模型进程上限；每个进程同时执行一个任务。 */
  modelConcurrency?:number;
  onError?(code:string):void;
}
export interface ModelWorkerDispatcherDeps extends WorkerDispatcherDeps, ExecutionCandidateDeps {}
export interface AgenticWorkerDispatcherDeps extends WorkerDispatcherDeps {tools:Record<string,AgenticBackendTool>;browserSessions?:Pick<BrowserSessionsService,"getStateVersioned"|"saveStateVersioned">}
export function createModelWorkerDispatcher(db:Db,deps:ModelWorkerDispatcherDeps){return createDispatcher(db,{...deps,executionMode:"model"});}
export function createAgenticWorkerDispatcher(db:Db,deps:AgenticWorkerDispatcherDeps){return createDispatcher(db,{...deps,executionMode:"agentic.run"});}
/** 同一领取/进程池/取消/停止实现，命名端口按执行模式分别装配。 */
function createDispatcher(db:Db,deps:(ModelWorkerDispatcherDeps&{executionMode:"model"})|(AgenticWorkerDispatcherDeps&{executionMode:"agentic.run"})){

  const concurrency=deps.modelConcurrency ?? 2;
  if(!Number.isInteger(concurrency) || concurrency<1 || concurrency>8)throw new Error("MODEL_CONCURRENCY_INVALID");
  const now=deps.now ?? (()=>new Date().toISOString());
  const leases=createExecutionLeaseService(db,{now});
  const tasks=createPersistentTaskService(db,{now});
  const browserProfiles=createExecutionBrowserProfileLeaseService(db,{now});
  const activeWorkers=new Map<string,{ref:ExecutionRef;supervisor:ReturnType<typeof createWorkerSupervisor>}>();
  const calls=createExecutionWorkerCallPorts(db,{now,budget:deps.budget});
  const checkpoints=createExecutionCheckpointService(db,{now});
  const generation=createExecutionGenerationPorts(db,{now,budget:deps.budget});
  const scriptLocal=createExecutionScriptLocalService(db,{now,budget:deps.budget});
  const scriptCheckpoints=createExecutionScriptCheckpointService(db,{now});
  const outcomes=createExecutionWorkerOutcomeService(db,{now});
  const candidates=deps.executionMode==="model"?createExecutionCandidateService(db,deps):null;
  const scriptFinalizer=deps.executionMode==="model"?createScriptPartialFinalizationService(db,{...deps,onRecoveryError:()=>report("SCRIPT_RESULT_RECOVERY_FAILED")}):null;
  const reviewReports=deps.executionMode==="model"?createExecutionReviewReportService(db,{now}):null;
  const agentModels=deps.executionMode==="agentic.run"?createExecutionAgenticModelPorts(db,{now,budget:deps.budget}):null;
  const agentTools=deps.executionMode==="agentic.run"?createExecutionAgenticToolPorts(db,{now,budget:deps.budget,tools:deps.tools}):null;
  const browserSessions=deps.executionMode==="agentic.run" && deps.browserSessions?createExecutionBrowserSessionService(db,{now,budget:deps.budget,tools:deps.tools,sessions:deps.browserSessions}):null;
  const browserActions=deps.executionMode==="agentic.run"?createExecutionBrowserActionService(db,{now,tools:deps.tools}):null;
  const browserLogin=deps.executionMode==="agentic.run" && deps.browserSessions?createExecutionBrowserLoginSnapshotService(db,{now,sessions:deps.browserSessions}):null;
  const researchEvidence=deps.executionMode==="agentic.run"?createExecutionResearchEvidenceService(db,{now,budget:deps.budget,tools:deps.tools}):null;
  const agentCandidates=deps.executionMode==="agentic.run"?createExecutionAgenticCandidateService(db,{now}):null;
  const activeTools=new Map<string,{controller:AbortController;pending:Set<Promise<unknown>>}>();
  const executionKey=(ref:ExecutionRef)=>JSON.stringify(ref);
  let stopping=false;
  let timer:ReturnType<typeof setTimeout>|undefined;
  let draining:Promise<number>|undefined;
  const report=(code:string)=>{try{deps.onError?.(code);}catch{/* 诊断订阅故障不改变执行。 */}};
  const createSupervisor=()=>createWorkerSupervisor({entryPath:deps.entryPath,shutdownGraceMs:1000,ports:{
    async validate(ref,mode){if(stopping && mode==="admission")throw new Error("WORKER_HOST_STOPPING");await leases.withLease(ref,mode,async()=>{});},
    async invoke(ref,port,raw){
      if(port==="prepareBrowserAction" && browserActions){
        const scope=activeTools.get(executionKey(ref));if(!scope)throw new Error("STALE_EXECUTION");
        const preparation=(async()=>{
          scope.controller.signal.throwIfAborted();
          const prepared=await browserActions.prepare(ref,raw);
          if(prepared.status!=="ready")return prepared;
          try{
            await browserProfiles.acquireMany(ref,prepared.authorization.allowedDomains);
            scope.controller.signal.throwIfAborted();
            const loginStates=browserLogin?await browserLogin.read(ref):[];
            const checked=await browserActions.prepare(ref,raw);
            scope.controller.signal.throwIfAborted();
            return checked.status==="ready"?{...checked,loginStates}:checked;
          }catch(error){
            if(!(error instanceof BrowserProfileBusyError) && !(error instanceof BrowserLoginSnapshotInvalidError))throw error;
            const login=error instanceof BrowserLoginSnapshotInvalidError;
            return {status:"blocked",outcome:{status:login?"blocked":"error",summary:login?"网站登录状态需要恢复":"网站正在被另一个任务使用",evidence:[],error:{code:login?"needs_login":"transient",retryable:!login,recovery:login?"在网站登录入口重新登录后恢复":"等待当前网站任务结束后重试"},continuation:null,sideEffect:"none"}};
          }
        })();scope.pending.add(preparation);
        try{return await preparation;}finally{scope.pending.delete(preparation);}
      }
      if(port==="prepareScriptImport" && deps.executionMode==="model")return scriptLocal.prepareImport(ref,raw);
      if(port==="saveScriptVoiceover" && deps.executionMode==="model")return scriptCheckpoints.save(ref,raw);
      if(port==="saveScriptFallback" && deps.executionMode==="model")return scriptLocal.saveFallback(ref,raw);
      if(port==="readBrowserSession" && browserSessions){
        const scope=activeTools.get(executionKey(ref));if(!scope)throw new Error("STALE_EXECUTION");
        const reading=(async()=>{
          scope.controller.signal.throwIfAborted();
          const session=await browserSessions.read(ref,raw);
          try{await browserProfiles.acquire(ref,session.domain);}
          catch(error){
            if(!(error instanceof BrowserProfileBusyError))throw error;
            return {status:"blocked",outcome:{status:"error",summary:"网站正在被另一个任务使用",evidence:[],error:{code:"transient",retryable:true,recovery:"等待当前网站任务结束后重试"},continuation:null,sideEffect:"none"}};
          }
          scope.controller.signal.throwIfAborted();
          return browserSessions.read(ref,raw);
        })();scope.pending.add(reading);
        try{return await reading;}finally{scope.pending.delete(reading);}
      }
      if(port==="saveBrowserSession" && browserSessions)return browserSessions.save(ref,raw);
      if(port==="settleResearchRead" && researchEvidence)return researchEvidence.settleRead(ref,raw);
      if(port==="executeEvidenceRead" && researchEvidence)return researchEvidence.readWindow(ref,raw);
      if(port==="readCheckpoint")return checkpoints.read(ref);
      if(port==="saveCheckpoint")return checkpoints.save(ref,raw);
      if(port==="reserveAgenticModel" && agentModels)return agentModels.reserve(ref,raw);
      if(port==="reserveAgenticTool" && agentTools)return agentTools.reserve(ref,raw);
      if(port==="startAgenticTool" && agentTools)return agentTools.start(ref,raw);
      if(port==="settleAgenticTool" && agentTools)return agentTools.settle(ref,raw);
      if(port==="commitAgenticResult" && agentCandidates)return agentCandidates.commitAgenticResult(ref,raw);
      if(port==="executeAgenticTool" && agentTools){
        const scope=activeTools.get(executionKey(ref));if(!scope)throw new Error("STALE_EXECUTION");
        const execution=agentTools.execute(ref,raw,scope.controller.signal);scope.pending.add(execution);
        try{return await execution;}finally{scope.pending.delete(execution);}
      }
      if(port==="reserveGenerationCall" && deps.executionMode==="model")return generation.reserveGenerationCall(ref,raw);
      if(port==="settleGenerationCall")return generation.settleGenerationCall(ref,raw);
      if(port==="saveGenerationResult" && deps.executionMode==="model")return generation.saveGenerationResult(ref,raw);
      if(port==="readTaskContext")return calls.readTaskContext(ref);
      if(port==="reserveCall" && deps.executionMode==="model")return calls.reserveCall(ref,raw);
      if(port==="startCall")return calls.startCall(ref,raw);
      if(port==="settleCall" && deps.executionMode==="model")return calls.settleCall(ref,raw);
      if(port==="resolveModelCredential"){
        const input=workerPortInputSchemas.resolveModelCredential.parse(raw);
        const modelInput=await calls.readTaskContext(ref);
        if(input.capability!==modelInput.capability)throw new Error("MODEL_CAPABILITY_MISMATCH");
        const scope=await leases.withLease(ref,"admission",async({context,task})=>({context,aiTaskId:task.ownerId}));
        const credential=workerModelSpecSchema.parse(await deps.resolveModelCredential(scope.context,input.capability,{aiTaskId:scope.aiTaskId,executionTaskId:ref.executionTaskId}));
        // 凭据解析期间可能取消，返回私有凭据前再检查当前执行。
        await leases.withLease(ref,"admission",async()=>{});
        return credential;
      }
      if(port==="commitResult"){
        const input=workerPortInputSchemas.commitResult.parse(raw);
        if(input.outcome!=="succeeded"){
          if(scriptFinalizer && await scriptFinalizer.finalize(ref))return {status:"partial"};
          return outcomes.recordFailure(ref,input);
        }
        if(!candidates)throw new Error("UNSUPPORTED_AGENT_CANDIDATE_PORT");
        const skillId=await leases.withLease(ref,"settlement",async({task})=>(task.payload as {modelInput?:{skillId?:string}}).modelInput?.skillId);
        if(skillId==="script.review" && reviewReports)return reviewReports.commitResult(ref,input);
        return candidates.commitResult(ref,input);
      }
      if(port==="heartbeat")return leases.withLease(ref,"admission",async({tx,task})=>{
        await tx.update(executionTasks).set({heartbeatAt:now(),leaseExpiresAt:new Date(Date.parse(now())+60000).toISOString()}).where(eq(executionTasks.id,task.id));
        return {};
      });
      throw new Error("UNSUPPORTED_MODEL_WORKER_PORT");
    },
  }});
  const supervisors=Array.from({length:concurrency},createSupervisor);
  async function acknowledge(ref:ExecutionRef){
    await leases.withLease(ref,"settlement",async({tx,task})=>{
      const status=task.status==="pause_requested" ? "paused" : task.status==="cancel_requested" ? "cancelled" : null;
      if(status)await tx.update(executionTasks).set({status,leaseOwner:null,leaseExpiresAt:null,heartbeatAt:null,updatedAt:now()}).where(eq(executionTasks.id,task.id));
    });
  }
  const drainOnce=():Promise<number>=>{
    if(draining)return draining;
    if(stopping)return Promise.resolve(0);
    draining=(async()=>{
      if(scriptFinalizer)await scriptFinalizer.recoverDue();
      await tasks.recoverExpiredLeases();
      let activeCount=0;
      let pendingClaims=0;
      const counts=await Promise.allSettled(supervisors.map(async supervisor=>{
      let count=0;
      while(!stopping){
        pendingClaims++;
        let claim:Awaited<ReturnType<typeof tasks.claimNext>>;
        try{claim=await tasks.claimNext({workerId:deps.workerId,kinds:["ai_task"],executionMode:deps.executionMode});}
        finally{pendingClaims--;}
        if(stopping)break;
        if(!claim){
          // 空闲进程继续查看队列，避免新短任务被另一个长请求挡住。
          if(activeCount===0 && pendingClaims===0)break;
          await new Promise(resolve=>setTimeout(resolve,Math.max(100,deps.pollMs ?? 1000)));
          continue;
        }
        activeCount++;
        const ref={executionTaskId:claim.task.id,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
        const toolScope={controller:new AbortController(),pending:new Set<Promise<unknown>>()};
        activeTools.set(executionKey(ref),toolScope);
        activeWorkers.set(executionKey(ref),{ref,supervisor});
        let watching=true;
        let controlTimer:ReturnType<typeof setTimeout>|undefined;
        const watch=async()=>{
          try{
            const status=await leases.withLease(ref,"settlement",async({task})=>task.status);
            if(watching && (status==="pause_requested" || status==="cancel_requested")){toolScope.controller.abort();supervisor.cancel(ref);}
          }catch{if(watching){toolScope.controller.abort();try{supervisor.cancel(ref);}catch{/* 进程可能已经退出。 */}}}
          if(watching)controlTimer=setTimeout(()=>{void watch();},250);
        };
        controlTimer=setTimeout(()=>{void watch();},250);
        try{
          const deadline=await leases.withLease(ref,"admission",async({task})=>task.deadlineAt);
          if(stopping)break;
          if(!deadline)throw new Error("PREPARED_DEADLINE_MISSING");
          if(deps.executionMode==="agentic.run"){
            try{
              const capabilities=await supervisor.start();
              if(!capabilities.includes("agentic.run"))throw new Error("AGENT_RUNTIME_UNAVAILABLE");
            }catch{
              if(!stopping){
                const unknown=await leases.withLease(ref,"settlement",async({tx,task})=>{
                  const calls=await tx.select({status:executionCalls.status}).from(executionCalls).where(eq(executionCalls.executionTaskId,task.id));
                  return calls.some(call=>call.status==="started" || call.status==="unknown");
                });
                if(!stopping)await outcomes.recordFailure(ref,{outcome:unknown?"unknown_result":"waiting_user",errorCode:unknown?"AGENT_CALL_REQUIRES_RECONCILIATION":"AGENT_RUNTIME_UNAVAILABLE"});
              }
              throw new Error("AGENT_RUNTIME_UNAVAILABLE");
            }
            if(stopping)break;
          }
          await supervisor.run(ref,Date.parse(deadline));
        }catch{
          // 不推测外部提交结果；持久恢复按调用账本决定恢复/待对账，禁止换键重放。
          report("MODEL_WORKER_RUN_INTERRUPTED");
        }finally{
          watching=false;if(controlTimer)clearTimeout(controlTimer);
          toolScope.controller.abort();await Promise.allSettled([...toolScope.pending]);activeTools.delete(executionKey(ref));
          try{
            const held=await browserProfiles.listOwned(ref);
            if(held.length){
              if(await supervisor.stopExecutionTree(ref)){
                for(const profile of held)await browserProfiles.releaseAfterWorkerStopped(ref,profile.leaseId);
              }else report("BROWSER_PROFILE_CLEANUP_UNVERIFIED");
            }
          }catch{report("BROWSER_PROFILE_CLEANUP_UNVERIFIED");}
          activeWorkers.delete(executionKey(ref));
          if(scriptFinalizer && !stopping)await scriptFinalizer.finalize(ref).catch(()=>{report("SCRIPT_RESULT_FINALIZATION_FAILED");});
          await acknowledge(ref).catch(()=>{});
          activeCount--;
        }
        count++;
      }
      return count;
      }));
      const failure=counts.find(result=>result.status==="rejected");
      if(failure?.status==="rejected")throw failure.reason;
      return counts.reduce((total,result)=>total+(result.status==="fulfilled" ? result.value : 0),0);
    })().finally(()=>{draining=undefined;});
    return draining;
  };
  const tick=async()=>{
    try{await drainOnce();}catch{report("MODEL_WORKER_POLL_FAILED");}
    if(!stopping){timer=setTimeout(()=>{void tick();},Math.max(100,deps.pollMs ?? 1000));timer.unref?.();}
  };
  return {
    drainOnce,
    start(){if(timer || draining || stopping)return;void tick();},
    async stop(){stopping=true;for(const scope of activeTools.values())scope.controller.abort();if(timer)clearTimeout(timer);
      // 有浏览器资源的执行先核实整棵子树停止，不能先让根进程退出丢失后代身份。
      const profileStops=await Promise.allSettled([...activeWorkers.values()].map(async({ref,supervisor})=>{
        if((await browserProfiles.listOwned(ref)).length)await supervisor.stopExecutionTree(ref);
      }));
      // 租约查询失败也必须继续停止全部 Worker 并等待任务收尾，最后保留原始错误。
      const workerStops=await Promise.allSettled(supervisors.map(supervisor=>supervisor.stop()));
      const drained=await Promise.allSettled([draining]);
      const failures=[...profileStops,...workerStops,...drained]
        .filter((result):result is PromiseRejectedResult=>result.status==="rejected")
        .map(result=>result.reason);
      if(failures.length)throw new AggregateError(failures,"MODEL_WORKER_SHUTDOWN_FAILED");},
  };
}
