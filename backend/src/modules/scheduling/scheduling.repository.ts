import {requireWorkspace,workspaceFilter} from "../../workspace-scope";
import {lockWorkspaceMembership,assertFrozenWorkspaceMembership} from "../platform-account/membership-lock.service";
import { and, desc, eq, sql, type Db } from "@creatoros/backend";
import { scheduledJobs, jobRuns } from "./scheduling.db-schema";
import { OwnershipError, requireAccountId } from "./scheduling.errors";

// Scheduling repository (foundation §5.2) — user-scoped queries ONLY. `userId` is baked
// into deps (mirrors candidate/positioning/monetization): EVERY query filters
// `eq(table.userId, deps.userId)` and EVERY insert stamps `userId: deps.userId`. getJob /
// getRun throw OwnershipError when the scoped select returns empty — never revealing
// cross-user existence (foundation §2: 404 not 403).
//
// `job_run` ownership: BOTH the user_id filter AND the requireJob gate apply. Every
// per-job run read/write (createRun / listRunsByJob) first calls getJob(jobId) so a run
// can only be created/listed under a job the caller owns; getRun/updateRun additionally
// filter the run's own user_id. This is the SPEC §4 "job_run 经 requireJob ownership
// gate" wiring.
//
// D1 scope: CRUD for scheduled_job (create/list/get/update/setEnabled) + the base run
// write methods (createRun / updateRun) the scheduler (D3) will drive. The scheduler,
// runTask deterministic branches, and 回填 semantics are D3 — here we only give the
// honest data-model + user-scoped ports.

export type ScheduledJobRow = typeof scheduledJobs.$inferSelect;
export type JobRunRow = typeof jobRuns.$inferSelect;

// [T-367/T-598] 系统采集 sourceKind —— createJob 对这些 kind 幂等复用(同 user+号+kind 至多
// 一条)。与三处保持一致:contract scheduledJobSourceKind 枚举、collection-bootstrap
// DAILY_COLLECTION_JOB_DEFAULTS、迁移 0046 部分唯一索引 ux_scheduled_job_user_account_source
// 的 WHERE 列表。非采集类 kind 不在集合内 → 行为不变(可多实例)。
export const COLLECTION_JOB_SOURCE_KINDS: ReadonlySet<string> = new Set([
  "self.metrics",
  "self.traffic",
  "self.detail",
  "comments",
  "benchmark",
  "topic.daily",
  "favorites",
  "intelligence.sync",
]);

/** [T-367] 撞唯一约束判据(PGlite/PG 语义:code 23505 或错误文案带索引名)。 */
function isUniqueViolation(err: unknown): boolean {
  const seen = new Set<unknown>();
  let cur: unknown = err;
  while (cur && typeof cur === "object" && !seen.has(cur)) {
    seen.add(cur);
    const e = cur as { code?: unknown; message?: unknown; cause?: unknown };
    if (e.code === "23505") return true;
    if (
      typeof e.message === "string" &&
      (e.message.includes("ux_scheduled_job_user_account_source") ||
        e.message.includes("duplicate key value"))
    ) {
      return true;
    }
    cur = e.cause;
  }
  return false;
}

export interface RepoDeps {
  now: () => string; // ISO-8601 clock (injected for deterministic tests)
  nextId: (prefix: string) => string; // id generator (deterministic in tests)
  userId: string; // the ownership boundary, baked in at construction
  // [T-332 S2] 第二属主维度(账号全域隔离,SPEC §4.1/§4.2)。scheduled_job 域的用户路径
  //   (listJobs/createJob/getJob/updateJob/setEnabled 及经 requireJob 的 run 读写)一律 strict:
  //   null → 直接抛 AccountRequiredError(未选号=引导态,禁读写,不隐式全量)。
  //   null 仅允许两类系统 daemon 路径(ISO-06,显式命名,不是退化):
  //   · listJobsAllAccountsSystem —— cron 调度器跨号枚举 runnable job(触发时 ctx 账号由 job 行派生);
  //   · listRunsByStatus / getRun / updateRun 的启动扫超时回填 —— job_run 父锚继承(自身无 account 列),
  //     系统 sweep 仅按 userId 收窄。
  accountId: string | null;
  groupId?:string|null;
  membershipVersion?:number;
}

