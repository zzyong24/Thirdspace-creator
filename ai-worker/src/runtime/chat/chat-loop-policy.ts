import type { ToolSet, ToolCallRepairFunction } from "ai";
import { sanitizeToolName } from "./tool-names";

// ── [T-239f S6] 步数收尾 ────────────────────────────────────────────────────
/** 对话工具循环步数上限:env CREATOROS_CHAT_MAX_STEPS,默认 6,夹在 [2, 12](至少留 1 步
 *  给「禁工具强制收尾」;上限防误配无限循环)。 */
export function resolveChatMaxSteps(
  env: Record<string, string | undefined>,
): number {
  const raw = env.CREATOROS_CHAT_MAX_STEPS?.trim();
  if (!raw) return 6;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 6;
  return Math.min(12, Math.max(2, Math.floor(n)));
}

function canonicalToolInput(input: unknown): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(input, (_key, value: unknown) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return value;
    if (seen.has(value)) return "[Circular]";
    seen.add(value);
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
        a.localeCompare(b),
      ),
    );
  });
}

function toolCallSignature(call: { toolName: string; input: unknown }): string {
  return `${call.toolName}:${canonicalToolInput(call.input)}`;
}

function hasRepeatedToolCall(
  steps: readonly {
    toolCalls?: readonly { toolName: string; input: unknown }[];
  }[],
): boolean {
  const seen = new Set<string>();
  for (const step of steps) {
    for (const call of step.toolCalls ?? []) {
      const signature = toolCallSignature(call);
      if (seen.has(signature)) return true;
      seen.add(signature);
    }
  }
  return false;
}

/**
 * 同一对话回合内，相同工具和规范化参数只执行一次。失败不缓存，瞬时错误仍可重试。
 * SEMANTIC_BOUNDARY_ALLOW:这里只做协议级副作用去重，不判断用户意图或创作内容。
 */
export function dedupeChatToolExecutions(
  tools: ToolSet,
  onDuplicate?: (toolName: string) => void,
): ToolSet {
  const cache = new Map<string, Promise<unknown>>();
  return Object.fromEntries(
    Object.entries(tools).map(([toolName, tool]) => {
      const executable = tool as unknown as {
        execute?: (input: unknown, options: unknown) => unknown;
      };
      if (typeof executable.execute !== "function") return [toolName, tool];
      const execute = executable.execute;
      return [
        toolName,
        {
          ...tool,
          execute: async (input: unknown, options: unknown) => {
            const key = toolCallSignature({ toolName, input });
            const existing = cache.get(key);
            if (existing) {
              onDuplicate?.(toolName);
              return existing;
            }
            const pending = Promise.resolve().then(() =>
              execute.call(tool, input, options),
            );
            cache.set(key, pending);
            try {
              return await pending;
            } catch (error) {
              cache.delete(key);
              throw error;
            }
          },
        },
      ];
    }),
  ) as ToolSet;
}

/**
 * [T-117 强制工具 + T-239f 末步禁工具] 的 prepareStep 纯函数(可单测):
 *   - 第 0 步:forcedTool 有值 → toolChoice 强制调它(深链按钮的显式意图,防弱模型吐文本谎称渲卡);
 *   - 最后一步(stepNumber === maxSteps-1):toolChoice:'none' 禁工具 —— stopWhen 只会「掐断」,
 *     模型没机会总结;末步禁工具让它**必须**用文字把已有工具结果收尾,多工具任务不再静默腰斩;
 *   - 其余步:{}(auto,行为不变)。
 */
