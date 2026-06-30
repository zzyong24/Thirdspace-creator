import type { LanguageModel } from "ai";
import { runAgentNode, type AgentStepEvent } from "../runtime/agent-runtime";
import { bindPrompt } from "../prompt/template";
import { SCRIPT_DRAFT_TEMPLATE } from "../prompt/templates/script-draft";

// 分镜脚本节点(写文案,跑在 Vercel AI SDK 上,弃旧 LlmCompleter)。一个分镜 = 爆款公式的一拍。
// 产物是结构化 ScriptShot[](口播/画面/字幕/时长 四字段独立,不压扁 —— 配合 CollabField 逐字段可改),
// 由上层渲染成 artifact_version 候选。提示词走外置模板(script.draft),换方法论不动本文件。

export interface ScriptShot {
  口播: string;
  画面: string;
  字幕: string;
  时长: string;
}

export interface RunScriptNodeInput {
  /** 已解析好的模型(provider-factory.modelFor)。 */
  model: LanguageModel;
  /** 装配好的定位简报(creative-context)。 */
  positioningBrief: string;
  /** 过往复盘爆款要素(选填)。 */
  learningsBrief?: string;
  /** 本期选题标题/切入(选填)。 */
  topicTitle?: string;
  topicAngle?: string;
  /** 横屏/竖屏(SKL-02,选填):喂 AI 调 hook 与时长。 */
  orientation?: string;
  /** 策划论点树 brief(SEAM-01,选填):脚本据此把核心/支撑/证据写进口播。 */
  thesisBrief?: string;
  /** 内容合同 brief(SEAM-01,选填):脚本须遵守受众定位/价值主张/节奏/CTA。 */
  contractBrief?: string;
  /** 策划结构方案 brief(SEAM-01,选填):脚本按结构方案段落顺序铺分镜,不另起结构。 */
  outlineBrief?: string;
  /** 步骤回调 —— 喂窗口步骤日志。 */
  onStep?: (event: AgentStepEvent) => void | Promise<void>;
}

export interface RunScriptNodeResult {
  shots: ScriptShot[];
  steps: AgentStepEvent[];
}

/** 从 agent 文本里宽容抽出分镜 JSON 数组(容忍 ``` 包裹 / 前后散文)。 */
export function parseShots(text: string): ScriptShot[] {
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
    .map((raw): ScriptShot | null => {
      const o = (raw ?? {}) as Record<string, unknown>;
      const 口播 = typeof o.口播 === "string" ? o.口播.trim() : "";
      const 画面 = typeof o.画面 === "string" ? o.画面.trim() : "";
      const 字幕 = typeof o.字幕 === "string" ? o.字幕.trim() : "";
      const 时长 = typeof o.时长 === "string" ? o.时长.trim() : "";
      if (!口播 && !画面 && !字幕) return null;
      return { 口播, 画面, 字幕, 时长 };
    })
    .filter((s): s is ScriptShot => s !== null);
}

/** 跑一次写文案节点 —— Vercel AI SDK + 外置模板,产可解析分镜 + 步骤事件。 */
export async function runScriptNode(
  input: RunScriptNodeInput,
): Promise<RunScriptNodeResult> {
  const { system, prompt } = bindPrompt(SCRIPT_DRAFT_TEMPLATE, {
    positioning:
      input.positioningBrief || "（创作者尚未设置定位——按通用爆款逻辑写脚本）",
    learnings: input.learningsBrief
      ? `\n【过往复盘爆款要素】\n${input.learningsBrief}`
      : "",
    topic: input.topicTitle
      ? `\n【本期选题】${input.topicTitle}${
          input.topicAngle ? `（切入：${input.topicAngle}）` : ""
        }`
      : "",
    orientation: input.orientation
      ? `\n【形式】${input.orientation}（据此调整钩子与时长）`
      : "",
    // SEAM-01:策划阶段产物 —— 论点树 / 内容合同 / 结构方案。有则注入,让脚本铺它们的结构与论点。
    thesis: input.thesisBrief
      ? `\n【论点树（核心/支撑/证据/反驳）】\n${input.thesisBrief}`
      : "",
    contract: input.contractBrief
      ? `\n【内容合同（受众定位/价值主张/核心节奏/行动召唤）】\n${input.contractBrief}`
      : "",
    outline: input.outlineBrief
      ? `\n【策划结构方案（脚本按此铺分镜）】\n${input.outlineBrief}`
      : "",
  });
  const res = await runAgentNode({
    model: input.model,
    system,
    prompt,
    maxSteps: 4,
    onStep: input.onStep,
  });
  const shots = parseShots(res.text);
  if (shots.length === 0) {
    throw new Error("script-node: agent 未产出可解析分镜");
  }
  return { shots, steps: res.steps };
}