export interface ListJobsQuery {
  sourceKind?: string;
  enabled?: boolean;
  limit?: number;
  offset?: number;
}

export interface CreateJobInput {
  name: string;
  prompt: string;
  sourceKind: string; // self.metrics | comments (validated at the contract edge)
  target: Record<string, unknown>;
  schedule: string;
  toolGrants: unknown[];
  /** [T-359] 新绑号分层启用:缺省 undefined = true(旧调用方零变);默认关的模板建即 false。 */
  enabled?: boolean;
  // [T-332 S2] 属主号不再由调用方显式传入(SPEC §4.6 防绕过):repo 从 deps.accountId stamp,
  //   未选号 → AccountRequiredError。cron 到点触发时采集 ctx.accountId 由该列派生(ISO-06)。
}

// A curation patch — only the fields the caller touches (undefined = leave unchanged).
// recipe / lastRunAt / nextRunAt are included because the scheduler (D3) updates them;
// the contract update op only exposes name/prompt/schedule/target/toolGrants/enabled, so
// those D3-only fields are set through the service's internal write path, not the wire.
export interface UpdateJobInput {
  name?: string;
  prompt?: string;
  schedule?: string;
  target?: Record<string, unknown>;
  toolGrants?: unknown[];
  enabled?: boolean;
  recipe?: Record<string, unknown> | null;
  lastRunAt?: string | null;
  nextRunAt?: string | null;
}

export interface CreateRunInput {
  jobId: string;
  aiTaskId?: string | null;
  status?: string; // defaults to 'running'
  // [T-332 S2 · GAP-08] 计划触发时刻锚(cron 到点触发时传该 tick 的分钟 ISO;「立即运行」/绑定
  //   初始化触发不带)。写入后 (job_id, scheduled_for) 部分唯一约束真生效,根治「先查再建」
  //   竞态下同一计划 tick 重复触发。
  scheduledFor?: string | null;
}

// A run 回填 patch (D3) — status/items/error/finishedAt/aiTaskId. undefined = unchanged.
// [T-152] progress:实时采集进度 jsonb(nullable);采集器 best-effort + 节流写入,
//   undefined = 不动,null = 清空(终态可清)。形状见 contract jobRunProgress。
export interface UpdateRunInput {
  status?: string;
  itemsNew?: number;
  itemsUpdated?: number;
  error?: string | null;
  aiTaskId?: string | null;
  finishedAt?: string | null;
  progress?: Record<string, unknown> | null;
}

export interface ListRunsQuery {
  limit?: number;
  offset?: number;
}

export interface SchedulingRepository {
  // Fixture hydration (insert with explicit user_id already on the row).
  seedJobs(rows: (typeof scheduledJobs.$inferInsert)[]): Promise<void>;
  seedRuns(rows: (typeof jobRuns.$inferInsert)[]): Promise<void>;

  // scheduled_job reads/writes —— 用户路径一律 strict 按 (user_id, account_id) 双维收窄
  //   (T-332 S2;未选号 → AccountRequiredError,跨号 by-id → OwnershipError 404)。
  listJobs(query: ListJobsQuery): Promise<{ rows: ScheduledJobRow[]; total: number }>;
  // [T-332 S2 · ISO-06] 系统 daemon 专用:cron 调度器跨号枚举该 user 全部 job(触发时逐 job
  //   用其 account_id 派生采集 ctx)。显式命名,非隐式全量退化;用户路径禁用。
  listJobsAllAccountsSystem(
    query: ListJobsQuery,
  ): Promise<{ rows: ScheduledJobRow[]; total: number }>;
  createJob(input: CreateJobInput): Promise<ScheduledJobRow>;
  getJob(id: string): Promise<ScheduledJobRow>; // ownership gate (404;含账号一致性,§4.5)
  updateJob(id: string, patch: UpdateJobInput): Promise<ScheduledJobRow>;
  setEnabled(id: string, enabled: boolean): Promise<ScheduledJobRow>;

