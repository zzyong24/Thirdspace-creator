import { eq, and, asc, desc } from "drizzle-orm";
import type { Db } from "../db";
import {
  products,
  offers,
  leads,
  conversionEvents,
  contentOutputProducts,
} from "../schema/monetization";

// Injected dependencies — mirrors project/knowledge-repository's RepoDeps so the
// repo stays deterministic (no Date.now / Math.random / fetch inside) and
// user-scoped. `userId` is threaded from RequestContext at construction.
export interface RepoDeps {
  now: () => string; // ISO-8601 clock (injected for deterministic tests)
  nextId: (prefix: string) => string; // id generator (deterministic in tests)
  userId: string; // owner threaded from RequestContext
}

type ProductRow = typeof products.$inferSelect;
type OfferRow = typeof offers.$inferSelect;
type LeadRow = typeof leads.$inferSelect;
type ConversionEventRow = typeof conversionEvents.$inferSelect;
type ContentOutputProductRow = typeof contentOutputProducts.$inferSelect;

// Product status is a tiny FSM (§4.2): active -> retired only (adjacent-only).
const PRODUCT_STATUS_ORDER = ["active", "retired"] as const;
type ProductStatus = (typeof PRODUCT_STATUS_ORDER)[number];

// Lead status FSM (§4.1): new -> qualified -> won, with lost reachable from any
// non-terminal stage. Adjacent-forward only along the happy path.
const LEAD_STATUS_ORDER = ["new", "qualified", "won"] as const;
type LeadStatus = "new" | "qualified" | "won" | "lost";

export interface MonetizationRepository {
  // --- seed helpers (idempotent UNIQUE inserts) ---
  seedProducts(rows: ProductRow[]): Promise<void>;

  // --- Product (core entity) ---
  listProducts(): Promise<ProductRow[]>;
  getProduct(productId: string): Promise<ProductRow>;
  createProduct(input: {
    name: string;
    kind: string;
    tier?: string | null;
    deliveryWeight?: string | null;
    targetPersona?: string | null;
  }): Promise<ProductRow>;
  patchProduct(
    productId: string,
    patch: {
      name?: string;
      kind?: string;
      tier?: string | null;
      deliveryWeight?: string | null;
      targetPersona?: string | null;
    },
  ): Promise<ProductRow>;
  retireProduct(productId: string): Promise<ProductRow>;

  // --- Offer (append-only price snapshot; a re-price = a NEW version) ---
  listOffers(productId: string): Promise<OfferRow[]>;
  createOffer(
    productId: string,
    input: {
      price: number;
      currency?: string;
      validFrom?: string | null;
      validTo?: string | null;
      note?: string;
    },
  ): Promise<OfferRow>;

  // --- Lead ---
  listLeads(): Promise<LeadRow[]>;
  getLead(leadId: string): Promise<LeadRow>;
  createLead(input: {
    source: string;
    surveySource?: string | null;
    entryCodeId?: string | null;
    attributedContentId?: string | null;
    attributionMethod?: string | null;
    attributionConfidence?: string | null;
    ingestionRunId?: string | null;
    recordKey?: string | null;
  }): Promise<LeadRow>;
  transitionLead(leadId: string, status: LeadStatus): Promise<LeadRow>;

  // --- ConversionEvent (hangs on Lead; immutable, deduped via UNIQUE) ---
  listConversionEvents(leadId: string): Promise<ConversionEventRow[]>;
  recordConversionEvent(
    leadId: string,
    input: {
      eventType: string;
      productId?: string | null;
      offerId?: string | null;
      value?: number | null;
      currency?: string | null;
      occurredAt?: string;
      ingestionRunId?: string | null;
    },
  ): Promise<ConversionEventRow>;

  // --- ContentOutputProduct (意图层 join; a content铺路 a product at most once) ---
  linkContentToProduct(input: {
    contentOutputId: string;
    productId: string;
    contentRole?: string | null;
  }): Promise<ContentOutputProductRow>;
  listProductContentLinks(productId: string): Promise<ContentOutputProductRow[]>;

  // TODO(monetization): 漏斗中心 aggregate read (monetizationFunnelResource — §4.5
  // three-layer rollup with the honest unattributed bucket) is a derived read over
  // these tables; deferred to a service-layer query so the repo stays CRUD-shaped.
}

