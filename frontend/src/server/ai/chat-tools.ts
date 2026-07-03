import "server-only";
import { tool, jsonSchema, type Tool, type ToolSet } from "ai";

// 首波工具(本切片 2 个):topic.generate + topic.enrich,注册为 Vercel AI SDK tool
// (SPEC §3.4)。每个工具 = { description, parameters(JSON Schema), execute → 复用现有
// runner 核心 }。**工具结果 = 候选(非实体)**:execute 只产候选数组,绝不写领域实体 ——
// AI 不直接物化,人在对话里把候选渲成 AdoptCandidateCard 逐条采纳走 confirm 门(铁律②)。
//
// 工具白名单按 ChatContext 解析的 skill 暴露(getTools(skillId)):路由据此**过滤**真正挂给
// 模型的工具 —— 选题编导(chatbox.topic)的白名单是 ["topic.generate","topic.enrich"],正好
// 是本切片这两个。白名单外的(calibration.diagnose / review.analyze / positioning.generate)
// 是后续切片的活,此处不实现(它们不在任何已落地 skill 的白名单里,挂不上)。
//
// parameters 用 ai 的 jsonSchema()(而非 Zod):frontend 不直引 zod,且 JSON Schema 本就是
// 工具入参契约的可序列化载体(与 SPEC §4.3 配置口子同源)。execute 复用 ai-worker 的
// runTopicNode(产 TopicItem[] 候选)/ 选题卡补全(产 topic_card 候选),都经懒加载(AI SDK
// 不进 Next server 顶层 bundle,与各 runner 一致)。

