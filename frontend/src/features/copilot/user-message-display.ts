/**
 * 系统代用户发起的内部种子消息（例如立项资料补全）仍以 user 角色落库并原样交给模型，
 * 但对话里只给用户看一句人话，不展示工具名、字段名或 JSON（月明录屏 2026-11-10，制作视频页编导对话）。
 * 前缀必须与后端 buildProjectPreparationBriefSeed 首句一致（有测试锁定）。
 */
export const PREPARATION_BRIEF_SEED_PREFIX = "请根据本项目已有资料，用 brief.fill 提出资料补全候选";
export const PREPARATION_BRIEF_SEED_DISPLAY = "请根据本项目已有资料补全立项信息（由系统自动发起）";

export function displayUserMessageText(text: string): string {
  if (text.trimStart().startsWith(PREPARATION_BRIEF_SEED_PREFIX)) return PREPARATION_BRIEF_SEED_DISPLAY;
  return text;
}
