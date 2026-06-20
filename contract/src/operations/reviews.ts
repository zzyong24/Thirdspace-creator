import { z } from "zod";
import { defineEndpoint } from "../endpoints.js";
import { id } from "../primitives.js";
import {
  reviewResource,
  reviewInsightResource,
} from "../resources/reviews.js";

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
