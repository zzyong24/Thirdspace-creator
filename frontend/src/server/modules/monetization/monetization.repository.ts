import { and, desc, eq, gte, lte, type Db } from "@creatoros/backend";
import {
  products,
  offers,
  leads,
  conversionEvents,
  contentOutputProducts,
} from "./monetization.db-schema";
import { OwnershipError, ConflictError } from "./monetization.errors";

// Monetization repository (foundation §5.2) — user-scoped queries ONLY. `userId` is
// baked into deps (mirrors the positioning/learnings repos): EVERY query filters
// `eq(table.userId, deps.userId)` and EVERY insert stamps `userId: deps.userId`. A
// get*ById helper throws OwnershipError when the scoped select returns empty — never
// revealing cross-user existence (foundation §2: 404 not 403).
//
// Append-only invariants enforced at the data-access layer:
//   - Offers: `createOffer` computes version = (max for product) + 1 and INSERTs;
//     there is NO updateOffer (a re-price = a new row, §4.2).
//   - ConversionEvents: snapshots offerId + value + currency; never mutated (§4.3).

export type ProductRow = typeof products.$inferSelect;
export type OfferRow = typeof offers.$inferSelect;
export type LeadRow = typeof leads.$inferSelect;
export type ConversionEventRow = typeof conversionEvents.$inferSelect;
export type ContentOutputProductRow =
  typeof contentOutputProducts.$inferSelect;

export interface RepoDeps {
  now: () => string; // ISO-8601 clock (injected for deterministic tests)
  nextId: (prefix: string) => string; // id generator (deterministic in tests)
  userId: string; // the ownership boundary, baked in at construction
}

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
  status?: string;
}

export interface CreateOfferInput {
  price: number;
  currency?: string;
  validFrom?: string | null;
  validTo?: string | null;
  note?: string;
}

export interface CreateLeadInput {
  source: string;
  surveySource?: string | null;
  attributedContentId?: string | null;
  attributionMethod?: string | null;
  attributionConfidence?: string | null;
  status?: string;
  ingestionRunId?: string | null;
  recordKey?: string | null;
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
  currency?: string | null;
  occurredAt: string;
  ingestionRunId?: string | null;
}

export interface FunnelFilter {
  productId?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
}

// The joined funnel read row: a ConversionEvent plus its Lead's attribution.
export interface FunnelEventRow {
  conversion: ConversionEventRow;
  attributedContentId: string | null;
  attributionConfidence: string | null;
}

export interface MonetizationRepository {
  // Fixture hydration (insert with explicit user_id already on the row).
  seedProducts(rows: ProductRow[]): Promise<void>;
  seedLeads(rows: LeadRow[]): Promise<void>;

  // Products / Offers.
  createProduct(input: CreateProductInput): Promise<ProductRow>;
  getProduct(productId: string): Promise<ProductRow>;
  listProducts(opts: {
    status?: string;
    limit: number;
    offset: number;
  }): Promise<{ rows: ProductRow[]; total: number }>;
  patchProduct(productId: string, patch: PatchProductInput): Promise<ProductRow>;
  retireProduct(productId: string): Promise<ProductRow>;
  createOffer(productId: string, input: CreateOfferInput): Promise<OfferRow>;
  listOffersByProduct(productId: string): Promise<OfferRow[]>;
  getOffer(offerId: string): Promise<OfferRow>;

  // Leads / Conversions.
  createLead(input: CreateLeadInput): Promise<LeadRow>;
  getLead(leadId: string): Promise<LeadRow>;
  listLeads(opts: {
    status?: string;
    source?: string;
    limit: number;
    offset: number;
  }): Promise<{ rows: LeadRow[]; total: number }>;
  patchLead(leadId: string, patch: PatchLeadInput): Promise<LeadRow>;
  findLeadByIngestionKey(
    ingestionRunId: string,
    recordKey: string,
  ): Promise<LeadRow | undefined>;
  createConversion(
    leadId: string,
    input: CreateConversionInput,
  ): Promise<ConversionEventRow>;
  listConversionsByLead(leadId: string): Promise<ConversionEventRow[]>;
  listConversionsForFunnel(filter: FunnelFilter): Promise<FunnelEventRow[]>;
  listLeadsForFunnel(filter: FunnelFilter): Promise<LeadRow[]>;

