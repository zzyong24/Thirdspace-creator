import { and, desc, eq, type Db } from "@creatoros/backend";
import { scheduledJobs, jobRuns } from "./scheduling.db-schema";
import { OwnershipError } from "./scheduling.errors";

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

export interface RepoDeps {
  now: () => string; // ISO-8601 clock (injected for deterministic tests)
  nextId: (prefix: string) => string; // id generator (deterministic in tests)
  userId: string; // the ownership boundary, baked in at construction
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
}

// A run 回填 patch (D3) — status/items/error/finishedAt/aiTaskId. undefined = unchanged.
export interface UpdateRunInput {
  status?: string;
  itemsNew?: number;
  itemsUpdated?: number;
  error?: string | null;
  aiTaskId?: string | null;
  finishedAt?: string | null;
}

export interface ListRunsQuery {
  limit?: number;
  offset?: number;
}

export interface SchedulingRepository {
  // Fixture hydration (insert with explicit user_id already on the row).
  seedJobs(rows: ScheduledJobRow[]): Promise<void>;
  seedRuns(rows: JobRunRow[]): Promise<void>;

  // scheduled_job reads/writes.
  listJobs(query: ListJobsQuery): Promise<{ rows: ScheduledJobRow[]; total: number }>;
  createJob(input: CreateJobInput): Promise<ScheduledJobRow>;
  getJob(id: string): Promise<ScheduledJobRow>; // ownership gate (404)
  updateJob(id: string, patch: UpdateJobInput): Promise<ScheduledJobRow>;
  setEnabled(id: string, enabled: boolean): Promise<ScheduledJobRow>;

  // job_run reads/writes — all reach the parent job through requireJob first.
  createRun(input: CreateRunInput): Promise<JobRunRow>;
  getRun(id: string): Promise<JobRunRow>; // ownership gate (404)
  listRunsByJob(
    jobId: string,
    query: ListRunsQuery,
  ): Promise<{ rows: JobRunRow[]; total: number }>;
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
      const inserted = await db
        .insert(scheduledJobs)
        .values({
          id: deps.nextId("job"),
          userId: deps.userId,
          name: input.name,
          prompt: input.prompt,
          sourceKind: input.sourceKind,
          target: input.target,
          schedule: input.schedule,
          toolGrants: input.toolGrants,
          recipe: null,
          enabled: true,
          lastRunAt: null,
          nextRunAt: null,
          createdAt: deps.now(),
          updatedAt: deps.now(),
        })
        .returning();
      return inserted[0]!;
    },

    async getJob(id) {
      const rows = await db
        .select()
        .from(scheduledJobs)
        .where(and(eq(scheduledJobs.userId, deps.userId), eq(scheduledJobs.id, id)));
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
      await repo.getJob(input.jobId); // requireJob — the run's parent must be owned
      const inserted = await db
        .insert(jobRuns)
        .values({
          id: deps.nextId("run"),
          userId: deps.userId,
          jobId: input.jobId,
          aiTaskId: input.aiTaskId ?? null,
          status: input.status ?? "running",
          itemsNew: 0,
          itemsUpdated: 0,
          error: null,
          startedAt: deps.now(),
          finishedAt: null,
        })
        .returning();
      return inserted[0]!;
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
      const all = await db.select({ id: jobRuns.id }).from(jobRuns).where(where);
      return { rows, total: all.length };
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