export function createMonetizationRepository(
  db: Db,
  deps: RepoDeps,
): MonetizationRepository {
  // Owner-scoped read: a row owned by another user is invisible → the same
  // "not found" OwnershipError surface project/knowledge-repository use for
  // cross-user / missing rows.
  async function getProduct(productId: string): Promise<ProductRow> {
    const rows = await db
      .select()
      .from(products)
      .where(and(eq(products.id, productId), eq(products.userId, deps.userId)));
    const row = rows[0];
    if (!row) {
      throw new Error(`OwnershipError: product not found: ${productId}`);
    }
    return row;
  }

  async function getLead(leadId: string): Promise<LeadRow> {
    const rows = await db
      .select()
      .from(leads)
      .where(and(eq(leads.id, leadId), eq(leads.userId, deps.userId)));
    const row = rows[0];
    if (!row) {
      throw new Error(`OwnershipError: lead not found: ${leadId}`);
    }
    return row;
  }

  return {
    async seedProducts(rows) {
      if (rows.length === 0) return;
      await db.insert(products).values(rows).onConflictDoNothing();
    },

    async listProducts() {
      return db
        .select()
        .from(products)
        .where(eq(products.userId, deps.userId))
        .orderBy(asc(products.createdAt));
    },

    getProduct,

    async createProduct({ name, kind, tier, deliveryWeight, targetPersona }) {
      const ts = deps.now();
      const inserted = await db
        .insert(products)
        .values({
          id: deps.nextId("product"),
          userId: deps.userId,
          name,
          kind,
          tier: tier ?? null,
          deliveryWeight: deliveryWeight ?? null,
          targetPersona: targetPersona ?? null,
          status: "active",
          createdAt: ts,
          updatedAt: ts,
        })
        .returning();
      return inserted[0]!;
    },

    async patchProduct(productId, patch) {
      await getProduct(productId); // ownership + existence gate
      const set: Partial<ProductRow> = { updatedAt: deps.now() };
      if (patch.name !== undefined) set.name = patch.name;
      if (patch.kind !== undefined) set.kind = patch.kind;
      if (patch.tier !== undefined) set.tier = patch.tier;
      if (patch.deliveryWeight !== undefined)
        set.deliveryWeight = patch.deliveryWeight;
      if (patch.targetPersona !== undefined)
        set.targetPersona = patch.targetPersona;
      const updated = await db
        .update(products)
        .set(set)
        .where(eq(products.id, productId))
        .returning();
      return updated[0]!;
    },

    // status FSM: active -> retired is the only legal (adjacent) transition.
    async retireProduct(productId) {
      const product = await getProduct(productId);
      const fromIdx = PRODUCT_STATUS_ORDER.indexOf(
        product.status as ProductStatus,
      );
      const toIdx = PRODUCT_STATUS_ORDER.indexOf("retired");
      if (toIdx - fromIdx !== 1) {
        throw new Error(
          `ConflictError: illegal product status transition ${product.status} -> retired`,
        );
      }
      const ts = deps.now();
      const updated = await db
        .update(products)
        .set({ status: "retired", updatedAt: ts })
        .where(eq(products.id, productId))
        .returning();
      return updated[0]!;
    },

    async listOffers(productId) {
      await getProduct(productId); // ownership + existence gate
      return db
        .select()
        .from(offers)
        .where(
          and(eq(offers.productId, productId), eq(offers.userId, deps.userId)),
        )
        .orderBy(asc(offers.version));
    },

    // An offer APPENDS a new version (max existing for product) + 1 and never
    // mutates an existing offer row — the append-only price chain (§4.1.3).
    async createOffer(productId, { price, currency, validFrom, validTo, note }) {
      await getProduct(productId); // ownership + existence gate
      const ts = deps.now();

      const latest = await db
        .select()
        .from(offers)
        .where(
          and(eq(offers.productId, productId), eq(offers.userId, deps.userId)),
        )
        .orderBy(desc(offers.version))
        .limit(1);
      const nextVersion = (latest[0]?.version ?? 0) + 1;

      const inserted = await db
        .insert(offers)
        .values({
          id: deps.nextId("offer"),
          userId: deps.userId,
          productId,
          price,
          currency: currency ?? "CNY",
          version: nextVersion,
          validFrom: validFrom ?? null,
          validTo: validTo ?? null,
          note: note ?? "",
          status: "active",
          createdAt: ts,
        })
        .returning();
      return inserted[0]!;
    },

    async listLeads() {
      return db
        .select()
        .from(leads)
        .where(eq(leads.userId, deps.userId))
        .orderBy(asc(leads.createdAt));
    },

    getLead,

    async createLead({
      source,
      surveySource,
      entryCodeId,
      attributedContentId,
      attributionMethod,
      attributionConfidence,
      ingestionRunId,
      recordKey,
    }) {
      const ts = deps.now();
      const inserted = await db
        .insert(leads)
        .values({
          id: deps.nextId("lead"),
          userId: deps.userId,
          source,
          surveySource: surveySource ?? null,
          entryCodeId: entryCodeId ?? null,
          attributedContentId: attributedContentId ?? null,
          attributionMethod: attributionMethod ?? null,
          attributionConfidence: attributionConfidence ?? null,
          status: "new",
          ingestionRunId: ingestionRunId ?? null,
          recordKey: recordKey ?? null,
          createdAt: ts,
          updatedAt: ts,
        })
        .returning();
      return inserted[0]!;
    },

    // status FSM: new -> qualified -> won along the happy path (adjacent-only);
    // `lost` is reachable from any non-terminal (new|qualified) stage.
    async transitionLead(leadId, status) {
      const lead = await getLead(leadId); // ownership + existence gate
      const from = lead.status as LeadStatus;

      const legal =
        status === "lost"
          ? from === "new" || from === "qualified"
          : LEAD_STATUS_ORDER.indexOf(status as (typeof LEAD_STATUS_ORDER)[number]) -
              LEAD_STATUS_ORDER.indexOf(from as (typeof LEAD_STATUS_ORDER)[number]) ===
            1;
      if (!legal) {
        throw new Error(
          `ConflictError: illegal lead status transition ${from} -> ${status}`,
        );
      }
      const ts = deps.now();
      const updated = await db
        .update(leads)
        .set({ status, updatedAt: ts })
        .where(eq(leads.id, leadId))
        .returning();
      return updated[0]!;
    },

    async listConversionEvents(leadId) {
      await getLead(leadId); // ownership + existence gate
      return db
        .select()
        .from(conversionEvents)
        .where(
          and(
            eq(conversionEvents.leadId, leadId),
            eq(conversionEvents.userId, deps.userId),
          ),
        )
        .orderBy(asc(conversionEvents.occurredAt));
    },

    // ConversionEvent is immutable + deduped: the UNIQUE (user, lead, event_type,
    // occurred_at) guard makes a duplicate登记 a no-op via onConflictDoNothing.
    // Returns the surviving row (the existing one on conflict).
    async recordConversionEvent(
      leadId,
      {
        eventType,
        productId,
        offerId,
        value,
        currency,
        occurredAt,
        ingestionRunId,
      },
    ) {
      await getLead(leadId); // ownership + existence gate
      const ts = deps.now();
      const occurred = occurredAt ?? ts;

      const inserted = await db
        .insert(conversionEvents)
        .values({
          id: deps.nextId("conversion"),
          userId: deps.userId,
          leadId,
          productId: productId ?? null,
          offerId: offerId ?? null,
          eventType,
          value: value ?? null,
          currency: currency ?? null,
          occurredAt: occurred,
          ingestionRunId: ingestionRunId ?? null,
          createdAt: ts,
        })
        .onConflictDoNothing()
        .returning();

      if (inserted[0]) return inserted[0];

      // Idempotent insert hit the UNIQUE dedup guard — return the surviving row.
      const existing = await db
        .select()
        .from(conversionEvents)
        .where(
          and(
            eq(conversionEvents.userId, deps.userId),
            eq(conversionEvents.leadId, leadId),
            eq(conversionEvents.eventType, eventType),
            eq(conversionEvents.occurredAt, occurred),
          ),
        )
        .limit(1);
      return existing[0]!;
    },

    // 意图层 join — UNIQUE (user, content_output, product) makes a re-link a no-op.
    async linkContentToProduct({ contentOutputId, productId, contentRole }) {
      await getProduct(productId); // caller must own the product
      const inserted = await db
        .insert(contentOutputProducts)
        .values({
          id: deps.nextId("cop"),
          userId: deps.userId,
          contentOutputId,
          productId,
          contentRole: contentRole ?? null,
          createdAt: deps.now(),
        })
        .onConflictDoNothing()
        .returning();

      if (inserted[0]) return inserted[0];

      const existing = await db
        .select()
        .from(contentOutputProducts)
        .where(
          and(
            eq(contentOutputProducts.userId, deps.userId),
            eq(contentOutputProducts.contentOutputId, contentOutputId),
            eq(contentOutputProducts.productId, productId),
          ),
        )
        .limit(1);
      return existing[0]!;
    },

    async listProductContentLinks(productId) {
      await getProduct(productId); // ownership + existence gate
      return db
        .select()
        .from(contentOutputProducts)
        .where(
          and(
            eq(contentOutputProducts.productId, productId),
            eq(contentOutputProducts.userId, deps.userId),
          ),
        )
        .orderBy(asc(contentOutputProducts.createdAt));
    },
  };
}
