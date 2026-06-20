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
  ["POST", "/knowledge/:knowledgeId/relations"],
  ["GET", "/assets"],
  ["POST", "/assets/uploads"],
  ["POST", "/assets/uploads/:uploadId/complete"],
  ["GET", "/assets/:assetId"],
  ["POST", "/assets/:assetId/files"],
  ["POST", "/assets/:assetId/trash"],
  ["POST", "/assets/:assetId/restore"],
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
  ["POST", "/learnings"],
  ["POST", "/learnings/:learningId/applications"],
  ["POST", "/learnings/:learningId/evaluate"],
  // AI、搜索和系统
  ["GET", "/search"],
  ["GET", "/ai/conversations"],
  ["POST", "/ai/conversations"],
  ["POST", "/ai/conversations/:conversationId/messages"],
  ["POST", "/ai/tasks"],
  ["POST", "/ai/tasks/:taskId/confirm"],
  ["POST", "/ai/tasks/:taskId/cancel"],
  ["GET", "/notifications"],
  ["POST", "/notifications/:notificationId/read"],
  ["GET", "/settings"],
  ["PATCH", "/settings/preferences"],
  ["PUT", "/settings/models/:capability"],
  ["POST", "/settings/agents"],
  // 外置 Skill 写入
  ["POST", "/ingestion/runs"],
  ["POST", "/ingestion/runs/:runId/metrics"],
  ["POST", "/ingestion/runs/:runId/knowledge"],
  ["POST", "/ingestion/runs/:runId/assets"],
  ["POST", "/ingestion/runs/:runId/artifacts"],
  ["POST", "/ingestion/runs/:runId/complete"],
  ["GET", "/ingestion/runs/:runId"],
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
