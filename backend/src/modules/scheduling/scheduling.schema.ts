// Scheduling module schema surface — the contract Zod DTOs this module produces
// (foundation §5). The transport's mappers and the contract test validate their outputs
// against these; the contract is the single source of truth for the wire shape
// (contract/src/resources/scheduling.ts). Topology mirrors candidate.schema.ts: the
// @creatoros/contract root barrel re-exports `ENDPOINTS` (not the resource files), so the
// op responses are reached as ENDPOINTS.<opKey>.response.
//   - createScheduledJob.response === listScheduledJobs.response === getScheduledJob.response
//       === updateScheduledJob.response === setScheduledJobEnabled.response === scheduledJobResource
//   - listJobRunsByJob.response === getJobRun.response === jobRunResource
import { ENDPOINTS } from "@creatoros/contract";
import type { ScheduledJobRow, JobRunRow } from "./scheduling.repository";

export const scheduledJobResource = ENDPOINTS.getScheduledJob.response;
export const jobRunResource = ENDPOINTS.getJobRun.response;

// Derive the inferred output type from the schema's phantom `_output` (zod 4's
// `z.infer<T>` is `T["_output"]`). Mirrors candidate/positioning (read the output type
// structurally so the module does not depend on zod directly for the type).
export type ScheduledJobResource = (typeof scheduledJobResource)["_output"];
export type JobRunResource = (typeof jobRunResource)["_output"];

// jsonb(unknown) → a plain record (the contract shape is z.record(string, unknown)).
// A non-object (null/array/primitive) normalizes to `{}` so the DTO always validates.
function toRecord(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

// jsonb(unknown) → a nullable record (recipe). null/absent stays null; a non-object
// coerces to null (an array/primitive recipe is not a valid config).
function toNullableRecord(raw: unknown): Record<string, unknown> | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return null;
}

// jsonb(unknown) → an array (tool_grants). A non-array normalizes to [].
function toArray(raw: unknown): unknown[] {
  return Array.isArray(raw) ? raw : [];
}

/**
 * 存量迁移曾用 `CURRENT_TIMESTAMP::TEXT` 写出 PostgreSQL 文本时刻
 * (`2026-07-29 08:55:14.702+00`)。它表示的仍是真实时刻，只是没有满足 wire
 * contract 的 UTC ISO 形状。统一在 DTO 边界规范化；完全不可解析的脏值原样保留，
 * 让契约继续显式报错，绝不编造时间。
 */
function toIsoInstant(value: string): string;
function toIsoInstant(value: string | null): string | null;
function toIsoInstant(value: string | null): string | null {
  if (value === null) return null;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds)
    ? new Date(milliseconds).toISOString()
    : value;
}

// Row → DTO mappers (SPEC §9: the API DTO is built by an explicit mapper, NEVER the
// Drizzle row). The service + contract test share ONE mapping so a wire-shape change is
// caught once.
export function toScheduledJobDto(row: ScheduledJobRow): ScheduledJobResource {
  return {
    id: row.id,
    userId: row.userId,
    groupId:row.groupId??null,groupVersion:row.groupVersion??null,membershipVersion:row.membershipVersion??null,
    // [T-200] 属主号(nullable)。cron 触发的采集 ctx.accountId 由此派生;DTO 带出便于调试/前端。
    accountId: (row as { accountId?: string | null }).accountId ?? null,
    name: row.name,
    prompt: row.prompt,
    sourceKind: row.sourceKind as ScheduledJobResource["sourceKind"],
    target: toRecord((row as { target?: unknown }).target),
    schedule: row.schedule,
    toolGrants: toArray((row as { toolGrants?: unknown }).toolGrants),
    recipe: toNullableRecord((row as { recipe?: unknown }).recipe),
    enabled: row.enabled,
    lastRunAt: toIsoInstant(row.lastRunAt ?? null),
    nextRunAt: toIsoInstant(row.nextRunAt ?? null),
    createdAt: toIsoInstant(row.createdAt),
    updatedAt: toIsoInstant(row.updatedAt),
  };
}

export function toJobRunDto(row: JobRunRow): JobRunResource {
  return {
    id: row.id,
    userId: row.userId,
    groupId:row.groupId??null,groupVersion:row.groupVersion??null,membershipVersion:row.membershipVersion??null,
    jobId: row.jobId,
    aiTaskId: row.aiTaskId ?? null,
    status: row.status as JobRunResource["status"],
    itemsNew: row.itemsNew,
    itemsUpdated: row.itemsUpdated,
    error: row.error ?? null,
    // [T-152] 实时采集进度(jsonb → nullable record)。NULL / 非对象 → null(旧 run / 未上报
    // 进度向后兼容,前端读到 null 不崩)。zod jobRunProgress.nullish() 兜住形状。
    progress: toNullableRecord(row.progress) as JobRunResource["progress"],
    startedAt: toIsoInstant(row.startedAt),
    finishedAt: toIsoInstant(row.finishedAt ?? null),
  };
}
