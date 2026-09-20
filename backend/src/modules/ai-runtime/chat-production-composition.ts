import type {Db} from "@creatoros/backend";
import {createChatHostContextReader} from "../ai/chat-host-context.service";
import {createChatProductionRuntime} from "./chat-production-runtime";
import {createChatTaskToolHost} from "./chat-task-tool-host";
import {createChatWorkbenchPlanToolHost} from "./chat-workbench-plan-tool-host";
import {createChatWorkbenchCapabilityHost,type ChatWorkbenchCapabilityHost} from "./chat-workbench-capability-host";
import {createExecutionLeaseService} from "../execution/execution-lease.service";
import {createExecutionStreamService} from "../execution/execution-stream.service";
import {createChatIngestionTaskToolHost,type ChatIngestionToolPorts} from "./chat-ingestion-tool-host";
import {createChatBusinessGenerationPreparation} from "./chat-business-generation-preparation";
import {createChatTrendRead,type ChatTrendReadDeps} from "./chat-trend-read";
import {loadPositioningWorksBrief,type ContextDeps} from "./creative-context";

type TaskPorts=NonNullable<Parameters<typeof createChatTaskToolHost>[2]>;
type RequiredTaskPorts=Required<TaskPorts>;
type ProductionDeps=Parameters<typeof createChatProductionRuntime>[1];
/** 仅包含装配所需的既有业务服务，保持与 frontend ChatRuntime 结构兼容。 */
export interface ChatProductionServicePorts extends ChatIngestionToolPorts {
 resolveRedfoxCredential?:ProductionDeps["resolveRedfoxCredential"];
 context:ContextDeps;
 readCurrentScript?:RequiredTaskPorts["structured"]["readCurrentScript"];
 contextReaders:Parameters<typeof createChatTaskToolHost>[1];
 wakeChatCoverTask:RequiredTaskPorts["cover"]["wakeTask"];
 wakeChatResearchTask:RequiredTaskPorts["agenticResearch"]["wakeTask"];
 wakeChatPlanningTask:RequiredTaskPorts["planning"]["wakeTask"];
 wakeChatMaterialTask:RequiredTaskPorts["material"]["wakeTask"];
 prepareChatPublishTask:RequiredTaskPorts["publish"]["preparePublish"];
 wakeChatPublishTask:RequiredTaskPorts["publish"]["wakeTask"];
 prepareChatScriptReviewTask:RequiredTaskPorts["review"]["prepareReview"];
 wakeChatScriptReviewTask:RequiredTaskPorts["review"]["wakeTask"];
 prepareChatScriptDraftTask:RequiredTaskPorts["scriptDraft"]["prepareDraft"];
 wakeChatScriptDraftTask:RequiredTaskPorts["scriptDraft"]["wakeTask"];
 resolveCurrentScriptSelection?:RequiredTaskPorts["scriptPatch"]["resolveSelection"];
 prepareVideoEdit:RequiredTaskPorts["videoEdit"]["prepareVideoEdit"];
 detectTools:RequiredTaskPorts["local"]["detectTools"];
 listAuthorizedDirs:RequiredTaskPorts["local"]["listAuthorizedDirs"];
 readLocalFile:RequiredTaskPorts["localRead"]["readLocalFile"];
 decideLocalReadAccess:RequiredTaskPorts["localRead"]["decideLocalReadAccess"];
 getPositioningDiscovery:RequiredTaskPorts["structured"]["getPositioningDiscovery"];
}
export interface ChatProductionCompositionDeps {
 entryPath:string;
 runtime:ChatProductionServicePorts;
 now?:()=>string;
 assertProject:ProductionDeps["assertProject"];
 resolveModelCredential:ProductionDeps["resolveModelCredential"];
 resolveFallbackModelCredential?:ProductionDeps["resolveFallbackModelCredential"];
 prepareTaskCommit:RequiredTaskPorts["cover"]["prepareTaskCommit"];
 trend:ChatTrendReadDeps;
 webRead:ProductionDeps["webRead"];
 onError?:ProductionDeps["onError"];
 workbenchHost?:ChatWorkbenchCapabilityHost;
 resolveWorkbenchScreenshot?:ProductionDeps["resolveWorkbenchScreenshot"];
 verifyWorkbenchArtifacts?: (scope:{userId:string;accountId:string;taskId:string},refs:string[])=>Promise<boolean>;
}
/** 装配原持久聊天运行时与全部真实工具；不增加运行时或任务账本。 */
export function composeChatProduction(db:Db,deps:ChatProductionCompositionDeps){
 const chatRuntime=deps.runtime;
 const hostReader=createChatHostContextReader(db);
 const ingestionTools=createChatIngestionTaskToolHost(hostReader,chatRuntime);
 const taskTools=createChatTaskToolHost(hostReader,chatRuntime.contextReaders,{
  webRead:true,research:true,
  cover:{prepareTaskCommit:deps.prepareTaskCommit,wakeTask:chatRuntime.wakeChatCoverTask},
  agenticResearch:{prepareTaskCommit:deps.prepareTaskCommit,wakeTask:chatRuntime.wakeChatResearchTask},
  planning:{prepareTaskCommit:deps.prepareTaskCommit,wakeTask:chatRuntime.wakeChatPlanningTask},
  material:{prepareTaskCommit:deps.prepareTaskCommit,wakeTask:chatRuntime.wakeChatMaterialTask},
  publish:{preparePublish:chatRuntime.prepareChatPublishTask,wakeTask:chatRuntime.wakeChatPublishTask},
  review:{prepareReview:chatRuntime.prepareChatScriptReviewTask,wakeTask:chatRuntime.wakeChatScriptReviewTask},
  scriptDraft:{readCurrentScript:chatRuntime.readCurrentScript,prepareDraft:chatRuntime.prepareChatScriptDraftTask,wakeTask:chatRuntime.wakeChatScriptDraftTask},
  scriptPatch:{resolveSelection:(c,input)=>chatRuntime.resolveCurrentScriptSelection!(c,input)},
  videoEdit:{prepareVideoEdit:chatRuntime.prepareVideoEdit},
  local:{detectTools:chatRuntime.detectTools,listAuthorizedDirs:chatRuntime.listAuthorizedDirs},
  localRead:{readLocalFile:chatRuntime.readLocalFile,decideLocalReadAccess:chatRuntime.decideLocalReadAccess},
  structured:{
    readCurrentScript:chatRuntime.readCurrentScript,
    business:createChatBusinessGenerationPreparation({
      ...chatRuntime.context,
      sourceReader:{listEnabledSources:deps.trend.listEnabledSources},
      now:deps.now,
      async assertProject(c,id){await deps.assertProject(c,id);},
      readTrend:createChatTrendRead(deps.trend),
    }),
    readWorks:(c,limit)=>loadPositioningWorksBrief(c,chatRuntime.context.positioningWorks,limit),
    getPositioningDiscovery:(c,id)=>chatRuntime.getPositioningDiscovery(c,id),
  },
 });
 const planTools=createChatWorkbenchPlanToolHost(db,{verifyArtifacts:deps.verifyWorkbenchArtifacts});
 const leases=createExecutionLeaseService(db,{now:deps.now});
 const workbenchProgress=createExecutionStreamService(db,{now:deps.now});
 const workbenchTools=deps.workbenchHost?createChatWorkbenchCapabilityHost(deps.workbenchHost,ref=>leases.withLease(ref,"admission",async({task,context})=>({userId:context.userId,accountId:context.accountId!,taskId:task.id,attempt:task.attempt,fenceToken:task.fenceToken!,leaseId:task.leaseOwner!})),(ref,callId,progress)=>workbenchProgress.appendWorkbenchProgress(ref,callId,progress)):null;
 const durable=createChatProductionRuntime(db,{
  resolveRedfoxCredential:chatRuntime.resolveRedfoxCredential,
  entryPath:deps.entryPath,workerId:`chat-worker-${process.pid}`,
  budget:{maxCalls:48,maxTokens:1000000,deadlineMs:600000},modelConcurrency:2,
  assertProject:deps.assertProject,
  resolveModelCredential:deps.resolveModelCredential,
  resolveFallbackModelCredential:deps.resolveFallbackModelCredential,
  resolveTools:async(c,input,ref,signal)=>Object.assign({},await taskTools(c,input,ref,signal),await ingestionTools(c,input,ref,signal),await planTools(c,input,ref,signal),workbenchTools?await workbenchTools(c,input,ref,signal):{}),
  webRead:deps.webRead,
  resolveWorkbenchScreenshot:deps.resolveWorkbenchScreenshot,
 onError:deps.onError,
 });
 // 提交准备与执行解析共用同一装配对象；未注入时没有可冻结的生产能力。
 return Object.assign(durable,{workbenchHost:deps.workbenchHost});
}
