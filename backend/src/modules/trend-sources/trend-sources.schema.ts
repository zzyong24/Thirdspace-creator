// [T-235b] TrendSources 模块 schema surface —— re-export 契约 DTO + Row→DTO mapper(DTO 由显式
// mapper 构建,NEVER Drizzle row 直出;同 benchmark / candidate 约定)。
import { trendSourceResource } from "@creatoros/contract";
import type { TrendSourceRow } from "./trend-sources.repository";

export { trendSourceResource };

export type TrendSourceResource = (typeof trendSourceResource)["_output"];

export function toTrendSourceDto(row: TrendSourceRow): TrendSourceResource {
  return {
    id: row.id,
    userId: row.userId,
    accountId: row.accountId ?? null,
    name: row.name,
    url: row.url,
    // 库列宽 TEXT;wire 契约收窄 enum(未知值兜底 web,防脏行崩 zod)。
    sourceType: row.sourceType === "rss" ? "rss" : "web",
    domain: row.domain,
    note: row.note ?? null,
    enabled: row.enabled,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
