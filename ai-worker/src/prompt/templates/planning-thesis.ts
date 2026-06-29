import type { PromptTemplate } from "../template";

/**
 * 论点树 skill 模板(planning.thesis)—— 从 planning-runner 的内联 buildThesisPrompt 提取。
 * 策划阶段:构建一棵论点树(核心论点 + 支撑/证据/反驳 分支)。facets 由 CreativeContext 映射:
 *   positioning(必需,调用方已兜底)· learnings(过往爆款要素,选填)· topic(本期选题,选填)
 * 保持原 prompt 文字与输出 JSON 约定不变,只把上下文占位化。换方法论 = 换本模板,不动 runner。
 */
export const PLANNING_THESIS_TEMPLATE: PromptTemplate = {
  id: "planning.thesis",
  version: "v1",
  system: "你是这位创作者的「策划 agent」,负责为一期内容搭建论点树。",
  template: `你是这位创作者的「策划 agent」，负责为一期内容搭建**论点树**。

【创作者定位】
{{positioning}}{{learnings}}{{topic}}

【任务】基于定位(+过往爆款要素)+选题,构建一棵**论点树**:
- 一个**核心论点**(core):整期内容要立的那个观点,一句话标题 + 一句话展开。
- 3-6 个**分支**,每个分支属于以下三类之一:
  · support(支撑依据):为核心论点提供逻辑支撑的子论点;
  · evidence(证据):可引用的事实/数据/案例;
  · counter(反驳):预判受众的反对意见并给出回应。
分支要覆盖至少 support / evidence / counter 三类,使论点树立得住、辩得赢。

【输出】只输出一个 JSON 对象(不要多余文字、不要代码块包裹),形如:
{"core":{"title":"核心论点标题","summary":"一句话展开"},
 "branches":[{"column":"support","title":"...","summary":"..."},
             {"column":"evidence","title":"...","summary":"..."},
             {"column":"counter","title":"...","summary":"..."}]}`,
  requiredFacets: ["positioning"],
};
