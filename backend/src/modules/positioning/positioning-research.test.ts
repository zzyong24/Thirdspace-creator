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

  it("地域行业 IP 查询必须同时匹配行业与创作意图，不拿百科和政府页凑数", () => {
    const results = selectDiscoveryResearchResults(
      "湖南餐饮行业IP",
      [
        {
          title: "湖南省_百度百科",
          url: "https://baike.baidu.com/item/hunan",
          snippet: "湖南省行政区划、人口和地理概况。",
        },
        {
          title: "湖南省人民政府门户网站",
          url: "https://www.hunan.gov.cn/",
          snippet: "湖南省政务信息公开。",
        },
        {
          title: "湖南餐饮门店如何打造短视频 IP",
          url: "https://www.douyin.com/article/hunan-food-ip",
          snippet: "本地餐饮主理人通过探店内容、门店故事和账号运营获得客户。",
        },
        {
          title: "长沙餐饮老板做个人品牌的三个案例",
          url: "https://www.zhihu.com/question/changsha-food-brand",
          snippet: "湖南餐饮行业的短视频账号定位与内容运营方法。",
        },
      ],
      { market: "cn", language: "zh-CN" },
      5,
    );

    expect(results.map((item) => item.url).sort()).toEqual([
      "https://www.douyin.com/article/hunan-food-ip",
      "https://www.zhihu.com/question/changsha-food-brand",
    ].sort());
  });

  it("地域行业 IP 查询允许收录同时命中地域和行业的公开产业资料", () => {
    const results = selectDiscoveryResearchResults(
      "湖南餐饮行业 IP",
      [
        {
          title: "第28届中国餐饮年度影响力峰会在湖南长沙举办",
          url: "https://www.cnr.cn/ent/canyin/hunan.html",
          snippet: "湖南餐饮品牌、门店经营者与产业趋势观察。",
        },
        {
          title: "湖南省概况",
          url: "https://www.hunan.gov.cn/hngk/",
          snippet: "湖南行政区划、人口与地理信息。",
        },
      ],
      { market: "cn", language: "zh-CN" },
      5,
    );

    expect(results.map((item) => item.url)).toEqual([
      "https://www.cnr.cn/ent/canyin/hunan.html",
    ]);
  });
});
