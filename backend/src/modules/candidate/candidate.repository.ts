import { and, desc, eq, sql, type Db } from "@creatoros/backend";
import {
  candidates,
  audienceSignals,
  topicPromotions,
} from "./candidate.db-schema";
import { OwnershipError, DerivedFieldError } from "./candidate.errors";

// Candidate repository (foundation §5.2) — user-scoped queries ONLY. `userId` is
// baked into deps (mirrors the positioning/monetization repos): EVERY query filters
// `eq(table.userId, deps.userId)` and EVERY insert stamps `userId: deps.userId`. A
// getCandidate(id) throws OwnershipError when the scoped select returns empty —
// never revealing cross-user existence (foundation §2: 404 not 403).
//
// Derived-field discipline: patchCandidate REJECTS `status:'promoted'` (only the
// promote op sets it) and any `demandCount` write (it is a maintained
// denormalization recomputed from linked signals). `setPromoted` is the ONLY path to
// 'promoted'; `recomputeDemandCount` is the ONLY path to demandCount (bump on
// link/ingest).

export type CandidateRow = typeof candidates.$inferSelect;
export type AudienceSignalRow = typeof audienceSignals.$inferSelect;
export type TopicPromotionRow = typeof topicPromotions.$inferSelect;

export interface RepoDeps {
  now: () => string; // ISO-8601 clock (injected for deterministic tests)
  nextId: (prefix: string) => string; // id generator (deterministic in tests)
  userId: string; // the ownership boundary, baked in at construction
}

export type CandidateSort =
  | "predictedScore"
  | "positioningFit"
  | "demandCount";

export interface ListCandidatesQuery {
  status?: string;
  source?: string;
  sort?: CandidateSort;
  limit?: number;
  offset?: number;
}

export interface CreateCandidateInput {
  title: string;
  angle: string;
  source: string; // trend|benchmark|demand|idea
  contentRole: string | null;
  productAnchorId: string | null;
  positioningFit: number | null;
  predictedScore: number | null;
  aiTaskId: string | null;
}

// A free curation patch — NO promoted, NO demandCount (derived-field guard).
// `card` is a PARTIAL 选题卡 patch — shallow-merged over the stored card (the user can
// edit any subset of 详情/指标 without clobbering the rest).
export interface PatchCandidateInput {
  title?: string;
  angle?: string;
  contentRole?: string | null;
  productAnchorId?: string | null;
  status?: "pool" | "dropped";
  card?: Record<string, unknown>;
}

export interface CreateSignalInput {
  source: string;
  rawText: string;
  demandTag: string | null;
  payingIntent: string | null;
  linkedCandidateId: string | null;
  ingestionRunId: string | null;
  // 评论按作品可读 (T-030 D6) — 回填自采集 aweme_id→publication;无匹配则 null。
  publicationId?: string | null;
  // 评论点赞数 (T-042 热榜排序依据) — 采集带的 digg_count;无值 → null。
  likeCount?: number | null;
  // 评论粒度幂等锚 (T-065) — 形如 `douyin:comment:<cid>`。带锚时 createSignal 走
  // onConflictDoNothing(user+source+external_id 部分唯一索引),重复采集不重复入库。
  externalId?: string | null;
}

// createSignal 的结果:row + 是否真新插入(inserted=false 表示命中幂等锚、返回已存在行)。
export interface CreateSignalResult {
  row: AudienceSignalRow;
  inserted: boolean;
}

export interface ListSignalsQuery {
  source?: string;
  demandTag?: string;
  linkedCandidateId?: string;
  limit?: number;
  offset?: number;
}

export interface CandidateRepository {
  // Fixture hydration (insert with explicit user_id already on the row).
  seedCandidates(rows: CandidateRow[]): Promise<void>;

