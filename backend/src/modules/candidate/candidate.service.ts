import { createTopicWorkspaceService, type TopicWorkspaceDeps } from "./topic-workspace.service";
import type { RequestContext } from "@creatoros/contract";
import {and,eq,gte,lt,sql,type Db} from "@creatoros/backend";
import {candidates} from "./candidate.db-schema";
import {
  createCandidateRepository,
  type CandidateRepository,
  type RepoDeps,
  type CandidateSort,
} from "./candidate.repository";
import {
  toCandidateDto,
  toAudienceSignalDto,
  toTopicPromotionDto,
  toCardDto,
  pickCardFields,
  type CandidateResource,
  type AudienceSignalResource,
  type TopicPromotionResource,
  type TopicsOverviewResource,
} from "./candidate.schema";
import {
  CandidateTitleError,
  PromoteStateError,
  DanglingRunError,
  requireAccountId,
} from "./candidate.errors";
// [T-212d] 防茧房校准护栏(纯函数):±10 封顶 / ≥3 例升级 / 8 周衰减 / 探索位。
import {
  clampPreferenceWeight,
  isHardPreference,
  computePreferenceAdjustment,
  rankWithExploration,
  PREFERENCE_DECAY_WEEKS,
  type ActivePreference,
  type ScoredCandidate,
} from "./topic-preference-guardrail";
import type { TopicPreferenceRow } from "./candidate.repository";

