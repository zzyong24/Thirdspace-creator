import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import {
  createSchedulingRepository,
  type SchedulingRepository,
} from "./scheduling.repository";
import { OwnershipError } from "./scheduling.errors";

// Scheduling repository integration test (T-007 D1) — user-scoped isolation over REAL
// pglite SQL. The repo bakes userId in deps; the test proves EVERY read/write is scoped:
// user B can neither read nor mutate user A's scheduled_job / job_run, and the requireJob
// gate blocks creating/listing runs under a job the caller does not own. Mirrors the
// candidate repository integration test.

const NOW = "2026-06-21T00:00:00.000Z";

function repoFor(db: Db, userId: string, tag = userId): SchedulingRepository {
  let seq = 0;
  return createSchedulingRepository(db, {
    now: () => NOW,
    nextId: (prefix: string) => `${prefix}-${tag}-${++seq}`,
    userId,
  });
}

describe("scheduling repository (user-scoped)", () => {
  let db: Db;
  beforeEach(async () => {
    ({ db } = await createDb());
  });

  it("createJob stamps userId + defaults; getJob reads it back", async () => {
    const repoA = repoFor(db, "user-a");
    const job = await repoA.createJob({
      name: "A 的作业",
      prompt: "",
      sourceKind: "self.metrics",
      target: { externalSourceId: "src-1" },
      schedule: "0 9 * * *",
      toolGrants: [],
    });
    expect(job.userId).toBe("user-a");
    expect(job.enabled).toBe(true);
    expect(job.recipe).toBeNull();
    expect(job.lastRunAt).toBeNull();
    const got = await repoA.getJob(job.id);
    expect(got.id).toBe(job.id);
  });

  it("scopes every scheduled_job read to the owner (B cannot read A's job)", async () => {
    const repoA = repoFor(db, "user-a");
    const job = await repoA.createJob({
      name: "A 的作业",
      prompt: "",
      sourceKind: "self.metrics",
      target: {},
      schedule: "0 9 * * *",
      toolGrants: [],
    });

    const repoB = repoFor(db, "user-b");
    await expect(repoB.getJob(job.id)).rejects.toBeInstanceOf(OwnershipError);
    const bList = await repoB.listJobs({});
    expect(bList.rows).toHaveLength(0);
    // owner still sees it.
    const aList = await repoA.listJobs({});
    expect(aList.rows.map((r) => r.id)).toContain(job.id);
  });

  it("B cannot mutate A's job (update / setEnabled → OwnershipError)", async () => {
    const repoA = repoFor(db, "user-a");
    const job = await repoA.createJob({
      name: "A 的作业",
      prompt: "",
      sourceKind: "comments",
      target: {},
      schedule: "0 9 * * *",
      toolGrants: [],
    });
    const repoB = repoFor(db, "user-b");
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
    const repoA = repoFor(db, "user-a");
    const job = await repoA.createJob({
      name: "A 的作业",
      prompt: "old",
      sourceKind: "self.metrics",
      target: { a: 1 },
      schedule: "0 9 * * *",
      toolGrants: [],
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
    const repoA = repoFor(db, "user-a");
    const jobA = await repoA.createJob({
      name: "A 的作业",
      prompt: "",
      sourceKind: "self.metrics",
      target: {},
      schedule: "0 9 * * *",
      toolGrants: [],
    });

    // A can create + list runs under its own job.
    const run = await repoA.createRun({ jobId: jobA.id, aiTaskId: "ait-1" });
    expect(run.userId).toBe("user-a");
    expect(run.status).toBe("running");
    const aRuns = await repoA.listRunsByJob(jobA.id, {});
    expect(aRuns.rows.map((r) => r.id)).toContain(run.id);

    // B cannot create a run under A's job (requireJob gate), nor list A's runs, nor read
    // the run row directly.
    const repoB = repoFor(db, "user-b");
    await expect(
      repoB.createRun({ jobId: jobA.id }),
    ).rejects.toBeInstanceOf(OwnershipError);
    await expect(repoB.listRunsByJob(jobA.id, {})).rejects.toBeInstanceOf(
      OwnershipError,
    );
    await expect(repoB.getRun(run.id)).rejects.toBeInstanceOf(OwnershipError);
  });

  it("updateRun (scheduler 回填) patches status/items/finishedAt, scoped to owner", async () => {
    const repoA = repoFor(db, "user-a");
    const jobA = await repoA.createJob({
      name: "A 的作业",
      prompt: "",
      sourceKind: "comments",
      target: {},
      schedule: "0 9 * * *",
      toolGrants: [],
    });
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

    // B cannot 回填 A's run.
    const repoB = repoFor(db, "user-b");
    await expect(
      repoB.updateRun(run.id, { status: "failed" }),
    ).rejects.toBeInstanceOf(OwnershipError);
  });
});