  // Candidate reads/writes.
  listCandidates(
    query: ListCandidatesQuery,
  ): Promise<{ rows: CandidateRow[]; total: number }>;
  createCandidate(input: CreateCandidateInput): Promise<CandidateRow>;
  getCandidate(id: string): Promise<CandidateRow>;
  findCandidateByAiTaskId(aiTaskId: string): Promise<CandidateRow | undefined>;
  patchCandidate(id: string, patch: PatchCandidateInput): Promise<CandidateRow>;
  setPromoted(id: string): Promise<CandidateRow>;
  // 选题卡 upsert (topic.enrich confirm) — REPLACE the stored card with the AI-filled
  // one. Ownership-gated; the only path other than patchCandidate that writes `card`.
  enrichCard(id: string, card: Record<string, unknown>): Promise<CandidateRow>;

  // Promotion.
  createPromotion(input: {
    candidateId: string;
    projectId: string;
  }): Promise<TopicPromotionRow>;

  // Signals.
  createSignal(input: CreateSignalInput): Promise<CreateSignalResult>;
  getSignal(id: string): Promise<AudienceSignalRow>;
  listSignals(
    query: ListSignalsQuery,
  ): Promise<{ rows: AudienceSignalRow[]; total: number }>;
  listSignalsForCandidate(candidateId: string): Promise<AudienceSignalRow[]>;
  // 复盘每作品评论 (T-030 D6) — user-scoped comment signals for one publication
  // (source='comment' AND publication_id=?), newest first, capped at `limit`.
  listCommentsForPublication(
    publicationId: string,
    limit: number,
  ): Promise<AudienceSignalRow[]>;
  findSignalByRunRecord(
    ingestionRunId: string,
    rawText: string,
  ): Promise<AudienceSignalRow | undefined>;
  linkSignal(signalId: string, candidateId: string): Promise<AudienceSignalRow>;
  // Recompute demand_count from the linked-signal count (the derived denormalization).
  recomputeDemandCount(candidateId: string): Promise<number>;

  // 选题中心总览 — the candidate-module-owned counts the topics.overview read derives
  // its 来源 + 漏斗 from (everything computable WITHOUT a cross-module read). All
  // user-scoped. The card-emptiness split (待评估 vs 待补充) is decided in JS off each
  // pool candidate's stored card (oneLiner present ⇒ 已补全).
  topicsOverviewCounts(): Promise<{
    signalsTotal: number; // audience_signals 总数
    signalsUnlinked: number; // 待收集 — linkedCandidateId IS NULL
    signalsBySource: Record<string, number>; // 评论问题/客户咨询… 按 source 计数
    poolWithCard: number; // 待补充 — status=pool 且 card 已补全 (有 oneLiner)
    poolWithoutCard: number; // 待评估 — status=pool 且 card 空 (无 oneLiner)
    droppedCount: number; // 已丢弃 — status=dropped
    promotionsCount: number; // 已立项 — topic_promotions 计数
  }>;
}

