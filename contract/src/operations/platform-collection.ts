import { z } from "zod";
import { defineEndpoint } from "../endpoint-definition";
import { id } from "../primitives";
import {
  platformCapabilitiesListResponse, platformBindBeginRequest, platformBindAttemptResource,
  platformWorksListResponse, platformMetricsReadResponse, collectionRunResource,
  collectionCapability, platformMetricKey,
} from "../resources/platform-capabilities";

import {platformNativeReportsListResponse} from "../resources/platform-native-reports";

const accountParams = z.strictObject({ accountId: id });
const attemptParams = z.strictObject({ accountId: id, attemptId: id });
const bindParams = z.strictObject({ bindAttemptId: id });
const page = z.strictObject({
  cursor: z.string().nullable().optional(),
  pageSize: z.number().int().positive().max(100).optional(),
});

// Source pages and identity proofs are deliberately absent: only a trusted
// worker/adapter may call the backend service port with those facts.
export const platformCollectionOperations = {
  listNativeReports: defineEndpoint({id:"platforms.reports.list",method:"GET",path:"/accounts/:accountId/platform-reports",params:accountParams,query:page,response:platformNativeReportsListResponse,fr:["FR-1110-03"]}),
  listCapabilities: defineEndpoint({
    id: "platforms.capabilities.list", method: "GET", path: "/platforms/capabilities",
    response: platformCapabilitiesListResponse, fr: ["FR-PLATFORM-CAPABILITIES"],
  }),
  beginBind: defineEndpoint({
    id: "platforms.bind.begin", method: "POST", path: "/platforms/bind-attempts",
    body: platformBindBeginRequest, response: platformBindAttemptResource,
    fr: ["FR-PLATFORM-BIND"],
  }),
  confirmBind: defineEndpoint({
    id: "platforms.bind.confirm", method: "POST", path: "/platforms/bind-attempts/:bindAttemptId/confirm",
    params: bindParams, response: platformBindAttemptResource, fr: ["FR-PLATFORM-BIND"],
  }),
  cancelBind: defineEndpoint({
    id: "platforms.bind.cancel", method: "POST", path: "/platforms/bind-attempts/:bindAttemptId/cancel",
    params: bindParams, response: platformBindAttemptResource, fr: ["FR-PLATFORM-BIND"],
  }),
  startCollection: defineEndpoint({
    id: "platforms.collections.start", method: "POST", path: "/accounts/:accountId/collections",
    params: accountParams,
    body: z.strictObject({ capability: collectionCapability, clientRequestId: id }),
    response: collectionRunResource, fr: ["FR-PLATFORM-COLLECT"],
  }),
  getCollection: defineEndpoint({
    id: "platforms.collections.get", method: "GET", path: "/accounts/:accountId/collections/:attemptId",
    params: attemptParams, response: collectionRunResource, fr: ["FR-PLATFORM-COLLECT"],
  }),
  cancelCollection: defineEndpoint({
    id: "platforms.collections.cancel", method: "POST", path: "/accounts/:accountId/collections/:attemptId/cancel",
    params: attemptParams, response: collectionRunResource, fr: ["FR-PLATFORM-COLLECT"],
  }),
  listWorks: defineEndpoint({
    id: "platforms.works.list", method: "GET", path: "/accounts/:accountId/platform-works",
    params: accountParams, query: page.extend({ projectId: id.optional() }),
    response: platformWorksListResponse, fr: ["FR-PLATFORM-WORKS"],
  }),
  readMetrics: defineEndpoint({
    id: "platforms.metrics.read", method: "GET", path: "/accounts/:accountId/platform-metrics",
    params: accountParams,
    query: page.extend({ platformWorkId: id.optional(), metricKey: platformMetricKey.optional() }),
    response: platformMetricsReadResponse, fr: ["FR-PLATFORM-METRICS"],
  }),
} as const;
