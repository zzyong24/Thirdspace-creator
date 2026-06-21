import { z } from "zod";
import {
  id,
  iso8601,
  positioningSubjectType,
  statementAuthorType,
} from "../primitives";

// 七步整合设计 §3.2 — account-level positioning entities.

// CreatorProfile — 账号自我认知 (七步①). One per user this wave.
export const creatorProfileResource = z.object({
  id,
  userId: id,
  persona: z.string(),
  field: z.string(),
  audience: z.string(),
  differentiation: z.string(),
  capabilities: z.array(z.string()),
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
  createdAt: iso8601,
});
export type PositioningStatementResource = z.infer<
  typeof positioningStatementResource
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
