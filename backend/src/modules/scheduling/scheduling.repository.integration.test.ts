import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { describe, it, expect, beforeEach } from "vitest";
import { createDb, sql, type Db } from "@creatoros/backend";
import { scheduledJobs, jobRuns } from "./scheduling.db-schema";
import {
  createSchedulingRepository,
  type SchedulingRepository,
  type ScheduledJobRow,
  type JobRunRow,
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

// ── [T-367] 采集 job 去重:createJob 幂等 + 部分唯一索引 + 迁移 0046 dedup ────────────
//
// 根治「自动化页同 user+account+sourceKind 出现两条定时任务」:
//   ① createJob 对 6 类采集 kind 幂等复用(命中已有行 → 不建第二条;传入 enabled=true
//      且已有行 disabled → 顺手开启,即「用户点模板卡想开启」的真实意图;只开不关);
//   ② DB 层部分唯一索引 ux_scheduled_job_user_account_source(迁移 0046)兜并发 TOCTOU;
//   ③ 迁移 0046 第一步清存量重复(enabled 优先 → created_at 最早保留)+ 孤儿 job_run。
describe("[T-367] createJob 幂等 + 唯一索引 + 迁移 dedup", () => {
  let db: Db;
  beforeEach(async () => {
    ({ db } = await createDb());
  });

  it("采集 kind 二次 createJob → 复用同一条(不新增);enabled=true 把 disabled 既有行开启", async () => {
    const repoA = repoFor(db, "user-a", "acct-a");
    // 模拟 bootstrap:建默认关的 benchmark job(T-359 分层启用)。
    const first = await repoA.createJob({
      ...JOB_INPUT,
      sourceKind: "benchmark",
      enabled: false,
    });
    expect(first.enabled).toBe(false);
    // 模拟用户点模板卡「新建」同 kind(默认 enabled=true)→ 复用 + 开启,不建第二条。
    const second = await repoA.createJob({ ...JOB_INPUT, sourceKind: "benchmark" });
    expect(second.id).toBe(first.id);
    expect(second.enabled).toBe(true);
    const list = await repoA.listJobs({ sourceKind: "benchmark" });
    expect(list.total).toBe(1);
  });

  it("复用只开不关:既有行 enabled=true,再 create 传 enabled=false → 不反向关闭", async () => {
    const repoA = repoFor(db, "user-a", "acct-a");
    const first = await repoA.createJob({ ...JOB_INPUT, sourceKind: "favorites" });
    expect(first.enabled).toBe(true);
    // bootstrap ensure 竞态方对默认关模板传 enabled=false → 不得覆盖用户已开启意愿。
    const second = await repoA.createJob({
      ...JOB_INPUT,
      sourceKind: "favorites",
      enabled: false,
    });
    expect(second.id).toBe(first.id);
    expect(second.enabled).toBe(true);
  });

  it("不同账号 / 不同 user 的同采集 kind 互不冲突(唯一键含 user_id + account_id)", async () => {
    const acct1 = repoFor(db, "user-a", "acct-1");
    const acct2 = repoFor(db, "user-a", "acct-2");
    const userB = repoFor(db, "user-b", "acct-b");
    const j1 = await acct1.createJob({ ...JOB_INPUT });
    const j2 = await acct2.createJob({ ...JOB_INPUT });
    const j3 = await userB.createJob({ ...JOB_INPUT });
    expect(new Set([j1.id, j2.id, j3.id]).size).toBe(3);
  });

  it("非采集类 kind 不受限:同 kind 可建多条(行为不变)", async () => {
    const repoA = repoFor(db, "user-a", "acct-a");
    const a = await repoA.createJob({ ...JOB_INPUT, sourceKind: "custom.export" });
    const b = await repoA.createJob({ ...JOB_INPUT, sourceKind: "custom.export" });
    expect(a.id).not.toBe(b.id);
    const list = await repoA.listJobs({ sourceKind: "custom.export" });
    expect(list.total).toBe(2);
  });

  it("唯一索引真生效:绕过 repo 直插重复采集行 → 撞 ux_scheduled_job_user_account_source", async () => {
    const repoA = repoFor(db, "user-a", "acct-a");
    const first = await repoA.createJob({ ...JOB_INPUT });
    await expect(
      db.insert(scheduledJobs).values({
        ...first,
        id: "job-dup-raw",
      }),
    ).rejects.toThrow(/ux_scheduled_job_user_account_source|duplicate key/);
  });

  // ── 迁移 0046 dedup 保留规则(enabled 优先 → created_at 最早;孤儿 run 清理)────
  // createDb 已把 0046 应用到位(索引在),没法直接造出「迁移前」的重复态 —— 故先 DROP
  // 索引造重复,再原样重放 0046 的语句(按 statement-breakpoint 切分),验 dedup 语义。
  it("迁移 0046 dedup:留 enabled 那条(同 enabled 取 created_at 最早),孤儿 job_run 清掉", async () => {
    await db.execute(
      sql.raw("DROP INDEX IF EXISTS ux_scheduled_job_user_account_source"),
    );
    const jobRow = (over: Partial<ScheduledJobRow>): ScheduledJobRow => ({
      id: "job-x",
      userId: "user-a",
      accountId: "acct-a",
      name: "n",
      prompt: "",
      sourceKind: "benchmark",
      target: {},
      schedule: "30 9 * * *",
      toolGrants: [],
      recipe: null,
      enabled: false,
      lastRunAt: null,
      nextRunAt: null,
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
      ...over,
    });
    const runRow = (over: Partial<JobRunRow>): JobRunRow => ({
      id: "run-x",
      userId: "user-a",
      jobId: "job-x",
      scheduledFor: null,
      aiTaskId: null,
      status: "succeeded",
      itemsNew: 0,
      itemsUpdated: 0,
      error: null,
      progress: null,
      startedAt: "2026-07-01T09:00:00.000Z",
      finishedAt: "2026-07-01T09:01:00.000Z",
      ...over,
    });
    await db.insert(scheduledJobs).values([
      // benchmark 三条:disabled 更早建 + enabled 晚建(bootstrap 建的关着,用户模板卡
      // 又建了开着的)+ 再一条 disabled → 应留 enabled 那条。
      jobRow({ id: "job-b1", createdAt: "2026-07-01T00:00:00.000Z" }),
      jobRow({ id: "job-b2", enabled: true, createdAt: "2026-07-02T00:00:00.000Z" }),
      jobRow({ id: "job-b3", createdAt: "2026-07-03T00:00:00.000Z" }),
      // comments 两条同 enabled → 留 created_at 最早的。
      jobRow({ id: "job-c1", sourceKind: "comments", enabled: true, createdAt: "2026-07-02T00:00:00.000Z" }),
      jobRow({ id: "job-c2", sourceKind: "comments", enabled: true, createdAt: "2026-07-01T00:00:00.000Z" }),
      // 另一账号同 kind 一条 → 不在同分组,不受影响。
      jobRow({ id: "job-other", accountId: "acct-b", enabled: true }),
      // 非采集 kind 两条 → 不在 dedup 范围。
      jobRow({ id: "job-n1", sourceKind: "custom.export" }),
      jobRow({ id: "job-n2", sourceKind: "custom.export" }),
    ]);
    await db.insert(jobRuns).values([
      runRow({ id: "run-keep", jobId: "job-b2" }),
      runRow({ id: "run-orphan-1", jobId: "job-b1" }),
      runRow({ id: "run-orphan-2", jobId: "job-c1" }),
    ]);

    // 原样重放迁移 0046(dedup 两步 + 建索引)。
    const migrationPath = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../../../drizzle/0046_scheduled_job_unique_source.sql",
    );
    const statements = readFileSync(migrationPath, "utf8")
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const stmt of statements) {
      await db.execute(sql.raw(stmt));
    }

    const jobs = await db.select().from(scheduledJobs);
    const ids = new Set(jobs.map((j) => j.id));
    // benchmark 留 enabled 那条(job-b2);comments 留 created_at 最早(job-c2)。
    expect(ids.has("job-b2")).toBe(true);
    expect(ids.has("job-b1")).toBe(false);
    expect(ids.has("job-b3")).toBe(false);
    expect(ids.has("job-c2")).toBe(true);
    expect(ids.has("job-c1")).toBe(false);
    // 另一账号 / 非采集 kind 不动。
    expect(ids.has("job-other")).toBe(true);
    expect(ids.has("job-n1")).toBe(true);
    expect(ids.has("job-n2")).toBe(true);

    const runs = await db.select().from(jobRuns);
    const runIds = new Set(runs.map((r) => r.id));
    // 幸存 job 的 run 保留;被删 job 的孤儿 run 清掉。
    expect(runIds.has("run-keep")).toBe(true);
    expect(runIds.has("run-orphan-1")).toBe(false);
    expect(runIds.has("run-orphan-2")).toBe(false);

    // 重放后唯一索引已重建 → 重复直插被兜。
    await expect(
      db.insert(scheduledJobs).values(jobRow({ id: "job-b2-dup", enabled: true })),
    ).rejects.toThrow(/ux_scheduled_job_user_account_source|duplicate key/);
  });
});
