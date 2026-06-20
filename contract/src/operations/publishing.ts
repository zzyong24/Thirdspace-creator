import { z } from "zod";
import { defineEndpoint } from "../endpoints.js";
import { id, paginationQuery } from "../primitives.js";
import {
  publicationResource,
  publicationRevisionResource,
} from "../resources/publishing.js";

const outputParams = z.object({ outputId: id });
const publicationParams = z.object({ publicationId: id });

// SPEC §13 "发布" group.
export const publishingOperations = {
  listPublications: defineEndpoint({
    id: "outputs.publications.list",
    method: "GET",
    path: "/outputs/:outputId/publications",
    params: outputParams,
    query: paginationQuery,
    response: publicationResource,
    isList: true,
    fr: ["FR-PUBLISHING-LIST"],
  }),
  createPublication: defineEndpoint({
    id: "outputs.publications.create",
    method: "POST",
    path: "/outputs/:outputId/publications",
    params: outputParams,
    body: z.object({
      platform: z.string().min(1),
      accountReference: z.string().min(1),
    }),
    response: publicationResource,
    fr: ["FR-PUBLISHING-CREATE"],
  }),
  getPublication: defineEndpoint({
    id: "publications.get",
    method: "GET",
    path: "/publications/:publicationId",
    params: publicationParams,
    response: publicationResource,
    fr: ["FR-PUBLISHING-GET"],
  }),
  createPublicationRevision: defineEndpoint({
    id: "publications.revisions.create",
    method: "POST",
    path: "/publications/:publicationId/revisions",
    params: publicationParams,
    body: z.object({
      title: z.string().min(1),
      description: z.string().default(""),
    }),
    response: publicationRevisionResource,
    fr: ["FR-PUBLISHING-REVISION-CREATE"],
  }),
  transitionPublication: defineEndpoint({
    id: "publications.transition",
    method: "POST",
    path: "/publications/:publicationId/transition",
    params: publicationParams,
    body: z.object({ status: z.string().min(1) }),
    response: publicationResource,
    fr: ["FR-PUBLISHING-TRANSITION"],
  }),
} as const;
