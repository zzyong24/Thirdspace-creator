import type { AiPublishingPort } from "../ai/ai.service";
import type { PublishingService } from "../publishing/publishing.service";

/** 发布平台协议别名转换；不做内容判断，草稿仍由用户明确采纳。 */
export function createPlatformDraftAdoptionPort(publishing:Pick<PublishingService,"createPublication"|"createRevision">):AiPublishingPort {
  return {
    async createPublicationFromDraft(ctx,outputId,draft){
      const aliases:Record<string,string>={wechat:"wechatVideo",weixin:"wechatVideo"};
      const publication=await publishing.createPublication(ctx,outputId,{platform:aliases[draft.platform] ?? draft.platform,accountReference:""});
      await publishing.createRevision(ctx,publication.id,{title:draft.title,description:draft.body,platformTags:draft.tags ?? []});
      return publication;
    },
  };
}
