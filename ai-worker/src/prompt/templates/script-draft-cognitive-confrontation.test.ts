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

// 一句话快创也要遵守事实边界，检查最终系统指令而非只检查低优先级模板正文。
it.each([SCRIPT_DRAFT_TEMPLATE, SCRIPT_VOICEOVER_COMPOSE_TEMPLATE])("$id 在系统层约束无资料时的指标和经历", template => {
  const effective=withBusinessMethod(template);
  expect(effective.system).toContain("播放量门槛、涨粉指标、见效天数和平台算法规则");
  expect(effective.system).toContain("缺少依据时交付较短的方法稿");
  expect(effective.system).toContain("示例必须在示例本身说明是假设");
  expect(effective.system).toContain("精确比例、耗时、错峰窗口、增幅倍数与因果结论也需要来源");
  expect(effective.system).toContain("交稿前逐句核对所有数字和效果断言");
});
