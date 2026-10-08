import {factFilter} from "../../workspace-scope";
import {workspaceKey,workspaceFilter,workspaceStamp,assertWritableWorkspace} from "@creatoros/backend";
import {lockCandidateSupply} from "./candidate-supply-lock";
import { and, desc, eq, gte, lt, sql, type Db } from "@creatoros/backend";
import {
  candidates,
  audienceSignals,
  topicPromotions,
  topicPreferences,
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
// [T-212d] 防茧房校准:选题偏好信号行。
export type TopicPreferenceRow = typeof topicPreferences.$inferSelect;

export interface RepoDeps {
  now: () => string; // ISO-8601 clock (injected for deterministic tests)
  nextId: (prefix: string) => string; // id generator (deterministic in tests)
  userId: string; // the ownership boundary, baked in at construction
  // [T-332 S2] 第二属主维度(账号全域隔离,SPEC §2 ISO-02/03)。四表(candidates/
  // audience_signals/topic_promotions/topic_preferences)均 per-account(0042 起
  // account_id NOT NULL)。必填 string:service 入口经 requireAccountId 收窄后传入,
  // 未选号根本到不了 repo(引导态禁读写,不存在「null = 全局视图」退化)。
  accountId?: string | null;
  groupId?: string | null;
}

export type CandidateSort =
  | "predictedScore"
  | "positioningFit"
  | "demandCount"
  | "createdAt"
  // [T-216] 防茧房推荐排序 —— 非 SQL 列;service.listCandidates 在到达 repo 前拦截,
  // 路由到 rankTopicsWithGuardrails(偏好注入后分 + 探索位)。repo 若意外收到则 sortColumn
  // 默认回退 predictedScore(无害兜底)。
  | "guardrail";

export interface ListCandidatesQuery {
  status?: string;
  source?: string;
  sort?: CandidateSort;
  createdAfter?: string;
  limit?: number;
  offset?: number;
}

export interface CreateCandidateInput {
  idempotentId?: string;
  title: string;
  angle: string;
  source: string; // trend|benchmark|demand|idea
  contentRole: string | null;
  productAnchorId: string | null;
  positioningFit: number | null;
  predictedScore: number | null;
  aiTaskId: string | null;
  card?: Record<string, unknown>;
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
  // [T-212d] 淘汰原因(status→dropped 时带)—— 蒸馏偏好信号的原料。
  dropReason?: string | null;
}

// [T-212d] 偏好信号 upsert 入参。身份键 (userId, keyword, direction) —— 同一偏好累计强化(不新建平行行)。
export interface UpsertTopicPreferenceInput {
  keyword: string;
  direction: "avoid" | "prefer";
  signal: string;
  exampleCount: number; // 支持的淘汰原因数(护栏② 由 service 据此定 status)
  weight: number; // 已 ±10 封顶的权重(护栏① 由 service clamp 后传入)
  status: "candidate" | "active"; // service 据 isHardPreference 决定;archived 走 archiveExpired
}

export interface CreateSignalInput {
  /** 内部采集服务已验证真实 run/账号/Publication 后传入的冻结事实身份。 */
  verifiedCollection?: {groupId:string|null;accountId:string};
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
  // 评论粒度幂等锚 (T-065 → T-332 S2) — 形如 `douyin:comment:<cid>`。带锚时 createSignal 走
  // onConflictDoNothing(_v2:user+account+source+external_id 部分唯一索引),同号重复采集
  // 不重复入库;不同号各归其号。
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
  findPromotionByCandidateId(
    candidateId: string,
  ): Promise<TopicPromotionRow | undefined>;
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
  recomputeDemandCount(candidateId: string, factDerived?: boolean): Promise<number>;

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

  // ── [T-212d] 防茧房校准:淘汰原因 → 偏好信号 ─────────────────────────────────
  // 全部淘汰候选写过的原因(非空),供蒸馏聚类。user/account-scoped。
  listDropReasons(): Promise<string[]>;
  // 偏好信号 upsert(身份键 keyword+direction 归并;累计强化不新建平行行)。
  upsertTopicPreference(input: UpsertTopicPreferenceInput): Promise<TopicPreferenceRow>;
  // 已升级(active)的硬偏好 —— 注入选题评分用。
  listActiveTopicPreferences(): Promise<TopicPreferenceRow[]>;
  // 护栏③ 归档:lastReinforcedAt 早于 cutoff 的 active 偏好 → status=archived(过期不再注入)。
  archiveExpiredPreferences(cutoffIso: string): Promise<number>;
}

export function createCandidateRepository(
  db: Db,
  deps: RepoDeps,
): CandidateRepository {
  const scope = workspaceKey(deps);
  const stamp = workspaceStamp(scope);
  const writable = () => assertWritableWorkspace(db, {userId:deps.userId,...stamp,requestId:"shared-domain-write",source:"user"});
  function sortColumn(sort: CandidateSort | undefined) {
    switch (sort) {
      case "positioningFit":
        return candidates.positioningFit;
      case "demandCount":
        return candidates.demandCount;
      case "createdAt":
        return candidates.createdAt;
      case "predictedScore":
      default:
        return candidates.predictedScore;
    }
  }

  // [T-332 S2] 按号隔离条件门(每表一个,列相同语义)。strict:无条件
  // `workspaceFilter(table, scope)`(SPEC §4.1 全仓统一 strict,退化分支已删)。
  const candAccountGate = workspaceFilter(candidates, scope);
  const sigAccountGate = factFilter(audienceSignals, deps);
  const promoAccountGate = workspaceFilter(topicPromotions, scope);
  // [T-212d] 偏好信号按号读点门(与其它表同语义,strict)。
  const prefAccountGate = workspaceFilter(topicPreferences, scope);

  return {
    async seedCandidates(rows) {
      if (rows.length === 0) return;
      await db.insert(candidates).values(rows).onConflictDoNothing();
    },

    async listCandidates({
      status,
      source,
      sort,
      createdAfter,
      limit = 100,
      offset = 0,
    }) {
      const filters = [eq(candidates.userId, deps.userId), candAccountGate];
      if (status) filters.push(eq(candidates.status, status));
      if (source) filters.push(eq(candidates.source, source));
      if (createdAfter) filters.push(gte(candidates.createdAt, createdAfter));
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
      await writable();
      return db.transaction(async tx=>{
      await lockCandidateSupply(tx,deps);
      if (input.idempotentId) {
        const [existing] = await tx.select().from(candidates).where(and(
          eq(candidates.id, input.idempotentId), eq(candidates.userId, deps.userId), candAccountGate,
        )).limit(1);
        if (existing) return existing;
      }
      const inserted = await tx
        .insert(candidates)
        .values({
          id: input.idempotentId ?? deps.nextId("cand"),
          userId: deps.userId,
          // [T-332 S2] create stamp:归到当前号(service 经 requireAccountId 保证非空)。
          ...stamp,
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
          card: input.card ?? {},
          createdAt: deps.now(),
          updatedAt: deps.now(),
        })
        .returning();
      return inserted[0]!;
      });
    },

    async getCandidate(id) {
      const rows = await db
        .select()
        .from(candidates)
        .where(
          and(
            eq(candidates.userId, deps.userId),
            candAccountGate,
            eq(candidates.id, id),
          ),
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
            candAccountGate,
            eq(candidates.aiTaskId, aiTaskId),
          ),
        )
        .limit(1);
      return rows[0];
    },

    async patchCandidate(id, patch) {
      await writable();
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
      // [T-212d] 淘汰原因:随 status→dropped 落库(蒸馏原料)。显式传即写(含清空)。
      if (patch.dropReason !== undefined) set.dropReason = patch.dropReason;
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
          and(
            eq(candidates.userId, deps.userId),
            candAccountGate,
            eq(candidates.id, id),
          ),
        )
        .returning();
      return updated[0]!;
    },

    async enrichCard(id, card) {
      await writable();
      await this.getCandidate(id); // ownership gate
      const updated = await db
        .update(candidates)
        .set({ card, updatedAt: deps.now() })
        .where(
          and(
            eq(candidates.userId, deps.userId),
            candAccountGate,
            eq(candidates.id, id),
          ),
        )
        .returning();
      return updated[0]!;
    },

    async setPromoted(id) {
      await writable();
      await this.getCandidate(id); // ownership gate
      const updated = await db
        .update(candidates)
        .set({ status: "promoted", updatedAt: deps.now() })
        .where(
          and(
            eq(candidates.userId, deps.userId),
            candAccountGate,
            eq(candidates.id, id),
          ),
        )
        .returning();
      return updated[0]!;
    },

    async createPromotion(input) {
      await writable();
      const parent=await this.getCandidate(input.candidateId);
      if(parent.groupId)await assertWritableWorkspace(db,{userId:deps.userId,groupId:parent.groupId,requestId:"parent-write",source:"user"});
      const inserted = await db
        .insert(topicPromotions)
        .values({
          id: deps.nextId("promo"),
          userId: deps.userId,
          // [T-332 S2] create stamp:晋升记录归到当前号(必有号)。
          ...stamp, groupId: parent.groupId ?? stamp.groupId,
          candidateId: input.candidateId,
          projectId: input.projectId,
          promotedAt: deps.now(),
        })
        .returning();
      return inserted[0]!;
    },

    async findPromotionByCandidateId(candidateId) {
      const rows = await db
        .select()
        .from(topicPromotions)
        .where(
          and(
            eq(topicPromotions.userId, deps.userId),
            promoAccountGate,
            eq(topicPromotions.candidateId, candidateId),
          ),
        )
        .limit(1);
      return rows[0];
    },

    async createSignal(input) {
      if (!input.verifiedCollection) await writable();
      else if(input.verifiedCollection.accountId!==deps.accountId)throw new OwnershipError("采集事实账号不匹配");
      if (!deps.accountId) throw new OwnershipError("采集信号需要真实平台账号");
      const values = {
        id: deps.nextId("sig"),
        userId: deps.userId,
        // [T-332 S2] create stamp:采集/信号归到当前号。幂等锚已升级为
        // ux_audience_signals_user_source_external_v2 (user, account, source, external_id)
        // (迁移 0042)—— 同一评论被两个号各自采集,各归其号,不再被先入库的号吞掉
        // (T-136 时代自认的设计缺陷在此关闭)。
        ...stamp, groupId: input.verifiedCollection ? input.verifiedCollection.groupId : stamp.groupId, accountId: deps.accountId,
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
      // T-065 评论粒度幂等:带 external_id 的写入撞
      // ux_audience_signals_user_source_external_v2(user+account+source+external_id
      // 部分唯一索引,迁移 0042)即跳过,返回已存在行 + inserted=false。conflict target
      // 必须与 _v2 索引列完全一致(含 account_id),否则 PG 找不到匹配约束直接报错。
      // 无锚(external_id 空,dm/consultation 等)保持原样直插。
      if (input.externalId) {
        const inserted = await db
          .insert(audienceSignals)
          .values(values)
          .onConflictDoNothing({
            target: [
              audienceSignals.userId,
              audienceSignals.accountId,
              audienceSignals.source,
              audienceSignals.externalId,
            ],
            // 部分唯一索引的谓词(ON CONFLICT ... WHERE external_id IS NOT NULL)。
            where: sql`${audienceSignals.externalId} IS NOT NULL`,
          })
          .returning();
        if (inserted[0]) return { row: inserted[0], inserted: true };
        // 回读已存在行:同样叠 account 条件 —— _v2 键下同 (source, external_id) 可在
        // 别的号名下另有一行,必须回读**本号**那行。
        const existing = await db
          .select()
          .from(audienceSignals)
          .where(
            and(
              eq(audienceSignals.userId, deps.userId),
              input.verifiedCollection ? eq(audienceSignals.accountId,deps.accountId) : sigAccountGate,
              eq(audienceSignals.source, input.source),
              eq(audienceSignals.externalId, input.externalId),
            ),
          );
        if(!existing[0])throw new OwnershipError("评论幂等锚不属于当前采集账号");
        return { row: existing[0], inserted: false };
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
            sigAccountGate,
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
      const filters = [eq(audienceSignals.userId, deps.userId), sigAccountGate];
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
            sigAccountGate,
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
            sigAccountGate,
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
            sigAccountGate,
            eq(audienceSignals.ingestionRunId, ingestionRunId),
            eq(audienceSignals.rawText, rawText),
          ),
        )
        .limit(1);
      return rows[0];
    },

    async linkSignal(signalId, candidateId) {
      await writable();
      await this.getSignal(signalId); // ownership gate
      await this.getCandidate(candidateId); // both association endpoints belong to the workspace
      const updated = await db
        .update(audienceSignals)
        .set({ linkedCandidateId: candidateId })
        .where(
          and(
            eq(audienceSignals.userId, deps.userId),
            sigAccountGate,
            eq(audienceSignals.id, signalId),
          ),
        )
        .returning();
      return updated[0]!;
    },

    async recomputeDemandCount(candidateId, factDerived = false) {
      if(!factDerived)await writable();
      await this.getCandidate(candidateId);
      const linked = await db
        .select({ id: audienceSignals.id })
        .from(audienceSignals)
        .where(
          and(
            eq(audienceSignals.userId, deps.userId),
            workspaceFilter(audienceSignals,scope),
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
            candAccountGate,
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
        .where(and(eq(audienceSignals.userId, deps.userId), sigAccountGate));
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
        .where(and(eq(candidates.userId, deps.userId), candAccountGate));
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
        .where(and(eq(topicPromotions.userId, deps.userId), promoAccountGate));

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

    // ── [T-212d] 防茧房校准 ──────────────────────────────────────────────────
    async listDropReasons() {
      const rows = await db
        .select({ dropReason: candidates.dropReason })
        .from(candidates)
        .where(
          and(
            eq(candidates.userId, deps.userId),
            candAccountGate,
            eq(candidates.status, "dropped"),
          ),
        )
        .orderBy(desc(candidates.updatedAt), candidates.id);
      return rows
        .map((r) => (r.dropReason ?? "").trim())
        .filter((s) => s.length > 0);
    },

    async upsertTopicPreference(input) {
      await writable();
      const nowTs = deps.now();
      // [T-326 DATA-H02 → T-332 S2] 身份键 ux_topic_preferences_identity_v2
      // (user_id, account_id, keyword, direction)(迁移 0041):同号命中即累计强化
      // (更新计数/权重/信号 + 刷新 last_reinforced_at 重置 8 周衰减时钟,并复活可能
      // 已归档的行 → 回到传入 status);不同号互不冲突 → 第二账号的偏好独立成行,
      // 不再改写第一账号数据。account_id 自 0042 起 NOT NULL(未选号在 service 已被拦)。
      const inserted = await db
        .insert(topicPreferences)
        .values({
          id: deps.nextId("tpref"),
          userId: deps.userId,
          ...stamp,
          keyword: input.keyword,
          direction: input.direction,
          signal: input.signal,
          exampleCount: input.exampleCount,
          weight: input.weight,
          status: input.status,
          createdAt: nowTs,
          updatedAt: nowTs,
          lastReinforcedAt: nowTs,
        })
        .onConflictDoUpdate({
          target: [
            topicPreferences.userId,
            scope.kind === "group" ? topicPreferences.groupId : topicPreferences.accountId,
            topicPreferences.keyword,
            topicPreferences.direction,
          ],
          targetWhere: scope.kind === "group" ? sql`${topicPreferences.groupId} IS NOT NULL` : sql`${topicPreferences.accountId} IS NOT NULL`,
          set: {
            signal: input.signal,
            exampleCount: input.exampleCount,
            weight: input.weight,
            status: input.status,
            updatedAt: nowTs,
            lastReinforcedAt: nowTs,
          },
        })
        .returning();
      return inserted[0]!;
    },

    async listActiveTopicPreferences() {
      return db
        .select()
        .from(topicPreferences)
        .where(
          and(
            eq(topicPreferences.userId, deps.userId),
            prefAccountGate,
            eq(topicPreferences.status, "active"),
          ),
        )
        .orderBy(desc(topicPreferences.updatedAt));
    },

    async archiveExpiredPreferences(cutoffIso) {
      await writable();
      const updated = await db
        .update(topicPreferences)
        .set({ status: "archived", updatedAt: deps.now() })
        .where(
          and(
            eq(topicPreferences.userId, deps.userId),
            prefAccountGate,
            eq(topicPreferences.status, "active"),
            lt(topicPreferences.lastReinforcedAt, cutoffIso),
          ),
        )
        .returning({ id: topicPreferences.id });
      return updated.length;
    },
  };
}
