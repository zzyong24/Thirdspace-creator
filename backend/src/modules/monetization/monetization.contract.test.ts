import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import {
  ENDPOINTS,
  type Endpoint,
  type RequestContext,
  type Transport,
} from "@creatoros/contract";
import { createMonetizationService } from "./monetization.service";
import { createMonetizationTransport } from "./monetization.transport";

// Monetization contract test (Step 4) — for EACH of the 18 op ids, drive the transport
// with a seeded ctx + valid input and assert the op's contract response DTO
// .parse(envelope.data) succeeds (the output validates against the wire shape;
// per-item for the isList reads). Includes a monetization.funnel.get happy path whose
// DTO carries the unattributed bucket + unattributedRatio. Mirrors the positioning
// contract test.

const NOW = "2026-06-21T00:00:00.000Z";
const ctx: RequestContext = { userId: "user-a", requestId: "r1", source: "user" };

const ep = (id: string) => ({ id }) as unknown as Endpoint;
async function call(
  transport: Transport,
  id: string,
  input: unknown,
  rctx?: RequestContext,
): Promise<{ data: unknown }> {
  const res = await transport.request(ep(id), input as never, rctx);
  return res as { data: unknown };
}

function makeTransport(db: Db) {
  let seq = 0;
  const service = createMonetizationService({
    db,
    now: () => NOW,
    nextId: (prefix: string) => `${prefix}-${++seq}`,
    projects: { assertOutputOwned: async () => {} },
    ingestion: { assertRunExists: async () => {} },
    analytics: { recordConversionMetric: async () => {} },
    search: { indexProduct: async () => {} },
    notifications: { notifyConversion: async () => {} },
  });
  return createMonetizationTransport(() => service);
}

async function seedProduct(transport: Transport): Promise<string> {
  const created = await call(
    transport,
    "products.create",
    { body: { name: "训练营", kind: "course" } },
    ctx,
  );
  return (created.data as { id: string }).id;
}

async function seedLead(transport: Transport): Promise<string> {
  const created = await call(
    transport,
    "leads.create",
    { body: { source: "manual" } },
    ctx,
  );
  return (created.data as { id: string }).id;
}

