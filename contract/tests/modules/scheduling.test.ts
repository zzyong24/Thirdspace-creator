import { describe, it, expect } from "vitest";
import {
  scheduledJobResource,
  jobRunResource,
} from "../../src/resources/scheduling";
import {
  scheduledJobSourceKind,
  jobRunStatus,
} from "../../src/primitives";
import { schedulingOperations } from "../../src/operations/scheduling";

// T-007 调度 Agent 作业(data-source-pipeline-design §9 D1)—— contract Zod round-trip
// + 枚举校验 + 端点注册断言。两个 owned-root resource + 两个新枚举。

describe("scheduling contract", () => {
  it("parses a ScheduledJob resource (self.metrics 源)", () => {
    const job = scheduledJobResource.parse({
      id: "job-daily-metrics",
      userId: "user-zyongzhu",
      name: "每天抓我主页",
      prompt: "",
      sourceKind: "self.metrics",
      target: { externalSourceId: "src-douyin-self" },
      schedule: "0 9 * * *",
      toolGrants: [],
      recipe: null,
      enabled: true,
      lastRunAt: null,
      nextRunAt: "2026-07-02T01:00:00.000Z",
      createdAt: "2026-06-28T01:00:00.000Z",
      updatedAt: "2026-06-28T01:00:00.000Z",
    });
    expect(job.name).toBe("每天抓我主页");
    expect(job.sourceKind).toBe("self.metrics");
    expect(job.enabled).toBe(true);
    // recipe / lastRunAt nullable → null 合法。
    expect(job.recipe).toBeNull();
    expect(job.lastRunAt).toBeNull();
  });

  it("parses a ScheduledJob resource (comments 源, 带 recipe/target)", () => {
    const job = scheduledJobResource.parse({
      id: "job-daily-comments",
      userId: "user-zyongzhu",
      name: "每天抓我评论",
      prompt: "去我的作品页抓最新评论",
      sourceKind: "comments",
      target: { awemeId: "7xxxxxxxxx", maxPages: 3 },
      schedule: "30 9 * * *",
      toolGrants: ["browser.navigate", "browser.onNetwork"],
      recipe: { selector: ".comment-list", endpoint: "/aweme/v1/web/comment/list/" },
      enabled: false,
      lastRunAt: "2026-06-27T01:00:00.000Z",
      nextRunAt: null,
      createdAt: "2026-06-20T01:00:00.000Z",
      updatedAt: "2026-06-27T01:30:00.000Z",
    });
    expect(job.sourceKind).toBe("comments");
    expect(job.target).toMatchObject({ maxPages: 3 });
    expect(job.toolGrants).toHaveLength(2);
    expect(job.recipe).not.toBeNull();
  });

  it("rejects an unknown ScheduledJob sourceKind (enum guard)", () => {
    // 对标已砍:benchmark 不是本期合法源;douyin_xxx 之类孤儿口径也应 reject。
    expect(() =>
      scheduledJobResource.parse({
        id: "job-x",
        userId: "user-x",
        name: "x",
        prompt: "",
        sourceKind: "benchmark",
        target: {},
        schedule: "0 9 * * *",
        toolGrants: [],
        recipe: null,
        enabled: true,
        lastRunAt: null,
        nextRunAt: null,
        createdAt: "2026-06-28T01:00:00.000Z",
        updatedAt: "2026-06-28T01:00:00.000Z",
      }),
    ).toThrow();
  });

  it("parses a JobRun resource + rejects an unknown status", () => {
    const run = jobRunResource.parse({
      id: "run-1",
      userId: "user-zyongzhu",
      jobId: "job-daily-metrics",
      aiTaskId: "ait-42",
      status: "needs_reconnect",
      itemsNew: 0,
      itemsUpdated: 0,
      error: "需重连 Chrome:登录态过期,请在任务中心点「登录抖音」扫码",
      startedAt: "2026-06-28T01:00:00.000Z",
      finishedAt: "2026-06-28T01:00:05.000Z",
    });
    expect(run.status).toBe("needs_reconnect");
    expect(run.jobId).toBe("job-daily-metrics");
    // aiTaskId / finishedAt / error 都可为 null(running 中的瘦记录)。
    const running = jobRunResource.parse({
      id: "run-2",
      userId: "user-zyongzhu",
      jobId: "job-daily-metrics",
      aiTaskId: null,
      status: "running",
      itemsNew: 0,
      itemsUpdated: 0,
      error: null,
      startedAt: "2026-06-28T02:00:00.000Z",
      finishedAt: null,
    });
    expect(running.aiTaskId).toBeNull();
    expect(running.finishedAt).toBeNull();

    expect(() =>
      jobRunResource.parse({
        id: "run-bad",
        userId: "user-x",
        jobId: "job-x",
        aiTaskId: null,
        status: "cancelled", // 非 jobRunStatus 成员(那是 aiTaskStatus 的值)
        itemsNew: 0,
        itemsUpdated: 0,
        error: null,
        startedAt: "2026-06-28T02:00:00.000Z",
        finishedAt: null,
      }),
    ).toThrow();
  });

  it("enumerates the two new enums exactly", () => {
    expect(scheduledJobSourceKind.options).toEqual(["self.metrics", "comments"]);
    expect(jobRunStatus.options).toEqual([
      "running",
      "succeeded",
      "failed",
      "needs_reconnect",
    ]);
  });

  it("registers the scheduling endpoints (CRUD + runs read)", () => {
    expect(schedulingOperations.createScheduledJob.method).toBe("POST");
    expect(schedulingOperations.createScheduledJob.path).toBe("/scheduled-jobs");
    expect(schedulingOperations.listScheduledJobs.isList).toBe(true);
    expect(schedulingOperations.getScheduledJob.path).toBe(
      "/scheduled-jobs/:jobId",
    );
    expect(schedulingOperations.updateScheduledJob.method).toBe("PATCH");
    expect(schedulingOperations.setScheduledJobEnabled.path).toBe(
      "/scheduled-jobs/:jobId/enabled",
    );
    expect(schedulingOperations.listJobRunsByJob.isList).toBe(true);
    expect(schedulingOperations.listJobRunsByJob.path).toBe(
      "/scheduled-jobs/:jobId/runs",
    );
    expect(schedulingOperations.getJobRun.path).toBe("/job-runs/:runId");
    // 每个端点都 traced 到 fr(traceability.test 也会兜底)。
    expect(schedulingOperations.createScheduledJob.fr.length).toBeGreaterThan(0);
  });
});
