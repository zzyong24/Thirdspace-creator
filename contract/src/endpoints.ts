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
import { learningsOperations } from "./operations/learnings";
import { aiOperations } from "./operations/ai";
import { searchOperations } from "./operations/search";
import { notificationsOperations } from "./operations/notifications";
import { settingsOperations } from "./operations/settings";
import { ingestionOperations } from "./operations/ingestion";
import { positioningOperations } from "./operations/positioning";
// [T-052 裁决③] monetizationOperations 已随变现中心物理删除(宪法 §8「变现中心移除」)。
import { candidateOperations } from "./operations/candidate";
import { calibrationOperations } from "./operations/calibration";
import { platformAccountOperations } from "./operations/platform-accounts";
import { contentCalendarOperations } from "./operations/content-calendar";
import { materialLinksOperations } from "./operations/material-links";
import { schedulingOperations } from "./operations/scheduling";
import { pagesOperations } from "./operations/pages";
import { authOperations } from "./operations/auth";

export type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export interface Endpoint<
  Params extends z.ZodTypeAny | undefined = z.ZodTypeAny | undefined,
  Query extends z.ZodTypeAny | undefined = z.ZodTypeAny | undefined,
  Body extends z.ZodTypeAny | undefined = z.ZodTypeAny | undefined,
  Response extends z.ZodTypeAny = z.ZodTypeAny,
> {
  readonly id: string;
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
>(e: {
  id: string;
  method: HttpMethod;
  path: string;
  params?: Params;
  query?: Query;
  body?: Body;
  response: Response;
  isList?: boolean;
  fr?: readonly string[];
}): Endpoint<Params, Query, Body, Response> {
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
  ...learningsOperations,
  ...aiOperations,
  ...searchOperations,
  ...notificationsOperations,
  ...settingsOperations,
  ...ingestionOperations,
  // contract v0.4 — 七步 (seven-step) module groups.
  ...positioningOperations,
  ...candidateOperations,
  ...calibrationOperations,
  ...platformAccountOperations,
  ...contentCalendarOperations,
  ...materialLinksOperations,
  // T-007 调度 Agent 作业(data-source-pipeline-design §9 D1)。scheduled_job CRUD +
  // job_run 只读。owned-root,transport 按 ctx.userId 收窄。
  ...schedulingOperations,
  ...pagesOperations,
  // Identity / auth (P2 — 用户注册真账号). register is the first auth action
  // lifted into the contract dispatch surface; login/logout/me remain bare routes.
  ...authOperations,
} as const;

export type Endpoints = typeof ENDPOINTS;
