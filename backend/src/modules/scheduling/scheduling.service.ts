import type { RequestContext } from "@creatoros/contract";
import type { Db } from "@creatoros/backend";
import {
  createSchedulingRepository,
  type SchedulingRepository,
  type RepoDeps,
} from "./scheduling.repository";
import {
  toScheduledJobDto,
  toJobRunDto,
  type ScheduledJobResource,
  type JobRunResource,
} from "./scheduling.schema";

// Scheduling service (foundation §5.3) — every public method takes
// `(ctx: RequestContext, …)` and builds a repository bound to `ctx.userId`
// (createSchedulingRepository(db, { now, nextId, userId: ctx.userId })) so scoping is
// structural (mirrors candidate.service's repoFor). The service owns the generic
// scheduled-job CRUD + the thin job_run trigger record. It is the only entry other
// modules / the composition root import (via index.ts).
//
// D1 scope: create/list/get/update/setEnabled (scheduled_job) + createRun/listRunsByJob/
// getRun (job_run) + updateRun (the base run 回填 write the scheduler D3 drives). No
// node-cron scheduler, no runTask deterministic branch, no 「立即运行」, no /automations
// UI, no comment collection — those are D2–D7. No cross-module port here (self.metrics /
// comments 采集接线 belongs to D3); the service is pure data-model + user-scoped CRUD.
//
// Ownership: repoFor bakes ctx.userId; getJob/getRun throw OwnershipError (→404) on a
// cross-user id. job_run reads/writes ride the repo's requireJob gate (the parent job
// must be owned) — createRun/listRunsByJob assert getJob(jobId) first.

export interface ServiceDeps {
  db: Db;
  now: () => string;
  nextId: (prefix: string) => string;
}

export interface CreateJobInput {
  name: string;
  prompt?: string;
  sourceKind: string; // self.metrics | comments (validated at the contract edge)
  target?: Record<string, unknown>;
  schedule: string;
  toolGrants?: unknown[];
}

export interface UpdateJobInput {
  name?: string;
  prompt?: string;
  schedule?: string;
  target?: Record<string, unknown>;
  toolGrants?: unknown[];
  enabled?: boolean;
}

export interface ListJobsQuery {
  sourceKind?: string;
  enabled?: boolean;
  limit: number;
  offset: number;
}

export interface ListRunsQuery {
  limit: number;
  offset: number;
}

// The scheduler (D3) 回填 shape — status/items/error/finishedAt/aiTaskId. NOT a contract
// op; the internal write path the scheduler drives when a run finishes.
export interface UpdateRunInput {
  status?: string;
  itemsNew?: number;
  itemsUpdated?: number;
  error?: string | null;
  aiTaskId?: string | null;
  finishedAt?: string | null;
}

export interface SchedulingService {
  listJobs(
    ctx: RequestContext,
    query: ListJobsQuery,
  ): Promise<{ rows: ScheduledJobResource[]; total: number }>;
  createJob(
    ctx: RequestContext,
    input: CreateJobInput,
  ): Promise<ScheduledJobResource>;
  getJob(ctx: RequestContext, jobId: string): Promise<ScheduledJobResource>;
  updateJob(
    ctx: RequestContext,
    jobId: string,
    patch: UpdateJobInput,
  ): Promise<ScheduledJobResource>;
  setEnabled(
    ctx: RequestContext,
    jobId: string,
    enabled: boolean,
  ): Promise<ScheduledJobResource>;

  // job_run — the thin trigger record. createRun/updateRun are the base write methods the
  // scheduler (D3) drives; getRun/listRunsByJob back the contract read ops. All ownership
  // -gated (createRun/listRunsByJob ride requireJob).
  createRun(
    ctx: RequestContext,
    input: { jobId: string; aiTaskId?: string | null; status?: string },
  ): Promise<JobRunResource>;
  getRun(ctx: RequestContext, runId: string): Promise<JobRunResource>;
  listRunsByJob(
    ctx: RequestContext,
    jobId: string,
    query: ListRunsQuery,
  ): Promise<{ rows: JobRunResource[]; total: number }>;
  updateRun(
    ctx: RequestContext,
    runId: string,
    patch: UpdateRunInput,
  ): Promise<JobRunResource>;
}

export function createSchedulingService(deps: ServiceDeps): SchedulingService {
  const { db, now, nextId } = deps;

  function repoFor(ctx: RequestContext): SchedulingRepository {
    const repoDeps: RepoDeps = { now, nextId, userId: ctx.userId };
    return createSchedulingRepository(db, repoDeps);
  }

  return {
    async listJobs(ctx, query) {
      const { rows, total } = await repoFor(ctx).listJobs(query);
      return { rows: rows.map(toScheduledJobDto), total };
    },

    async createJob(ctx, input) {
      const row = await repoFor(ctx).createJob({
        name: input.name,
        prompt: input.prompt ?? "",
        sourceKind: input.sourceKind,
        target: input.target ?? {},
        schedule: input.schedule,
        toolGrants: input.toolGrants ?? [],
      });
      return toScheduledJobDto(row);
    },

    async getJob(ctx, jobId) {
      return toScheduledJobDto(await repoFor(ctx).getJob(jobId));
    },

    async updateJob(ctx, jobId, patch) {
      const row = await repoFor(ctx).updateJob(jobId, {
        name: patch.name,
        prompt: patch.prompt,
        schedule: patch.schedule,
        target: patch.target,
        toolGrants: patch.toolGrants,
        enabled: patch.enabled,
      });
      return toScheduledJobDto(row);
    },

    async setEnabled(ctx, jobId, enabled) {
      const row = await repoFor(ctx).setEnabled(jobId, enabled);
      return toScheduledJobDto(row);
    },

    async createRun(ctx, input) {
      const row = await repoFor(ctx).createRun({
        jobId: input.jobId,
        aiTaskId: input.aiTaskId ?? null,
        status: input.status,
      });
      return toJobRunDto(row);
    },

    async getRun(ctx, runId) {
      return toJobRunDto(await repoFor(ctx).getRun(runId));
    },

    async listRunsByJob(ctx, jobId, query) {
      const { rows, total } = await repoFor(ctx).listRunsByJob(jobId, query);
      return { rows: rows.map(toJobRunDto), total };
    },

    async updateRun(ctx, runId, patch) {
      const row = await repoFor(ctx).updateRun(runId, patch);
      return toJobRunDto(row);
    },
  };
}
