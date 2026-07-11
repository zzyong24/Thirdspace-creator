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
   * [T-163] 错误→人话端口。humanizeAiError 所在 lib 含 ArtifactType(前端 domain 类型)依赖,
   * 故留前端;此处经端口注入(host=chat-runner deps→route 传 humanizeAiError),backend 不跨包
   * import 前端 lib。返回 null=无匹配人话映射,调用方回落原始 message。
   */
  humanizeError: (
    err: unknown,
  ) => { message: string; suggestSwitchModel: boolean } | null;
  /**
   * [T-084a] 是否已配置联网检索(web.search capability)—— 由 chat-runner 在装配期探测
   * resolveSearchSpec 是否成功后注入。仅驱动 material.gather 工具的**动态诚实描述**(配了才说
   * 「真实搜集…带来源」;未配则明说素材来自训练记忆需核实)。默认 undefined = 未配。
   */
  searchConfigured?: boolean;
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
      /** [T-149] 出题渠道(trend|benchmark|demand);采纳时落成候选 source,保 provenance。 */
      source: string;
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
   * [T-057④/T-084a] material.gather 核心 —— 先真联网检索(resolveSearchSpec+searchWeb),再
   * runResearchNode 结构化综合(检索结果前置注入,非模型工具),诚实降级。产物经 ChatGatherCard
   * 逐条「存入弹药」(knowledge.create+materialLink,人采纳)。
   *   - grounding: "web"=经联网检索、"model_memory"=未配/检索失败降级(前端渲黄条 + 需核实徽标)。
   *   - items[].sourceUrl: 该条素材引用的检索真实 URL(有则前端渲可点域名链接;无则渲需核实徽标)。
   */
  gatherMaterials: (input: { query?: string }) => Promise<{
    grounding: "web" | "model_memory";
    items: Array<{
      title: string;
      url: string;
      source: string;
      whyRelevant: string;
      category: string;
      sourceUrl?: string;
    }>;
  }>;
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
   * [T-094] knowledge.distill 核心 —— 复用倾倒场同一蒸馏引擎(runKnowledgeDistill:
   * knowledge.distill 模板 + capability 走 model-config),把对话里粘的原文蒸成知识原子候选。
   * 失败**抛错**(与 runner 语义一致),由工具 execute 接住转人话随结果卡渲染。
   */
  distillKnowledge: (input: { content: string }) => Promise<{
    atoms: Array<{
      type: "claim" | "evidence" | "quote" | "qa";
      title: string;
      note: string;
      sourceNote: string;
    }>;
    suggestedTags: string[];
  }>;
  /**
   * [T-084b] material.screenshot 核心 —— 真开无头浏览器给公开 URL 截图,落 **pending** asset
   * (带 sourceUrl 存证),返回 asset 摘要(含预览 URL)。失败**抛错**(逐类诚实:打不开 / HTTP 码 /
   * 登录墙),由工具 execute 接住转人话随结果卡渲错误态。
   * [T-219] 铁律②:AI 写入需人确认。截图字节虽已真实产生,但落 pending(不进素材库 list),前端
   * 确认门卡点「存入素材库」→ assets.commit 翻 active 才入库;再「挂进用料链」是第二级人点。
   */
  captureScreenshot: (input: {
    url: string;
    fullPage?: boolean;
  }) => Promise<{
    assetId: string;
    name: string;
    /** 落库后的签名预览 URL(前端卡直接 <img>;拿不到则 null,卡渲占位)。 */
    previewUrl: string | null;
    /** 截图来源 URL(存证 —— 卡上可点回原页查证)。 */
    sourceUrl: string;
  }>;
  /**
   * [T-217c] web.read 核心 —— 带 `.auth/web` 登录态读一个 URL 的**正文全文**(比截图准:抽逐轮
   * 对话/文章全文,不 OCR 失真),落**逐字稿文本素材**(pending 走 T-219 确认门,带 sourceUrl)。
   * 无会话/过期 → 返回 { needLogin:true, domain }(引导用户去保管库登录,不落库);其余失败(打不开/
   * HTTP 码/抽不出正文)**抛错**,工具 execute 接住转人话。
   */
  readWeb: (input: { url: string }) => Promise<
    | {
        needLogin: false;
        assetId: string;
        name: string;
        previewUrl: string | null;
        sourceUrl: string;
        title: string;
        excerpt: string;
        extractor: string;
      }
    | { needLogin: true; domain: string }
  >;
  /**
   * [T-084c] material.generate 核心 —— **不直接生成**(视频异步分钟级不能阻塞对话回合):dispatch
   * 既有 asset.generate task(persistence-client dispatch → void runAssetGenerate 范式),立即返回
   * taskId。前端 ChatGenerateCard 据 taskId 轮询 task/candidate → 完成渲缩略图 + 采纳(复用既有
   * AdoptCandidateCard confirm 流);未配生图/生视频模型时 task cancelled,卡内诚实「去设置」。
   * 生成素材落库固定标 origin:generated(asset-generate-runner 既有,AI 素材不冒充真证据)。
   */
  dispatchGenerateAsset: (input: {
    kind: "image" | "video";
    prompt: string;
    style?: string;
  }) => Promise<{ taskId: string }>;
  /**
   * [T-103b] review.script 核心 —— **不直接审**(script.review 后台跑 L1 违禁词 lint + L2 豆包
   * 语义审、分钟内不能阻塞对话回合):dispatch 既有 script.review ai_task(复用 T-086 审核链路,
   * 别重造 L1/L2),立即返回 { taskId, projectId }。前端 ChatReviewReportCard 据 taskId 轮询
   * getTask → succeeded 后读 getLatestScriptReview 渲**审核报告卡**(verdict + findings),改写
   * 建议逐条走 createArtifactVersion append-only 应用门。projectId 由 chat-runner 从 chatContext
   * 注入(项目对话才有;无项目上下文 → projectId=null,工具诚实报「需在项目稿面里审核」)。
   */
  dispatchScriptReview: (input: {
    /** 显式项目 id(模型从 selection 拿到时可传);缺省用 chatContext.projectId。 */
    projectId?: string;
  }) => Promise<{ taskId: string | null; projectId: string | null; error: string | null }>;
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
  /**
   * [T-099b] context.project.detail 只读端口 —— 拉某项目的全档:brief 全字段 + 当前阶段 +
   * 发布状态 + 产物索引(每产物 type/当前版本数/updatedAt/字数)+ 最新指标摘要。composition
   * root 复用既有公开读源(projects getProject/briefDetail + artifacts listProjectArtifacts +
   * publishing + ReviewSubjectReader 口径的最新 snapshot)拼装。读不到(不存在/越权)→ null
   * (诚实降级,不抛不编)。**返回原始全值**;长文本截断在工具 execute 侧强制(§3 详情档预算)。
   */
  getProjectDetail?: (input: { projectId: string }) => Promise<ProjectDetailRaw | null>;
  /**
   * [T-099b] context.positioning.detail 只读端口 —— 母版全 facets + downstreamRules + 当前陈述 +
   * 陈述版本数 + 账号画像(accountsBrief 数据并入,不单开账号工具)。composition root 复用既有
   * PositioningReader + AccountsReader。母版未建 → profile 全空 + 诚实空态(不抛)。
   */
  getPositioningDetail?: () => Promise<PositioningDetailRaw>;
  /**
   * [T-099b] context.knowledge.detail 只读端口 —— 单条知识全字段(type/title/note/sourceNote/
   * tags/战绩 usedCount/关联边 relations)。composition root 复用 knowledge get(带 T-079c 战绩
   * 投影)+ listRevisions(取正文 note)+ listRelations。读不到(不存在/越权)→ null(诚实降级)。
   * **返回原始全值**;note/sourceNote 长文本截断在工具 execute 侧强制(§3 详情档预算)。
   */
  getKnowledgeDetail?: (input: { id: string }) => Promise<KnowledgeDetailRaw | null>;
  /**
   * [T-099c] context.artifacts 只读端口 —— 某项目的产物清单(每条 artifactType/当前版本号/
   * updatedAt/当前版本字数)。composition root 复用 artifactsService.listProjectArtifacts +
   * listVersions + 当前版本文本长度(与 getScript 同口径)。读不到(不存在/越权)→ null(诚实降级)。
   */
  listProjectArtifacts?: (input: {
    projectId: string;
  }) => Promise<ArtifactListRaw | null>;
  /**
   * [T-099c] context.artifact.text 只读端口 —— 某项目某类产物的**正文全文**(未截断,窗口截断在
   * 工具 execute 侧强制)。output_script 走 ReviewSubjectReader.getScript 同读法(transcript 优先);
   * 其它 artifactType 走当前版本 contentData 正文字段(transcript/sections/body)。**这是事故二直接
   * 根治工具**。读不到(项目/产物不存在、越权、无当前版本)→ null(诚实降级,工具侧渲空态)。
   */
  getArtifactText?: (input: {
    projectId: string;
    artifactType: string;
  }) => Promise<ArtifactTextRaw | null>;
  /**
   * [T-099c] context.knowledge.text 只读端口 —— 某知识条目的**长文正文全文**(未截断,窗口截断在
   * 工具 execute 侧强制)。取 transcript/reference/note 长文字段(与 knowledge.detail 的 note 同读法,
   * 取当前修订正文)。读不到(不存在/越权)→ null(诚实降级)。
   */
  getKnowledgeText?: (input: { id: string }) => Promise<KnowledgeTextRaw | null>;
  /**
   * [T-099 切片四] context.publications 只读端口 —— 该用户的发布记录清单(平台/链接/发布时间/
   * 关联作品标题),分页。composition root 复用 publishing 公开读源(getRecentPublicationsWithTitle,
   * user-scoped)。读不到 → 空数组(诚实空态)。**纯读上下文**。
   */
  listPublications?: (input: {
    limit: number;
    offset: number;
  }) => Promise<PublicationsListRaw>;
  /**
   * [T-099 切片四] context.metrics 只读端口 —— 给 projectId → 单作品指标快照(播放/点赞/评论/分享
   * + 留存点);不给 → 账号级最近 N 作品指标行。composition root 复用 analytics(snapshot 口径复用
   * dashboard 的 views??plays + 最新帧,不新造)。读不到 → rows 空 + subject:null(诚实空态)。**纯读**。
   */
  getMetrics?: (input: {
    projectId?: string;
    limit: number;
  }) => Promise<MetricsRaw>;
  /**
   * [T-099 切片五] context.learnings 只读端口 —— 经验清单,含 validated/candidate 状态(注入 brief 只
   * 喂 validated,本工具可见全量并标状态)。composition root 复用 learnings 公开读源(listLearnings,
   * user-scoped),按 query/learningType/status 内存过滤。读不到 → 空数组(诚实空态)。**纯读**。
   */
  listLearnings?: (input: {
    query?: string;
    learningType?: string;
    status?: string;
    limit: number;
  }) => Promise<LearningsListRaw>;
  /**
   * [T-099 切片五] context.candidates 只读端口 —— 选题候选池(title/status/score/来源),分页。
   * composition root 复用 candidate 公开读源(listCandidates,user-scoped)。读不到 → 空数组
   * (诚实空态)。**纯读上下文**。
   */
  listCandidates?: (input: {
    limit: number;
    offset: number;
  }) => Promise<CandidatesListRaw>;
  /**
   * [T-099 切片五] context.predictions 只读端口 —— 预测 vs 实绩对照(prediction + calibrationResult
   * 拼行)+ 当前 rubric 版本摘要。composition root 复用 calibration 公开读源(getOverview 的
   * reflowRows + KPI + getCurrentRubricVersion)。读不到 → rows 空 + rubric:null(诚实空态)。**纯读**。
   */
  getPredictions?: (input: { limit: number }) => Promise<PredictionsRaw>;
}

