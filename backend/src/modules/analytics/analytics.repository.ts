import {factFilter,type WorkspaceKey} from "../../workspace-scope";
import type {RequestContext} from "@creatoros/contract";
type FactScope=string|WorkspaceKey|Pick<RequestContext,"groupId"|"accountId">;
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

export type MetricSnapshotRow = Omit<typeof metricSnapshots.$inferSelect,"groupId"|"nativePlatform"> & {groupId?:string|null;nativePlatform?:string|null};
export type MetricValueRow = Omit<typeof metricValues.$inferSelect,"groupId"> & {groupId?:string|null};
export type RetentionPointRow = typeof retentionPoints.$inferSelect;
export type AudienceSnapshotRow = Omit<typeof audienceSnapshots.$inferSelect,"groupId"> & {groupId?:string|null};

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
  groupId?: string | null;
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
export interface DailyPlayPoint {day:string;plays:number|null;correction?:number|null;sampleCount?:number;complete?:boolean}
export interface DashboardRollup {
  finishCount:number;
  ctrCount:number;
  plays:number|null;
  reads:number|null;
  likes:number|null;
  comments:number|null;
  shares:number|null;
  favorites:number|null;
  followerGain:number|null;
  ctrAvg:number|null;
  finishAvg:number|null;
  snapshotCount:number;
  metricCoverage:Record<string,{measured:number;total:number}>;
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
    accountId: FactScope,
    publicationId: string,
    page: number,
    pageSize: number,
  ): Promise<Page<MetricSnapshotRow>>;
  listSnapshotsByProject(
    userId: string,
    accountId: FactScope,
    publicationIds: ReadonlyArray<string>,
    page: number,
    pageSize: number,
  ): Promise<Page<MetricSnapshotRow>>;
  listLatestSnapshotsByPublicationIds(
    userId: string,
    accountId: FactScope,
    publicationIds: ReadonlyArray<string>,
  ): Promise<MetricSnapshotRow[]>;
  listValuesBySnapshot(
    userId: string,
    accountId: FactScope,
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
    accountId: FactScope,
    publicationIds: readonly string[] | undefined,
    days: number,
  ): Promise<DailyPlayPoint[]>;

  // 空集语义:当前号无快照 → all-zero rollup(snapshotCount 0),字段全 0,不产 NULL。
  getDashboardRollup(
    userId: string,
    accountId: FactScope,
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
          groupId: input.groupId??null,
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
        factFilter(metricSnapshots, accountId),
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
        factFilter(metricSnapshots, accountId),
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
            factFilter(metricSnapshots, accountId),
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
            factFilter(metricValues, accountId),
            eq(metricValues.metricSnapshotId, metricSnapshotId),
          ),
        )
        .orderBy(asc(metricValues.metricKey));
    },

    async getDailyPlayTrend(userId, accountId, publicationIds, days) {
      if(publicationIds?.length===0)return [];
      // SEMANTIC_BOUNDARY_ALLOW: 只按真实ID、来源和日历相邻快照做确定性差分，不推断内容效果。
      const scope=and(eq(metricSnapshots.userId,userId),factFilter(metricSnapshots,accountId),publicationIds?inArray(metricSnapshots.publicationId,[...publicationIds]):undefined);
      const dayKey=sql<string>`to_char(${metricSnapshots.capturedAt}::timestamptz AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD')`;
      const recentDays=db.selectDistinct({day:dayKey.as("day")}).from(metricSnapshots).where(scope).orderBy(desc(dayKey)).limit(Math.max(1,days)+1);
      const rows=await db.selectDistinctOn([metricSnapshots.publicationId,dayKey],{publicationId:metricSnapshots.publicationId,capturedAt:metricSnapshots.capturedAt,day:dayKey,source:metricSnapshots.source,rawMetrics:sql<Record<string,unknown>>`jsonb_build_object('views',${metricSnapshots.rawMetrics}->'views','plays',${metricSnapshots.rawMetrics}->'plays','_platform',COALESCE(to_jsonb(${metricSnapshots.nativePlatform}),${metricSnapshots.rawMetrics}->'_platform'),'metric_definition',${metricSnapshots.rawMetrics}->'metric_definition','metric_window',${metricSnapshots.rawMetrics}->'metric_window')`})
        .from(metricSnapshots).where(and(scope,inArray(dayKey,recentDays))).orderBy(asc(metricSnapshots.publicationId),asc(dayKey),desc(sql`${metricSnapshots.capturedAt}::timestamptz`),desc(metricSnapshots.id));
      const byDay=new Map<string,Map<string,typeof rows[number]>>();
      for(const row of rows){let group=byDay.get(row.day);if(!group)byDay.set(row.day,group=new Map());group.set(row.publicationId,row);}
      const ordered=[...byDay.keys()].sort(),points:DailyPlayPoint[]=[];
      for(let i=1;i<ordered.length;i++){
        const day=ordered[i]!,previousDay=new Date(Date.parse(day+'T00:00:00Z')-86400000).toISOString().slice(0,10);
        const current=byDay.get(day)!,previous=byDay.get(previousDay);
        let growth=0,correction=0,samples=0;
        for(const [id,row] of current){const old=previous?.get(id);if(!old||old.source!==row.source)continue;
          const raw=row.rawMetrics as Record<string,unknown>,prior=old.rawMetrics as Record<string,unknown>;
          if(raw._platform==='wechatOfficial'||prior._platform==='wechatOfficial')continue;
          const key=metricNumber(raw,'views')!==null?'views':'plays';
          const value=metricNumber(raw,key),baseline=metricNumber(prior,key);
          if(value===null||baseline===null||raw.metric_definition!==prior.metric_definition||raw.metric_window!==prior.metric_window)continue;
          samples++;const delta=value-baseline;if(delta<0)correction+=delta;else growth+=delta;
        }
        const point:DailyPlayPoint={day,plays:samples&&correction===0?growth:null};
        const complete=!!previous&&samples===current.size&&samples===previous.size;
        if(!complete||correction<0){point.complete=complete;point.sampleCount=samples;point.correction=correction<0?correction:null;}
        points.push(point);
      }
      return points.slice(-Math.max(1,days));
    },

    async getDashboardRollup(userId,accountId,publicationIds){
      const rows=publicationIds?.length===0?[]:await db.select().from(metricSnapshots).where(and(eq(metricSnapshots.userId,userId),factFilter(metricSnapshots,accountId),publicationIds?inArray(metricSnapshots.publicationId,[...publicationIds]):undefined)).orderBy(desc(sql`${metricSnapshots.capturedAt}::timestamptz`),desc(metricSnapshots.id));
      const latest=new Map<string,typeof rows[number]>(),detail=new Map<string,typeof rows[number]>();
      for(const row of rows){if(!latest.has(row.publicationId))latest.set(row.publicationId,row);const m=row.rawMetrics as Record<string,unknown>;if(!detail.has(row.publicationId)&&(metricNumber(m,'finish_rate')!==null||metricNumber(m,'follower_gain')!==null||metricNumber(m,'ctr')!==null))detail.set(row.publicationId,row);}
      const snapshots=[...latest.values()],details=[...detail.values()],metricCoverage:DashboardRollup['metricCoverage']={};
      function sum(key:string,values:(number|null)[]):number|null{const measured=values.filter((v):v is number=>v!==null);metricCoverage[key]={measured:measured.length,total:snapshots.length};return measured.length?measured.reduce((a,b)=>a+b,0):null;}
      function weighted(key:string):{value:number|null;count:number}{
        const measured=details.flatMap(row=>{const m=row.rawMetrics as Record<string,unknown>,v=metricNumber(m,key);return v===null?[]:[{v,denominator:metricNumber(m,key+'_denominator'),definition:typeof m[key+'_definition']==='string'?m[key+'_definition']:null,window:m.metric_window??null,platform:row.nativePlatform??m._platform??null,unit:m[key+'_unit']??null}];});
        if(measured.length===0)return {value:null,count:0};
        if(measured.length===1)return {value:measured[0]!.v,count:1};
        const first=measured[0]!;
        if(!first.definition||measured.some(v=>v.definition!==first.definition||v.window!==first.window||v.platform!==first.platform||v.unit!==first.unit||v.denominator===null||v.denominator<=0))return {value:null,count:measured.length};
        const total=measured.reduce((a,v)=>a+v.denominator!,0);return {value:measured.reduce((a,v)=>a+v.v*v.denominator!,0)/total,count:measured.length};
      }
      const ctr=weighted('ctr'),finish=weighted('finish_rate');
      metricCoverage.ctrAvg={measured:ctr.count,total:snapshots.length};metricCoverage.finishAvg={measured:finish.count,total:snapshots.length};
      const raw=snapshots.map(s=>({...s.rawMetrics as Record<string,unknown>,_platform:s.nativePlatform??(s.rawMetrics as Record<string,unknown>)._platform}));
      return {
        plays:sum('plays',raw.map(m=>m._platform==='wechatOfficial'?null:metricNumber(m,'views')??metricNumber(m,'plays'))),
        reads:sum('reads',raw.map(m=>metricNumber(m,'reads')??(m._platform==='wechatOfficial'?metricNumber(m,'views'):null))),
        likes:sum('likes',raw.map(m=>metricNumber(m,'likes'))),comments:sum('comments',raw.map(m=>metricNumber(m,'comments'))),shares:sum('shares',raw.map(m=>metricNumber(m,'shares'))),favorites:sum('favorites',raw.map(m=>metricNumber(m,'favorites'))),
        followerGain:sum('followerGain',details.map(row=>metricNumber(row.rawMetrics as Record<string,unknown>,'follower_gain'))),
        ctrAvg:ctr.value,finishAvg:finish.value,ctrCount:ctr.count,finishCount:finish.count,snapshotCount:snapshots.length,metricCoverage,
      };
    },
  };
}

/** 缺失、null、空串不是测得0；此解析只校验平台原始数值类型。 */
function metricNumber(raw:Record<string,unknown>,key:string):number|null{
 const value=raw[key];if(value===null||value===undefined||typeof value==='boolean'||typeof value==='string'&&!value.trim())return null;
 const n=typeof value==='number'?value:typeof value==='string'?Number(value):NaN;return Number.isFinite(n)?n:null;
}
