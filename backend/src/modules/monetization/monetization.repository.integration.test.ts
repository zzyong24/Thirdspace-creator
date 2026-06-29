import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import {
  createMonetizationRepository,
  type MonetizationRepository,
} from "./monetization.repository";
import { OwnershipError, ConflictError } from "./monetization.errors";

// Monetization repository integration test (Steps 1+2) — pglite-backed. Asserts the
// five tables round-trip (Step 1: nullable FKs null, status defaults
// active/new, attributedContentId default null) AND that every query is user-scoped
// (Step 2: user A cannot read user B's product/lead → OwnershipError), offer version
// increments 1→2→3 (append-only, re-price never mutates), link UNIQUE → ConflictError,
// and the funnel reads are scoped + filtered. Deterministic clock/ids.

const NOW = "2026-06-21T00:00:00.000Z";

function repoFor(db: Db, userId: string, tag = userId): MonetizationRepository {
  let seq = 0;
  return createMonetizationRepository(db, {
    now: () => NOW,
    nextId: (prefix: string) => `${prefix}-${tag}-${++seq}`,
    userId,
  });
}

describe("monetization repository (integration, user-scoped)", () => {
  let db: Db;
  beforeEach(async () => {
    ({ db } = await createDb());
  });

  it("products round-trip with status default + nullable label columns", async () => {
    const repo = repoFor(db, "user-a");
    const row = await repo.createProduct({
      name: "AI 工程训练营",
      kind: "训练营",
    });
    expect(row.userId).toBe("user-a");
    expect(row.name).toBe("AI 工程训练营");
    expect(row.kind).toBe("训练营");
    expect(row.tier).toBeNull();
    expect(row.deliveryWeight).toBeNull();
    expect(row.targetPersona).toBeNull();
    expect(row.status).toBe("active");
    expect(row.createdAt).toBe(NOW);
    expect(row.updatedAt).toBe(NOW);
  });

  it("leads round-trip with attributedContentId null by design + status default new", async () => {
    const repo = repoFor(db, "user-a");
    const lead = await repo.createLead({ source: "manual" });
    expect(lead.userId).toBe("user-a");
    expect(lead.source).toBe("manual");
    expect(lead.attributedContentId).toBeNull();
    expect(lead.attributionMethod).toBeNull();
    expect(lead.attributionConfidence).toBeNull();
    expect(lead.status).toBe("new");
    expect(lead.ingestionRunId).toBeNull();
  });

  it("conversionEvents round-trip snapshotting offerId + value + currency", async () => {
    const repo = repoFor(db, "user-a");
    const lead = await repo.createLead({ source: "manual" });
    const conv = await repo.createConversion(lead.id, {
      eventType: "purchase",
      offerId: "offer-x",
      value: 1999,
      currency: "CNY",
      occurredAt: NOW,
    });
    expect(conv.leadId).toBe(lead.id);
    expect(conv.offerId).toBe("offer-x");
    expect(conv.value).toBe(1999);
    expect(conv.currency).toBe("CNY");
    expect(conv.eventType).toBe("purchase");
  });

  it("contentOutputProducts round-trip with nullable contentRole", async () => {
    const repo = repoFor(db, "user-a");
    const link = await repo.linkOutputProduct("out-1", "prod-1", {});
    expect(link.userId).toBe("user-a");
    expect(link.contentOutputId).toBe("out-1");
    expect(link.productId).toBe("prod-1");
    expect(link.contentRole).toBeNull();
  });

  it("ownership: user B cannot read user A's product (OwnershipError, 404-safe)", async () => {
    const repoA = repoFor(db, "user-a");
    const product = await repoA.createProduct({ name: "p", kind: "k" });
    const repoB = repoFor(db, "user-b");
    await expect(repoB.getProduct(product.id)).rejects.toBeInstanceOf(
      OwnershipError,
    );
  });

  it("ownership: user B cannot read user A's lead (OwnershipError)", async () => {
    const repoA = repoFor(db, "user-a");
    const lead = await repoA.createLead({ source: "manual" });
    const repoB = repoFor(db, "user-b");
    await expect(repoB.getLead(lead.id)).rejects.toBeInstanceOf(OwnershipError);
  });

  it("createOffer increments version 1 → 2 → 3 (append-only, re-price never mutates)", async () => {
    const repo = repoFor(db, "user-a");
    const product = await repo.createProduct({ name: "p", kind: "k" });
    const o1 = await repo.createOffer(product.id, { price: 99 });
    const o2 = await repo.createOffer(product.id, { price: 149 });
    const o3 = await repo.createOffer(product.id, { price: 199 });
    expect([o1.version, o2.version, o3.version]).toEqual([1, 2, 3]);
    expect([o1.price, o2.price, o3.price]).toEqual([99, 149, 199]);
    // The old offer row is unchanged after the re-price.
    const offers = await repo.listOffersByProduct(product.id);
    expect(offers.find((o) => o.id === o1.id)!.price).toBe(99);
  });

  it("a retired product's old offers stay readable", async () => {
    const repo = repoFor(db, "user-a");
    const product = await repo.createProduct({ name: "p", kind: "k" });
    await repo.createOffer(product.id, { price: 99 });
    await repo.retireProduct(product.id);
    const offers = await repo.listOffersByProduct(product.id);
    expect(offers).toHaveLength(1);
    expect(offers[0]!.price).toBe(99);
  });

  it("listLeads filters by status/source, user-scoped, newest-first, paginated", async () => {
    const repoA = repoFor(db, "user-a");
    await repoA.createLead({ source: "manual", status: "new" });
    await repoA.createLead({ source: "survey", status: "qualified" });
    const repoB = repoFor(db, "user-b");
    await repoB.createLead({ source: "manual" });

    const all = await repoA.listLeads({ limit: 10, offset: 0 });
    expect(all.total).toBe(2); // user A only

    const surveys = await repoA.listLeads({
      source: "survey",
      limit: 10,
      offset: 0,
    });
    expect(surveys.rows).toHaveLength(1);
    expect(surveys.rows[0]!.source).toBe("survey");

    const qualified = await repoA.listLeads({
      status: "qualified",
      limit: 10,
      offset: 0,
    });
    expect(qualified.rows).toHaveLength(1);
    expect(qualified.rows[0]!.status).toBe("qualified");
  });

  it("linkOutputProduct twice for the same (output, product) throws ConflictError", async () => {
    const repo = repoFor(db, "user-a");
    await repo.linkOutputProduct("out-1", "prod-1", {});
    await expect(
      repo.linkOutputProduct("out-1", "prod-1", {}),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("unlinkOutputProduct removes only the scoped row", async () => {
    const repoA = repoFor(db, "user-a");
    await repoA.linkOutputProduct("out-1", "prod-1", {});
    const repoB = repoFor(db, "user-b");
    await repoB.linkOutputProduct("out-1", "prod-1", {});

    await repoA.unlinkOutputProduct("out-1", "prod-1");
    expect(await repoA.listProductsByOutput("out-1")).toHaveLength(0);
    // user B's link survived (scoped delete).
    expect(await repoB.listProductsByOutput("out-1")).toHaveLength(1);
  });

  it("listConversionsForFunnel returns only the owning user's events, respects productId + period", async () => {
    const repoA = repoFor(db, "user-a");
    const leadA = await repoA.createLead({
      source: "manual",
      attributedContentId: "out-1",
      attributionConfidence: "high",
    });
    await repoA.createConversion(leadA.id, {
      eventType: "purchase",
      productId: "prod-1",
      value: 500,
      occurredAt: "2026-06-21T10:00:00.000Z",
    });
    await repoA.createConversion(leadA.id, {
      eventType: "purchase",
      productId: "prod-2",
      value: 300,
      occurredAt: "2026-06-25T10:00:00.000Z",
    });
    const repoB = repoFor(db, "user-b");
    const leadB = await repoB.createLead({ source: "manual" });
    await repoB.createConversion(leadB.id, {
      eventType: "purchase",
      occurredAt: "2026-06-21T10:00:00.000Z",
    });

    const all = await repoA.listConversionsForFunnel({});
    expect(all).toHaveLength(2); // user A only

    const filtered = await repoA.listConversionsForFunnel({
      productId: "prod-1",
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.conversion.productId).toBe("prod-1");
    expect(filtered[0]!.attributedContentId).toBe("out-1");
    expect(filtered[0]!.attributionConfidence).toBe("high");

    const period = await repoA.listConversionsForFunnel({
      periodStart: "2026-06-20T00:00:00.000Z",
      periodEnd: "2026-06-22T00:00:00.000Z",
    });
    expect(period).toHaveLength(1);
    expect(period[0]!.conversion.productId).toBe("prod-1");
  });

  it("findLeadByIngestionKey looks up by (run, record_key), user-scoped", async () => {
    const repo = repoFor(db, "user-a");
    await repo.createLead({
      source: "survey",
      ingestionRunId: "run-1",
      recordKey: "rec-1",
    });
    const found = await repo.findLeadByIngestionKey("run-1", "rec-1");
    expect(found).toBeDefined();
    const miss = await repo.findLeadByIngestionKey("run-1", "rec-X");
    expect(miss).toBeUndefined();
  });
});
