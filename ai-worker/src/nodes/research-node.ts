import { anthropic } from "@ai-sdk/anthropic";
import type { LanguageModel, ToolSet } from "ai";
import { runAgentNode, type AgentStepEvent } from "../runtime/agent-runtime";
import { bindPrompt } from "../prompt/template";
import { RESEARCH_GATHER_TEMPLATE } from "../prompt/templates/research-gather";

// 素材搜集节点(research.gather,跑在 **Vercel AI SDK** 上,弃旧 Claude Agent SDK + WebSearch)。
// 这是唯一**带工具**的迁移节点:用 @ai-sdk/anthropic 的 **provider 内置 web search 工具**
// (webSearch_20250305,服务端执行、随模型计费、不引第三方付费搜索 API),挂进 runAgentNode
// 的多步循环让模型多角度搜→挑→产出素材。产物是结构化 MaterialItem[],由上层渲染成
// material_list 候选。提示词走外置模板(research.gather),换调研方法论不动本文件。
//
// 约束:provider 内置 web search 只在 **anthropic** 协议族下可用。runner 解析出非 anthropic
// 端点(DeepSeek/MiniMax 兼容)时无对等内置搜索 → 不静默降级、不擅自引第三方,由 runner 决定
// 是否传 tools;本节点 anthropicWebSearchTools() 仅供 anthropic 路径调用。

export interface MaterialItem {
  title: string;
  url: string;
  source: string;
  why_relevant: string;
}

export interface RunResearchNodeInput {
  /** 已解析好的模型(provider-factory.modelFor)。 */
  model: LanguageModel;
  /** 装配好的定位简报(creative-context;调用方已兜底,绝不空)。 */
  positioningBrief: string;
  /** 本期选题标题(必需)。 */
  topicTitle: string;
  /** 选题切入角度(选填)。 */
  topicAngle?: string;
  /**
   * 联网搜索工具集(anthropic 路径由 runner 注入 anthropicWebSearchTools();
   * 非 anthropic 路径省略 → 纯生成,无联网)。
   */
  tools?: ToolSet;
  /** 护栏:最大步数(默认 8 —— 多角度 web search 的工具循环需要余量)。 */
  maxSteps?: number;
  /** 步骤回调 —— 喂窗口步骤日志(第1步搜趋势 / 第2步搜对标…)。 */
  onStep?: (event: AgentStepEvent) => void | Promise<void>;
}

export interface RunResearchNodeResult {
  items: MaterialItem[];
  steps: AgentStepEvent[];
}

/**
 * Anthropic provider 内置的 web search 工具集 —— 服务端执行(provider-executed),
 * 模型调用 `web_search` 即由 Anthropic 端联网检索并把结果喂回多步循环。maxUses 限次防跑飞。
 * 仅 anthropic 协议族可用;runner 在 spec.apiFormat==="anthropic" 时注入。
 */
export function anthropicWebSearchTools(opts?: { maxUses?: number }): ToolSet {
  return {
    web_search: anthropic.tools.webSearch_20250305({
      maxUses: opts?.maxUses ?? 6,
    }),
  };
}

/** 从 agent 文本里宽容抽出素材 JSON 数组(容忍 ``` 包裹 / 前后散文)。 */
export function parseMaterials(text: string): MaterialItem[] {
  if (!text) return [];
  let body = text.trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(body);
  if (fence?.[1]) body = fence[1].trim();
  const start = body.indexOf("[");
  const end = body.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(body.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((raw): MaterialItem | null => {
      const o = (raw ?? {}) as Record<string, unknown>;
      const title = typeof o.title === "string" ? o.title.trim() : "";
      if (!title) return null;
      return {
        title,
        url: typeof o.url === "string" ? o.url : "",
        source: typeof o.source === "string" ? o.source : "",
        why_relevant:
          typeof o.why_relevant === "string" ? o.why_relevant : "",
      };
    })
    .filter((m): m is MaterialItem => m !== null);
}

/** 跑一次素材搜集节点 —— Vercel AI SDK + 外置模板 + (anthropic)内置 web search,产素材 + 步骤事件。 */
export async function runResearchNode(
  input: RunResearchNodeInput,
): Promise<RunResearchNodeResult> {
  const { system, prompt } = bindPrompt(RESEARCH_GATHER_TEMPLATE, {
    positioning:
      input.positioningBrief ||
      "（创作者尚未设置定位——按选题本身的价值判断相关性即可）",
    topic: input.topicTitle,
    angle: input.topicAngle ? `\n切入角度：${input.topicAngle}` : "",
  });
  const res = await runAgentNode({
    model: input.model,
    system,
    prompt,
    tools: input.tools,
    maxSteps: input.maxSteps ?? 8,
    onStep: input.onStep,
  });
  const items = parseMaterials(res.text);
  if (items.length === 0) {
    throw new Error("research-node: agent 未产出可解析素材");
  }
  return { items, steps: res.steps };
}
