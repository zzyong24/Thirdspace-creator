import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import {
  createSchedulingService,
  type SchedulingService,
} from "./scheduling.service";
import {
  OwnershipError,
  AccountRequiredError,
  ValidationError,
} from "./scheduling.errors";

// Scheduling service test (T-007 D1 → T-332 S2) — the service builds a (user, account)
// 双维 scoped repo per request(repoFor bakes ctx.userId + ctx.accountId)。Proves:
// create/list/get/update/setEnabled land the right state + DTO shape; job_run
// createRun/getRun/listRunsByJob ride requireJob; a cross-user ctx sees nothing
// (OwnershipError → 404);未选号 → AccountRequiredError(引导态);双账号 strict 隔离;
// 系统枚举走显式 listJobsSystem。now/nextId are injected stubs (deterministic).

const NOW = "2026-06-21T00:00:00.000Z";
const ctxA: RequestContext = {
  userId: "user-a",
  requestId: "r1",
  source: "user",
  accountId: "acct-a",
};
const ctxB: RequestContext = {
  userId: "user-b",
  requestId: "r2",
  source: "user",
  accountId: "acct-b",
};
// 同 user-a 的第二个号(双账号 strict 隔离用)。
const ctxA2: RequestContext = {
  userId: "user-a",
  requestId: "r3",
  source: "user",
  accountId: "acct-a2",
};
// 未选号(引导态)。
const ctxNoAcct: RequestContext = { userId: "user-a", requestId: "r4", source: "user" };

function makeService(db: Db): SchedulingService {
  let seq = 0;
  return createSchedulingService({
    db,
    now: () => NOW,
    nextId: (prefix: string) => `${prefix}-${++seq}`,
  });
}

