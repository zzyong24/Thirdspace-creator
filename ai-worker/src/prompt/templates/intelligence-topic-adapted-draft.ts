import type { PromptTemplate } from "../template";

/**
 * 内容雷达第三阶段：基于已保存拆解、选题和策略写一份可直接编辑的口播初稿。
 * 正文使用纯文本输出，不再为了携带长稿而扩大结构化 JSON schema。
 */
export const INTELLIGENCE_TOPIC_ADAPTED_DRAFT_TEMPLATE: PromptTemplate = {
  id: "intelligence.topic-adapted-draft",
  version: "v1",
  tools: [],
  system:
    "你是短视频编导。请基于来源逐字稿、已完成拆解、本账号定位、已确定选题和改写策略，" +
    "写一份属于当前账号的完整口播初稿。禁止复制来源标题、原句、案例和叙事顺序。",
  template: `【本账号定位】
{{positioning}}

【来源作品】
标题：{{sourceTitle}}
作者：{{sourceAuthor}}
原视频链接：{{sourceUrl}}

【来源逐字稿】
{{transcript}}

【已保存拆解】
{{decomposition}}

【我的选题卡】
{{topicCandidate}}

【改写策略】
{{adaptationStrategy}}

【任务】
直接输出主播会念的完整正文。围绕我的选题重新组织表达，执行 keep/replace/add/avoid；
不得输出 JSON、标题、分析、批注、Markdown 代码块或“以下是”。`,
  requiredFacets: [
    "positioning",
    "sourceTitle",
    "sourceAuthor",
    "sourceUrl",
    "transcript",
    "decomposition",
    "topicCandidate",
    "adaptationStrategy",
  ],
  contextRequirements: ["positioning"],
};