// execute 复用现有 runner 所需的最小注入面:解析好的 model + 装配好的上下文 briefs。
// 路由在请求期解析(resolveModelSpec + assembleCreativeContext)后注入,故工具本身无副作用、
// 不碰持久化、不直连模块 repo —— 可单测(注入 fake 的 generate/enrich 实现即可)。
export interface ChatToolDeps {
  /**
   * topic.generate 核心 —— 复用 ai-worker.runTopicNode,产选题候选(TopicItem[])。
   * [T-081] extraBrief:对话中获得的补充指令/洞察,原样进生成 prompt(优先级高于既有档案)。
   */
  generateTopics: (input: {
    basis: "positioning" | "comments" | "knowledge" | "trend";
    extraBrief?: string;
  }) => Promise<
    Array<{
      title: string;
      angle: string;
      contentRole: string;
      predictedScore: number | null;
      reason: string;
      /** [T-066] 该选题依据的原始评论(逐字引用);非评论依据为空数组。 */
      sourceComments: string[];
    }>
  >;
  /** topic.enrich 核心 —— 把一条选题补全成选题卡候选(复用 enrich prompt + parseCard)。 */
  enrichTopic: (input: { title: string; angle: string }) => Promise<{
    oneLiner: string;
    targetAudience: string;
    audiencePain: string;
    coreConflict: string;
    hook: string;
    contentStructure: string[];
    format: string;
    materialBasis: string;
    riskNote: string;
    proposal: string;
    audiencePainScore: number | null;
    materialScore: number | null;
    productionDifficulty: "low" | "mid" | "high" | null;
  } | null>;
  /**
   * [T-055c] script.hooks 核心 —— 为当前项目产一组开场 hook 候选(3~5 条,非实体)。
   * 产物经 ChatHookCard 逐条「写入稿面」(client 走 artifacts 版本门物化,铁律②不破)。
   */
  generateHooks: (input: {
    topic?: string;
    direction?: string;
    /** [T-081] 对话中获得的补充指令/洞察,原样进生成 prompt(优先级高于既有档案)。 */
    extraBrief?: string;
  }) => Promise<Array<{ text: string; angle: string }>>;
  /**
   * [T-057⑤] script.draft 核心 —— 整稿分镜口播脚本候选(复用 runScriptNode,与旧
   * ScriptDraftIsland 同引擎)。产 sections 经 ChatScriptDraftCard「写入稿面」物化。
   */
  draftScript: (input: {
    topic?: string;
    angle?: string;
    /** [T-081] 对话中获得的补充指令/洞察,原样进生成 prompt(优先级高于既有档案)。 */
    extraBrief?: string;
  }) => Promise<Array<{ heading: string; body: string }>>;
  /**
   * [T-057④] material.gather 核心 —— 搜素材候选(复用 runResearchNode 四类结构化输出)。
   * 产物经 ChatGatherCard 逐条「存入弹药」(knowledge.create+materialLink,人采纳)。
   */
  gatherMaterials: (input: { query?: string }) => Promise<
    Array<{ title: string; url: string; source: string; whyRelevant: string; category: string }>
  >;
  /**
   * calibration.diagnose 核心 —— 对一条对话里描述的发布前内容(title + 可选 script)按变现加权
   * 评分标准逐维度盲评,产**诊断候选**(非实体)。复用 calibration.diagnose 模板 + parseDiagnosis。
   * 对话里没有绑定的 rubric reader 时,按通用维度评(诚实降级);一键岛带 subject 时用其标题。
   */
  diagnoseContent: (input: {
    title: string;
    script?: string;
    /** [T-081] 对话中获得的补充指令/洞察,原样进诊断 prompt(优先级高于既有档案)。 */
    extraBrief?: string;
  }) => Promise<{
    dimensions: Array<{
      key: string;
      score: number;
      reason: string;
      suggestion: string;
    }>;
    verdict: string;
    mainIssues: string[];
    priorityFixes: string[];
  } | null>;
  /**
   * review.analyze 核心 —— 从一条内容提炼可复用爆款要素候选(复用 review 模板 + parseLearnings)。
   * [T-081] extraBrief:对话中获得的补充指令/洞察,原样进复盘 prompt(优先级高于既有档案)。
   */
  analyzeReview: (input: { subject?: string; extraBrief?: string }) => Promise<
    Array<{ title: string; insight: string }>
  >;
  /**
   * positioning.generate 核心 —— 结合定位 + 账号画像 + 真实作品画像产一份结构化定位提案候选
   * (复用 positioning prompt + parseSuggestion)。
   * [T-081] extraBrief:对话中获得的补充指令/洞察(如模型翻完作品后的定位洞察),原样进生成
   * prompt(优先级高于既有档案)—— 修「模型翻完 80 条作品得出洞察却无通道传入,工具永远复读
   * 旧定位」的上下文断裂。
   */
  generatePositioning: (input: { extraBrief?: string }) => Promise<{
    persona: string;
    field: string;
    audience: string;
    differentiation: string;
    capabilities: string[];
    oneLiner: string;
    keywords: string[];
  } | null>;
  /**
   * [T-077b] brief.fill 的只读现状端口 —— 读**当前项目**的 briefDetail(选题卡现状),
   * 供工具结果带 `current`(前端卡渲「现值 → 建议值」字段对照)。chat-runner 用
   * chatContext.projectId 收窄(项目对话才有);无项目上下文 / 读不到 → null(诚实降级)。
   */
  getProjectBrief: () => Promise<BriefCurrentDetail | null>;
  /**
   * context.projects 只读端口 —— 列该用户最近的项目/作品(项目库 / 「最新一条」)。
   * **纯读上下文**(与上面的候选工具不同):不产候选、不写实体,只把真数据回给模型读进去用文字回答。
   * 按当前用户过滤(端口在 composition root 绑到 user-scoped 读源);limit 由 execute 兜(默认 5,封顶 10)。
   */
  listProjects: (input: { limit: number; offset: number }) => Promise<{
    rows: Array<{
      id: string;
      title: string;
      stage: string;
      status: string;
      publishedAt?: string | null;
    }>;
    total: number;
  }>;
  /**
   * [T-058③] context.comments 只读端口 —— 该用户的观众评论(audience_signals,
   * source='comment'),最新在前;可选按 publicationId 聚焦某条作品。**纯读上下文**。
   */
  listComments: (input: {
    limit: number;
    offset: number;
  }) => Promise<{
    rows: Array<{
      text: string;
      likeCount: number | null;
      source: string;
      createdAt: string;
    }>;
    total: number;
  }>;
  /**
   * context.knowledge 只读端口 —— 按 query 搜该用户的知识库(命中标题/摘要)。**纯读上下文**。
   * query 缺省则回最近若干条;limit 由 execute 兜。按当前用户过滤。
   */
  searchKnowledge: (input: { query: string; limit: number }) => Promise<
    Array<{ id: string; title: string; snippet: string }>
  >;
  /**
   * context.materials 只读端口 —— 按 query 搜该用户的素材库(assets)。**纯读上下文**。
   * query 缺省则回最近若干条;limit 由 execute 兜。按当前用户过滤。
   */
  searchMaterials: (input: { query: string; limit: number }) => Promise<
    Array<{ id: string; title: string; kind: string }>
  >;
}

// ── 工具结果形状(候选,非实体)──────────────────────────────────────────────────────
// 工具 execute 的返回值会随 tool-result part 流回前端;前端据 `kind` 把候选渲成
// AdoptCandidateCard。形状刻意与现有候选解析对齐(topic.generate 的 items / 选题卡字段),
// 这样对话内卡片与一键岛弹窗读同一份候选结构。

export interface TopicGenerateToolResult {
  kind: "topic.candidates";
  /** 渲成候选卡的 items —— 与 ai_task_results 的 candidate_list.items 同形(可走采纳门)。 */
  items: Array<{
    title: string;
    angle: string;
    contentRole: string;
    predictedScore: number | null;
    reason: string;
    /** [T-066] 基于评论出题必须贴原始评论 —— 候选卡渲「依据评论」折叠区的数据源。 */
    sourceComments: string[];
  }>;
}

