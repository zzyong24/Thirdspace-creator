import type {Transport} from "@creatoros/contract";
import {UnsupportedOperationError} from "../persistence-transport";
import {TAXONOMY_OP_IDS} from "../modules/taxonomy";
import {NOTIFICATION_OP_IDS} from "../modules/notifications";
import {SEARCH_OP_IDS} from "../modules/search";
import {SETTINGS_OP_IDS} from "../modules/settings";
import {KNOWLEDGE_OP_IDS} from "../modules/knowledge";
import {ASSET_OP_IDS} from "../modules/assets";
import {ARTIFACT_OP_IDS} from "../modules/artifacts";
import {PRODUCTION_OP_IDS} from "../modules/production";
import {PUBLISHING_OP_IDS} from "../modules/publishing";
import {ANALYTICS_OP_IDS} from "../modules/analytics";
import {INGESTION_OP_IDS} from "../modules/ingestion";
import {REVIEWS_OP_IDS} from "../modules/reviews";
import {REVIEW_GATE_OP_IDS} from "../modules/review";
import {LEARNINGS_OP_IDS} from "../modules/learnings";
import {AI_OP_IDS} from "../modules/ai";
import {EXECUTION_OP_IDS} from "../modules/execution";
import {INTELLIGENCE_OP_IDS} from "../modules/intelligence";
import {POSITIONING_OP_IDS} from "../modules/positioning";
import {CANDIDATE_OP_IDS} from "../modules/candidate";
import {CALIBRATION_OP_IDS} from "../modules/calibration";
import {PLATFORM_ACCOUNT_OP_IDS} from "../modules/platform-account";
import {SCHEDULING_OP_IDS} from "../modules/scheduling";
import {CONTENT_CALENDAR_OP_IDS} from "../modules/content-calendar";
import {MATERIAL_LINKS_OP_IDS} from "../modules/material-links";
import {BENCHMARK_OP_IDS} from "../modules/benchmark";
import {TREND_SOURCES_OP_IDS} from "../modules/trend-sources";
import {FAVORITES_OP_IDS} from "../modules/favorites";
import {TOPIC_ATTRIBUTION_OP_IDS} from "../modules/topic-attribution";
import {QUERY_SERVICES_OP_IDS} from "../modules/query-services";
import {PROJECT_OP_IDS} from "../modules/projects";

/** 公开操作只由登记的领域 transport 负责；读取宿主实例之前先拒绝未知操作。 */
const operations = {
  taxonomy: TAXONOMY_OP_IDS,
  notifications: NOTIFICATION_OP_IDS,
  search: SEARCH_OP_IDS.filter((opId) => opId !== "pages.search.get"),
  settings: SETTINGS_OP_IDS,
  knowledge: KNOWLEDGE_OP_IDS,
  assets: ASSET_OP_IDS,
  artifacts: ARTIFACT_OP_IDS,
  production: PRODUCTION_OP_IDS,
  publishing: PUBLISHING_OP_IDS,
  analytics: ANALYTICS_OP_IDS,
  ingestion: INGESTION_OP_IDS,
  reviews: REVIEWS_OP_IDS,
  reviewGate: REVIEW_GATE_OP_IDS,
  learnings: LEARNINGS_OP_IDS,
  ai: AI_OP_IDS,
  execution: EXECUTION_OP_IDS,
  intelligence: INTELLIGENCE_OP_IDS,
  positioning: POSITIONING_OP_IDS,
  candidate: CANDIDATE_OP_IDS,
  calibration: CALIBRATION_OP_IDS,
  platformAccount: PLATFORM_ACCOUNT_OP_IDS,
  scheduling: SCHEDULING_OP_IDS,
  contentCalendar: CONTENT_CALENDAR_OP_IDS,
  materialLinks: MATERIAL_LINKS_OP_IDS,
  benchmark: BENCHMARK_OP_IDS,
  trendSources: TREND_SOURCES_OP_IDS,
  favoritesFolders: FAVORITES_OP_IDS,
  topicAttribution: TOPIC_ATTRIBUTION_OP_IDS,
  queryServices: QUERY_SERVICES_OP_IDS,
  projects: PROJECT_OP_IDS,
} as const;
export type ApplicationTransports = {[K in keyof typeof operations]:Transport};

export function createApplicationTransport(resolve:()=>Promise<ApplicationTransports>):Transport {
  const owners=new Map<string,keyof ApplicationTransports>();
  // 保留既有分发顺序；pages.search.get 已由上方显式交给 queryServices。
  for(const [owner,ids] of Object.entries(operations))for(const id of ids){
    if(!owners.has(id))owners.set(id,owner as keyof ApplicationTransports);
  }
  return {async request(endpoint,input,ctx){
    const owner=owners.get(endpoint.id);
    if(!owner)throw new UnsupportedOperationError(endpoint.id);
    return (await resolve())[owner].request(endpoint,input,ctx);
  }};
}
