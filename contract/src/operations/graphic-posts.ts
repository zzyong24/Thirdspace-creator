import { z } from "zod";
import { defineEndpoint } from "../endpoints";
import { id, platformId } from "../primitives";
import { contentOutputResource } from "../resources/projects";
import { graphicPostTextValue, graphicPostDocument, graphicPostResource, graphicPostWriteResult, graphicPostTextCandidate, graphicPostTextKind } from "../resources/graphic-posts";

const requestId = z.string().min(8).max(128);
const outputParams = z.object({ outputId: id });

export const graphicPostsOperations = {
  createGraphicPost: defineEndpoint({
    id: "graphicPosts.outputs.create",
    method: "POST",
    path: "/projects/:projectId/graphic-posts",
    params: z.object({ projectId: id }),
    body: z.object({
      title: z.string().min(1),
      targetPlatform: platformId.optional(),
      clientRequestId: requestId,
    }).strict(),
    response: contentOutputResource,
    fr: ["FR-GRAPHIC-POST-CREATE"],
  }),
  getGraphicPost: defineEndpoint({
    id: "graphicPosts.get",
    method: "GET",
    path: "/outputs/:outputId/graphic-post",
    params: outputParams,
    response: graphicPostResource,
    fr: ["FR-GRAPHIC-POST-READ"],
  }),
  getGraphicPostVersion: defineEndpoint({
    id: "graphicPosts.versions.get",
    method: "GET",
    path: "/outputs/:outputId/graphic-post/versions/:versionId",
    params: z.object({ outputId: id, versionId: id }),
    response: graphicPostWriteResult,
    fr: ["FR-GRAPHIC-POST-READ"],
  }),
  createGraphicPostVersion: defineEndpoint({
    id: "graphicPosts.versions.create",
    method: "POST",
    path: "/outputs/:outputId/graphic-post/versions",
    params: outputParams,
    body: z.object({
      expectedCurrentVersionId: id,
      document: graphicPostDocument,
      clientRequestId: requestId,
    }).strict(),
    response: graphicPostWriteResult,
    fr: ["FR-GRAPHIC-POST-EDIT"],
  }),
  generateGraphicPostTextCandidate: defineEndpoint({
    id: "graphicPosts.candidates.generate",
    method: "POST",
    path: "/outputs/:outputId/graphic-post/candidates/generate",
    params: outputParams,
    body: z.object({
      kind: graphicPostTextKind,
      clientRequestId: requestId,
      sourceItemId: id.optional(),
      targetPlatform: platformId.nullable().optional(),
      ruleOverrides: z.record(z.string(), z.unknown()).optional(),
    }).strict(),
    response: z.object({taskId: id, candidateId: id, status: z.enum(["queued", "running", "succeeded", "failed", "cancelled"])}),
    fr: ["FR-GRAPHIC-POST-CANDIDATE"],
  }),
  getGraphicPostTextCandidate: defineEndpoint({
    id: "graphicPosts.candidates.get",
    method: "GET",
    path: "/graphic-posts/candidates/:candidateId",
    params: z.object({candidateId: id}),
    response: graphicPostTextCandidate,
    fr: ["FR-GRAPHIC-POST-CANDIDATE"],
  }),
  adoptGraphicPostTextCandidate: defineEndpoint({
    id: "graphicPosts.candidates.adopt",
    method: "POST",
    path: "/graphic-posts/candidates/:candidateId/adopt",
    params: z.object({candidateId: id}),
    body: z.object({
      kind: graphicPostTextKind,
      expectedCurrentVersionId: id,
      editedValue: graphicPostTextValue,
      clientRequestId: requestId,
    }).strict(),
    response: graphicPostWriteResult,
    fr: ["FR-GRAPHIC-POST-ADOPT"],
  }),
} as const;
