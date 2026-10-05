export const AI_WORKER_PACKAGE = "@creatoros/ai-worker";

// Worker 公共能力：Pi 执行模型与工具循环，宿主持有任务及业务写入权。
export type { AgentStepEvent } from "./runtime/agent-step-event";
export {
  modelFor,
  // [T-093] 语义检索 embedding 模型工厂(与文本 modelFor 并列;anthropic 协议诚实抛错)。
  embeddingModelFor,
  type ModelSpec,
  type ApiFormat,
  type StructuredOutputMode,
  structuredOutputModeFor,
} from "./runtime/provider-factory";
// 多模态 provider 工厂(SPEC 2026-07-01 §2.2 / §8 M1/M2)—— 生图/生视频用户可配 provider
// 抽象,与文本 modelFor 并列。host(persistence-client)解析 MultimodalSpec(resolveMultimodalSpec)
// + 注册 provider 适配器,调 generateImage/generateVideo 即可。上层统一 `{ assetBytes }` 契约
// ([gate-F1]),异步 video 轮询封在适配器内。asset.generate runner (M2) 消费这些。
export {
  generateImage,
  generateVideo,
  MultimodalConfigError,
  MultimodalGenerationError,
  type MultimodalSpec,
  type MultimodalProviderAdapter,
  type MultimodalProviderRegistry,
  type GeneratedAsset,
  type GenerateImageOptions,
  type GenerateVideoOptions,
} from "./runtime/multimodal-factory";
// ASR 逐字稿工厂 + 类型(T-030-D1)—— transcribeAudio 与 generateImage/Video 并列。
// host(D2 transcribe-runner)解析 MultimodalSpec(resolveTranscribeSpec,kind=audio)+ 注册
// ASR adapter,调 transcribeAudio 即可,返回 `{ text, language? }`。
export {
  transcribeAudio,
  type GeneratedTranscript,
  type TranscribeAudioOptions,
} from "./runtime/multimodal-factory";
// MiniMax 适配器(M1 的默认真 provider)—— host 注册进 registry(keyed by "minimax")。
// deps 可注入(fake fetch/sleep)供单测;video 的异步轮询状态机(submit→poll→retrieve、
// maxPollAttempts 超时抛错)封在这里,M2 runner 把超时 catch 成 cancelTask。
export {
  createMinimaxAdapter,
  type MinimaxAdapterDeps,
} from "./runtime/multimodal-minimax";
export {
  resolveMinimaxH3Endpoints,
  type MinimaxH3Endpoints,
} from "./runtime/minimax-h3-endpoints";
// OmniHi / Seedance 文生视频适配器：POST generations → GET job → 下载成品。
// 宿主会把规范 provider `omnihi` 与历史 `seedance` / `seeddance` 拼写都指向同一实例。
export {
  createOmnihiVideoAdapter,
  type OmnihiVideoAdapterDeps,
} from "./runtime/multimodal-omnihi";
// OpenAI 兼容生图适配器(T-379)—— host 注册进 registry(keyed by "openai" 等用户所配
// provider 名)。直连 `POST {baseUrl}/v1/images/generations`(JSON model+prompt+size,Bearer),
// 响应 b64_json/url 双支持 → 统一 `{ assetBytes }`。一个适配器覆盖 gpt-image 系官方 +
// one-api/new-api 系中转站(Seedream/Flux/Nano Banana 等经中转同形状)。deps 可注入供单测。
export {
  createOpenaiImagesAdapter,
  type OpenaiImagesAdapterDeps,
} from "./runtime/multimodal-openai-images";
// OpenAI 兼容 ASR 适配器(T-030-D1 的默认真 ASR provider)—— host 注册进 registry(keyed by
// "siliconflow"/"openai"/"groq" 等用户所配 provider 名)。deps 可注入(fake fetch)供单测;
// 直连 `POST {baseUrl}/v1/audio/transcriptions`(multipart file+model,Bearer)。
export {
  createOpenaiAsrAdapter,
  type OpenaiAsrAdapterDeps,
} from "./runtime/multimodal-openai-asr";
// 小米 MiMo-V2.5-ASR 使用 input_audio + chat/completions，协议不同于 multipart transcription。
export {
  createMimoAsrAdapter,
  splitMp3ForDataUrl,
  splitMp3ForMimo,
  type MimoAsrAdapterDeps,
} from "./runtime/multimodal-mimo-asr";
// 通义千问 Qwen3-ASR-Flash 使用百炼 OpenAI 兼容 chat/completions + input_audio；
// 与 MiMo 同为 JSON 音频协议，但默认端点、限制与 ASR 参数独立封装。
export {
  createQwenAsrAdapter,
  type QwenAsrAdapterDeps,
} from "./runtime/multimodal-qwen-asr";
// 本地 Whisper 适配器(T-160/T-768)—— 保留给显式本地配置，并作为所有在线 ASR
// 解析、授权或调用失败后的统一单次兜底。
// 用 Transformers.js(@xenova/transformers)本地跑 Whisper(Xenova/whisper-<level>,默认 small),
// 音频用 ffmpeg 解成 16kHz mono f32le PCM。host 用 createDefaultWhisperLocalAdapter() 装配;
// 单测注 fake deps(不真下模型/不 spawn 真 ffmpeg)。免 key、免外部 API、桌面化零 Python。
export {
  createWhisperLocalAdapter,
  createDefaultWhisperLocalAdapter,
  createDefaultPipelineProvider,
  createFfmpegPcmDecoder,
  whisperLevelFromSpec,
  whisperModelId,
  type WhisperLevel,
  type WhisperLocalAdapterDeps,
  type AsrPipeline,
  type FfmpegDecoderDeps,
} from "./runtime/multimodal-whisper-local";
// [T-326 RT-H09] ffmpeg 路径统一解析链(env CREATOROS_FFMPEG_PATH → 随包 sidecar bin/ →
// PATH/常见安装目录 → FfmpegNotFoundError 诚实报错)。whisper-local PCM 解码与 frontend
// douyin-cdp 抽音共用这一把(经此 index 出口跨包复用),根治硬编码 /opt/homebrew/bin/ffmpeg。
export {
  resolveFfmpegPath,
  resolveFfprobePath,
  FfmpegNotFoundError,
  type ResolveFfmpegPathOptions,
} from "./runtime/ffmpeg-path";
export {
  resolveExecutablePath,
  ExecutablePathConfigurationError,
  type ResolveExecutablePathOptions,
} from "./runtime/executable-path";
// Fake 多模态适配器(测试支持,零成本)—— 与 createFakeAgentRunner 同类的测试用假件,经 index
// 公开出口给消费方单测用(frontend asset.generate runner 测装配 + 异步轮询)。含 fake 异步
// video provider(先 taskId、N 次轮询后返 bytes),坐实 [gate-F1]/[gate-F2] 的异步链路覆盖。
export {
  createFakeAdapter,
  createImageOnlyFakeAdapter,
  createFakeAsyncVideoAdapter,
} from "./runtime/multimodal-factory.fake";
// 联网检索工厂(T-084a,SPEC 2026-07-03 §1.1)—— searchWeb 按 provider 分派 REST 适配器,与
// generateImage/generateVideo 并列。host(persistence-client)解析 SearchSpec(resolveSearchSpec)
// + 注册 provider 适配器,调 searchWeb(spec, query) 即可,统一返 SearchResult[]。检索做**节点前置
// 步骤**(非模型工具):调用方先 searchWeb 拿真结果,再注入 generateObject 综合(SPEC §0.5-D)。
export {
  searchWeb,
  SearchConfigError,
  SearchExecutionError,
  type SearchSpec,
  type SearchResult,
  type SearchWebOptions,
  type SearchProviderAdapter,
  type SearchProviderRegistry,
} from "./runtime/search-factory";
// 三家搜索 provider 适配器(bocha/tavily/serpapi)—— host 注册进 registry(keyed by provider);
// fetchImpl 可注入(fake fetch)供单测。各自打真 REST(api.bochaai.com / api.tavily.com /
// serpapi.com),响应映射到 SearchResult。
export { createBochaAdapter } from "./runtime/search-bocha";
export { createTavilyAdapter } from "./runtime/search-tavily";
export { createSerpapiAdapter } from "./runtime/search-serpapi";
// [T-126a] RSS/Atom 免 key 检索适配器 —— provider "rss",baseUrl 填 feed URL(s),不需搜索 API key。
export { createRssAdapter, parseFeed } from "./runtime/search-rss";

