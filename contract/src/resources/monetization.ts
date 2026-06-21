import { z } from "zod";
import {
  id,
  iso8601,
  contentRole,
  productStatus,
  offerStatus,
  leadSource,
  leadStatus,
  attributionMethod,
  attributionConfidence,
  conversionEventType,
} from "../primitives";

// 七步整合设计 §4 — 柔性产品模型 + 归因层 + 漏斗中心.

// Product — kind is free-form/user-defined (§4.2 "不硬编码类型"). Price lives
// on Offer, never on Product (§4.2 decoupling).
export const productResource = z.object({
  id,
  userId: id,
  name: z.string(),
  kind: z.string(),
  tier: z.string().nullable(),
  deliveryWeight: z.string().nullable(),
  targetPersona: z.string().nullable(),
  status: productStatus,
  createdAt: iso8601,
  updatedAt: iso8601,
});
export type ProductResource = z.infer<typeof productResource>;

// Offer — append-only price snapshot. A re-price = a new Offer version.
export const offerResource = z.object({
  id,
  userId: id,
  productId: id,
  price: z.number(),
  currency: z.string(),
  version: z.number().int(),
  validFrom: iso8601.nullable(),
  validTo: iso8601.nullable(),
  note: z.string(),
  status: offerStatus,
  createdAt: iso8601,
});
export type OfferResource = z.infer<typeof offerResource>;

// Lead — attribution is naturally broken (§4.1.1); attributedContentId nullable
// by design.
export const leadResource = z.object({
  id,
  userId: id,
  source: leadSource,
  surveySource: z.string().nullable(),
  attributedContentId: id.nullable(),
  attributionMethod: attributionMethod.nullable(),
  attributionConfidence: attributionConfidence.nullable(),
  status: leadStatus,
  ingestionRunId: id.nullable(),
  createdAt: iso8601,
  updatedAt: iso8601,
});
export type LeadResource = z.infer<typeof leadResource>;

// ConversionEvent — hangs on Lead; snapshots offerId + amount (immutable).
export const conversionEventResource = z.object({
  id,
  userId: id,
  leadId: id,
  productId: id.nullable(),
  offerId: id.nullable(),
  eventType: conversionEventType,
  value: z.number().nullable(),
  currency: z.string().nullable(),
  occurredAt: iso8601,
  ingestionRunId: id.nullable(),
  createdAt: iso8601,
});
export type ConversionEventResource = z.infer<typeof conversionEventResource>;

// ContentOutputProduct — 意图层 join (§4.4): a content铺路 a product.
export const contentOutputProductResource = z.object({
  id,
  userId: id,
  contentOutputId: id,
  productId: id,
  contentRole: contentRole.nullable(),
  createdAt: iso8601,
});
export type ContentOutputProductResource = z.infer<
  typeof contentOutputProductResource
>;

// FunnelStage — per-content rollup (§4.5 三层口径).
export const funnelStageResource = z.object({
  stage: conversionEventType,
  count: z.number().int(),
  contentOutputId: id.nullable(),
});
export type FunnelStageResource = z.infer<typeof funnelStageResource>;

// 漏斗中心 aggregate — ALWAYS carries the 诚实 unattributed bucket (§4.5).
export const monetizationFunnelResource = z.object({
  productId: id.nullable(),
  periodStart: iso8601.nullable(),
  periodEnd: iso8601.nullable(),
  stages: z.array(funnelStageResource),
  revenueAttributed: z.number(),
  unattributed: z.object({
    leadCount: z.number().int(),
    conversionCount: z.number().int(),
    revenue: z.number(),
  }),
  unattributedRatio: z.number(),
});
export type MonetizationFunnelResource = z.infer<
  typeof monetizationFunnelResource
>;
