import {PRIVATE_COLLECTION_SOURCE_KINDS,assertPrivateCollectorJob} from './private-collector-admission.service';
import {assertWritableWorkspace} from "../../workspace-scope";
import {workspaceFilter} from '../../workspace-scope';
import {and,eq} from 'drizzle-orm';
import {isDeepStrictEqual} from 'node:util';
import {requireAccountId,OwnershipError} from '../../errors';
import {ConflictError} from '../execution/execution.errors';
import {lockWorkspaceMembership} from '../platform-account/membership-lock.service';
import {scheduledJobs} from '../../schema/scheduling';
import { createScheduledRunIntentService } from "./daily-topic-run-intent.service";
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
import { ValidationError } from "./scheduling.errors";

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
  /** [T-359] 新绑号分层启用:缺省 undefined = true(旧调用方零变);默认关的模板建即 false。 */
  enabled?: boolean;
  /** 仅组合根/系统 bootstrap 可创建 system-managed kind；wire 不暴露。 */
  systemManaged?: boolean;
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
  /** 内部账号采集bootstrap筛选，公开组列表不自动叠号。 */
  accountId?: string | null;
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
  createDraftIfAbsent(ctx:RequestContext,input:Pick<CreateJobInput,'name'|'prompt'|'schedule'>&{sourceKind:'topic.daily'|'self.metrics'|'comments'}):Promise<ScheduledJobResource>;
  setEnabledIfUnchanged(ctx:RequestContext,jobId:string,enabled:boolean,expected:ScheduledJobResource):Promise<ScheduledJobResource>;
  listJobs(
    ctx: RequestContext,
    query: ListJobsQuery,
  ): Promise<{ rows: ScheduledJobResource[]; total: number }>;
  createJob(
    ctx: RequestContext,
    input: CreateJobInput,
    options?: {backgroundCollector?:boolean},
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
  // [T-332 S2 · ISO-06] 系统 daemon 专用:cron 调度器跨号枚举该 user 全部 job(触发时逐 job
  //   用其 account_id 派生采集 ctx)。显式命名,非隐式全量;用户面 op 一律走 listJobs(strict)。
  listJobsSystem(
    ctx: RequestContext,
    query: ListJobsQuery,
  ): Promise<{ rows: ScheduledJobResource[]; total: number }>;

  // job_run — the thin trigger record. createRun/updateRun are the base write methods the
  // scheduler (D3) drives; getRun/listRunsByJob back the contract read ops. All ownership
  // -gated (createRun/listRunsByJob ride requireJob).
  // [T-332 S2 · GAP-08] scheduledFor:cron 到点触发传计划 tick 的分钟 ISO;「立即运行」不传。
  createRun(
    ctx: RequestContext,
    input: {
      jobId: string;
      aiTaskId?: string | null;
      status?: string;
      scheduledFor?: string | null;
    },
  ): Promise<JobRunResource>;
  getRun(ctx: RequestContext, runId: string): Promise<JobRunResource>;
  /** 内部计划归属校验，读取持久scheduledFor，不依赖UI投影。 */
  getRunScheduledFor(ctx:RequestContext,runId:string):Promise<string|null>;
  listRunsByJob(
    ctx: RequestContext,
    jobId: string,
    query: ListRunsQuery,
  ): Promise<{ rows: JobRunResource[]; total: number }>;
  // Cross-job scan of this user's runs in a status (default 'running'). The scheduler's
  // startup 扫超时 (T-007 D3) drives it: 进程重启后仍 running 的 run → 标 failed。
  listRunningRuns(ctx: RequestContext): Promise<JobRunResource[]>;
  updateRun(
    ctx: RequestContext,
    runId: string,
    patch: UpdateRunInput,
  ): Promise<JobRunResource>;
}

