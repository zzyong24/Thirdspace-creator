import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNull,
  or,
  sql,
  type Db,
} from "@creatoros/backend";
import {
  metricSnapshots,
  metricValues,
  retentionPoints,
  audienceSnapshots,
} from "./analytics.db-schema";

// Analytics repository (foundation §5.2) — user-scoped queries ONLY. The
// denormalized `user_id` lives on EVERY metric row; every read filters
// `eq(table.userId, userId)` and every write stamps `userId`. Unlike the
// publishing/knowledge repos, `userId` is NOT baked into deps — it is passed PER
// CALL (the plan's RepoDeps shape minus the per-repo userId), because the metric
// store is append-only and shared across the service's read/write seams.
//
// Append is IDEMPOTENT (SPEC §22): `INSERT … ON CONFLICT (publication_id, source,
// captured_at) DO NOTHING RETURNING *`; when nothing comes back the snapshot
// already exists, so we SELECT it user-scoped and return `{ created:false }`.
// Child `metric_values` rows are inserted ONLY when the snapshot was created, so a
// re-submission never duplicates value rows. Analytics owns no state machine —
// there is no update/delete path (append-only fact store).

export type MetricSnapshotRow = typeof metricSnapshots.$inferSelect;
export type MetricValueRow = typeof metricValues.$inferSelect;
export type RetentionPointRow = typeof retentionPoints.$inferSelect;
export type AudienceSnapshotRow = typeof audienceSnapshots.$inferSelect;

export interface RepoDeps {
  now: () => string; // ISO-8601 clock (injected for deterministic tests)
  nextId: (prefix: string) => string; // id generator (deterministic in tests)
}

export interface AppendValueInput {
  metricKey: string;
  numericValue: number;
  unit?: string;
  dimensions?: Record<string, string>;
}

export interface AppendSnapshotInput {
  publicationId: string;
  ingestionRunId?: string | null;
  capturedAt: string;
  source: string;
  rawMetrics?: Record<string, unknown>;
  values?: ReadonlyArray<AppendValueInput>;
  // [T-136 §D 切片 c] 采集结果按号 stamp —— metric_snapshots / metric_values 归到「哪个号」。
  //   service 从 ctx.accountId 透传;null = 未选号 / 存量兜底(nullable 稳定终态)。读侧(复盘/
  //   看板)按号隔离归切片 d/消费面,此处只保证写 stamp(采集数据无号归属 = 切号看不到)。
  accountId?: string | null;
}

export interface Page<T> {
  rows: T[];
  total: number;
}

// GAP-DASH-2 data layer — the per-user dashboard rollup the repo computes by
// reducing one "latest snapshot per publication" row set. Sums are over count
// metrics; ctr/finish are averaged across the contributing snapshots. snapshotCount
// is the number of latest-per-publication snapshots that fed the rollup (0 when the
// user has no snapshots at all).
export interface DashboardRollup {
  /** [T-071] 带明细字段(finish_rate/follower_gain)的发布数 —— 0 = 上层显「—」。 */
  finishCount: number;
  plays: number;
  likes: number;
  comments: number;
  shares: number;
  favorites: number;
  followerGain: number;
  ctrAvg: number;
  finishAvg: number;
  snapshotCount: number;
}

