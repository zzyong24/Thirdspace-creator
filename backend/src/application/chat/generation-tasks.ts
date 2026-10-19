import {ENDPOINTS,type RequestContext,type Transport} from "@creatoros/contract";

import { preparePublishPackageTaskInput } from "../../modules/ai-runtime";
import {readCurrentArticleImageSnapshot,type ArticleImageAnchor,type ArticleImageReadable} from "../../modules/ai-runtime/material-generation-preparation";
import {z} from "zod";
const articleImageAnchorSchema=z.object({outputId:z.string().min(1),versionId:z.string().min(1),sectionId:z.string().min(1)}).strict();
/** 复用正式提交、快照冻结与唤醒，保持原任务身份。 */
export function createChatGenerationTasks(ports:{
aiService: Pick<ReturnType<typeof import("../../modules/ai").createAiService>,"prepareScriptDraftTaskCommit"|"prepareTaskCommit"|"getTask"|"createScriptDraftTask">;
projectsService: Pick<import("../../modules/projects").ProjectsService,"listOutputIdsByProject">;
reviewGateService: Pick<ReturnType<typeof import("../../modules/review").createReviewGateService>,"triggerReview">;
chatTaskSubmissions: ReturnType<typeof import("../../modules/ai").createAiTaskSubmissionService>;
readCurrentArtifactTruth: ReturnType<typeof import("../context/current-artifact").createCurrentArtifactReader>;
getArticleForImage?: (ctx:RequestContext,opts:{outputId:string})=>Promise<ArticleImageReadable>;
createAiTaskAttemptId: ()=>string;
makeReviewSubjectReader: ()=>import("../../modules/ai-runtime").ReviewSubjectReader;
assertReviewableChatScript: (ctx:RequestContext,input:{projectId:string})=>Promise<void>;
ai: Transport;
}){
const {aiService,projectsService,reviewGateService,chatTaskSubmissions,readCurrentArtifactTruth,getArticleForImage,createAiTaskAttemptId,makeReviewSubjectReader,assertReviewableChatScript,ai}=ports;
return {
dispatchGenerateAsset: async (
      ctx: RequestContext,
      input: { kind: "image" | "video"; prompt: string; projectId?: string | null; attemptId?: string; referenceAssetId?:string;articleImageAnchor?:ArticleImageAnchor },
    ) => {
      const task=await chatTaskSubmissions.submit(ctx,{
        taskType:"asset.generate",attemptId:input.attemptId??createAiTaskAttemptId(),
        inputData:{kind:input.kind,prompt:input.prompt,...(input.projectId?{projectId:input.projectId}:{}),...(input.referenceAssetId?{referenceAssetId:input.referenceAssetId}:{}),...(input.articleImageAnchor?{articleImageAnchor:articleImageAnchorSchema.parse(input.articleImageAnchor)}:{})},
      },{
        snapshotKeys:["scriptSnapshot","articleSnapshot"],
        prepareSnapshot:async(context,inputData)=>{
          const projectId=typeof inputData.projectId==="string"?inputData.projectId:null;
          if(inputData.articleImageAnchor!==undefined){
            if(!projectId||!getArticleForImage||inputData.kind!=="image")throw new Error("文章配图目标不完整");
            const anchor=articleImageAnchorSchema.parse(inputData.articleImageAnchor);
            const articleSnapshot=await readCurrentArticleImageSnapshot({projectId,anchor,getArticleForImage:query=>getArticleForImage(context,query)});
            return {articleSnapshot};
          }
          const scriptSnapshot=projectId?await readCurrentArtifactTruth(context,projectId,"output_script").catch(()=>null):null;
          return scriptSnapshot?{scriptSnapshot}:{};
        },
      });
      return {taskId:task.id};
    },
dispatchScriptReview: async (
      ctx: RequestContext,
      input: { projectId: string },
    ) => {
      await assertReviewableChatScript(ctx,input);
      const task = (await reviewGateService.triggerReview(
        ctx,
        input.projectId,
      )) as { id?: unknown } | null;
      const taskId = task && typeof task.id === "string" ? task.id : "";
      if (!taskId) {
        throw new Error("dispatchScriptReview: 起 script.review task 失败(无 taskId)");
      }
      return { taskId };
    },
dispatchPlanningThesis: async (
      ctx: RequestContext,
      input: { projectId: string; topic?: string; attemptId?: string },
    ) => {
      const task=await chatTaskSubmissions.submit(ctx,{
        taskType:"planning.thesis",attemptId:input.attemptId??createAiTaskAttemptId(),
        inputData:{projectId:input.projectId,...(input.topic?{topic:input.topic}:{})},
      });
      return {taskId:task.id};
    },
dispatchGenerateCover: async (
      ctx: RequestContext,
      // [T-380] referenceAssetId = 以图生图风格参考(素材库 asset id,走 inputData 透传;
      // cover-runner host 侧 getAssetBytes 读字节喂生图 adapter 的 image-to-image)。
      input: {
        projectId: string;
        topic?: string;
        referenceAssetId?: string;
        visualRequirements?: string;
      },
    ) => {
      const scriptSnapshot = await readCurrentArtifactTruth(
        ctx,
        input.projectId,
        "output_script",
      ).catch(() => null);
      const res = await ai.request(
        // key = op 方法名 createAITask;其 .id === "ai.tasks.create"(ai transport 拦此 id 分派)。
        ENDPOINTS.createAITask,
        {
          params: undefined,
          query: undefined,
          body: {
            taskType: "cover.generate",
            attemptId: createAiTaskAttemptId(),
            inputData: {
              projectId: input.projectId,
              ...(input.topic ? { topic: input.topic } : {}),
              ...(input.referenceAssetId
                ? { referenceAssetId: input.referenceAssetId }
                : {}),
              ...(input.visualRequirements
                ? { visualRequirements: input.visualRequirements }
                : {}),
              ...(scriptSnapshot ? { scriptSnapshot } : {}),
            },
          },
        },
        ctx,
      );
      const task = (res as { data?: { id?: unknown } }).data;
      const taskId = task && typeof task.id === "string" ? task.id : "";
      if (!taskId) {
        throw new Error("dispatchGenerateCover: 起 cover.generate task 失败(无 taskId)");
      }
      return { taskId };
    },
dispatchScriptDraft: async (
      ctx: RequestContext,
      input: {
        projectId: string;
        attemptId?: string;
        topic?: string;
        angle?: string;
        targetDurationSeconds?: number;
        extraBrief?: string;
        instruction?: string;
        sourceSnapshots?: import("@creatoros/backend/modules/ai-runtime").ScriptDraftSourceSnapshot[];
        draftMode?: "verbatim";
        verbatimSourceRef?: string;
        verbatimSourceText?: string;
        verbatimSourceLength?: number;
        verbatimSourceSha256?: string;
      },
    ) => {
      const attemptId=input.attemptId??createAiTaskAttemptId();
      const preparedTask=await aiService.createScriptDraftTask(ctx,{...input,attemptId});
      // 仍走现有正式派发入口；同键回读复用原任务，恢复提交后尚未唤醒的窗口。
      const res = await ai.request(
        // key = op 方法名 createAITask;其 .id === "ai.tasks.create"(ai transport 拦此 id 分派)。
        ENDPOINTS.createAITask,
        {
          params: undefined,
          query: undefined,
          body: {
            taskType: "script.draft",
            attemptId,
            inputData: preparedTask.inputData,
          },
        },
        ctx,
      );
      const task = (res as { data?: { id?: unknown } }).data;
      const taskId = task && typeof task.id === "string" ? task.id : "";
      if (!taskId) {
        throw new Error("dispatchScriptDraft: 起 script.draft task 失败(无 taskId)");
      }
      return { taskId };
    },
dispatchPublishPackage: async (ctx:RequestContext,input:{projectId:string;topic?:string;attemptId?:string})=>{
      const task=await chatTaskSubmissions.submit(ctx,{
        taskType:"publish.platform_adapt",attemptId:input.attemptId??createAiTaskAttemptId(),
        inputData:{projectId:input.projectId,platforms:["douyin"],...(input.topic?{topic:input.topic}:{})},
      },{
        snapshotKeys:["scriptText","outputId"],
        prepareSnapshot:async(context,inputData)=>{
          const {scriptText,outputId}=await preparePublishPackageTaskInput(context,{projectId:inputData.projectId as string},{getScript:(c,id)=>makeReviewSubjectReader().getScript(c,id),listOutputIdsByProject:(c,id)=>projectsService.listOutputIdsByProject(c,id)});
          return {scriptText,outputId};
        },
      });
      return {taskId:task.id};
    }
};
}
