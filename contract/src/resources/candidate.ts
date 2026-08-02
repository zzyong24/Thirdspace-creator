import { z } from "zod";
import {
  id,
  iso8601,
  contentRole,
  candidateSource,
  candidateStatus,
  audienceSignalSource,
} from "../primitives";

// 七步整合设计 §5 — 选题情报层 (Candidate + AudienceSignal + TopicPromotion).

// [T-284a] 复刻补链 G1 —— 原爆款拆解要素引用(他号作品 AI 拆解的 5 段可迁移要素,不含转化选题)。
// benchmarkTeardownSchema(ai-worker)6 段里,「转化选题」本身已是候选,这里只留其余 5 段作复刻参照。
// 全字段 optional(拆解偶缺某段也合法)。语义=AI 分析(非原文保真),故只挂候选 card + 立项 briefDetail,
// 不进 knowledge 库(避免污染本账号资产)。
export const benchmarkTeardownRef = z.object({
  钩子拆解: z.string().optional(), // 前3秒/开头怎么抓人
  结构拆解: z.string().optional(), // 内容结构/节奏编排
  为什么爆: z.string().optional(), // 爆的底层原因(需求/情绪/信息增量)
  可借鉴点: z.array(z.string()).optional(), // 可迁移的要素清单
  适配本账号建议: z.string().optional(), // 结合本账号定位怎么改造
});
export type BenchmarkTeardownRef = z.infer<typeof benchmarkTeardownRef>;

// [T-482] 内容雷达 → 选题的来源证据。链接属于选题卡结构化 provenance，不拼进标题/
// angle；这样候选池、详情和后续 Project 都能安全读取并渲染真实外链。
export const candidateSourceReference = z.object({
  kind: z.enum(["original_video", "source_page"]),
  platform: z.string().min(1),
  label: z.string().min(1),
  url: z.string().url(),
  intelligenceItemId: id.optional(),
});
export type CandidateSourceReference = z.infer<
  typeof candidateSourceReference
>;

// [T-642] 内容雷达的两层创作依据。sourceDecomposition 是来源作品的只读拆解证据；
// adaptationStrategy 是用户在转选题时确认的“保留/替换/新增/避开”改写策略。二者与
// 选题卡分开存放，避免把原作品的表达误当成本账号的最终选题字段。
export const sourceDecomposition = z.object({
  hook: z.string().min(1),
  structureSteps: z.array(z.string().min(1)).min(2).max(8),
  coreClaims: z.array(z.string().min(1)).min(1).max(8),
  reusablePattern: z.string().min(1),
  factRisks: z.array(z.string().min(1)).max(12).default([]),
});
export type SourceDecomposition = z.infer<typeof sourceDecomposition>;

export const adaptationStrategy = z.object({
  keep: z.array(z.string().min(1)).max(8).default([]),
  replace: z.array(z.string().min(1)).max(8).default([]),
  add: z.array(z.string().min(1)).max(8).default([]),
  avoid: z.array(z.string().min(1)).max(8).default([]),
});
export type AdaptationStrategy = z.infer<typeof adaptationStrategy>;

export const adaptedDraftCandidate = z.object({
  contentText: z.string().min(1).max(50_000),
  generatedFromTranscriptHash: z.string().min(1),
  strategyHash: z.string().min(1),
  templateVersion: z.string().min(1),
});
export type AdaptedDraftCandidate = z.infer<typeof adaptedDraftCandidate>;

// 选题卡 (topic.enrich, 选题中心大改) — the AI-filled 详情 (一句话/观众/痛点/冲突/Hook/
// 结构/形式/素材/风险/建议) + 指标 (受众痛感/素材充足/制作难度) a candidate carries once a
// topic.enrich task formalizes it. EVERY field is optional/default so a bare `{}` is a
// valid card (待评估), and the editable patch only sets the fields the user touches.
export const candidateCard = z.object({
  // 详情
  oneLiner: z.string().optional(), // 一句话选题
  targetAudience: z.string().optional(), // 目标观众
  audiencePain: z.string().optional(), // 观众痛点
  coreConflict: z.string().optional(), // 核心冲突
  hook: z.string().optional(), // 推荐开头 Hook
  contentStructure: z.array(z.string()).default([]), // 推荐内容结构
  format: z.string().optional(), // 适合形式
  materialBasis: z.string().optional(), // 素材依据
  riskNote: z.string().optional(), // 风险点
  proposal: z.string().optional(), // 立项建议
  // 指标 (0–100 or null — honest "unknown"; 制作难度 is a 3-band enum)
  audiencePainScore: z.number().int().min(0).max(100).nullable().default(null),
  materialScore: z.number().int().min(0).max(100).nullable().default(null),
  productionDifficulty: z.enum(["low", "mid", "high"]).nullable().default(null),
  // [T-235d] 溯源(additive)—— 实验候选(正向归因回流的 next_experiments 进池)绑定它的
  // 归因行 id(soft ref → topic_attributions.id;UI「实验」徽标点开看归因依据)。非实验候选缺省。
  attributionId: id.optional(),
  // [T-284a] 复刻补链 G1(additive)—— benchmark 拆解转化选题携带的**原爆款拆解要素**(他号作品的
  //   AI 拆解 5 段:钩子/结构/为什么爆/可借鉴点/适配本账号建议;不含「转化选题」它本身就是候选)。
  //   benchmark-teardown-runner 建候选后 patch 挂上,立项时复制进 project.briefDetail.benchmarkRef,
  //   creative-context 装配成「对标参照·复刻用」段回流写稿(诚实门:仅结构参照,禁照搬原文案)。
  //   非 benchmark 候选缺省。零新表(复用 candidate.card jsonb)。
  teardown: benchmarkTeardownRef.optional(),
  // [T-482] 原视频/原页面的可点击来源。普通手动选题可无；内容雷达确认的选题必须至少带
  // 一条 original_video。max(10) 防止 card 被无界外链灌大。
  sourceReferences: z.array(candidateSourceReference).max(10).optional(),
  sourceDecomposition: sourceDecomposition.optional(),
  adaptationStrategy: adaptationStrategy.optional(),
  adaptedDraft: adaptedDraftCandidate.optional(),
});
export type CandidateCard = z.infer<typeof candidateCard>;

