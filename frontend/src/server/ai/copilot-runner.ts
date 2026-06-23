import "server-only";
import type { RequestContext } from "@creatoros/contract";
import type { AiService } from "@/server/modules/ai";
import {
  assembleCreativeContext,
  type ContextDeps,
  type CreativeContext,
} from "./creative-context";
import type { LlmCompleter } from "@/server/ai/llm/provider";

// 全局 AI 助手 runner (copilot.assist, 机制②④). Like the other node runners it lives in the
// COMPOSITION layer (never in the AI module/service — which must stay deterministic, no
// SDK). A user message create fires this in the BACKGROUND: it reads the conversation
// history, assembles the creator's positioning brief (+ 飞轮 learnings), prompts a real
// Claude agent on the user's subscription token, then appends the assistant reply through
// the service. The UI polls listMessages for the new assistant-role message.

export interface CopilotDeps extends ContextDeps {
  ai: AiService;
  llm: LlmCompleter;
}

export interface CopilotAssistInput {
  conversationId: string;
  projectId?: string | null;
}

// A brief fallback so the thread never hangs when the agent is unavailable / errors.
const FALLBACK_REPLY = "（助手暂时无法回复，请稍后重试）";

function buildCopilotPrompt(
  context: CreativeContext,
  history: ReadonlyArray<{ role: string; content: string }>,
): string {
  const positioning = context.positioningBrief
    ? context.positioningBrief
    : "（创作者尚未设置定位——按通用创作者助手的角度给建议）";
  const learnings = context.learningsBrief
    ? `\n【过往复盘爆款要素】\n${context.learningsBrief}`
    : "";
  const transcript = history
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => `${m.role === "user" ? "用户" : "助手"}：${m.content}`)
    .join("\n");
  return `你是这位创作者的 AI 助手,基于其定位给实用、具体的建议。回答要简洁、可执行,贴合创作者的领域与人群,避免空话套话。直接给出助手的下一句回复,不要复述对话、不要加「助手：」前缀。

【创作者定位】
${positioning}${learnings}

【当前对话】
${transcript}

请给出助手接下来的回复：`;
}

export async function runCopilotAssist(
  ctx: RequestContext,
  input: CopilotAssistInput,
  deps: CopilotDeps,
): Promise<void> {
  const { conversationId } = input;
  try {
    const history = await deps.ai.listMessages(ctx, conversationId);
    const context = await assembleCreativeContext(
      ctx,
      { projectId: input.projectId ?? null, topic: "" },
      deps,
    );
    const prompt = buildCopilotPrompt(context, history);
    const { text: reply } = await deps.llm(ctx, "copilot.assist", prompt);
    const text = reply.trim().length > 0 ? reply.trim() : FALLBACK_REPLY;
    await deps.ai.appendAssistantMessage(ctx, conversationId, text);
  } catch (err) {
    // Never throw out of the background task. Append a brief fallback so the UI's poll
    // resolves instead of hanging, then log for diagnosis.
    // eslint-disable-next-line no-console
    console.error(
      `[copilot-runner] assist failed for conversation ${conversationId}:`,
      err,
    );
    try {
      await deps.ai.appendAssistantMessage(ctx, conversationId, FALLBACK_REPLY);
    } catch {
      /* swallow — best effort; the user can retry */
    }
  }
}
