// 审核门模块 schema 面 —— 本模块产出的契约 Zod DTO(照 reviews.schema.ts 约定):
// 契约是 wire 形状单一真值(contract/src/resources/review-gate.ts);transport 的
// mapper 与契约测试都对此校验。root barrel 只 re-export ENDPOINTS,故经
// ENDPOINTS.<opKey>.response 取 resource。
import { ENDPOINTS } from "@creatoros/contract";
import type {
  ReviewRuleRow,
  ScriptReviewReportRow,
} from "./review-gate.repository";

export const reviewRuleResource = ENDPOINTS.listReviewRules.response;
export const scriptReviewReportResource =
  ENDPOINTS.getLatestScriptReview.response;

export type ReviewRuleResource = (typeof reviewRuleResource)["_output"];
export type ScriptReviewReportResource =
  (typeof scriptReviewReportResource)["_output"];

// Row → DTO(SPEC §9:显式 mapper,绝不裸传 Drizzle 行)。user_id 是归属边界,不上 wire。
export function toReviewRuleDto(row: ReviewRuleRow): ReviewRuleResource {
  return {
    id: row.id,
    groupId: row.groupId ?? null,
    scope: row.groupId ? "group" : row.source === "seed" ? "system" : "shared_legacy",
    scopeDescription: row.groupId ? "仅当前账号组" : row.source === "seed" ? "系统共享规则；修改会影响所有账号组，需明确确认" : "历史共享规则；原归属未知，修改会影响所有账号组，需明确确认",
    tier: row.tier as ReviewRuleResource["tier"],
    category: row.category,
    matchType: row.matchType as ReviewRuleResource["matchType"],
    pattern: row.pattern,
    replacement: row.replacement ?? null,
    note: row.note,
    source: row.source as ReviewRuleResource["source"],
    status: row.status as ReviewRuleResource["status"],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toScriptReviewReportDto(
  row: ScriptReviewReportRow,
): ScriptReviewReportResource {
  return {
    id: row.id,
    projectId: row.projectId,
    artifactId: row.artifactId ?? null,
    artifactVersion: row.artifactVersion,
    verdict: row.verdict as ScriptReviewReportResource["verdict"],
    summary: row.summary,
    lintFindings: (row.lintFindings ??
      []) as ScriptReviewReportResource["lintFindings"],
    llmFindings: (row.llmFindings ??
      []) as ScriptReviewReportResource["llmFindings"],
    modelLabel: row.modelLabel,
    reviewedAt: row.reviewedAt,
  };
}