export interface TopicEnrichToolResult {
  kind: "topic.card";
  card: Awaited<ReturnType<ChatToolDeps["enrichTopic"]>>;
}

// calibration.diagnose 工具结果 —— 维度评分诊断候选(渲成维度评分卡)。
export interface ScriptHooksToolResult {
  kind: "script.hooks";
  items: Array<{ text: string; angle: string }>;
}

export interface ScriptDraftToolResult {
  kind: "script.draft";
  sections: Array<{ heading: string; body: string }>;
}

export interface MaterialGatherToolResult {
  kind: "material.gather";
  items: Array<{ title: string; url: string; source: string; whyRelevant: string; category: string }>;
}

export interface CalibrationDiagnoseToolResult {
  kind: "calibration.diagnosis";
  diagnosis: Awaited<ReturnType<ChatToolDeps["diagnoseContent"]>>;
}

// review.analyze 工具结果 —— 可复用经验候选(渲成经验卡,逐条采纳沉淀)。
export interface ReviewAnalyzeToolResult {
  kind: "review.learnings";
  items: Array<{ title: string; insight: string }>;
}

// positioning.generate 工具结果 —— 一份定位提案候选(渲成定位卡)。
export interface PositioningGenerateToolResult {
  kind: "positioning.suggestion";
  suggestion: Awaited<ReturnType<ChatToolDeps["generatePositioning"]>>;
}

// [T-062a] learning.capture 的 8 类经验(与 learnings.create 契约 enum 同源)。
export type LearningCaptureType =
  | "strategy"
  | "hook"
  | "structure"
  | "failure"
  | "process"
  | "editing"
  | "conversion_pattern"
  | "offer_insight";

// [T-062a] learning.capture 工具结果 —— 一条结构化经验候选(渲成 ChatLearningCard,
// 人点「存为经验」才 createLearning 落裁决队列;execute 纯回显,不跑二次 LLM、不写库)。
export interface LearningCaptureToolResult {
  kind: "learning.capture";
  suggestion: {
    title: string;
    insight: string;
    learningType: LearningCaptureType;
  };
}

// [T-077b] brief.fill 的建议字段(与契约 projectBriefDetail 的文本字段对齐,模型直接填参)。
// 全部可选:模型只填对话里真聊到的字段,没聊到的不编(诚实,不生成占位文案)。
export interface BriefFillSuggestion {
  targetAudience?: string;
  contentGoal?: string;
  contentFormat?: string;
  coreMessage?: string;
  durationEstimate?: string;
  successCriteria?: string;
}

// [T-077b] 当前项目选题卡现状(契约 projectBriefDetail 全形状)—— 工具结果的 `current`,
// 前端卡据此渲「现值(空显未填)→ 建议值」对照,写入时以它为底 merge(不丢 orientation/平台)。
export interface BriefCurrentDetail extends BriefFillSuggestion {
  orientation?: "landscape" | "portrait";
  targetPlatforms?: string[];
}

// [T-077b] brief.fill 工具结果 —— 一份选题卡填充候选(渲成 ChatBriefCard 字段对照,
// 人点「写入选题卡」才 patchProject 落 brief_detail;execute 纯回显建议 + 读现状,不写库)。
export interface BriefFillToolResult {
  kind: "brief.fill";
  suggestion: BriefFillSuggestion;
  current: BriefCurrentDetail | null;
}

// ── 只读 context 工具结果(真数据,人机同源双消费)──────────────────────────────────────
// [T-098] 每个 context.* kind 都在前端 CONTEXT_CARD_REGISTRY(features/copilot/
// context-card-registry.tsx)有渲染卡:同一份结果 JSON,模型读进上下文归纳,前端直渲成
// 数据卡给用户看 —— 模型只有指针权、无转录权(honestyBlock 第 6 条)。新增 context 工具
// 必须同步配卡,覆盖锁测(context-card-registry.test.tsx)会红。形状刻意精简(只带答问所需字段)。

export interface ContextProjectsToolResult {
  kind: "context.projects";
  items: Array<{
    id: string;
    title: string;
    stage: string;
    status: string;
    publishedAt?: string | null;
  }>;
  // [T-058②] 分页真相:总量 + 本页范围 —— 模型据此如实告知「还有 N 条没看」。
  total: number;
  offset: number;
  hasMore: boolean;
}

export interface ContextCommentsToolResult {
  kind: "context.comments";
  items: Array<{
    text: string;
    likeCount: number | null;
    source: string;
    createdAt: string;
  }>;
  total: number;
  offset: number;
  hasMore: boolean;
}

export interface ContextKnowledgeToolResult {
  kind: "context.knowledge";
  items: Array<{ id: string; title: string; snippet: string }>;
}

export interface ContextMaterialsToolResult {
  kind: "context.materials";
  items: Array<{ id: string; title: string; kind: string }>;
}