// Candidate — Project 之上的轻量选题. AI-sourced go via §C-3 confirm flow.
export const candidateResource = z.object({
  id,
  userId: id,
  title: z.string(),
  angle: z.string(),
  source: candidateSource,
  contentRole: contentRole.nullable(),
  productAnchorId: id.nullable(),
  positioningFit: z.number().int().nullable(),
  predictedScore: z.number().int().nullable(),
  demandCount: z.number().int(),
  status: candidateStatus,
  aiTaskId: id.nullable(),
  // 选题卡 — `{}` parses to all-default (待评估). Defaults are applied so a row with a
  // partially-filled card still validates against the full shape.
  card: candidateCard,
  createdAt: iso8601,
  updatedAt: iso8601,
});
export type CandidateResource = z.infer<typeof candidateResource>;

// AudienceSignal — 受众信号. Writes go through Ingestion (§C-4).
export const audienceSignalResource = z.object({
  id,
  userId: id,
  source: audienceSignalSource,
  rawText: z.string(),
  demandTag: z.string().nullable(),
  payingIntent: z.string().nullable(),
  linkedCandidateId: id.nullable(),
  ingestionRunId: id.nullable(),
  // 评论按作品可读 (T-030 §4.2 / D6, 迁移 0011) — the imported publication this signal is
  // tied to, backfilled at ingest from the capture's aweme_id. NULLABLE: 存量评论无 aweme_id
  // 锚,无法回填 (F3);非评论信号也留空。
  publicationId: id.nullable(),
  // 评论点赞数 —— 热榜排序依据 (T-042, 迁移 0014). 采集时抓 digg_count 带进来;NULLABLE:
  // 存量评论(0014 前入库)无点赞值,非评论信号(dm/consultation/review)也留空。
  likeCount: z.number().int().nullable(),
  // 评论粒度幂等锚 (T-065 采集层建, T-092 回流层读) —— 形如 `douyin:comment:<cid>`。
  // 回流知识库时写进 qa 原子的 sourceMetadata.signalExternalIds 作双料锚(溯源+幂等)。
  // additive:default(null) 让旧 transport/测试构造的行照常过 parse;NULLABLE:存量
  // 评论与非评论信号无锚。
  externalId: z.string().nullable().default(null),
  createdAt: iso8601,
});
export type AudienceSignalResource = z.infer<typeof audienceSignalResource>;

// TopicPromotion — Candidate → Project promotion record.
export const topicPromotionResource = z.object({
  id,
  userId: id,
  candidateId: id,
  projectId: id,
  promotedAt: iso8601,
});
export type TopicPromotionResource = z.infer<typeof topicPromotionResource>;

// 选题中心总览 (topics.overview, 选题中心大改) — a read-only DTO the 选题中心 page renders.
// Every count is DERIVED from real rows at read time (no stored 总览 table, no new
// status column); a source with no backing data reports 0 (never fabricated).
export const topicsOverviewResource = z.object({
  // 出题依据 — the four bases a topic.generate run can stand on (one-line label +
  // the real signal counts feeding each).
  basis: z.object({
    positioningLabel: z.string(), // 定位领域一句 ("" when 未设定)
    commentSignals: z.number().int(), // audience_signals 总数
    knowledgeCards: z.number().int(), // knowledge 条数
    highPerformers: z.number().int(), // 高表现作品数 (历史爆款)
  }),
  // 选题来源 — the 7 intake channels with their real counts (0 when no data source).
  sources: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      count: z.number().int(),
    }),
  ),
  // 选题漏斗 — 6 states DERIVED from real rows (audience_signals / candidates / card /
  // topic_promotions / learnings). NOT a status column on candidates (C-3 intact).
  funnel: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      count: z.number().int(),
    }),
  ),
});
export type TopicsOverviewResource = z.infer<typeof topicsOverviewResource>;