// [T-099 切片四] context.publications 的原始全值(publishing 公开读源拼装)。
export interface PublicationsListRaw {
  rows: Array<{
    id: string;
    platform: string;
    /** 平台链接(externalUrl;无则 null)。 */
    url: string | null;
    /** 发布时间(publishedAt ISO;未发布/无则 null)。 */
    publishedAt: string | null;
    /** 关联作品标题(revision 标题;拿不到 → 空串,不编)。 */
    projectTitle: string;
    status: string;
  }>;
  total: number;
}

// [T-099 切片四] context.metrics 的原始全值(analytics 口径,单作品或账号级)。
export interface MetricsRaw {
  /** 单作品模式:该作品标题(账号级模式为 null)。 */
  subject: string | null;
  /** 指标行:单作品模式为该作品一行 + 可选留存点;账号级模式为最近 N 作品每行。 */
  rows: Array<{
    /** 作品标题(账号级每行;单作品模式与 subject 同)。 */
    title: string;
    plays: number | null;
    likes: number | null;
    comments: number | null;
    shares: number | null;
  }>;
  /** 单作品模式的留存点(账号级为空数组;拿不到 → 空)。 */
  retention: Array<{ atSeconds: number; retentionRate: number }>;
}

// [T-099 切片五] context.learnings 的原始全值(learnings 公开读源,已按过滤/上限切好)。
export interface LearningsListRaw {
  rows: Array<{
    id: string;
    title: string;
    insight: string;
    learningType: string;
    /** validated / candidate / discarded(本工具可见全量并标状态)。 */
    status: string;
    reuseCount: number;
  }>;
  total: number;
}

// [T-099 切片五] context.candidates 的原始全值(candidate 公开读源,分页)。
export interface CandidatesListRaw {
  rows: Array<{
    id: string;
    title: string;
    status: string;
    /** 预测分(predictedScore;未评 → null)。 */
    score: number | null;
    /** 来源(source:idea/ai/…)。 */
    source: string;
  }>;
  total: number;
}

// [T-099 切片五] context.predictions 的原始全值(calibration 公开读源:预测vs实绩 + rubric 摘要)。
export interface PredictionsRaw {
  /** 当前 rubric 版本摘要(名称 + 版本号 + 维度数;母版未建 → null,诚实空态)。 */
  rubric: {
    name: string;
    versionNumber: number;
    dimensionCount: number;
  } | null;
  /** 预测 vs 实绩对照行(prediction + calibrationResult 拼)。 */
  rows: Array<{
    predictionId: string;
    /** 被评作品标题(拿不到 → 空串)。 */
    subjectTitle: string;
    /** 是否已有实绩回流(calibrationResult 落地)。 */
    hasResult: boolean;
    /** 偏差档位(low/mid/high/none;无回流 → none)。 */
    deviationBand: string;
    /** 偏差发现一句话(无回流 → 空串)。 */
    finding: string;
    /** 逐维度预测分 vs 实绩分 vs 偏差(无回流时 actual/deviation 为 null)。 */
    dimensions: Array<{
      key: string;
      label: string;
      predicted: number | null;
      actual: number | null;
      deviation: number | null;
    }>;
  }>;
  total: number;
}

// [T-099c] context.artifacts 的原始全值(产物清单;字数已由 composition root 算好)。
export interface ArtifactListRaw {
  projectId: string;
  projectTitle: string;
  items: Array<{
    artifactType: string;
    currentVersion: number | null;
    updatedAt: string | null;
    totalChars: number;
  }>;
}

// [T-099c] context.artifact.text 的原始全值(正文未截断,窗口截断在 execute 侧强制)。
export interface ArtifactTextRaw {
  artifactType: string;
  /** 当前版本正文全文(未截断)。无正文 → 空串。 */
  fullText: string;
}

// [T-099c] context.knowledge.text 的原始全值(正文未截断,窗口截断在 execute 侧强制)。
export interface KnowledgeTextRaw {
  id: string;
  title: string;
  knowledgeType: string;
  /** 长文正文全文(transcript/reference/note 当前修订正文;未截断)。无正文 → 空串。 */
  fullText: string;
}

// [T-099b] context.project.detail 的原始全值(composition root 拼装,execute 侧再套详情档预算)。
export interface ProjectDetailRaw {
  id: string;
  title: string;
  stage: string;
  status: string;
  /** 是否已有发布记录 + 首个平台/发布时间(有则「已发布」,无则按项目 status)。 */
  publish: {
    published: boolean;
    platform: string | null;
    publishedAt: string | null;
  };
  /** brief 全字段(选题卡 briefDetail;未填字段缺省)。 */
  brief: {
    targetAudience?: string;
    contentGoal?: string;
    contentFormat?: string;
    targetPlatforms?: string[];
    durationEstimate?: string;
    coreMessage?: string;
    successCriteria?: string;
  };
  /** 产物索引:每产物 type + 当前版本数 + updatedAt + 当前版本字数(全文走 context.artifact.text)。 */
  artifacts: Array<{
    artifactType: string;
    versionCount: number;
    updatedAt: string | null;
    charCount: number;
  }>;
  /** 最新指标摘要(ReviewSubjectReader.getMetricsSummary 同口径,人类可读串;无 → 空串)。 */
  metricsSummary: string;
}

// [T-099b] context.positioning.detail 的原始全值。
export interface PositioningDetailRaw {
  profile: {
    persona: string;
    field: string;
    audience: string;
    differentiation: string;
    capabilities: string[];
    facets: {
      contentScope?: string;
      avoid?: string;
      corePain?: string;
      coreValue?: string;
      tone?: string;
      statusNote?: string;
    };
    downstreamRules: {
      topicRule?: string;
      scriptRule?: string;
      projectRule?: string;
      forbidRule?: string;
      expressionRule?: string;
    };
  } | null;
  currentStatement: { oneLiner: string; keywords: string[] } | null;
  /** 陈述版本数(创建过多少条定位陈述;拿不到 → null,不编)。 */
  statementCount: number | null;
  /** 账号画像(并入,不单开账号工具)。 */
  accounts: Array<{
    platform: string;
    accountHandle: string;
    followerBaseline: number;
  }>;
}

// [T-099b] context.knowledge.detail 的原始全值(note/sourceNote 未截断;截断在 execute 侧)。
export interface KnowledgeDetailRaw {
  id: string;
  title: string;
  knowledgeType: string;
  /** 正文(最新修订 content;无正文 → 空串)。 */
  note: string;
  /** 出处(sourceNote,可空)。 */
  sourceNote: string | null;
  sourceType: string;
  sourceUrl: string | null;
  tags: string[];
  /** T-079c 战绩投影:被用料链引用次数 + 是否用于已发布作品。 */
  usedCount: number;
  usedInPublished: boolean;
  /** 关联边(语义关系:目标 id + 关系类型)。 */
  relations: Array<{ targetKnowledgeId: string; relationType: string }>;
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
    /** [T-149] 出题渠道(trend|benchmark|demand);采纳时落成候选 source,保 provenance。 */
    source: string;
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
  // [T-084a] 整体信源打标:web=经联网检索、model_memory=未配/降级(前端据此渲黄条)。
  grounding: "web" | "model_memory";
  items: Array<{
    title: string;
    url: string;
    source: string;
    whyRelevant: string;
    category: string;
    /** [T-084a] 该条引用的检索真实 URL(有则前端渲可点域名链接;无则渲「需核实」徽标)。 */
    sourceUrl?: string;
  }>;
}

