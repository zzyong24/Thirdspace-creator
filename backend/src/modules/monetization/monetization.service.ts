import type { RequestContext } from "@creatoros/contract";
import type { Db } from "@creatoros/backend";
import {
  createMonetizationRepository,
  type MonetizationRepository,
  type RepoDeps,
} from "./monetization.repository";
import {
  toProductDto,
  toOfferDto,
  toLeadDto,
  toConversionEventDto,
  toContentOutputProductDto,
  type ProductResource,
  type OfferResource,
  type LeadResource,
  type ConversionEventResource,
  type ContentOutputProductResource,
  type FunnelStageResource,
  type MonetizationFunnelResource,
} from "./monetization.schema";
import { ValidationError } from "./monetization.errors";

// Monetization service (foundation §5.3) — every public method takes
// `(ctx: RequestContext, …)` and builds a repository bound to `ctx.userId`
// (createMonetizationRepository(db, { now, nextId, userId: ctx.userId })) so scoping
// is structural. It receives peer service interfaces via constructor deps (narrow
// ports — NO cross-module repository import, SPEC §22): Projects (ContentOutput
// ownership validation), Ingestion (IngestionRun existence — RISK-005), Analytics
// (the §4.6 conversion MetricValue fan-out), Search (index), Notifications (notify).
//
// Three §4 design invariants live here:
//   - price decoupled from Product (§4.2): patchProduct REJECTS a `price` field;
//     re-price goes through createOffer (a NEW append-only row).
//   - 漏损现实 (§4.1.1/§4.5): the funnel ALWAYS surfaces an `unattributed` bucket and
//     never force-allocates it to a content.
//   - 不重造 SCRM (§4.1.2/§C-4): ingestSurveyLeads rejects 悬空 ingestionRunId and is
//     idempotent on (run, record_key) — no parallel ingest write path.

// Stage order for the §4.5 三层口径 funnel (七步 §4.3 漏斗顺序).
const STAGE_ORDER = [
  "profile_visit",
  "follow",
  "lead",
  "inquiry",
  "signup",
  "purchase",
  "repurchase",
] as const;

// The conversion event types that fan out to an Analytics MetricValue (§4.6).
const ANALYTICS_FANOUT_EVENTS = new Set([
  "lead",
  "inquiry",
  "purchase",
  "repurchase",
]);

// --- Peer ports (narrow; satisfied at composition by the public services) ---

export interface MonetizationProjectsPort {
  // Ownership-gated read of a ContentOutput (cross-user / unknown → OwnershipError →
  // 404). Used to validate attributedContentId + the 意图层 link target.
  assertOutputOwned(ctx: RequestContext, outputId: string): Promise<void>;
}

export interface MonetizationIngestionPort {
  // Ownership-gated IngestionRun existence check (RISK-005 — reject 悬空 ids).
  assertRunExists(ctx: RequestContext, runId: string): Promise<void>;
}

export interface ConversionMetricInput {
  attributedContentId: string | null;
  metricKey: string; // §4.6 conversion metric_key (lead/inquiry/conversion/revenue)
  value: number;
  occurredAt: string;
}

export interface MonetizationAnalyticsPort {
  // Fan-out a conversion fact into the §4.6 conversion MetricValue so Dashboard/Review
  // read ONE source (Analytics, not Monetization). Best-effort at composition until
  // Analytics ships the §4.6 metric_key write (OQ3).
  recordConversionMetric(
    ctx: RequestContext,
    input: ConversionMetricInput,
  ): Promise<void>;
}

export interface MonetizationSearchPort {
  indexProduct(
    ctx: RequestContext,
    product: ProductResource,
  ): Promise<void>;
}

export interface MonetizationNotificationsPort {
  notifyConversion(
    ctx: RequestContext,
    input: { leadId: string; eventType: string; value: number | null },
  ): Promise<void>;
}

export interface ServiceDeps {
  db: Db;
  now: () => string;
  nextId: (prefix: string) => string;
  projects: MonetizationProjectsPort;
  ingestion: MonetizationIngestionPort;
  analytics: MonetizationAnalyticsPort;
  search: MonetizationSearchPort;
  notifications: MonetizationNotificationsPort;
}

// --- Command inputs ---

export interface CreateProductInput {
  name: string;
  kind: string;
  tier?: string | null;
  deliveryWeight?: string | null;
  targetPersona?: string | null;
}

export interface PatchProductInput {
  name?: string;
  kind?: string;
  tier?: string | null;
  deliveryWeight?: string | null;
  targetPersona?: string | null;
  status?: "active" | "retired";
  // NOT allowed — price is decoupled (§4.2). Presence → ValidationError.
  price?: never;
}

export interface CreateOfferInput {
  price: number;
  currency?: string;
  validFrom?: string | null;
  validTo?: string | null;
  note?: string;
}

