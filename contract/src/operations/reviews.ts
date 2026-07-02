import { z } from "zod";
import { defineEndpoint } from "../endpoints";
import { id } from "../primitives";
import {
  reviewResource,
  reviewInsightResource,
} from "../resources/reviews";

const projectParams = z.object({ projectId: id });
const reviewParams = z.object({ reviewId: id });

// SPEC §13 "复盘" group.
export const reviewsOperations = {
  createReview: defineEndpoint({
    id: "reviews.create",
    method: "POST",
    path: "/projects/:projectId/reviews",
    params: projectParams,
    body: z.object({
      reviewType: z.enum(["project", "output"]),
      contentOutputId: id.nullable().optional(),
    }),
    response: reviewResource,
    fr: ["FR-REVIEWS-CREATE"],
  }),
  // [T-053 断点③] 项目复盘记录读 op —— 此前只有 create/get/complete,没有按项目
  // 列表读,复盘页「复盘记录」区永远显示不了真 review(fixture-only)。
  listReviews: defineEndpoint({
    id: "reviews.list",
    method: "GET",
    path: "/projects/:projectId/reviews",
    params: projectParams,
    response: reviewResource,
    isList: true,
    fr: ["FR-REVIEWS-LIST"],
  }),
  getReview: defineEndpoint({
    id: "reviews.get",
    method: "GET",
    path: "/reviews/:reviewId",
    params: reviewParams,
    response: reviewResource,
    fr: ["FR-REVIEWS-GET"],
  }),
  createReviewInsight: defineEndpoint({
    id: "reviews.insights.create",
    method: "POST",
    path: "/reviews/:reviewId/insights",
    params: reviewParams,
    body: z.object({
      insightType: z.enum(["success", "issue", "action", "hypothesis"]),
      title: z.string().min(1),
      description: z.string().default(""),
    }),
    response: reviewInsightResource,
    fr: ["FR-REVIEWS-INSIGHT-CREATE"],
  }),
  completeReview: defineEndpoint({
    id: "reviews.complete",
    method: "POST",
    path: "/reviews/:reviewId/complete",
    params: reviewParams,
    response: reviewResource,
    fr: ["FR-REVIEWS-COMPLETE"],
  }),
} as const;
