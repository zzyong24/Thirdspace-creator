import type { ChatToolDeps } from "./chat-tools";
/** 在已绑定的Skill作用域内读取并校验；不读取当前账号配置或全局定制。 */
export async function resolveChatGuideSnapshot(surface:string):Promise<ReturnType<NonNullable<ChatToolDeps["readCreatorOsGuide"]>>|null> {
 const {hasActiveEffectiveSkillSnapshot,getEffectiveSkill,CREATOROS_GUIDE_VERIFIED_AT}=await import("@creatoros/ai-worker");
 const hasEffectiveScope=hasActiveEffectiveSkillSnapshot();
  return hasEffectiveScope &&
    (surface === "topics" || surface === "project")
      ? (() => {
          const guide = getEffectiveSkill("creatoros.guide");
          if (
            guide.baseVersion !== "v1" ||
            guide.overlayRevision !== null ||
            guide.overlayVersion !== null ||
            guide.effective.methodSystem.trim().length === 0
          ) {
            throw Object.assign(new Error(
              "[CREATOROS_GUIDE_UNAVAILABLE] creatoros.guide@v1 不可用",
            ), { code: "CREATOROS_GUIDE_UNAVAILABLE" });
          }
          return {
            skillId: "creatoros.guide" as const,
            version: "v1" as const,
            verifiedAt: CREATOROS_GUIDE_VERIFIED_AT,
            guide: guide.effective.methodSystem,
            limitations: [
              "资料未确认、可能变化或尚未交付的能力不得当成当前事实",
              "不得编造指标、用户规模、发布时间、平台支持或商业成绩",
            ],
          };
        })()
      : null;
}
