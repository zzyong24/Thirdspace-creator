import { z } from "zod";
import { defineEndpoint } from "../endpoints";
import { id } from "../primitives";
import { aiTaskResource } from "../resources/ai";
import {
  reviewRuleResource,
  reviewRuleTier,
  reviewRuleMatchType,
  reviewRuleStatus,
  scriptReviewReportResource,
} from "../resources/review-gate";

const ruleParams = z.object({ ruleId: id });
const projectParams = z.object({ projectId: id });

// 编导文案审核门(T-086 SPEC §1/§2 契约,additive)——
//   reviewRules.*    规则库 CRUD(list/create/patch/delete;patch 含采纳 candidate→active、启停)。
//   scriptReviews.*  稿面审核(getLatest 读最新报告;trigger 起 script.review 任务跑 L1+L2)。
// 不删不改任何既有 op。
export const reviewGateOperations = {
  listReviewRules: defineEndpoint({
    id: "reviewRules.list",
    method: "GET",
    path: "/review-rules",
    response: reviewRuleResource,
    isList: true,
    fr: ["FR-REVIEW-RULES-LIST"],
  }),
  createReviewRule: defineEndpoint({
    id: "reviewRules.create",
    method: "POST",
    path: "/review-rules",
    body: z.object({
      tier: reviewRuleTier,
      category: z.string().min(1),
      matchType: reviewRuleMatchType,
      pattern: z.string().min(1),
      replacement: z.string().nullable().optional(),
      note: z.string().default(""),
      // 手动建规则缺省 manual;retro 由复盘回流工具落(T-087 落点)。
      source: z.enum(["manual", "retro"]).default("manual"),
      // AI/回流绝不直接写 active —— candidate 须经用户采纳(patch status)。
      status: reviewRuleStatus.default("active"),
    }),
    response: reviewRuleResource,
    fr: ["FR-REVIEW-RULES-CREATE"],
  }),
  patchReviewRule: defineEndpoint({
    id: "reviewRules.patch",
    method: "PATCH",
    path: "/review-rules/:ruleId",
    params: ruleParams,
    body: z.object({
      // 采纳(candidate→active)/停用(→disabled)/重新启用,及词表编辑。
      status: reviewRuleStatus.optional(),
      pattern: z.string().min(1).optional(),
      replacement: z.string().nullable().optional(),
      note: z.string().optional(),
      category: z.string().min(1).optional(),
    }),
    response: reviewRuleResource,
    fr: ["FR-REVIEW-RULES-PATCH"],
  }),
  deleteReviewRule: defineEndpoint({
    id: "reviewRules.delete",
    method: "DELETE",
    path: "/review-rules/:ruleId",
    params: ruleParams,
    response: z.object({ id, deleted: z.literal(true) }),
    fr: ["FR-REVIEW-RULES-DELETE"],
  }),
  // 最新审核报告(绑脚本版本号;无报告 → 服务端以 NotFound 语义返回 404,前端诚实显「未审」)。
  getLatestScriptReview: defineEndpoint({
    id: "scriptReviews.getLatest",
    method: "GET",
    path: "/projects/:projectId/script-review/latest",
    params: projectParams,
    response: scriptReviewReportResource,
    fr: ["FR-SCRIPT-REVIEWS-GET-LATEST"],
  }),
  // 触发一次审核:落 ai_tasks 一行 taskType="script.review"(经注入的 AI 端口,零跨模块 repo
  // import),composition root 在 dispatch 后台跑 L1 lint + L2 语义审 → 落 script_review_reports。
  triggerScriptReview: defineEndpoint({
    id: "scriptReviews.trigger",
    method: "POST",
    path: "/projects/:projectId/script-review",
    params: projectParams,
    response: aiTaskResource,
    fr: ["FR-SCRIPT-REVIEWS-TRIGGER"],
  }),
} as const;
