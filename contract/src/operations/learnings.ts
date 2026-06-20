import { z } from "zod";
import { defineEndpoint } from "../endpoints.js";
import { id, paginationQuery } from "../primitives.js";
import {
  learningResource,
  learningApplicationResource,
} from "../resources/learnings.js";

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
} as const;
