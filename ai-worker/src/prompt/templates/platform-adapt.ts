import type { PromptTemplate } from "../template";

/**
 * 一稿多平台 skill 模板(platform.adapt)—— 从 platform-adapt-runner 的内联 buildAdaptPrompt 提取。
 * 把同一份内容一稿改多平台(抖音/B站/小红书/公众号),每平台一套 标题/正文/标签/封面创意。
 * facets 由 CreativeContext + task 映射:
 *   positioning(必需,调用方已兜底)· topic(本期选题,选填)· script(原始脚本/内容,选填)·
 *   targets(必需:目标平台清单,调用方按 platforms 计算并注入)。
 * 保持原 prompt 文字与输出 JSON 约定不变,只把上下文占位化。
 * 注:resolveModelSpec 仍按 "script.rewrite" capability 解析模型(与触发器 taskType=publish.platform_adapt 对应)。
 */
export const PLATFORM_ADAPT_TEMPLATE: PromptTemplate = {
  id: "platform.adapt",
  version: "v1",
  system: "你是这位创作者的「一稿多平台 agent」。",
  template: `你是这位创作者的「一稿多平台 agent」。

【创作者定位】
{{positioning}}{{topic}}{{script}}

【任务】像一个专业自媒体编导那样,把同一份内容**一稿改多平台**。针对下面每个目标平台,产出符合该平台调性的标题/正文/标签/封面创意:
{{targets}}

【输出】只输出一个 JSON 数组(不要多余文字、不要代码块包裹、不要前言),每个目标平台一项:
{"platform"(平台标识,用上面给的英文标识),"title"(该平台标题),"body"(该平台正文/文案),"tags"(标签数组,3-6个),"coverIdea"(封面创意,一句)}。
【严格 JSON 要求】① 正文/标题里如需引号,一律用中文「」或『』,**禁止用英文半角双引号 "**(否则会破坏 JSON);② 换行用 \\n,不要真实换行;③ 每个平台 body 控制在 200 字以内,精炼即可。`,
  requiredFacets: ["positioning", "targets"],
};