// [T-055h asset.classify] 视觉理解(OpenAI 兼容 chat vision,VLM 看图打标签)。
export { describeImageOpenAICompatible } from "./runtime/vision";
export {
  runTopicNode,
  parseTopics,
  type TopicItem,
  type TopicBasis,
} from "./nodes/topic-node";
// 提示词模板系统(脊柱-1):模板化解耦 + 注册表(可版本化/外部覆盖/未来服务端推送)。
export {
  bindPrompt,
  PromptBindError,
  type PromptTemplate,
  type BoundPrompt,
} from "./prompt/template";
export { USER_FACING_RESPONSE_POLICY } from "./prompt/user-facing-response-policy";
// [T-269/T-270] 共享接地 facet 包(创作生成链接地根)—— anti-fabrication 可溯硬约束段(模板 +
// 自由文本子调用共用单一真值)+ 可溯后处理纯函数(生成后校验具体 claim 是否命中注入素材,未命中标
// 「未溯源」)。立项 Brief 硬锚段的渲染在 backend creative-context(读 CreativeContext,不拉 AI SDK)。
export {
  ANTI_FABRICATION_CLAUSE,
  antiFabricationBlock,
  // [T-355] 观众心智预设写法纪律段(script.draft/script.hooks/platform.adapt 文案生成面共用)。
  AUDIENCE_MINDSET_CLAUSE,
  SPECIFIC_CLAIM_PATTERNS,
  UNGROUNDED_MARK,
  buildGroundingHaystack,
  extractSpecificClaims,
  isClaimGrounded,
  findUngroundedClaims,
  annotateUngroundedClaims,
} from "./prompt/grounding-facets";
export {
  registerTemplate,
  registerAllTemplates,
  getOfficialTemplate,
  listOfficialTemplates,
  exportOfficialSkillSchema,
  getOfficialSkillBase,
  listOfficialSkillBases,
  getTemplate,
  hasTemplate,
  listTemplates,
  getTools,
  resolveOutputSchema,
  hasOutputSchema,
  exportSkillSchema,
  overrideTemplates,
  overrideTemplatesFromConfig,
  clearSchemaOverride,
  clearAllSchemaOverrides,
  _resetRegistry,
  type SkillConfigOverride,
} from "./prompt/registry";
export {
  EffectiveSkillRuntimeError,
  runWithEffectiveSkillSnapshot,
  getActiveEffectiveSkillSnapshot,
  hasActiveEffectiveSkillSnapshot,
  getEffectiveSkill,
  getEffectiveTemplate,
  getEffectiveTools,
  getEffectiveContextRequirements,
  resolveEffectiveOutputSchema,
  type CompletionPolicyAdapterRef,
  type CompletionPolicyV1,
  type EditableSkillField,
  type EffectiveSkill,
  type EffectiveSkillSnapshotV1,
  type OfficialSkillBase,
} from "./prompt/effective-skill-runtime";
export {
  CompletionPolicyRuntimeError,
  registerOfficialCompletionPolicyAdapter,
  listOfficialCompletionPolicyAdapters,
  validateCompletionPolicy,
  evaluateCompletionPolicy,
  enforceCompletionPolicy,
  type CompletionPolicyAdapter,
  type CompletionPolicyEvaluation,
  type CompletionPolicyFailureEvidence,
  type CompletionPolicyViolation,
} from "./prompt/completion-policy";
// Skill 输出契约 ⇄ JSON Schema 配置口子(SPEC §4.3):导出(zod→JSON Schema)+ 回灌(JSON Schema→ajv 校验器)。
export {
  exportZodToJsonSchema,
  applySchemaOverride,
  type JsonSchema,
  type SchemaValidator,
} from "./prompt/schema-bridge";
export { TOPIC_GENERATE_TEMPLATE } from "./prompt/templates/topic-generate";
export {
  SCRIPT_DRAFT_TEMPLATE,
  SCRIPT_DRAFT_COMPLETION_POLICY,
  SCRIPT_DRAFT_COMPLETION_POLICY_ADAPTER,
  scriptDraftSchema,
  scriptShotSchema,
  // [T-387b] 结构化视觉意图 schema(shots[].visual 可选:description/assetRefs/missing)。
  scriptShotVisualSchema,
  type ScriptDraftOutput,
} from "./prompt/templates/script-draft";
export {
  SCRIPT_VOICEOVER_COMPOSE_TEMPLATE,
  SCRIPT_STORYBOARD_SEGMENT_TEMPLATE,
  voiceoverComposeSchema,
  type VoiceoverComposeOutput,
} from "./prompt/templates/script-voiceover-storyboard";
export {
  SCRIPT_SOURCE_SIMILARITY_TEMPLATE,
  scriptSourceSimilaritySchema,
} from "./prompt/templates/script-source-similarity";
// 脊柱-1 第二批:6 个 runner 迁 Vercel SDK 共用的外置模板(提示词模板化解耦)。
// T-025:planning 三节点加 outputSchema 走结构化(跨模型健壮),schema/type 一并导出。
export {
  PLANNING_THESIS_TEMPLATE,
  thesisTreeSchema,
  type ThesisTreeOutput,
} from "./prompt/templates/planning-thesis";
// [T-271] 封面方案 skill(cover.brief)—— 制作封面链的结构化产方案 + 输出契约。
export {
  COVER_BRIEF_TEMPLATE,
  coverBriefSchema,
  type CoverBriefOutput,
} from "./prompt/templates/cover-brief";
export {
  PLANNING_CONTRACT_TEMPLATE,
  contractSchema,
  PLANNING_CONTRACT_SLOTS,
  type ContractOutput,
} from "./prompt/templates/planning-contract";
export {
  PLANNING_OUTLINE_TEMPLATE,
  outlineSchema,
  type OutlineOutput,
} from "./prompt/templates/planning-outline";
// T-025:platform.adapt / review.insights / calibration.diagnose 三节点加 outputSchema 走结构化
// (跨模型健壮,让用户默认 MiniMax 也稳定吐可解析产物),schema/type 一并导出。
export {
  PLATFORM_ADAPT_TEMPLATE,
  platformAdaptSchema,
  type PlatformAdaptOutput,
} from "./prompt/templates/platform-adapt";
export {
  REVIEW_INSIGHTS_TEMPLATE,
  reviewInsightsSchema,
  type ReviewInsightsOutput,
} from "./prompt/templates/review-insights";
// T-086 文案审核门:L2 语义审模板 + L1 lint 纯函数。
export {
  SCRIPT_REVIEW_TEMPLATE,
  scriptReviewSchema,
  normalizeScriptReviewOutput,
  isCompleteRawScriptReview,
  type ScriptReviewOutput,
  DEFAULT_OFFICIAL_RULES,
} from "./prompt/templates/script-review";
export {
  lintScript,
  type LintRule,
  type LintFinding,
} from "./review/lint";
export {
  CALIBRATION_DIAGNOSE_TEMPLATE,
  diagnosisSchema,
  type DiagnosisOutput,
} from "./prompt/templates/calibration-diagnose";
// T-025b:positioning.generate / topic.enrich / material.match 三个 frontend runner 迁 runStructuredNode
// (跨模型健壮,让用户默认 MiniMax 也稳定吐可解析产物)所需的外置模板 + outputSchema,schema/type 一并导出。
export {
  POSITIONING_GENERATE_TEMPLATE,
  positioningSuggestionSchema,
  type PositioningSuggestionOutput,
} from "./prompt/templates/positioning-generate";
export {
  TOPIC_ENRICH_TEMPLATE,
  topicCardSchema,
  type TopicCardOutput,
} from "./prompt/templates/topic-enrich";
export {
  MATERIAL_MATCH_TEMPLATE,
  materialMatchSchema,
  type MaterialMatchOutput,
} from "./prompt/templates/material-match";
// T-062c 知识倾倒场:倒入原文 → 结构化归类候选 {knowledgeType,title,tags,summary}(确认门
// 采纳才 knowledge.create)。schema/type 一并导出给 frontend knowledge-classify-runner。
export {
  KNOWLEDGE_CLASSIFY_TEMPLATE,
  knowledgeClassifySchema,
  type KnowledgeClassifyOutput,
} from "./prompt/templates/knowledge-classify";
// T-079b 知识蒸馏:倒入原文 → 一批可独立引用的四原子知识候选 {atoms,suggestedTags}
// (蒸馏批量确认门采纳才逐条 knowledge.create)。schema/type 一并导出给 frontend
// knowledge-distill-runner。
export {
  KNOWLEDGE_DISTILL_TEMPLATE,
  knowledgeDistillSchema,
  knowledgeAtomSchema,
  type KnowledgeDistillOutput,
  type KnowledgeAtom,
} from "./prompt/templates/knowledge-distill";
// T-091 图谱 AI 建边:原子清单 → 候选语义边(确认门采纳才 relations.create,
// createdByType='ai')。schema/type 导出给 frontend knowledge-relate-runner。
export {
  KNOWLEDGE_RELATE_TEMPLATE,
  knowledgeRelateSchema,
  knowledgeRelateCandidateSchema,
  type KnowledgeRelateOutput,
  type KnowledgeRelateCandidate,
} from "./prompt/templates/knowledge-relate";
// T-092 评论回流蒸馏筛:评论批 → qa 原子候选(只留真疑问+同义合并;确认门采纳才落库)。
// schema/type 导出给 frontend comment-qa-sift-runner。
export {
  COMMENT_QA_SIFT_TEMPLATE,
  commentQaSiftSchema,
  commentQaCandidateSchema,
  type CommentQaSiftOutput,
  type CommentQaCandidate,
} from "./prompt/templates/comment-qa-sift";
export {
  runScriptNode,
  parseShots,
  // [T-387b] visual 归一纯函数 + 类型(backend script-runner 落 contentData.sections[].visual 用)。
  normalizeShotVisual,
  type ScriptShot,
  type ScriptShotVisual,
  type RunScriptNodeInput,
  type RunScriptNodeResult,
} from "./nodes/script-node";
export {
  runVoiceoverComposeNode,
  runStoryboardSegmentNode,
  SCRIPT_PIPELINE_MODEL_TIMEOUT_MS,
  type RunVoiceoverComposeNodeInput,
  type RunVoiceoverComposeNodeResult,
  type RunStoryboardSegmentNodeInput,
  type RunStoryboardSegmentNodeResult,
} from "./nodes/script-pipeline";
// 素材搜集节点 —— L2 创作向重写:generateObject 绑四类 outputSchema(钩子/案例/数据点/金句),
// schema 强约束让任何模型(MiniMax/Claude)都产可解析输出,根治旧版自由文本解析的卡死。
export {
  runResearchNode,
  researchFacets,
  normalizeResearchResult,
  type MaterialGrounding,
  flattenCategories,
  // [T-146d] 用户第一手资料要点 facet 组装 —— chat-runner/research-runner 装配后注入 research 综合。
  formatUserMaterialFacet,
  // [T-228] 搜索诚实门:伪引用检测 + model_memory 输出清洗(纯函数,调用方/单测可观测)。
  hasPseudoCitation,
  sanitizeModelMemoryCategories,
  MODEL_MEMORY_SOURCE_LABEL,
  type MaterialItem,
  type ResearchCategories,
  type RunResearchNodeInput,
  type RunResearchNodeResult,
} from "./nodes/research-node";
export {
  RESEARCH_GATHER_TEMPLATE,
  researchMaterialSchema,
  type ResearchMaterialOutput,
} from "./prompt/templates/research-gather";
// T-030-D4:作品初始化 auto-fill 重建 skill —— imported 作品逐字稿 + 真实指标 → { research, planning }
// 重建包(标 origin='reconstructed')。schema 定义在本包(有 zod);frontend runner 引它绑 generateObject。
export {
  RECONSTRUCT_PROJECT_TEMPLATE,
  reconstructProjectSchema,
  type ReconstructProjectOutput,
} from "./prompt/templates/reconstruct-project";
// 结构化模板节点 —— 每轮 schema 约束(generateObject 绑 Zod,校验失败自动重试,防发散)。
// B2 编导自动评分(calibration.score)用它产「维度真实分」候选。
export {
  runStructuredNode,
  extractJsonObject,
  type RunStructuredNodeInput,
  type RunStructuredNodeResult,
} from "./nodes/structured-node";
// B2 编导自动评分(calibration.score)外置模板 + 输出 schema —— 真实指标 → 维度真实分候选。
// schema 定义在本包(有 zod);frontend runner 引它绑 generateObject,无需直引 zod。
export {
  CALIBRATION_SCORE_TEMPLATE,
  calibrationScoreSchema,
  type CalibrationScoreOutput,
} from "./prompt/templates/calibration-score";
// [T-212c] 对标爆款拆解(benchmark.teardown)外置模板 + 输出 schema —— 爆款 + 定位 → 六段拆解 +
// 换角度转化选题。schema 定义在本包(有 zod);backend runner 引类型绑 generateObject,无需直引 zod。
export {
  BENCHMARK_TEARDOWN_TEMPLATE,
  benchmarkTeardownSchema,
  benchmarkTopicSchema,
  type BenchmarkTeardownOutput,
} from "./prompt/templates/benchmark-teardown";
export {
  INTELLIGENCE_TOPIC_DECOMPOSE_TEMPLATE,
  intelligenceTopicDecomposeSchema,
  normalizeIntelligenceTopicDecomposeOutput,
  type IntelligenceTopicDecomposeOutput,
} from "./prompt/templates/intelligence-topic-decompose";
export {
  INTELLIGENCE_TOPIC_FROM_DECOMPOSITION_TEMPLATE,
  intelligenceTopicFromDecompositionSchema,
  type IntelligenceTopicFromDecompositionOutput,
} from "./prompt/templates/intelligence-topic-from-decomposition";
export { INTELLIGENCE_TOPIC_ADAPTED_DRAFT_TEMPLATE } from "./prompt/templates/intelligence-topic-adapted-draft";
// [T-235b] 热点信源信号抽取(trend.extract)外置模板 + 输出 schema —— 信源页正文 → 结构化信号
// (无热度不编)。schema 定义在本包(有 zod);backend 采集器引类型,无需直引 zod。
export {
  TREND_EXTRACT_TEMPLATE,
  trendExtractSchema,
  trendSignalSchema,
  type TrendExtractOutput,
} from "./prompt/templates/trend-extract";
// [T-235d] 正向归因回流(topic.attribution)外置模板 + 输出 schema —— 已发布作品实绩+真逐字稿 →
// 选题维度枚举化归因 + 下一轮实验选题。schema 定义在本包(有 zod);backend runner 引类型绑
// generateObject,无需直引 zod。枚举常量一并导出(gate-F3,backend 落库/契约侧对齐同一真源)。
export {
  TOPIC_ATTRIBUTION_TEMPLATE,
  topicAttributionSchema,
  topicAttributionExperimentSchema,
  TOPIC_ATTRIBUTION_TOPIC_TYPES,
  TOPIC_ATTRIBUTION_HOOK_TYPES,
  TOPIC_ATTRIBUTION_STRUCTURE_FORMULAS,
  type TopicAttributionOutput,
} from "./prompt/templates/topic-attribution";
// [T-235d-distill] 收藏夹作品判库(favorites.triage)外置模板 + 输出 schema —— 他人收藏逐字稿 →
// 是否值得进知识库裁决(knowledge/topic/skip,先判库再落)。schema 定义在本包(有 zod);backend
// favorites-distill-runner 引类型绑 generateObject。
export {
  FAVORITES_TRIAGE_TEMPLATE,
  favoritesTriageSchema,
  type FavoritesTriageOutput,
} from "./prompt/templates/favorites-triage";
// [T-254b] 制作视频四决策(video.scenes/cards/broll/subtitles)外置模板 + 输出 schema ——
// SRT+口播稿(+素材清单投影)→ 分场/信息卡/B-roll/双语字幕结构化决策 JSON(零代码生成)。
// schema 定义在本包(有 zod);backend video-decisions-runner 引 schema 组动态 refine
// (边界落 SRT 行 start 集合 / assetId 必须在清单内 / 行数不变)作 outputSchema 逃生口。
export {
  VIDEO_SCENES_TEMPLATE,
  VIDEO_CARDS_TEMPLATE,
  VIDEO_BROLL_TEMPLATE,
  VIDEO_SUBTITLES_TEMPLATE,
  VIDEO_DIRECTOR_TEMPLATE,
  videoScenesSchema,
  videoSceneSchema,
  videoCardsSchema,
  videoCardSchema,
  videoCardVisualPlanSchema,
  videoCardSceneGraphSchema,
  normalizeVideoCardsOutput,
  videoBrollSchema,
  videoBrollPickSchema,
  videoBrollSlotSchema,
  normalizeVideoBrollOutput,
  videoSubtitlesSchema,
  videoSubtitleLineSchema,
  videoDirectorReviewSchema,
  videoDirectorIssueSchema,
  VIDEO_CARD_KINDS,
  VIDEO_CARD_MOTIONS,
  VIDEO_CARD_VISUAL_RELATIONS,
  VIDEO_CARD_VISUAL_ROLES,
  VIDEO_SCENE_LAYOUTS,
  VIDEO_SCENE_ENTITY_KINDS,
  VIDEO_SCENE_GLYPHS,
  VIDEO_SCENE_BEAT_ACTIONS,
  VIDEO_BROLL_PURPOSES,
  VIDEO_DIRECTOR_ISSUE_CODES,
  type VideoCardKind,
  type VideoCardMotion,
  type VideoCardVisualPlan,
  type VideoCardVisualRelation,
  type VideoCardVisualRole,
  type VideoCardSceneGraph,
  type VideoBrollPurpose,
  type VideoDirectorIssueCode,
  type VideoScenesOutput,
  type VideoCardsOutput,
  type VideoBrollOutput,
  type VideoDirectorReviewOutput,
  type VideoSubtitlesOutput,
} from "./prompt/templates/video-decisions";
// [T-212d] 防茧房校准(topic.preference)外置模板 + 输出 schema —— 淘汰原因批 → 结构化偏好信号。
// schema 定义在本包(有 zod);backend runner 引类型绑 generateObject,无需直引 zod。
export {
  TOPIC_PREFERENCE_DISTILL_TEMPLATE,
  topicPreferenceDistillSchema,
  topicPreferenceSchema,
  type TopicPreferenceDistillOutput,
  type TopicPreferenceItem,
} from "./prompt/templates/topic-preference-distill";
// ChatBox 每轮输出契约脊梁(SPEC §4.2)—— 两段 { reply, candidates[], nextActions[] } + 工具白名单。
export {
  CHATBOX_TOPIC_TEMPLATE,
  chatboxTurnSchema,
  type ChatboxTurnOutput,
} from "./prompt/templates/chatbox-turn";
export {
  CREATOROS_GUIDE_TEMPLATE,
  CREATOROS_GUIDE_VERIFIED_AT,
} from "./prompt/templates/creatoros-guide";
// ChatBox 各 surface(校准/定位/复盘)对话化 skill(T-004 slice 2)—— 同两段 { reply, ...特定结构 }。
export {
  CHATBOX_CALIBRATION_TEMPLATE,
  chatboxCalibrationSchema,
  type ChatboxCalibrationOutput,
  CHATBOX_POSITIONING_TEMPLATE,
  chatboxPositioningSchema,
  type ChatboxPositioningOutput,
  CHATBOX_REVIEW_TEMPLATE,
  chatboxReviewSchema,
  type ChatboxReviewOutput,
  // T-094 蒸馏对话面(倾倒场 Copilot 化):reply + nextActions,原子候选走 knowledge.distill 工具卡。
  CHATBOX_DISTILL_TEMPLATE,
  chatboxDistillSchema,
  type ChatboxDistillOutput,
} from "./prompt/templates/chatbox-surfaces";

