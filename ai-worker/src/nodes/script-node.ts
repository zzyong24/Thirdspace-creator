import type { LanguageModel } from "ai";
import type { AgentStepEvent } from "../runtime/agent-runtime";
import { runStructuredNode } from "./structured-node";
import { SCRIPT_DRAFT_TEMPLATE } from "../prompt/templates/script-draft";

// 分镜脚本节点(写文案,跑在 Vercel AI SDK 上,弃旧 LlmCompleter)。一个分镜 = 爆款公式的一拍。
// 产物是结构化 ScriptShot[](口播/画面/字幕/时长 四字段独立,不压扁 —— 配合 CollabField 逐字段可改),
// 由上层渲染成 artifact_version 候选。提示词走外置模板(script.draft),换方法论不动本文件。
//
// T-023 跨模型健壮性:改走 **runStructuredNode**(generateObject 绑 script.draft 的 outputSchema,
// 落空则文本兜底抽 JSON 再同 schema 校验),复用 research.gather / calibration.score 同一条防发散路。
// 旧路径(runAgentNode 拿自由文本 + parseShots 宽容解析)在用户默认的 MiniMax-M3 下常吐不出可解析
// 数组 → 抛「未产出可解析分镜」→ 任务 cancelled(AI 初稿出不来的根因)。结构化 + 兜底后任何模型都产
// 可解析分镜。parseShots 仍作纯工具导出(采纳卡预览等复用),不再是本节点的解析主路。

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
  // [T-062b gate-F3] 知识库参考(选填,creative-context 装配)。
  knowledgeBrief?: string;
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
  /** [T-081] 对话中获得的补充指令/洞察(选填):原样注入 prompt,优先级高于既有档案。 */
  extraBrief?: string;
  /** 步骤回调 —— 喂窗口步骤日志。 */
  onStep?: (event: AgentStepEvent) => void | Promise<void>;
  /** 护栏:结构化校验失败的最大重试次数(默认 2,透传 runStructuredNode)。 */
  maxRetries?: number;
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

/**
 * 跑一次写文案节点 —— runStructuredNode(generateObject 绑 script.draft outputSchema,落空则文本兜底)
 * 产**被 schema 卡死**的 { shots } + 一条步骤事件。facets 装配同旧路径(定位/过往爆款/选题/横竖屏/
 * 策划产物);SEAM-01 有策划产物就注入,让脚本铺它们的结构与论点。
 */
export async function runScriptNode(
  input: RunScriptNodeInput,
): Promise<RunScriptNodeResult> {
  const { object } = await runStructuredNode<{ shots: ScriptShot[] }>({
    model: input.model,
    template: SCRIPT_DRAFT_TEMPLATE,
    facets: {
      positioning:
        input.positioningBrief ||
        "（创作者尚未设置定位——按通用爆款逻辑写脚本）",
      learnings: input.learningsBrief
        ? `\n【过往复盘爆款要素】\n${input.learningsBrief}`
        : "",
      // [T-062b gate-F3] 知识库参考 —— 让脚本能引用创作者沉淀的素材/金句/逐字稿。
      knowledge: input.knowledgeBrief
        ? `\n--- 知识库参考 ---\n${input.knowledgeBrief}`
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
      // [T-081] 对话洞察/补充指令 —— ChatBox 对话里聊出的生成方向经此进 prompt(空则整段省略)。
      extraBrief: input.extraBrief
        ? `\n【本次生成指令（来自对话，优先遵循）】\n${input.extraBrief}`
        : "",
    },
    maxRetries: input.maxRetries,
  });
  // schema 让缺字段落成空串,故这里 trim + 滤掉三主字段全空的空镜(不摆空格子)。
  const shots: ScriptShot[] = (object.shots ?? [])
    .map((s) => ({
      口播: (s.口播 ?? "").trim(),
      画面: (s.画面 ?? "").trim(),
      字幕: (s.字幕 ?? "").trim(),
      时长: (s.时长 ?? "").trim(),
    }))
    .filter((s) => s.口播 || s.画面 || s.字幕);
  if (shots.length === 0) {
    throw new Error("script-node: agent 未产出可解析分镜");
  }
  // 结构化路径是单发(无多步工具循环),合成一条完成步事件喂窗口步骤日志(诚实:就一步)。
  const step: AgentStepEvent = {
    stepNo: 1,
    text: `已生成 ${shots.length} 个分镜`,
    toolCalls: [],
    finishReason: "stop",
  };
  await input.onStep?.(step);
  return { shots, steps: [step] };
}
