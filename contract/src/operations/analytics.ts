import { z } from "zod";
import { defineEndpoint } from "../endpoints.js";
import { id, paginationQuery } from "../primitives.js";
import { metricSnapshotResource } from "../resources/analytics.js";

// SPEC §13 "数据与分析" group.
export const analyticsOperations = {
  getPublicationAnalytics: defineEndpoint({
    id: "analytics.publications.get",
    method: "GET",
    path: "/analytics/publications/:publicationId",
    params: z.object({ publicationId: id }),
    query: paginationQuery,
    response: metricSnapshotResource,
    isList: true,
    fr: ["FR-ANALYTICS-PUBLICATION-GET"],
  }),
  getProjectAnalytics: defineEndpoint({
    id: "analytics.projects.get",
    method: "GET",
    path: "/analytics/projects/:projectId",
    params: z.object({ projectId: id }),
    query: paginationQuery,
    response: metricSnapshotResource,
    isList: true,
    fr: ["FR-ANALYTICS-PROJECT-GET"],
  }),
} as const;
