import { describe, it, expect } from "vitest";
import { ENDPOINTS } from "../src/endpoints";

// The authoritative SPEC §13 surface — every "METHOD /path" line, verbatim.
const SPEC_13: ReadonlyArray<[string, string]> = [
  // 项目与流程
  ["GET", "/projects"],
  ["POST", "/projects"],
  ["GET", "/projects/:projectId"],
  ["PATCH", "/projects/:projectId"],
  ["POST", "/projects/:projectId/archive"],
  ["POST", "/projects/:projectId/stages/:stage/transition"],
  ["GET", "/projects/:projectId/overview"],
  ["GET", "/projects/:projectId/stages"],
  ["POST", "/projects/:projectId/outputs"],
  ["GET", "/projects/:projectId/outputs"],
  ["GET", "/outputs/:outputId"],
  ["PATCH", "/outputs/:outputId"],
  ["POST", "/outputs/:outputId/stages/:stage/transition"],
  ["GET", "/projects/:projectId/tasks"],
  ["POST", "/projects/:projectId/tasks"],
  ["PATCH", "/tasks/:taskId"],
  ["GET", "/projects/:projectId/activity"],
  // 产物
  ["GET", "/projects/:projectId/artifacts"],
  ["POST", "/projects/:projectId/artifacts"],
  ["GET", "/artifacts/:artifactId"],
  ["POST", "/artifacts/:artifactId/versions"],
  ["GET", "/artifacts/:artifactId/versions"],
  ["POST", "/artifacts/:artifactId/restore"],
  ["POST", "/artifacts/:artifactId/relations"],
  // 知识与素材
  ["GET", "/knowledge"],
  ["POST", "/knowledge"],
  ["GET", "/knowledge/:knowledgeId"],
  ["POST", "/knowledge/:knowledgeId/revisions"],
  ["GET", "/knowledge/:knowledgeId/revisions"],
  ["POST", "/knowledge/:knowledgeId/relations"],
  ["GET", "/knowledge/:knowledgeId/relations"],
  ["POST", "/knowledge/:knowledgeId/archive"],
  ["POST", "/knowledge/:knowledgeId/relations/remove"],
  // 知识与素材 — Taxonomy (Tag / EntityTag) sub-group (v0.2)
  ["GET", "/tags"],
  ["POST", "/tags"],
  ["PATCH", "/tags/:tagId"],
  ["POST", "/tags/:tagId/delete"],
  ["POST", "/tags/assignments"],
  ["POST", "/tags/assignments/remove"],
  ["GET", "/tags/for-entity"],
  ["GET", "/tags/:tagId/entities"],
  ["GET", "/assets"],
  ["POST", "/assets/uploads"],
  ["POST", "/assets/uploads/:uploadId/complete"],
  ["GET", "/assets/:assetId"],
  ["POST", "/assets/:assetId/files"],
  ["POST", "/assets/:assetId/trash"],
  ["POST", "/assets/:assetId/restore"],
  ["POST", "/assets/:assetId/favorite"],
  ["GET", "/assets/:assetId/usage"],
  // 制作与发布
  ["GET", "/outputs/:outputId/production"],
  ["PUT", "/outputs/:outputId/production"],
  ["POST", "/productions/:productionId/segments"],
  ["POST", "/productions/:productionId/exports"],
  ["POST", "/exports/:exportId/complete"],
  ["GET", "/outputs/:outputId/publications"],
  ["POST", "/outputs/:outputId/publications"],
  ["GET", "/publications/:publicationId"],
  ["POST", "/publications/:publicationId/revisions"],
  ["GET", "/publications/:publicationId/revisions"],
  ["POST", "/publications/:publicationId/transition"],
  // 分析、复盘和经验
  ["GET", "/analytics/publications/:publicationId"],
  ["GET", "/analytics/projects/:projectId"],
  ["GET", "/analytics/dashboard"],
  ["POST", "/projects/:projectId/reviews"],
  ["GET", "/reviews/:reviewId"],
  ["POST", "/reviews/:reviewId/insights"],
  ["POST", "/reviews/:reviewId/complete"],
  ["GET", "/learnings"],
  ["GET", "/learnings/:learningId"],
  ["POST", "/learnings"],
  ["POST", "/learnings/:learningId/applications"],
  ["POST", "/learnings/:learningId/evaluate"],
  // AI、搜索和系统
  ["GET", "/search"],
  ["GET", "/search/facets"],
  ["GET", "/ai/conversations"],
  ["POST", "/ai/conversations"],
  ["POST", "/ai/conversations/:conversationId/messages"],
  ["GET", "/ai/conversations/:conversationId/messages"],
  ["GET", "/ai/tasks"],
  ["POST", "/ai/tasks"],
  ["GET", "/ai/tasks/:taskId"],
  ["GET", "/ai/tasks/:taskId/results"],
  ["POST", "/ai/tasks/:taskId/confirm"],
  ["POST", "/ai/tasks/:taskId/cancel"],
  ["GET", "/notifications"],
  ["POST", "/notifications/:notificationId/read"],
  ["GET", "/settings"],
  ["PATCH", "/settings/preferences"],
  ["GET", "/settings/models"],
  ["PUT", "/settings/models/:capability"],
  ["POST", "/settings/agents"],
  ["GET", "/settings/storage"],
  ["PUT", "/settings/storage"],
  // 身份/认证(register 是首个进 dispatch 表的 auth op;login/logout 仍是 bare route)
  ["POST", "/auth/register"],
  ["PATCH", "/me"],
  // 外置 Skill 写入
  ["POST", "/ingestion/runs"],
  ["POST", "/ingestion/runs/:runId/metrics"],
  ["POST", "/ingestion/runs/:runId/knowledge"],
  ["POST", "/ingestion/runs/:runId/assets"],
  ["POST", "/ingestion/runs/:runId/artifacts"],
  ["POST", "/ingestion/runs/:runId/complete"],
  ["GET", "/ingestion/runs/:runId"],
  // ── contract v0.4 (七步 seven-step) ────────────────────────────────────
  // 定位 (positioning)
  ["GET", "/positioning/profile"],
  ["POST", "/positioning/profile"],
  ["GET", "/positioning/statements"],
  ["POST", "/positioning/statements"],
  ["GET", "/positioning/statements/:statementId"],
  ["POST", "/positioning/gate/evaluate"],
  ["GET", "/positioning/center"],
  // 变现 (monetization)
  ["GET", "/products"],
  ["POST", "/products"],
  ["GET", "/products/:productId"],
  ["PATCH", "/products/:productId"],
  ["POST", "/products/:productId/retire"],
  ["GET", "/products/:productId/offers"],
  ["POST", "/products/:productId/offers"],
  ["GET", "/outputs/:outputId/products"],
  ["POST", "/outputs/:outputId/products"],
  ["DELETE", "/outputs/:outputId/products/:productId"],
  ["GET", "/leads"],
  ["POST", "/leads"],
  ["GET", "/leads/:leadId"],
  ["PATCH", "/leads/:leadId"],
  ["GET", "/leads/:leadId/conversions"],
  ["POST", "/leads/:leadId/conversions"],
  ["GET", "/monetization/funnel"],
  ["GET", "/outputs/:outputId/funnel"],
  // 选题候选 (candidate)
  ["GET", "/candidates"],
  ["POST", "/candidates"],
  ["GET", "/candidates/:candidateId"],
  ["PATCH", "/candidates/:candidateId"],
  ["POST", "/candidates/:candidateId/promote"],
  ["GET", "/audience-signals"],
  ["POST", "/audience-signals/:signalId/link"],
  ["GET", "/topics/overview"],
  // 校准 (calibration)
  ["POST", "/calibration/rubrics"],
  ["POST", "/calibration/rubrics/:rubricId/versions"],
  ["GET", "/calibration/rubrics/:rubricId"],
  ["GET", "/calibration/predictions"],
  ["POST", "/calibration/predictions"],
  ["POST", "/calibration/predictions/:predictionId/lock"],
  ["GET", "/calibration/predictions/:predictionId"],
  ["POST", "/calibration/predictions/:predictionId/result"],
  ["GET", "/calibration/overview"],
  // 平台账号 (platform-account)
  ["GET", "/accounts"],
  ["POST", "/accounts"],
  ["GET", "/accounts/:accountId"],
  ["PATCH", "/accounts/:accountId"],
  ["POST", "/accounts/:accountId/archive"],
  // 内容日历 (content-calendar)
  ["GET", "/accounts/:accountId/calendar"],
  ["POST", "/accounts/:accountId/calendar/entries"],
  ["PATCH", "/calendar/entries/:entryId"],
  ["POST", "/calendar/entries/:entryId/transition"],
  ["DELETE", "/calendar/entries/:entryId"],
  ["GET", "/accounts/:accountId/cadence"],
  ["PUT", "/accounts/:accountId/cadence"],
  ["GET", "/accounts/:accountId/cadence/attainment"],
  // 用料链 (material-links / Bill-of-Materials, Plan A4)
  ["GET", "/material-links"],
  ["POST", "/material-links"],
  ["POST", "/material-links/:linkId/delete"],
];

describe("endpoint registry", () => {
  const registered = Object.values(ENDPOINTS).map(
    (e) => `${e.method} ${e.path}`,
  );

  it("registers every SPEC §13 route exactly once", () => {
    for (const [method, path] of SPEC_13) {
      const matches = registered.filter((r) => r === `${method} ${path}`);
      expect(matches, `${method} ${path}`).toHaveLength(1);
    }
  });

  it("registers no routes outside SPEC §13", () => {
    const allowed = new Set(SPEC_13.map(([m, p]) => `${m} ${p}`));
    const extra = registered.filter((r) => !allowed.has(r));
    expect(extra, `unexpected: ${extra.join(", ")}`).toEqual([]);
  });

  it("gives every endpoint a unique id", () => {
    const ids = Object.values(ENDPOINTS).map((e) => e.id);
    const dupes = ids.filter((x, i) => ids.indexOf(x) !== i);
    expect(dupes, `dupe ids: ${dupes.join(", ")}`).toEqual([]);
  });
});