const CANDIDATE_TITLE_MAX_CHARS = 120;
const STRUCTURED_FIELD_IN_CANDIDATE_TITLE =
  /(?:^|[{"',;])\s*\\?["']?(?:angle|contentRole|source|predictedScore|reason|sourceComments)\\?["']?\s*:/i;

/**
 * [T-472] 落库域最后一道 invariant。上游模型 schema 会拒绝并重试，但手动确认门、
 * 定时采集或旧客户端都可能绕过它；领域服务因此再次拒绝污染值，绝不靠前端隐藏/截断。
 */
function assertCandidateTitle(title: string): void {
  const value = title.trim();
  if (
    !value ||
    value.length > CANDIDATE_TITLE_MAX_CHARS ||
    value.includes("```") ||
    STRUCTURED_FIELD_IN_CANDIDATE_TITLE.test(value)
  ) {
    throw new CandidateTitleError(
      `选题标题无效：不能为空、不能混入结构化字段，且不能超过 ${CANDIDATE_TITLE_MAX_CHARS} 字`,
    );
  }
}

// Candidate service (foundation §5.3) — every public method takes
// `(ctx: RequestContext, …)` and builds a repository bound to `ctx.userId`
// (createCandidateRepository(db, { now, nextId, userId: ctx.userId })) so scoping is
// structural. The service owns the lightweight Candidate pool (pool/promoted/
// dropped), the AudienceSignal → demand_count aggregation, and Candidate → promote →
// Project (类比 promoteReviewInsight). It is the only entry other modules import (via
// index.ts), and exposes `createFromAIResult` for the AI confirm formalize (C-3) and
// `ingestAudienceSignal` for the Ingestion intake (C-4).
//
// Peers are reached ONLY through injected narrow PORTS (mirrors positioning/
// monetization) — no cross-module repository import (SPEC §22):
//   - projects (HARD dep): createProject for promote → Project (Research-stage seed).
//   - positioning (SOFT dep): a nullable gate port — fit=null when Positioning is not
//     yet wired; the page renders the Candidate ungated.
//   - ingestion: a run-existence port for the C-4 / RISK-005 dangling-run guard.
//
// C-3: createFromAIResult ONLY persists a formalized AITaskResult into a candidates
// row (source∈{trend,benchmark,demand}, aiTaskId set). It NEVER sets/tracks
// awaiting/confirmed on candidates (that machine lives on the AITask). Re-calling
// with the same aiTaskId is idempotent (no duplicate Candidate).

export interface CandidateProjectsPort {
  // Ownership-stamped project create for promote → Project. 立项 Brief 地基:新建项目
  // 从 brief 阶段起(ProjectsService 内部设 current_stage=brief),promote 额外带一份用
  // 候选填好的结构化 Brief 草稿(briefDetail),落到立项工作台供创作者核对/补全。
  // Returns at least the new project id.
  createProject(
    ctx: RequestContext,
    cmd: {
      title: string;
      brief?: string;
      briefDetail?: {
        targetAudience?: string;
        contentGoal?: string;
        contentFormat?: string;
        targetPlatforms?: string[];
        durationEstimate?: string;
        coreMessage?: string;
        successCriteria?: string;
        // [T-284a] 复刻补链 G1 —— benchmark 转化候选立项时携带的原爆款拆解要素(复刻参照)。
        benchmarkRef?: {
          钩子拆解?: string;
          结构拆解?: string;
          为什么爆?: string;
          可借鉴点?: string[];
          适配本账号建议?: string;
        };
        contentRadarEvidence?: {
          sourceReferences: NonNullable<CandidateResource["card"]["sourceReferences"]>;
          decomposition: NonNullable<CandidateResource["card"]["sourceDecomposition"]>;
          strategy: NonNullable<CandidateResource["card"]["adaptationStrategy"]>;
          adaptedDraftSeed: NonNullable<CandidateResource["card"]["adaptedDraft"]>;
        };
      };
      contentType?: string;
      creationMode?: string;
      targetPlatforms?: string[];
    },
  ): Promise<{ id: string }>;
}

export interface CandidatePositioningPort {
  // Deterministic advisory 0–100 fit for a candidate subject (SOFT dep). Returns
  // `null` when the gate cannot score (e.g. the user has no positioning statement
  // yet) so the Candidate renders ungated — the module is NOT blocked by module 17.
  // The port itself is also OPTIONAL on ServiceDeps (absent ⇒ fit:null). Pure of
  // Date.now/Math.random (C-5).
  evaluateFit(
    ctx: RequestContext,
    subject: {
      title: string;
      angle: string;
      contentRole?: string | null;
      productAnchorId?: string | null;
    },
  ): Promise<number | null>;
}

export interface CandidateIngestionPort {
  // RISK-005 — the run must be a REAL IngestionRun (cross-user / unknown →
  // OwnershipError). Asserted BEFORE any audience_signals row references the runId.
  assertRunExists(ctx: RequestContext, runId: string): Promise<void>;
}

// 选题中心总览 — the cross-module read-only aggregates topics.overview surfaces that the
// candidate module cannot compute from its OWN tables (定位 / 知识库 / 历史爆款 / 复盘回流).
// OPTIONAL (SOFT dep): an absent port (or any rejecting call) degrades to "" / 0 — the
// overview NEVER fabricates a number for a data source that isn't wired. Each method is
// bound at the composition root to a peer's PUBLIC service (no cross-module repo import).
export interface CandidateOverviewPort {
  positioningLabel(ctx: RequestContext): Promise<string>; // 定位领域一句 ("" when 未设定)
  knowledgeCount(ctx: RequestContext): Promise<number>; // knowledge 条数
  highPerformerCount(ctx: RequestContext): Promise<number>; // 历史爆款 (高表现作品)
  learningsCount(ctx: RequestContext): Promise<number>; // 复盘回流经验条数
}

export interface ServiceDeps {
  topicWorkspace?: Pick<TopicWorkspaceDeps,"assertProject"|"currentPositioningVersion">;
  db: Db;
  now: () => string;
  nextId: (prefix: string) => string;
  projects: CandidateProjectsPort;
  positioning?: CandidatePositioningPort;
  ingestion: CandidateIngestionPort;
  // SOFT dep — the cross-module aggregates for topics.overview's 出题依据 + 历史爆款/复盘
  // sources. Absent ⇒ those numbers report 0 / "" (honest, never fabricated).
  overview?: CandidateOverviewPort;
  // [T-212d] 防茧房校准触发点(OPTIONAL fire-and-forget)—— 用户淘汰选题写原因后,后台跑淘汰原因
  // 蒸馏(runTopicPreferenceDistill)。绑在 composition root(persistence-client);缺省(测试/未接线)
  // 则淘汰仍正常落原因、只是不即时蒸馏。service 不 import ai-runtime(仅回调,保层级)。
  dispatchPreferenceDistill?: (ctx: RequestContext) => void;
}

export interface CreateCandidateInput {
  title: string;
  angle?: string;
  // 人确认门的来源标注:默认 idea(手动新建);对话内 AI 出题(topic.generate)无 ai_task、
  // 只能落这条门,采纳时透传其真实 AI 渠道(trend|benchmark|demand)保住 provenance(T-149)。
  // [T-235c] favorites:指定收藏夹采集进池的跟拍候选(collector 直调,非 AI 渠道)。
  source?: "trend" | "benchmark" | "demand" | "idea" | "favorites";
  contentRole?: "traffic" | "trust" | "conversion" | null;
  productAnchorId?: string | null;
  // [T-303] 预测分(0–100)。每日出题器已算出 adjustedScore,经此落库(原来被丢弃 → 热度死列)。
  //   缺省 null(手动新建无预测,诚实空 → 读端兜底 positioningFit)。
  predictedScore?: number | null;
  // [T-482] intelligence 确认选题时透传的原视频/原页面来源。内部 service seam，
  // 公共手动 candidates.create 不开放任意来源注入。
  sourceReferences?: CandidateResource["card"]["sourceReferences"];
  // [T-546] 内容雷达已经生成的结构化候选必须与 Candidate 同次落库，避免先建空卡、
  // 再 patch 失败后在选题中心只剩标题和来源。公共 candidates.create 仍不开放此字段。
  card?: Partial<CandidateResource["card"]>;
}

export interface PatchCandidateInput {
  title?: string;
  angle?: string;
  contentRole?: "traffic" | "trust" | "conversion" | null;
  productAnchorId?: string | null;
  status?: "pool" | "dropped";
  // 选题卡可编辑 — a partial 选题卡 patch, shallow-merged over the stored card.
  card?: Record<string, unknown>;
  // [T-212d] 淘汰原因(status→dropped 时随手写一句)—— 蒸馏「该创作者偏好」信号的原料。
  dropReason?: string | null;
}

// [T-212d] 偏好信号 upsert 入参(service 边界)。weight 可选:缺省由 exampleCount 派生并 ±10 封顶。
export interface UpsertTopicPreferenceInput {
  keyword: string;
  direction: "avoid" | "prefer";
  signal: string;
  exampleCount: number;
  weight?: number;
}

// [T-212d] 护栏后的选题排序结果:候选 DTO + 偏好调整量 + 注入后分(供选题推荐/排序消费)。
export type RankedTopicResource = CandidateResource & {
  baseScore: number; // 偏好前(positioningFit,null→0)
  preferenceAdjustment: number; // 护栏后偏好调整量(±10 封顶)
  adjustedScore: number; // 注入后分(0–100)
};

export interface RankTopicsQuery {
  limit: number;
  // 护栏④ 探索位数(缺省 2):保留给「被偏好压制但本身不差」的候选,防茧房。
  explorationSlots?: number;
}

export interface ListCandidatesQuery {
  status?: string;
  source?: string;
  sort?: CandidateSort;
  createdAfter?: string;
  limit: number;
  offset: number;
}

export interface ListSignalsQuery {
  source?: string;
  demandTag?: string;
  linkedCandidateId?: string;
  limit: number;
  offset: number;
}

// The AI confirm formalize input (C-3). resultType pins to a Candidate result; the
// AITask owns the awaiting/confirmed machine — this is the AI-free formalize callee.
export interface CandidateAIResult {
  aiTaskId: string;
  resultType: "candidate";
  resultData: {
    title: string;
    angle?: string;
    source: "trend" | "benchmark" | "demand";
    contentRole?: "traffic" | "trust" | "conversion" | null;
    productAnchorId?: string | null;
    predictedScore?: number | null;
    card?: Partial<CandidateResource["card"]>;
  };
}

// An Ingestion intake record (typed shape; Ingestion hands opaque records validated
// by candidate.schema's parseAudienceSignalRecord at the transport/adapter edge).
export interface IngestSignalInput {
  source: string; // comment|dm|consultation|review
  rawText: string;
  demandTag?: string | null;
  payingIntent?: string | null;
  linkedCandidateRef?: string | null;
  // 评论按作品可读 (T-030 D6) — the imported publication this comment belongs to,
  // resolved at the ingest edge from the capture's aweme_id (→ publications where
  // externalId=aweme_id). 无匹配作品 → 留空,不报错 (F3 边界)。
  publicationId?: string | null;
  // 评论点赞数 —— 热榜排序依据 (T-042). 采集时从 digg_count 带进来;非评论/无值 → null。
  likeCount?: number | null;
  // 评论粒度幂等锚 (T-065) — `douyin:comment:<cid>`。带锚重复写命中唯一索引 → 跳过
  // (返回已存在信号,inserted=false),同一评论跨采集 run 不再重复入库。
  externalId?: string | null;
}

export interface CandidateService {
  getTopicWorkspace: ReturnType<typeof createTopicWorkspaceService>["get"];
  saveTopicWorkspace: ReturnType<typeof createTopicWorkspaceService>["save"];
  getTopicRecommendationContext: ReturnType<typeof createTopicWorkspaceService>["recommendationContext"];
  saveTopicProposalFeedback: ReturnType<typeof createTopicWorkspaceService>["feedback"];
  listCandidates(
    ctx: RequestContext,
    query: ListCandidatesQuery,
  ): Promise<{ rows: CandidateResource[]; total: number }>;
  createCandidate(
    ctx: RequestContext,
    input: CreateCandidateInput,
  ): Promise<CandidateResource>;
  getCandidate(
    ctx: RequestContext,
    candidateId: string,
  ): Promise<CandidateResource>;
  patchCandidate(
    ctx: RequestContext,
    candidateId: string,
    patch: PatchCandidateInput,
  ): Promise<CandidateResource>;
  // Candidate → Project (类比 promoteReviewInsight). Replays return the same promotion.
  promote(
    ctx: RequestContext,
    candidateId: string,
  ): Promise<TopicPromotionResource>;

  // C-3 formalize seam — called by the AI module's confirmResult (AI-free). NOT a
  // contract op. Idempotent on aiTaskId.
  createFromAIResult(
    ctx: RequestContext,
    result: CandidateAIResult,
  ): Promise<CandidateResource>;

  // 选题卡 enrich seam (topic.enrich confirm) — called by the AI module's confirmTask
  // `topic_card` branch (AI-free). NOT a contract op. Cleans the AI-filled card into
  // the full contract shape and REPLACES the candidate's stored card. Ownership-gated.
  enrichCard(
    ctx: RequestContext,
    candidateId: string,
    card: Record<string, unknown>,
  ): Promise<CandidateResource>;

  // C-4 intake seam — called by the Ingestion module per record. NOT a contract op.
  // Requires ctx.ingestionRunId; rejects 悬空 runId (RISK-005); bumps demandCount.
  // 返回信号资源 + inserted(false=命中评论幂等锚 external_id,未新写行,T-065)。
  ingestAudienceSignal(
    ctx: RequestContext,
    record: IngestSignalInput,
  ): Promise<AudienceSignalResource & { inserted: boolean }>;

  // 选题中心总览 (topics.overview) — 出题依据 + 7 来源 + 6 态漏斗, every count DERIVED
  // from real rows at read time (candidate-module counts + the SOFT overview port for
  // cross-module aggregates). No stored 总览 table, no new status column.
  getTopicsOverview(ctx: RequestContext): Promise<TopicsOverviewResource>;

  listSignals(
    ctx: RequestContext,
    query: ListSignalsQuery,
  ): Promise<{ rows: AudienceSignalResource[]; total: number }>;
  // 复盘每作品评论 (T-030 §4.2/§10, D6) — user-scoped comment signals for one publication
  // (source='comment' AND publication_id=?), newest first, capped at `limit` (默认 100).
  // The 复盘页评论区 read; write side rides Ingestion (C-4) which backfills publication_id.
  listCommentsForPublication(
    ctx: RequestContext,
    publicationId: string,
    limit: number,
  ): Promise<AudienceSignalResource[]>;
  // "评论/客户问题一键转 Candidate" (spec §5.5). Omit candidateId → spawn a new
  // demand Candidate from the signal, then link; bumps demandCount.
  linkSignalToCandidate(
    ctx: RequestContext,
    signalId: string,
    candidateId: string | undefined,
  ): Promise<CandidateResource>;

  // ── [T-212d] 防茧房校准 ──────────────────────────────────────────────────
  // 全部淘汰候选写过的原因(非空)—— 蒸馏偏好信号的原料。NOT a contract op(蒸馏 runner 消费)。
  listDropReasons(ctx: RequestContext): Promise<string[]>;
  // upsert 一条偏好信号。**护栏在此强制**:weight ±10 封顶(护栏①);exampleCount<3 → status
  // 'candidate'(不注入评分),≥3 → 'active' 硬偏好(护栏②)。NOT a contract op(蒸馏 runner 消费)。
  upsertTopicPreference(
    ctx: RequestContext,
    input: UpsertTopicPreferenceInput,
  ): Promise<TopicPreferenceRow>;
  // 已升级(active)的硬偏好 —— 校准中心/调试可读。NOT a contract op(内部 seam)。
  listActiveTopicPreferences(
    ctx: RequestContext,
  ): Promise<TopicPreferenceRow[]>;
  // 选题评分前置注入 + 排序:读 pool 候选 + active 硬偏好 → 每候选算偏好调整量(护栏①③)→
  // 按注入后分排序、保留探索位(护栏④)。读前先归档过期偏好(护栏③)。NOT a contract op(内部 seam)。
  rankTopicsWithGuardrails(
    ctx: RequestContext,
    query: RankTopicsQuery,
  ): Promise<RankedTopicResource[]>;
}

export function createCandidateService(deps: ServiceDeps): CandidateService {
  const { db, now, nextId, projects, positioning, ingestion, overview } = deps;
  const dispatchPreferenceDistill = deps.dispatchPreferenceDistill;

  function repoFor(ctx: RequestContext, op: string): CandidateRepository {
    const repoDeps: RepoDeps = {
      now,
      nextId,
      userId: ctx.userId,
      // [T-332 S2] 未选号 = 引导态,创作域禁读写(SPEC §4.2)—— 读写同门,
      // ctx.accountId 缺失直接抛 AccountRequiredError,不存在「null = 全局视图」退化。
      accountId: requireAccountId(ctx.accountId, op),
    };
    return createCandidateRepository(db, repoDeps);
  }

  async function fitFor(
    ctx: RequestContext,
    subject: {
      title: string;
      angle: string;
      contentRole?: string | null;
      productAnchorId?: string | null;
    },
  ): Promise<number | null> {
    if (!positioning) return null; // SOFT dep — gate skipped, candidate ungated.
    return positioning.evaluateFit(ctx, subject);
  }

  // [T-216] 防茧房护栏排序(rankTopicsWithGuardrails 的实体)—— 抽成闭包函数,让 listCandidates
  // 的 sort=guardrail 路径与公开的 rankTopicsWithGuardrails 方法共用同一份逻辑(单一真源)。
  async function rankGuardrail(
    ctx: RequestContext,
    query: RankTopicsQuery,
    listFilter?: Pick<
      ListCandidatesQuery,
      "status" | "source" | "createdAfter" | "offset"
    >,
  ): Promise<{ rows: RankedTopicResource[]; total: number }> {
    const repo = repoFor(ctx, "candidate.rankTopicsWithGuardrails");
    // 护栏③:读前先归档过期偏好(lastReinforcedAt 早于 now-8周)——过期偏好不再注入评分。
    const cutoff = new Date(
      Date.parse(now()) - PREFERENCE_DECAY_WEEKS * 7 * 24 * 60 * 60 * 1000,
    ).toISOString();
    try {
      await repo.archiveExpiredPreferences(cutoff);
    } catch {
      // 归档 best-effort:失败不阻塞排序(读时 computePreferenceAdjustment 仍按龄衰减为 0 兜底)。
    }
    const prefRows = await repo.listActiveTopicPreferences();
    const preferences: ActivePreference[] = prefRows.map((p) => ({
      keyword: p.keyword,
      direction: p.direction === "prefer" ? "prefer" : "avoid",
      weight: p.weight,
      exampleCount: p.exampleCount,
      lastReinforcedAt: p.lastReinforcedAt,
    }));

    // 池内候选(待评估/待补充)。量级百条内,一次读全再算。
    const { rows, total } = await repo.listCandidates({
      status: listFilter?.status ?? "pool",
      source: listFilter?.source,
      createdAfter: listFilter?.createdAfter,
      limit: 1000,
      offset: 0,
    });
    const nowIso = now();
    const dtoById = new Map<string, CandidateResource>();
    const scored: ScoredCandidate[] = rows.map((row) => {
      const dto = toCandidateDto(row);
      dtoById.set(dto.id, dto);
      const baseScore = dto.positioningFit ?? 0;
      const adjustment = computePreferenceAdjustment(
        `${dto.title} ${dto.angle}`,
        preferences,
        nowIso,
      );
      const adjustedScore = Math.max(0, Math.min(100, baseScore + adjustment));
      return { id: dto.id, baseScore, adjustedScore };
    });

    const offset = listFilter?.offset ?? 0;
    const ranked = rankWithExploration(scored, {
      // 先把 offset 之前的排序结果算出来再切页；否则第二页会从错误的排名起点开始。
      // 不能按 rows.length 收窄 limit：探索位算法会用 limit 计算“利用位”，收窄会
      // 把一个很小的池子全部误判为探索位，从而改变既有的 adjustedScore 顺序。
      limit: query.limit + offset,
      explorationSlots: query.explorationSlots ?? 2,
    });
    return {
      rows: ranked.slice(offset).map((s) => ({
        ...(dtoById.get(s.id) as CandidateResource),
        baseScore: s.baseScore,
        preferenceAdjustment: s.adjustedScore - s.baseScore,
        adjustedScore: s.adjustedScore,
      })),
      total,
    };
  }

  const workspace = createTopicWorkspaceService({db:deps.db,now:deps.now,...deps.topicWorkspace});
  return {
    getTopicWorkspace: workspace.get,
    saveTopicWorkspace: workspace.save,
    getTopicRecommendationContext: workspace.recommendationContext,
    saveTopicProposalFeedback: workspace.feedback,
    async listCandidates(ctx, query) {
      // [T-216] sort=guardrail → 走护栏排序(rankTopicsWithGuardrails),复用 list seam 不新增 op。
      // 护栏只排 pool 候选,返回偏好注入后分序 + 探索位;RankedTopicResource 是 CandidateResource
      // 的超集,list 契约(response=candidateResource)会剥掉额外分字段,不破坏 wire 形状。
      if (query.sort === "guardrail") {
        return rankGuardrail(
          ctx,
          { limit: query.limit },
          {
            status: query.status,
            source: query.source,
            createdAfter: query.createdAfter,
            offset: query.offset,
          },
        );
      }
      const { rows, total } = await repoFor(ctx, "candidate.listCandidates").listCandidates(query);
      return { rows: rows.map(toCandidateDto), total };
    },

    async createCandidate(ctx, input) {
      assertCandidateTitle(input.title);
      const repo = repoFor(ctx, "candidate.createCandidate");
      const angle = input.angle ?? "";
      const card = pickCardFields({
        ...(input.card ?? {}),
        ...(input.sourceReferences && input.sourceReferences.length > 0
          ? { sourceReferences: input.sourceReferences }
          : {}),
      });
      const positioningFit = await fitFor(ctx, {
        title: input.title,
        angle,
        contentRole: input.contentRole ?? null,
        productAnchorId: input.productAnchorId ?? null,
      });
      const row = await repo.createCandidate({
        title: input.title,
        angle,
        // 默认 idea(手动新建);对话内 AI 出题采纳透传真实 AI 渠道(T-149 — 无 ai_task 的
        // topic.generate 走不通 createFromAIResult,只能落这条门,故这里保住其 source)。
        source: input.source ?? "idea",
        contentRole: input.contentRole ?? null,
        productAnchorId: input.productAnchorId ?? null,
        positioningFit,
        // [T-303] 落库预测分(每日出题器传 adjustedScore;手动新建缺省 null)。
        predictedScore: input.predictedScore ?? null,
        aiTaskId: null,
        card: Object.keys(card).length > 0 ? card : undefined,
      });
      return toCandidateDto(row);
    },

    async getCandidate(ctx, candidateId) {
      return toCandidateDto(await repoFor(ctx, "candidate.getCandidate").getCandidate(candidateId));
    },

    async patchCandidate(ctx, candidateId, patch) {
      if (patch.title !== undefined) assertCandidateTitle(patch.title);
      // Sanitize a partial 选题卡 patch (drop unknown keys / clamp metrics) before it
      // reaches the repo's shallow-merge; everything else (含 [T-212d] dropReason) passes
      // through unchanged.
      let cleaned: typeof patch = patch;
      if (patch.card !== undefined) {
        const editableCard = pickCardFields(patch.card);
        // [T-642] 来源拆解、改写策略与初稿 provenance 只能由 intelligence.confirmTopic
        // 的内部 create seam 写入；普通候选编辑不得伪造或覆盖这三段创作依据。
        delete editableCard.sourceDecomposition;
        delete editableCard.adaptationStrategy;
        delete editableCard.adaptedDraft;
        cleaned = { ...patch, card: editableCard };
      }
      const row = await repoFor(ctx, "candidate.patchCandidate").patchCandidate(candidateId, cleaned);
      // [T-212d] 淘汰(status→dropped)且带原因 → 后台蒸馏偏好信号(fire-and-forget,不阻塞淘汰返回)。
      // 蒸馏每次从**全部**累积原因重算,累计到 ≥3 例才被 service 护栏升级为硬偏好(单次不立即改规则)。
      if (
        cleaned.status === "dropped" &&
        typeof cleaned.dropReason === "string" &&
        cleaned.dropReason.trim().length > 0 &&
        dispatchPreferenceDistill
      ) {
        dispatchPreferenceDistill(ctx);
      }
      return toCandidateDto(row);
    },

    async promote(ctx, candidateId) {
      const repo = repoFor(ctx, "candidate.promote");
      const cand = await repo.getCandidate(candidateId); // ownership gate (404)
      if (cand.status === "promoted") {
        const existing = await repo.findPromotionByCandidateId(candidateId);
        if (existing) return toTopicPromotionDto(existing);
        throw new PromoteStateError(
          `PromoteStateError: candidate ${candidateId} is promoted but its project link is missing`,
        );
      }
      // 选题 → Brief 映射(§6.1):用候选(标题 + 选题卡)填一份结构化 Brief 草稿,随
      //   立项一起落到新项目的 brief 阶段(立项工作台),供创作者核对/补全后过 gate:
      //     title          → 项目名(下方 createProject 的 title)
      //     card.targetAudience → 目标受众
      //     card.oneLiner / angle → 核心信息(一句话主张)
      //     card.format    → 内容形式
      //     card.proposal  → 内容目标(立项建议作内容目标的起点)
      //     source         → 来源标注(写进 brief 文本,便于追溯)
      const dto = toCandidateDto(cand);
      const card = dto.card;
      if (card.audienceTask) await workspace.assertCurrent(ctx,card.audienceTask);
      // [T-284a] 复刻补链 G1:若被立项的候选带原爆款拆解要素(card.teardown,即 benchmark 复刻选题),
      //   把它复制进新 project 的 briefDetail.benchmarkRef —— 「这条复刻自某爆款,原爆款拆解在此」,
      //   供 creative-context 回流写稿。非 benchmark 候选(无 card.teardown)→ 不写(普通创作不携带、不污染)。
      const briefDraft: NonNullable<
        Parameters<CandidateProjectsPort["createProject"]>[1]["briefDetail"]
      > = {
        targetAudience: card.targetAudience,
        // SEMANTIC_BOUNDARY_ALLOW: 既有枚举的展示映射，落实已选目的，不做语义分类。
        contentGoal: [
          dto.contentRole ? `当前内容目的：${({ traffic: "流量型", trust: "信任型", conversion: "获客型" })[dto.contentRole]}（用户已选，优先于原推荐及参考初稿）` : "",
          card.proposal,
        ].filter(Boolean).join("\n") || undefined,
        contentFormat: card.format,
        coreMessage: card.oneLiner ?? (dto.angle || undefined),
      };
      if (card.audienceTask) {
        briefDraft.targetAudience=card.audienceTask.audience;
        briefDraft.coreMessage=card.audienceTask.job;
        briefDraft.successCriteria=card.audienceTask.acceptance;
      }
      if (card.teardown) {
        briefDraft.benchmarkRef = card.teardown;
      }
      if (
        card.sourceReferences?.length &&
        card.sourceDecomposition &&
        card.adaptationStrategy &&
        card.adaptedDraft
      ) {
        briefDraft.contentRadarEvidence = {
          sourceReferences: card.sourceReferences,
          decomposition: card.sourceDecomposition,
          strategy: card.adaptationStrategy,
          adaptedDraftSeed: card.adaptedDraft,
        };
      }
      const SOURCE_LABELS: Record<string, string> = {
        trend: "行业热点",
        benchmark: "对标拆解",
        demand: "受众需求",
        idea: "手动灵感",
        favorites: "收藏夹跟拍", // [T-235c] 指定收藏夹采集进池
      };
      const sourceLabel = SOURCE_LABELS[dto.source] ?? dto.source;
      const briefText = dto.angle
        ? `${dto.angle}（选题来源:${sourceLabel}）`
        : `选题立项,来源:${sourceLabel}`;
      // 1. create the Project at the brief stage with the seeded Brief draft. The
      //    ProjectsService stamps ctx.userId + sets current_stage=brief internally.
      const project = await projects.createProject(ctx, {
        title: cand.title,
        brief: [briefText,card.audienceTask ? `观众任务：${card.audienceTask.job}\n输入：${card.audienceTask.input}\n操作：${card.audienceTask.steps.join("；")}\n输出：${card.audienceTask.output}\n验收：${card.audienceTask.acceptance}\n入口：${card.audienceTask.entryUrl}\n限制：${card.audienceTask.costAndLimits}\n实测计划：${JSON.stringify(card.audienceTask.testPlan)}\n状态：${card.audienceTask.route}` : ""].filter(Boolean).join("\n"),
        briefDetail: briefDraft,
      });
      // 2. flip the candidate to promoted + 3. write the topic_promotions row.
      //    pglite is in-process synchronous; the writes run back-to-back inside this
      //    one service method (the realized modules do not wrap a tx — no UnitOfWork
      //    helper is exported; the unique index on candidate_id is the backstop).
      await repo.setPromoted(candidateId);
      const promo = await repo.createPromotion({
        candidateId,
        projectId: project.id,
      });
      return toTopicPromotionDto(promo);
    },

    async createFromAIResult(ctx, result) {
      assertCandidateTitle(result.resultData.title);
      const repo = repoFor(ctx, "candidate.createFromAIResult");
      // Idempotent on aiTaskId — confirmResult may retry; never duplicate.
      const existing = await repo.findCandidateByAiTaskId(result.aiTaskId);
      if (existing) return toCandidateDto(existing);
      if (result.resultData.card?.audienceTask) await workspace.assertCurrent(ctx, result.resultData.card.audienceTask);
      const { resultData } = result;
      const angle = resultData.angle ?? "";
      const positioningFit = await fitFor(ctx, {
        title: resultData.title,
        angle,
        contentRole: resultData.contentRole ?? null,
        productAnchorId: resultData.productAnchorId ?? null,
      });
      const row = await repo.createCandidate({
        title: resultData.title,
        angle,
        source: resultData.source, // trend|benchmark|demand (AI-sourced)
        contentRole: resultData.contentRole ?? null,
        productAnchorId: resultData.productAnchorId ?? null,
        positioningFit,
        predictedScore: resultData.predictedScore ?? null,
        card: resultData.card ? toCardDto(resultData.card) as unknown as Record<string,unknown> : undefined,
        aiTaskId: result.aiTaskId, // provenance; status stays 'pool' (no parallel machine)
      });
      return toCandidateDto(row);
    },

    async enrichCard(ctx, candidateId, card) {
      // Clean the AI-filled card into the FULL contract shape (every detail field + the
      // 3 metrics, defaults applied), then REPLACE the stored card. getCandidate inside
      // enrichCard gates ownership (cross-user / unknown → OwnershipError → 404).
      const repo = repoFor(ctx, "candidate.enrichCard");
      const current = toCandidateDto(await repo.getCandidate(candidateId));
      const cleaned = toCardDto({
        ...card,
        audienceTask: current.card.audienceTask,
        // AI 补全整卡不拥有来源证据；未显式带回时沿用领域中已经确认的真实来源。
        sourceReferences:
          (card as { sourceReferences?: unknown }).sourceReferences ??
          current.card.sourceReferences,
      }) as unknown as Record<string, unknown>;
      const row = await repo.enrichCard(candidateId, cleaned);
      return toCandidateDto(row);
    },

    async ingestAudienceSignal(ctx, record) {
      const runId = ctx.ingestionRunId;
      if (!runId) {
        // C-4 — AudienceSignal writes ride an Ingestion run; no run ⇒ reject.
        throw new DanglingRunError(
          "DanglingRunError: ingestAudienceSignal requires ctx.ingestionRunId (C-4)",
        );
      }
      // RISK-005 — the run must be a REAL IngestionRun (cross-user / unknown →
      // OwnershipError) BEFORE any signal row references it.
      await ingestion.assertRunExists(ctx, runId);
      const repo = repoFor(ctx, "candidate.ingestAudienceSignal");
      const { row: signal, inserted } = await repo.createSignal({
        source: record.source,
        rawText: record.rawText,
        demandTag: record.demandTag ?? null,
        payingIntent: record.payingIntent ?? null,
        linkedCandidateId: record.linkedCandidateRef ?? null,
        ingestionRunId: runId,
        // 评论按作品可读 (T-030 D6) — 回填作品绑定 (来自采集 aweme_id→publication);
        // 无匹配作品则 null,不报错 (F3)。
        publicationId: record.publicationId ?? null,
        // 评论点赞数 (T-042 热榜排序依据) — 采集带的 digg_count;无值 → null。
        likeCount: record.likeCount ?? null,
        // 评论粒度幂等锚 (T-065) — 重复采集命中唯一索引 → inserted=false,不重复入库。
        externalId: record.externalId ?? null,
      });
      if (inserted && record.linkedCandidateRef) {
        // bump the linked Candidate's demand_count (recompute keeps it honest;
        // 幂等跳过的写不重复计数,T-065)。
        await repo.recomputeDemandCount(record.linkedCandidateRef);
      }
      return { ...toAudienceSignalDto(signal), inserted };
    },

    async getTopicsOverview(ctx) {
      // Candidate-module-owned counts (audience_signals / candidates / card / promotions)
      // come from ONE user-scoped repo read. Cross-module aggregates (定位 / 知识库 /
      // 历史爆款 / 复盘回流) come from the SOFT overview port — absent / rejecting calls
      // degrade to "" / 0 (honest, never fabricated).
      const counts = await repoFor(ctx, "candidate.getTopicsOverview").topicsOverviewCounts();

      const soft = async <T>(p: Promise<T> | undefined, fallback: T): Promise<T> => {
        if (!p) return fallback;
        try {
          return await p;
        } catch {
          return fallback; // SOFT dep — a peer failure never blocks the overview read.
        }
      };
      const positioningLabel = await soft(overview?.positioningLabel(ctx), "");
      const knowledgeCards = await soft(overview?.knowledgeCount(ctx), 0);
      const highPerformers = await soft(overview?.highPerformerCount(ctx), 0);
      const learningsCount = await soft(overview?.learningsCount(ctx), 0);

      // 选题来源 — the 7 intake channels. Comment/咨询/审评/私信 counts come from the real
      // audience_signals.source distribution; 知识库/历史爆款 from the peer ports; 手动灵感
      // from candidates.source='idea'; 项目复盘 from learnings. A channel with no backing
      // data source reports 0 (never fabricated).
      const bySrc = counts.signalsBySource;
      const ideaRows = await repoFor(ctx, "candidate.getTopicsOverview").listCandidates({
        status: "pool",
        source: "idea",
        limit: 1000,
        offset: 0,
      });
      const sources = [
        { key: "comment", label: "评论问题", count: bySrc.comment ?? 0 },
        { key: "consultation", label: "客户咨询", count: bySrc.consultation ?? 0 },
        { key: "knowledge", label: "知识库资料", count: knowledgeCards },
        { key: "highPerformer", label: "历史爆款", count: highPerformers },
        // 行业热点 has no first-class store this wave — topic.generate(trend) reads it
        // live via WebSearch, so there is no count to surface (honest 0, not fabricated).
        { key: "trend", label: "行业热点", count: 0 },
        { key: "review", label: "项目复盘", count: learningsCount },
        { key: "idea", label: "手动灵感", count: ideaRows.total },
      ];

      // 选题漏斗 — 6 states DERIVED from real rows (NOT a status column on candidates):
      //   待收集     = audience_signals where linkedCandidateId IS NULL
      //   待评估     = candidates status=pool 且 card 空 (无 oneLiner)
      //   待补充     = candidates status=pool 且 card 非空 (已补全待决策)
      //   已立项     = topic_promotions 计数
      //   已丢弃     = candidates status=dropped
      //   已发布回流 = learnings 计数 (复盘回流经验条数)
      const funnel = [
        { key: "collecting", label: "待收集", count: counts.signalsUnlinked },
        { key: "evaluating", label: "待评估", count: counts.poolWithoutCard },
        { key: "enriching", label: "待补充", count: counts.poolWithCard },
        { key: "promoted", label: "已立项", count: counts.promotionsCount },
        { key: "dropped", label: "已丢弃", count: counts.droppedCount },
        { key: "recycled", label: "已发布回流", count: learningsCount },
      ];

      return {
        basis: {
          positioningLabel,
          commentSignals: counts.signalsTotal,
          knowledgeCards,
          highPerformers,
        },
        sources,
        funnel,
      };
    },

    async listSignals(ctx, query) {
      const { rows, total } = await repoFor(ctx, "candidate.listSignals").listSignals(query);
      return { rows: rows.map(toAudienceSignalDto), total };
    },

    async listCommentsForPublication(ctx, publicationId, limit) {
      const rows = await repoFor(ctx, "candidate.listCommentsForPublication").listCommentsForPublication(
        publicationId,
        limit,
      );
      return rows.map(toAudienceSignalDto);
    },

    async linkSignalToCandidate(ctx, signalId, candidateId) {
      const repo = repoFor(ctx, "candidate.linkSignalToCandidate");
      const signal = await repo.getSignal(signalId); // ownership gate (404)
      let targetId = candidateId;
      if (!targetId) {
        // Spawn a new demand Candidate from the signal's rawText/demandTag.
        const title = signal.rawText.slice(0, 60);
        const created = await repo.createCandidate({
          title,
          angle: signal.demandTag ?? "",
          source: "demand",
          contentRole: null,
          productAnchorId: null,
          positioningFit: await fitFor(ctx, {
            title,
            angle: signal.demandTag ?? "",
          }),
          predictedScore: null,
          aiTaskId: null,
        });
        targetId = created.id;
      } else {
        await repo.getCandidate(targetId); // ownership gate on the target (404)
      }
      await repo.linkSignal(signalId, targetId);
      await repo.recomputeDemandCount(targetId);
      return toCandidateDto(await repo.getCandidate(targetId));
    },

    // ── [T-212d] 防茧房校准 ──────────────────────────────────────────────────
    async listDropReasons(ctx) {
      return repoFor(ctx, "candidate.listDropReasons").listDropReasons();
    },

    async upsertTopicPreference(ctx, input) {
      return upsertDistilledTopicPreference(deps.db,ctx,input,deps);

    },

    async listActiveTopicPreferences(ctx) {
      return repoFor(ctx, "candidate.listActiveTopicPreferences").listActiveTopicPreferences();
    },

    async rankTopicsWithGuardrails(ctx, query) {
      // [T-216] 实体抽到闭包 rankGuardrail(与 listCandidates 的 sort=guardrail 共用同一逻辑)。
      return (await rankGuardrail(ctx, query)).rows;
    },
  };
}

/** 完整UTC日供给计数；不限分页、不按pool状态排除已被使用的当日供给。 */
export async function countCandidatesForDay(db:Db|Parameters<Parameters<Db["transaction"]>[0]>[0],ctx:RequestContext,day:string):Promise<number>{
 const accountId=requireAccountId(ctx.accountId,"candidate.countCandidatesForDay");
 const start=`${day}T00:00:00.000Z`,stamp=Date.parse(start);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(stamp)||new Date(stamp).toISOString()!==start)throw new Error("UTC日期无效");
 const end=new Date(stamp+86400000).toISOString();
 const [row]=await db.select({total:sql<number>`count(*)::int`}).from(candidates).where(and(eq(candidates.userId,ctx.userId),eq(candidates.accountId,accountId),gte(candidates.createdAt,start),lt(candidates.createdAt,end)));
 return row?.total??0;
}

/** 事务调用者复用同一偏好护栏，不依赖项目、采集等无关端口。 */
export async function upsertDistilledTopicPreference(db:Db,ctx:RequestContext,input:{keyword:string;direction:"avoid"|"prefer";signal:string;exampleCount:number;weight?:number},deps:{now:()=>string;nextId:(prefix:string)=>string}){
 const accountId=requireAccountId(ctx.accountId,"candidate.upsertTopicPreference");
 return createCandidateRepository(db,{...deps,userId:ctx.userId,accountId}).upsertTopicPreference({
  keyword:input.keyword,direction:input.direction,signal:input.signal,exampleCount:input.exampleCount,
  weight:Math.abs(clampPreferenceWeight(input.weight??input.exampleCount*3)),status:isHardPreference(input.exampleCount)?"active":"candidate",
 });
}

/** 锁住真实原因来源；旧快照完成只记结果，不覆盖更新后的偏好。 */
export async function topicPreferenceSourceIsCurrent(db:Db,ctx:RequestContext,reasons:string[]){
 const accountId=requireAccountId(ctx.accountId,"candidate.preferenceSource");
 await db.select({id:candidates.id}).from(candidates).where(and(eq(candidates.userId,ctx.userId),eq(candidates.accountId,accountId))).orderBy(candidates.id).for("update");
 const current=await createCandidateRepository(db,{userId:ctx.userId,accountId,now:()=>new Date().toISOString(),nextId:()=>{throw new Error("只读来源不生成ID");}}).listDropReasons();
 return JSON.stringify(current.slice(0,50))===JSON.stringify(reasons);
}