describe("monetization contract (each of 18 ops validates against its DTO)", () => {
  let db: Db;
  beforeEach(async () => {
    ({ db } = await createDb());
  });

  it("products.create → productResource", async () => {
    const t = makeTransport(db);
    const env = await call(
      t,
      "products.create",
      { body: { name: "p", kind: "k" } },
      ctx,
    );
    const parsed = ENDPOINTS.createProduct.response.parse(env.data);
    expect(parsed.userId).toBe("user-a");
    expect(parsed.status).toBe("active");
  });

  it("products.list → productResource[] (each item validates)", async () => {
    const t = makeTransport(db);
    await seedProduct(t);
    const env = await call(t, "products.list", { query: {} }, ctx);
    const items = (env.data as unknown[]) ?? [];
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) ENDPOINTS.listProducts.response.parse(item);
  });

  it("products.get → productResource", async () => {
    const t = makeTransport(db);
    const id = await seedProduct(t);
    const env = await call(t, "products.get", { params: { productId: id } }, ctx);
    const parsed = ENDPOINTS.getProduct.response.parse(env.data);
    expect(parsed.id).toBe(id);
  });

  it("products.patch → productResource", async () => {
    const t = makeTransport(db);
    const id = await seedProduct(t);
    const env = await call(
      t,
      "products.patch",
      { params: { productId: id }, body: { name: "renamed" } },
      ctx,
    );
    const parsed = ENDPOINTS.patchProduct.response.parse(env.data);
    expect(parsed.name).toBe("renamed");
  });

  it("products.retire → productResource (status retired)", async () => {
    const t = makeTransport(db);
    const id = await seedProduct(t);
    const env = await call(
      t,
      "products.retire",
      { params: { productId: id } },
      ctx,
    );
    const parsed = ENDPOINTS.retireProduct.response.parse(env.data);
    expect(parsed.status).toBe("retired");
  });

  it("products.offers.create → offerResource (version 1)", async () => {
    const t = makeTransport(db);
    const id = await seedProduct(t);
    const env = await call(
      t,
      "products.offers.create",
      { params: { productId: id }, body: { price: 99 } },
      ctx,
    );
    const parsed = ENDPOINTS.createOffer.response.parse(env.data);
    expect(parsed.version).toBe(1);
    expect(parsed.price).toBe(99);
  });

  it("products.offers.list → offerResource[]", async () => {
    const t = makeTransport(db);
    const id = await seedProduct(t);
    await call(
      t,
      "products.offers.create",
      { params: { productId: id }, body: { price: 99 } },
      ctx,
    );
    const env = await call(
      t,
      "products.offers.list",
      { params: { productId: id } },
      ctx,
    );
    const items = (env.data as unknown[]) ?? [];
    expect(items.length).toBe(1);
    for (const item of items) ENDPOINTS.listOffers.response.parse(item);
  });

  it("outputs.products.link → contentOutputProductResource", async () => {
    const t = makeTransport(db);
    const id = await seedProduct(t);
    const env = await call(
      t,
      "outputs.products.link",
      { params: { outputId: "out-1" }, body: { productId: id, contentRole: "conversion" } },
      ctx,
    );
    const parsed = ENDPOINTS.linkOutputProduct.response.parse(env.data);
    expect(parsed.contentOutputId).toBe("out-1");
    expect(parsed.contentRole).toBe("conversion");
  });

  it("outputs.products.list → contentOutputProductResource[]", async () => {
    const t = makeTransport(db);
    const id = await seedProduct(t);
    await call(
      t,
      "outputs.products.link",
      { params: { outputId: "out-1" }, body: { productId: id } },
      ctx,
    );
    const env = await call(
      t,
      "outputs.products.list",
      { params: { outputId: "out-1" } },
      ctx,
    );
    const items = (env.data as unknown[]) ?? [];
    expect(items.length).toBe(1);
    for (const item of items) ENDPOINTS.listOutputProducts.response.parse(item);
  });

  it("outputs.products.unlink → { ok: true }", async () => {
    const t = makeTransport(db);
    const id = await seedProduct(t);
    await call(
      t,
      "outputs.products.link",
      { params: { outputId: "out-1" }, body: { productId: id } },
      ctx,
    );
    const env = await call(
      t,
      "outputs.products.unlink",
      { params: { outputId: "out-1", productId: id } },
      ctx,
    );
    const parsed = ENDPOINTS.unlinkOutputProduct.response.parse(env.data);
    expect(parsed.ok).toBe(true);
  });

  it("leads.create → leadResource", async () => {
    const t = makeTransport(db);
    const env = await call(
      t,
      "leads.create",
      { body: { source: "manual" } },
      ctx,
    );
    const parsed = ENDPOINTS.createLead.response.parse(env.data);
    expect(parsed.status).toBe("new");
    expect(parsed.attributedContentId).toBeNull();
  });

  it("leads.list → leadResource[]", async () => {
    const t = makeTransport(db);
    await seedLead(t);
    const env = await call(t, "leads.list", { query: {} }, ctx);
    const items = (env.data as unknown[]) ?? [];
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) ENDPOINTS.listLeads.response.parse(item);
  });

  it("leads.get → leadResource", async () => {
    const t = makeTransport(db);
    const id = await seedLead(t);
    const env = await call(t, "leads.get", { params: { leadId: id } }, ctx);
    const parsed = ENDPOINTS.getLead.response.parse(env.data);
    expect(parsed.id).toBe(id);
  });

  it("leads.patch → leadResource (status flow)", async () => {
    const t = makeTransport(db);
    const id = await seedLead(t);
    const env = await call(
      t,
      "leads.patch",
      { params: { leadId: id }, body: { status: "qualified" } },
      ctx,
    );
    const parsed = ENDPOINTS.patchLead.response.parse(env.data);
    expect(parsed.status).toBe("qualified");
  });

  it("leads.conversions.create → conversionEventResource", async () => {
    const t = makeTransport(db);
    const id = await seedLead(t);
    const env = await call(
      t,
      "leads.conversions.create",
      { params: { leadId: id }, body: { eventType: "purchase", value: 199 } },
      ctx,
    );
    const parsed = ENDPOINTS.createConversion.response.parse(env.data);
    expect(parsed.eventType).toBe("purchase");
    expect(parsed.value).toBe(199);
  });

  it("leads.conversions.list → conversionEventResource[]", async () => {
    const t = makeTransport(db);
    const id = await seedLead(t);
    await call(
      t,
      "leads.conversions.create",
      { params: { leadId: id }, body: { eventType: "lead" } },
      ctx,
    );
    const env = await call(
      t,
      "leads.conversions.list",
      { params: { leadId: id } },
      ctx,
    );
    const items = (env.data as unknown[]) ?? [];
    expect(items.length).toBe(1);
    for (const item of items) ENDPOINTS.listConversions.response.parse(item);
  });

  it("monetization.funnel.get → monetizationFunnelResource (carries unattributed bucket + ratio)", async () => {
    const t = makeTransport(db);
    const id = await seedLead(t);
    await call(
      t,
      "leads.conversions.create",
      { params: { leadId: id }, body: { eventType: "purchase", value: 500 } },
      ctx,
    );
    const env = await call(t, "monetization.funnel.get", { query: {} }, ctx);
    const parsed = ENDPOINTS.getFunnel.response.parse(env.data);
    expect(parsed.unattributed).toBeDefined();
    expect(typeof parsed.unattributedRatio).toBe("number");
    // The lead is unattributed → its revenue lands in the honest bucket.
    expect(parsed.unattributed.revenue).toBe(500);
    expect(parsed.revenueAttributed).toBe(0);
  });

  it("monetization.funnel.byOutput → funnelStageResource[]", async () => {
    const t = makeTransport(db);
    const env = await call(
      t,
      "monetization.funnel.byOutput",
      { params: { outputId: "out-1" } },
      ctx,
    );
    const items = (env.data as unknown[]) ?? [];
    expect(items.length).toBeGreaterThan(0); // one entry per stage
    for (const item of items) ENDPOINTS.getFunnelByOutput.response.parse(item);
  });

  it("no ctx → AuthenticationError", async () => {
    const t = makeTransport(db);
    await expect(call(t, "products.list", { query: {} })).rejects.toThrow();
  });
});
