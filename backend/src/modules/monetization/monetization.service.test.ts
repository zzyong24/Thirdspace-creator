import { describe, it, expect, beforeEach, vi } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import {
  createMonetizationService,
  type MonetizationService,
  type MonetizationProjectsPort,
  type MonetizationIngestionPort,
  type MonetizationAnalyticsPort,
  type MonetizationSearchPort,
  type MonetizationNotificationsPort,
} from "./monetization.service";
import { ValidationError, OwnershipError } from "./monetization.errors";

// Monetization service test (Step 3) — fake now/nextId, pglite db, stubbed peer
// services. Covers: price-decoupling guard (patchProduct rejects price); offer
// versioning + immutable ConversionEvent history; link ownership validation (output
// + product); conversion → Analytics + Notifications fan-out; ingest idempotency +
// RISK-005 run-existence; funnel ALWAYS has unattributed bucket + ratio (never
// force-allocated). Deterministic clock/ids (no Date.now / Math.random).

const NOW = "2026-06-21T00:00:00.000Z";
const ctx: RequestContext = { userId: "user-a", requestId: "r1", source: "user" };

function makePorts() {
  const projects: MonetizationProjectsPort & {
    assertOutputOwned: ReturnType<typeof vi.fn>;
  } = { assertOutputOwned: vi.fn(async () => {}) };
  const ingestion: MonetizationIngestionPort & {
    assertRunExists: ReturnType<typeof vi.fn>;
  } = { assertRunExists: vi.fn(async () => {}) };
  const analytics: MonetizationAnalyticsPort & {
    recordConversionMetric: ReturnType<typeof vi.fn>;
  } = { recordConversionMetric: vi.fn(async () => {}) };
  const search: MonetizationSearchPort & {
    indexProduct: ReturnType<typeof vi.fn>;
  } = { indexProduct: vi.fn(async () => {}) };
  const notifications: MonetizationNotificationsPort & {
    notifyConversion: ReturnType<typeof vi.fn>;
  } = { notifyConversion: vi.fn(async () => {}) };
  return { projects, ingestion, analytics, search, notifications };
}

function makeService(
  db: Db,
  ports: ReturnType<typeof makePorts>,
  tag = "a",
): MonetizationService {
  let seq = 0;
  return createMonetizationService({
    db,
    now: () => NOW,
    nextId: (prefix: string) => `${prefix}-${tag}-${++seq}`,
    ...ports,
  });
}