export function buildChatPrepareStep(opts: {
  forcedTool?: string;
  forcedToolSequence?: string[];
  maxSteps: number;
}): (step: {
  stepNumber: number;
  steps?: readonly {
    toolCalls?: readonly { toolName: string; input: unknown }[];
  }[];
}) => {
  toolChoice?: "none" | { type: "tool"; toolName: string };
} {
  return ({ stepNumber, steps = [] }) => {
    const sequencedTool = opts.forcedToolSequence?.[stepNumber];
    if (sequencedTool) {
      return {
        toolChoice: { type: "tool" as const, toolName: sequencedTool },
      };
    }
    // [T-117] 第 0 步强制调 forcedTool —— 这是「点按钮/深链后卡片秒出」的关键:模型**直接执行**,
    //   省掉它自己纠结要不要调工具(用户实测:MiniMax 带强制时"一下就出来")。
    // [T-443] 曾因 DeepSeek thinking 对此 400 而一刀切改成 prompt 指令 —— 那让**所有**模型都变慢
    //   (模型得先理解指令再决定调不调,思考模型还要先推理一大段),是明显的性能回归。
    //   现在改为:**默认仍带强制(快)**,被拒时由 recovering-model 中间件自动降级成 auto 重试一次
    //   (见 shouldDowngradeToolChoice),强制意图由 system 强指令兜底 —— 快与兼容两头都要。
    if (opts.forcedTool && stepNumber === 0) {
      return {
        toolChoice: { type: "tool" as const, toolName: opts.forcedTool },
      };
    }
    if (hasRepeatedToolCall(steps)) {
      return { toolChoice: "none" as const };
    }
    if (stepNumber >= opts.maxSteps - 1) {
      return { toolChoice: "none" as const };
    }
    return {};
  };
}

/**
 * [T-443] forcedTool 的 **system 层**强指令 —— 替代 API 层 toolChoice 强制。
 * 传入的必须是**发给模型的合规工具名**(sanitizeToolName 之后),否则模型按名找不到该工具。
 */
export function buildForcedToolInstruction(safeToolName: string): string {
  return [
    "【本轮硬性要求】用户是通过界面按钮/深链明确指定了要执行的操作,",
    `你**必须首先调用 \`${safeToolName}\` 工具**来完成它。`,
    "不要用文字描述你「将要做」或「已经做了」——必须真正发起这次工具调用,让结果以卡片呈现;",
    "只有在该工具返回结果之后,才继续做后续说明。",
  ].join("");
}

export function buildForcedToolSequenceInstruction(
  safeToolNames: readonly string[],
): string {
  return [
    "【本轮硬性顺序】用户已明确要求执行一个组合操作。",
    `必须依次调用 ${safeToolNames.map((name) => `\`${name}\``).join(" → ")}；后一步必须读取前一步的真实结果填写参数。`,
    "不要跳过中间读取，不要改用相邻工具，不要只给文字建议，也不要把系统已有事实再抛回用户选择。",
  ].join("");
}

type RepairableToolCall = Parameters<ToolCallRepairFunction<ToolSet>>[0]["toolCall"];

function unwrapJsonFence(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match?.[1]?.trim() ?? trimmed;
}

/**
 * T-716:部分兼容模型会理解“只改本段”，但把 replacementText 输出成 text/newText，
 * 或直接把新段落作为纯文本工具参数。这里仅修复这类可证明等价的字段别名，不生成任何
 * artifact/version/section 技术锚点——真实锚点仍由服务端工具闭包绑定，避免 AI 猜 ID。
 */
export function repairScriptPatchToolCall(
  toolCall: RepairableToolCall,
): RepairableToolCall | null {
  const safeToolName = sanitizeToolName("script.patch");
  // SEMANTIC_BOUNDARY_ALLOW:这里只修复同一已注册工具的点号/下划线协议别名，
  // 不根据用户文字判断创作意图，也不将其它工具猜成 script.patch。
  if (toolCall.toolName !== "script.patch" && toolCall.toolName !== safeToolName) {
    return null;
  }
  const rawInput = unwrapJsonFence(toolCall.input ?? "");
  if (!rawInput) return null;

  let replacementText = "";
  let summary = "";
  try {
    const parsed = JSON.parse(rawInput) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const object = parsed as Record<string, unknown>;
    const aliases = [
      "replacementText",
      "replacement_text",
      "newText",
      "new_text",
      "text",
      "content",
      "rewrite",
    ];
    replacementText =
      aliases
        .map((key) => object[key])
        .find((value): value is string =>
          typeof value === "string" && value.trim().length > 0,
        )
        ?.trim() ?? "";
    summary = typeof object.summary === "string" ? object.summary.trim() : "";
  } catch {
    // 只有明显不是 JSON 的纯文本才可安全解释为目标段落；疑似截断 JSON 必须失败，
    // 不能把半截结构体写进稿面候选。
    if (/^[{[]/.test(rawInput)) return null;
    replacementText = rawInput;
  }

  if (!replacementText || replacementText.length > 12_000) return null;
  return {
    ...toolCall,
    toolName: safeToolName,
    input: JSON.stringify({
      replacementText,
      ...(summary ? { summary } : {}),
    }),
  };
}