export interface AnalyticsRepository {
  seedSnapshots(rows: MetricSnapshotRow[]): Promise<void>;
  seedValues(rows: MetricValueRow[]): Promise<void>;
  seedRetentionPoints(rows: RetentionPointRow[]): Promise<void>;
  seedAudienceSnapshots(rows: AudienceSnapshotRow[]): Promise<void>;
  appendSnapshot(
    userId: string,
    input: AppendSnapshotInput,
  ): Promise<{ snapshot: MetricSnapshotRow; created: boolean }>;
  listSnapshotsByPublication(
    userId: string,
    publicationId: string,
    page: number,
    pageSize: number,
  ): Promise<Page<MetricSnapshotRow>>;
  listSnapshotsByProject(
    userId: string,
    publicationIds: ReadonlyArray<string>,
    page: number,
    pageSize: number,
  ): Promise<Page<MetricSnapshotRow>>;
  listValuesBySnapshot(
    userId: string,
    metricSnapshotId: string,
  ): Promise<MetricValueRow[]>;
  // GAP-DASH-2 — user-scoped aggregate read over metric_snapshots ONLY. For each
  // of the user's publications, take the snapshot with the MAX(captured_at), then
  // sum the count rawMetrics and average ctr/finish_rate across those latest
  // snapshots. No snapshots → all-zero rollup, snapshotCount 0 (never throws).
  // 数据底座(SPEC §1.4):可选 publicationIds 把聚合收窄到给定发布集(imported 让位);
  //   传空数组 → 显式空集 → all-zero rollup;不传 → 全量 user-scoped(行为不变)。
  /**
   * [T-071] 真逐日播放趋势:近 days 天,每 publication 每日取当日最新快照的累计
   * 播放,按日求和后与前一日差分 = 当日新增播放。第一天无前日基线不产点;有效
   * 天数 < 2 → 空数组(上层显引导,不编固定形状假曲线)。
   */
  // [T-326 DATA-H01] 聚合读贯穿 accountId(语义 =「当前号 OR 未标记」:有号 →
  // (account_id = 号 OR account_id IS NULL),存量 NULL 快照不消失;无号/缺省 → 全量
  // user-scoped,现状不变)。写侧 stamp(appendSnapshot)早已按号;此前读侧只按 user →
  // 两个号的趋势/dashboard 混读,本参数补上读门。by-id 读(listSnapshotsByPublication /
  // listSnapshotsByProject / listValuesBySnapshot)不加号门:publication id 已经过 Publishing
  // 的所有权/按号解析,一条 publication 的快照不可能跨号混。
  getDailyPlayTrend(
    userId: string,
    publicationIds: readonly string[] | undefined,
    days: number,
    accountId?: string | null,
  ): Promise<Array<{ day: string; plays: number }>>;

  getDashboardRollup(
    userId: string,
    publicationIds?: readonly string[],
    accountId?: string | null,
  ): Promise<DashboardRollup>;
  // [T-200] 认领存量 account_id IS NULL 的 metric_snapshots + metric_values 给 accountId
  //   (该 user 名下)。修采集在无号 ctx 下落的 null 号(串号根因)。幂等;返回 { snapshots, values }。
  claimOrphanMetrics(
    userId: string,
    accountId: string,
  ): Promise<{ snapshots: number; values: number }>;
}

