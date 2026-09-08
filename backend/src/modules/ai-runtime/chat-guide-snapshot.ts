import type { ChatToolDeps } from "./chat-tools";

/** 可选产品说明只影响自身工具；账号、主 Skill 与任务快照错误仍由原边界阻断。 */
export async function resolveChatGuideSnapshot(surface: string): Promise<ReturnType<NonNullable<ChatToolDeps["readCreatorOsGuide"]>> | null> {
  const { hasActiveEffectiveSkillSnapshot, getEffectiveSkill, getOfficialSkillBase, CREATOROS_GUIDE_VERIFIED_AT, EffectiveSkillRuntimeError } = await import("@creatoros/ai-worker");
  if (!hasActiveEffectiveSkillSnapshot() || (surface !== "topics" && surface !== "project")) return null;
  const unavailable = (reason: "missing" | "version" | "overlay" | "content") => {
    console.warn("[chat-guide] optional guide unavailable", { code: "CREATOROS_GUIDE_UNAVAILABLE", reason });
    return null;
  };
  let guide;
  try {
    guide = getEffectiveSkill("creatoros.guide");
  } catch (error) {
    if (error instanceof EffectiveSkillRuntimeError && error.code === "SKILL_SNAPSHOT_INCOMPLETE") return unavailable("missing");
    throw error;
  }
  // SEMANTIC_BOUNDARY_ALLOW: 比对可信官方契约完整版本及正文，不判断内容创作质量。
  // 方法层会装饰 Skill 版本；工具返回的 v1 是接口版本，不是 Skill 的内部版本。
  const official = getOfficialSkillBase("creatoros.guide");
  if (!official || guide.baseVersion !== official.baseVersion) return unavailable("version");
  if (guide.overlayRevision !== null || guide.overlayVersion !== null) return unavailable("overlay");
  if (!guide.effective.methodSystem.trim() || guide.effective.methodSystem !== official.methodSystem) return unavailable("content");
  return {
    skillId: "creatoros.guide",
    version: "v1",
    verifiedAt: CREATOROS_GUIDE_VERIFIED_AT,
    guide: guide.effective.methodSystem,
    limitations: [
      "资料未确认、可能变化或尚未交付的能力不得当成当前事实",
      "不得编造指标、用户规模、发布时间、平台支持或商业成绩",
    ],
  };
}
