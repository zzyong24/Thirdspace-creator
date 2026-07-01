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
 * 会话选中态(T-027)—— 从工作台一键岛打开 Copilot 时携带的「当前对话针对哪条内容」。
 * `kind` = 内容类型(subjectType,如 project/publication);`ids` = 目标 id(一般单个);
 * `label` = 展示标题(经 deeplink query 带进来,注入 system 让模型知道"这条"是啥)。
 */
export interface ChatSelection {
  kind: string;
  ids: string[];
  label?: string;
}

/**
 * 会话上下文(SPEC §3.2)。`surface` 必填(页面层),其余可选。接通 surface 层 + 数据层 + 选中态层。
 * `functionKey`(按钮层叠加)。`selection`(T-027):工作台选中内容,注入 system + 作工具入参兜底。
 */
export interface ChatContext {
  /** 页面层 —— 选基础 skill(选题页 = topics → chatbox.topic)。 */
  surface: string;
  /** 按钮层 —— 在基础 skill 上叠加专用工具白名单(本切片留口子)。 */
  functionKey?: string;
  /** 当前项目(数据层装配 项目相关 facets 用)。 */
  projectId?: string | null;
  /** 选中的候选/作品(T-027 selection-aware:注入 system + 工具入参兜底)。 */
  selection?: ChatSelection;
}

/** 选中态 kind → 中文标签(注入 system 用)。未命中回落"内容"。 */
const SELECTION_KIND_LABEL: Record<string, string> = {
  project: "作品/项目",
  publication: "已发布内容",
  artifact: "创作产出",
  candidate: "候选",
  topic: "选题",
};

/**
 * 选中态注入(T-027)—— 把工作台选中的内容(标题)拼成 system 上下文块,接到 skill system 后。
 * 这是修「Copilot 瞎答/反复索要标题」的核心:模型一进来就知道用户"这条"指的是哪条内容,
 * 直接展开诊断/讨论,而不是问"你的标题是什么"。无选中态 / 无标题 → 返回空串(不喂噪声)。
 */
export function assembleSelectionContext(
  selection: ChatSelection | undefined,
): string {
  const label = selection?.label?.trim();
  if (!selection || !label) return "";
  const kindLabel = SELECTION_KIND_LABEL[selection.kind] ?? "内容";
  return [
    `【本次对话针对创作者选中的${kindLabel}】`,
    `标题:《${label}》`,
    `用户就是要你针对这条内容展开(诊断 / 讨论 / 优化);对话里的"这条""这个""它"默认都指它。` +
      `不要再问"你的标题是什么"——标题已在上方。若需要文稿/数据细节而用户尚未提供,可礼貌请用户补充,但绝不重复索要标题。`,
  ].join("\n");
}

/**
 * 页面层 surface → 基础 skill id(SPEC §3.2 第 1 层)。slice 2 补齐四个工作台 surface:
 * 选题/校准/定位/复盘 各对应自己的对话编导 skill(三位一体范式,见 ai-worker registry)。
 * `project`(项目内总控)本切片先回落到选题编导(深化是后续切片);未命中的 surface 同样回落,
 * 保证路由不因未知 surface 崩。
 */
const SURFACE_SKILL: Record<string, string> = {
  topics: "chatbox.topic",
  calibration: "chatbox.calibration",
  positioning: "chatbox.positioning",
  review: "chatbox.review",
  // project surface 先复用选题编导(项目内多为推进选题/脚本);深化留后续切片。
  project: "chatbox.topic",
};

/** 默认 ChatBox 基础 skill —— 未知 surface 的回落(选题编导是最通用的一面)。 */
export const DEFAULT_CHAT_SKILL = "chatbox.topic";

/** 解析页面层 surface 到基础 skill id(纯函数,SPEC §3.2 第 1 层)。 */
export function resolveSkillForSurface(surface: string): string {
  return SURFACE_SKILL[surface] ?? DEFAULT_CHAT_SKILL;
}

/**
 * 按钮层 functionKey 叠加(SPEC §3.2 第 2 层)—— 一键岛点「出题/诊断/分析」等按钮打开 ChatBox 时,
 * 把该按钮对应的专用工具**置顶**到基础 skill 的工具白名单最前,让模型本轮优先调它(预调)。
 *
 * 设计取舍:不是另换一套 skill,而是在基础 skill 的白名单上做**重排序**(把 functionKey 命中的
 * 工具提到第 0 位)。这样既尊重 surface 选的基础 skill(system/输出契约不变),又让按钮语义生效。
 * - functionKey 为空 / 不在该 skill 白名单内(越权)→ 原样返回(不臆造工具,防越权,与铁律一致)。
 * - functionKey 已在白名单里 → 去重后置顶,其余保序。纯函数,可单测。
 */
export function applyFunctionKey(
  baseWhitelist: readonly string[],
  functionKey: string | undefined,
): readonly string[] {
  if (!functionKey || !baseWhitelist.includes(functionKey)) {
    return baseWhitelist;
  }
  return [functionKey, ...baseWhitelist.filter((t) => t !== functionKey)];
}

/**
 * 数据层注入(SPEC §3.2 第 3 层)—— 把装配好的 CreativeContext facets 拼成给模型的 system
 * 上下文块,接到 skill 的 system(角色/方法论)后面。只拼**非空** facet(空的不喂噪声)。
 *
 * 通用接通的 facets:定位(positioning)、过往复盘爆款要素(learnings)、受众信号(signals,
 * 即数据底座真实评论)、知识库(knowledge)。这正是选题编导出题要立足的真实记忆。
 *
 * T-039b per-action 注入矩阵补齐:`accountsBrief`(抖音账号画像)是**定位对话专属**的 facet
 * ——定位提案要立足「这个人在平台上已经是谁」(平台/账号/粉丝量),而出题/复盘/校准不需要它。
 * 故它作为**可选 opts** 传入(默认不注,不给其它 surface 塞账号噪声),仅 positioning surface
 * 的装配点显式传 `{ includeAccounts: true }`(见 chat-runner)。空 accountsBrief 仍不注入(诚实)。
 */
export function assembleChatSystem(
  skillSystem: string,
  // accountsBrief 可选(仅 includeAccounts 时读)—— 其它已有调用方(只传 4 个 facet)仍类型通过。
  context: Pick<
    CreativeContext,
    "positioningBrief" | "learningsBrief" | "signalsBrief" | "knowledgeBrief"
  > &
    Partial<Pick<CreativeContext, "accountsBrief">>,
  opts?: { includeAccounts?: boolean },
): string {
  const blocks: string[] = [skillSystem.trim()];

  const facet = (label: string, body: string) => {
    const v = body.trim();
    if (v) blocks.push(`【${label}】\n${v}`);
  };

  facet("创作者定位", context.positioningBrief);
  // 账号画像仅定位对话注入(includeAccounts)—— 定位提案的立足点;其它 surface 不注(避免噪声)。
  if (opts?.includeAccounts) {
    facet("抖音账号画像(平台/账号/粉丝量)", context.accountsBrief ?? "");
  }
  facet("过往复盘爆款要素", context.learningsBrief);
  facet("受众信号(真实评论/咨询)", context.signalsBrief);
  facet("可依托的知识库资料", context.knowledgeBrief);

  return blocks.join("\n\n");
}