  // job_run reads/writes — all reach the parent job through requireJob first.
  createRun(input: CreateRunInput): Promise<JobRunRow>;
  getRun(id: string): Promise<JobRunRow>; // ownership gate (404)
  listRunsByJob(
    jobId: string,
    query: ListRunsQuery,
  ): Promise<{ rows: JobRunRow[]; total: number }>;
  // Cross-job scan of this user's runs in a given status (default 'running'). Powers the
  // scheduler's startup 扫超时 (T-007 D3 / gate finding 3): 进程重启后仍悬挂 running 的 run
  // → 标 failed。No requireJob gate (it's a user-wide sweep, still user_id-scoped).
  listRunsByStatus(status: string): Promise<JobRunRow[]>;
  updateRun(id: string, patch: UpdateRunInput): Promise<JobRunRow>;
}

export function createSchedulingRepository(
  db: Db,
  deps: RepoDeps,
): SchedulingRepository {
  const repo: SchedulingRepository = {
    async seedJobs(rows) {
      if (rows.length === 0) return;
      await db.insert(scheduledJobs).values(rows).onConflictDoNothing();
    },

    async seedRuns(rows) {
      if (rows.length === 0) return;
      await db.insert(jobRuns).values(rows).onConflictDoNothing();
    },

    async listJobs({ sourceKind, enabled, limit = 100, offset = 0 }) {
      // [T-332 S2] strict 双维门:未选号直接抛(引导态),有号只见当前号的 job。
      requireWorkspace(deps);const accountId=deps.accountId;
      const filters = [
        eq(scheduledJobs.userId, deps.userId),
        workspaceFilter(scheduledJobs,deps),
      ];
      if (sourceKind) filters.push(eq(scheduledJobs.sourceKind, sourceKind));
      if (enabled !== undefined) filters.push(eq(scheduledJobs.enabled, enabled));
      const where = and(...filters);
      const rows = await db
        .select()
        .from(scheduledJobs)
        .where(where)
        .orderBy(desc(scheduledJobs.createdAt))
        .limit(limit)
        .offset(offset);
      const all = await db
        .select({ id: scheduledJobs.id })
        .from(scheduledJobs)
        .where(where);
      return { rows, total: all.length };
    },

    async listJobsAllAccountsSystem({ sourceKind, enabled, limit = 100, offset = 0 }) {
      // [T-332 S2 · ISO-06] cron 调度器跨号枚举:仅按 userId 收窄,**不加**账号门 —— 触发时
      //   triggerScheduledJob 逐 job 用其 account_id 派生采集 ctx,落库恒同号。系统专用,
      //   用户面 op 不得接到这里。
      const filters = [eq(scheduledJobs.userId, deps.userId)];
      if (sourceKind) filters.push(eq(scheduledJobs.sourceKind, sourceKind));
      if (enabled !== undefined) filters.push(eq(scheduledJobs.enabled, enabled));
      const where = and(...filters);
      const rows = await db
        .select()
        .from(scheduledJobs)
        .where(where)
        .orderBy(desc(scheduledJobs.createdAt))
        .limit(limit)
        .offset(offset);
      const all = await db
        .select({ id: scheduledJobs.id })
        .from(scheduledJobs)
        .where(where);
      return { rows, total: all.length };
    },

    async createJob(input) {
      // [T-332 S2] 从 deps stamp(§4.6:repo 不接受调用方显式传号);未选号 → 抛。
      requireWorkspace(deps);const accountId=deps.accountId;
      if(!["topic.daily"].includes(input.sourceKind))requireAccountId(accountId,"平台采集作业");
      return db.transaction(async tx=>{
      const frozen=await lockWorkspaceMembership(tx,{...deps,requestId:"scheduled-job-create",source:"user"});
      const isCollectionKind = COLLECTION_JOB_SOURCE_KINDS.has(input.sourceKind);
      // [T-359] 尊重入参(分层启用:默认关的模板建即 disabled);缺省保持旧行为 true。
      const wantEnabled = input.enabled ?? true;

      // [T-367] 采集类 kind 幂等复用:同 (user, account, sourceKind) 已有 job → 不再建
      //   第二条,返回已有行。用户在模板卡/新建弹窗对已有(通常 disabled 的 bootstrap)
      //   job 再「新建」的真实意图是「开启它」—— 故传入 enabled=true 且已有行 disabled
      //   时顺手 update 开启;**只开不关**(传入 enabled=false 不把用户已开启的 job 关掉,
      //   bootstrap ensure 对默认关模板传 false,竞态撞上时不得反向覆盖用户意愿)。
      //   非采集类 kind 不查重,行为不变。
      const findExisting = async (): Promise<ScheduledJobRow | undefined> => {
        const rows = await tx
          .select()
          .from(scheduledJobs)
          .where(
            and(
              eq(scheduledJobs.userId, deps.userId),
              workspaceFilter(scheduledJobs,deps),
              eq(scheduledJobs.sourceKind, input.sourceKind),
              input.sourceKind!=="topic.daily" ? eq(scheduledJobs.accountId,requireAccountId(accountId,"平台采集作业")):undefined,
            ),
          );
        return rows[0];
      };
      const reuse = async (row: ScheduledJobRow): Promise<ScheduledJobRow> => {
        if (wantEnabled && !row.enabled) {
          const updated = await tx
            .update(scheduledJobs)
            .set({ enabled: true, updatedAt: deps.now() })
            .where(eq(scheduledJobs.id, row.id))
            .returning();
          return updated[0]!;
        }
        return row;
      };

      if (isCollectionKind) {
        const existing = await findExisting();
        if (existing) return reuse(existing);
      }

      try {
        const inserted = await tx
          .insert(scheduledJobs)
          .values({
            id: deps.nextId("job"),
            userId: deps.userId,
            accountId,groupId:frozen.groupId,groupVersion:frozen.groupVersion,membershipVersion:frozen.membershipVersion,
            name: input.name,
            prompt: input.prompt,
            sourceKind: input.sourceKind,
            target: input.target,
            schedule: input.schedule,
            toolGrants: input.toolGrants,
            recipe: null,
            enabled: wantEnabled,
            lastRunAt: null,
            nextRunAt: null,
            createdAt: deps.now(),
            updatedAt: deps.now(),
          })
          .returning();
        return inserted[0]!;
      } catch (err) {
        // [T-367] 先查后插的 TOCTOU 竞态:并发方先插成功 → 本次撞部分唯一索引
        //   ux_scheduled_job_user_account_source(迁移 0046)。幂等收敛:查回已有行复用
        //   (同样按 wantEnabled 只开不关)。非采集 kind / 非唯一冲突照原样抛。
        if (isCollectionKind && isUniqueViolation(err)) {
          const existing = await findExisting();
          if (existing) return reuse(existing);
        }
        throw err;
      }
      });
    },

    async getJob(id) {
      // [T-332 S2 · §4.5] by-id 号一致性门:未选号 → 抛;跨号命中 → 与跨 user 同语义 404
      //   (不泄漏存在性)。采集触发链的 ctx 账号由 job 行派生(ISO-06),读写恒同号,不误伤。
      requireWorkspace(deps);const accountId=deps.accountId;
      const rows = await db
        .select()
        .from(scheduledJobs)
        .where(
          and(
            eq(scheduledJobs.userId, deps.userId),
            workspaceFilter(scheduledJobs,deps),
            eq(scheduledJobs.id, id),
          ),
        );
      const row = rows[0];
      if (!row) {
        throw new OwnershipError(`OwnershipError: scheduled_job not found: ${id}`);
      }
      return row;
    },

    async updateJob(id, patch) {
      await repo.getJob(id); // ownership gate before any write
      const set: Record<string, unknown> = { updatedAt: deps.now() };
      if (patch.name !== undefined) set.name = patch.name;
      if (patch.prompt !== undefined) set.prompt = patch.prompt;
      if (patch.schedule !== undefined) set.schedule = patch.schedule;
      if (patch.target !== undefined) set.target = patch.target;
      if (patch.toolGrants !== undefined) set.toolGrants = patch.toolGrants;
      if (patch.enabled !== undefined) set.enabled = patch.enabled;
      if (patch.recipe !== undefined) set.recipe = patch.recipe;
      if (patch.lastRunAt !== undefined) set.lastRunAt = patch.lastRunAt;
      if (patch.nextRunAt !== undefined) set.nextRunAt = patch.nextRunAt;
      const updated = await db
        .update(scheduledJobs)
        .set(set)
        .where(and(eq(scheduledJobs.userId, deps.userId), eq(scheduledJobs.id, id)))
        .returning();
      return updated[0]!;
    },

    async setEnabled(id, enabled) {
      await repo.getJob(id); // ownership gate
      const updated = await db
        .update(scheduledJobs)
        .set({ enabled, updatedAt: deps.now() })
        .where(and(eq(scheduledJobs.userId, deps.userId), eq(scheduledJobs.id, id)))
        .returning();
      return updated[0]!;
    },

    async createRun(input) {
      const parent=await repo.getJob(input.jobId); // requireJob — the run's parent must be owned(含账号一致性)
      return db.transaction(async tx=>{
      await assertFrozenWorkspaceMembership(tx,{userId:parent.userId,groupId:parent.groupId,accountId:parent.accountId,groupVersion:parent.groupVersion,membershipVersion:parent.membershipVersion},{allowArchived:!!parent.accountId});
      const inserted = await tx
        .insert(jobRuns)
        .values({
          id: deps.nextId("run"),
          userId: deps.userId,
          jobId: input.jobId,
          groupId:parent.groupId,groupVersion:parent.groupVersion,membershipVersion:parent.membershipVersion,
          aiTaskId: input.aiTaskId ?? null,
          status: input.status ?? "running",
          itemsNew: 0,
          itemsUpdated: 0,
          error: null,
          startedAt: deps.now(),
          finishedAt: null,
          // [T-332 S2 · GAP-08] 计划触发锚:cron 到点带 tick 分钟 ISO,「立即运行」不带(null)。
          //   (job_id, scheduled_for) 部分唯一约束由此真生效(迁移 0042 建,S2 写入)。
          scheduledFor: input.scheduledFor ?? null,
        })
        .returning();
      return inserted[0]!;
      });
    },

    async getRun(id) {
      const rows = await db
        .select()
        .from(jobRuns)
        .where(and(eq(jobRuns.userId, deps.userId), eq(jobRuns.id, id)));
      const row = rows[0];
      if (!row) {
        throw new OwnershipError(`OwnershipError: job_run not found: ${id}`);
      }
      // [T-332 S2 · §4.5] job_run 父锚继承(自身无 account 列):有号 ctx 下经父 job 校验账号
      //   一致性(跨号 run 深链 → 404,不泄漏存在性)。deps.accountId 为 null 仅系统 sweep 路径
      //   (启动扫超时,ISO-06)—— 系统回填只按 userId 收窄,不做账号门。
      if (deps.accountId !== null || deps.groupId) {
        await repo.getJob(row.jobId);
      }
      return row;
    },

    async listRunsByJob(jobId, { limit = 100, offset = 0 }) {
      await repo.getJob(jobId); // requireJob — only list runs under an owned job
      const where = and(eq(jobRuns.userId, deps.userId), eq(jobRuns.jobId, jobId));
      const rows = await db
        .select()
        .from(jobRuns)
        .where(where)
        .orderBy(desc(jobRuns.startedAt))
        .limit(limit)
        .offset(offset);
      const total = await db.select({ value: sql<number>`count(*)` }).from(jobRuns).where(where);
      return { rows, total: Number(total[0]?.value ?? 0) };
    },

    async listRunsByStatus(status) {
      // User-wide (no requireJob) but user_id-scoped: sweep this user's runs in `status`.
      // [T-332 S2 · ISO-06] 系统 sweep 专用(启动扫超时):job_run 父锚继承无 account 列,
      //   系统路径仅按 userId 收窄 —— 不是隐式全量退化,用户面读走 listRunsByJob(经父门)。
      return db
        .select()
        .from(jobRuns)
        .where(and(eq(jobRuns.userId, deps.userId), eq(jobRuns.status, status)))
        .orderBy(desc(jobRuns.startedAt));
    },

    async updateRun(id, patch) {
      await repo.getRun(id); // ownership gate
      const set: Record<string, unknown> = {};
      if (patch.status !== undefined) set.status = patch.status;
      if (patch.itemsNew !== undefined) set.itemsNew = patch.itemsNew;
      if (patch.itemsUpdated !== undefined) set.itemsUpdated = patch.itemsUpdated;
      if (patch.error !== undefined) set.error = patch.error;
      if (patch.aiTaskId !== undefined) set.aiTaskId = patch.aiTaskId;
      if (patch.finishedAt !== undefined) set.finishedAt = patch.finishedAt;
      if (patch.progress !== undefined) set.progress = patch.progress; // [T-152] 进度写入
      const updated = await db
        .update(jobRuns)
        .set(set)
        .where(and(eq(jobRuns.userId, deps.userId), eq(jobRuns.id, id)))
        .returning();
      return updated[0]!;
    },
  };
  return repo;
}
