import { z } from "zod";
import { defineEndpoint } from "../endpoint-definition";
import { id, paginationQuery } from "../primitives";
import { topicAttributionResource } from "../resources/topic-attribution";

// [T-235d] 选题归因读侧(正向归因回流,SPEC 2026-07-11 daily-topic-autopilot §2.4)。
// 只读 list(契约 additive)—— 写侧不走契约 op:归因由 self.detail 采集实绩触发的后台 runner
// 落库(幂等锚 publication_id),没有人工 create/patch 入口(资产由系统沉淀,人只消费)。
// 消费方:选题中心 UI(实验候选点开看归因依据,T-235e)+ 编导 context。
export const topicAttributionOperations = {
  listTopicAttributions: defineEndpoint({
    id: "topics.attributions.list",
    method: "GET",
    path: "/topics/attributions",
    query: paginationQuery.extend({
      // 按发布作品过滤(实验候选 card.attributionId → 归因行的反查走 id;这里给「看某条
      // 作品归因」的直查口)。
      publicationId: id.optional(),
    }),
    response: topicAttributionResource,
    isList: true,
    fr: ["FR-TOPIC-ATTR-LIST"],
  }),
} as const;
