import { describe, it, expect } from "vitest";
import {
  ANTI_FABRICATION_CLAUSE,
  UNGROUNDED_MARK,
  buildGroundingHaystack,
  extractSpecificClaims,
  isClaimGrounded,
  findUngroundedClaims,
  annotateUngroundedClaims,
} from "./grounding-facets";

// [T-269/T-270] 共享接地 facet 包 —— anti-fabrication 常量 + 可溯后处理纯函数。

describe("ANTI_FABRICATION_CLAUSE — 可溯反编造硬约束段", () => {
  it("承载 rule #9 核心语义:可溯/不可溯标推断/禁 A 偷换 B/宁缺毋滥", () => {
    expect(ANTI_FABRICATION_CLAUSE).toContain("必须遵守");
    expect(ANTI_FABRICATION_CLAUSE).toContain("具体数字");
    expect(ANTI_FABRICATION_CLAUSE).toContain("追溯");
    expect(ANTI_FABRICATION_CLAUSE).toContain("我的推断");
    expect(ANTI_FABRICATION_CLAUSE).toContain("偷换");
    // 实录病例的原型措辞在场(把「多个 AI 评审」写成「22 个 AI 智能体」)。
    expect(ANTI_FABRICATION_CLAUSE).toContain("22 个 AI 智能体");
  });
});

describe("extractSpecificClaims — 抽高危具体 claim", () => {
  it("命中计数/量级/伪精度引用", () => {
    expect(extractSpecificClaims("脚手架里有 22 个 AI 智能体互相盯")).toContain(
      "22 个",
    );
    expect(extractSpecificClaims("准确率 85.9%")).toContain("85.9%");
    expect(extractSpecificClaims("在 SWE-bench 上 pass@1")).toEqual(
      expect.arrayContaining(["SWE-bench", "pass@1"]),
    );
    // 原文形态保留(matchAll 从输入文本抓片段,大小写不变)。
    expect(extractSpecificClaims("见 arXiv 2308.00352")).toContain(
      "arXiv 2308.00352",
    );
    expect(extractSpecificClaims("提速 3 倍")).toContain("3 倍");
    expect(extractSpecificClaims("涨粉 10 万")).toContain("10 万");
  });

  it("刻意豁免:整数百分比 / 时间时长 / 序数(避免过度标注)", () => {
    // 整数百分比是方向性常识陈述,不算伪精度(与 T-228 同款豁免)。
    expect(extractSpecificClaims("90% 的人都错了")).toEqual([]);
    // 「前 3 秒钩子」的 3 秒是创作术语,不是事实断言。
    expect(extractSpecificClaims("前 3 秒必须抓人")).toEqual([]);
    // 序数不算具体计数断言。
    expect(extractSpecificClaims("第 3 步")).toEqual([]);
  });
});

describe("buildGroundingHaystack / isClaimGrounded — 相对可溯判定", () => {
  it("claim 命中注入语料(容忍空白排版差)→ grounded", () => {
    const hay = buildGroundingHaystack(
      "定位:AI 编导",
      "【立项硬约束】核心信息:脚手架里有22个AI智能体互相评审",
      undefined,
    );
    expect(isClaimGrounded("22 个", hay)).toBe(true); // 「22 个」归一后命中「22个」
    expect(isClaimGrounded("99 个", hay)).toBe(false);
  });

  it("空 claim / 空语料 → 不可溯", () => {
    expect(isClaimGrounded("", "任意语料")).toBe(false);
    expect(isClaimGrounded("22 个", "")).toBe(false);
  });
});

describe("findUngroundedClaims / annotateUngroundedClaims — 可溯后处理", () => {
  it("不可溯的具体 claim → 非破坏式追加未溯源标注(原文保留)", () => {
    const hay = buildGroundingHaystack("定位:AI 编导科普", "选题:提示词技巧");
    const { text, ungrounded } = annotateUngroundedClaims(
      "22 个 AI 智能体互相盯着写代码",
      hay,
    );
    expect(ungrounded).toContain("22 个");
    expect(text).toContain("22 个 AI 智能体互相盯着写代码"); // 原文不删
    expect(text).toContain(UNGROUNDED_MARK.trim());
  });

  it("claim 可溯(命中素材)→ 不标注", () => {
    const hay = buildGroundingHaystack(
      "【用户第一手资料】设计文档被 22 个 AI 智能体评审过",
    );
    const { text, ungrounded } = annotateUngroundedClaims(
      "重点:22 个 AI 智能体评审",
      hay,
    );
    expect(ungrounded).toEqual([]);
    expect(text).not.toContain(UNGROUNDED_MARK.trim());
  });

  it("无具体 claim → 原样返回", () => {
    const { text } = annotateUngroundedClaims("这条内容讲纪律的价值", "任意");
    expect(text).toBe("这条内容讲纪律的价值");
  });

  it("幂等:已带标注不重复追加", () => {
    const hay = buildGroundingHaystack("无关语料");
    const once = annotateUngroundedClaims("造了 5 个假数据", hay).text;
    const twice = annotateUngroundedClaims(once, hay).text;
    expect(twice).toBe(once);
  });
});