export interface CreateLeadInput {
  source?: string;
  surveySource?: string | null;
  attributedContentId?: string | null;
  attributionMethod?: string | null;
  attributionConfidence?: string | null;
  status?: string;
}

export interface PatchLeadInput {
  status?: string;
  attributedContentId?: string | null;
  attributionMethod?: string | null;
  attributionConfidence?: string | null;
}

export interface CreateConversionInput {
  productId?: string | null;
  offerId?: string | null;
  eventType: string;
  value?: number | null;
  occurredAt?: string;
}

export interface LinkOutputProductInput {
  productId: string;
  contentRole?: string | null;
}

export interface FunnelQuery {
  productId?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
}

// A survey ingest record (飞书问卷 → Lead/ConversionEvent). recordKey is the §C-4
// (run, record_key) idempotency key.
export interface SurveyLeadRecord {
  recordKey: string;
  surveySource?: string | null;
  attributedContentId?: string | null;
  // When the survey carries an暗号/自报内容 → high; else low (§4.1.1 honest).
  selfReported?: boolean;
  conversion?: {
    eventType: string;
    productId?: string | null;
    offerId?: string | null;
    value?: number | null;
  };
}

export interface MonetizationService {
  listProducts(
    ctx: RequestContext,
    opts: { status?: string; limit: number; offset: number },
  ): Promise<{ rows: ProductResource[]; total: number }>;
  createProduct(
    ctx: RequestContext,
    input: CreateProductInput,
  ): Promise<ProductResource>;
  getProduct(ctx: RequestContext, productId: string): Promise<ProductResource>;
  patchProduct(
    ctx: RequestContext,
    productId: string,
    patch: PatchProductInput,
  ): Promise<ProductResource>;
  retireProduct(
    ctx: RequestContext,
    productId: string,
  ): Promise<ProductResource>;
  listOffers(
    ctx: RequestContext,
    productId: string,
  ): Promise<OfferResource[]>;
  createOffer(
    ctx: RequestContext,
    productId: string,
    input: CreateOfferInput,
  ): Promise<OfferResource>;

  linkOutputProduct(
    ctx: RequestContext,
    outputId: string,
    input: LinkOutputProductInput,
  ): Promise<ContentOutputProductResource>;
  unlinkOutputProduct(
    ctx: RequestContext,
    outputId: string,
    productId: string,
  ): Promise<{ ok: true }>;
  listProductsByOutput(
    ctx: RequestContext,
    outputId: string,
  ): Promise<ContentOutputProductResource[]>;

  listLeads(
    ctx: RequestContext,
    opts: { status?: string; source?: string; limit: number; offset: number },
  ): Promise<{ rows: LeadResource[]; total: number }>;
  createLead(
    ctx: RequestContext,
    input: CreateLeadInput,
  ): Promise<LeadResource>;
  getLead(ctx: RequestContext, leadId: string): Promise<LeadResource>;
  patchLead(
    ctx: RequestContext,
    leadId: string,
    patch: PatchLeadInput,
  ): Promise<LeadResource>;
  listConversions(
    ctx: RequestContext,
    leadId: string,
  ): Promise<ConversionEventResource[]>;
  createConversion(
    ctx: RequestContext,
    leadId: string,
    input: CreateConversionInput,
  ): Promise<ConversionEventResource>;

  // Ingestion intake (飞书问卷 — §C-4). NOT a public contract op; called BY the
  // Ingestion module's adapter. Idempotent on (run, record_key); rejects 悬空 runId.
  ingestSurveyLeads(
    ctx: RequestContext,
    ingestionRunId: string,
    records: SurveyLeadRecord[],
  ): Promise<{ created: number; skipped: number }>;

  getFunnel(
    ctx: RequestContext,
    query: FunnelQuery,
  ): Promise<MonetizationFunnelResource>;
  getFunnelForOutput(
    ctx: RequestContext,
    outputId: string,
  ): Promise<FunnelStageResource[]>;
  getProductFunnel(
    ctx: RequestContext,
    productId: string,
  ): Promise<MonetizationFunnelResource>;
}