// ── 工具入参 JSON Schema(可序列化契约)─────────────────────────────────────────────

// [T-081] 产内容工具统一的 extraBrief 入参(对齐 topic.generate deps 先例):对话里翻真数据/
// 讨论得出的洞察经它进入生成 prompt —— 修「模型有洞察、工具零入参无通道」的上下文断裂。
const EXTRA_BRIEF_PROPERTY = {
  type: "string",
  maxLength: 2000,
  description:
    "对话中获得的补充指令/洞察(如刚翻过的真实作品/评论提炼的结论、用户的具体要求),原样传入生成 prompt,优先级高于既有档案。对话里有生成方向共识时必须填,不要丢弃已聊出的洞察。",
} as const;

// [T-081] extraBrief 统一清洗:trim + 截 2000 字(与 schema maxLength 同值兜底,部分模型不吃
// maxLength 约束);空/非串 → undefined(prompt 侧整段省略,不注空噪声)。导出供单测。
export function clampExtraBrief(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const v = raw.trim();
  if (!v) return undefined;
  return v.length > 2000 ? v.slice(0, 2000) : v;
}

const TOPIC_GENERATE_PARAMS = jsonSchema<{
  basis?: "positioning" | "comments" | "knowledge" | "trend";
  extraBrief?: string;
}>({
  type: "object",
  properties: {
    basis: {
      type: "string",
      enum: ["positioning", "comments", "knowledge", "trend"],
      description:
        "出题依据:positioning=按定位 / comments=按真实评论需求 / knowledge=按知识库 / trend=按热点。缺省 positioning。",
    },
    extraBrief: EXTRA_BRIEF_PROPERTY,
  },
  additionalProperties: false,
});

const TOPIC_ENRICH_PARAMS = jsonSchema<{ title: string; angle?: string }>({
  type: "object",
  properties: {
    title: { type: "string", description: "要补全的选题标题(必填)。" },
    angle: { type: "string", description: "切入角度(可选,没有就留空让 AI 补)。" },
  },
  required: ["title"],
  additionalProperties: false,
});

const SCRIPT_HOOKS_PARAMS = jsonSchema<{
  topic?: string;
  direction?: string;
  extraBrief?: string;
}>({
  type: "object",
  properties: {
    topic: {
      type: "string",
      description: "这条内容的主题/标题(缺省用当前项目标题)",
    },
    direction: {
      type: "string",
      description: "hook 的方向要求(如「冲突感强一点」「用数据开场」),可选",
    },
    extraBrief: EXTRA_BRIEF_PROPERTY,
  },
  additionalProperties: false,
});

const SCRIPT_DRAFT_PARAMS = jsonSchema<{
  topic?: string;
  angle?: string;
  extraBrief?: string;
}>({
  type: "object",
  properties: {
    topic: { type: "string", description: "内容主题/标题(缺省用当前项目标题)" },
    angle: { type: "string", description: "切入角度/风格要求,可选" },
    extraBrief: EXTRA_BRIEF_PROPERTY,
  },
  additionalProperties: false,
});

const MATERIAL_GATHER_PARAMS = jsonSchema<{ query?: string }>({
  type: "object",
  properties: {
    query: { type: "string", description: "搜什么素材(缺省围绕当前项目主题)" },
  },
  additionalProperties: false,
});

const CALIBRATION_DIAGNOSE_PARAMS = jsonSchema<{
  title: string;
  script?: string;
  extraBrief?: string;
}>({
  type: "object",
  properties: {
    title: { type: "string", description: "待诊断内容的标题(必填)。" },
    script: {
      type: "string",
      description: "内容文稿/脚本(可选;没有就让 AI 基于标题与定位尽力诊断)。",
    },
    extraBrief: EXTRA_BRIEF_PROPERTY,
  },
  required: ["title"],
  additionalProperties: false,
});

const REVIEW_ANALYZE_PARAMS = jsonSchema<{
  subject?: string;
  extraBrief?: string;
}>({
  type: "object",
  properties: {
    subject: {
      type: "string",
      description: "本次复盘对象(可选;没有就按账号整体表现提炼经验)。",
    },
    extraBrief: EXTRA_BRIEF_PROPERTY,
  },
  additionalProperties: false,
});

// [T-062a] learning.capture 入参 —— 模型直接把对话里的经验整理成结构化三字段填参
// (不再二次跑 LLM);execute 原样回显成候选,人点卡上按钮才物化(铁律②)。
const LEARNING_CAPTURE_PARAMS = jsonSchema<{
  title: string;
  insight: string;
  learningType: LearningCaptureType;
}>({
  type: "object",
  properties: {
    title: {
      type: "string",
      description: "一句话经验标题(可复用的方法论/教训,如「前 3 秒放结论完播率高」)。",
    },
    insight: {
      type: "string",
      description: "为什么有效/适用场景/来龙去脉(从对话里提炼,保留用户原意)。",
    },
    learningType: {
      type: "string",
      enum: [
        "strategy",
        "hook",
        "structure",
        "failure",
        "process",
        "editing",
        "conversion_pattern",
        "offer_insight",
      ],
      description:
        "经验类型:strategy=选题策略 / hook=钩子 / structure=结构 / failure=失败教训 / process=流程 / editing=剪辑 / conversion_pattern=转化模式 / offer_insight=变现洞察。",
    },
  },
  required: ["title", "insight", "learningType"],
  additionalProperties: false,
});

