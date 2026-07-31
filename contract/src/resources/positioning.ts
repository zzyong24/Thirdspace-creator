import { z } from "zod";
import {
  id,
  iso8601,
  positioningSubjectType,
  statementAuthorType,
} from "../primitives";

// 七步整合设计 §3.2 — account-level positioning entities.

// 账号定位 facet 补全 (定位中心重建) — the richer 自我认知 facets the 英雄区 9 格网格
// renders and the downstream brief injects. Each is an optional free-text 一行值; an
// empty string means "not filled yet" (the UI drops that grid cell, never invents one).
// Stored as ONE jsonb column (`facets`) — a back-compat additive shape.
export const creatorProfileFacets = z.object({
  contentScope: z.string().default(""), // 内容范围（我会讲什么 / 选题边界）
  avoid: z.string().default(""), // 不做什么（明确排除）
  corePain: z.string().default(""), // 核心痛点（受众最痛的问题）
  coreValue: z.string().default(""), // 核心价值（我给受众的根本回报）
  tone: z.string().default(""), // 表达风格（语气 / 调性）
  statusNote: z.string().default(""), // 当前状态（账号此刻所处阶段）
});
export type CreatorProfileFacets = z.infer<typeof creatorProfileFacets>;

// 定位规则（供下游模块使用）— the 5 explicit rules the right-rail 规则卡 surfaces AND
// the downstream brief injects so 选题/写稿/项目 runners read them as hard constraints.
// Each is optional free-text; empty = "no rule set" (the card + injection skip it).
// Stored as ONE jsonb column (`downstream_rules`).
export const creatorProfileDownstreamRules = z.object({
  topicRule: z.string().default(""), // 选题规则（什么选题该做 / 不该做）
  scriptRule: z.string().default(""), // 写稿规则（结构 / 钩子 / 表达约束）
  projectRule: z.string().default(""), // 项目规则（立项 / 节奏约束）
  forbidRule: z.string().default(""), // 禁止事项（绝对红线）
  expressionRule: z.string().default(""), // 表达风格规则（统一语气的硬约束）
});
export type CreatorProfileDownstreamRules = z.infer<
  typeof creatorProfileDownstreamRules
>;

// 定位母版的不可变快照。它刻意不含 id/userId/timestamps：这些属于当前 profile 行，
// 恢复时继续沿用当前账号的 ownership 与审计时间；这里只保存用户可恢复的业务内容。
export const positioningMasterSnapshotResource = z.object({
  persona: z.string(),
  field: z.string(),
  audience: z.string(),
  differentiation: z.string(),
  capabilities: z.array(z.string()),
  facets: creatorProfileFacets,
  downstreamRules: creatorProfileDownstreamRules,
});
export type PositioningMasterSnapshotResource = z.infer<
  typeof positioningMasterSnapshotResource
>;

// CreatorProfile — 账号自我认知 (七步①). One per user this wave.
export const creatorProfileResource = z.object({
  id,
  userId: id,
  persona: z.string(),
  field: z.string(),
  audience: z.string(),
  differentiation: z.string(),
  capabilities: z.array(z.string()),
  facets: creatorProfileFacets,
  downstreamRules: creatorProfileDownstreamRules,
  createdAt: iso8601,
  updatedAt: iso8601,
});
export type CreatorProfileResource = z.infer<typeof creatorProfileResource>;

// PositioningStatement — 定位陈述, 不可变版本链 (ArtifactVersion-style).
export const positioningStatementResource = z.object({
  id,
  userId: id,
  profileId: id,
  oneLiner: z.string(),
  keywords: z.array(z.string()),
  productAnchorIds: z.array(id),
  versionNumber: z.number().int(),
  createdByType: statementAuthorType,
  aiTaskId: id.nullable(),
  // [T-234 读侧补] 修改原因(硬约束留痕):写侧 0034 已落库,读侧此前漏投影 → get 读不回。
  changeReason: z.string().default(""),
  // [T-632] 完整定位母版快照。旧版本可能为 null；不得用当前 profile 猜历史值。
  masterSnapshot: positioningMasterSnapshotResource.nullable().default(null),
  createdAt: iso8601,
});
export type PositioningStatementResource = z.infer<
  typeof positioningStatementResource
>;

export const positioningMasterRestoreResultResource = z.object({
  profile: creatorProfileResource,
  statement: positioningStatementResource,
  restoredFromVersion: z.number().int(),
});
export type PositioningMasterRestoreResultResource = z.infer<
  typeof positioningMasterRestoreResultResource
>;

// PositioningGate result — value object (no table). Advisory 0–100 fit score.
export const positioningGateResultResource = z.object({
  subjectType: positioningSubjectType,
  subjectId: id,
  statementId: id,
  positioningFit: z.number().int(),
  reasons: z.array(z.string()),
});
export type PositioningGateResultResource = z.infer<
  typeof positioningGateResultResource
>;

// 定位中心 page-composition DTO.
export const positioningCenterResource = z.object({
  profile: creatorProfileResource.nullable(),
  currentStatement: positioningStatementResource.nullable(),
  keywords: z.array(z.string()),
  productAnchors: z.array(id),
  history: z.array(positioningStatementResource),
});
export type PositioningCenterResource = z.infer<
  typeof positioningCenterResource
>;