describe("scheduling service", () => {
  let db: Db;
  let svc: SchedulingService;
  beforeEach(async () => {
    ({ db } = await createDb());
    svc = makeService(db);
  });

  it("createJob lands defaults (enabled, empty prompt/target/grants, null recipe)", async () => {
    const job = await svc.createJob(ctxA, {
      name: "每天抓我评论",
      sourceKind: "comments",
      schedule: "0 9 * * *",
    });
    expect(job).toMatchObject({
      userId: "user-a",
      accountId: "acct-a", // [T-332 S2] 属主号从 ctx stamp(§4.6)
      name: "每天抓我评论",
      prompt: "",
      sourceKind: "comments",
      target: {},
      toolGrants: [],
      recipe: null,
      enabled: true,
      lastRunAt: null,
      nextRunAt: null,
      createdAt: NOW,
      updatedAt: NOW,
    });
  });

  it("[T-598] intelligence.sync 只能由系统创建，用户只能开关不能编辑定义", async () => {
    await expect(
      svc.createJob(ctxA, {
        name: "伪造雷达任务",
        sourceKind: "intelligence.sync",
        schedule: "* * * * *",
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    const job = await svc.createJob(ctxA, {
      name: "内容雷达自动同步",
      sourceKind: "intelligence.sync",
      schedule: "*/15 * * * *",
      systemManaged: true,
    });
    await expect(
      svc.updateJob(ctxA, job.id, { schedule: "* * * * *" }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(svc.setEnabled(ctxA, job.id, false)).resolves.toMatchObject({
      enabled: false,
    });
  });

  it("listJobs filters by sourceKind + enabled, scoped to owner", async () => {
    await svc.createJob(ctxA, {
      name: "metrics",
      sourceKind: "self.metrics",
      schedule: "0 9 * * *",
    });
    const comments = await svc.createJob(ctxA, {
      name: "comments",
      sourceKind: "comments",
      schedule: "0 9 * * *",
    });
    await svc.setEnabled(ctxA, comments.id, false);

    const all = await svc.listJobs(ctxA, { limit: 100, offset: 0 });
    expect(all.total).toBe(2);

    const onlyComments = await svc.listJobs(ctxA, {
      sourceKind: "comments",
      limit: 100,
      offset: 0,
    });
    expect(onlyComments.rows.map((r) => r.name)).toEqual(["comments"]);

    const onlyEnabled = await svc.listJobs(ctxA, {
      enabled: true,
      limit: 100,
      offset: 0,
    });
    expect(onlyEnabled.rows.map((r) => r.name)).toEqual(["metrics"]);

    // user B sees nothing.
    const bList = await svc.listJobs(ctxB, { limit: 100, offset: 0 });
    expect(bList.total).toBe(0);
  });

  it("updateJob edits name/prompt/schedule/target/toolGrants/enabled", async () => {
    const job = await svc.createJob(ctxA, {
      name: "j",
      sourceKind: "self.metrics",
      schedule: "0 9 * * *",
    });
    const updated = await svc.updateJob(ctxA, job.id, {
      name: "renamed",
      prompt: "去主页抓",
      schedule: "30 9 * * *",
      target: { externalSourceId: "src-9" },
      toolGrants: ["browser.navigate"],
      enabled: false,
    });
    expect(updated).toMatchObject({
      name: "renamed",
      prompt: "去主页抓",
      schedule: "30 9 * * *",
      target: { externalSourceId: "src-9" },
      toolGrants: ["browser.navigate"],
      enabled: false,
    });
  });

  it("ownership: user B cannot get/update/setEnabled user A's job (OwnershipError)", async () => {
    const job = await svc.createJob(ctxA, {
      name: "A 的作业",
      sourceKind: "self.metrics",
      schedule: "0 9 * * *",
    });
    await expect(svc.getJob(ctxB, job.id)).rejects.toBeInstanceOf(OwnershipError);
    await expect(
      svc.updateJob(ctxB, job.id, { name: "hijack" }),
    ).rejects.toBeInstanceOf(OwnershipError);
    await expect(svc.setEnabled(ctxB, job.id, false)).rejects.toBeInstanceOf(
      OwnershipError,
    );
  });

  it("job_run: createRun/getRun/listRunsByJob ride requireJob + scope to owner", async () => {
    const job = await svc.createJob(ctxA, {
      name: "A 的作业",
      sourceKind: "comments",
      schedule: "0 9 * * *",
    });
    const run = await svc.createRun(ctxA, { jobId: job.id, aiTaskId: "ait-7" });
    expect(run).toMatchObject({
      userId: "user-a",
      jobId: job.id,
      aiTaskId: "ait-7",
      status: "running",
      itemsNew: 0,
      itemsUpdated: 0,
      finishedAt: null,
    });

    const got = await svc.getRun(ctxA, run.id);
    expect(got.id).toBe(run.id);
    const runs = await svc.listRunsByJob(ctxA, job.id, { limit: 100, offset: 0 });
    expect(runs.total).toBe(1);

    // B cannot create a run under A's job, list A's runs, or read A's run.
    await expect(
      svc.createRun(ctxB, { jobId: job.id }),
    ).rejects.toBeInstanceOf(OwnershipError);
    await expect(
      svc.listRunsByJob(ctxB, job.id, { limit: 100, offset: 0 }),
    ).rejects.toBeInstanceOf(OwnershipError);
    await expect(svc.getRun(ctxB, run.id)).rejects.toBeInstanceOf(OwnershipError);
  });

  it("updateRun (scheduler 回填) sets terminal state, scoped to owner", async () => {
    const job = await svc.createJob(ctxA, {
      name: "j",
      sourceKind: "self.metrics",
      schedule: "0 9 * * *",
    });
    const run = await svc.createRun(ctxA, { jobId: job.id });
    const done = await svc.updateRun(ctxA, run.id, {
      status: "needs_reconnect",
      error: "需重连 Chrome:登录态过期",
      finishedAt: "2026-06-21T00:05:00.000Z",
    });
    expect(done.status).toBe("needs_reconnect");
    expect(done.error).toContain("需重连 Chrome");
    expect(done.finishedAt).toBe("2026-06-21T00:05:00.000Z");
    await expect(
      svc.updateRun(ctxB, run.id, { status: "failed" }),
    ).rejects.toBeInstanceOf(OwnershipError);
  });

  it("[T-332 S2] 未选号 → 用户面 job 读写一律抛 AccountRequiredError(引导态)", async () => {
    await expect(
      svc.createJob(ctxNoAcct, {
        name: "j",
        sourceKind: "self.metrics",
        schedule: "0 9 * * *",
      }),
    ).rejects.toBeInstanceOf(AccountRequiredError);
    await expect(
      svc.listJobs(ctxNoAcct, { limit: 100, offset: 0 }),
    ).rejects.toBeInstanceOf(AccountRequiredError);
    await expect(svc.getJob(ctxNoAcct, "any")).rejects.toBeInstanceOf(
      AccountRequiredError,
    );
  });

  it("[T-332 S2] 双账号 strict 隔离:A 号 job 对 A2 号不可见;by-id 跨号 404;系统枚举跨号全见", async () => {
    const jobA = await svc.createJob(ctxA, {
      name: "A 号作业",
      sourceKind: "self.metrics",
      schedule: "0 9 * * *",
    });
    const jobA2 = await svc.createJob(ctxA2, {
      name: "A2 号作业",
      sourceKind: "self.metrics",
      schedule: "0 9 * * *",
    });

    const listA = await svc.listJobs(ctxA, { limit: 100, offset: 0 });
    expect(listA.rows.map((r) => r.id)).toEqual([jobA.id]);
    const listA2 = await svc.listJobs(ctxA2, { limit: 100, offset: 0 });
    expect(listA2.rows.map((r) => r.id)).toEqual([jobA2.id]);

    // by-id 跨号(§4.5)→ 404 语义。
    await expect(svc.getJob(ctxA2, jobA.id)).rejects.toBeInstanceOf(OwnershipError);

    // [ISO-06] 系统枚举(cron 调度器)显式走 listJobsSystem → 该 user 两号 job 全见。
    const sysCtx: RequestContext = {
      userId: "user-a",
      requestId: "scheduler",
      source: "ingestion",
    };
    const all = await svc.listJobsSystem(sysCtx, { limit: 100, offset: 0 });
    expect(new Set(all.rows.map((r) => r.id))).toEqual(new Set([jobA.id, jobA2.id]));
  });

  it("[T-332 S2 · GAP-08] createRun 透传 scheduledFor 落库(cron 锚;DTO 不外露,读回行核验)", async () => {
    const job = await svc.createJob(ctxA, {
      name: "j",
      sourceKind: "self.metrics",
      schedule: "0 9 * * *",
    });
    const anchored = await svc.createRun(ctxA, {
      jobId: job.id,
      scheduledFor: "2026-06-21T09:00:00.000Z",
    });
    const manual = await svc.createRun(ctxA, { jobId: job.id });
    // scheduled_for 是内部幂等锚(不在 contract DTO 里,S3 再议外露)→ 直接读行核验落库。
    const { createSchedulingRepository } = await import("./scheduling.repository");
    let seq = 0;
    const repo = createSchedulingRepository(db, {
      now: () => NOW,
      nextId: (p: string) => `${p}-verify-${++seq}`,
      userId: "user-a",
      accountId: "acct-a",
    });
    expect((await repo.getRun(anchored.id)).scheduledFor).toBe(
      "2026-06-21T09:00:00.000Z",
    );
    expect((await repo.getRun(manual.id)).scheduledFor).toBeNull();
  });
});
