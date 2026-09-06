const SURFACE_SKILL: Record<string, string> = {
  topics: "chatbox.topic",
  calibration: "chatbox.calibration",
  positioning: "chatbox.positioning",
  review: "chatbox.review",
  // project surface 先复用选题编导(项目内多为推进选题/脚本);深化留后续切片。
  project: "chatbox.topic",
  // [T-094] 知识倾倒场蒸馏对话面:粘原文 → knowledge.distill 工具 → 确认门卡采纳。
  // scope 隔离位 = surface:knowledge-distill(chat-scope.ts KNOWLEDGE_DISTILL_SCOPE,T-096 预留)。
  "knowledge-distill": "chatbox.distill",
};

/** 默认 ChatBox 基础 skill —— 未知 surface 的回落(选题编导是最通用的一面)。 */
export const DEFAULT_CHAT_SKILL = "chatbox.topic";

/** 解析页面层 surface 到基础 skill id(纯函数,SPEC §3.2 第 1 层)。 */
export function resolveSkillForSurface(surface: string): string {
  return SURFACE_SKILL[surface] ?? DEFAULT_CHAT_SKILL;
}
