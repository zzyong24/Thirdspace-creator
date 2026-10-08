import type { AiPublishingPort } from "../ai/ai.service";
import type { PublishingService } from "../publishing/publishing.service";

/** 发布平台协议别名转换；不做内容判断，草稿仍由用户明确采纳。 */
export function createPlatformDraftAdoptionPort(publishing:Pick<PublishingService,"adoptDraft">):AiPublishingPort {
  return {
    async createPublicationFromDraft(ctx,outputId,draft){
      const aliases:Record<string,string>={wechat:"wechatOfficial"};
      if(!draft.adoptionKey)throw new Error("DRAFT_ADOPTION_KEY_REQUIRED");
      return publishing.adoptDraft(ctx,{outputId,adoptionKey:draft.adoptionKey,platform:aliases[draft.platform] ?? draft.platform,title:draft.title,description:draft.body,platformTags:draft.tags ?? []});
    },
  };
}
