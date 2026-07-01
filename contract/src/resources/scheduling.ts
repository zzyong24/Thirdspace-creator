import { z } from "zod";
import {
  id,
  iso8601,
  scheduledJobSourceKind,
  jobRunStatus,
} from "../primitives";

// T-007 调度 Agent 作业(data-source-pipeline-design §4)——两张 owned-root 表的 wire DTO。
// 通用原语:一个作业 = 一段提示词 + 一个调度(cron)+ 目标源(∈ self.metrics|comments)。
// 到点调度器产一条 ai_task 走既有队列(D3),每次触发记一条 job_run(瘦调度触发记录)。
// D1 只做数据模型 + contract + CRUD service;调度器/采集分支/立即运行/UI 是后续切片。
//
// jsonb 字段(target/toolGrants/recipe)在 wire 上是自由形状:target 是源标识(自己源
// {externalSourceId} / 评论源 {awemeId,maxPages}),不同源结构不同,故用 z.record 兜住;
// toolGrants 是工具白名单(偏只读 + 落库);recipe 是 Agent 发现产出的确定性重放配方
// (选择器/接口路径/步骤),nullable(内建采集器源首版可空)。ISO-8601 text 时间戳、text PK,
// 沿用 ai.ts / candidate.ts 范式。

// ScheduledJob — 通用作业定义(owned-root)。任务中心展示 + 调度器读 enabled job。
export const scheduledJobResource = z.object({
  id,
  userId: id,
  name: z.string(), // 作业名(任务中心展示)
  prompt: z.string(), // 作业提示词(Agent 发现路径用;内建采集器源可空 → "")
  sourceKind: scheduledJobSourceKind, // self.metrics | comments(本期两源)
  target: z.record(z.string(), z.unknown()), // 源标识(jsonb;不同源结构不同)
  schedule: z.string(), // cron 表达式(node-cron,D3)
  toolGrants: z.array(z.unknown()), // 工具白名单(偏只读 + 落库)
  recipe: z.record(z.string(), z.unknown()).nullable(), // 确定性重放配方(nullable)
  enabled: z.boolean(), // 启用开关
  lastRunAt: iso8601.nullable(), // 上次到点触发时刻
  nextRunAt: iso8601.nullable(), // 下次到点时刻(node-cron 算)
  createdAt: iso8601,
  updatedAt: iso8601,
});
export type ScheduledJobResource = z.infer<typeof scheduledJobResource>;

// JobRun — 瘦"调度触发记录"(owned-root):一次到点触发一行。步骤日志复用 ai_task_steps
// (经 aiTaskId 关联,不在此存步骤)。itemsNew/itemsUpdated 是本次采集的新鲜度统计。
export const jobRunResource = z.object({
  id,
  userId: id,
  jobId: id, // 关联 scheduled_job(经 requireJob ownership gate)
  aiTaskId: id.nullable(), // 本次触发产的 ai_task id(D3 回填)
  status: jobRunStatus, // running | succeeded | failed | needs_reconnect
  itemsNew: z.number().int(), // 本次新增条数(作品/快照/评论)
  itemsUpdated: z.number().int(), // 本次更新条数
  error: z.string().nullable(), // 失败原因 / "需重连 Chrome"
  startedAt: iso8601,
  finishedAt: iso8601.nullable(), // nullable until terminal
});
export type JobRunResource = z.infer<typeof jobRunResource>;