export {buildScriptFallbackResult,type ScriptFallbackInput,type ScriptFallbackResult} from "./execution/script-fallback";

export {projectPlanningThesis,planningThesisOutputSchema,planningThesisGroundingSchema} from "./execution/planning-thesis-output";

export { topicFacets, normalizeTopics } from "./nodes/topic-node";
export { topicArraySchema } from "./prompt/templates/topic-generate";
export { renderSignalQualityBrief, type SignalQualityProfile } from "./nodes/topic-signal-quality";

export {buildTrendQuery,formatTrendBrief,formatTrendSourceBrief} from "./nodes/topic-trend-context";

export {topicGenerateFrozenSchema,dailyTopicInputSchema,type TopicGenerateFrozen} from "./execution/topic-worker-input";

export {COPILOT_ASSIST_TEMPLATE,copilotReplySchema,copilotReplyInputSchema} from "./prompt/templates/copilot-assist";

export {AsrExecutionInterruption,isAsrExecutionControlError,throwIfAsrAborted,type AsrRequest,type ExecuteAsrRequest} from "./runtime/asr-request";
export {createDurableAsrRequestExecutor,type DurableAsrPorts} from "./execution/durable-asr-request";

export {
  createTranscribeAudioExtractor,
  streamAudioFromVideo,
  TranscribeAudioExtractError,
  type StreamAudioDeps,
  type SpawnedAudioProcess,
} from "./runtime/transcribe-audio-extract";

export {
  localWhisperSpec,
  LocalWhisperTranscribeError,
  transcribeWithLocalFallback,
  type TranscribeExecutionMode,
  type TranscribeWithFallbackResult,
  type LocalWhisperFailureCode,
} from "./runtime/transcribe-local-fallback";

export {runTranscribeAsrInWorker} from './execution/transcribe-asr-run';

export * from './prompt/templates/asset-processing';
export {flywheelOutputSchema,flywheelKnowledgeResultSchema} from './runtime/flywheel-output';

export {runAssetAsrInWorker} from './execution/asset-asr-worker-run';

export {MOMENTS_COMPOSE_TEMPLATE} from "./prompt/moments-compose";