// [T-084b] material.screenshot 工具结果 —— 一张已落库的截图 asset(前端 ChatScreenshotCard
// 渲缩略图 + 来源 URL + 「加入弹药」)。error 非 null 时卡渲错误态(逐类诚实:打不开/HTTP/登录墙)。
export interface MaterialScreenshotToolResult {
  kind: "material.screenshot";
  asset: {
    id: string;
    name: string;
    previewUrl: string | null;
    sourceUrl: string;
  } | null;
  /** 失败时的诚实错误(成功为 null);模型如实转述、卡渲错误态,绝不假装截到图。 */
  error: string | null;
}

// [T-217c] web.read 工具结果 —— 一段已落库(pending 确认门)的正文文本素材 + 摘要,或需登录降级,
// 或失败。三态互斥:
//   · asset 非 null → 读到正文,落成待确认逐字稿素材(前端确认门卡「存入素材库」);
//   · needLogin 非 null → 该站需先在保管库登录一次(编导引导,不落库、不截登录页);
//   · error 非 null → 逐类诚实失败(打不开/HTTP 码/抽不出正文)。
export interface WebReadToolResult {
  kind: "web.read";
  asset: {
    id: string;
    name: string;
    previewUrl: string | null;
    sourceUrl: string;
    title: string;
    /** 正文前若干字(前端卡预览 + 模型据此转述,不逐字复述全文)。 */
    excerpt: string;
    /** 命中的抽取器(chatgpt-share | readability),存证/可观测用。 */
    extractor: string;
  } | null;
  /** 需登录降级:该域名需先在保管库登录一次。非 null 时编导引导「去设置→网站登录保管库」。 */
  needLogin: { domain: string } | null;
  /** 失败时的诚实错误(打不开/HTTP 码/抽不出正文);成功或需登录时为 null。 */
  error: string | null;
}

// [T-084c] material.generate 工具结果 —— dispatch 了一个 asset.generate task(立即返回,不阻塞
// 对话回合)。前端 ChatGenerateCard 据 taskId 轮询 → 完成渲缩略图 + 采纳;未配模型 → task
// cancelled → 卡内「去设置」。dispatch 本身失败(极少)→ error 非 null。
export interface MaterialGenerateToolResult {
  kind: "material.generate";
  taskId: string | null;
  kindOf: "image" | "video";
  status: "queued";
  /** dispatch 失败时的诚实错误(成功为 null)。 */
  error: string | null;
}

export interface CalibrationDiagnoseToolResult {
  kind: "calibration.diagnosis";
  diagnosis: Awaited<ReturnType<ChatToolDeps["diagnoseContent"]>>;
}

