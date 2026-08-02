import { describe, expect, it } from "vitest";
import {
  buildDiscoveryResearchQuery,
  selectDiscoveryResearchResults,
} from "./positioning-research";

describe("positioning discovery research", () => {
  it("默认把国内关键词收窄到中国大陆简体中文语境", () => {
    expect(
      buildDiscoveryResearchQuery("国内智能体", {
        market: "cn",
        language: "zh-CN",
      }),
    ).toBe("国内智能体 中国大陆 简体中文");
  });

  it("过滤无关英文境外页面，并优先保留国内中文相关结果", () => {
    const results = selectDiscoveryResearchResults(
      "国内智能体",
      [
        {
          title: "Cafe Flora | Vegetarian Restaurant Seattle",
          url: "https://cafeflora.com/",
          snippet: "Seattle brunch and dinner restaurant.",
        },
        {
          title: "国内企业智能体正在进入业务流程",
          url: "https://www.36kr.com/p/agent",
          snippet: "中国企业如何应用智能体及其真实落地问题。",
        },
        {
          title: "智能体产品观察",
          url: "https://example.com/agent-cn",
          snippet: "国内用户关注智能体的成本、效果和使用门槛。",
        },
      ],
      { market: "cn", language: "zh-CN" },
      5,
    );

    expect(results.map((item) => item.url)).toEqual([
      "https://www.36kr.com/p/agent",
      "https://example.com/agent-cn",
    ]);
  });
});
