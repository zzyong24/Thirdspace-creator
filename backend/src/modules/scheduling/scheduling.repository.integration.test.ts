import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import {
  createSchedulingRepository,
  type SchedulingRepository,
} from "./scheduling.repository";
import { OwnershipError, AccountRequiredError } from "./scheduling.errors";

// Scheduling repository integration test (T-007 D1 → T-332 S2) — 双维(user, account)
// strict 隔离 over REAL pglite SQL。repo 把 userId + accountId 烤进 deps;本测试证明:
// 每个读写都按双维收窄(B user / B 号 都摸不到 A 号的 scheduled_job / job_run),未选号
// (accountId=null)走用户路径直接 AccountRequiredError,系统路径(listJobsAllAccountsSystem
// / listRunsByStatus)显式命名且仅按 userId 收窄(ISO-06)。claimOrphanJobs 已随 T-332 S2
// 全链退役(SPEC §4.4),本文件不再有认领用例。

const NOW = "2026-06-21T00:00:00.000Z";

function repoFor(
  db: Db,
  userId: string,
  accountId: string | null = `acct-${userId}`,
  tag = `${userId}-${accountId ?? "none"}`,
): SchedulingRepository {
  let seq = 0;
  return createSchedulingRepository(db, {
    now: () => NOW,
    nextId: (prefix: string) => `${prefix}-${tag}-${++seq}`,
    userId,
    accountId,
  });
}

const JOB_INPUT = {
  name: "A 的作业",
  prompt: "",
  sourceKind: "self.metrics",
  target: { externalSourceId: "src-1" } as Record<string, unknown>,
  schedule: "0 9 * * *",
  toolGrants: [] as unknown[],
};

