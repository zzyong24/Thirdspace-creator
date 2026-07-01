import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import {
  createSchedulingService,
  type SchedulingService,
} from "./scheduling.service";
import { OwnershipError } from "./scheduling.errors";

// Scheduling service test (T-007 D1) — the service builds a user-scoped repo per request
// (repoFor bakes ctx.userId). Proves: create/list/get/update/setEnabled land the right
// state + DTO shape; job_run createRun/getRun/listRunsByJob ride requireJob; a cross-user
// ctx sees nothing (OwnershipError → 404). now/nextId are injected stubs (deterministic).

const NOW = "2026-06-21T00:00:00.000Z";
const ctxA: RequestContext = { userId: "user-a", requestId: "r1", source: "user" };
const ctxB: RequestContext = { userId: "user-b", requestId: "r2", source: "user" };

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
});
