import { streamText, stepCountIs, type ModelMessage, type ToolApprovalStatus } from "ai";
import { sanitizeToolName, sanitizeToolNames, sanitizeSystemToolReferences } from "./tool-names";
import {
  buildChatPrepareStep, buildForcedToolInstruction, buildForcedToolSequenceInstruction,
  dedupeChatToolExecutions, repairScriptPatchToolCall,
} from "./chat-loop-policy";

type StreamOptions = Parameters<typeof streamText>[0];
export type ChatModelStreamOptions = Pick<StreamOptions,
  "model" | "abortSignal" | "onAbort" | "onError" | "onStepEnd" | "onFinish" | "maxOutputTokens"
> & {
  messages: ModelMessage[];
  toolApproval?: Record<string, (input: unknown, options: {toolCallId: string}) => Promise<ToolApprovalStatus>>;
  system: string;
  tools: NonNullable<StreamOptions["tools"]>;
  maxSteps: number;
  /** 持久回合由后端逐次记账并复用，不能在 SDK 外层跳过调用。 */
  deduplicateTools?: boolean;
  forcedTool?: string;
  forcedToolSequence?: string[];
  onDuplicate?: (toolName: string) => void;
};

/** 模型循环唯一入口；业务工具、授权、模型与任务信号由调用方按真实上下文提供。 */
export function createChatModelStream(options: ChatModelStreamOptions) {
  const { system, tools, toolApproval, maxSteps, forcedTool, forcedToolSequence, onDuplicate, deduplicateTools = true, ...rest } = options;
  return streamText({
    ...rest,
    // 重试由模型/持久任务层管理，不能与 SDK 默认重试相乘。
    maxRetries: 0,
    system: sanitizeSystemToolReferences(
      forcedToolSequence?.length
        ? `${system}\n\n${buildForcedToolSequenceInstruction(forcedToolSequence.map(sanitizeToolName))}`
        : forcedTool ? `${system}\n\n${buildForcedToolInstruction(sanitizeToolName(forcedTool))}` : system,
      tools,
    ),
    tools: deduplicateTools ? dedupeChatToolExecutions(sanitizeToolNames(tools), onDuplicate) : sanitizeToolNames(tools),
    ...(forcedTool === "script.patch" ? {
      experimental_repairToolCall: async ({ toolCall }) => repairScriptPatchToolCall(toolCall),
    } : {}),
    prepareStep: buildChatPrepareStep({
      forcedTool: forcedTool ? sanitizeToolName(forcedTool) : undefined,
      forcedToolSequence: forcedToolSequence?.map(sanitizeToolName),
      maxSteps,
    }),
    ...(toolApproval ? { toolApproval: sanitizeToolNames(toolApproval) } : {}),
    stopWhen: stepCountIs(maxSteps),
  });
}
