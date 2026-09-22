import { z } from "zod";
import { defineEndpoint } from "../endpoints";
import { id, iso8601, paginationQuery } from "../primitives";
import { publicationTrafficResource, metricSnapshotResource } from "../resources/analytics";

const commentFailureVersion=z.string().regex(/^sha256:[a-f0-9]{64}$/);
const commentRetryItem=z.object({publicationId:id.max(200),failureVersion:commentFailureVersion}).strict();
const commentFailureResource=commentRetryItem.extend({externalId:id,attemptedAt:iso8601,retryAt:iso8601.nullable(),lastSucceededAt:iso8601.nullable(),failures:z.number().int().positive()}).strict();

const diagnosisIntent=z.enum(['expand_navigation','enter_comments','open_work_picker','select_target']);
const diagnosisGroup=z.enum(['navigation','expanded','view','picker']);
const shortUi=z.string().max(240).refine(text=>Array.from(text).length<=120);
const diagnosticCandidate=z.object({
 targetRef:id.nullable(),intent:diagnosisIntent.nullable(),group:diagnosisGroup,
 tag:z.enum(['a','button','div','span','li','summary','h1','h2','h3','other']),
 role:z.enum(['link','button','menuitem','tab','heading','status','alert','option','other']),
 text:shortUi,buttonType:z.enum(['button','submit','reset','implicit','not_applicable']),disabled:z.boolean(),inForm:z.boolean(),expanded:z.boolean().nullable(),controlsVerified:z.boolean(),
 targetMatches:z.boolean().nullable(),rect:z.object({x:z.number().finite(),y:z.number().finite(),width:z.number().nonnegative().finite(),height:z.number().nonnegative().finite()}).strict(),
 ancestors:z.array(z.enum(['nav','navigation','listbox','dialog','main','other'])).max(8),
 unavailable:z.enum(['unsupported_control','unsafe_control','target_identity_unverified']).nullable(),
}).strict();
const schemaKey=z.enum(['data','comments','comment_list','list','items','cid','comment_id','aweme_id','item_id','status_code','has_more','cursor','next_cursor','total']);
const diagnosticNetwork=z.object({stageRevision:z.number().int().nonnegative(),totalResponses:z.number().int().nonnegative(),omittedResponses:z.number().int().nonnegative(),truncated:z.boolean(),items:z.array(z.object({
 responseCount:z.number().int().positive(),unknownShapeKeys:z.number().int().nonnegative(),endpointRef:id,pathHash:z.string().regex(/^[a-f0-9]{64}$/),host:z.enum(['creator','other']),method:z.enum(['GET','POST','OTHER']),pathTemplate:z.string().max(160),
 queryKeys:z.array(z.enum(['item_id','aweme_id','cursor','offset','page','page_index','count','limit','sort'])).max(16),unknownQueryKeys:z.number().int().nonnegative(),
 status:z.enum(['2xx','3xx','4xx','5xx','other']),contentType:z.enum(['json','other','unknown']),oldMatcher:z.boolean(),requestTargetPresent:z.boolean(),requestTargetMatches:z.boolean().nullable(),
 bodyStatus:z.enum(['observed','unavailable','too_large','encoded','budget','invalid_json','timeout']),sampled:z.boolean(),
 shape:z.array(z.object({path:z.array(schemaKey).max(4),type:z.enum(['array','object','string','number','boolean','null']),count:z.number().int().nonnegative().optional()}).strict()).max(32),
 rowTargetMatches:z.object({matched:z.number().int().nonnegative(),mismatched:z.number().int().nonnegative(),unverified:z.number().int().nonnegative()}).strict(),
}).strict()).max(16)}).strict();
const diagnosisResponse=z.object({schemaVersion:z.literal(1),diagnosisId:id,publicationId:id.nullable(),revision:z.number().int().nonnegative(),generation:z.number().int().nonnegative(),
 phase:z.enum(['home','navigation','comments','picker','target','closed']),status:z.enum(['awaiting_selection','observed','unavailable','expired','closed','unknown']),dispatched:z.boolean(),expiresAt:iso8601,
 ui:z.object({observationId:id.nullable(),status:z.enum(['observed','unavailable','not_applicable']),title:shortUi.nullable(),nodes:z.array(diagnosticCandidate).max(24),
  scannedNodes:z.number().int().min(0).max(2000),truncated:z.boolean(),groups:z.array(z.object({group:diagnosisGroup,source:z.enum(['nav','aria_controls','comment_view','work_picker','none']),scanned:z.number().int().nonnegative(),returned:z.number().int().nonnegative(),omitted:z.number().int().nonnegative(),unsupported:z.number().int().nonnegative()}).strict()).max(4),
 }).strict(),networkEvidence:diagnosticNetwork,allowedNext:z.array(diagnosisIntent).max(4),
 stopReason:z.enum(['navigation_unavailable','observation_stale','target_identity_unverified','busy','cooldown','deadline','unsafe_navigation','limit_reached','publication_changed','session_expired','resource_stop_unconfirmed','navigation_failed','none']),
}).strict();
const diagnosisBody=z.discriminatedUnion('action',[
 z.object({action:z.literal('start'),publicationId:id.max(200)}).strict(),
 z.object({action:z.literal('advance'),diagnosisId:id,expectedRevision:z.number().int().nonnegative(),observationId:id,intent:diagnosisIntent,targetRef:id}).strict(),
 z.object({action:z.literal('observe'),diagnosisId:id,expectedRevision:z.number().int().nonnegative()}).strict(),
 z.object({action:z.literal('close'),diagnosisId:id}).strict(),
]);

// SPEC §13 "数据与分析" group.
export const analyticsOperations = {
  diagnoseComments:defineEndpoint({id:'analytics.comments.diagnose',method:'POST',path:'/analytics/comments/diagnose',body:diagnosisBody,response:diagnosisResponse,fr:['FR-COMMENTS-DIAGNOSIS']}),
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
