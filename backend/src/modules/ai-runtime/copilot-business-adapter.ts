import type { RequestContext } from "@creatoros/contract";
import { copilotReplyInputSchema } from "@creatoros/ai-worker";
import type { AiService } from "../ai/ai.service";
import { assembleCreativeContext, type ContextDeps } from "./creative-context";
import type { StructuredBusinessAdapter } from "./structured-business-execution.service";
export function createCopilotBusinessAdapter(
  deps: Pick<ContextDeps, "positioning" | "learnings"> & {
    ai: Pick<AiService, "getConversation" | "listMessages">;
    assertProject(ctx: RequestContext, projectId: string): Promise<void>;
  },
): StructuredBusinessAdapter {
  return {
    skillId: "copilot.assist",
    capability: "copilot.assist",
    async prepare(ctx, task) {
      const frozen = copilotReplyInputSchema.parse(task.inputData);
      const conversation = await deps.ai.getConversation(
        ctx,
        frozen.conversationId,
      );
      if (
        conversation.projectId !== frozen.projectId ||
        task.projectId !== frozen.projectId
      )
        throw new Error("对话项目与回复任务不一致");
      const rows = await deps.ai.listMessages(ctx, conversation.id),
        byId = new Map(rows.map((m) => [m.id, m]));
      const history = frozen.historyMessageIds.map((id) => {
        const message = byId.get(id);
        if (!message || message.conversationId !== conversation.id)
          throw new Error("对话历史已不可用");
        return message;
      });
      const source = history.at(-1)!;
      if (
        source.role !== "user" ||
        source.modelMetadata.replyTaskId !== task.id
      )
        throw new Error("来源消息没有绑定当前回复任务");
      if (frozen.projectId) await deps.assertProject(ctx, frozen.projectId);
      const context = await assembleCreativeContext(
        ctx,
        { projectId: frozen.projectId, topic: "" },
        { positioning: deps.positioning, learnings: deps.learnings },
      );
      return {
        positioning:
          context.positioningBrief ||
          "（创作者尚未设置定位——按通用创作者助手的角度给建议）",
        learnings: context.learningsBrief
          ? `\n【过往复盘爆款要素】\n${context.learningsBrief}`
          : "",
        transcript: history
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => `${m.role === "user" ? "用户" : "助手"}：${m.content}`)
          .join("\n"),
        __copilotReply: JSON.stringify(frozen),
      };
    },
    project() {
      throw new Error("对话回复必须经消息完成端口保存");
    },
  };
}
