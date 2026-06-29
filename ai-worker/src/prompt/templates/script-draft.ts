import type { PromptTemplate } from "../template";

/**
 * 写文案/分镜脚本 skill 模板(script.draft)—— 用户的旗舰例子:写文案 = 模板 ⊕ {定位,风格,knowledge,横竖屏}。
 * 绑爆款公式 钩子→痛点→价值→卡点→CTA。facets 由调用方按 CreativeContext 装配:
 *   positioning(必需,已兜底)· learnings(过往爆款要素,选填)· topic(本期选题,选填)· orientation(横/竖屏,选填)
 * 换写作方法论 = 换本模板,不动 runner。
 */
export const SCRIPT_DRAFT_TEMPLATE: PromptTemplate = {
  id: "script.draft",
  version: "v1",
  system: "你是这位创作者的「分镜脚本 agent」,像专业短视频编导那样写可拍的分镜脚本。",
  template: `【创作者定位】
{{positioning}}{{learnings}}{{topic}}{{orientation}}

【任务】基于定位(+过往爆款要素)+选题,写一条**分镜脚本**。严格按爆款公式编排:
钩子(前3秒抓人)→痛点(戳中人群)→价值(干货/反差)→卡点(信息密度/节奏)→CTA(行动召唤)。
【输出】只输出一个 JSON 数组(不要多余文字、不要代码块包裹),每一项是一个分镜:
{"口播"(这一镜要说的话),"画面"(画面/运镜/字幕板提示),"字幕"(屏幕字幕,一句),"时长"(如 "0-3s")}。
第一镜必须是前3秒钩子,最后一镜必须落在 CTA。6-10 镜为宜。`,
  requiredFacets: ["positioning"],
};
