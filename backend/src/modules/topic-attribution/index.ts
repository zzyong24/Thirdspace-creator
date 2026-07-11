// [T-235d] TopicAttribution module(正向归因回流 —— 选题验证库)—— ONLY public entry
// (foundation §1)。composite transport 只经本文件 import(不碰内部)。
// [gate-F1]:本模块零 learnings 依赖 —— 选题维度归因资产与脚本级经验不共写、不互相触发。

export {
  createTopicAttributionService,
  type TopicAttributionService,
  type SaveTopicAttributionInput,
} from "./topic-attribution.service";

export {
  createTopicAttributionRepository,
  type TopicAttributionRepository,
  type RepoDeps,
  type TopicAttributionRow,
  type CreateTopicAttributionInput,
} from "./topic-attribution.repository";

export {
  createTopicAttributionTransport,
  TOPIC_ATTRIBUTION_OP_IDS,
} from "./topic-attribution.transport";

export { TOPIC_ATTRIBUTION_DDL } from "./topic-attribution.db-schema";

export {
  topicAttributionResource,
  toTopicAttributionDto,
  type TopicAttributionResource,
} from "./topic-attribution.schema";
