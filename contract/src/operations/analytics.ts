import { z } from "zod";
import { defineEndpoint } from "../endpoints";
import { id, iso8601, paginationQuery } from "../primitives";
import { publicationTrafficResource, metricSnapshotResource } from "../resources/analytics";

const commentFailureVersion=z.string().regex(/^sha256:[a-f0-9]{64}$/);
const commentRetryItem=z.object({publicationId:id.max(200),failureVersion:commentFailureVersion}).strict();
const commentFailureResource=commentRetryItem.extend({externalId:id,attemptedAt:iso8601,retryAt:iso8601.nullable(),lastSucceededAt:iso8601.nullable(),failures:z.number().int().positive()}).strict();

// SPEC §13 "数据与分析" group.
export const analyticsOperations = {
  listCommentFailures:defineEndpoint({id:'analytics.comments.failures.list',method:'GET',path:'/analytics/comments/failures',query:paginationQuery.strict(),response:commentFailureResource,isList:true,fr:['FR-COMMENTS-RETRY']}),
  retryComments:defineEndpoint({id:'analytics.comments.retry',method:'POST',path:'/analytics/comments/retry',body:z.object({items:z.array(commentRetryItem).min(1).max(100).refine(items=>new Set(items.map(item=>item.publicationId)).size===items.length,{message:'作品ID不可重复'})}).strict(),response:z.object({items:z.array(commentRetryItem.extend({retryAt:iso8601}).strict()).min(1).max(100),updated:z.number().int().min(0).max(100)}).strict(),fr:['FR-COMMENTS-RETRY']}),
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
