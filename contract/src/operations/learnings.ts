import { z } from "zod";
import { defineEndpoint } from "../endpoints";
import { id, paginationQuery } from "../primitives";
import {
  learningResource,
  learningApplicationResource,
} from "../resources/learnings";
import { calibrationRuleSuggestionResource } from "../resources/calibration";

const learningParams = z.object({ learningId: id });

// SPEC §13 "复盘与学习" group.
export const learningsOperations = {
  listLearnings: defineEndpoint({
    id: "learnings.list",
    method: "GET",
    path: "/learnings",
    query: paginationQuery,
    response: learningResource,
    isList: true,
    fr: ["FR-LEARNINGS-LIST"],
  }),
  getLearning: defineEndpoint({
    id: "learnings.get",
    method: "GET",
    path: "/learnings/:learningId",
    params: learningParams,
    response: learningResource,
    fr: ["FR-LEARNINGS-GET"],
  }),
  createLearning: defineEndpoint({
    id: "learnings.create",
    method: "POST",
    path: "/learnings",
    body: z.object({
      title: z.string().min(1),
      insight: z.string().default(""),
    }),
    response: learningResource,
    fr: ["FR-LEARNINGS-CREATE"],
  }),
  createLearningApplication: defineEndpoint({
    id: "learnings.applications.create",
    method: "POST",
    path: "/learnings/:learningId/applications",
    params: learningParams,
    body: z.object({
      projectId: id,
      applicationNote: z.string().default(""),
    }),
    response: learningApplicationResource,
    fr: ["FR-LEARNINGS-APPLICATION-CREATE"],
  }),
  evaluateLearning: defineEndpoint({
    id: "learnings.evaluate",
    method: "POST",
    path: "/learnings/:learningId/evaluate",
    params: learningParams,
    body: z.object({
      validationStatus: z
        .enum(["candidate", "validated", "discarded"])
        .optional(),
    }),
    response: learningResource,
    fr: ["FR-LEARNINGS-EVALUATE"],
  }),
  // 复盘飞轮回流 轨B (Learning→校准): promote a 复盘 Learning into an EXPLICIT, adoptable
  // calibration rule-suggestion (creates a real CalibrationRuleSuggestion the 校准中心 reads).
  // The optional body carries the 维度建议 (key/label/weight/rubricId); omitted fields default
  // server-side from the Learning's type. This is the 显式回流 op — a Learning becomes a rule
  // that constrains future scoring, not just passive downstream context.
  suggestCalibrationRule: defineEndpoint({
    id: "learnings.calibrationSuggestions.create",
    method: "POST",
    path: "/learnings/:learningId/calibration-suggestions",
    params: learningParams,
    body: z.object({
      rubricId: id.optional(),
      dimensionKey: z.string().optional(),
      dimensionLabel: z.string().optional(),
      weight: z.number().optional(),
      description: z.string().optional(),
      rationale: z.string().optional(),
    }),
    response: calibrationRuleSuggestionResource,
    fr: ["FR-LEARNINGS-REFLOW-CALIB"],
  }),
} as const;
