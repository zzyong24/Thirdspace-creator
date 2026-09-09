import { describe, expect, it } from "vitest";
import { withBusinessMethod } from "../business-methods";
import { SCRIPT_DRAFT_TEMPLATE } from "./script-draft";
import { SCRIPT_VOICEOVER_COMPOSE_TEMPLATE } from "./script-voiceover-storyboard";

describe("T-944 写稿保留认知推进，但不强造对立", () => {
  it.each([SCRIPT_DRAFT_TEMPLATE, SCRIPT_VOICEOVER_COMPOSE_TEMPLATE])("$id 的最终方法用事实推进，避免凑时长或虚构旧观点", template => {
    const effective = withBusinessMethod(template);
    expect(effective.system).toContain("不能为制造反转虚构一个愚蠢的旧观点");
    expect(effective.system).toContain("每段增加事实、解释、证据");
    expect(effective.system).toContain("不能换词重复凑时长");
  });
});
