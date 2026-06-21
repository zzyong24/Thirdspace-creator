import { z } from "zod";
import {
  id,
  iso8601,
  contentRole,
  candidateSource,
  candidateStatus,
  audienceSignalSource,
} from "../primitives";

// 七步整合设计 §5 — 选题情报层 (Candidate + AudienceSignal + TopicPromotion).

// Candidate — Project 之上的轻量选题. AI-sourced go via §C-3 confirm flow.
export const candidateResource = z.object({
  id,
  userId: id,
  title: z.string(),
  angle: z.string(),
  source: candidateSource,
  contentRole: contentRole.nullable(),
  productAnchorId: id.nullable(),
  positioningFit: z.number().int().nullable(),
  predictedScore: z.number().int().nullable(),
  demandCount: z.number().int(),
  status: candidateStatus,
  aiTaskId: id.nullable(),
  createdAt: iso8601,
  updatedAt: iso8601,
});
export type CandidateResource = z.infer<typeof candidateResource>;

// AudienceSignal — 受众信号. Writes go through Ingestion (§C-4).
export const audienceSignalResource = z.object({
  id,
  userId: id,
  source: audienceSignalSource,
  rawText: z.string(),
  demandTag: z.string().nullable(),
  payingIntent: z.string().nullable(),
  linkedCandidateId: id.nullable(),
  ingestionRunId: id.nullable(),
  createdAt: iso8601,
});
export type AudienceSignalResource = z.infer<typeof audienceSignalResource>;

// TopicPromotion — Candidate → Project promotion record.
export const topicPromotionResource = z.object({
  id,
  userId: id,
  candidateId: id,
  projectId: id,
  promotedAt: iso8601,
});
export type TopicPromotionResource = z.infer<typeof topicPromotionResource>;