// [T-103b] review.script 工具结果 —— dispatch 了一次 script.review 审核(立即返回,L1+L2 后台跑,
// 不阻塞对话回合)。前端 ChatReviewReportCard 据 taskId 轮询 getTask → succeeded 后读
// getLatestScriptReview 渲审核报告卡(verdict + findings + 逐条改写 apply 门)。projectId 供卡读
// 报告(getLatestScriptReview 按 projectId)+ 改写门定位脚本 artifact。dispatch 失败 / 无项目上下文
// → error 非 null(卡渲错误态,诚实提示去项目稿面审核或去设置)。
export interface ReviewScriptToolResult {
  kind: "review.report";
  /** dispatch 出的 script.review 任务 id(卡据此轮询 getTask;失败为 null)。 */
  taskId: string | null;
  /** 被审项目 id(卡据此读 getLatestScriptReview + 定位脚本 artifact;无项目上下文为 null)。 */
  projectId: string | null;
  /** dispatch 失败 / 无项目上下文时的诚实错误(成功为 null)。 */
  error: string | null;
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

// [T-094] knowledge.distill 工具结果 —— 一批知识原子候选(渲成蒸馏批量确认门卡,人勾选
// 「采纳选中 N 条」才逐条 knowledge.create 落库,与倾倒场旧确认门同语义)。error 字段:
// 蒸馏失败(如 MiniMax 内容安全审核拦截输入)时带**人话**错误(ai-error-humanize 转译),
// 卡渲错误态而非裸机器码;suggestSwitchModel=true 时卡上附「去设置」链接(不自动切换,确认门原则)。
export interface KnowledgeDistillToolResult {
  kind: "knowledge.distill";
  atoms: Array<{
    type: "claim" | "evidence" | "quote" | "qa";
    title: string;
    note: string;
    sourceNote: string;
  }>;
  suggestedTags: string[];
  /** 送蒸的原文(clamp 后)—— 卡上「原文同时存档」reference 条目的数据源。 */
  originalText: string;
  /** 失败时的人话错误(成功为 null);未命中人话规则时回落原始 message(诚实,不装懂)。 */
  error: string | null;
  /** true = 错误属「换模型可解」类(卡附「去设置」深链)。 */
  suggestSwitchModel: boolean;
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

// [T-099b] 详情档长文本字段的统一形状(§3 详情档预算):只回前 200 字 + totalChars,并带
// 指针到对应全文工具 —— 详情档永不夹带全文。前端卡直渲 preview + 「全文用 X 读取」提示。
export interface DetailTextField {
  /** 截断后的预览(≤ DETAIL_TEXT_PREVIEW_CHARS 字;≤该长度时即全文)。 */
  preview: string;
  /** 原文总字数(超出 preview 时模型/卡据此如实告知「还有 N 字未展开」)。 */
  totalChars: number;
  /** 被截断(totalChars > preview 长度)时,读全文该调的工具名(切片三落地);未超则 null。 */
  fullTextTool: string | null;
}

// [T-099b] 详情档长文本预览上限(§3:长文本字段只回前 200 字 + totalChars)。导出供单测。
export const DETAIL_TEXT_PREVIEW_CHARS = 200;

// [T-099b] 详情档长文本字段截断(§3 详情档预算,execute 侧强制、非君子协定):超 200 字截断,
// 带 totalChars + 指针到全文工具;未超则 fullTextTool=null(全文已在 preview 里)。fullTextTool
// 传对应切片三全文工具名(context.artifact.text / context.knowledge.text);raw 空/非串 → 空预览。
export function truncateDetailText(
  raw: unknown,
  fullTextTool: string,
): DetailTextField {
  const s = typeof raw === "string" ? raw : "";
  const totalChars = s.length;
  if (totalChars <= DETAIL_TEXT_PREVIEW_CHARS) {
    return { preview: s, totalChars, fullTextTool: null };
  }
  return {
    preview: s.slice(0, DETAIL_TEXT_PREVIEW_CHARS),
    totalChars,
    fullTextTool,
  };
}

// [T-099b] context.project.detail 工具结果 —— 项目全档(brief/阶段/发布/产物索引/指标)。
// 前端「项目档案卡」直渲。coreMessage/successCriteria 等 brief 文本字段本就短(选题卡输入),
// 不套详情档预算;唯 metricsSummary 是拼接串、也短。全字段直渲,无长正文(正文走 context.artifact.text)。
export interface ContextProjectDetailToolResult {
  kind: "context.project.detail";
  found: boolean;
  project: {
    id: string;
    title: string;
    stage: string;
    status: string;
    publish: {
      published: boolean;
      platform: string | null;
      publishedAt: string | null;
    };
    brief: ProjectDetailRaw["brief"];
    artifacts: ProjectDetailRaw["artifacts"];
    metricsSummary: string;
  } | null;
}

// [T-099b] context.positioning.detail 工具结果 —— 定位母版全档(facets/rules/陈述/账号画像)。
// 前端「定位档案卡」直渲(对齐 ChatPositioningCard 9-facet 只读态 + downstreamRules + 账号画像)。
export interface ContextPositioningDetailToolResult {
  kind: "context.positioning.detail";
  found: boolean;
  positioning: PositioningDetailRaw;
}

// [T-099b] context.knowledge.detail 工具结果 —— 单条知识原子全档。前端「知识原子卡」直渲。
// note/sourceNote 长文本走详情档预算(≤200 字 + totalChars + 指针到 context.knowledge.text)。
export interface ContextKnowledgeDetailToolResult {
  kind: "context.knowledge.detail";
  found: boolean;
  item: {
    id: string;
    title: string;
    knowledgeType: string;
    note: DetailTextField;
    sourceNote: DetailTextField;
    sourceType: string;
    sourceUrl: string | null;
    tags: string[];
    usedCount: number;
    usedInPublished: boolean;
    relations: Array<{ targetKnowledgeId: string; relationType: string }>;
  } | null;
}

// ── [T-099c] 全文档窗口读取(SPEC §3 全文档预算)──────────────────────────────────────
// 全文档:maxChars 默认 4000 / 封顶 8000(execute 侧强制,非君子协定);offset 按字符;返回
// { text(窗口), offset, totalChars, hasMore }。模型据 hasMore/offset/totalChars 按需翻窗
// (honesty 第 6 条如实告知没看全天然适用)。人机同源:全文阅读卡从 part.output 直渲同一份真值。

// [T-099c] 全文档窗口默认取字数(SPEC §3:默认 4000)。导出供单测/工具描述引用。
export const TEXT_WINDOW_DEFAULT_MAX_CHARS = 4000;
// [T-099c] 全文档窗口硬上限(SPEC §3:封顶 8000)。execute 侧对 maxChars 强制夹到此值。导出供单测。
export const TEXT_WINDOW_CAP_CHARS = 8000;

// [T-099c] context.artifact.text / context.knowledge.text 的窗口结果形状(SPEC §3 全文档真相字段)。
export interface TextWindow {
  /** 从 offset 起、长度 ≤ maxChars 的正文窗口(封顶 8000)。 */
  text: string;
  /** 本窗口起始字符偏移(clamp 到 [0, totalChars])。 */
  offset: number;
  /** 正文总字数(全文,窗口前的真相 —— 模型据此知道离看全还差多少)。 */
  totalChars: number;
  /** 本窗口之后是否还有正文(offset + text.length < totalChars)。 */
  hasMore: boolean;
}

// [T-099c] maxChars 夹取:非法/缺省 → 默认 4000;>8000 → 封顶 8000;≤0 → 默认。导出供单测。
export function clampWindowMaxChars(maxChars: number | undefined): number {
  if (
    typeof maxChars !== "number" ||
    !Number.isFinite(maxChars) ||
    maxChars <= 0
  ) {
    return TEXT_WINDOW_DEFAULT_MAX_CHARS;
  }
  return Math.min(Math.floor(maxChars), TEXT_WINDOW_CAP_CHARS);
}

/**
 * [T-099c] 全文档窗口读取纯函数(SPEC §3 全文档预算,execute 侧强制)。
 * offset 按字符 clamp 到 [0, totalChars];maxChars 经 clampWindowMaxChars(默认 4000/封顶 8000);
 * 返回 { text(窗口), offset, totalChars, hasMore }。空文本 → 空窗口 + hasMore=false。可单测。
 */
export function readTextWindow(
  fullText: unknown,
  opts: { offset?: number; maxChars?: number },
): TextWindow {
  const s = typeof fullText === "string" ? fullText : "";
  const totalChars = s.length;
  const eff = clampWindowMaxChars(opts.maxChars);
  // offset 夹到 [0, totalChars](负数/越界/非数 → 0 或末尾;不抛)。
  const rawOffset = opts.offset;
  const safeOffset =
    typeof rawOffset === "number" && Number.isFinite(rawOffset) && rawOffset > 0
      ? Math.floor(rawOffset)
      : 0;
  const offset = Math.min(safeOffset, totalChars);
  const text = s.slice(offset, offset + eff);
  return {
    text,
    offset,
    totalChars,
    hasMore: offset + text.length < totalChars,
  };
}

// [T-099c] context.artifacts 工具结果 —— 某项目产物清单(清单档 compact)。前端「产物清单卡」直渲。
export interface ContextArtifactsToolResult {
  kind: "context.artifacts";
  found: boolean;
  projectId: string;
  projectTitle: string;
  items: Array<{
    artifactType: string;
    currentVersion: number | null;
    updatedAt: string | null;
    totalChars: number;
  }>;
}

// [T-099c] context.artifact.text 工具结果 —— 产物正文窗口(全文档,SPEC §1 行#4)。前端「全文阅读卡」
// 直渲(元数据头 artifactType/字数/窗口位置 + 折叠正文可展开 + hasMore 翻窗提示)。这是事故二根治工具。
export interface ContextArtifactTextToolResult extends TextWindow {
  kind: "context.artifact.text";
  found: boolean;
  artifactType: string;
}

// [T-099c] context.knowledge.text 工具结果 —— 知识长文窗口(全文档,SPEC §1 行#11,复用全文阅读卡)。
export interface ContextKnowledgeTextToolResult extends TextWindow {
  kind: "context.knowledge.text";
  found: boolean;
  id: string;
  title: string;
  knowledgeType: string;
}

// ── [T-099 切片四] 指标/发布类 context 工具结果 —— 清单档(SPEC §1 行#6/#7)──────────────
// 人机同源:结果同一份真值,模型读进上下文归纳,前端 CONTEXT_CARD_REGISTRY 直渲(发布清单卡 /
// 指标表卡)。清单档预算:默认 20/封顶 50,带 total/offset/hasMore 真相字段(§3)。

// [T-099 切片四] context.publications 工具结果 —— 发布记录清单。前端「发布清单卡」直渲。
export interface ContextPublicationsToolResult {
  kind: "context.publications";
  items: Array<{
    id: string;
    platform: string;
    url: string | null;
    publishedAt: string | null;
    projectTitle: string;
    status: string;
  }>;
  total: number;
  offset: number;
  hasMore: boolean;
}

// [T-099 切片四] context.metrics 工具结果 —— 指标表(单作品快照时间线 或 账号级最近 N 作品行)。
// 前端「指标表卡」直渲(表格:作品×指标 + 单作品模式留存点)。
export interface ContextMetricsToolResult {
  kind: "context.metrics";
  /** 单作品模式:被查作品标题;账号级模式为 null(前端据此切表头文案)。 */
  subject: string | null;
  rows: Array<{
    title: string;
    plays: number | null;
    likes: number | null;
    comments: number | null;
    shares: number | null;
  }>;
  /** 单作品模式的留存点(账号级为空)。 */
  retention: Array<{ atSeconds: number; retentionRate: number }>;
}

// ── [T-099 切片五] 经验/候选/校准类 context 工具结果 —— 清单档(SPEC §1 行#13/#14/#15)────

// [T-099 切片五] context.learnings 工具结果 —— 经验清单(含 validated/candidate 状态)。
// 前端「经验清单卡」直渲(复用 ChatLearningsCard 只读态)。
export interface ContextLearningsToolResult {
  kind: "context.learnings";
  items: Array<{
    id: string;
    title: string;
    insight: string;
    learningType: string;
    status: string;
    reuseCount: number;
  }>;
  total: number;
}

// [T-099 切片五] context.candidates 工具结果 —— 选题候选池清单。前端「候选池清单卡」直渲。
export interface ContextCandidatesToolResult {
  kind: "context.candidates";
  items: Array<{
    id: string;
    title: string;
    status: string;
    score: number | null;
    source: string;
  }>;
  total: number;
  offset: number;
  hasMore: boolean;
}

// [T-099 切片五] context.predictions 工具结果 —— 预测 vs 实绩对照 + 当前 rubric 摘要。
// 前端「校准对照卡」直渲。
export interface ContextPredictionsToolResult {
  kind: "context.predictions";
  /** 当前 rubric 版本摘要(母版未建 → null)。 */
  rubric: PredictionsRaw["rubric"];
  items: PredictionsRaw["rows"];
  total: number;
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

// [T-084b] material.screenshot 入参 —— 公开 URL(必填)+ 是否全页截图(缺省视口)。
const MATERIAL_SCREENSHOT_PARAMS = jsonSchema<{ url: string; fullPage?: boolean }>({
  type: "object",
  properties: {
    url: {
      type: "string",
      description:
        "要截图的**公开**网页 URL(http/https)。当前只支持公开页面 —— 登录墙/需登录的页面会诚实报错,别拿它截私有页。",
    },
    fullPage: {
      type: "boolean",
      description: "true=截整页(长图);缺省/false=只截首屏视口。",
    },
  },
  required: ["url"],
  additionalProperties: false,
});

// [T-217c] web.read 入参 —— 要读正文的单个网页 URL(可含需登录内容:ChatGPT 分享/知乎/公众号等)。
const WEB_READ_PARAMS = jsonSchema<{ url: string }>({
  type: "object",
  properties: {
    url: {
      type: "string",
      description:
        "要读正文的网页 URL(http/https)。可以是**需要登录才能看到**的页面(如 ChatGPT 分享链接、知乎收藏、公众号文章)——会用你在保管库登录后的登录态读到正文全文(比截图准)。若该站还没登录,会返回「需登录」提示,引导用户去保管库登录一次。",
    },
  },
  required: ["url"],
  additionalProperties: false,
});

// [T-084c] material.generate 入参 —— 生成 kind(图/视频)+ prompt(必填)+ 可选风格。
const MATERIAL_GENERATE_PARAMS = jsonSchema<{
  kind: "image" | "video";
  prompt: string;
  style?: string;
}>({
  type: "object",
  properties: {
    kind: {
      type: "string",
      enum: ["image", "video"],
      description: "生成图(image)还是视频(video)。视频异步分钟级,提交后后台跑,不阻塞对话。",
    },
    prompt: {
      type: "string",
      description:
        "生成描述(画面内容/主体/氛围)。生成的是 AI 素材、非真实拍摄,尽量具体让画面可用。",
    },
    style: {
      type: "string",
      description: "可选风格/画风(如「扁平插画」「写实摄影」「赛博朋克」),会拼进生成 prompt。",
    },
  },
  required: ["kind", "prompt"],
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

// [T-103b] review.script 入参 —— 可选显式 projectId(缺省用当前项目对话的 projectId)。
// 审核对象恒是「当前项目的脚本」(script.review 只吃 projectId);无入参也能审当前项目。
const REVIEW_SCRIPT_PARAMS = jsonSchema<{ projectId?: string }>({
  type: "object",
  properties: {
    projectId: {
      type: "string",
      description:
        "要审核脚本的项目 id(可选)。缺省用当前项目对话的项目——所以在稿面右栏对话里直接调、不用传。",
    },
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

// [T-094] knowledge.distill 入参 —— 对话里粘的原文**逐字全文**(模板/描述都强调不摘要不改写)。
// maxLength 与 clamp 同值兜底(部分模型不吃 maxLength 约束);runner 侧另有 8000 字符送模截断。
const KNOWLEDGE_DISTILL_PARAMS = jsonSchema<{ content: string }>({
  type: "object",
  properties: {
    content: {
      type: "string",
      maxLength: 12000,
      description:
        "要蒸馏的原文全文(用户在对话里粘的笔记/逐字稿/网页摘录),逐字传入 —— 不要摘要、不要改写、不要截断。",
    },
  },
  required: ["content"],
  additionalProperties: false,
});

// [T-094] 蒸馏原文清洗:trim + 截 12000 字(与 schema maxLength 同值;runner 送模再截 8000,
// 这里的余量保住「原文存档」尽量全)。空/非串 → 空串(execute 按空原文诚实报错)。导出供单测。
export const MAX_DISTILL_TOOL_CONTENT_CHARS = 12000;
export function clampDistillContent(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const v = raw.trim();
  return v.length > MAX_DISTILL_TOOL_CONTENT_CHARS
    ? v.slice(0, MAX_DISTILL_TOOL_CONTENT_CHARS)
    : v;
}

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

// [T-099b] context.project.detail 入参 —— projectId 必填(单实体全档查)。
const CONTEXT_PROJECT_DETAIL_PARAMS = jsonSchema<{ projectId: string }>({
  type: "object",
  properties: {
    projectId: {
      type: "string",
      description:
        "要查全档的项目 id(从 context.projects 清单卡拿到的 id)。返回该项目的立项 brief 全字段 + 当前阶段 + 发布状态 + 产物索引 + 最新指标摘要。",
    },
  },
  required: ["projectId"],
  additionalProperties: false,
});

// [T-099b] context.positioning.detail 入参 —— 无入参(账号级单实体,母版就一份)。
const CONTEXT_POSITIONING_DETAIL_PARAMS = jsonSchema<Record<string, never>>({
  type: "object",
  properties: {},
  additionalProperties: false,
});

// [T-099b] context.knowledge.detail 入参 —— id 必填(单条知识全字段查)。
const CONTEXT_KNOWLEDGE_DETAIL_PARAMS = jsonSchema<{ id: string }>({
  type: "object",
  properties: {
    id: {
      type: "string",
      description:
        "要查全档的知识条目 id(从 context.knowledge 清单卡拿到的 id)。返回该条目的 type/标题/正文/出处/标签/战绩(被引用次数)/关联边。",
    },
  },
  required: ["id"],
  additionalProperties: false,
});

// [T-099c] context.artifacts 入参 —— projectId 必填(某项目产物清单)。
const CONTEXT_ARTIFACTS_PARAMS = jsonSchema<{ projectId: string }>({
  type: "object",
  properties: {
    projectId: {
      type: "string",
      description:
        "要列产物清单的项目 id(从 context.projects 清单卡拿到的 id)。返回该项目每类产物(脚本/逐字稿/论点树等)的类型 + 当前版本号 + 更新时间 + 字数。要读某类产物正文用 context.artifact.text。",
    },
  },
  required: ["projectId"],
  additionalProperties: false,
});

// [T-099c] 全文档窗口入参共用属性(offset/maxChars)—— context.artifact.text / context.knowledge.text
// 同窗口协议(SPEC §3)。offset 按字符;maxChars 默认 4000/封顶 8000(execute 侧强制)。
const WINDOW_OFFSET_PROPERTY = {
  type: "number",
  description:
    "从正文第几个字符开始读(默认 0,按字符)。上一窗口 hasMore=true 时,用上一窗口的 offset+已读字数继续翻,直到看全或如实告知还剩多少。",
} as const;
const WINDOW_MAX_CHARS_PROPERTY = {
  type: "number",
  description:
    "本窗口最多读多少字(默认 4000,封顶 8000;超过会被截到 8000)。正文很长时按需分窗读,不要一次性硬拿全文。",
} as const;

// [T-099c] context.artifact.text 入参 —— projectId + artifactType 必填,offset/maxChars 可选(窗口)。
const CONTEXT_ARTIFACT_TEXT_PARAMS = jsonSchema<{
  projectId: string;
  artifactType: string;
  offset?: number;
  maxChars?: number;
}>({
  type: "object",
  properties: {
    projectId: {
      type: "string",
      description:
        "产物所属项目 id(从 context.projects 拿)。先用 context.artifacts 看该项目有哪些 artifactType,再来读正文。",
    },
    artifactType: {
      type: "string",
      description:
        "要读正文的产物类型(如 output_script=逐字稿/脚本、content_outline=结构方案、thesis_tree=论点树、content_contract=内容合同)。取值来自 context.artifacts 清单里的 artifactType。",
    },
    offset: WINDOW_OFFSET_PROPERTY,
    maxChars: WINDOW_MAX_CHARS_PROPERTY,
  },
  required: ["projectId", "artifactType"],
  additionalProperties: false,
});

// [T-099c] context.knowledge.text 入参 —— id 必填,offset/maxChars 可选(与 artifact.text 同窗口协议)。
const CONTEXT_KNOWLEDGE_TEXT_PARAMS = jsonSchema<{
  id: string;
  offset?: number;
  maxChars?: number;
}>({
  type: "object",
  properties: {
    id: {
      type: "string",
      description:
        "要读长文正文的知识条目 id(从 context.knowledge 搜到,或 context.knowledge.detail 提示正文很长时)。返回 transcript/reference/note 长文的窗口。",
    },
    offset: WINDOW_OFFSET_PROPERTY,
    maxChars: WINDOW_MAX_CHARS_PROPERTY,
  },
  required: ["id"],
  additionalProperties: false,
});

// [T-099 切片四] context.publications 入参 —— 分页(limit/offset,与 comments 同形)。
const CONTEXT_PUBLICATIONS_PARAMS = jsonSchema<{
  limit?: number;
  offset?: number;
}>({
  type: "object",
  properties: {
    limit: { type: "number", description: "本页条数(默认 20,最大 50)" },
    offset: { type: "number", description: "翻页偏移(默认 0;结果带 total/hasMore,可继续翻)" },
  },
  additionalProperties: false,
});

// [T-099 切片四] context.metrics 入参 —— projectId 可选:给了 → 单作品快照 + 留存点;不给 →
// 账号级最近 N 作品指标行。
const CONTEXT_METRICS_PARAMS = jsonSchema<{ projectId?: string }>({
  type: "object",
  properties: {
    projectId: {
      type: "string",
      description:
        "要看指标的项目 id(从 context.projects 拿):给了 → 返回这条作品的播放/点赞/评论/分享快照 + 留存点;不给 → 返回账号级最近若干作品的指标行。",
    },
  },
  additionalProperties: false,
});

// [T-099 切片五] context.learnings 入参 —— query/learningType/status 全可选(缺省回最近全量)。
const CONTEXT_LEARNINGS_PARAMS = jsonSchema<{
  query?: string;
  learningType?: string;
  status?: string;
}>({
  type: "object",
  properties: {
    query: {
      type: "string",
      description: "搜索关键词(可选;命中标题/洞察,缺省回最近若干条)。",
    },
    learningType: {
      type: "string",
      description:
        "按类型过滤(可选):strategy/hook/structure/failure/process/editing/conversion_pattern/offer_insight。",
    },
    status: {
      type: "string",
      description:
        "按状态过滤(可选):validated=已验证 / candidate=待验证 / discarded=已弃。缺省回全部并逐条标状态(注入 brief 只喂 validated,本工具可见全量)。",
    },
  },
  additionalProperties: false,
});

// [T-099 切片五] context.candidates 入参 —— 分页(limit/offset)。
const CONTEXT_CANDIDATES_PARAMS = jsonSchema<{
  limit?: number;
  offset?: number;
}>({
  type: "object",
  properties: {
    limit: { type: "number", description: "本页条数(默认 20,最大 50)" },
    offset: { type: "number", description: "翻页偏移(默认 0;结果带 total/hasMore,可继续翻)" },
  },
  additionalProperties: false,
});

// [T-099 切片五] context.predictions 入参 —— 无入参(账号级最近若干预测对照;limit execute 兜)。
const CONTEXT_PREDICTIONS_PARAMS = jsonSchema<Record<string, never>>({
  type: "object",
  properties: {},
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
      // [T-084a] 动态诚实描述:配了联网检索才说「真实搜集…带来源」;未配则明说素材来自训练
      // 记忆需核实(去掉无条件的「真实…带来源」宣称,防名实不符)。
      description: deps.searchConfigured
        ? "围绕主题真实搜集创作素材(钩子/案例/数据点/金句四类)。已配联网检索,会先真联网搜索再综合,带真实来源 URL。创作者会逐条挑选存入这条内容的弹药。当用户要找素材/搜资料/要案例数据时调用。"
        : "围绕主题搜集创作素材(钩子/案例/数据点/金句四类)。**当前未配置联网检索,素材来自模型训练记忆、非实时搜索,来源需核实**——调用后要主动告知用户这一点,绝不假装搜过网。当用户要找素材/搜资料/要案例数据时调用。",
      inputSchema: MATERIAL_GATHER_PARAMS,
      execute: async ({ query }): Promise<MaterialGatherToolResult> => {
        const { items, grounding } = await deps.gatherMaterials({ query });
        return { kind: "material.gather", grounding, items };
      },
    }),
    // [T-084b] 自动化截图:给公开 URL,服务端真开无头浏览器截图 → 落素材中心(带 sourceUrl
    // 存证)。截图 = 不可抵赖的真证据(区别于 material.gather 的模型记忆素材)。execute 接住
    // 逐类报错(打不开/HTTP/登录墙)转人话随结果卡渲错误态,不抛给 SDK(避免裸机器码/spinner)。
    "material.screenshot": tool({
      description:
        "给一个**公开**网页 URL,服务端真开浏览器截图(带来源 URL 存证)。截图是不可抵赖的真证据(不同于搜集/生成的素材)。当用户要「截个图/把这个页面截下来/存这个网页的样子」时调用。当前只支持公开页面——登录墙/需登录页会诚实报错,不产垃圾图。截好的图渲成卡片**待用户确认**:点「存入素材库」才进库(铁律②:AI 写入需人确认),入库后可再「加入弹药」挂进这条内容的用料链。",
      inputSchema: MATERIAL_SCREENSHOT_PARAMS,
      execute: async ({ url, fullPage }): Promise<MaterialScreenshotToolResult> => {
        const target = typeof url === "string" ? url.trim() : "";
        if (!target) {
          return {
            kind: "material.screenshot",
            asset: null,
            error: "没有收到要截图的 URL —— 请给一个公开可访问的网页链接。",
          };
        }
        try {
          const asset = await deps.captureScreenshot({ url: target, fullPage });
          return {
            kind: "material.screenshot",
            asset: {
              id: asset.assetId,
              name: asset.name,
              previewUrl: asset.previewUrl,
              sourceUrl: asset.sourceUrl,
            },
            error: null,
          };
        } catch (err) {
          // 逐类诚实报错(WebCaptureError:打不开 / HTTP 码 / 登录墙)原样转述,模型如实告知。
          return {
            kind: "material.screenshot",
            asset: null,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      },
    }),
    // [T-217c] 带登录态读网页正文:给一个 URL(可含需登录内容),服务端用保管库登录态读正文全文
    // → 落**逐字稿文本素材**(pending 确认门)。无会话/过期 → 返回需登录降级(编导引导去保管库
    // 登录,不截登录页糊弄);其余失败逐类诚实转人话(不抛给 SDK)。
    "web.read": tool({
      description:
        "读一个网页的**正文全文**(带你在保管库登录后的登录态,能读需登录内容:ChatGPT 分享链接、知乎、公众号、飞书文档等)。抽出的是干净正文文本(ChatGPT 分享抽逐轮对话全文),比截图准、不 OCR 失真。当用户粘一个链接要你「读一下/看看这篇/这段对话讲了啥/据此出选题」时**优先用它**(而不是截图)。读到的正文渲成卡片**待用户确认**存入素材库(铁律②)。若该站还没登录会返回「需登录」——这时引导用户去『设置→网站登录保管库』登录一次,别改用截图糊弄。",
      inputSchema: WEB_READ_PARAMS,
      execute: async ({ url }): Promise<WebReadToolResult> => {
        const target = typeof url === "string" ? url.trim() : "";
        if (!target) {
          return {
            kind: "web.read",
            asset: null,
            needLogin: null,
            error: "没有收到要读取的 URL —— 请给一个网页链接。",
          };
        }
        try {
          const res = await deps.readWeb({ url: target });
          if (res.needLogin) {
            return {
              kind: "web.read",
              asset: null,
              needLogin: { domain: res.domain },
              error: null,
            };
          }
          return {
            kind: "web.read",
            asset: {
              id: res.assetId,
              name: res.name,
              previewUrl: res.previewUrl,
              sourceUrl: res.sourceUrl,
              title: res.title,
              excerpt: res.excerpt,
              extractor: res.extractor,
            },
            needLogin: null,
            error: null,
          };
        } catch (err) {
          // 逐类诚实报错(WebCaptureError:打不开 / HTTP 码 / 抽不出正文)原样转述。
          return {
            kind: "web.read",
            asset: null,
            needLogin: null,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      },
    }),
    // [T-084c] AI 生成素材:文生图/文生视频。execute **不直接生成**(视频异步分钟级不能阻塞
    // 对话回合)—— dispatch 既有 asset.generate task,立即返回 taskId;前端 ChatGenerateCard
    // 轮询 → 完成渲缩略图 + 采纳。未配生图/生视频模型 → task cancelled,卡内诚实「去设置」。
    "material.generate": tool({
      description:
        "用 AI 生成图片或视频素材(文生图/文生视频)。生成的是 AI 图/视频素材(非真实拍摄/截图);创作者采纳后才进素材中心。当用户要「生成一张配图/做个 B-roll/AI 出个画面」时调用。视频异步、分钟级——提交后后台跑,卡片会显示进度。若未配置生图/生视频模型,任务会失败并在卡上提示去设置(不假装能生成)。",
      inputSchema: MATERIAL_GENERATE_PARAMS,
      execute: async ({ kind, prompt, style }): Promise<MaterialGenerateToolResult> => {
        const effKind: "image" | "video" = kind === "video" ? "video" : "image";
        const effPrompt = typeof prompt === "string" ? prompt.trim() : "";
        if (!effPrompt) {
          return {
            kind: "material.generate",
            taskId: null,
            kindOf: effKind,
            status: "queued",
            error: "没有收到生成描述 —— 请说清楚要生成什么画面。",
          };
        }
        try {
          const { taskId } = await deps.dispatchGenerateAsset({
            kind: effKind,
            prompt: effPrompt,
            style: typeof style === "string" && style.trim() ? style.trim() : undefined,
          });
          return {
            kind: "material.generate",
            taskId,
            kindOf: effKind,
            status: "queued",
            error: null,
          };
        } catch (err) {
          return {
            kind: "material.generate",
            taskId: null,
            kindOf: effKind,
            status: "queued",
            error: err instanceof Error ? err.message : String(err),
          };
        }
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
    // [T-103b] 稿面文案审核进对话:dispatch 既有 script.review 审核链路(L1 违禁词 lint + L2 豆包
    // 语义审,复用 T-086,别重造)→ 立即返回 taskId + projectId(不阻塞对话回合)。前端
    // ChatReviewReportCard 据 taskId 轮询 → succeeded 后读 getLatestScriptReview 渲审核报告卡
    // (verdict + findings);改写建议逐条走 createArtifactVersion append-only 应用门。无项目上下文 /
    // dispatch 失败 → error 非 null(卡渲错误态,诚实提示),不假装审过。
    "review.script": tool({
      description:
        "对当前项目的脚本做发布前合规/表达审核(L1 违禁词 lint + L2 语义审)。当用户说「审核这份文案/审一下脚本/查违禁词/合规诊断」时调用。审核在后台跑(分钟内),结果渲成审核报告卡(verdict + 命中项 + 逐条改写建议);改写建议由用户逐条点「应用」才写入脚本新版本——你没有改稿能力,绝不口头宣称「已改」。只能审当前项目对话里的脚本;没有项目上下文时会诚实提示去项目稿面里审。若未配专用审核模型,报告会如实标注(L1 违禁词 lint 照常跑,确定性)。",
      inputSchema: REVIEW_SCRIPT_PARAMS,
      execute: async ({ projectId }): Promise<ReviewScriptToolResult> => {
        try {
          const { taskId, projectId: pid, error } = await deps.dispatchScriptReview({
            projectId: typeof projectId === "string" && projectId.trim() ? projectId.trim() : undefined,
          });
          return { kind: "review.report", taskId, projectId: pid, error };
        } catch (err) {
          return {
            kind: "review.report",
            taskId: null,
            projectId: null,
            error: err instanceof Error ? err.message : String(err),
          };
        }
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
        "结合创作者当前定位 + 抖音账号画像 + 真实作品画像,生成/进化一份结构化定位提案(人设/领域/人群/差异化/能力/一句话定位/关键词)。[T-210] 定位访谈答齐后调用:把访谈 5 问(新手/老手、领域受众、目标、内容形态、对标风格)的回答连同已翻过的真数据/聊出的定位洞察整理进 extraBrief 一并传入(否则访谈结论会丢、只会复读旧档案)。结果是定位候选,需人采纳后才写入定位母版——不直接写库。",
      inputSchema: POSITIONING_GENERATE_PARAMS,
      execute: async ({ extraBrief }): Promise<PositioningGenerateToolResult> => {
        const suggestion = await deps.generatePositioning({
          extraBrief: clampExtraBrief(extraBrief),
        });
        return { kind: "positioning.suggestion", suggestion };
      },
    }),
    // [T-094] 知识蒸馏(倾倒场 Copilot 化):用户在对话里粘原文 → 本工具走既有 knowledge.distill
    // 引擎产一批知识原子候选 → 前端渲蒸馏批量确认门卡(勾选/改 type/改 title),人点「采纳选中
    // N 条」才逐条 knowledge.create(铁律②)。失败不抛给 SDK(避免裸机器码/无限 spinner):
    // 接住转人话(ai-error-humanize,如 MiniMax new_sensitive/1026 内容安全拦截)随结果卡渲错误态。
    "knowledge.distill": tool({
      description:
        "把用户粘贴的原始材料(笔记/口播逐字稿/网页摘录/评论讨论)蒸馏成一批可独立引用的知识原子候选(观点/证据/金句/观众问题)。用户在对话里倒入要存进知识库的原文时调用,content 必须是原文逐字全文(不要摘要改写)。结果是候选,渲成确认门卡由用户勾选采纳后才入知识库——不直接写库。",
      inputSchema: KNOWLEDGE_DISTILL_PARAMS,
      execute: async ({ content }): Promise<KnowledgeDistillToolResult> => {
        const text = clampDistillContent(content);
        if (!text) {
          return {
            kind: "knowledge.distill",
            atoms: [],
            suggestedTags: [],
            originalText: "",
            error: "没有收到要蒸馏的原文 —— 请把材料整段粘进对话再试。",
            suggestSwitchModel: false,
          };
        }
        try {
          const { atoms, suggestedTags } = await deps.distillKnowledge({
            content: text,
          });
          return {
            kind: "knowledge.distill",
            atoms,
            suggestedTags,
            originalText: text,
            error: null,
            suggestSwitchModel: false,
          };
        } catch (err) {
          const human = deps.humanizeError(err);
          return {
            kind: "knowledge.distill",
            atoms: [],
            suggestedTags: [],
            originalText: text,
            error:
              human?.message ??
              (err instanceof Error ? err.message : String(err)),
            suggestSwitchModel: human?.suggestSwitchModel ?? false,
          };
        }
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
    // ── [T-099b] 只读 context 详情工具(切片二)—— 单实体全字段。人机同源:结果同一份真值,
    //    模型读进上下文归纳,前端 CONTEXT_CARD_REGISTRY 直渲档案卡(模型只有指针权、无转录权)。
    //    §3 详情档预算:长文本字段恒 ≤200 字 + totalChars + 指针到全文工具(切片三)。
    "context.project.detail": tool({
      description:
        "只读:拉取某个项目/作品的**全档**(立项 brief 全字段 + 当前阶段 + 发布状态 + 产物索引「每类产物有几个版本/多少字/何时更新」+ 最新指标摘要)。当用户问「这个项目做到哪了 / 它的策划是什么 / 有哪些产物 / 数据怎么样」时,先用 context.projects 拿到 id,再调它拿真实全档。产物正文不在这里(只给字数索引)——要读脚本/逐字稿全文用 context.artifact.text。纯读取上下文,不产候选、不写库。",
      inputSchema: CONTEXT_PROJECT_DETAIL_PARAMS,
      execute: async ({ projectId }): Promise<ContextProjectDetailToolResult> => {
        const pid = typeof projectId === "string" ? projectId.trim() : "";
        if (!pid || !deps.getProjectDetail) {
          return { kind: "context.project.detail", found: false, project: null };
        }
        const raw = await deps.getProjectDetail({ projectId: pid });
        if (!raw) {
          return { kind: "context.project.detail", found: false, project: null };
        }
        return {
          kind: "context.project.detail",
          found: true,
          project: {
            id: raw.id,
            title: raw.title,
            stage: raw.stage,
            status: raw.status,
            publish: raw.publish,
            brief: raw.brief,
            artifacts: raw.artifacts,
            metricsSummary: raw.metricsSummary,
          },
        };
      },
    }),
    "context.positioning.detail": tool({
      description:
        "只读:拉取创作者的**定位档案全档**(定位母版 9 facets:人设/领域/人群/差异化/内容范围/不做什么/核心痛点/核心价值/表达风格 + 5 条下游硬约束 downstreamRules + 当前定位陈述 + 陈述版本数 + 抖音账号画像)。当用户问「我的定位是什么 / 我的人设 / 我在平台上是谁 / 定位约束」时调它拿真实定位档案回答。无入参(母版就一份)。纯读取上下文,不产候选、不写库(要改定位用 positioning.generate 产提案卡)。",
      inputSchema: CONTEXT_POSITIONING_DETAIL_PARAMS,
      execute: async (): Promise<ContextPositioningDetailToolResult> => {
        const empty: PositioningDetailRaw = {
          profile: null,
          currentStatement: null,
          statementCount: null,
          accounts: [],
        };
        if (!deps.getPositioningDetail) {
          return { kind: "context.positioning.detail", found: false, positioning: empty };
        }
        const raw = await deps.getPositioningDetail();
        return {
          kind: "context.positioning.detail",
          found: raw.profile !== null || raw.currentStatement !== null,
          positioning: raw,
        };
      },
    }),
    "context.knowledge.detail": tool({
      description:
        "只读:拉取某条知识库条目的**全档**(类型/标题/正文/出处/标签/战绩「被多少条内容引用过、是否用在已发布作品」/关联的其他知识)。当用户问「这条知识具体是什么 / 它被用过没 / 关联了哪些」时,先用 context.knowledge 搜到 id,再调它拿真实全档。正文很长时只回前 200 字 + 总字数(要读全文用 context.knowledge.text)。纯读取上下文,不产候选、不写库。",
      inputSchema: CONTEXT_KNOWLEDGE_DETAIL_PARAMS,
      execute: async ({ id }): Promise<ContextKnowledgeDetailToolResult> => {
        const kid = typeof id === "string" ? id.trim() : "";
        if (!kid || !deps.getKnowledgeDetail) {
          return { kind: "context.knowledge.detail", found: false, item: null };
        }
        const raw = await deps.getKnowledgeDetail({ id: kid });
        if (!raw) {
          return { kind: "context.knowledge.detail", found: false, item: null };
        }
        return {
          kind: "context.knowledge.detail",
          found: true,
          item: {
            id: raw.id,
            title: raw.title,
            knowledgeType: raw.knowledgeType,
            // §3 详情档预算:正文/出处长文本 ≤200 字 + totalChars + 指针到 context.knowledge.text。
            note: truncateDetailText(raw.note, "context.knowledge.text"),
            sourceNote: truncateDetailText(raw.sourceNote, "context.knowledge.text"),
            sourceType: raw.sourceType,
            sourceUrl: raw.sourceUrl,
            tags: raw.tags,
            usedCount: raw.usedCount,
            usedInPublished: raw.usedInPublished,
            relations: raw.relations,
          },
        };
      },
    }),
    // ── [T-099c] 只读 context 全文工具(切片三,事故二根治)—— 产物清单 + 长文本窗口读取。
    //    人机同源:结果同一份真值,模型读进上下文,前端 CONTEXT_CARD_REGISTRY 直渲(产物清单卡 /
    //    全文阅读卡)。§3 全文档预算:窗口 maxChars 默认 4000/封顶 8000(execute 侧强制),返回带
    //    offset/totalChars/hasMore 真相字段,模型按需翻窗。
    "context.artifacts": tool({
      description:
        "只读:列某个项目/作品的**产物清单**(每类产物「脚本/逐字稿/结构方案/论点树等」的 artifactType + 当前版本号 + 字数 + 更新时间)。当用户问「这个项目有哪些产物 / 脚本写了没 / 逐字稿多长」时,先用 context.projects 拿到 id,再调它。这里只给字数索引,不给正文——要读某类产物的正文全文用 context.artifact.text。纯读取上下文,不产候选、不写库。",
      inputSchema: CONTEXT_ARTIFACTS_PARAMS,
      execute: async ({ projectId }): Promise<ContextArtifactsToolResult> => {
        const pid = typeof projectId === "string" ? projectId.trim() : "";
        if (!pid || !deps.listProjectArtifacts) {
          return {
            kind: "context.artifacts",
            found: false,
            projectId: pid,
            projectTitle: "",
            items: [],
          };
        }
        const raw = await deps.listProjectArtifacts({ projectId: pid });
        if (!raw) {
          return {
            kind: "context.artifacts",
            found: false,
            projectId: pid,
            projectTitle: "",
            items: [],
          };
        }
        return {
          kind: "context.artifacts",
          found: true,
          projectId: raw.projectId,
          projectTitle: raw.projectTitle,
          items: raw.items,
        };
      },
    }),
    "context.artifact.text": tool({
      description:
        "只读:按窗口读取某个项目某类产物的**正文全文**(脚本/逐字稿/结构方案等)。这是让你真正摸到作品正文的通路——绝不要拿标题脑补内容。入参 projectId + artifactType(从 context.artifacts 拿),offset/maxChars 控制窗口(默认 4000 字/封顶 8000)。返回 { artifactType, text(窗口正文), offset, totalChars, hasMore }:hasMore=true 时带 offset 继续翻窗读全,或如实告知还剩多少字没读。正文已在对话的全文阅读卡里渲给用户,你只有指针权(引用/归纳),别逐字复述整段。纯读取上下文,不产候选、不写库。",
      inputSchema: CONTEXT_ARTIFACT_TEXT_PARAMS,
      execute: async ({
        projectId,
        artifactType,
        offset,
        maxChars,
      }): Promise<ContextArtifactTextToolResult> => {
        const pid = typeof projectId === "string" ? projectId.trim() : "";
        const atype = typeof artifactType === "string" ? artifactType.trim() : "";
        const emptyWindow = readTextWindow("", { offset, maxChars });
        if (!pid || !atype || !deps.getArtifactText) {
          return {
            kind: "context.artifact.text",
            found: false,
            artifactType: atype,
            ...emptyWindow,
          };
        }
        const raw = await deps.getArtifactText({ projectId: pid, artifactType: atype });
        if (!raw) {
          return {
            kind: "context.artifact.text",
            found: false,
            artifactType: atype,
            ...emptyWindow,
          };
        }
        // §3 全文档预算(execute 侧强制,非君子协定):maxChars 默认 4000/封顶 8000,offset 按字符。
        const window = readTextWindow(raw.fullText, { offset, maxChars });
        return {
          kind: "context.artifact.text",
          found: true,
          artifactType: raw.artifactType,
          ...window,
        };
      },
    }),
    "context.knowledge.text": tool({
      description:
        "只读:按窗口读取某条知识库条目的**长文正文全文**(逐字稿 transcript / 引用原文 reference / 笔记 note)。当 context.knowledge.detail 提示正文很长、或用户要「读全这条知识」时,用 id(从 context.knowledge 搜到)调它。offset/maxChars 控制窗口(默认 4000 字/封顶 8000),与 context.artifact.text 同窗口协议。返回 { title, knowledgeType, text(窗口), offset, totalChars, hasMore }:hasMore=true 时翻窗读全。正文已在全文阅读卡里渲给用户,你只有指针权,别逐字复述整段。纯读取上下文,不产候选、不写库。",
      inputSchema: CONTEXT_KNOWLEDGE_TEXT_PARAMS,
      execute: async ({
        id,
        offset,
        maxChars,
      }): Promise<ContextKnowledgeTextToolResult> => {
        const kid = typeof id === "string" ? id.trim() : "";
        const emptyWindow = readTextWindow("", { offset, maxChars });
        if (!kid || !deps.getKnowledgeText) {
          return {
            kind: "context.knowledge.text",
            found: false,
            id: kid,
            title: "",
            knowledgeType: "",
            ...emptyWindow,
          };
        }
        const raw = await deps.getKnowledgeText({ id: kid });
        if (!raw) {
          return {
            kind: "context.knowledge.text",
            found: false,
            id: kid,
            title: "",
            knowledgeType: "",
            ...emptyWindow,
          };
        }
        // §3 全文档预算(execute 侧强制):与 artifact.text 同窗口协议(readTextWindow)。
        const window = readTextWindow(raw.fullText, { offset, maxChars });
        return {
          kind: "context.knowledge.text",
          found: true,
          id: raw.id,
          title: raw.title,
          knowledgeType: raw.knowledgeType,
          ...window,
        };
      },
    }),
    // ── [T-099 切片四] 指标/发布类 context 工具 —— 清单读。人机同源:结果同一份真值,模型读进
    //    上下文归纳,前端 CONTEXT_CARD_REGISTRY 直渲(发布清单卡 / 指标表卡)。清单档预算:
    //    默认 20/封顶 50(clampContextLimit),带 total/offset/hasMore 真相字段。
    "context.publications": tool({
      description:
        "只读:拉取创作者的发布记录清单(平台/链接/发布时间/关联作品标题),带 total/hasMore 可翻页(offset)。当用户问「我发过哪些 / 最近发布了什么 / 我的作品发在哪些平台」时调它拿真实发布数据回答。纯读取上下文,不产候选、不写库。",
      inputSchema: CONTEXT_PUBLICATIONS_PARAMS,
      execute: async ({
        limit,
        offset,
      }): Promise<ContextPublicationsToolResult> => {
        const eff = clampContextLimit(limit);
        const effOffset = Math.max(0, offset ?? 0);
        if (!deps.listPublications) {
          return {
            kind: "context.publications",
            items: [],
            total: 0,
            offset: effOffset,
            hasMore: false,
          };
        }
        const { rows, total } = await deps.listPublications({
          limit: eff,
          offset: effOffset,
        });
        return {
          kind: "context.publications",
          items: rows,
          total,
          offset: effOffset,
          hasMore: effOffset + rows.length < total,
        };
      },
    }),
    "context.metrics": tool({
      description:
        "只读:拉取作品指标数据。给 projectId(从 context.projects 拿)→ 返回这条作品的播放/点赞/评论/分享快照 + 留存点;不给 → 返回账号级最近若干作品的指标行。当用户问「这条数据怎么样 / 播放多少 / 我最近作品的数据 / 留存曲线」时调它拿真实指标回答,别瞎报数。纯读取上下文,不产候选、不写库。",
      inputSchema: CONTEXT_METRICS_PARAMS,
      execute: async ({ projectId }): Promise<ContextMetricsToolResult> => {
        const pid =
          typeof projectId === "string" && projectId.trim()
            ? projectId.trim()
            : undefined;
        if (!deps.getMetrics) {
          return { kind: "context.metrics", subject: null, rows: [], retention: [] };
        }
        // 账号级默认最近 20 作品(封顶 50);单作品模式 limit 无意义(读端口忽略)。
        const raw = await deps.getMetrics({
          projectId: pid,
          limit: clampContextLimit(undefined),
        });
        return {
          kind: "context.metrics",
          subject: raw.subject,
          rows: raw.rows,
          retention: raw.retention,
        };
      },
    }),
    // ── [T-099 切片五] 经验/候选/校准类 context 工具 —— 清单读。人机同源:前端直渲(经验清单卡 /
    //    候选池清单卡 / 校准对照卡)。清单档预算同上。
    "context.learnings": tool({
      description:
        "只读:拉取创作者的经验库(可复用方法论/教训),可按 query 搜、按 learningType/status 过滤。含 validated(已验证)/candidate(待验证)状态并逐条标注(系统注入只喂已验证的,这里能看全量)。当用户问「我沉淀了哪些经验 / 有没有关于 X 的经验 / 哪些经验还没验证」时调它拿真实经验回答。纯读取上下文,不产候选、不写库(要新增经验用 learning.capture 产卡)。",
      inputSchema: CONTEXT_LEARNINGS_PARAMS,
      execute: async ({
        query,
        learningType,
        status,
      }): Promise<ContextLearningsToolResult> => {
        if (!deps.listLearnings) {
          return { kind: "context.learnings", items: [], total: 0 };
        }
        const { rows, total } = await deps.listLearnings({
          query: typeof query === "string" ? query : undefined,
          learningType: typeof learningType === "string" ? learningType : undefined,
          status: typeof status === "string" ? status : undefined,
          limit: clampContextLimit(undefined),
        });
        return { kind: "context.learnings", items: rows, total };
      },
    }),
    "context.candidates": tool({
      description:
        "只读:拉取创作者的选题候选池(title/status/预测分/来源),带 total/hasMore 可翻页(offset)。当用户问「我有哪些选题在排队 / 候选池里有什么 / 下一条做什么」时调它拿真实候选回答。纯读取上下文,不产候选、不写库(要生成新选题用 topic.generate 产卡)。",
      inputSchema: CONTEXT_CANDIDATES_PARAMS,
      execute: async ({
        limit,
        offset,
      }): Promise<ContextCandidatesToolResult> => {
        const eff = clampContextLimit(limit);
        const effOffset = Math.max(0, offset ?? 0);
        if (!deps.listCandidates) {
          return {
            kind: "context.candidates",
            items: [],
            total: 0,
            offset: effOffset,
            hasMore: false,
          };
        }
        const { rows, total } = await deps.listCandidates({
          limit: eff,
          offset: effOffset,
        });
        return {
          kind: "context.candidates",
          items: rows,
          total,
          offset: effOffset,
          hasMore: effOffset + rows.length < total,
        };
      },
    }),
    "context.predictions": tool({
      description:
        "只读:拉取创作者的校准对照(发布前盲预测 vs 真实表现,逐维度预测分/实绩分/偏差)+ 当前评分标准(rubric)版本摘要。当用户问「我的预测准不准 / 预测和实际差多少 / 校准做到哪了 / 当前评分标准是什么」时调它拿真实校准数据回答。纯读取上下文,不产候选、不写库。",
      inputSchema: CONTEXT_PREDICTIONS_PARAMS,
      execute: async (): Promise<ContextPredictionsToolResult> => {
        if (!deps.getPredictions) {
          return { kind: "context.predictions", rubric: null, items: [], total: 0 };
        }
        const raw = await deps.getPredictions({
          limit: clampContextLimit(undefined),
        });
        return {
          kind: "context.predictions",
          rubric: raw.rubric,
          items: raw.rows,
          total: raw.total,
        };
      },
    }),
  };
}

/**
 * 全部 chatbox 工具名(单一真值)。[T-104] 工具全放开:每个 Copilot 入口暴露全部工具,
 * surface 白名单 + functionKey 仅用于「置顶/预调」排序,不再收窄可调工具集(隔离机制保留、
 * 可逆)。会话/上下文隔离仍由 T-096 scope 管(蒸馏对话不串味选题);数据转述幻觉由 T-098
 * context.* 渲染卡(模型只有指针权、无转录权)根治,故放开 context 工具不再有「拉全标题凑数」风险。
 * drift 由 chat-tools.test.ts 的 guard 用例锁(必须 === Object.keys(allChatTools(deps)))。
 */
export const ALL_CHAT_TOOL_NAMES: readonly string[] = [
  "topic.generate",
  "topic.enrich",
  "script.hooks",
  "script.draft",
  "material.gather",
  "material.screenshot",
  "web.read",
  "material.generate",
  "calibration.diagnose",
  "review.analyze",
  // [T-103b] 稿面文案审核进对话(dispatch script.review → 审核报告卡 + 改写 apply 门)。
  "review.script",
  "learning.capture",
  "brief.fill",
  "positioning.generate",
  "knowledge.distill",
  "context.projects",
  "context.comments",
  "context.knowledge",
  "context.materials",
  // [T-099b] 切片二:详情类(单实体全字段)。
  "context.project.detail",
  "context.positioning.detail",
  "context.knowledge.detail",
  // [T-099c] 切片三:全文类(产物清单 + 长文本窗口读取,事故二根治)。
  "context.artifacts",
  "context.artifact.text",
  "context.knowledge.text",
  // [T-099 切片四] 指标/发布类(清单读)。
  "context.publications",
  "context.metrics",
  // [T-099 切片五] 经验/候选/校准类(清单读)。
  "context.learnings",
  "context.candidates",
  "context.predictions",
];

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
