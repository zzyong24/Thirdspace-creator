import {ENDPOINTS,type RequestContext,type Transport} from "@creatoros/contract";
import {requireAccountId} from "../../errors";
import {createHash} from "node:crypto";

/** 复用正式提交、快照冻结与唤醒，保持原任务身份。 */
export function createChatIngestionTasks(ports:{
createAiTaskAttemptId: ()=>string;
intelligenceService: Pick<ReturnType<typeof import("../../modules/intelligence").createIntelligenceService>,"enqueueDouyinShareImport">;
wakeShareImport: ()=>void;
projectsWithTranscribe: Transport;
}){
const {createAiTaskAttemptId,intelligenceService,wakeShareImport,projectsWithTranscribe}=ports;
return {
dispatchDouyinShare: async (
      ctx: RequestContext,
      input: { shareInput: string; transcribe: boolean },
    ) => {
      const shareInput = input.shareInput.trim();
      const accountId = requireAccountId(
        ctx.accountId,
        "chat.douyin.share",
      );
      const fingerprint = createHash("sha256")
        .update(
          `${ctx.userId}\n${accountId}\n${
            input.transcribe ? "archive_and_transcribe" : "archive"
          }\n${shareInput}`,
        )
        .digest("hex");
      const { task } = await intelligenceService.enqueueDouyinShareImport(ctx, {
        collectionId: null,
        shareInput,
        idempotencyKey: `chat-douyin-share:${fingerprint}`,
        transcribeAfterImport: input.transcribe,
      });
      if (task.status === "queued") {
        wakeShareImport();
      }
      return { taskId: task.id, ownerId: task.ownerId };
    },
dispatchProjectTranscribe: async (
      ctx: RequestContext,
      input: { projectId: string; attemptId?: string },
    ) => {
      const res = await projectsWithTranscribe.request(
        ENDPOINTS.transcribeProjectWork,
        {
          params: { projectId: input.projectId },
          query: undefined,
          body: { attemptId: input.attemptId ?? createAiTaskAttemptId() },
        },
        ctx,
      );
      const data = (res as { data?: { taskId?: unknown } }).data;
      const taskId = data && typeof data.taskId === "string" ? data.taskId : "";
      if (!taskId) {
        throw new Error(
          "dispatchProjectTranscribe: 起 transcribe.douyin task 失败(无 taskId)",
        );
      }
      return { taskId };
    }
};
}