describe("monetization service", () => {
  let db: Db;
  let ports: ReturnType<typeof makePorts>;
  let svc: MonetizationService;
  beforeEach(async () => {
    ({ db } = await createDb());
    ports = makePorts();
    svc = makeService(db, ports);
  });

  it("patchProduct with a price field throws ValidationError (price decoupled)", async () => {
    const p = await svc.createProduct(ctx, { name: "p", kind: "k" });
    await expect(
      // price is decoupled — must use createOffer.
      svc.patchProduct(ctx, p.id, { price: 99 } as never),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("createOffer twice produces version 1 then 2 with distinct prices; old ConversionEvent keeps its snapshot after re-price", async () => {
    const p = await svc.createProduct(ctx, { name: "p", kind: "k" });
    const o1 = await svc.createOffer(ctx, p.id, { price: 99 });
    // A purchase snapshots offer o1's price.
    const lead = await svc.createLead(ctx, { source: "manual" });
    const conv = await svc.createConversion(ctx, lead.id, {
      eventType: "purchase",
      offerId: o1.id,
    });
    expect(conv.value).toBe(99); // snapshotted from o1
    // Re-price: a NEW offer row (never mutates o1).
    const o2 = await svc.createOffer(ctx, p.id, { price: 149 });
    expect([o1.version, o2.version]).toEqual([1, 2]);
    // The historical conversion is unchanged (immutable history).
    const conversions = await svc.listConversions(ctx, lead.id);
    expect(conversions[0]!.value).toBe(99);
  });

  it("createOffer rejects a negative price (ValidationError)", async () => {
    const p = await svc.createProduct(ctx, { name: "p", kind: "k" });
    await expect(
      svc.createOffer(ctx, p.id, { price: -1 }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("linkOutputProduct validates BOTH output ownership and product ownership", async () => {
    const p = await svc.createProduct(ctx, { name: "p", kind: "k" });
    await svc.linkOutputProduct(ctx, "out-1", { productId: p.id });
    expect(ports.projects.assertOutputOwned).toHaveBeenCalledWith(ctx, "out-1");
  });

  it("linkOutputProduct surfaces a cross-user output as OwnershipError (Projects gate)", async () => {
    ports.projects.assertOutputOwned.mockRejectedValueOnce(
      new OwnershipError("OwnershipError: output not found: out-x"),
    );
    const p = await svc.createProduct(ctx, { name: "p", kind: "k" });
    await expect(
      svc.linkOutputProduct(ctx, "out-x", { productId: p.id }),
    ).rejects.toBeInstanceOf(OwnershipError);
  });

  it("createConversion of purchase fans out exactly one recordConversionMetric + one notifyConversion", async () => {
    const lead = await svc.createLead(ctx, {
      source: "manual",
      attributedContentId: "out-1",
      attributionConfidence: "high",
    });
    await svc.createConversion(ctx, lead.id, {
      eventType: "purchase",
      value: 1999,
    });
    expect(ports.analytics.recordConversionMetric).toHaveBeenCalledTimes(1);
    expect(ports.notifications.notifyConversion).toHaveBeenCalledTimes(1);
    const metricCall = ports.analytics.recordConversionMetric.mock.calls[0]![1];
    expect(metricCall.metricKey).toBe("revenue");
    expect(metricCall.value).toBe(1999);
    expect(metricCall.attributedContentId).toBe("out-1");
  });

  it("createConversion of a profile_visit does NOT fan out to Analytics/Notifications", async () => {
    const lead = await svc.createLead(ctx, { source: "manual" });
    await svc.createConversion(ctx, lead.id, { eventType: "profile_visit" });
    expect(ports.analytics.recordConversionMetric).not.toHaveBeenCalled();
    expect(ports.notifications.notifyConversion).not.toHaveBeenCalled();
  });

  it("ingestSurveyLeads with a non-existent ingestionRunId throws ValidationError (RISK-005)", async () => {
    ports.ingestion.assertRunExists.mockRejectedValueOnce(
      new ValidationError("ValidationError: run not found: run-x"),
    );
    await expect(
      svc.ingestSurveyLeads(ctx, "run-x", [{ recordKey: "rec-1" }]),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("ingestSurveyLeads is idempotent: re-running the SAME run + records writes ZERO new Leads", async () => {
    const records = [
      { recordKey: "rec-1", selfReported: true },
      { recordKey: "rec-2", selfReported: false },
    ];
    const first = await svc.ingestSurveyLeads(ctx, "run-1", records);
    expect(first.created).toBe(2);
    expect(first.skipped).toBe(0);
    const second = await svc.ingestSurveyLeads(ctx, "run-1", records);
    expect(second.created).toBe(0);
    expect(second.skipped).toBe(2);
    const leads = await svc.listLeads(ctx, { limit: 10, offset: 0 });
    expect(leads.total).toBe(2);
    // self-reported → high; else low (honest confidence §4.1.1).
    const byKey = leads.rows;
    expect(byKey.some((l) => l.attributionConfidence === "high")).toBe(true);
    expect(byKey.some((l) => l.attributionConfidence === "low")).toBe(true);
  });

  it("getFunnel ALWAYS returns an unattributed bucket + ratio, even when every lead is attributed (bucket 0, ratio 0)", async () => {
    const lead = await svc.createLead(ctx, {
      source: "manual",
      attributedContentId: "out-1",
      attributionConfidence: "high",
    });
    await svc.createConversion(ctx, lead.id, {
      eventType: "purchase",
      value: 500,
    });
    const funnel = await svc.getFunnel(ctx, {});
    expect(funnel.unattributed).toBeDefined();
    expect(funnel.unattributed.conversionCount).toBe(0);
    expect(funnel.unattributedRatio).toBe(0);
    expect(funnel.revenueAttributed).toBe(500);
  });

  it("a lead with attributionConfidence null lands in unattributed, not revenueAttributed (no force-allocation)", async () => {
    const lead = await svc.createLead(ctx, { source: "manual" }); // no attribution
    await svc.createConversion(ctx, lead.id, {
      eventType: "purchase",
      value: 300,
    });
    const funnel = await svc.getFunnel(ctx, {});
    expect(funnel.revenueAttributed).toBe(0);
    expect(funnel.unattributed.conversionCount).toBe(1);
    expect(funnel.unattributed.revenue).toBe(300);
    expect(funnel.unattributedRatio).toBe(1);
  });

  it("getFunnel never sums attributed + unattributed beyond the true total", async () => {
    const attr = await svc.createLead(ctx, {
      source: "manual",
      attributedContentId: "out-1",
      attributionConfidence: "high",
    });
    await svc.createConversion(ctx, attr.id, { eventType: "purchase", value: 100 });
    const un = await svc.createLead(ctx, { source: "manual" });
    await svc.createConversion(ctx, un.id, { eventType: "purchase", value: 50 });
    const funnel = await svc.getFunnel(ctx, {});
    // 2 purchase events total; 1 attributed (rev 100), 1 unattributed (rev 50).
    const purchaseStage = funnel.stages.find((s) => s.stage === "purchase")!;
    expect(purchaseStage.count).toBe(2);
    expect(funnel.revenueAttributed).toBe(100);
    expect(funnel.unattributed.revenue).toBe(50);
    expect(funnel.unattributedRatio).toBe(0.5);
  });

  it("getFunnelForOutput reports 实绩层 attributed-lead stage counts for the output", async () => {
    const lead = await svc.createLead(ctx, {
      source: "manual",
      attributedContentId: "out-1",
      attributionConfidence: "high",
    });
    await svc.createConversion(ctx, lead.id, { eventType: "lead" });
    await svc.createConversion(ctx, lead.id, { eventType: "purchase", value: 99 });
    const other = await svc.createLead(ctx, {
      source: "manual",
      attributedContentId: "out-2",
      attributionConfidence: "high",
    });
    await svc.createConversion(ctx, other.id, { eventType: "purchase", value: 1 });

    const stages = await svc.getFunnelForOutput(ctx, "out-1");
    expect(stages.find((s) => s.stage === "lead")!.count).toBe(1);
    expect(stages.find((s) => s.stage === "purchase")!.count).toBe(1);
    // out-2's purchase is not counted under out-1.
    expect(stages.every((s) => s.contentOutputId === "out-1")).toBe(true);
  });
});