export function createCandidateRepository(
  db: Db,
  deps: RepoDeps,
): CandidateRepository {
  function sortColumn(sort: CandidateSort | undefined) {
    switch (sort) {
      case "positioningFit":
        return candidates.positioningFit;
      case "demandCount":
        return candidates.demandCount;
      case "predictedScore":
      default:
        return candidates.predictedScore;
    }
  }

  return {
    async seedCandidates(rows) {
      if (rows.length === 0) return;
      await db.insert(candidates).values(rows).onConflictDoNothing();
    },

    async listCandidates({ status, source, sort, limit = 100, offset = 0 }) {
      const filters = [eq(candidates.userId, deps.userId)];
      if (status) filters.push(eq(candidates.status, status));
      if (source) filters.push(eq(candidates.source, source));
      const where = and(...filters);
      const rows = await db
        .select()
        .from(candidates)
        .where(where)
        // [T-049 B7] Postgres 的 DESC 默认 NULLS FIRST —— 未评分候选(predictedScore
        // null)会排在最高分之前(首页热门选题/选题池排序都被顶乱)。显式 NULLS LAST。
        .orderBy(sql`${sortColumn(sort)} DESC NULLS LAST`)
        .limit(limit)
        .offset(offset);
      const all = await db
        .select({ id: candidates.id })
        .from(candidates)
        .where(where);
      return { rows, total: all.length };
    },

    async createCandidate(input) {
      const inserted = await db
        .insert(candidates)
        .values({
          id: deps.nextId("cand"),
          userId: deps.userId,
          title: input.title,
          angle: input.angle,
          source: input.source,
          contentRole: input.contentRole,
          productAnchorId: input.productAnchorId,
          positioningFit: input.positioningFit,
          predictedScore: input.predictedScore,
          demandCount: 0,
          status: "pool",
          aiTaskId: input.aiTaskId,
          createdAt: deps.now(),
          updatedAt: deps.now(),
        })
        .returning();
      return inserted[0]!;
    },

    async getCandidate(id) {
      const rows = await db
        .select()
        .from(candidates)
        .where(
          and(eq(candidates.userId, deps.userId), eq(candidates.id, id)),
        );
      const row = rows[0];
      if (!row) {
        throw new OwnershipError(
          `OwnershipError: candidate not found: ${id}`,
        );
      }
      return row;
    },

    async findCandidateByAiTaskId(aiTaskId) {
      const rows = await db
        .select()
        .from(candidates)
        .where(
          and(
            eq(candidates.userId, deps.userId),
            eq(candidates.aiTaskId, aiTaskId),
          ),
        )
        .limit(1);
      return rows[0];
    },

    async patchCandidate(id, patch) {
      // Derived-field guard: a free patch can NEVER set 'promoted' or demandCount.
      const status = (patch as { status?: string }).status;
      if (status === "promoted") {
        throw new DerivedFieldError(
          "DerivedFieldError: status 'promoted' is set ONLY by the promote op",
        );
      }
      if ("demandCount" in (patch as Record<string, unknown>)) {
        throw new DerivedFieldError(
          "DerivedFieldError: demandCount is derived (count of linked signals); never patched",
        );
      }
      // ownership gate before any write (also gives us the current card as merge base).
      const current = await this.getCandidate(id);
      const set: Record<string, unknown> = { updatedAt: deps.now() };
      if (patch.title !== undefined) set.title = patch.title;
      if (patch.angle !== undefined) set.angle = patch.angle;
      if (patch.contentRole !== undefined) set.contentRole = patch.contentRole;
      if (patch.productAnchorId !== undefined)
        set.productAnchorId = patch.productAnchorId;
      if (patch.status !== undefined) set.status = patch.status;
      if (patch.card !== undefined) {
        // Shallow-merge the partial 选题卡 over the stored card so editing one field
        // never clobbers the rest (the contract patch is candidateCard.partial()).
        const base = ((current as { card?: unknown }).card ?? {}) as Record<
          string,
          unknown
        >;
        set.card = { ...base, ...patch.card };
      }
      const updated = await db
        .update(candidates)
        .set(set)
        .where(
          and(eq(candidates.userId, deps.userId), eq(candidates.id, id)),
        )
        .returning();
      return updated[0]!;
    },

    async enrichCard(id, card) {
      await this.getCandidate(id); // ownership gate
      const updated = await db
        .update(candidates)
        .set({ card, updatedAt: deps.now() })
        .where(
          and(eq(candidates.userId, deps.userId), eq(candidates.id, id)),
        )
        .returning();
      return updated[0]!;
    },

    async setPromoted(id) {
      await this.getCandidate(id); // ownership gate
      const updated = await db
        .update(candidates)
        .set({ status: "promoted", updatedAt: deps.now() })
        .where(
          and(eq(candidates.userId, deps.userId), eq(candidates.id, id)),
        )
        .returning();
      return updated[0]!;
    },

    async createPromotion(input) {
      const inserted = await db
        .insert(topicPromotions)
        .values({
          id: deps.nextId("promo"),
          userId: deps.userId,
          candidateId: input.candidateId,
          projectId: input.projectId,
          promotedAt: deps.now(),
        })
        .returning();
      return inserted[0]!;
    },

    async createSignal(input) {
      const values = {
        id: deps.nextId("sig"),
        userId: deps.userId,
        source: input.source,
        rawText: input.rawText,
        demandTag: input.demandTag,
        payingIntent: input.payingIntent,
        linkedCandidateId: input.linkedCandidateId,
        ingestionRunId: input.ingestionRunId,
        publicationId: input.publicationId ?? null,
        likeCount: input.likeCount ?? null,
        externalId: input.externalId ?? null,
        createdAt: deps.now(),
      };
      // T-065 评论粒度幂等:带 external_id 的写入撞 ux_audience_signals_user_source_external
      // (user+source+external_id 部分唯一索引)即跳过,返回已存在行 + inserted=false。
      // 无锚(external_id 空,dm/consultation 等)保持原样直插。
      if (input.externalId) {
        const inserted = await db
          .insert(audienceSignals)
          .values(values)
          .onConflictDoNothing({
            target: [
              audienceSignals.userId,
              audienceSignals.source,
              audienceSignals.externalId,
            ],
            // 部分唯一索引的谓词(ON CONFLICT ... WHERE external_id IS NOT NULL)。
            where: sql`${audienceSignals.externalId} IS NOT NULL`,
          })
          .returning();
        if (inserted[0]) return { row: inserted[0], inserted: true };
        const existing = await db
          .select()
          .from(audienceSignals)
          .where(
            and(
              eq(audienceSignals.userId, deps.userId),
              eq(audienceSignals.source, input.source),
              eq(audienceSignals.externalId, input.externalId),
            ),
          );
        return { row: existing[0]!, inserted: false };
      }
      const inserted = await db
        .insert(audienceSignals)
        .values(values)
        .returning();
      return { row: inserted[0]!, inserted: true };
    },

    async getSignal(id) {
      const rows = await db
        .select()
        .from(audienceSignals)
        .where(
          and(
            eq(audienceSignals.userId, deps.userId),
            eq(audienceSignals.id, id),
          ),
        );
      const row = rows[0];
      if (!row) {
        throw new OwnershipError(
          `OwnershipError: audience signal not found: ${id}`,
        );
      }
      return row;
    },

    async listSignals({
      source,
      demandTag,
      linkedCandidateId,
      limit = 100,
      offset = 0,
    }) {
      const filters = [eq(audienceSignals.userId, deps.userId)];
      if (source) filters.push(eq(audienceSignals.source, source));
      if (demandTag) filters.push(eq(audienceSignals.demandTag, demandTag));
      if (linkedCandidateId)
        filters.push(eq(audienceSignals.linkedCandidateId, linkedCandidateId));
      const where = and(...filters);
      const rows = await db
        .select()
        .from(audienceSignals)
        .where(where)
        .orderBy(desc(audienceSignals.createdAt))
        .limit(limit)
        .offset(offset);
      const all = await db
        .select({ id: audienceSignals.id })
        .from(audienceSignals)
        .where(where);
      return { rows, total: all.length };
    },

    async listSignalsForCandidate(candidateId) {
      return db
        .select()
        .from(audienceSignals)
        .where(
          and(
            eq(audienceSignals.userId, deps.userId),
            eq(audienceSignals.linkedCandidateId, candidateId),
          ),
        )
        .orderBy(desc(audienceSignals.createdAt));
    },

    async listCommentsForPublication(publicationId, limit) {
      // 复盘每作品评论 (T-030 D6 + T-042 热榜) — user-scoped, source='comment' 且绑定该作品的
      // 信号,**按点赞数倒序(热榜)**封顶 limit 条,同赞数再按 created_at 倒序兜底
      // (ix_audience_signals_pub 支撑作品维度过滤)。coalesce(like_count,-1) 让存量无点赞
      // (0014 前入库)沉到底,不抢占热榜前列。
      return db
        .select()
        .from(audienceSignals)
        .where(
          and(
            eq(audienceSignals.userId, deps.userId),
            eq(audienceSignals.source, "comment"),
            eq(audienceSignals.publicationId, publicationId),
          ),
        )
        .orderBy(
          desc(sql`coalesce(${audienceSignals.likeCount}, -1)`),
          desc(audienceSignals.createdAt),
        )
        .limit(limit);
    },

    async findSignalByRunRecord(ingestionRunId, rawText) {
      const rows = await db
        .select()
        .from(audienceSignals)
        .where(
          and(
            eq(audienceSignals.userId, deps.userId),
            eq(audienceSignals.ingestionRunId, ingestionRunId),
            eq(audienceSignals.rawText, rawText),
          ),
        )
        .limit(1);
      return rows[0];
    },

    async linkSignal(signalId, candidateId) {
      await this.getSignal(signalId); // ownership gate
      const updated = await db
        .update(audienceSignals)
        .set({ linkedCandidateId: candidateId })
        .where(
          and(
            eq(audienceSignals.userId, deps.userId),
            eq(audienceSignals.id, signalId),
          ),
        )
        .returning();
      return updated[0]!;
    },

    async recomputeDemandCount(candidateId) {
      const linked = await db
        .select({ id: audienceSignals.id })
        .from(audienceSignals)
        .where(
          and(
            eq(audienceSignals.userId, deps.userId),
            eq(audienceSignals.linkedCandidateId, candidateId),
          ),
        );
      const count = linked.length;
      await db
        .update(candidates)
        .set({ demandCount: count, updatedAt: deps.now() })
        .where(
          and(
            eq(candidates.userId, deps.userId),
            eq(candidates.id, candidateId),
          ),
        );
      return count;
    },

    async topicsOverviewCounts() {
      // All user-scoped. Read the rows once and reduce in JS — the candidate pool is
      // small per user, and the card-emptiness split needs the jsonb card anyway.
      const sigRows = await db
        .select({
          source: audienceSignals.source,
          linkedCandidateId: audienceSignals.linkedCandidateId,
        })
        .from(audienceSignals)
        .where(eq(audienceSignals.userId, deps.userId));
      const signalsBySource: Record<string, number> = {};
      let signalsUnlinked = 0;
      for (const s of sigRows) {
        signalsBySource[s.source] = (signalsBySource[s.source] ?? 0) + 1;
        // 待收集 — a signal not yet tied to a Candidate (linkedCandidateId IS NULL).
        if (!s.linkedCandidateId) signalsUnlinked++;
      }

      const candRows = await db
        .select({ status: candidates.status, card: candidates.card })
        .from(candidates)
        .where(eq(candidates.userId, deps.userId));
      let poolWithCard = 0;
      let poolWithoutCard = 0;
      let droppedCount = 0;
      for (const c of candRows) {
        if (c.status === "dropped") {
          droppedCount++; // 已丢弃
          continue;
        }
        if (c.status !== "pool") continue; // promoted is counted via topic_promotions
        // 已补全 vs 待评估 — a pool candidate whose card carries a oneLiner has been
        // enriched (待补充/待决策); an empty card is 待评估.
        const card = (c.card ?? {}) as Record<string, unknown>;
        const enriched =
          typeof card.oneLiner === "string" && card.oneLiner.length > 0;
        if (enriched) poolWithCard++;
        else poolWithoutCard++;
      }

      const promoRows = await db
        .select({ id: topicPromotions.id })
        .from(topicPromotions)
        .where(eq(topicPromotions.userId, deps.userId));

      return {
        signalsTotal: sigRows.length,
        signalsUnlinked,
        signalsBySource,
        poolWithCard,
        poolWithoutCard,
        droppedCount,
        promotionsCount: promoRows.length,
      };
    },
  };
}
