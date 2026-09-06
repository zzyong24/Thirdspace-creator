import { z } from "zod";
import type { PromptTemplate } from "../template";
export const copilotReplySchema = z.object({ reply: z.string().trim().min(1) });
/** SEMANTIC_BOUNDARY_ALLOW: 只校验会话ID、历史顺序及非空回复，不判断创作内容。 */
export const copilotReplyInputSchema = z
  .object({
    conversationId: z.string().min(1),
    sourceMessageId: z.string().min(1),
    projectId: z.string().min(1).nullable(),
    historyMessageIds: z.array(z.string().min(1)).min(1),
  })
  .refine(
    (v) =>
      new Set(v.historyMessageIds).size === v.historyMessageIds.length &&
      v.historyMessageIds.at(-1) === v.sourceMessageId,
    "当轮历史必须唯一且以来源消息结尾",
  );
export const COPILOT_ASSIST_TEMPLATE: PromptTemplate = {
  id: "copilot.assist",
  version: "v1",
  outputSchema: copilotReplySchema,
  tools: [],
  system:
    "你是这位创作者的 AI 助手，基于其定位给实用、具体的建议。回答要简洁、可执行，贴合创作者的领域与人群，避免空话套话。直接给出助手的下一句回复，不要复述对话、不要加「助手：」前缀。",
  template: `【创作者定位】
{{positioning}}{{learnings}}

【当前对话】
{{transcript}}

请给出助手接下来的回复，只输出 JSON 对象 {"reply":"回复正文"}。`,
  requiredFacets: ["positioning", "transcript"],
};