  // ContentOutputProduct (意图层).
  linkOutputProduct(
    contentOutputId: string,
    productId: string,
    opts: { contentRole?: string | null },
  ): Promise<ContentOutputProductRow>;
  unlinkOutputProduct(
    contentOutputId: string,
    productId: string,
  ): Promise<void>;
  listProductsByOutput(
    contentOutputId: string,
  ): Promise<ContentOutputProductRow[]>;
  listOutputsByProduct(
    productId: string,
  ): Promise<ContentOutputProductRow[]>;
}

export function createMonetizationRepository(
  db: Db,
  deps: RepoDeps,
): MonetizationRepository {
  const u = deps.userId;

  async function getProductRow(productId: string): Promise<ProductRow> {
    const rows = await db
      .select()
      .from(products)
      .where(and(eq(products.userId, u), eq(products.id, productId)));
    const row = rows[0];
    if (!row) {
      throw new OwnershipError(`OwnershipError: product not found: ${productId}`);
    }
    return row;
  }

  async function getLeadRow(leadId: string): Promise<LeadRow> {
    const rows = await db
      .select()
      .from(leads)
      .where(and(eq(leads.userId, u), eq(leads.id, leadId)));
    const row = rows[0];
    if (!row) {
      throw new OwnershipError(`OwnershipError: lead not found: ${leadId}`);
    }
    return row;
  }

  return {
    async seedProducts(rows) {
      if (rows.length === 0) return;
      await db.insert(products).values(rows).onConflictDoNothing();
    },
    async seedLeads(rows) {
      if (rows.length === 0) return;
      await db.insert(leads).values(rows).onConflictDoNothing();
    },

    async createProduct(input) {
      const inserted = await db
        .insert(products)
        .values({
          id: deps.nextId("product"),
          userId: u,
          name: input.name,
          kind: input.kind,
          tier: input.tier ?? null,
          deliveryWeight: input.deliveryWeight ?? null,
          targetPersona: input.targetPersona ?? null,
          status: "active",
          createdAt: deps.now(),
          updatedAt: deps.now(),
        })
        .returning();
      return inserted[0]!;
    },

    getProduct: getProductRow,

    async listProducts({ status, limit, offset }) {
      const where = status
        ? and(eq(products.userId, u), eq(products.status, status))
        : eq(products.userId, u);
      const rows = await db
        .select()
        .from(products)
        .where(where)
        .orderBy(desc(products.createdAt))
        .limit(limit)
        .offset(offset);
      const all = await db
        .select({ id: products.id })
        .from(products)
        .where(where);
      return { rows, total: all.length };
    },

    async patchProduct(productId, patch) {
      await getProductRow(productId); // ownership gate
      const set: Record<string, unknown> = { updatedAt: deps.now() };
      if (patch.name !== undefined) set.name = patch.name;
      if (patch.kind !== undefined) set.kind = patch.kind;
      if (patch.tier !== undefined) set.tier = patch.tier;
      if (patch.deliveryWeight !== undefined)
        set.deliveryWeight = patch.deliveryWeight;
      if (patch.targetPersona !== undefined)
        set.targetPersona = patch.targetPersona;
      if (patch.status !== undefined) set.status = patch.status;
      const updated = await db
        .update(products)
        .set(set)
        .where(and(eq(products.userId, u), eq(products.id, productId)))
        .returning();
      return updated[0]!;
    },

    async retireProduct(productId) {
      await getProductRow(productId); // ownership gate
      const updated = await db
        .update(products)
        .set({ status: "retired", updatedAt: deps.now() })
        .where(and(eq(products.userId, u), eq(products.id, productId)))
        .returning();
      return updated[0]!;
    },

    async createOffer(productId, input) {
      await getProductRow(productId); // ownership gate on the parent product
      const existing = await db
        .select({ version: offers.version })
        .from(offers)
        .where(and(eq(offers.userId, u), eq(offers.productId, productId)))
        .orderBy(desc(offers.version))
        .limit(1);
      const version = (existing[0]?.version ?? 0) + 1;
      const inserted = await db
        .insert(offers)
        .values({
          id: deps.nextId("offer"),
          userId: u,
          productId,
          price: input.price,
          currency: input.currency ?? "CNY",
          version,
          validFrom: input.validFrom ?? null,
          validTo: input.validTo ?? null,
          note: input.note ?? "",
          status: "active",
          createdAt: deps.now(),
        })
        .returning();
      return inserted[0]!;
    },

    async listOffersByProduct(productId) {
      await getProductRow(productId); // ownership gate
      return db
        .select()
        .from(offers)
        .where(and(eq(offers.userId, u), eq(offers.productId, productId)))
        .orderBy(desc(offers.version));
    },

    async getOffer(offerId) {
      const rows = await db
        .select()
        .from(offers)
        .where(and(eq(offers.userId, u), eq(offers.id, offerId)));
      const row = rows[0];
      if (!row) {
        throw new OwnershipError(`OwnershipError: offer not found: ${offerId}`);
      }
      return row;
    },

    async createLead(input) {
      const inserted = await db
        .insert(leads)
        .values({
          id: deps.nextId("lead"),
          userId: u,
          source: input.source,
          surveySource: input.surveySource ?? null,
          entryCodeId: null,
          attributedContentId: input.attributedContentId ?? null,
          attributionMethod: input.attributionMethod ?? null,
          attributionConfidence: input.attributionConfidence ?? null,
          status: input.status ?? "new",
          ingestionRunId: input.ingestionRunId ?? null,
          recordKey: input.recordKey ?? null,
          createdAt: deps.now(),
          updatedAt: deps.now(),
        })
        .returning();
      return inserted[0]!;
    },

    getLead: getLeadRow,

    async listLeads({ status, source, limit, offset }) {
      const conds = [eq(leads.userId, u)];
      if (status) conds.push(eq(leads.status, status));
      if (source) conds.push(eq(leads.source, source));
      const where = and(...conds);
      const rows = await db
        .select()
        .from(leads)
        .where(where)
        .orderBy(desc(leads.createdAt))
        .limit(limit)
        .offset(offset);
      const all = await db.select({ id: leads.id }).from(leads).where(where);
      return { rows, total: all.length };
    },

    async patchLead(leadId, patch) {
      await getLeadRow(leadId); // ownership gate
      const set: Record<string, unknown> = { updatedAt: deps.now() };
      if (patch.status !== undefined) set.status = patch.status;
      if (patch.attributedContentId !== undefined)
        set.attributedContentId = patch.attributedContentId;
      if (patch.attributionMethod !== undefined)
        set.attributionMethod = patch.attributionMethod;
      if (patch.attributionConfidence !== undefined)
        set.attributionConfidence = patch.attributionConfidence;
      const updated = await db
        .update(leads)
        .set(set)
        .where(and(eq(leads.userId, u), eq(leads.id, leadId)))
        .returning();
      return updated[0]!;
    },

    async findLeadByIngestionKey(ingestionRunId, recordKey) {
      const rows = await db
        .select()
        .from(leads)
        .where(
          and(
            eq(leads.userId, u),
            eq(leads.ingestionRunId, ingestionRunId),
            eq(leads.recordKey, recordKey),
          ),
        )
        .limit(1);
      return rows[0];
    },

    async createConversion(leadId, input) {
      await getLeadRow(leadId); // ownership gate on the parent lead
      const inserted = await db
        .insert(conversionEvents)
        .values({
          id: deps.nextId("conversion"),
          userId: u,
          leadId,
          productId: input.productId ?? null,
          offerId: input.offerId ?? null,
          eventType: input.eventType,
          value: input.value ?? null,
          currency: input.currency ?? null,
          occurredAt: input.occurredAt,
          ingestionRunId: input.ingestionRunId ?? null,
          createdAt: deps.now(),
        })
        .returning();
      return inserted[0]!;
    },

    async listConversionsByLead(leadId) {
      await getLeadRow(leadId); // ownership gate
      return db
        .select()
        .from(conversionEvents)
        .where(
          and(
            eq(conversionEvents.userId, u),
            eq(conversionEvents.leadId, leadId),
          ),
        )
        .orderBy(desc(conversionEvents.occurredAt));
    },

    async listConversionsForFunnel(filter) {
      // Scoped join Lead → ConversionEvent. The Lead's attribution travels with
      // each event so the service can bucket attributed vs unattributed (§4.5).
      const conds = [eq(conversionEvents.userId, u)];
      if (filter.productId)
        conds.push(eq(conversionEvents.productId, filter.productId));
      if (filter.periodStart)
        conds.push(gte(conversionEvents.occurredAt, filter.periodStart));
      if (filter.periodEnd)
        conds.push(lte(conversionEvents.occurredAt, filter.periodEnd));
      const rows = await db
        .select({
          conversion: conversionEvents,
          attributedContentId: leads.attributedContentId,
          attributionConfidence: leads.attributionConfidence,
        })
        .from(conversionEvents)
        .innerJoin(
          leads,
          and(
            eq(conversionEvents.leadId, leads.id),
            eq(leads.userId, u),
          ),
        )
        .where(and(...conds))
        .orderBy(desc(conversionEvents.occurredAt));
      return rows.map((r) => ({
        conversion: r.conversion,
        attributedContentId: r.attributedContentId,
        attributionConfidence: r.attributionConfidence,
      }));
    },

    async listLeadsForFunnel(filter) {
      const conds = [eq(leads.userId, u)];
      if (filter.periodStart)
        conds.push(gte(leads.createdAt, filter.periodStart));
      if (filter.periodEnd) conds.push(lte(leads.createdAt, filter.periodEnd));
      return db
        .select()
        .from(leads)
        .where(and(...conds))
        .orderBy(desc(leads.createdAt));
    },

    async linkOutputProduct(contentOutputId, productId, opts) {
      const existing = await db
        .select({ id: contentOutputProducts.id })
        .from(contentOutputProducts)
        .where(
          and(
            eq(contentOutputProducts.userId, u),
            eq(contentOutputProducts.contentOutputId, contentOutputId),
            eq(contentOutputProducts.productId, productId),
          ),
        )
        .limit(1);
      if (existing[0]) {
        throw new ConflictError(
          `ConflictError: content ${contentOutputId} already links product ${productId}`,
        );
      }
      const inserted = await db
        .insert(contentOutputProducts)
        .values({
          id: deps.nextId("cop"),
          userId: u,
          contentOutputId,
          productId,
          contentRole: opts.contentRole ?? null,
          createdAt: deps.now(),
        })
        .returning();
      return inserted[0]!;
    },

    async unlinkOutputProduct(contentOutputId, productId) {
      await db
        .delete(contentOutputProducts)
        .where(
          and(
            eq(contentOutputProducts.userId, u),
            eq(contentOutputProducts.contentOutputId, contentOutputId),
            eq(contentOutputProducts.productId, productId),
          ),
        );
    },

    async listProductsByOutput(contentOutputId) {
      return db
        .select()
        .from(contentOutputProducts)
        .where(
          and(
            eq(contentOutputProducts.userId, u),
            eq(contentOutputProducts.contentOutputId, contentOutputId),
          ),
        )
        .orderBy(desc(contentOutputProducts.createdAt));
    },

    async listOutputsByProduct(productId) {
      return db
        .select()
        .from(contentOutputProducts)
        .where(
          and(
            eq(contentOutputProducts.userId, u),
            eq(contentOutputProducts.productId, productId),
          ),
        )
        .orderBy(desc(contentOutputProducts.createdAt));
    },
  };
}
