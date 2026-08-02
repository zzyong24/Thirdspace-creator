import { z } from "zod";
import { defineEndpoint } from "../endpoints";
import { id, paginationQuery, positioningSubjectType } from "../primitives";
import {
  creatorProfileResource,
  creatorProfileFacets,
  creatorProfileDownstreamRules,
  positioningDiscoverySessionResource,
  positioningDiscoverySourceMode,
  positioningDiscoveryThemeId,
  positioningDiscoveryProposalResource,
  positioningDiscoveryConfirmResultResource,
  positioningStatementResource,
  positioningMasterRestoreResultResource,
  positioningGateResultResource,
} from "../resources/positioning";

const statementParams = z.object({ statementId: id });

// SPEC §13 "定位" group (七步 ①②, contract v0.4). The 定位中心 page DTO
// (`pages.positioning.get`) is registered in operations/pages.ts but owned here.
export const positioningOperations = {
  startDiscovery: defineEndpoint({
    id: "positioning.discovery.start",
    method: "POST",
    path: "/positioning/discovery",
    body: z.object({ sourceMode: positioningDiscoverySourceMode }),
    response: positioningDiscoverySessionResource,
    fr: ["FR-POS-652-001"],
  }),
  updateDiscoveryAnswer: defineEndpoint({
    id: "positioning.discovery.answer.update",
    method: "PATCH",
    path: "/positioning/discovery/:sessionId/answers",
    params: z.object({ sessionId: id }),
    body: z.object({
      themeId: positioningDiscoveryThemeId,
      selectedOptionIds: z.array(z.string()).max(8).default([]),
      customText: z.string().max(1000).default(""),
      skipped: z.boolean().default(false),
      expectedRevision: z.number().int().nonnegative(),
    }),
    response: positioningDiscoverySessionResource,
    fr: ["FR-POS-652-002"],
  }),
  researchDiscovery: defineEndpoint({
    id: "positioning.discovery.research",
    method: "POST",
    path: "/positioning/discovery/:sessionId/research",
    params: z.object({ sessionId: id }),
    body: z.object({
      // 只允许前端显式提供的短关键词；服务端只把 query 传给搜索端口，绝不拼接访谈答案。
      query: z.string().trim().min(2).max(80),
      purpose: z.string().trim().min(1).max(80),
      targetThemeId: positioningDiscoveryThemeId,
      market: z.enum(["cn", "global"]).default("cn"),
      language: z.enum(["zh-CN", "any"]).default("zh-CN"),
      expectedRevision: z.number().int().nonnegative(),
    }),
    response: positioningDiscoverySessionResource,
    fr: ["FR-POS-652-003"],
  }),
  setDiscoveryEvidence: defineEndpoint({
    id: "positioning.discovery.evidence.set",
    method: "PATCH",
    path: "/positioning/discovery/:sessionId/evidence/:evidenceId",
    params: z.object({ sessionId: id, evidenceId: id }),
    body: z.object({
      adopted: z.boolean(),
      expectedRevision: z.number().int().nonnegative(),
    }),
    response: positioningDiscoverySessionResource,
    fr: ["FR-POS-652-004"],
  }),
  confirmDiscovery: defineEndpoint({
    id: "positioning.discovery.confirm",
    method: "POST",
    path: "/positioning/discovery/:sessionId/confirm",
    params: z.object({ sessionId: id }),
    body: z.object({
      candidateId: id,
      candidateRevision: z.number().int().nonnegative(),
      expectedCurrentStatementId: id.nullable(),
      idempotencyKey: z.string().min(8).max(120),
      proposal: positioningDiscoveryProposalResource,
    }),
    response: positioningDiscoveryConfirmResultResource,
    fr: ["FR-POS-652-005"],
  }),
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
  resetPositioningMaster: defineEndpoint({
    id: "positioning.master.reset",
    method: "POST",
    path: "/positioning/master/reset",
    response: creatorProfileResource,
    fr: ["FR-POS-623-001"],
  }),
  restorePositioningMaster: defineEndpoint({
    id: "positioning.master.restore",
    method: "POST",
    path: "/positioning/master/restore",
    body: z.object({ statementId: id }),
    response: positioningMasterRestoreResultResource,
    fr: ["FR-POS-632-001"],
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
