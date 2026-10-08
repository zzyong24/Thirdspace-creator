import type { z } from "zod";

import { projectsOperations } from "./operations/projects";
import { artifactsOperations } from "./operations/artifacts";
import { knowledgeOperations } from "./operations/knowledge";
import { taxonomyOperations } from "./operations/taxonomy";
import { assetsOperations } from "./operations/assets";
import { productionOperations } from "./operations/production";
import { publishingOperations } from "./operations/publishing";
import { analyticsOperations } from "./operations/analytics";
import { reviewsOperations } from "./operations/reviews";
// T-086 编导文案审核门(违禁词 lint 规则库 + 稿面双层审核报告)。
import { reviewGateOperations } from "./operations/review-gate";
import { learningsOperations } from "./operations/learnings";
import { aiOperations } from "./operations/ai";
// [T-255a] 执行层(脑手分离):execution.tasks 5 op(存储复用 ai_tasks,taskType `exec.*`)。
import { executionOperations } from "./operations/execution";
import { searchOperations } from "./operations/search";
import { notificationsOperations } from "./operations/notifications";
import { settingsOperations } from "./operations/settings";
import { ingestionOperations } from "./operations/ingestion";
import { positioningOperations } from "./operations/positioning";
// [T-052 裁决③] monetizationOperations 已随变现中心物理删除(宪法 §8「变现中心移除」)。
import { candidateOperations } from "./operations/candidate";
import { calibrationOperations } from "./operations/calibration";
import { accountGroupOperations } from "./operations/account-groups";
import { platformAccountOperations } from "./operations/platform-accounts";
import { contentCalendarOperations } from "./operations/content-calendar";
import { materialLinksOperations } from "./operations/material-links";
import { benchmarkOperations } from "./operations/benchmark";
import { trendSourceOperations } from "./operations/trend-source";
// [T-235c] 指定抖音收藏夹登记 CRUD(收藏夹跟拍信号源)。
import { favoritesFolderOperations } from "./operations/favorites-folder";
// [T-235d] 选题归因读侧(正向归因回流)。
import { topicAttributionOperations } from "./operations/topic-attribution";
import { schedulingOperations } from "./operations/scheduling";
import { pagesOperations } from "./operations/pages";
import { authOperations } from "./operations/auth";
import { intelligenceOperations } from "./operations/intelligence";

export type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export interface Endpoint<
  Params extends z.ZodTypeAny | undefined = z.ZodTypeAny | undefined,
  Query extends z.ZodTypeAny | undefined = z.ZodTypeAny | undefined,
  Body extends z.ZodTypeAny | undefined = z.ZodTypeAny | undefined,
  Response extends z.ZodTypeAny = z.ZodTypeAny,
  Id extends string = string,
> {
  readonly id: Id;
  readonly method: HttpMethod;
  readonly path: string; // e.g. "/projects/:projectId"
  readonly params: Params;
  readonly query: Query;
  readonly body: Body;
  readonly response: Response;
  readonly isList: boolean;
  readonly fr: readonly string[]; // FR ids this operation serves
}

export function defineEndpoint<
  Params extends z.ZodTypeAny | undefined,
  Query extends z.ZodTypeAny | undefined,
  Body extends z.ZodTypeAny | undefined,
  Response extends z.ZodTypeAny,
  const Id extends string,
>(e: {
  id: Id;
  method: HttpMethod;
  path: string;
  params?: Params;
  query?: Query;
  body?: Body;
  response: Response;
  isList?: boolean;
  fr?: readonly string[];
}): Endpoint<Params, Query, Body, Response, Id> {
  return {
    id: e.id,
    method: e.method,
    path: e.path,
    params: e.params as Params,
    query: e.query as Query,
    body: e.body as Body,
    response: e.response,
    isList: e.isList ?? false,
    fr: e.fr ?? [],
  };
}

// The complete contract surface — the machine-checkable form of SPEC §13.
// (`tests/registry.test.ts` asserts this matches §13 exactly.)
export const ENDPOINTS = {
  ...projectsOperations,
  ...artifactsOperations,
  ...knowledgeOperations,
  ...taxonomyOperations,
  ...assetsOperations,
  ...productionOperations,
  ...publishingOperations,
  ...analyticsOperations,
  ...reviewsOperations,
  // T-086 审核门:reviewRules.* + scriptReviews.*(additive)。
  ...reviewGateOperations,
  ...learningsOperations,
  ...aiOperations,
  // [T-255a] 执行层任务(create/list/get/confirm/discard)。
  ...executionOperations,
  // T-482 内容雷达：分类/来源/内容/运行/转化/迁移与 Project 来源引用。
  ...intelligenceOperations,
  ...searchOperations,
  ...notificationsOperations,
  ...settingsOperations,
  ...ingestionOperations,
  // contract v0.4 — 七步 (seven-step) module groups.
  ...positioningOperations,
  ...candidateOperations,
  ...calibrationOperations,
  ...platformAccountOperations,
  ...accountGroupOperations,
  ...contentCalendarOperations,
  ...materialLinksOperations,
  // [T-212a] 对标源 CRUD(选题/对标强化，SPEC 2026-07-11 §2.1)。
  ...benchmarkOperations,
  // [T-235b] 热点信源 CRUD(热点多源证据，SPEC 2026-07-11 daily-topic-autopilot §2.2)。
  ...trendSourceOperations,
  // [T-235c] 指定抖音收藏夹登记 CRUD(收藏夹跟拍信号源)。
  ...favoritesFolderOperations,
  // [T-235d] 选题归因读侧(正向归因回流，SPEC 2026-07-11 daily-topic-autopilot §2.4)。
  ...topicAttributionOperations,
  // T-007 调度 Agent 作业(data-source-pipeline-design §9 D1)。scheduled_job CRUD +
  // job_run 只读。owned-root,transport 按 ctx.userId 收窄。
  ...schedulingOperations,
  ...pagesOperations,
  // Identity / auth (P2 — 用户注册真账号). register is the first auth action
  // lifted into the contract dispatch surface; login/logout/me remain bare routes.
  ...authOperations,
} as const;

export type Endpoints = typeof ENDPOINTS;