// [T-077b] brief.fill 入参 —— 模型把对话里聊到的选题卡信息整理成结构化字段直接填参
// (不跑二次 LLM);execute 回显成候选 + 附当前项目现状,人点卡上「写入选题卡」才 patch(铁律②)。
const BRIEF_FILL_PARAMS = jsonSchema<BriefFillSuggestion>({
  type: "object",
  properties: {
    targetAudience: {
      type: "string",
      description: "目标观众(对话里聊到的这条内容给谁看,如「AI 新手」)。",
    },
    contentGoal: {
      type: "string",
      description: "内容目标(这条内容要达成什么,如「涨粉」「引流到私域」)。",
    },
    contentFormat: {
      type: "string",
      description: "内容形式(口播 / 短剧 / 图文…),对话里聊到才填。",
    },
    coreMessage: {
      type: "string",
      description: "核心信息(一句话主张,观众看完要记住什么)。",
    },
    durationEstimate: {
      type: "string",
      description: "预估时长(如「60 秒内」),对话里聊到才填。",
    },
    successCriteria: {
      type: "string",
      description: "成功标准(如「播放破 5 万」),对话里聊到才填。",
    },
  },
  additionalProperties: false,
});

// [T-081] positioning.generate 原为零入参(洞察无通道传入 → 工具内部只吃旧定位母版+账号画像,
// 永远复读旧卡)。现加 extraBrief:对话里翻真数据得出的定位洞察经它进 prompt。
const POSITIONING_GENERATE_PARAMS = jsonSchema<{ extraBrief?: string }>({
  type: "object",
  properties: {
    extraBrief: EXTRA_BRIEF_PROPERTY,
  },
  additionalProperties: false,
});

// ── 只读 context 工具入参 —— limit 可选(execute 兜默认 + 封顶),query 可选(缺省回最近)──────
const CONTEXT_PROJECTS_PARAMS = jsonSchema<{
  limit?: number;
  offset?: number;
  compact?: boolean;
}>({
  type: "object",
  properties: {
    limit: { type: "number", description: "本页条数(默认 20,最大 50;compact=true 时默认与上限 200)" },
    offset: { type: "number", description: "翻页偏移(默认 0;结果带 total/hasMore,可继续翻)" },
    compact: {
      type: "boolean",
      description:
        "[T-081] 盘点/浏览全量时置 true:标题截 40 字、单页上限放宽到 200,一次拿全,不用反复翻页。",
    },
  },
  additionalProperties: false,
});

const CONTEXT_COMMENTS_PARAMS = jsonSchema<{
  limit?: number;
  offset?: number;
}>({
  type: "object",
  properties: {
    limit: { type: "number", description: "本页条数(默认 20,最大 50)" },
    offset: { type: "number", description: "翻页偏移(默认 0)" },
  },
  additionalProperties: false,
});

const CONTEXT_KNOWLEDGE_PARAMS = jsonSchema<{ query?: string; limit?: number }>({
  type: "object",
  properties: {
    query: {
      type: "string",
      description: "搜索关键词(可选;缺省回最近若干条)。",
    },
    limit: {
      type: "number",
      description: "返回条数(可选;默认 5,封顶 10)。",
    },
  },
  additionalProperties: false,
});

const CONTEXT_MATERIALS_PARAMS = jsonSchema<{ query?: string; limit?: number }>({
  type: "object",
  properties: {
    query: {
      type: "string",
      description: "搜索关键词(可选;缺省回最近若干条)。",
    },
    limit: {
      type: "number",
      description: "返回条数(可选;默认 5,封顶 10)。",
    },
  },
  additionalProperties: false,
});

// 只读 context 工具的 limit 兜底。[T-058②] 默认 20、封顶 50(原 10 太小,「看全部项目」要翻
// 太多页)。[T-081] compact 模式(context.projects 盘点全量):默认与封顶放宽到 200,配合标题
// 截 40 字让「一次拿全」不炸上下文。导出供单测。
export function clampContextLimit(
  limit: number | undefined,
  compact = false,
): number {
  const cap = compact ? 200 : 50;
  const fallback = compact ? 200 : 20;
  if (typeof limit !== "number" || !Number.isFinite(limit) || limit <= 0) {
    return fallback;
  }
  return Math.min(Math.floor(limit), cap);
}

