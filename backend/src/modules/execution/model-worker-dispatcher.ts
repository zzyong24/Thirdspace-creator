import {executionBudgetSchema} from "@creatoros/contract/execution-worker";
import {createScriptSimilarityCompletionService} from "../ai/script-similarity-completion.service";
import {createTopicPreferenceCompletionService} from "../ai/topic-preference-completion.service";
import {createExecutionChatFallbackService} from "./execution-chat-fallback.service";
import {createExecutionAssetProcessingService} from "./execution-asset-processing.service";
import {createReconstructCompletionService} from "../ai/reconstruct-completion.service";
import {createExecutionVideoService} from "./execution-video.service";
import {createExecutionTranscribeWorkflowService,type TranscribeWorkflowDeps} from "./execution-transcribe-workflow.service";
import {createExecutionTranscribeSourceService,type TranscribeSourceDeps} from "./execution-transcribe-source.service";
import {createExecutionCoverService,type CoverExecutionPorts} from "./execution-cover.service";
import {createExecutionTranscribePostprocessService} from "./execution-transcribe-postprocess.service";
import {createExecutionTranscribePreparationService} from "./execution-transcribe-preparation.service";
import {createExecutionTranscribeAudioService} from "./execution-transcribe-audio.service";
import {createExecutionAsrPorts} from "./execution-asr-ports.service";
import {createExecutionAssetPorts} from "./execution-asset-ports.service";
import {createExecutionChatToolPorts,readExecutionChatTask,type ChatBackendTool} from "./execution-chat-tool-ports.service";
import {createWorkbenchPlanService} from "./workbench-plan.service";
import {createExecutionModelIdentityService} from "./execution-model-identity.service";
import {createChatTurnCompletionService} from "../ai/chat-turn-completion.service";
import {createExecutionStreamService} from "./execution-stream.service";
import {createCopilotReplyCompletionService} from "../ai/copilot-reply-completion.service";
import {createExecutionTopicReadService} from "./execution-topic-read.service";
import {createDailyTopicCompletionService,type DailyTopicCompletionPorts} from "../ai/daily-topic-completion.service";
import {buildTrendQuery} from "@creatoros/ai-worker";
import {createExecutionBrowserProfileLeaseService,BrowserProfileBusyError} from "./execution-browser-profile-lease.service";
import {createExecutionBrowserActionService} from "./execution-browser-action.service";
import {createExecutionBrowserEvidenceService} from "./execution-browser-evidence.service";
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
  /** 现有队列领取前有界恢复已提交任务的准备；不得直接执行模型。 */
  recoverPendingPreparation?(signal:AbortSignal):Promise<void>;
}
export interface ModelWorkerDispatcherDeps extends WorkerDispatcherDeps, ExecutionCandidateDeps {assetProcessing?:Parameters<typeof createExecutionAssetProcessingService>[1];video?:Pick<Parameters<typeof createExecutionVideoService>[1],"resolveModelSpec">;transcribeWorkflow?:Omit<TranscribeWorkflowDeps,"now">;transcribeSource?:TranscribeSourceDeps;cover?:CoverExecutionPorts;transcribePostprocess?:Pick<Parameters<typeof createExecutionTranscribePostprocessService>[1],"resolveModelSpec"|"readContext"|"maxOutputTokens">;transcribePreparation?:Pick<Parameters<typeof createExecutionTranscribePreparationService>[1],"resolveSpec"|"prepareSpec">;transcribeAudioStorage?:Parameters<typeof createExecutionTranscribeAudioService>[1]["objectStorageForCtx"];resolveAssetCredential?:Parameters<typeof createExecutionAssetPorts>[0]["resolveCredential"];assetStorage?:Parameters<typeof createExecutionAssetPorts>[0]["objectStorageForCtx"];browserSessions?:Pick<BrowserSessionsService,"getStateVersioned"|"saveStateVersioned">;dailyTopicPorts?:DailyTopicCompletionPorts}
export type ChatWorkerDispatcherDeps = WorkerDispatcherDeps & {resolveRedfoxCredential?:Parameters<typeof createExecutionChatToolPorts>[1]["resolveRedfoxCredential"];resolveFallbackModelCredential?(context:RequestContext):Promise<unknown|null>;webRead?:Parameters<typeof createExecutionChatToolPorts>[1]["webRead"];resolveWorkbenchScreenshot?(ref:ExecutionRef,input:{callId:string;dataRef:string}):Promise<{mimeType:"image/png";data:string}>} & (
 {tools:Record<string,ChatBackendTool>;resolveTools?:never} |
 {tools?:never;resolveTools(context:RequestContext,input:Awaited<ReturnType<typeof readExecutionChatTask>>["input"],execution:ExecutionRef,signal:AbortSignal):Promise<Record<string,ChatBackendTool>>}
);
export interface AgenticWorkerDispatcherDeps extends WorkerDispatcherDeps {tools:Record<string,AgenticBackendTool>;browserSessions?:Pick<BrowserSessionsService,"getStateVersioned"|"saveStateVersioned">}
export function createModelWorkerDispatcher(db:Db,deps:ModelWorkerDispatcherDeps){return createDispatcher(db,{...deps,executionMode:"model"});}
export function createAgenticWorkerDispatcher(db:Db,deps:AgenticWorkerDispatcherDeps){return createDispatcher(db,{...deps,executionMode:"agentic.run"});}
export function createChatWorkerDispatcher(db:Db,deps:ChatWorkerDispatcherDeps){return createDispatcher(db,{...deps,executionMode:"chat.run"});}
/** 同一领取/进程池/取消/停止实现，命名端口按执行模式分别装配。 */
function createDispatcher(db:Db,deps:(ModelWorkerDispatcherDeps&{executionMode:"model"})|(AgenticWorkerDispatcherDeps&{executionMode:"agentic.run"})|(ChatWorkerDispatcherDeps&{executionMode:"chat.run"})){

  if(deps.executionMode==="chat.run" && (Boolean(deps.tools)===(typeof deps.resolveTools==="function")))throw new Error("CHAT_TOOL_RESOLVER_CONFIG_INVALID");
  const concurrency=deps.modelConcurrency ?? 2;
  if(!Number.isInteger(concurrency) || concurrency<1 || concurrency>8)throw new Error("MODEL_CONCURRENCY_INVALID");
  const now=deps.now ?? (()=>new Date().toISOString());
  const leases=createExecutionLeaseService(db,{now});
  const workbenchPlans=createWorkbenchPlanService(db,{now});
  const modelIdentity=createExecutionModelIdentityService(db,{now});
  const chatFallback=deps.executionMode==="chat.run"?createExecutionChatFallbackService(db,{now,resolve:c=>deps.resolveFallbackModelCredential?.(c)??Promise.resolve(null)}):null;
  const tasks=createPersistentTaskService(db,{now});
  const browserProfiles=createExecutionBrowserProfileLeaseService(db,{now});
  const activeWorkers=new Map<string,{ref:ExecutionRef;supervisor:ReturnType<typeof createWorkerSupervisor>}>();
  const calls=createExecutionWorkerCallPorts(db,{now,budget:deps.budget});
  const checkpoints=createExecutionCheckpointService(db,{now});
  const streamEvents=createExecutionStreamService(db,{now});
  const generation=createExecutionGenerationPorts(db,{now,budget:deps.budget});
  const topicReads=deps.executionMode==="model" ? createExecutionTopicReadService(db,{now,budget:deps.budget,buildTrendQuery,sessions:deps.browserSessions,validateDailyRun:deps.dailyTopicPorts?.validateRun}) : null;
  const scriptLocal=createExecutionScriptLocalService(db,{now,budget:deps.budget});
  const scriptCheckpoints=createExecutionScriptCheckpointService(db,{now});
  const outcomes=createExecutionWorkerOutcomeService(db,{now});
  const transcribeAudio=deps.executionMode==="model"&&deps.transcribeAudioStorage?createExecutionTranscribeAudioService(db,{now,objectStorageForCtx:deps.transcribeAudioStorage}):null;
  const asrPorts=deps.executionMode==="model"?createExecutionAsrPorts(db,{now,budget:deps.budget}):null;
  const transcribePreparation=deps.executionMode==="model"&&transcribeAudio&&asrPorts&&deps.transcribePreparation?createExecutionTranscribePreparationService(db,{now,audio:transcribeAudio,asr:asrPorts,...deps.transcribePreparation}):null;
  const transcribePostprocess=deps.executionMode==="model"&&deps.transcribePostprocess?createExecutionTranscribePostprocessService(db,{now,budget:deps.budget,...deps.transcribePostprocess}):null;
  const transcribeWorkflow=deps.executionMode==="model"&&deps.transcribeWorkflow&&transcribePostprocess?createExecutionTranscribeWorkflowService(db,{...deps.transcribeWorkflow,now,postprocess:transcribePostprocess}):null;
  const transcribeSource=deps.executionMode==="model"&&deps.transcribeSource?createExecutionTranscribeSourceService(db,{...deps.transcribeSource,now}):null;
  const assetPorts=deps.executionMode==="model" && deps.assetStorage ? createExecutionAssetPorts({db,now,budget:deps.budget,objectStorageForCtx:deps.assetStorage,resolveCredential:deps.resolveAssetCredential}) : null;
  const cover=deps.executionMode==="model" && deps.cover ? createExecutionCoverService(db,{now,budget:deps.budget,...deps.cover}) : null;
  const video=deps.executionMode==="model" && deps.video ? createExecutionVideoService(db,{now,budget:deps.budget,...deps.video}) : null;
  const candidates=deps.executionMode==="model"?createExecutionCandidateService(db,deps):null;
  const dailyTopics=deps.executionMode==="model"&&deps.dailyTopicPorts?createDailyTopicCompletionService(db,{now,ports:deps.dailyTopicPorts}):null;
  const scriptFinalizer=deps.executionMode==="model"?createScriptPartialFinalizationService(db,{...deps,onRecoveryError:()=>report("SCRIPT_RESULT_RECOVERY_FAILED")}):null;
  const chatReplies=createChatTurnCompletionService(db,{now});
  const assetProcessing=deps.executionMode==="model"&&deps.assetProcessing?createExecutionAssetProcessingService(db,{...deps.assetProcessing,now}):null;
  const similarities=deps.executionMode==="model"?createScriptSimilarityCompletionService(db,{now}):null;
  const preferences=deps.executionMode==="model"?createTopicPreferenceCompletionService(db,{now}):null;
  const reconstructions=deps.executionMode==="model"?createReconstructCompletionService(db,{now}):null;
  const copilotReplies=deps.executionMode==="model"?createCopilotReplyCompletionService(db,{now}):null;
  const reviewReports=deps.executionMode==="model"?createExecutionReviewReportService(db,{now}):null;
  const agentModels=deps.executionMode==="agentic.run"?createExecutionAgenticModelPorts(db,{now,budget:deps.budget}):null;
  const resolveGenerationCredential=async(context:RequestContext,capability:string,ref:ExecutionRef,signal?:AbortSignal)=>{
    signal?.throwIfAborted();await readExecutionChatTask(db,ref,now);await calls.readTaskContext(ref);
    const owner=await leases.withLease(ref,"admission",async({task})=>({aiTaskId:task.ownerId,executionTaskId:task.id}));
    const credential=await deps.resolveModelCredential(context,capability,owner);signal?.throwIfAborted();return credential;
  };
  const staticChatTools=deps.executionMode==="chat.run" && deps.tools?createExecutionChatToolPorts(db,{now,budget:deps.budget,tools:deps.tools,resolveGenerationCredential,resolveRedfoxCredential:deps.resolveRedfoxCredential,webRead:deps.webRead}):null;
  const agentTools=deps.executionMode==="agentic.run"?createExecutionAgenticToolPorts(db,{now,budget:deps.budget,tools:deps.tools}):null;
  const browserSessions=deps.executionMode==="agentic.run" && deps.browserSessions?createExecutionBrowserSessionService(db,{now,budget:deps.budget,tools:deps.tools,sessions:deps.browserSessions}):null;
  const browserActions=deps.executionMode==="agentic.run"?createExecutionBrowserActionService(db,{now,tools:deps.tools}):null;
  const browserEvidence=deps.executionMode==="agentic.run"?createExecutionBrowserEvidenceService(db,{now,tools:deps.tools,budget:deps.budget}):null;
  const browserLogin=deps.executionMode==="agentic.run" && deps.browserSessions?createExecutionBrowserLoginSnapshotService(db,{now,sessions:deps.browserSessions}):null;
  const researchEvidence=deps.executionMode==="agentic.run"?createExecutionResearchEvidenceService(db,{now,budget:deps.budget,tools:deps.tools}):null;
  const agentCandidates=deps.executionMode==="agentic.run"?createExecutionAgenticCandidateService(db,{now}):null;
  type ChatPorts=ReturnType<typeof createExecutionChatToolPorts>;
  type ToolScope={controller:AbortController;pending:Set<Promise<unknown>>;chatPorts?:Promise<ChatPorts>;chatReady?:boolean};
  const activeTools=new Map<string,ToolScope>();
  const executionKey=(ref:ExecutionRef)=>JSON.stringify([ref.executionTaskId,ref.attempt,ref.fenceToken]);
  async function getChatTools(ref:ExecutionRef):Promise<ChatPorts>{
    const scope=activeTools.get(executionKey(ref));
    if(!scope || deps.executionMode!=="chat.run")throw new Error("STALE_EXECUTION");
    if(!scope.chatPorts)scope.chatPorts=(async()=>{
      const signal=scope.controller.signal;signal.throwIfAborted();
      if(staticChatTools)return staticChatTools;
      const {context,input}=await readExecutionChatTask(db,ref,now);
      await calls.readTaskContext(ref);
      signal.throwIfAborted();
      const work=deps.resolveTools!(structuredClone(context),structuredClone(input),{...ref},signal);
      // 解析器只能构造端口；不响应取消的迟到解析不能阻塞退出或取得执行权。
      const resolved=await new Promise<Record<string,ChatBackendTool>>((resolve,reject)=>{
        const abort=()=>reject(signal.reason??new Error("CHAT_TOOL_RESOLUTION_CANCELLED"));
        signal.addEventListener("abort",abort,{once:true});
        work.then(value=>{signal.removeEventListener("abort",abort);resolve(value);},error=>{signal.removeEventListener("abort",abort);reject(error);});
        if(signal.aborted)abort();
      });
      signal.throwIfAborted();
      const tools=Object.fromEntries(Object.entries(resolved).map(([name,tool])=>[name,{...tool}]));
      const ports=createExecutionChatToolPorts(db,{now,budget:deps.budget,tools,resolveGenerationCredential,resolveRedfoxCredential:deps.resolveRedfoxCredential,webRead:deps.webRead});
      await ports.validateTask(ref);signal.throwIfAborted();
      return ports;
    })();
    return scope.chatPorts;
  }
  let stopping=false;
  let timer:ReturnType<typeof setTimeout>|undefined;
  let draining:Promise<number>|undefined;
  const report=(code:string)=>{try{deps.onError?.(code);}catch{/* 诊断订阅故障不改变执行。 */}};
  const createSupervisor=()=>createWorkerSupervisor({entryPath:deps.entryPath,shutdownGraceMs:1000,ports:{
    async validate(ref,mode){if(stopping && mode==="admission")throw new Error("WORKER_HOST_STOPPING");await leases.withLease(ref,mode,async()=>{});},
    async invoke(ref,port,raw){
      if(["resolveVideoModel","reserveVideoModel","recordVideoStep","saveVideoCheckpoint","saveVideoResult"].includes(port)){
        const scope=activeTools.get(executionKey(ref));if(!scope||!video)throw new Error("VIDEO_PORT_UNAVAILABLE");
        const work=video.invoke(ref,port,raw,scope.controller.signal);scope.pending.add(work);try{return await work;}finally{scope.pending.delete(work);}
      }
      if(["reserveCoverModel","startCoverModel","settleCoverModel","prepareCoverImage","readCoverReference"].includes(port)){
        const scope=activeTools.get(executionKey(ref));if(!cover||!scope)throw new Error("COVER_PORT_UNAVAILABLE");
        const work=(async()=>{
          // 已发出的文案调用允许在取消后结算，不能继承已中止的信号。
          if(port==="settleCoverModel")return cover.settleModel(ref,raw);
          scope.controller.signal.throwIfAborted();
          if(port==="reserveCoverModel")return cover.reserveModel(ref,raw,scope.controller.signal);
          if(port==="startCoverModel")return cover.startModel(ref,raw);
          if(port==="prepareCoverImage")return cover.prepareImage(ref,raw,scope.controller.signal);
          return cover.readReference(ref,raw,scope.controller.signal);
        })();
        scope.pending.add(work);try{return await work;}finally{scope.pending.delete(work);}
      }
      if(["prepareTranscribeItem","recordTranscribeSource","saveTranscribeArtifact","failTranscribeItem","completeTranscribeTask","acquireTranscribeProfile","acquireTranscribeChannel","reportTranscribeChannel"].includes(port)){
        const scope=activeTools.get(executionKey(ref));if(!scope)throw new Error("TRANSCRIBE_SCOPE_UNAVAILABLE");
        const service=["acquireTranscribeProfile","acquireTranscribeChannel","reportTranscribeChannel"].includes(port)?transcribeSource:transcribeWorkflow;
        if(!service)throw new Error("TRANSCRIBE_WORKFLOW_UNAVAILABLE");
        const work=service.invoke(ref,port,raw,scope.controller.signal);scope.pending.add(work);try{return await work;}finally{scope.pending.delete(work);}
      }
      if(["prepareTranscribePostprocess","readTranscribePostprocess","reserveTranscribePostprocess","startTranscribePostprocess","settleTranscribePostprocess","saveTranscribePostprocess"].includes(port)){
        const scope=activeTools.get(executionKey(ref));if(!transcribePostprocess||!scope)throw new Error("TRANSCRIBE_POSTPROCESS_PORT_UNAVAILABLE");
        const work=transcribePostprocess.invoke(ref,port,raw,port==="settleTranscribePostprocess"?undefined:scope.controller.signal);
        scope.pending.add(work);try{return await work;}finally{scope.pending.delete(work);}
      }
      if(["prepareTranscribeAsr","readTranscribeAudio","saveTranscribeAudio"].includes(port)){
        const scope=activeTools.get(executionKey(ref));if(!transcribeAudio||!scope)throw new Error("TRANSCRIBE_AUDIO_PORT_UNAVAILABLE");
        if(port==="prepareTranscribeAsr"&&!transcribePreparation)throw new Error("TRANSCRIBE_PREPARATION_UNAVAILABLE");
        const work=port==="prepareTranscribeAsr"?transcribePreparation!.prepare(ref,workerPortInputSchemas.prepareTranscribeAsr.parse(raw).awemeId,scope.controller.signal):transcribeAudio.invoke(ref,port,raw,scope.controller.signal);scope.pending.add(work);try{return await work;}finally{scope.pending.delete(work);}
      }
      if(["selectTranscribeLocalFallback","reserveAsrRequest","startAsrRequest","settleAsrRequest"].includes(port)){
        if(!asrPorts)throw new Error("ASR_PORT_UNAVAILABLE");
        return asrPorts.invoke(ref,port,raw);
      }
      if(["resolveAssetCredential","settleAssetCall","reserveAssetCall","startAssetCall","saveAssetResult","recoverAssetResult","readAssetProviderJob","recordAssetProviderJob"].includes(port)){
        if(!assetPorts)throw new Error("ASSET_STORAGE_UNAVAILABLE");
        const scope=activeTools.get(executionKey(ref));if(!scope)throw new Error("STALE_EXECUTION");
        const settlement=["settleAssetCall","saveAssetResult","recoverAssetResult","recordAssetProviderJob"].includes(port);
        const work=assetPorts.invoke(ref,port,raw,settlement?undefined:scope.controller.signal);
        scope.pending.add(work);try{return await work;}finally{scope.pending.delete(work);}
      }
      const chatTools=deps.executionMode==="chat.run" && ["prepareChatRedfox","settleChatRedfox","resolveChatWebReadSearch","readChatWebReadCache","failChatWebRead","prepareChatWebRead","observeChatWebRead","restoreChatWebRead","completeChatWebRead","readChatWebReadSession","saveChatWebReadSession","prepareChatResearch","settleChatResearch","failChatGeneration","restoreChatGeneration","resolveChatGenerationCredential","prepareChatGeneration","reserveChatGenerationModel","startChatGenerationModel","settleChatGenerationModel","completeChatGeneration","failChatScriptDraft","restoreChatScriptDraft","prepareChatScriptDraft","reserveChatScriptDraftModel","startChatScriptDraftModel","settleChatScriptDraftModel","completeChatScriptDraft","failChatHooks","restoreChatHooks","prepareChatHooks","reserveChatHooksModel","startChatHooksModel","settleChatHooksModel","completeChatHooks","checkChatToolApproval","reserveAgenticTool","startAgenticTool","settleAgenticTool","executeAgenticTool"].includes(port)?await getChatTools(ref):null;
      const currentTools=chatTools??agentTools;
      if(chatTools && (port==="prepareChatRedfox"||port==="settleChatRedfox")){
        const scope=activeTools.get(executionKey(ref));if(!scope)throw Error("STALE_EXECUTION");
        const work=port==="prepareChatRedfox"?chatTools.redfox.prepare(ref,raw,scope.controller.signal):chatTools.redfox.settle(ref,raw);
        scope.pending.add(work);try{return await work;}finally{scope.pending.delete(work);}
      }
      if(chatTools?.webRead && ["resolveChatWebReadSearch","readChatWebReadCache","failChatWebRead","prepareChatWebRead","observeChatWebRead","restoreChatWebRead","completeChatWebRead","readChatWebReadSession","saveChatWebReadSession"].includes(port)) {
        const scope=activeTools.get(executionKey(ref));if(!scope)throw new Error("STALE_EXECUTION");
        const web=chatTools.webRead;
        const work=(async()=>{
          if(port==="completeChatWebRead")return web.complete(ref,raw,scope.controller.signal);
          if(port==="failChatWebRead")return web.fail(ref,raw);
          if(port==="readChatWebReadCache")return web.cache(ref,raw,scope.controller.signal);
          scope.controller.signal.throwIfAborted();
          if(port==="resolveChatWebReadSearch")return web.resolveSearch(ref,raw,scope.controller.signal);
          if(port==="readChatWebReadSession") {
            const session=await web.readSession(ref,raw,scope.controller.signal);
            try{await browserProfiles.acquire(ref,session.domain);}
            catch(error){if(!(error instanceof BrowserProfileBusyError))throw error;return {status:"blocked",outcome:{status:"error",summary:"网站正在被另一个任务使用",evidence:[],error:{code:"transient",retryable:true,recovery:"等待当前网站任务结束后重试"},continuation:null,sideEffect:"none"}};}
            scope.controller.signal.throwIfAborted();return web.readSession(ref,raw,scope.controller.signal);
          }
          if(port==="saveChatWebReadSession")return web.saveSession(ref,raw,scope.controller.signal);
          if(port==="observeChatWebRead")return web.observe(ref,raw,scope.controller.signal);
          if(port==="restoreChatWebRead")return web.restore(ref,raw,scope.controller.signal);
          return web.prepare(ref,raw,scope.controller.signal);
        })();scope.pending.add(work);try{return await work;}finally{scope.pending.delete(work);}
      }
      if(port==="settleChatResearch" && chatTools)return chatTools.research.settle(ref,raw);
      if(port==="settleChatGenerationModel" && chatTools)return chatTools.generation.settle(ref,raw);
      if(chatTools && ["prepareChatResearch","failChatGeneration","restoreChatGeneration","resolveChatGenerationCredential","prepareChatGeneration","reserveChatGenerationModel","startChatGenerationModel","completeChatGeneration"].includes(port)){
        const scope=activeTools.get(executionKey(ref));if(!scope)throw new Error("STALE_EXECUTION");
        const signal=scope.controller.signal;
        const work=port==="prepareChatResearch"?chatTools.research.prepare(ref,raw,signal):port==="failChatGeneration"?chatTools.generation.fail(ref,raw,signal):port==="restoreChatGeneration"?chatTools.generation.restore(ref,raw,signal):port==="resolveChatGenerationCredential"?chatTools.generation.resolveCredential(ref,raw,signal):port==="prepareChatGeneration"?chatTools.generation.prepare(ref,raw,signal):port==="reserveChatGenerationModel"?chatTools.generation.reserve(ref,raw,signal):port==="startChatGenerationModel"?chatTools.generation.start(ref,raw,signal):chatTools.generation.complete(ref,raw,signal);
        scope.pending.add(work);try{return await work;}finally{scope.pending.delete(work);}
      }
      if(port==="checkChatToolApproval" && chatTools)return chatTools.check(ref,raw,activeTools.get(executionKey(ref))?.controller.signal);
      if(port==="settleChatScriptDraftModel" && chatTools)return chatTools.scriptDraft.settle(ref,raw);
      if(chatTools && ["failChatScriptDraft","restoreChatScriptDraft","prepareChatScriptDraft","reserveChatScriptDraftModel","startChatScriptDraftModel","completeChatScriptDraft"].includes(port)){
        const scope=activeTools.get(executionKey(ref));if(!scope)throw new Error("STALE_EXECUTION");
        const signal=scope.controller.signal;
        const work=port==="failChatScriptDraft"?chatTools.scriptDraft.fail(ref,raw,signal):port==="restoreChatScriptDraft"?chatTools.scriptDraft.restore(ref,raw,signal):port==="prepareChatScriptDraft"?chatTools.scriptDraft.prepare(ref,raw,signal):port==="reserveChatScriptDraftModel"?chatTools.scriptDraft.reserve(ref,raw,signal):port==="startChatScriptDraftModel"?chatTools.scriptDraft.start(ref,raw,signal):chatTools.scriptDraft.complete(ref,raw,signal);
        scope.pending.add(work);try{return await work;}finally{scope.pending.delete(work);}
      }
      if(port==="settleChatHooksModel" && chatTools)return chatTools.hooks.settle(ref,raw);
      if(chatTools && ["failChatHooks","restoreChatHooks","prepareChatHooks","reserveChatHooksModel","startChatHooksModel","completeChatHooks"].includes(port)){
        const scope=activeTools.get(executionKey(ref));if(!scope)throw new Error("STALE_EXECUTION");
        const signal=scope.controller.signal;
        const work=port==="failChatHooks"?chatTools.hooks.fail(ref,raw,signal):port==="restoreChatHooks"?chatTools.hooks.restore(ref,raw,signal):port==="prepareChatHooks"?chatTools.hooks.prepare(ref,raw,signal):port==="reserveChatHooksModel"?chatTools.hooks.reserve(ref,raw,signal):port==="startChatHooksModel"?chatTools.hooks.start(ref,raw,signal):chatTools.hooks.complete(ref,raw,signal);
        scope.pending.add(work);try{return await work;}finally{scope.pending.delete(work);}
      }
      if(port==="commitChatResult")return chatReplies.commitResult(ref,raw);
      if(port==="readWorkbenchPlan")return workbenchPlans.status(ref);
      if(port==="saveWorkbenchPlan")return workbenchPlans.save(ref,workerPortInputSchemas.saveWorkbenchPlan.parse(raw));
      if(port==="resolveWorkbenchScreenshot"&&deps.executionMode==="chat.run"){
        if(!deps.resolveWorkbenchScreenshot)throw new Error("SCREENSHOT_MEDIA_UNAVAILABLE");
        return deps.resolveWorkbenchScreenshot(ref,workerPortInputSchemas.resolveWorkbenchScreenshot.parse(raw));
      }
      if(port==="appendStreamEvents")return streamEvents.append(ref,raw);
      if(port==="completeDailyTopicSkip"&&dailyTopics){workerPortInputSchemas.completeDailyTopicSkip.parse(raw);return dailyTopics.completeDailyTopicSkip(ref);}
      if(port==="commitDailyTopicResult"&&dailyTopics)return dailyTopics.commitResult(ref,workerPortInputSchemas.commitDailyTopicResult.parse(raw));
      if(topicReads){
        if(port==="reserveTopicRead")return topicReads.reserveTopicRead(ref,raw);
        if(port==="startTopicRead")return topicReads.startTopicRead(ref,raw);
        if(port==="settleTopicRead")return topicReads.settleTopicRead(ref,raw);
        if(port==="readTopicRead")return topicReads.readTopicRead(ref,raw);
        if(port==="saveTopicBrowserSession")return topicReads.saveTopicBrowserSession(ref,raw);
        if(port==="readTopicBrowserSession"){
          const scope=activeTools.get(executionKey(ref));if(!scope)throw new Error("STALE_EXECUTION");
          const reading=(async()=>{
            scope.controller.signal.throwIfAborted();const session=await topicReads.readTopicBrowserSession(ref,raw);
            if(!("domain" in session))throw new Error("TOPIC_BROWSER_SESSION_INVALID");
            try{await browserProfiles.acquire(ref,session.domain);}catch(error){if(!(error instanceof BrowserProfileBusyError))throw error;return {status:"blocked",outcome:{status:"error",summary:"网站正在被另一个任务使用",evidence:[],error:{code:"transient",retryable:true,recovery:"等待网站任务结束后重试"},continuation:null,sideEffect:"none"}};}
            scope.controller.signal.throwIfAborted();return topicReads.readTopicBrowserSession(ref,raw);
          })();scope.pending.add(reading);try{return await reading;}finally{scope.pending.delete(reading);}
        }
      }
      if(port==="settleBrowserObservation" && browserEvidence)return browserEvidence.settle(ref,raw);
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
      if(port==="reserveAgenticTool" && currentTools)return currentTools.reserve(ref,raw);
      if(port==="startAgenticTool" && currentTools)return currentTools.start(ref,raw);
      if(port==="settleAgenticTool" && currentTools)return currentTools.settle(ref,raw);
      if(port==="commitAgenticResult" && agentCandidates)return agentCandidates.commitAgenticResult(ref,raw);
      if(port==="executeAgenticTool" && currentTools){
        const scope=activeTools.get(executionKey(ref));if(!scope)throw new Error("STALE_EXECUTION");
        const execution=currentTools.execute(ref,raw,scope.controller.signal);scope.pending.add(execution);
        try{return await execution;}finally{scope.pending.delete(execution);}
      }
      if(port==="reserveGenerationCall" && deps.executionMode!=="agentic.run")return generation.reserveGenerationCall(ref,raw);
      if(port==="settleGenerationCall")return generation.settleGenerationCall(ref,raw);
      if(port==="saveGenerationResult" && deps.executionMode==="model")return generation.saveGenerationResult(ref,raw);
      if(port==="readTaskContext")return calls.readTaskContext(ref);
      if(port==="reserveCall" && deps.executionMode==="model")return calls.reserveCall(ref,raw);
      if(port==="startCall")return calls.startCall(ref,raw);
      if(port==="settleCall" && deps.executionMode==="model")return calls.settleCall(ref,raw);
      if(port==="resolveChatFallbackCredential" && chatFallback)return chatFallback.resolve(ref,workerPortInputSchemas.resolveChatFallbackCredential.parse(raw).operationKey);
      if(['readProcessingAsset','saveMaterialExtraction','completeAssetProcessing'].includes(port)){
        const scope=activeTools.get(executionKey(ref));if(!assetProcessing||!scope)throw new Error('ASSET_PROCESSING_UNAVAILABLE');
        const work=port==='readProcessingAsset'?assetProcessing.read(ref,scope.controller.signal):port==='saveMaterialExtraction'?assetProcessing.saveExtraction(ref,raw,scope.controller.signal):assetProcessing.complete(ref,raw,scope.controller.signal);
        scope.pending.add(work);try{return await work;}finally{scope.pending.delete(work);}
      }
      if(port==="resolveModelCredential"){
        const input=workerPortInputSchemas.resolveModelCredential.parse(raw);
        const modelInput=await calls.readTaskContext(ref);
        if(!("capability" in modelInput)||input.capability!==modelInput.capability)throw new Error("MODEL_CAPABILITY_MISMATCH");
        const scope=await leases.withLease(ref,"admission",async({context,task})=>({context,aiTaskId:task.ownerId}));
        const credential=workerModelSpecSchema.parse(await deps.resolveModelCredential(scope.context,input.capability,{aiTaskId:scope.aiTaskId,executionTaskId:ref.executionTaskId}));
        // 凭据解析期间可能取消，返回私有凭据前再检查当前执行。
        return modelIdentity.pin(ref,input.capability,credential);
      }
      if(port==="commitResult"){
        const input=workerPortInputSchemas.commitResult.parse(raw);
        if(input.outcome!=="succeeded"){
          if(scriptFinalizer && await scriptFinalizer.finalize(ref))return {status:"partial"};
          return outcomes.recordFailure(ref,input);
        }
        if(!candidates)throw new Error("UNSUPPORTED_AGENT_CANDIDATE_PORT");
        const skillId=await leases.withLease(ref,"settlement",async({task})=>(task.payload as {modelInput?:{skillId?:string}}).modelInput?.skillId);
        if(skillId==="reconstruct.project"&&reconstructions){const scope=activeTools.get(executionKey(ref));if(!scope)throw new Error('RECONSTRUCT_SCOPE_UNAVAILABLE');const work=reconstructions.commitResult(ref,input,scope.controller.signal);scope.pending.add(work);try{return await work;}finally{scope.pending.delete(work);}}
        if(skillId==="topic.preference"&&preferences){const scope=activeTools.get(executionKey(ref));if(!scope)throw new Error('PREFERENCE_SCOPE_UNAVAILABLE');const work=preferences.commitResult(ref,input,scope.controller.signal);scope.pending.add(work);try{return await work;}finally{scope.pending.delete(work);}}
        if(skillId==="script.source_similarity"&&similarities){const scope=activeTools.get(executionKey(ref));if(!scope)throw new Error("STALE_EXECUTION");const work=similarities.commitResult(ref,input,scope.controller.signal);scope.pending.add(work);try{return await work;}finally{scope.pending.delete(work);}}
        if(skillId==="script.review" && reviewReports)return reviewReports.commitResult(ref,input);
        if(skillId==="copilot.assist" && copilotReplies)return copilotReplies.commitResult(ref,input);
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
  const preparationController=new AbortController();
  let preparationFlight:Promise<void>|undefined,preparationAt=0;
  function recoverPreparation(){
    if(stopping || !deps.recoverPendingPreparation)return;
    if(preparationFlight)return;
    if(Date.now()<preparationAt)return;
    preparationAt=Date.now()+Math.max(100,deps.pollMs??1000);
    const work=Promise.resolve().then(()=>{if(!stopping)return deps.recoverPendingPreparation!(preparationController.signal);}).catch(()=>{if(!stopping)report("PENDING_PREPARATION_RECOVERY_FAILED");});
    preparationFlight=work;void work.finally(()=>{if(preparationFlight===work)preparationFlight=undefined;});
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
        recoverPreparation();
        if(stopping)break;
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
        const toolScope:ToolScope={controller:new AbortController(),pending:new Set<Promise<unknown>>()};
        activeTools.set(executionKey(ref),toolScope);
        activeWorkers.set(executionKey(ref),{ref,supervisor});
        let watching=true;
        let controlTimer:ReturnType<typeof setTimeout>|undefined;
        const watch=async()=>{
          try{
            const status=await leases.withLease(ref,"settlement",async({task})=>task.status);
            if(watching && (status==="pause_requested" || status==="cancel_requested")){toolScope.controller.abort();supervisor.cancel(ref);}
            else if(watching && deps.executionMode==="chat.run" && !toolScope.chatReady)await leases.withLease(ref,"admission",async()=>{});
          }catch{if(watching){toolScope.controller.abort();try{supervisor.cancel(ref);}catch{/* 进程可能已经退出。 */}}}
          if(watching)controlTimer=setTimeout(()=>{void watch();},250);
        };
        controlTimer=setTimeout(()=>{void watch();},250);
        try{
          if(deps.executionMode==="chat.run"){
            try{const chatTools=await getChatTools(ref);const input=await chatTools.validateTask(ref);await calls.readTaskContext(ref);if(input.tools.some(tool=>tool.execution==="worker.script-draft") && !(await supervisor.start()).includes("chat.script-draft"))throw new Error("CHAT_SCRIPT_DRAFT_WORKER_UNAVAILABLE");if(input.tools.some(tool=>tool.execution==="worker.script-hooks") && !(await supervisor.start()).includes("chat.hooks"))throw new Error("CHAT_HOOKS_WORKER_UNAVAILABLE");if(input.tools.some(tool=>tool.execution==="worker.structured-node") && !(await supervisor.start()).includes("chat.structured"))throw new Error("CHAT_STRUCTURED_WORKER_UNAVAILABLE");if(input.tools.some(tool=>tool.execution==="worker.research") && !(await supervisor.start()).includes("chat.research"))throw new Error("CHAT_RESEARCH_WORKER_UNAVAILABLE");if(input.tools.some(tool=>tool.execution==="worker.web-read") && !(await supervisor.start()).includes("chat.web-read"))throw new Error("CHAT_WEB_READ_WORKER_UNAVAILABLE");toolScope.chatReady=true;}
            catch{
              if(!stopping)await leases.withLease(ref,"settlement",async({tx,task})=>{
                const rows=await tx.select({status:executionCalls.status}).from(executionCalls).where(eq(executionCalls.executionTaskId,task.id));
                return rows.some(call=>call.status==="started" || call.status==="unknown");
              }).then(unknown=>!stopping?outcomes.recordFailure(ref,{outcome:unknown?"unknown_result":"failed",errorCode:"CHAT_WORKER_INPUT_UNAVAILABLE"}):undefined).catch(()=>{});
              throw new Error("CHAT_WORKER_INPUT_UNAVAILABLE");
            }
          }
          const deadline=await leases.withLease(ref,"admission",async({task})=>{const budget=executionBudgetSchema.parse(task.executionBudget);if(task.deadlineAt===null&&budget.deadlineMs!==null)throw new Error("PREPARED_DEADLINE_MISSING");return task.deadlineAt;});
          if(stopping)break;

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
          await supervisor.run(ref,deadline === null ? null : Date.parse(deadline));
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
    async stop(){stopping=true;preparationController.abort();for(const scope of activeTools.values())scope.controller.abort();if(timer)clearTimeout(timer);
      // 有浏览器资源的执行先核实整棵子树停止，不能先让根进程退出丢失后代身份。
      const profileStops=await Promise.allSettled([...activeWorkers.values()].map(async({ref,supervisor})=>{
        if((await browserProfiles.listOwned(ref)).length)await supervisor.stopExecutionTree(ref);
      }));
      // 租约查询失败也必须继续停止全部 Worker 并等待任务收尾，最后保留原始错误。
      const workerStops=await Promise.allSettled(supervisors.map(supervisor=>supervisor.stop()));
      const drained=await Promise.allSettled([draining,preparationFlight]);
      const failures=[...profileStops,...workerStops,...drained]
        .filter((result):result is PromiseRejectedResult=>result.status==="rejected")
        .map(result=>result.reason);
      if(failures.length)throw new AggregateError(failures,"MODEL_WORKER_SHUTDOWN_FAILED");},
  };
}
