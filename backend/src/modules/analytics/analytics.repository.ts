import {
  and,
  asc,
  desc,
  eq,
  inArray,
  sql,
  type Db,
} from "@creatoros/backend";
import {
  metricSnapshots,
  metricValues,
  retentionPoints,
  audienceSnapshots,
} from "./analytics.db-schema";

// Analytics repository (foundation §5.2) — user + account 双维 scoped queries ONLY.
// The denormalized `user_id` AND `account_id` live on EVERY metric row; every read
// filters `eq(table.userId, userId) AND eq(table.accountId, accountId)`(strict,
// T-332 S2 —— 旧「当前号 OR account_id IS NULL」lenient 门已随用户拍板 ② 退役)and
// every write stamps both. Unlike the publishing/knowledge repos, `userId` /
// `accountId` are NOT baked into deps — they are passed PER CALL(accountId 必填
// string,由 service 层 requireAccountId 断言后传入;未选号根本到不了 repo), because
// the metric store is append-only and shared across the service's read/write seams.
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
  // [T-332 S2] 采集结果按号 stamp(strict)—— metric_snapshots / metric_values 归到「哪个号」。
  //   必填:service 层经 requireAccountId(input.accountId ?? ctx.accountId) 断言后传入,
  //   不存在「null = 未选号兜底」的写路径(schema 已 NOT NULL,S1 收口)。
  accountId: string;
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
  // [T-332 S2] 所有读一律 user + account 双维 strict(accountId 必填,service 断言后传入)。
  listSnapshotsByPublication(
    userId: string,
    accountId: string,
    publicationId: string,
    page: number,
    pageSize: number,
  ): Promise<Page<MetricSnapshotRow>>;
  listSnapshotsByProject(
    userId: string,
    accountId: string,
    publicationIds: ReadonlyArray<string>,
    page: number,
    pageSize: number,
  ): Promise<Page<MetricSnapshotRow>>;
  listLatestSnapshotsByPublicationIds(
    userId: string,
    accountId: string,
    publicationIds: ReadonlyArray<string>,
  ): Promise<MetricSnapshotRow[]>;
  listValuesBySnapshot(
    userId: string,
    accountId: string,
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
  // [T-332 S2] 聚合读贯穿 accountId(strict eq,必填):两个号的趋势/dashboard 绝不混读。
  // 旧「当前号 OR 未标记(IS NULL)」lenient 语义及「无号 → 全量」退化均已退役(拍板 ②)。
  // by-id 读(listSnapshotsByPublication / listSnapshotsByProject / listValuesBySnapshot)
  // 同样叠 strict 号门:与 strict 列表保持同一语义面,不留「列表看不见但 by-id 能读」裂缝。
  // 空集语义:当前号无数据 → 返回空数组([]),不产 NULL(聚合在 JS 层 reduce,无 SQL
  // sum/avg 的 NULL 行为)。
  getDailyPlayTrend(
    userId: string,
    accountId: string,
    publicationIds: readonly string[] | undefined,
    days: number,
  ): Promise<Array<{ day: string; plays: number }>>;

  // 空集语义:当前号无快照 → all-zero rollup(snapshotCount 0),字段全 0,不产 NULL。
  getDashboardRollup(
    userId: string,
    accountId: string,
    publicationIds?: readonly string[],
  ): Promise<DashboardRollup>;
}