// [T-081] compact 模式的标题截断:超 40 字截断加 …(title 可能是整篇文案数百字)。导出供单测。
export function compactTitle(title: string): string {
  const t = title.trim();
  return t.length > 40 ? `${t.slice(0, 40)}…` : t;
}

// T-039a 知识库匹配放宽 —— 原 context.knowledge 只做「整串 title.includes(query)」精确子串匹配,
// 复盘时模型常拿作品标题/主题当 query 去搜,与知识库条目标题很难整串包含 → 命中率极低(用户反馈
// 「知识库这次没命中,可能关键词匹配太死」)。改成**分词 OR 模糊**:把 query 切成词(中英文 + 常见
// 分隔),任一词命中 haystack(标题 + 摘要)即算相关,命中词数越多越相关(用于排序)。
// **诚实**:完全没命中就返回 0(调用方据此空,不塞无关资料);不是「全返回」。纯函数,可单测。
// 返回值:该条与 query 的相关度(命中的 query 词数;0 = 不相关)。query 为空视为「不过滤」由调用方处理。
export function knowledgeRelevanceScore(haystack: string, query: string): number {
  const hay = haystack.toLowerCase();
  // 分词:按空白 + 常见中英标点/分隔切,滤掉过短的噪声词(单字符英文/纯符号)。中文词保留(含单字,
  // 中文单字也可能是有效检索词)。去重避免同词重复计分。
  const terms = Array.from(
    new Set(
      query
        .toLowerCase()
        .split(/[\s,，、。.;；:：/\\|()（）【】\[\]"'`~!?？!—\-]+/)
        .map((t) => t.trim())
        .filter((t) => {
          if (!t) return false;
          // 纯 ASCII 且长度 1 的词(如 "a"/"的"以外的单字母)当噪声滤掉;含非 ASCII(中文)保留。
          if (/^[a-z0-9]$/.test(t)) return false;
          return true;
        }),
    ),
  );
  if (terms.length === 0) return 0;
  let hits = 0;
  for (const t of terms) {
    if (hay.includes(t)) hits += 1;
  }
  return hits;
}

/**
 * 工具实现表(全部首波工具)。每个 execute 复用注入的 runner 核心产**候选**(非实体)。
 * 路由用 buildChatTools(skillTools, deps) 按 skill 白名单过滤后挂给 streamText。
 * [T-098] 导出:覆盖锁测(context-card-registry.test.tsx)遍历本表全部 context.* 工具,
 * 断言每个 kind 在前端 CONTEXT_CARD_REGISTRY 有渲染卡 —— 新增 context 工具不配卡 = 测试红。
 */
export function allChatTools(deps: ChatToolDeps): Record<string, Tool> {
  return {
    "topic.generate": tool({
      description:
        "围绕创作者定位 + 真实信号生成一批选题候选(每条含 title/angle/理由)。结果是候选,需人逐条采纳后才入候选池——不直接写库。",
      inputSchema: TOPIC_GENERATE_PARAMS,
      execute: async ({ basis, extraBrief }): Promise<TopicGenerateToolResult> => {
        const items = await deps.generateTopics({
          basis: basis ?? "positioning",
          extraBrief: clampExtraBrief(extraBrief),
        });
        return { kind: "topic.candidates", items };
      },
    }),
    "topic.enrich": tool({
      description:
        "把一条已有选题补全成完整选题卡(观众/痛点/钩子/结构/风险/立项建议)。结果是候选卡,需人采纳后才落到该选题——不直接写库。",
      inputSchema: TOPIC_ENRICH_PARAMS,
      execute: async ({ title, angle }): Promise<TopicEnrichToolResult> => {
        const card = await deps.enrichTopic({ title, angle: angle ?? "" });
        return { kind: "topic.card", card };
      },
    }),
    "script.hooks": tool({
      description:
        "为当前项目生成一组口播开场 hook 候选(3~5 条,不同切角)。创作者会逐条挑选「写入稿面」。当用户想改开头/要 hook/开场不抓人时调用。",
      inputSchema: SCRIPT_HOOKS_PARAMS,
      execute: async ({
        topic,
        direction,
        extraBrief,
      }): Promise<ScriptHooksToolResult> => {
        const items = await deps.generateHooks({
          topic,
          direction,
          extraBrief: clampExtraBrief(extraBrief),
        });
        return { kind: "script.hooks", items };
      },
    }),
    "script.draft": tool({
      description:
        "为当前项目生成一版完整的分镜口播脚本(整稿,多段分镜:口播/画面/字幕)。创作者会整稿「写入稿面」。当用户要写脚本/起草整稿/重写脚本时调用。",
      inputSchema: SCRIPT_DRAFT_PARAMS,
      execute: async ({
        topic,
        angle,
        extraBrief,
      }): Promise<ScriptDraftToolResult> => {
        const sections = await deps.draftScript({
          topic,
          angle,
          extraBrief: clampExtraBrief(extraBrief),
        });
        return { kind: "script.draft", sections };
      },
    }),
    "material.gather": tool({
      description:
        "围绕主题真实搜集创作素材(钩子/案例/数据点/金句四类,带来源)。创作者会逐条挑选存入这条内容的弹药。当用户要找素材/搜资料/要案例数据时调用。",
      inputSchema: MATERIAL_GATHER_PARAMS,
      execute: async ({ query }): Promise<MaterialGatherToolResult> => {
        const items = await deps.gatherMaterials({ query });
        return { kind: "material.gather", items };
      },
    }),
    "calibration.diagnose": tool({
      description:
        "对一条发布前内容(给标题,可附文稿)按创作者的变现加权评分标准逐维度盲评,估发布前表现并给综合判断/主要问题/优先修改。结果是诊断候选,需人采纳后才落预测——不直接写库。",
      inputSchema: CALIBRATION_DIAGNOSE_PARAMS,
      execute: async ({
        title,
        script,
        extraBrief,
      }): Promise<CalibrationDiagnoseToolResult> => {
        const diagnosis = await deps.diagnoseContent({
          title,
          script,
          extraBrief: clampExtraBrief(extraBrief),
        });
        return { kind: "calibration.diagnosis", diagnosis };
      },
    }),
    "review.analyze": tool({
      description:
        "从一条内容(或账号整体表现)提炼 3-6 条可复用、可迁移的爆款要素/方法论。结果是经验候选,需人逐条采纳后才沉淀经验——不直接写库。",
      inputSchema: REVIEW_ANALYZE_PARAMS,
      execute: async ({
        subject,
        extraBrief,
      }): Promise<ReviewAnalyzeToolResult> => {
        const items = await deps.analyzeReview({
          subject,
          extraBrief: clampExtraBrief(extraBrief),
        });
        return { kind: "review.learnings", items };
      },
    }),
    // [T-062a] 对话手录经验:「记一条经验:…」→ 模型填参 → 候选卡。execute 纯回显
    // (不读库不写库、不跑二次 LLM),故不占 ChatToolDeps —— 落库动作在前端卡上由人触发。
    "learning.capture": tool({
      description:
        "把对话中的经验教训整理成一条结构化经验候选(title + insight + learningType)。当用户说「记一条经验/这条教训记下来/沉淀一下」时调用,从 TA 的话里提炼填参。不会直接写库:结果渲成候选卡,用户点卡上「存为经验」按钮才落入裁决队列。",
      inputSchema: LEARNING_CAPTURE_PARAMS,
      execute: async ({
        title,
        insight,
        learningType,
      }): Promise<LearningCaptureToolResult> => {
        return {
          kind: "learning.capture",
          suggestion: { title, insight, learningType },
        };
      },
    }),
    // [T-077b] 对话填策划:「帮我把选题卡填了,观众是 AI 新手,目标是涨粉」→ 模型从对话里
    // 提炼字段填参 → execute 回显建议 + 读当前项目 briefDetail 现状(前端卡渲「现值 → 建议值」
    // 对照)。不写库:人点卡上「写入选题卡」才 patchProject 落 brief_detail(铁律②确认门)。
    "brief.fill": tool({
      description:
        "把对话中聊到的选题信息(目标观众/内容目标/核心信息等)整理成当前项目的选题卡填充候选。当用户说「帮我把选题卡填了/把策划补上/根据我们聊的填一下立项信息」时调用,从对话里提炼填参——只填真聊到的字段,没聊到的不编。不会直接写库:结果渲成字段对照卡(现值 vs 建议值),用户点「写入选题卡」才落库。",
      inputSchema: BRIEF_FILL_PARAMS,
      execute: async (input): Promise<BriefFillToolResult> => {
        // 清洗:只保留非空建议字段(模型偶发填空串 → 不进对照表,不摆假建议)。
        const suggestion: BriefFillSuggestion = {};
        for (const key of [
          "targetAudience",
          "contentGoal",
          "contentFormat",
          "coreMessage",
          "durationEstimate",
          "successCriteria",
        ] as const) {
          const v = input[key];
          if (typeof v === "string" && v.trim()) suggestion[key] = v.trim();
        }
        // 现状:读当前项目 briefDetail(项目对话才有;读不到 → null,卡上现值显「未填」)。
        const current = await deps.getProjectBrief();
        return { kind: "brief.fill", suggestion, current };
      },
    }),
    "positioning.generate": tool({
      description:
        "结合创作者当前定位 + 抖音账号画像 + 真实作品画像,生成/进化一份结构化定位提案(人设/领域/人群/差异化/能力/一句话定位/关键词)。对话里已翻过真数据/聊出定位洞察时,把结论整理进 extraBrief 一并传入(否则洞察会丢)。结果是定位候选,需人采纳后才写入定位母版——不直接写库。",
      inputSchema: POSITIONING_GENERATE_PARAMS,
      execute: async ({ extraBrief }): Promise<PositioningGenerateToolResult> => {
        const suggestion = await deps.generatePositioning({
          extraBrief: clampExtraBrief(extraBrief),
        });
        return { kind: "positioning.suggestion", suggestion };
      },
    }),
    // ── 只读 context 工具 —— 用于当用户问「项目库 / 最新一条作品 / 素材(库)/ 知识库」时,
    //    实时拉**真实数据**给模型读进上下文再用文字回答(纯读,不产候选、不写任何实体)。
    "context.projects": tool({
      description:
        "只读:拉取创作者的项目/作品列表(id/标题/阶段/状态),带 total/hasMore 可翻页(offset)。当用户问「我的项目库 / 最近在做什么 / 最新一条(作品)/ 我有哪些项目 / 全部项目」时调它拿真实数据回答。[T-081] 要盘点/浏览**全量**作品(如「结合我全部内容…」)时置 compact=true:标题截 40 字、单页上限 200,一次拿全,不用逐页翻;只看少量条目/需要完整标题时不置。hasMore=true 时继续带 offset 翻页直到看全,或如实告知还剩多少。",
      inputSchema: CONTEXT_PROJECTS_PARAMS,
      execute: async ({
        limit,
        offset,
        compact,
      }): Promise<ContextProjectsToolResult> => {
        const isCompact = compact === true;
        const eff = clampContextLimit(limit, isCompact);
        const effOffset = Math.max(0, offset ?? 0);
        const { rows, total } = await deps.listProjects({
          limit: eff,
          offset: effOffset,
        });
        // [T-081] compact:标题可能是整篇文案(数百字)—— 截 40 字防一页 200 条炸上下文。
        const items = isCompact
          ? rows.map((r) => ({ ...r, title: compactTitle(r.title) }))
          : rows;
        return {
          kind: "context.projects",
          items,
          total,
          offset: effOffset,
          hasMore: effOffset + rows.length < total,
        };
      },
    }),
    "context.comments": tool({
      description:
        "只读:拉取创作者作品的观众评论(最新在前,带点赞数),带 total/hasMore 可翻页。当用户问「我最新视频的评论 / 观众在说什么 / 评论区反馈」时调它拿真实评论回答,不要瞎答。",
      inputSchema: CONTEXT_COMMENTS_PARAMS,
      execute: async ({ limit, offset }): Promise<ContextCommentsToolResult> => {
        const eff = clampContextLimit(limit);
        const effOffset = Math.max(0, offset ?? 0);
        const { rows, total } = await deps.listComments({
          limit: eff,
          offset: effOffset,
        });
        return {
          kind: "context.comments",
          items: rows,
          total,
          offset: effOffset,
          hasMore: effOffset + rows.length < total,
        };
      },
    }),
    "context.knowledge": tool({
      description:
        "只读:搜索创作者的知识库(命中标题/摘要,返回 id/标题/片段)。当用户问「知识库里有没有 X / 我存过什么关于 X / 查一下我的资料」时调它拿真实数据来回答,不要瞎答。纯读取上下文,不产候选、不写库。",
      inputSchema: CONTEXT_KNOWLEDGE_PARAMS,
      execute: async ({ query, limit }): Promise<ContextKnowledgeToolResult> => {
        const items = await deps.searchKnowledge({
          query: query ?? "",
          limit: clampContextLimit(limit),
        });
        return { kind: "context.knowledge", items };
      },
    }),
    "context.materials": tool({
      description:
        "只读:搜索创作者的素材库(assets,返回 id/名称/类型)。当用户问「我有哪些素材 / 素材库里有没有 X / 找一下我的图/视频/文件」时调它拿真实数据来回答,不要瞎答。纯读取上下文,不产候选、不写库。",
      inputSchema: CONTEXT_MATERIALS_PARAMS,
      execute: async ({ query, limit }): Promise<ContextMaterialsToolResult> => {
        const items = await deps.searchMaterials({
          query: query ?? "",
          limit: clampContextLimit(limit),
        });
        return { kind: "context.materials", items };
      },
    }),
  };
}

/**
 * 按 skill 的工具白名单(getTools(skillId))过滤出真正挂给模型的工具集(SPEC §3.2 第 2 层)。
 * 白名单里有但本切片未实现的工具(后续波)直接跳过 —— 不报错、不挂空壳,留给后续切片补齐。
 * 返回的 ToolSet 直接喂 streamText({ tools })。
 */
export function buildChatTools(
  skillToolWhitelist: readonly string[],
  deps: ChatToolDeps,
): ToolSet {
  const impls = allChatTools(deps);
  const out: Record<string, Tool> = {};
  for (const name of skillToolWhitelist) {
    const impl = impls[name];
    if (impl) out[name] = impl;
  }
  return out as ToolSet;
}
