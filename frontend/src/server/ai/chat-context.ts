import "server-only";
import type { CreativeContext } from "./creative-context";

// 上下文感知 ChatBox 的「三层注入」装配纯函数(SPEC §3.2)—— ChatBox 的心脏。
//
// 每个会话携带一个 ChatContext。/api/chat 据它做三层注入:
//   1. 页面层 surface → resolveSkillForSurface 选基础 skill(选题页 = chatbox.topic)。
//   2. 按钮层 functionKey → 在基础 skill 上叠加专用工具白名单(本切片留接口,先不全做)。
//   3. 数据层 → assembleChatSystem 把对应 CreativeContext facets 注进 system prompt。
//
// 本文件只做**纯装配**(surface→skill 映射 + facets→system 文本),不碰 AI SDK / 持久化 ——
// 故可被单测直接覆盖(SPEC §7「ChatContext 三层注入选对 skill」)。skill 的提示词模板 / 工具
// 白名单 / 输出契约都在 registry(@creatoros/ai-worker),运行时由路由取(别内联,SPEC §3.2)。

/**
 * 会话上下文(SPEC §3.2)。`surface` 必填(页面层),其余可选。本切片接通 surface 层 + 数据层;
 * `functionKey`(按钮层叠加)留字段 + 解析口子,完整叠加是后续切片的活。
 */
export interface ChatContext {
  /** 页面层 —— 选基础 skill(选题页 = topics → chatbox.topic)。 */
  surface: string;
  /** 按钮层 —— 在基础 skill 上叠加专用工具白名单(本切片留口子)。 */
  functionKey?: string;
  /** 当前项目(数据层装配 项目相关 facets 用)。 */
  projectId?: string | null;
  /** 选中的候选/作品(后续切片 selection-aware 用,本切片留字段)。 */
  selection?: { kind: string; ids: string[] };
}

/**
 * 页面层 surface → 基础 skill id(SPEC §3.2 第 1 层)。本切片只接 `topics` → `chatbox.topic`
 * (选题编导)。其它 surface(calibration/positioning/review/project…)是后续切片的活 —— 未命中
 * 时回落到 `chatbox.topic`(选题编导是当前唯一落地的 ChatBox skill),保证路由不因未知 surface 崩。
 */
const SURFACE_SKILL: Record<string, string> = {
  topics: "chatbox.topic",
};

/** 当前唯一落地的 ChatBox 基础 skill —— 未知 surface 的回落。 */
export const DEFAULT_CHAT_SKILL = "chatbox.topic";

/** 解析页面层 surface 到基础 skill id(纯函数,SPEC §3.2 第 1 层)。 */
export function resolveSkillForSurface(surface: string): string {
  return SURFACE_SKILL[surface] ?? DEFAULT_CHAT_SKILL;
}

/**
 * 数据层注入(SPEC §3.2 第 3 层)—— 把装配好的 CreativeContext facets 拼成给模型的 system
 * 上下文块,接到 skill 的 system(角色/方法论)后面。只拼**非空** facet(空的不喂噪声)。
 *
 * 本切片接通的 facets:定位(positioning)、过往复盘爆款要素(learnings)、受众信号(signals,
 * 即数据底座真实评论)、知识库(knowledge)。这正是选题编导出题要立足的真实记忆。
 * (其余 facet 由后续 surface 的 skill 按需接;此处不喂与选题无关的噪声。)
 */
export function assembleChatSystem(
  skillSystem: string,
  context: Pick<
    CreativeContext,
    "positioningBrief" | "learningsBrief" | "signalsBrief" | "knowledgeBrief"
  >,
): string {
  const blocks: string[] = [skillSystem.trim()];

  const facet = (label: string, body: string) => {
    const v = body.trim();
    if (v) blocks.push(`【${label}】\n${v}`);
  };

  facet("创作者定位", context.positioningBrief);
  facet("过往复盘爆款要素", context.learningsBrief);
  facet("受众信号(真实评论/咨询)", context.signalsBrief);
  facet("可依托的知识库资料", context.knowledgeBrief);

  return blocks.join("\n\n");
}
