import { z } from "zod";
import { defineEndpoint } from "../endpoints";
import {
  id,
  paginationQuery,
  contentRole,
  candidateSource,
  candidateStatus,
} from "../primitives";
import {
  candidateResource,
  audienceSignalResource,
  topicPromotionResource,
} from "../resources/candidate";

const candidateParams = z.object({ candidateId: id });
const signalParams = z.object({ signalId: id });

// SPEC §13 "选题候选 (candidate)" group (七步③, contract v0.4). AI-sourced
// Candidates arrive via the AI confirm flow (§C-3), not a create op here.
export const candidateOperations = {
  listCandidates: defineEndpoint({
    id: "candidates.list",
    method: "GET",
    path: "/candidates",
    query: paginationQuery.extend({
      status: candidateStatus.optional(),
      source: candidateSource.optional(),
      sort: z
        .enum(["predictedScore", "positioningFit", "demandCount"])
        .optional(),
    }),
    response: candidateResource,
    isList: true,
    fr: ["FR-CAND-LIST"],
  }),
  createCandidate: defineEndpoint({
    id: "candidates.create",
    method: "POST",
    path: "/candidates",
    // manual entry only — `source` is fixed `idea`.
    body: z.object({
      title: z.string().min(1),
      angle: z.string().default(""),
      source: z.literal("idea").default("idea"),
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
} as const;