export function createMonetizationService(
  deps: ServiceDeps,
): MonetizationService {
  const { db, now, nextId } = deps;

  function repoFor(ctx: RequestContext): MonetizationRepository {
    const repoDeps: RepoDeps = { now, nextId, userId: ctx.userId };
    return createMonetizationRepository(db, repoDeps);
  }

  // The §4.6 conversion metric_key for an event type (consumed by Analytics; this
  // module does not add the column). purchase/repurchase → revenue when valued.
  function metricKeyFor(eventType: string, value: number | null): string {
    if (eventType === "purchase" || eventType === "repurchase") {
      return value != null && value > 0 ? "revenue" : "conversion";
    }
    if (eventType === "lead") return "lead";
    if (eventType === "inquiry") return "inquiry";
    return "conversion";
  }

  return {
    async listProducts(ctx, opts) {
      const { rows, total } = await repoFor(ctx).listProducts(opts);
      return { rows: rows.map(toProductDto), total };
    },

    async createProduct(ctx, input) {
      const repo = repoFor(ctx);
      const row = await repo.createProduct(input);
      const dto = toProductDto(row);
      await deps.search.indexProduct(ctx, dto);
      return dto;
    },

    async getProduct(ctx, productId) {
      return toProductDto(await repoFor(ctx).getProduct(productId));
    },

    async patchProduct(ctx, productId, patch) {
      // Price decoupling guard (§4.2) — a `price` field is rejected; re-price goes
      // through createOffer (a NEW append-only Offer row).
      if ("price" in patch && (patch as { price?: unknown }).price !== undefined) {
        throw new ValidationError(
          "ValidationError: price is decoupled from Product — use createOffer to re-price",
        );
      }
      return toProductDto(await repoFor(ctx).patchProduct(productId, patch));
    },

    async retireProduct(ctx, productId) {
      const repo = repoFor(ctx);
      const dto = toProductDto(await repo.retireProduct(productId));
      await deps.search.indexProduct(ctx, dto);
      return dto;
    },

    async listOffers(ctx, productId) {
      const rows = await repoFor(ctx).listOffersByProduct(productId);
      return rows.map(toOfferDto);
    },

    async createOffer(ctx, productId, input) {
      if (input.price < 0) {
        throw new ValidationError(
          `ValidationError: offer price must be >= 0 (got ${input.price})`,
        );
      }
      const row = await repoFor(ctx).createOffer(productId, input);
      return toOfferDto(row);
    },

    async linkOutputProduct(ctx, outputId, input) {
      const repo = repoFor(ctx);
      // Validate BOTH output ownership (Projects port — no repo import) AND product
      // ownership so neither belongs to another user.
      await deps.projects.assertOutputOwned(ctx, outputId);
      await repo.getProduct(input.productId); // ownership
      const row = await repo.linkOutputProduct(outputId, input.productId, {
        contentRole: input.contentRole ?? null,
      });
      return toContentOutputProductDto(row);
    },

    async unlinkOutputProduct(ctx, outputId, productId) {
      await repoFor(ctx).unlinkOutputProduct(outputId, productId);
      return { ok: true };
    },

    async listProductsByOutput(ctx, outputId) {
      const rows = await repoFor(ctx).listProductsByOutput(outputId);
      return rows.map(toContentOutputProductDto);
    },

    async listLeads(ctx, opts) {
      const { rows, total } = await repoFor(ctx).listLeads(opts);
      return { rows: rows.map(toLeadDto), total };
    },

    async createLead(ctx, input) {
      const repo = repoFor(ctx);
      // If an attributedContentId is supplied, validate ownership via Projects.
      if (input.attributedContentId) {
        await deps.projects.assertOutputOwned(ctx, input.attributedContentId);
      }
      const row = await repo.createLead({
        source: input.source ?? "manual",
        surveySource: input.surveySource ?? null,
        attributedContentId: input.attributedContentId ?? null,
        // manual 登记 default (§4.7) — creator self-selects confidence.
        attributionMethod:
          input.attributionMethod ??
          (input.attributedContentId ? "manual" : null),
        attributionConfidence: input.attributionConfidence ?? null,
        status: input.status ?? "new",
      });
      return toLeadDto(row);
    },

    async getLead(ctx, leadId) {
      return toLeadDto(await repoFor(ctx).getLead(leadId));
    },

    async patchLead(ctx, leadId, patch) {
      return toLeadDto(await repoFor(ctx).patchLead(leadId, patch));
    },

    async listConversions(ctx, leadId) {
      const rows = await repoFor(ctx).listConversionsByLead(leadId);
      return rows.map(toConversionEventDto);
    },

    async createConversion(ctx, leadId, input) {
      const repo = repoFor(ctx);
      const lead = await repo.getLead(leadId); // ownership on the parent lead
      // If an offerId is supplied and value omitted, snapshot the offer's price.
      let value = input.value ?? null;
      let currency: string | null = null;
      if (input.offerId) {
        const offer = await repo.getOffer(input.offerId);
        if (value == null) value = offer.price;
        currency = offer.currency;
      }
      const occurredAt = input.occurredAt ?? now();
      const row = await repo.createConversion(leadId, {
        productId: input.productId ?? null,
        offerId: input.offerId ?? null,
        eventType: input.eventType,
        value,
        currency,
        occurredAt,
      });
      const dto = toConversionEventDto(row);

      // Fan-out the §4.6 conversion MetricValue (Dashboard/Review read Analytics).
      if (ANALYTICS_FANOUT_EVENTS.has(input.eventType)) {
        await deps.analytics.recordConversionMetric(ctx, {
          attributedContentId: lead.attributedContentId,
          metricKey: metricKeyFor(input.eventType, value),
          value: value ?? 0,
          occurredAt,
        });
      }
      // Notify on a 成交 (purchase/repurchase).
      if (input.eventType === "purchase" || input.eventType === "repurchase") {
        await deps.notifications.notifyConversion(ctx, {
          leadId,
          eventType: input.eventType,
          value,
        });
      }
      return dto;
    },

    async ingestSurveyLeads(ctx, ingestionRunId, records) {
      const repo = repoFor(ctx);
      // RISK-005 — reject 悬空 ingestionRunId (the run must be a REAL IngestionRun).
      await deps.ingestion.assertRunExists(ctx, ingestionRunId);

      let created = 0;
      let skipped = 0;
      for (const rec of records) {
        // Idempotency on (run, record_key) — skip if already written (§C-4).
        const existing = await repo.findLeadByIngestionKey(
          ingestionRunId,
          rec.recordKey,
        );
        if (existing) {
          skipped += 1;
          continue;
        }
        const lead = await repo.createLead({
          source: "survey",
          surveySource: rec.surveySource ?? null,
          attributedContentId: rec.attributedContentId ?? null,
          attributionMethod: "survey",
          // honest confidence (§4.1.1): high only when self-reported暗号/内容.
          attributionConfidence: rec.selfReported ? "high" : "low",
          status: "new",
          ingestionRunId,
          recordKey: rec.recordKey,
        });
        if (rec.conversion) {
          await repo.createConversion(lead.id, {
            productId: rec.conversion.productId ?? null,
            offerId: rec.conversion.offerId ?? null,
            eventType: rec.conversion.eventType,
            value: rec.conversion.value ?? null,
            currency: null,
            occurredAt: now(),
            ingestionRunId,
          });
        }
        created += 1;
      }
      return { created, skipped };
    },

    async getFunnel(ctx, query) {
      return buildFunnel(repoFor(ctx), query);
    },

    async getProductFunnel(ctx, productId) {
      return buildFunnel(repoFor(ctx), { productId });
    },

    async getFunnelForOutput(ctx, outputId) {
      const repo = repoFor(ctx);
      // 实绩层: counts of Conversions whose Lead is attributed to this output.
      const events = await repo.listConversionsForFunnel({});
      const attributed = events.filter(
        (e) => e.attributedContentId === outputId,
      );
      const stages: FunnelStageResource[] = STAGE_ORDER.map((stage) => ({
        stage,
        count: attributed.filter((e) => e.conversion.eventType === stage)
          .length,
        contentOutputId: outputId,
      }));
      return stages;
    },
  };

  // --- Funnel aggregation (§4.5 三层口径 + 诚实 unattributed) ---
  async function buildFunnel(
    repo: MonetizationRepository,
    query: FunnelQuery,
  ): Promise<MonetizationFunnelResource> {
    const events = await repo.listConversionsForFunnel({
      productId: query.productId ?? null,
      periodStart: query.periodStart ?? null,
      periodEnd: query.periodEnd ?? null,
    });

    const stages = STAGE_ORDER.map((stage) => ({
      stage,
      count: events.filter((e) => e.conversion.eventType === stage).length,
      contentOutputId: null,
    }));

    // An event is ATTRIBUTED iff its Lead has both an attributedContentId AND a
    // confidence. Otherwise it lands in the honest unattributed bucket (§4.5 — never
    // force-allocated to a content).
    let revenueAttributed = 0;
    let unattributedRevenue = 0;
    let unattributedConversions = 0;
    for (const e of events) {
      const attributed =
        e.attributedContentId != null && e.attributionConfidence != null;
      const value = e.conversion.value ?? 0;
      if (attributed) {
        revenueAttributed += value;
      } else {
        unattributedConversions += 1;
        unattributedRevenue += value;
      }
    }

    // Leads in the period whose attribution is absent feed the unattributed lead
    // count (a Lead need not have a conversion to be 漏损).
    const leadsInPeriod = await repo.listLeadsForFunnel({
      periodStart: query.periodStart ?? null,
      periodEnd: query.periodEnd ?? null,
    });
    const unattributedLeads = leadsInPeriod.filter(
      (l) => l.attributedContentId == null || l.attributionConfidence == null,
    ).length;

    const totalEvents = events.length;
    const unattributedRatio =
      totalEvents === 0 ? 0 : unattributedConversions / totalEvents;

    return {
      productId: query.productId ?? null,
      periodStart: query.periodStart ?? null,
      periodEnd: query.periodEnd ?? null,
      stages,
      revenueAttributed,
      unattributed: {
        leadCount: unattributedLeads,
        conversionCount: unattributedConversions,
        revenue: unattributedRevenue,
      },
      unattributedRatio,
    };
  }
}
