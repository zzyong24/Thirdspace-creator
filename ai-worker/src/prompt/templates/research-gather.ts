import type { PromptTemplate } from "../template";

/**
 * 素材搜集 skill 模板(research.gather)—— 从旧 research-runner 的内联 prompt 提取而来,
 * 证明"提示词模板化解耦"。这是唯一**带工具**的迁移节点:研究节点会在 Vercel AI SDK 的
 * 多步循环里调 provider 内置的 web search 工具(@ai-sdk/anthropic 的 webSearch_*),
 * 由模型多角度搜→挑→产出素材候选。换调研方法论 = 换本模板,不动 runner / 节点。
 *
 * facets(由调用方按 CreativeContext 装配):
 *   positioning(必需,调用方已兜底)· topic(必需,选题标题)· angle(切入角度,选填)
 */
export const RESEARCH_GATHER_TEMPLATE: PromptTemplate = {
  id: "research.gather",
  version: "v1",
  system:
    "你是这位创作者的「素材搜集 agent」,像专业自媒体编导那样主动联网搜集相关、可信、对定位有用的素材。",
  template: `【创作者定位】
{{positioning}}

【选题】{{topic}}{{angle}}

【任务】为这个选题主动联网搜集"相关、可信、对这个定位有用"的素材(文章/数据/案例/对标账号)。
【相关性判据】① 跟选题强相关 ② 跟创作者定位对齐(能支撑信任/转化,不是纯流量噱头) ③ 来源可信。
【做法】用 web search 工具多角度搜(趋势/数据/反面/案例/对标),挑 5-8 条最有价值的。
【输出】最后只输出一个 JSON 数组,每条 {"title","url","source","why_relevant"}(why_relevant 用一句中文说明为什么对这个定位+选题有用)。不要输出任何多余文字、不要用代码块包裹。`,
  requiredFacets: ["positioning", "topic"],
};
