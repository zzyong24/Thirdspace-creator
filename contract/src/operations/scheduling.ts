import { z } from "zod";
import { defineEndpoint } from "../endpoints";
import { id, paginationQuery, scheduledJobSourceKind } from "../primitives";
import {
  scheduledJobResource,
  jobRunResource,
} from "../resources/scheduling";

const jobParams = z.object({ jobId: id });
const runParams = z.object({ runId: id });

// T-007 调度 Agent 作业(data-source-pipeline-design §9 切片 D1)——contract 端点组。
// scheduled_job 的 CRUD(create/list/get/update/setEnabled)+ job_run 只读(listByJob/get)。
// job_run 无 create 端点:调度触发记录由调度器(D3)/「立即运行」(D5)内部产,不经 contract
// 写 op(类比 candidate 的 audience_signals 无 write op)。owned-root,transport 按 ctx.userId
// 收窄,job_run 经 requireJob ownership gate。
export const schedulingOperations = {
  createScheduledJob: defineEndpoint({
    id: "scheduledJobs.create",
    method: "POST",
    path: "/scheduled-jobs",
    body: z.object({
      name: z.string().min(1),
      prompt: z.string().default(""),
      sourceKind: scheduledJobSourceKind,
      target: z.record(z.string(), z.unknown()).default({}),
      schedule: z.string().min(1), // cron 表达式
      toolGrants: z.array(z.unknown()).default([]),
    }),
    response: scheduledJobResource,
    fr: ["FR-SCHED-JOB-CREATE"],
  }),
  listScheduledJobs: defineEndpoint({
    id: "scheduledJobs.list",
    method: "GET",
    path: "/scheduled-jobs",
    query: paginationQuery.extend({
      sourceKind: scheduledJobSourceKind.optional(),
      enabled: z.coerce.boolean().optional(),
    }),
    response: scheduledJobResource,
    isList: true,
    fr: ["FR-SCHED-JOB-LIST"],
  }),
  getScheduledJob: defineEndpoint({
    id: "scheduledJobs.get",
    method: "GET",
    path: "/scheduled-jobs/:jobId",
    params: jobParams,
    response: scheduledJobResource,
    fr: ["FR-SCHED-JOB-GET"],
  }),
  updateScheduledJob: defineEndpoint({
    id: "scheduledJobs.update",
    method: "PATCH",
    path: "/scheduled-jobs/:jobId",
    params: jobParams,
    // 可改 name/prompt/schedule/target/toolGrants/enabled(每个 optional,只改传的字段)。
    body: z.object({
      name: z.string().min(1).optional(),
      prompt: z.string().optional(),
      schedule: z.string().min(1).optional(),
      target: z.record(z.string(), z.unknown()).optional(),
      toolGrants: z.array(z.unknown()).optional(),
      enabled: z.boolean().optional(),
    }),
    response: scheduledJobResource,
    fr: ["FR-SCHED-JOB-UPDATE"],
  }),
  setScheduledJobEnabled: defineEndpoint({
    id: "scheduledJobs.setEnabled",
    method: "POST",
    path: "/scheduled-jobs/:jobId/enabled",
    params: jobParams,
    body: z.object({ enabled: z.boolean() }),
    response: scheduledJobResource,
    fr: ["FR-SCHED-JOB-SET-ENABLED"],
  }),
  listJobRunsByJob: defineEndpoint({
    id: "jobRuns.listByJob",
    method: "GET",
    path: "/scheduled-jobs/:jobId/runs",
    params: jobParams,
    query: paginationQuery,
    response: jobRunResource,
    isList: true,
    fr: ["FR-SCHED-RUN-LIST"],
  }),
  getJobRun: defineEndpoint({
    id: "jobRuns.get",
    method: "GET",
    path: "/job-runs/:runId",
    params: runParams,
    response: jobRunResource,
    fr: ["FR-SCHED-RUN-GET"],
  }),
} as const;