export function createAnalyticsRepository(
  db: Db,
  deps: RepoDeps,
): AnalyticsRepository {
  return {
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
          // [T-332 S2] 采集 stamp:快照出生即归当前号(strict,必填,无 null 兜底)。
          accountId: input.accountId,
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
              // [T-332 S2] 子指标值随快照 stamp 同一号(strict,承 snapshot.accountId)。
              accountId: input.accountId,
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

      // Conflict — the snapshot already exists. SELECT it user + account scoped
      // ([T-332 S2] strict:同一 publication 的快照恒同号 —— ingestion ctx 账号由 job 行
      // 派生,不可能跨号;命中不到 = 冲突行归属别的号,是数据 bug,诚实抛错不静默)。
      const existing = await db
        .select()
        .from(metricSnapshots)
        .where(
          and(
            eq(metricSnapshots.userId, userId),
            eq(metricSnapshots.accountId, input.accountId),
            eq(metricSnapshots.publicationId, input.publicationId),
            eq(metricSnapshots.source, input.source),
            eq(metricSnapshots.capturedAt, input.capturedAt),
          ),
        );
      const snapshot = existing[0];
      if (!snapshot) {
        throw new Error(
          `analytics 数据 bug:快照幂等锚 (${input.publicationId}, ${input.source}, ${input.capturedAt}) ` +
            `冲突但命中行不属当前号 ${input.accountId} —— 同一 publication 的快照不可能跨号,请排查采集调用链。`,
        );
      }
      return { snapshot, created: false };
    },

    async listSnapshotsByPublication(userId, accountId, publicationId, page, pageSize) {
      // [T-332 S2] strict 双维门(user + account):跨号 publicationId → 空页,与列表同语义。
      const where = and(
        eq(metricSnapshots.userId, userId),
        eq(metricSnapshots.accountId, accountId),
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

    async listSnapshotsByProject(userId, accountId, publicationIds, page, pageSize) {
      if (publicationIds.length === 0) return { rows: [], total: 0 };
      // [T-332 S2] strict 双维门(user + account)。
      const where = and(
        eq(metricSnapshots.userId, userId),
        eq(metricSnapshots.accountId, accountId),
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

    async listLatestSnapshotsByPublicationIds(
      userId,
      accountId,
      publicationIds,
    ) {
      if (publicationIds.length === 0) return [];
      return db
        .selectDistinctOn([metricSnapshots.publicationId])
        .from(metricSnapshots)
        .where(
          and(
            eq(metricSnapshots.userId, userId),
            eq(metricSnapshots.accountId, accountId),
            inArray(metricSnapshots.publicationId, [...publicationIds]),
          ),
        )
        .orderBy(
          asc(metricSnapshots.publicationId),
          desc(metricSnapshots.capturedAt),
          desc(metricSnapshots.id),
        );
    },

    async listValuesBySnapshot(userId, accountId, metricSnapshotId) {
      // [T-332 S2] strict 双维门(user + account):跨号 snapshotId → 空数组。
      return db
        .select()
        .from(metricValues)
        .where(
          and(
            eq(metricValues.userId, userId),
            eq(metricValues.accountId, accountId),
            eq(metricValues.metricSnapshotId, metricSnapshotId),
          ),
        )
        .orderBy(asc(metricValues.metricKey));
    },

    async getDailyPlayTrend(userId, accountId, publicationIds, days) {
      // [T-071] 真逐日趋势:替换掉「总量按固定周形状分摊」的假曲线(用户实锤)。
      // 每 (publication, 日) 取当日最新快照的累计播放 → 按日求和 → 与前一日差分 =
      // 当日新增播放。第一天没有前日基线,不产点;有效点 < 2 → 空(上层显引导)。
      // 空集语义:当前号无快照 → rows 空 → 返回 [](JS 差分,无 SQL NULL 风险)。
      if (publicationIds && publicationIds.length === 0) return [];
      // SEMANTIC_BOUNDARY_ALLOW: 仅收窄既有时间/快照读取，保持最近采样日与差分口径，不做内容判断。
      const scope = and(
        eq(metricSnapshots.userId, userId),
        eq(metricSnapshots.accountId, accountId),
        publicationIds ? inArray(metricSnapshots.publicationId, [...publicationIds]) : undefined,
      );
      const dayKey = sql<string>`left(${metricSnapshots.capturedAt}, 10)`;
      // 一条 SQL 使用同一数据库快照；稀疏历史数据不能偷换成 now - days。
      const recentDays = db.selectDistinct({ day: dayKey.as("day") })
        .from(metricSnapshots).where(scope).orderBy(desc(dayKey)).limit(days + 1);
      const rows = await db
        .selectDistinctOn([metricSnapshots.publicationId, dayKey], {
          publicationId: metricSnapshots.publicationId,
          capturedAt: metricSnapshots.capturedAt,
          rawMetrics: sql<Record<string, unknown>>`jsonb_build_object('views', ${metricSnapshots.rawMetrics}->'views', 'plays', ${metricSnapshots.rawMetrics}->'plays')`,
        })
        .from(metricSnapshots)
        .where(and(scope, inArray(dayKey, recentDays)))
        .orderBy(asc(metricSnapshots.publicationId), asc(dayKey), desc(metricSnapshots.capturedAt), desc(metricSnapshots.id));
      const numOf = (m: Record<string, unknown>, key: string): number => {
        const v = m[key];
        const n = typeof v === "number" ? v : Number(v);
        return Number.isFinite(n) ? n : 0;
      };
      // (publicationId, day) → SQL 已选出的当日最新累计播放。
      const byPubDay = new Map<string, number>();
      const daysSeen = new Set<string>();
      for (const row of rows) {
        const day = row.capturedAt.slice(0, 10);
        const key = `${row.publicationId}|${day}`;
        if (byPubDay.has(key)) continue;
        const m = (row.rawMetrics ?? {}) as Record<string, unknown>;
        byPubDay.set(key, m.views == null ? numOf(m, "plays") : numOf(m, "views"));
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

    async getDashboardRollup(userId, accountId, publicationIds) {
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
      const rows = await db
        .select()
        .from(metricSnapshots)
        .where(
          and(
            eq(metricSnapshots.userId, userId),
            // [T-332 S2] strict 按号门(只见当前号;lenient OR-IS-NULL 已退役)。
            // 空集语义:当前号无快照 → rows 空 → latest.length===0 → all-zero rollup
            // (snapshotCount 0),JS reduce 起点全 0,无 SQL sum/avg 的 NULL 风险。
            eq(metricSnapshots.accountId, accountId),
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
      //   归一:优先取真采集的 `views`,仅缺失时回退 fixture 的 `plays`。
      //   真值 0 不能被 `||` 当作缺失；其余键两侧一致。
      const playsOf = (m: Record<string, unknown>): number =>
        m.views == null ? num(m, "plays") : num(m, "views");

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