export function createSchedulingService(deps: ServiceDeps): SchedulingService {
  const { db, now, nextId } = deps;
  const retiredSourceKinds = new Set(["self.detail", "benchmark", "favorites"]);
  const splitKinds = new Set(["self.metrics","self.traffic","comments","self.detail"]);
  const isBackfill=(sourceKind:string,target:Record<string,unknown>|null|undefined)=>sourceKind==='self.detail'&&target?.__backfillOnly===true;
  const separateTarget=(sourceKind:string,raw:Record<string,unknown>|undefined)=>{
    const target={...(raw??{})};delete target.operationsSync;delete target.mergedIntoSelfMetrics;
    if(sourceKind==='self.metrics')return {...target,__skipHeavyBackfill:true,__operationsSync:true};
    if(sourceKind==='self.detail')return {...target,__backfillOnly:true,__skipMetricRefresh:true,__operationsSync:true};
    return target;
  };

  function repoFor(ctx: RequestContext,backgroundCollector=false): SchedulingRepository {
    // [T-332 S2] accountId 透传进 repo(strict 双维门在 repo 内落地:用户路径未选号 → 抛
    //   AccountRequiredError;null 仅系统 daemon 路径合法,见 RepoDeps 注释)。
    const repoDeps: RepoDeps = {
      now,
      nextId,
      userId: ctx.userId,
      accountId: ctx.accountId ?? null,groupId:ctx.groupId,membershipVersion:ctx.membershipVersion,backgroundCollector,
    };
    return createSchedulingRepository(db, repoDeps);
  }

  return {
    async createDraftIfAbsent(ctx,input){
      if(!['topic.daily','self.metrics','comments'].includes(input.sourceKind))throw new ValidationError('该自动化不在当前草稿范围');
      const target=input.sourceKind==='topic.daily'?null:requireAccountId(ctx.accountId,'自动化真实目标');
      return db.transaction(async tx=>{
        await lockWorkspaceMembership(tx,ctx);
        // SEMANTIC_BOUNDARY_ALLOW:沿原workspace/kind/target持久身份防重复，不选择任务或内容。
        const [existing]=await tx.select().from(scheduledJobs).where(and(eq(scheduledJobs.userId,ctx.userId),workspaceFilter(scheduledJobs,ctx),eq(scheduledJobs.sourceKind,input.sourceKind),input.sourceKind==='topic.daily'?undefined:eq(scheduledJobs.accountId,target!))).limit(1).for('update');
        if(existing)throw Object.assign(new ConflictError('同一目标已有自动化，请查看原任务并确认启用状态'),{existingJobId:existing.id,readOperationId:'scheduledJobs.get',enableOperationId:'scheduledJobs.setEnabled'});
        return createSchedulingService({...deps,db:tx as unknown as Db}).createJob(ctx,{...input,target:{},toolGrants:[],enabled:false});
      });
    },
    async setEnabledIfUnchanged(ctx,jobId,enabled,expected){
      if((ctx.accountId??null)!==expected.accountId)throw new ConflictError('自动化目标与原候选不一致，请重新读取真实目标');
      return db.transaction(async tx=>{
        await lockWorkspaceMembership(tx,ctx);
        const [current]=await tx.select().from(scheduledJobs).where(and(eq(scheduledJobs.userId,ctx.userId),workspaceFilter(scheduledJobs,ctx),eq(scheduledJobs.id,jobId))).for('update');
        if(!current)throw new OwnershipError('自动化不存在或不属于当前工作区');
        if(!isDeepStrictEqual(toScheduledJobDto(current),expected))throw new ConflictError('自动化已改变，请重新读取并确认启用状态');
        return createSchedulingService({...deps,db:tx as unknown as Db}).setEnabled(ctx,jobId,enabled);
      });
    },
    async listJobs(ctx, query) {
      const { rows, total } = await repoFor(ctx).listJobs(query);
      return { rows: rows.map(toScheduledJobDto), total };
    },

    async createJob(ctx, input,options) {
      const backgroundCollector=options?.backgroundCollector===true&&ctx.source==="ingestion"&&input.systemManaged===true&&!!ctx.accountId&&!!ctx.groupId&&PRIVATE_COLLECTION_SOURCE_KINDS.has(input.sourceKind);
      if(options?.backgroundCollector&&!backgroundCollector)throw new ValidationError("后台采集授权只允许实际账号私有系统任务");
      await assertWritableWorkspace(db,ctx,{allowArchived:backgroundCollector});
      if (retiredSourceKinds.has(input.sourceKind)&&!(input.systemManaged===true&&isBackfill(input.sourceKind,input.target))) {
        throw new ValidationError(
          "该兼容任务已退役，请使用作品数据同步或内容雷达",
        );
      }
      if (
        ["intelligence.sync","self.traffic","self.detail"].includes(input.sourceKind) &&
        input.systemManaged !== true
      ) {
        throw new ValidationError(
          "该采集任务由系统按账号管理，不能手动新建",
        );
      }
      const row = await repoFor(ctx,backgroundCollector).createJob({
        name: input.name,
        prompt: input.prompt ?? "",
        sourceKind: input.sourceKind,
        target: splitKinds.has(input.sourceKind)?separateTarget(input.sourceKind,input.target):input.target??{},
        schedule: input.schedule,
        toolGrants: input.toolGrants ?? [],
        // [T-359] 分层启用透传(缺省 undefined → repo 默认 true,旧调用方零变)。
        enabled: input.enabled,
        // [T-332 S2] 属主号由 repo 从 deps.accountId stamp(§4.6 防绕过);未选号 → 抛。
      });
      return toScheduledJobDto(row);
    },

    async listJobsSystem(ctx, query) {
      // [T-332 S2 · ISO-06] 系统跨号枚举(cron 调度器):不经账号门;触发时逐 job 派生账号 ctx。
      const { rows, total } = await repoFor(ctx).listJobsAllAccountsSystem(query);
      return { rows: rows.map(toScheduledJobDto), total };
    },

    async getJob(ctx, jobId) {
      return toScheduledJobDto(await repoFor(ctx).getJob(jobId));
    },

    async updateJob(ctx, jobId, patch) {
      await assertWritableWorkspace(db,ctx);
      const current = await repoFor(ctx).getJob(jobId);
      if ((current.target as Record<string,unknown>)?.mergedIntoSelfMetrics === true)throw new ValidationError("此任务已合并，请在作品自动同步中编辑对应能力");
      if (retiredSourceKinds.has(current.sourceKind)&&!isBackfill(current.sourceKind,current.target as Record<string,unknown>)) {
        throw new ValidationError("该兼容任务已退役，只保留历史记录");
      }
      if (
        current.sourceKind === "intelligence.sync" &&
        Object.entries(patch).some(
          ([key, value]) => !["enabled","name","prompt","schedule"].includes(key) && value !== undefined,
        )
      ) {
        throw new ValidationError(
          "内容雷达只能修改名称、描述、时间及启用状态，不能改变来源或工具授权",
        );
      }
      if(isBackfill(current.sourceKind,current.target as Record<string,unknown>)&&patch.target!==undefined&&patch.target.__backfillOnly!==true)throw new ValidationError('内容补全任务不能更改采集类型');
      const row = await repoFor(ctx).updateJob(jobId, {
        name: patch.name,
        prompt: patch.prompt,
        schedule: patch.schedule,
        target: patch.target===undefined?undefined:splitKinds.has(current.sourceKind)?separateTarget(current.sourceKind,patch.target):patch.target,
        toolGrants: patch.toolGrants,
        enabled: patch.enabled,
      });
      return toScheduledJobDto(row);
    },

    async setEnabled(ctx, jobId, enabled) {
      await assertWritableWorkspace(db,ctx);
      const current=await repoFor(ctx).getJob(jobId);
      if(enabled&&(current.target as Record<string,unknown>)?.mergedIntoSelfMetrics === true)throw new ValidationError("此任务已合并，请在作品自动同步中开启对应能力");
      if (enabled) {
        const current = await repoFor(ctx).getJob(jobId);
        if (retiredSourceKinds.has(current.sourceKind)&&!isBackfill(current.sourceKind,current.target as Record<string,unknown>)) {
          throw new ValidationError("该兼容任务已退役，不能重新启用");
        }
      }
      const row = await repoFor(ctx).setEnabled(jobId, enabled);
      return toScheduledJobDto(row);
    },

    async createRun(ctx, input) {
      await assertWritableWorkspace(db,ctx);
      if (input.aiTaskId && (await repoFor(ctx).getJob(input.jobId)).sourceKind === "self.traffic") {
        // 与崩溃恢复共用 task→job 行锁，两个同时触发只产生原 task 的一条 run。
        const row = await createScheduledRunIntentService(db, { now, nextId }, ["self.traffic"]).ensureRunForTask(ctx, input.aiTaskId);
        if(row.jobId!==input.jobId)throw new ValidationError("流量任务与作业不匹配");
        return toJobRunDto(row);
      }
      const row = await repoFor(ctx).createRun({
        jobId: input.jobId,
        aiTaskId: input.aiTaskId ?? null,
        status: input.status,
        // [GAP-08] 计划触发锚透传(cron 到点才有;「立即运行」缺省 null)。
        scheduledFor: input.scheduledFor ?? null,
      });
      return toJobRunDto(row);
    },

    async getRunScheduledFor(ctx,runId){return (await repoFor(ctx).getRun(runId)).scheduledFor??null;},
    async getRun(ctx, runId) {
      return toJobRunDto(await repoFor(ctx).getRun(runId));
    },

    async listRunsByJob(ctx, jobId, query) {
      const { rows, total } = await repoFor(ctx).listRunsByJob(jobId, query);
      return { rows: rows.map(toJobRunDto), total };
    },

    async listRunningRuns(ctx) {
      // [T-332 S2 · ISO-06] 系统 sweep 专用(启动扫超时):job_run 父锚继承,系统路径仅按
      //   userId 收窄(见 repo.listRunsByStatus 注释);用户面 run 读走 listRunsByJob(经父门)。
      const rows = await repoFor(ctx).listRunsByStatus("running");
      return rows.map(toJobRunDto);
    },

    async updateRun(ctx, runId, patch) {
      const repo=repoFor(ctx),run=await repo.getRun(runId);
      let privateAdmission=false;
      if(ctx.source==='ingestion'&&ctx.groupId&&ctx.accountId){
        const job=await repo.getJob(run.jobId);
        if(PRIVATE_COLLECTION_SOURCE_KINDS.has(job.sourceKind)){await assertPrivateCollectorJob(db,ctx,job.id,job.sourceKind);privateAdmission=true;}
      }
      await assertWritableWorkspace(db,ctx,{allowArchived:privateAdmission});
      const row = await repo.updateRun(runId, patch);
      return toJobRunDto(row);
    },
  };
}