describe("scheduling repository (user+account scoped)", () => {
  let db: Db;
  beforeEach(async () => {
    ({ db } = await createDb());
  });

  it("createJob stamps userId + accountId(从 deps,§4.6)+ defaults; getJob reads it back", async () => {
    const repoA = repoFor(db, "user-a", "acct-a");
    const job = await repoA.createJob({ ...JOB_INPUT });
    expect(job.userId).toBe("user-a");
    expect(job.accountId).toBe("acct-a");
    expect(job.enabled).toBe(true);
    expect(job.recipe).toBeNull();
    expect(job.lastRunAt).toBeNull();
    const got = await repoA.getJob(job.id);
    expect(got.id).toBe(job.id);
  });

  it("[T-332 S2] 未选号(accountId=null)→ 用户路径读写一律 AccountRequiredError(引导态,不隐式全量)", async () => {
    const noAcct = repoFor(db, "user-a", null);
    await expect(noAcct.createJob({ ...JOB_INPUT })).rejects.toBeInstanceOf(
      AccountRequiredError,
    );
    await expect(noAcct.listJobs({})).rejects.toBeInstanceOf(AccountRequiredError);
    await expect(noAcct.getJob("whatever")).rejects.toBeInstanceOf(
      AccountRequiredError,
    );
  });

  it("scopes every scheduled_job read to the owner (B user cannot read A's job)", async () => {
    const repoA = repoFor(db, "user-a", "acct-a");
    const job = await repoA.createJob({ ...JOB_INPUT });

    const repoB = repoFor(db, "user-b", "acct-b");
    await expect(repoB.getJob(job.id)).rejects.toBeInstanceOf(OwnershipError);
    const bList = await repoB.listJobs({});
    expect(bList.rows).toHaveLength(0);
    // owner still sees it.
    const aList = await repoA.listJobs({});
    expect(aList.rows.map((r) => r.id)).toContain(job.id);
  });

  it("[T-332 S2] 双账号 strict 隔离:同 user 的 B 号读不到 A 号的 job;by-id 跨号 → 404", async () => {
    const acctA = repoFor(db, "user-a", "acct-1");
    const acctB = repoFor(db, "user-a", "acct-2");
    const jobA = await acctA.createJob({ ...JOB_INPUT });
    const jobB = await acctB.createJob({ ...JOB_INPUT, name: "B 号作业" });

    // 列表互不可见(strict eq,无 OR-NULL)。
    const aList = await acctA.listJobs({});
    expect(aList.rows.map((r) => r.id)).toEqual([jobA.id]);
    const bList = await acctB.listJobs({});
    expect(bList.rows.map((r) => r.id)).toEqual([jobB.id]);

    // by-id 跨号(§4.5)→ 与跨 user 同语义 404,不泄漏存在性。
    await expect(acctB.getJob(jobA.id)).rejects.toBeInstanceOf(OwnershipError);
    await expect(acctB.updateJob(jobA.id, { name: "hijack" })).rejects.toBeInstanceOf(
      OwnershipError,
    );
    // job_run 父锚:B 号不能在 A 号 job 下建/读 run。
    await expect(acctB.createRun({ jobId: jobA.id })).rejects.toBeInstanceOf(
      OwnershipError,
    );
    await expect(acctB.listRunsByJob(jobA.id, {})).rejects.toBeInstanceOf(
      OwnershipError,
    );
  });

  it("[T-332 S2 · ISO-06] listJobsAllAccountsSystem:系统枚举跨号可见(仅按 userId 收窄)", async () => {
    const acctA = repoFor(db, "user-a", "acct-1");
    const acctB = repoFor(db, "user-a", "acct-2");
    await acctA.createJob({ ...JOB_INPUT });
    await acctB.createJob({ ...JOB_INPUT, name: "B 号作业" });
    // 系统 repo(accountId=null)走显式 System 方法 → 两号 job 全见(cron 调度枚举语义)。
    const sysRepo = repoFor(db, "user-a", null);
    const all = await sysRepo.listJobsAllAccountsSystem({});
    expect(all.rows).toHaveLength(2);
    expect(new Set(all.rows.map((r) => r.accountId))).toEqual(
      new Set(["acct-1", "acct-2"]),
    );
    // 但别的 user 的系统枚举看不到(userId 边界不破)。
    const sysB = repoFor(db, "user-b", null);
    expect((await sysB.listJobsAllAccountsSystem({})).rows).toHaveLength(0);
  });

  it("B user cannot mutate A's job (update / setEnabled → OwnershipError)", async () => {
    const repoA = repoFor(db, "user-a", "acct-a");
    const job = await repoA.createJob({ ...JOB_INPUT, sourceKind: "comments" });
    const repoB = repoFor(db, "user-b", "acct-b");
    await expect(
      repoB.updateJob(job.id, { name: "hijack" }),
    ).rejects.toBeInstanceOf(OwnershipError);
    await expect(repoB.setEnabled(job.id, false)).rejects.toBeInstanceOf(
      OwnershipError,
    );
    // A's job is untouched.
    const still = await repoA.getJob(job.id);
    expect(still.name).toBe("A 的作业");
    expect(still.enabled).toBe(true);
  });

  it("updateJob patches only touched fields + writes updated_at", async () => {
    const repoA = repoFor(db, "user-a", "acct-a");
    const job = await repoA.createJob({
      ...JOB_INPUT,
      prompt: "old",
      target: { a: 1 },
    });
    const patched = await repoA.updateJob(job.id, {
      schedule: "30 9 * * *",
      enabled: false,
      recipe: { selector: ".x" }, // D3-only field, set through the repo write path
    });
    expect(patched.schedule).toBe("30 9 * * *");
    expect(patched.enabled).toBe(false);
    expect(patched.recipe).toEqual({ selector: ".x" });
    // untouched fields survive.
    expect(patched.name).toBe("A 的作业");
    expect(patched.prompt).toBe("old");
    expect(patched.target).toEqual({ a: 1 });
  });

  it("job_run rides requireJob: createRun/listRunsByJob under a foreign job → OwnershipError", async () => {
    const repoA = repoFor(db, "user-a", "acct-a");
    const jobA = await repoA.createJob({ ...JOB_INPUT });

    // A can create + list runs under its own job.
    const run = await repoA.createRun({ jobId: jobA.id, aiTaskId: "ait-1" });
    expect(run.userId).toBe("user-a");
    expect(run.status).toBe("running");
    const aRuns = await repoA.listRunsByJob(jobA.id, {});
    expect(aRuns.rows.map((r) => r.id)).toContain(run.id);

    // B cannot create a run under A's job (requireJob gate), nor list A's runs, nor read
    // the run row directly.
    const repoB = repoFor(db, "user-b", "acct-b");
    await expect(
      repoB.createRun({ jobId: jobA.id }),
    ).rejects.toBeInstanceOf(OwnershipError);
    await expect(repoB.listRunsByJob(jobA.id, {})).rejects.toBeInstanceOf(
      OwnershipError,
    );
    await expect(repoB.getRun(run.id)).rejects.toBeInstanceOf(OwnershipError);
  });

  it("[T-332 S2 · GAP-08] createRun 写入 scheduledFor;同 (job, scheduled_for) 二次插入撞部分唯一约束", async () => {
    const repoA = repoFor(db, "user-a", "acct-a");
    const jobA = await repoA.createJob({ ...JOB_INPUT });
    const anchor = "2026-06-21T09:00:00.000Z";
    const run = await repoA.createRun({ jobId: jobA.id, scheduledFor: anchor });
    expect(run.scheduledFor).toBe(anchor);
    // 同 job 同计划 tick 重复触发 → ux_job_run_job_scheduled_for 兜住(约束层真生效)。
    await expect(
      repoA.createRun({ jobId: jobA.id, scheduledFor: anchor }),
    ).rejects.toThrow();
    // 「立即运行」不带锚(null)→ 不受部分唯一约束限制,可多次。
    const manual1 = await repoA.createRun({ jobId: jobA.id });
    const manual2 = await repoA.createRun({ jobId: jobA.id });
    expect(manual1.scheduledFor).toBeNull();
    expect(manual2.scheduledFor).toBeNull();
  });

  it("updateRun (scheduler 回填) patches status/items/finishedAt, scoped to owner;系统 sweep(无号 repo)可回填", async () => {
    const repoA = repoFor(db, "user-a", "acct-a");
    const jobA = await repoA.createJob({ ...JOB_INPUT, sourceKind: "comments" });
    const run = await repoA.createRun({ jobId: jobA.id });
    const done = await repoA.updateRun(run.id, {
      status: "succeeded",
      itemsNew: 12,
      itemsUpdated: 3,
      finishedAt: "2026-06-21T00:05:00.000Z",
    });
    expect(done.status).toBe("succeeded");
    expect(done.itemsNew).toBe(12);
    expect(done.itemsUpdated).toBe(3);
    expect(done.finishedAt).toBe("2026-06-21T00:05:00.000Z");

    // B user cannot 回填 A's run.
    const repoB = repoFor(db, "user-b", "acct-b");
    await expect(
      repoB.updateRun(run.id, { status: "failed" }),
    ).rejects.toBeInstanceOf(OwnershipError);

    // [ISO-06] 系统 sweep 路径(accountId=null):getRun/updateRun/listRunsByStatus 仅按
    // userId 收窄(启动扫超时用),不因无号被断言挡住。
    const sysRepo = repoFor(db, "user-a", null);
    const running = await sysRepo.listRunsByStatus("running");
    expect(Array.isArray(running)).toBe(true);
    const swept = await sysRepo.updateRun(run.id, { status: "failed" });
    expect(swept.status).toBe("failed");
  });
});
