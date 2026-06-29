import type { RequestContext } from "@creatoros/contract";
import type { Db } from "@creatoros/backend";
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
  PromoteStateError,
  DanglingRunError,
} from "./candidate.errors";

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
  db: Db;
  now: () => string;
  nextId: (prefix: string) => string;
  projects: CandidateProjectsPort;
  positioning?: CandidatePositioningPort;
  ingestion: CandidateIngestionPort;
  // SOFT dep — the cross-module aggregates for topics.overview's 出题依据 + 历史爆款/复盘
  // sources. Absent ⇒ those numbers report 0 / "" (honest, never fabricated).
  overview?: CandidateOverviewPort;
}

export interface CreateCandidateInput {
  title: string;
  angle?: string;
  contentRole?: "traffic" | "trust" | "conversion" | null;
  productAnchorId?: string | null;
}

export interface PatchCandidateInput {
  title?: string;
  angle?: string;
  contentRole?: "traffic" | "trust" | "conversion" | null;
  productAnchorId?: string | null;
  status?: "pool" | "dropped";
  // 选题卡可编辑 — a partial 选题卡 patch, shallow-merged over the stored card.
  card?: Record<string, unknown>;
}

export interface ListCandidatesQuery {
  status?: string;
  source?: string;
  sort?: CandidateSort;
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
}

export interface CandidateService {
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
  // Candidate → Project (类比 promoteReviewInsight). No double-promote.
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
  ingestAudienceSignal(
    ctx: RequestContext,
    record: IngestSignalInput,
  ): Promise<AudienceSignalResource>;

  // 选题中心总览 (topics.overview) — 出题依据 + 7 来源 + 6 态漏斗, every count DERIVED
  // from real rows at read time (candidate-module counts + the SOFT overview port for
  // cross-module aggregates). No stored 总览 table, no new status column.
  getTopicsOverview(ctx: RequestContext): Promise<TopicsOverviewResource>;

  listSignals(
    ctx: RequestContext,
    query: ListSignalsQuery,
  ): Promise<{ rows: AudienceSignalResource[]; total: number }>;
  // "评论/客户问题一键转 Candidate" (spec §5.5). Omit candidateId → spawn a new
  // demand Candidate from the signal, then link; bumps demandCount.
  linkSignalToCandidate(
    ctx: RequestContext,
    signalId: string,
    candidateId: string | undefined,
  ): Promise<CandidateResource>;
}

export function createCandidateService(deps: ServiceDeps): CandidateService {
  const { db, now, nextId, projects, positioning, ingestion, overview } = deps;

  function repoFor(ctx: RequestContext): CandidateRepository {
    const repoDeps: RepoDeps = { now, nextId, userId: ctx.userId };
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

  return {
    async listCandidates(ctx, query) {
      const { rows, total } = await repoFor(ctx).listCandidates(query);
      return { rows: rows.map(toCandidateDto), total };
    },

    async createCandidate(ctx, input) {
      const repo = repoFor(ctx);
      const angle = input.angle ?? "";
      const positioningFit = await fitFor(ctx, {
        title: input.title,
        angle,
        contentRole: input.contentRole ?? null,
        productAnchorId: input.productAnchorId ?? null,
      });
      const row = await repo.createCandidate({
        title: input.title,
        angle,
        source: "idea", // manual entry only — AI-sourced go via createFromAIResult.
        contentRole: input.contentRole ?? null,
        productAnchorId: input.productAnchorId ?? null,
        positioningFit,
        predictedScore: null,
        aiTaskId: null,
      });
      return toCandidateDto(row);
    },

    async getCandidate(ctx, candidateId) {
      return toCandidateDto(await repoFor(ctx).getCandidate(candidateId));
    },

    async patchCandidate(ctx, candidateId, patch) {
      // Sanitize a partial 选题卡 patch (drop unknown keys / clamp metrics) before it
      // reaches the repo's shallow-merge; everything else passes through unchanged.
      const cleaned: typeof patch =
        patch.card !== undefined
          ? { ...patch, card: pickCardFields(patch.card) }
          : patch;
      const row = await repoFor(ctx).patchCandidate(candidateId, cleaned);
      return toCandidateDto(row);
    },

    async promote(ctx, candidateId) {
      const repo = repoFor(ctx);
      const cand = await repo.getCandidate(candidateId); // ownership gate (404)
      if (cand.status === "promoted") {
        throw new PromoteStateError(
          `PromoteStateError: candidate ${candidateId} is already promoted`,
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
      const briefDraft = {
        targetAudience: card.targetAudience,
        contentGoal: card.proposal,
        contentFormat: card.format,
        coreMessage: card.oneLiner ?? (dto.angle || undefined),
      };
      const SOURCE_LABELS: Record<string, string> = {
        trend: "行业热点",
        benchmark: "对标拆解",
        demand: "受众需求",
        idea: "手动灵感",
      };
      const sourceLabel = SOURCE_LABELS[dto.source] ?? dto.source;
      const briefText = dto.angle
        ? `${dto.angle}（选题来源:${sourceLabel}）`
        : `选题立项,来源:${sourceLabel}`;
      // 1. create the Project at the brief stage with the seeded Brief draft. The
      //    ProjectsService stamps ctx.userId + sets current_stage=brief internally.
      const project = await projects.createProject(ctx, {
        title: cand.title,
        brief: briefText,
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
      const repo = repoFor(ctx);
      // Idempotent on aiTaskId — confirmResult may retry; never duplicate.
      const existing = await repo.findCandidateByAiTaskId(result.aiTaskId);
      if (existing) return toCandidateDto(existing);
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
        aiTaskId: result.aiTaskId, // provenance; status stays 'pool' (no parallel machine)
      });
      return toCandidateDto(row);
    },

    async enrichCard(ctx, candidateId, card) {
      // Clean the AI-filled card into the FULL contract shape (every detail field + the
      // 3 metrics, defaults applied), then REPLACE the stored card. getCandidate inside
      // enrichCard gates ownership (cross-user / unknown → OwnershipError → 404).
      const cleaned = toCardDto(card) as unknown as Record<string, unknown>;
      const row = await repoFor(ctx).enrichCard(candidateId, cleaned);
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
      const repo = repoFor(ctx);
      const signal = await repo.createSignal({
        source: record.source,
        rawText: record.rawText,
        demandTag: record.demandTag ?? null,
        payingIntent: record.payingIntent ?? null,
        linkedCandidateId: record.linkedCandidateRef ?? null,
        ingestionRunId: runId,
      });
      if (record.linkedCandidateRef) {
        // bump the linked Candidate's demand_count (recompute keeps it honest).
        await repo.recomputeDemandCount(record.linkedCandidateRef);
      }
      return toAudienceSignalDto(signal);
    },

    async getTopicsOverview(ctx) {
      // Candidate-module-owned counts (audience_signals / candidates / card / promotions)
      // come from ONE user-scoped repo read. Cross-module aggregates (定位 / 知识库 /
      // 历史爆款 / 复盘回流) come from the SOFT overview port — absent / rejecting calls
      // degrade to "" / 0 (honest, never fabricated).
      const counts = await repoFor(ctx).topicsOverviewCounts();

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
      const ideaRows = await repoFor(ctx).listCandidates({
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
      const { rows, total } = await repoFor(ctx).listSignals(query);
      return { rows: rows.map(toAudienceSignalDto), total };
    },

    async linkSignalToCandidate(ctx, signalId, candidateId) {
      const repo = repoFor(ctx);
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
  };
}
