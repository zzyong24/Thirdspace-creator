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
  // T-102 物理删除(additive):归档之外的第二种下线动作。
  ["DELETE", "/projects/:projectId"],
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
  // [T-091] 图谱全量语义边读(user-scoped,additive)。
  ["GET", "/knowledge-relations"],
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
  // [T-055d SPEC §7.2] 下载 = 复制:换当前文件的签名 GET URL。
  ["GET", "/assets/:assetId/download-url"],
  ["POST", "/assets/:assetId/files"],
  ["POST", "/assets/:assetId/trash"],
  ["POST", "/assets/:assetId/restore"],
  ["POST", "/assets/:assetId/commit"],
  ["POST", "/assets/:assetId/favorite"],
  ["GET", "/assets/:assetId/usage"],
  // 制作与发布
  ["GET", "/outputs/:outputId/production"],
  ["PUT", "/outputs/:outputId/production"],
  ["POST", "/productions/:productionId/segments"],
  // [T-051 2e] 章节列表读(时间线读真)。
  ["GET", "/productions/:productionId/segments"],
  ["POST", "/productions/:productionId/exports"],
  ["POST", "/exports/:exportId/complete"],
  ["GET", "/outputs/:outputId/publications"],
  ["POST", "/outputs/:outputId/publications"],
  // [T-055h③/T-063c] 登记已发布(粘链接 → published publication 落库)
  ["POST", "/outputs/:outputId/publications/register"],
  ["GET", "/publications/:publicationId"],
  ["POST", "/publications/:publicationId/revisions"],
  ["GET", "/publications/:publicationId/revisions"],
  ["POST", "/publications/:publicationId/transition"],
  ["GET", "/publications/:publicationId/comments"],
  // 分析、复盘和经验
  ["GET", "/analytics/publications/:publicationId"],
  ["GET", "/analytics/projects/:projectId"],
  ["GET", "/analytics/dashboard"],
  ["POST", "/projects/:projectId/reviews"],
  // [T-053 断点③] 复盘记录列表读(复盘页「复盘记录」区)。
  ["GET", "/projects/:projectId/reviews"],
  ["GET", "/reviews/:reviewId"],
  ["POST", "/reviews/:reviewId/insights"],
  ["POST", "/reviews/:reviewId/complete"],
  ["GET", "/learnings"],
  ["GET", "/learnings/:learningId"],
  ["POST", "/learnings"],
  ["PATCH", "/learnings/:learningId"],
  ["POST", "/learnings/:learningId/applications"],
  ["POST", "/learnings/:learningId/evaluate"],
  ["POST", "/learnings/:learningId/calibration-suggestions"],
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
  ["GET", "/ai/tasks/:taskId/steps"],
  // [T-248 批C] GET /ai/tasks/pending-topic-review 已删(T-060 弹窗任务流退役,零调用方)。
  ["POST", "/ai/tasks/:taskId/results/patch"],
  ["POST", "/ai/tasks/:taskId/confirm"],
  ["POST", "/ai/tasks/:taskId/cancel"],
  ["GET", "/notifications"],
  ["POST", "/notifications/:notificationId/read"],
  ["GET", "/settings"],
  // [T-051 2e] 偏好读 op(设置页初值读真)。
  ["GET", "/settings/preferences"],
  ["PATCH", "/settings/preferences"],
  ["GET", "/settings/models"],
  ["PUT", "/settings/models/:capability"],
  // [T-248 批C] POST /settings/agents 已删(孤 op,零调用方)。
  ["GET", "/settings/storage"],
  ["PUT", "/settings/storage"],
  // 提示词/skill 服务端可配 (T-040c) — list全表 / get单个 / put upsert(热更)
  ["GET", "/settings/prompts"],
  ["GET", "/settings/prompts/:id"],
  ["PUT", "/settings/prompts/:id"],
  ["GET", "/settings/prompts/:id/versions"],
  ["POST", "/settings/prompts/:id/rollback"],
  // 身份/认证(register 是首个进 dispatch 表的 auth op;login/logout 仍是 bare route)
  ["POST", "/auth/register"],
  ["PATCH", "/me"],
  // 外置 Skill 写入
  ["POST", "/ingestion/runs"],
  ["POST", "/ingestion/douyin/refresh"],
  ["POST", "/ingestion/douyin/login"],
  ["GET", "/ingestion/douyin/status"],
  ["GET", "/ingestion/douyin/throttle-status"],
  // [T-248 批C] 四个 batch-push op(metrics/knowledge/assets/artifacts)已删 ——
  // 真实采集走服务端 ingestion service 层进程内调用,不经契约 dispatch。
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
  // [T-052 裁决③] 变现 (monetization) 路由组已随变现中心物理删除(宪法 §8)。
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
  ["GET", "/calibration/suggestions"],
  ["POST", "/calibration/suggestions/:suggestionId/adopt"],
  ["POST", "/calibration/suggestions/:suggestionId/dismiss"],
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
  // [T-212a] 对标源 CRUD(选题/对标强化,SPEC 2026-07-11 §2.1)
  ["GET", "/benchmark/sources"],
  ["POST", "/benchmark/sources"],
  ["POST", "/benchmark/sources/:sourceId/toggle"],
  ["POST", "/benchmark/sources/:sourceId/remove"],
  // [T-235b] 热点信源 CRUD(热点多源证据,SPEC 2026-07-11 daily-topic-autopilot §2.2)
  ["GET", "/trend/sources"],
  ["POST", "/trend/sources"],
  ["POST", "/trend/sources/:sourceId/toggle"],
  ["POST", "/trend/sources/:sourceId/remove"],
  // [T-235d] 选题归因只读(正向归因回流,SPEC 2026-07-11 daily-topic-autopilot §2.4)
  ["GET", "/topics/attributions"],
  // 调度作业 (scheduling / T-007 data-source-pipeline-design §9 D1)
  ["POST", "/scheduled-jobs"],
  ["GET", "/scheduled-jobs"],
  ["GET", "/scheduled-jobs/:jobId"],
  ["PATCH", "/scheduled-jobs/:jobId"],
  ["POST", "/scheduled-jobs/:jobId/enabled"],
  ["POST", "/scheduled-jobs/:jobId/run-now"],
  ["GET", "/scheduled-jobs/:jobId/runs"],
  ["GET", "/job-runs/:runId"],
  // 编导文案审核门 (review-gate / T-086):规则库 CRUD + 稿面审核报告读/触发。
  ["GET", "/review-rules"],
  ["POST", "/review-rules"],
  ["PATCH", "/review-rules/:ruleId"],
  ["DELETE", "/review-rules/:ruleId"],
  ["GET", "/projects/:projectId/script-review/latest"],
  ["POST", "/projects/:projectId/script-review"],
  // [T-255a] 执行层任务(脑手分离,SPEC 2026-07-11 execution-layer §2)
  ["POST", "/execution/tasks"],
  ["GET", "/execution/tasks"],
  ["GET", "/execution/tasks/:taskId"],
  ["POST", "/execution/tasks/:taskId/confirm"],
  ["POST", "/execution/tasks/:taskId/discard"],
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