export function createAnalyticsRepository(
  db: Db,
  deps: RepoDeps,
): AnalyticsRepository {
  return {
    async claimOrphanMetrics(userId, accountId) {
      const snaps = await db
        .update(metricSnapshots)
        .set({ accountId })
        .where(
          and(
            eq(metricSnapshots.userId, userId),
            isNull(metricSnapshots.accountId),
          ),
        )
        .returning({ id: metricSnapshots.id });
      const vals = await db
        .update(metricValues)
        .set({ accountId })
        .where(
          and(eq(metricValues.userId, userId), isNull(metricValues.accountId)),
        )
        .returning({ id: metricValues.id });
      return { snapshots: snaps.length, values: vals.length };
    },

    async seedSnapshots(rows) {
      if (rows.length === 0) return;
      await db.insert(metricSnapshots).values(rows).onConflictDoNothing();
    },
    async seedValues(rows) {
      if (rows.length === 0) return;
      await db.insert(metricValues).values(rows).onConflictDoNothing();
    },
    async seedRetentionPoints(rows) {
      if (rows.length === 0) return;
      await db.insert(retentionPoints).values(rows).onConflictDoNothing();
    },
    async seedAudienceSnapshots(rows) {
      if (rows.length === 0) return;
      await db.insert(audienceSnapshots).values(rows).onConflictDoNothing();
    },

    async appendSnapshot(userId, input) {
      const id = deps.nextId("ms");
      // Idempotent insert on the UNIQUE (publication_id, source, captured_at)
      // anchor. ON CONFLICT DO NOTHING + RETURNING gives us the inserted row, or
      // nothing if the snapshot already exists.
      const inserted = await db
        .insert(metricSnapshots)
        .values({
          id,
          userId,
          // [T-136 §D 切片 c] 采集 stamp:快照归到当前号(null 兜底 → 存量 / 未选号)。
          accountId: input.accountId ?? null,
          publicationId: input.publicationId,
          ingestionRunId: input.ingestionRunId ?? null,
          capturedAt: input.capturedAt,
          source: input.source,
          rawMetrics: input.rawMetrics ?? {},
          createdAt: deps.now(),
        })
        .onConflictDoNothing({
          target: [
            metricSnapshots.publicationId,
            metricSnapshots.source,
            metricSnapshots.capturedAt,
          ],
        })
        .returning();

      const created = inserted.length > 0;
      if (created) {
        const snapshot = inserted[0]!;
        // Insert child value rows ONLY on first create (no duplicate value rows).
        const values = input.values ?? [];
        if (values.length > 0) {
          await db.insert(metricValues).values(
            values.map((v) => ({
              id: deps.nextId("mv"),
              userId,
              // [T-136] 子指标值随快照 stamp 同一号(承 snapshot.accountId)。
              accountId: input.accountId ?? null,
              metricSnapshotId: snapshot.id,
              metricKey: v.metricKey,
              numericValue: v.numericValue,
              unit: v.unit ?? "",
              dimensions: v.dimensions ?? {},
            })),
          );
        }
        return { snapshot, created: true };
      }

      // Conflict — the snapshot already exists. SELECT it user-scoped.
      const existing = await db
        .select()
        .from(metricSnapshots)
        .where(
          and(
            eq(metricSnapshots.userId, userId),
            eq(metricSnapshots.publicationId, input.publicationId),
            eq(metricSnapshots.source, input.source),
            eq(metricSnapshots.capturedAt, input.capturedAt),
          ),
        );
      return { snapshot: existing[0]!, created: false };
    },

    async listSnapshotsByPublication(userId, publicationId, page, pageSize) {
      const where = and(
        eq(metricSnapshots.userId, userId),
        eq(metricSnapshots.publicationId, publicationId),
      );
      const rows = await db
        .select()
        .from(metricSnapshots)
        .where(where)
        .orderBy(desc(metricSnapshots.capturedAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize);
      const totalRows = await db
        .select({ value: sql<number>`count(*)` })
        .from(metricSnapshots)
        .where(where);
      return { rows, total: Number(totalRows[0]?.value ?? 0) };
    },

    async listSnapshotsByProject(userId, publicationIds, page, pageSize) {
      if (publicationIds.length === 0) return { rows: [], total: 0 };
      const where = and(
        eq(metricSnapshots.userId, userId),
        inArray(metricSnapshots.publicationId, [...publicationIds]),
      );
      const rows = await db
        .select()
        .from(metricSnapshots)
        .where(where)
        .orderBy(desc(metricSnapshots.capturedAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize);
      const totalRows = await db
        .select({ value: sql<number>`count(*)` })
        .from(metricSnapshots)
        .where(where);
      return { rows, total: Number(totalRows[0]?.value ?? 0) };
    },

    async listValuesBySnapshot(userId, metricSnapshotId) {
      return db
        .select()
        .from(metricValues)
        .where(
          and(
            eq(metricValues.userId, userId),
            eq(metricValues.metricSnapshotId, metricSnapshotId),
          ),
        )
        .orderBy(asc(metricValues.metricKey));
    },

    async getDailyPlayTrend(userId, publicationIds, days, accountId) {
      // [T-071] 真逐日趋势:替换掉「总量按固定周形状分摊」的假曲线(用户实锤)。
      // 每 (publication, 日) 取当日最新快照的累计播放 → 按日求和 → 与前一日差分 =
      // 当日新增播放。第一天没有前日基线,不产点;有效点 < 2 → 空(上层显引导)。
      if (publicationIds && publicationIds.length === 0) return [];
      // [T-326 DATA-H01] 按号门(当前号 or 未标记);无号 → undefined → and() 忽略。
      const accountGate = accountId
        ? or(
            eq(metricSnapshots.accountId, accountId),
            isNull(metricSnapshots.accountId),
          )
        : undefined;
      const rows = await db
        .select()
        .from(metricSnapshots)
        .where(
          and(
            eq(metricSnapshots.userId, userId),
            accountGate,
            publicationIds
              ? inArray(metricSnapshots.publicationId, [...publicationIds])
              : undefined,
          ),
        )
        .orderBy(desc(metricSnapshots.capturedAt));
      const numOf = (m: Record<string, unknown>, key: string): number => {
        const v = m[key];
        const n = typeof v === "number" ? v : Number(v);
        return Number.isFinite(n) ? n : 0;
      };
      // (publicationId, day) → 当日最新累计播放(rows DESC,首见即最新)。
      const byPubDay = new Map<string, number>();
      const daysSeen = new Set<string>();
      for (const row of rows) {
        const day = row.capturedAt.slice(0, 10);
        const key = `${row.publicationId}|${day}`;
        if (byPubDay.has(key)) continue;
        const m = (row.rawMetrics ?? {}) as Record<string, unknown>;
        byPubDay.set(key, numOf(m, "views") || numOf(m, "plays"));
        daysSeen.add(day);
      }
      const sorted = [...daysSeen].sort().slice(-days - 1); // 多取一天做差分基线
      // 每日总累计 = Σ 各 publication 当日值;某作品当日没采,沿用其最近一次已知值
      // (否则日总量会因漏采作品而假跌)。
      const perPubLast = new Map<string, number>();
      const dailyTotals: Array<{ day: string; total: number }> = [];
      const pubIds = new Set([...byPubDay.keys()].map((k) => k.split("|")[0]!));
      for (const day of sorted) {
        for (const pid of pubIds) {
          const v = byPubDay.get(`${pid}|${day}`);
          if (v !== undefined) perPubLast.set(pid, v);
        }
        let total = 0;
        for (const v of perPubLast.values()) total += v;
        dailyTotals.push({ day, total });
      }
      const trend: Array<{ day: string; plays: number }> = [];
      for (let i = 1; i < dailyTotals.length; i += 1) {
        trend.push({
          day: dailyTotals[i]!.day,
          // 累计理论上单调增;采集口径波动出现负值时如实夹 0,不显负播放。
          plays: Math.max(0, dailyTotals[i]!.total - dailyTotals[i - 1]!.total),
        });
      }
      return trend.slice(-days);
    },

    async getDashboardRollup(userId, publicationIds, accountId) {
      // Pull ALL of the user's snapshots newest-first, then in JS keep the first
      // (newest) row per publicationId. Data volume per user is small, so the
      // dedup-then-reduce path is correct and simple (the task explicitly allows
      // JS aggregation over a SQL window join). Query touches metric_snapshots
      // ONLY — no cross-module read.
      // 数据底座(SPEC §1.4):若给定 publicationIds,把汇总收窄到这批发布(imported 让位)。
      //   空数组 = 显式空集 → 直接返回 all-zero(不触库,避免 inArray([]) 的歧义);
      //   undefined = 全量 user-scoped(过渡期行为不变)。
      if (publicationIds && publicationIds.length === 0) {
        return {
          plays: 0,
          likes: 0,
          comments: 0,
          shares: 0,
          favorites: 0,
          followerGain: 0,
          ctrAvg: 0,
          finishAvg: 0,
          finishCount: 0,
          snapshotCount: 0,
        };
      }
      // [T-326 DATA-H01] 按号门(当前号 or 未标记):写侧早已 stamp accountId,读侧此前
      // 只按 user → 两个号的 dashboard 混读。无号 → undefined → and() 忽略(现状不变)。
      const accountGate = accountId
        ? or(
            eq(metricSnapshots.accountId, accountId),
            isNull(metricSnapshots.accountId),
          )
        : undefined;
      const rows = await db
        .select()
        .from(metricSnapshots)
        .where(
          and(
            eq(metricSnapshots.userId, userId),
            accountGate,
            publicationIds
              ? inArray(metricSnapshots.publicationId, [...publicationIds])
              : undefined,
          ),
        )
        .orderBy(desc(metricSnapshots.capturedAt));

      const latestByPublication = new Map<string, MetricSnapshotRow>();
      // [T-071] 明细字段(finish_rate/follower_gain/ctr)只在 self.detail 明细采集的
      // 快照里有;基础采集(views/likes/…)没有。每 publication 另记「最新一条带明细
      // 字段的快照」,防止最新恰为基础快照时把完播率稀释成 0(用户实锤的假 0.0%)。
      const latestDetailByPublication = new Map<string, MetricSnapshotRow>();
      // Coerce a jsonb value to a finite number (missing / non-numeric → 0).
      const num = (raw: Record<string, unknown>, key: string): number => {
        const v = raw[key];
        const n = typeof v === "number" ? v : Number(v);
        return Number.isFinite(n) ? n : 0;
      };
      const hasNumericMetric = (
        raw: Record<string, unknown>,
        key: string,
      ): boolean =>
        Object.prototype.hasOwnProperty.call(raw, key) &&
        Number.isFinite(
          typeof raw[key] === "number" ? raw[key] : Number(raw[key]),
        );
      for (const row of rows) {
        // First occurrence wins = newest captured_at (rows are DESC-ordered).
        if (!latestByPublication.has(row.publicationId)) {
          latestByPublication.set(row.publicationId, row);
        }
        const m = (row.rawMetrics ?? {}) as Record<string, unknown>;
        if (
          !latestDetailByPublication.has(row.publicationId) &&
          (hasNumericMetric(m, "finish_rate") ||
            hasNumericMetric(m, "follower_gain"))
        ) {
          latestDetailByPublication.set(row.publicationId, row);
        }
      }

      const latest = [...latestByPublication.values()];
      const rollup: DashboardRollup = {
        plays: 0,
        likes: 0,
        comments: 0,
        shares: 0,
        favorites: 0,
        followerGain: 0,
        ctrAvg: 0,
        finishAvg: 0,
        finishCount: 0,
        snapshotCount: latest.length,
      };
      if (latest.length === 0) return rollup;

      // 数据底座(SPEC §1.4):播放量在真采集与演示 fixture 里键名不同 —— 真实抖音
      //   ingestion(douyin-cdp toMetricRecords)写 `views`,演示 fixture 写 `plays`。读侧
      //   归一:优先取真采集的 `views`,缺失再回退 fixture 的 `plays`(单值取大于 0 者,
      //   二者本不并存)。其余键(likes/comments/shares/favorites)两侧一致,不需归一。
      const playsOf = (m: Record<string, unknown>): number =>
        num(m, "views") || num(m, "plays");

      for (const snap of latest) {
        const m = (snap.rawMetrics ?? {}) as Record<string, unknown>;
        rollup.plays += playsOf(m);
        rollup.likes += num(m, "likes");
        rollup.comments += num(m, "comments");
        rollup.shares += num(m, "shares");
        rollup.favorites += num(m, "favorites");
      }
      // [T-071] 均值/增量只在「带明细字段的快照」上算,分母 = 有值的发布数;一个都
      // 没有 → finishCount 0,上层据此显「—」而不是假 0.0%。
      let ctrSum = 0;
      let finishSum = 0;
      const detailRows = [...latestDetailByPublication.values()];
      for (const snap of detailRows) {
        const m = (snap.rawMetrics ?? {}) as Record<string, unknown>;
        rollup.followerGain += num(m, "follower_gain");
        ctrSum += num(m, "ctr");
        finishSum += num(m, "finish_rate");
      }
      rollup.finishCount = detailRows.length;
      rollup.ctrAvg = detailRows.length > 0 ? ctrSum / detailRows.length : 0;
      rollup.finishAvg =
        detailRows.length > 0 ? finishSum / detailRows.length : 0;
      return rollup;
    },
  };
}
