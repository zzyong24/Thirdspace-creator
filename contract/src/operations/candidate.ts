import { topicWorkspaceResource, topicWorkspaceConfig, topicFeedbackReason } from "../resources/audience-task";
import { z } from "zod";
import { defineEndpoint } from "../endpoints";
import {
  id,
  iso8601,
  paginationQuery,
  contentRole,
  candidateSource,
  candidateStatus,
} from "../primitives";
import {
  candidateResource,
  candidateCard,
  audienceSignalResource,
  topicPromotionResource,
  topicsOverviewResource,
} from "../resources/candidate";

const candidateParams = z.object({ candidateId: id });
const signalParams = z.object({ signalId: id });

// SPEC §13 "选题候选 (candidate)" group (七步③, contract v0.4). AI-sourced
// Candidates arrive via the AI confirm flow (§C-3), not a create op here.
export const candidateOperations = {
  getTopicWorkspace: defineEndpoint({id:"topics.workspace.get",method:"GET",path:"/topics/workspace",response:topicWorkspaceResource,fr:["FR-AT-01","FR-AT-02"]}),
  saveTopicWorkspace: defineEndpoint({id:"topics.workspace.save",method:"POST",path:"/topics/workspace",body:z.object({config:topicWorkspaceConfig,expectedVersion:z.number().int().nonnegative(),idempotencyKey:z.string().min(1).max(256)}).strict(),response:topicWorkspaceResource,fr:["FR-AT-01","FR-AT-02"]}),
  saveTopicProposalFeedback: defineEndpoint({id:"topics.proposals.feedback",method:"POST",path:"/topics/proposals/feedback",body:z.object({taskId:id,proposalId:id,reason:topicFeedbackReason,note:z.string().max(10000).default(""),idempotencyKey:z.string().min(1).max(256)}).strict(),response:z.object({id,createdAt:iso8601}).strict(),fr:["FR-AT-06"]}),
  listCandidates: defineEndpoint({
    id: "candidates.list",
    method: "GET",
    path: "/candidates",
    query: paginationQuery.extend({
      status: candidateStatus.optional(),
      source: candidateSource.optional(),
      sort: z
        // [T-216] guardrail = 防茧房推荐排序:复用 list seam 路由到 rankTopicsWithGuardrails
        // (偏好注入后分 + 探索位),不新增独立 op。
        .enum([
          "predictedScore",
          "positioningFit",
          "demandCount",
          "createdAt",
          "guardrail",
        ])
        .optional(),
      // [T-282] “今日新选题”独立读侧：先在 SQL 层按时间窗过滤，不能从预测分前 100
      // 再做前端过滤，否则 predictedScore=null 的新候选会被 NULLS LAST 挤掉。
      createdAfter: iso8601.optional(),
    }),
    response: candidateResource,
    isList: true,
    fr: ["FR-CAND-LIST"],
  }),
  createCandidate: defineEndpoint({
    id: "candidates.create",
    method: "POST",
    path: "/candidates",
    // 人确认门 — 默认 `idea`(手动新建),但 AI 出题(topic.generate)在对话内**无 ai_task**、
    // 走不通 confirm 流(createFromAIResult 需 aiTaskId)/AdoptCandidateCard(需 confirmTask),
    // 只能落这条门 —— 故 source 放开为全枚举,让 AI 出题采纳保住 provenance(trend|benchmark|
    // demand),不再被硬编码成 idea 冲进「手动灵感」统计(T-149)。
    body: z.object({
      title: z.string().min(1),
      angle: z.string().default(""),
      source: candidateSource.default("idea"),
      contentRole: contentRole.optional(),
      productAnchorId: id.optional(),
    }),
    response: candidateResource,
    fr: ["FR-CAND-CREATE"],
  }),
  getCandidate: defineEndpoint({
    id: "candidates.get",
    method: "GET",
    path: "/candidates/:candidateId",
    params: candidateParams,
    response: candidateResource,
    fr: ["FR-CAND-GET"],
  }),
  patchCandidate: defineEndpoint({
    id: "candidates.patch",
    method: "PATCH",
    path: "/candidates/:candidateId",
    params: candidateParams,
    body: z.object({
      title: z.string().optional(),
      angle: z.string().optional(),
      contentRole: contentRole.optional(),
      productAnchorId: id.optional(),
      status: z.enum(["pool", "dropped"]).optional(),
      // 选题卡可编辑 — a partial card patch merges over the stored card (the user can
      // edit any subset of 详情/指标). `.partial()` drops candidateCard's array
      // default so an absent field is left untouched rather than reset to [].
      card: candidateCard.partial().optional(),
      // [T-212d] 防茧房校准 — 淘汰选题时随手写一句原因(status=dropped 时带),蒸馏成偏好信号。
      dropReason: z.string().optional(),
    }),
    response: candidateResource,
    fr: ["FR-CAND-PATCH"],
  }),
  promoteCandidate: defineEndpoint({
    id: "candidates.promote",
    method: "POST",
    path: "/candidates/:candidateId/promote",
    params: candidateParams,
    body: z.object({}),
    response: topicPromotionResource,
    fr: ["FR-CAND-PROMOTE"],
  }),
  listAudienceSignals: defineEndpoint({
    id: "audienceSignals.list",
    method: "GET",
    path: "/audience-signals",
    query: paginationQuery.extend({
      source: z.string().optional(),
      demandTag: z.string().optional(),
      linkedCandidateId: id.optional(),
    }),
    response: audienceSignalResource,
    isList: true,
    fr: ["FR-CAND-SIGNAL-LIST"],
  }),
  // 复盘每作品评论 (T-030 §4.2/§10, D6) — user-scoped list of a publication's comment
  // signals (audience_signals where source='comment' AND publication_id=:publicationId),
  // newest first, capped at `limit` (默认 100). Read-only; the write side rides Ingestion
  // (C-4) which backfills publication_id from the capture's aweme_id. Owned by the
  // candidate module transport (audience_signals is a candidate-module table).
  listPublicationComments: defineEndpoint({
    id: "publications.comments.list",
    method: "GET",
    path: "/publications/:publicationId/comments",
    params: z.object({ publicationId: id }),
    query: z.object({
      // 前 N 条 (默认 100, SPEC 前 100). paginationQuery 的 page/pageSize 不合此口径 —
      // 复盘评论区一次拉封顶 100 条,故用显式 limit。
      limit: z.coerce.number().int().min(1).max(100).default(100),
    }),
    response: audienceSignalResource,
    isList: true,
    fr: ["FR-CAND-SIGNAL-LIST"],
  }),
  linkSignalToCandidate: defineEndpoint({
    id: "audienceSignals.linkToCandidate",
    method: "POST",
    path: "/audience-signals/:signalId/link",
    params: signalParams,
    // omit candidateId → spawn a new `demand` Candidate from the signal.
    body: z.object({ candidateId: id.optional() }),
    response: candidateResource,
    fr: ["FR-CAND-SIGNAL-LINK"],
  }),
  // 选题中心总览 (选题中心大改) — a read-only aggregate (出题依据 + 7 来源 + 6 态漏斗),
  // every count DERIVED from real rows at read time (no stored 总览 table). Owned by the
  // candidate module's transport.
  overviewTopics: defineEndpoint({
    id: "topics.overview",
    method: "GET",
    path: "/topics/overview",
    response: topicsOverviewResource,
    fr: ["FR-CAND-OVERVIEW"],
  }),
} as const;
