import { z } from "zod";
import { defineEndpoint } from "../endpoints";
import { id, paginationQuery, positioningSubjectType } from "../primitives";
import {
  creatorProfileResource,
  creatorProfileFacets,
  creatorProfileDownstreamRules,
  positioningStatementResource,
  positioningGateResultResource,
} from "../resources/positioning";

const statementParams = z.object({ statementId: id });

// SPEC §13 "定位" group (七步 ①②, contract v0.4). The 定位中心 page DTO
// (`pages.positioning.get`) is registered in operations/pages.ts but owned here.
export const positioningOperations = {
  getProfile: defineEndpoint({
    id: "positioning.profile.get",
    method: "GET",
    path: "/positioning/profile",
    response: creatorProfileResource,
    fr: ["FR-POSITIONING-PROFILE-GET"],
  }),
  upsertProfile: defineEndpoint({
    id: "positioning.profile.upsert",
    method: "POST",
    path: "/positioning/profile",
    body: z.object({
      persona: z.string().default(""),
      field: z.string().default(""),
      audience: z.string().default(""),
      differentiation: z.string().default(""),
      capabilities: z.array(z.string()).default([]),
      // 定位中心重建 — the richer facets + downstream rules. Optional so existing
      // callers (and the AI confirm) stay valid; absence = keep blank. The transport
      // + service normalize a partial/absent object to the full "" key set.
      facets: creatorProfileFacets.optional(),
      downstreamRules: creatorProfileDownstreamRules.optional(),
    }),
    response: creatorProfileResource,
    fr: ["FR-POSITIONING-PROFILE-UPSERT"],
  }),
  listStatements: defineEndpoint({
    id: "positioning.statements.list",
    method: "GET",
    path: "/positioning/statements",
    query: paginationQuery,
    response: positioningStatementResource,
    isList: true,
    fr: ["FR-POSITIONING-STATEMENT-LIST"],
  }),
  createStatement: defineEndpoint({
    id: "positioning.statements.create",
    method: "POST",
    path: "/positioning/statements",
    body: z.object({
      oneLiner: z.string().min(1),
      keywords: z.array(z.string()).length(3),
      productAnchorIds: z.array(id).default([]),
      // [T-231⑥] 修改原因(可选,团队留痕)—— 记录这次为什么开新版本。additive:optional
      // (存量调用方/AI confirm 不传也合法,服务端兜 ""),落 positioning_statements.change_reason 列。
      changeReason: z.string().optional(),
    }),
    response: positioningStatementResource,
    fr: ["FR-POSITIONING-STATEMENT-CREATE"],
  }),
  getStatement: defineEndpoint({
    id: "positioning.statements.get",
    method: "GET",
    path: "/positioning/statements/:statementId",
    params: statementParams,
    response: positioningStatementResource,
    fr: ["FR-POSITIONING-STATEMENT-GET"],
  }),
  evaluateGate: defineEndpoint({
    id: "positioning.gate.evaluate",
    method: "POST",
    path: "/positioning/gate/evaluate",
    body: z.object({
      subjectType: positioningSubjectType,
      subjectId: id,
      statementId: id.optional(),
    }),
    response: positioningGateResultResource,
    fr: ["FR-POSITIONING-GATE-EVALUATE"],
  }),
} as const;
