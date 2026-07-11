// [T-235b] TrendSources module(热点信源 —— 通用网页/RSS 信源登记,热点多源证据)—— ONLY
// public entry(foundation §1)。composite transport 只经本文件 import(不碰内部)。

export {
  createTrendSourcesService,
  trendSourceDomain,
  deriveSourceType,
  type TrendSourcesService,
  type CreateTrendSourceInput,
  type EnabledTrendSource,
} from "./trend-sources.service";

export {
  createTrendSourcesRepository,
  type TrendSourcesRepository,
  type RepoDeps,
  type TrendSourceRow,
} from "./trend-sources.repository";

export {
  createTrendSourcesTransport,
  TREND_SOURCES_OP_IDS,
} from "./trend-sources.transport";

export { TREND_SOURCES_DDL } from "./trend-sources.db-schema";

export { OwnershipError, ValidationError } from "./trend-sources.errors";

export {
  trendSourceResource,
  toTrendSourceDto,
  type TrendSourceResource,
} from "./trend-sources.schema";
