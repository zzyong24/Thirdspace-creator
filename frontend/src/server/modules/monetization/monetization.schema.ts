// Monetization module schema surface — the contract Zod DTOs this module produces
// (foundation §5: "<module>.schema.ts — re-export/usage of the contract Zod DTOs for
// this module"). The transport's mappers and the contract test validate their
// outputs against these; the contract is the single source of truth for the wire
// shape (contract/src/resources/monetization.ts, contract v0.4).
//
// The @creatoros/contract root barrel re-exports `ENDPOINTS` but NOT the resource
// files. The op responses are reachable as ENDPOINTS.<opKey>.response (the
// monetization op keys are unique across the merged registry):
//   - listProducts/createProduct/getProduct/patchProduct/retireProduct.response
//       === productResource
//   - listOffers/createOffer.response === offerResource
//   - listLeads/createLead/getLead/patchLead.response === leadResource
//   - listConversions/createConversion.response === conversionEventResource
//   - listOutputProducts/linkOutputProduct.response === contentOutputProductResource
//   - getFunnel.response === monetizationFunnelResource
//   - getFunnelByOutput.response === funnelStageResource
import { ENDPOINTS } from "@creatoros/contract";
import type {
  ProductRow,
  OfferRow,
  LeadRow,
  ConversionEventRow,
  ContentOutputProductRow,
} from "./monetization.repository";

export const productResource = ENDPOINTS.createProduct.response;
export const offerResource = ENDPOINTS.createOffer.response;
export const leadResource = ENDPOINTS.createLead.response;
export const conversionEventResource = ENDPOINTS.createConversion.response;
export const contentOutputProductResource =
  ENDPOINTS.linkOutputProduct.response;
export const funnelStageResource = ENDPOINTS.getFunnelByOutput.response;
export const monetizationFunnelResource = ENDPOINTS.getFunnel.response;

// Derive the inferred output type from the schema's phantom `_output` (zod 4's
// `z.infer<T>` is `T["_output"]`). The frontend package does not declare `zod` as a
// direct dependency, so we read the output type structurally (mirrors positioning).
export type ProductResource = (typeof productResource)["_output"];
export type OfferResource = (typeof offerResource)["_output"];
export type LeadResource = (typeof leadResource)["_output"];
export type ConversionEventResource =
  (typeof conversionEventResource)["_output"];
export type ContentOutputProductResource =
  (typeof contentOutputProductResource)["_output"];
export type FunnelStageResource = (typeof funnelStageResource)["_output"];
export type MonetizationFunnelResource =
  (typeof monetizationFunnelResource)["_output"];

// Row → DTO mappers (SPEC §9: the API DTO is built by an explicit mapper, NEVER the
// Drizzle row). The service + contract test share ONE mapping so a wire-shape change
// is caught once.
export function toProductDto(row: ProductRow): ProductResource {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    kind: row.kind,
    tier: row.tier ?? null,
    deliveryWeight: row.deliveryWeight ?? null,
    targetPersona: row.targetPersona ?? null,
    status: row.status as ProductResource["status"],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toOfferDto(row: OfferRow): OfferResource {
  return {
    id: row.id,
    userId: row.userId,
    productId: row.productId,
    price: row.price,
    currency: row.currency,
    version: row.version,
    validFrom: row.validFrom ?? null,
    validTo: row.validTo ?? null,
    note: row.note,
    status: row.status as OfferResource["status"],
    createdAt: row.createdAt,
  };
}

export function toLeadDto(row: LeadRow): LeadResource {
  return {
    id: row.id,
    userId: row.userId,
    source: row.source as LeadResource["source"],
    surveySource: row.surveySource ?? null,
    attributedContentId: row.attributedContentId ?? null,
    attributionMethod:
      (row.attributionMethod as LeadResource["attributionMethod"]) ?? null,
    attributionConfidence:
      (row.attributionConfidence as LeadResource["attributionConfidence"]) ??
      null,
    status: row.status as LeadResource["status"],
    ingestionRunId: row.ingestionRunId ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toConversionEventDto(
  row: ConversionEventRow,
): ConversionEventResource {
  return {
    id: row.id,
    userId: row.userId,
    leadId: row.leadId,
    productId: row.productId ?? null,
    offerId: row.offerId ?? null,
    eventType: row.eventType as ConversionEventResource["eventType"],
    value: row.value ?? null,
    currency: row.currency ?? null,
    occurredAt: row.occurredAt,
    ingestionRunId: row.ingestionRunId ?? null,
    createdAt: row.createdAt,
  };
}

export function toContentOutputProductDto(
  row: ContentOutputProductRow,
): ContentOutputProductResource {
  return {
    id: row.id,
    userId: row.userId,
    contentOutputId: row.contentOutputId,
    productId: row.productId,
    contentRole:
      (row.contentRole as ContentOutputProductResource["contentRole"]) ?? null,
    createdAt: row.createdAt,
  };
}
