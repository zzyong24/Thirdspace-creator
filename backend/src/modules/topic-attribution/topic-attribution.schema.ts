// [T-235d] TopicAttribution 模块 schema surface —— re-export 契约 DTO + Row→DTO mapper(DTO 由
// 显式 mapper 构建,NEVER Drizzle row 直出;同 benchmark / trend-sources 约定)。
import { topicAttributionResource } from "@creatoros/contract";
import type { TopicAttributionRow } from "./topic-attribution.repository";

export { topicAttributionResource };

export type TopicAttributionResource =
  (typeof topicAttributionResource)["_output"];

export function toTopicAttributionDto(
  row: TopicAttributionRow,
): TopicAttributionResource {
  return {
    id: row.id,
    userId: row.userId,
    accountId: row.accountId ?? null,
    publicationId: row.publicationId,
    projectId: row.projectId ?? null,
    performanceTier: row.performanceTier,
    baselineRatio: row.baselineRatio ?? null,
    topicType: row.topicType,
    hookType: row.hookType,
    structureFormula: row.structureFormula,
    whyWorked: row.whyWorked,
    whyFailed: row.whyFailed,
    reusableFormula: row.reusableFormula,
    raw: (row.raw ?? {}) as Record<string, unknown>,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
