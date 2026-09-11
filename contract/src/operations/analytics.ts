import { z } from "zod";
import { defineEndpoint } from "../endpoints";
import { id, paginationQuery } from "../primitives";
import { publicationTrafficResource, metricSnapshotResource } from "../resources/analytics";

// SPEC §13 "数据与分析" group.
export const analyticsOperations = {
  getProjectTrafficSources: defineEndpoint({id:'analytics.traffic.get',method:'GET',path:'/analytics/projects/:projectId/traffic',params:z.object({projectId:id}),response:z.object({items:z.array(publicationTrafficResource)}),fr:['FR-ANALYTICS-TRAFFIC']}),
  refreshProjectTrafficSources: defineEndpoint({id:'analytics.traffic.refresh',method:'POST',path:'/analytics/projects/:projectId/traffic/refresh',params:z.object({projectId:id}),body:z.object({}),response:z.object({queued:z.number().int(),jobRunId:id.nullable(),aiTaskId:id.nullable()}),fr:['FR-ANALYTICS-TRAFFIC']}),
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
