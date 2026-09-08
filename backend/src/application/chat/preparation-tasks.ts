import { type RequestContext } from "@creatoros/contract";

import {preparePublishPackageTaskInput,type ChatProductionServicePorts} from "../../modules/ai-runtime";
/** 复用正式提交、快照冻结与唤醒，保持原任务身份。 */
export function createChatPreparationTasks(ports:{
aiService: Pick<ReturnType<typeof import("../../modules/ai").createAiService>,"prepareScriptDraftTaskCommit"|"prepareTaskCommit"|"getTask"|"createScriptDraftTask">;
projectsService: Pick<import("../../modules/projects").ProjectsService,"listOutputIdsByProject">;
makeReviewSubjectReader: ()=>import("../../modules/ai-runtime").ReviewSubjectReader;
assertReviewableChatScript: (ctx:RequestContext,input:{projectId:string})=>Promise<void>;
readCurrentScriptRefForReview: Parameters<typeof import("../../modules/review").createReviewGateService>[0]["script"]["getCurrentScriptRef"];
wakeSubmittedTask: (ctx:RequestContext,id:string,taskType:"planning.thesis"|"asset.generate"|"script.review"|"script.draft"|"publish.platform_adapt"|"cover.generate")=>Promise<void>;
agenticBusiness: Pick<ReturnType<typeof import("../../modules/ai-runtime").createAgenticBusinessExecutionService>,"prepare">;
getAgenticWorker: ()=>Pick<ReturnType<typeof import("../../modules/execution").createAgenticWorkerDispatcher>,"start">|null;
isStopping: ()=>boolean;
}){
const {aiService,projectsService,makeReviewSubjectReader,assertReviewableChatScript,readCurrentScriptRefForReview,wakeSubmittedTask,agenticBusiness,getAgenticWorker,isStopping}=ports;
return {
prepareChatScriptDraftTask:(ctx,input)=>aiService.prepareScriptDraftTaskCommit(ctx,input),
wakeChatScriptDraftTask:(ctx,taskId)=>wakeSubmittedTask(ctx,taskId,"script.draft"),
prepareChatPublishTask:async(ctx,input)=>{
      const inputData=await preparePublishPackageTaskInput(ctx,input,{getScript:(c,id)=>makeReviewSubjectReader().getScript(c,id),listOutputIdsByProject:(c,id)=>projectsService.listOutputIdsByProject(c,id)});
      return aiService.prepareTaskCommit(ctx,{taskType:"publish.platform_adapt",attemptId:input.attemptId,inputData});
    },
wakeChatPublishTask:(ctx,taskId)=>wakeSubmittedTask(ctx,taskId,"publish.platform_adapt"),
prepareChatScriptReviewTask: async (ctx,input)=>{
      await assertReviewableChatScript(ctx,input);
      const current=await readCurrentScriptRefForReview(ctx,input.projectId);
      return aiService.prepareTaskCommit(ctx,{taskType:"script.review",attemptId:input.attemptId,inputData:{projectId:input.projectId,artifactId:current.artifactId,artifactVersion:current.artifactVersion}});
    },
wakeChatScriptReviewTask: (ctx,taskId)=>wakeSubmittedTask(ctx,taskId,"script.review"),
wakeChatCoverTask:(ctx,taskId)=>wakeSubmittedTask(ctx,taskId,"cover.generate"),
wakeChatResearchTask:async(ctx,taskId)=>{
const agenticWorker=getAgenticWorker();
      if(isStopping())throw new Error("应用正在停止");
      const task=await aiService.getTask(ctx,taskId);
      if(task.taskType!=="exec.agentic.research")throw new Error("自主调研任务类型不符");
      if(!agenticWorker)throw new Error("自主调研执行服务未就绪");
      await agenticBusiness.prepare(ctx,taskId);
      if(!isStopping())agenticWorker.start();
    },
wakeChatPlanningTask: (ctx,taskId) => wakeSubmittedTask(ctx,taskId,"planning.thesis"),
wakeChatMaterialTask: (ctx,taskId) => wakeSubmittedTask(ctx,taskId,"asset.generate")
} satisfies Pick<ChatProductionServicePorts,"prepareChatScriptDraftTask" | "wakeChatScriptDraftTask" | "prepareChatPublishTask" | "wakeChatPublishTask" | "prepareChatScriptReviewTask" | "wakeChatScriptReviewTask" | "wakeChatCoverTask" | "wakeChatResearchTask" | "wakeChatPlanningTask" | "wakeChatMaterialTask">;
}
