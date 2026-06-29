import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createDb, type Db } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import {
  createMonetizationService,
  type MonetizationService,
} from "./monetization.service";
import { OwnershipError, ValidationError } from "./monetization.errors";

// Step 6 — SPEC §22 + spec §C-2/§C-3/§C-4 acceptance for the Monetization module
// (G18). Asserts the structural + domain invariants the plan's acceptance checklist
// calls out:
//   - foundation §5 module layout present (service + repository + schema + tests);
//   - NO cross-module repository import (peer access only via index.ts services);
//   - C-3: no parallel candidate state machine (no submit_* op / second候选 status);
//   - C-4: metric回收 reuses Ingestion run + idempotency — ingestSurveyLeads rejects
//     悬空 ingestionRunId, idempotent on (run, record_key), no parallel write path;
//   - price decoupled from Product (re-price = new Offer, immutable history);
//   - funnel always honest (mandatory unattributed bucket, never force-allocated);
//   - multi-tenant: user A cannot get user B's product/lead/conversion;
//   - spec §9 q6 answerable (getFunnelForOutput + ContentOutputProduct).

const HERE = dirname(fileURLToPath(import.meta.url));

const NOW = "2026-06-21T00:00:00.000Z";
const ctxA: RequestContext = { userId: "user-a", requestId: "ra", source: "user" };
const ctxB: RequestContext = { userId: "user-b", requestId: "rb", source: "user" };

function makeService(db: Db, tag = "a"): MonetizationService {
  let seq = 0;
  return createMonetizationService({
    db,
    now: () => NOW,
    nextId: (prefix: string) => `${prefix}-${tag}-${++seq}`,
    projects: { assertOutputOwned: async () => {} },
    ingestion: { assertRunExists: async () => {} },
    analytics: { recordConversionMetric: async () => {} },
    search: { indexProduct: async () => {} },
    notifications: { notifyConversion: async () => {} },
  });
}

describe("G18 — module-structure acceptance", () => {
  it("has the foundation §5 layout files", () => {
    const required = [
      "monetization.db-schema.ts",
      "monetization.repository.ts",
      "monetization.service.ts",
      "monetization.schema.ts",
      "monetization.transport.ts",
      "monetization.errors.ts",
      "index.ts",
      "monetization.repository.integration.test.ts",
      "monetization.service.test.ts",
      "monetization.contract.test.ts",
    ];
    for (const file of required) {
      expect(existsSync(join(HERE, file)), `missing ${file}`).toBe(true);
    }
  });

  it("has NO cross-module repository import in any module file", () => {
    for (const f of readdirSync(HERE)) {
      if (!f.endsWith(".ts")) continue;
      const src = readFileSync(join(HERE, f), "utf8");
      // No deep import of ANOTHER module's repository/service internals.
      const crossModuleRepo =
        /from\s+["']@\/server\/modules\/(?!monetization)[^"']*(repository|service)/.test(
          src,
        );
      expect(crossModuleRepo, `cross-module repo/service import in ${f}`).toBe(
        false,
      );
    }
  });

  it("C-3: has NO AI-write / submit_* op (reuses the existing candidate flow)", () => {
    const transport = readFileSync(
      join(HERE, "monetization.transport.ts"),
      "utf8",
    );
    expect(/submit_candidate|submit_/.test(transport)).toBe(false);
    expect(/awaiting_confirmation/.test(transport)).toBe(false);
  });
});

describe("G18 — domain acceptance (SPEC §22 + spec §4 + §9 q6)", () => {
  let db: Db;
  beforeEach(async () => {
    ({ db } = await createDb());
  });

  it("price decoupled: patchProduct rejects price; re-price = new Offer with immutable history", async () => {
    const svc = makeService(db);
    const p = await svc.createProduct(ctxA, { name: "p", kind: "k" });
    await expect(
      svc.patchProduct(ctxA, p.id, { price: 9 } as never),
    ).rejects.toBeInstanceOf(ValidationError);
    const o1 = await svc.createOffer(ctxA, p.id, { price: 99 });
    const lead = await svc.createLead(ctxA, { source: "manual" });
    const conv = await svc.createConversion(ctxA, lead.id, {
      eventType: "purchase",
      offerId: o1.id,
    });
    await svc.createOffer(ctxA, p.id, { price: 149 }); // re-price → new row
    const conversions = await svc.listConversions(ctxA, lead.id);
    expect(conversions[0]!.value).toBe(99); // snapshot unchanged
    expect(conv.value).toBe(99);
  });

  it("C-4: ingestSurveyLeads rejects 悬空 runId + is idempotent on (run, record_key); no parallel write path", async () => {
    // A service whose ingestion port REJECTS the run id (悬空) → ValidationError.
    let seq = 0;
    const dangling = createMonetizationService({
      db,
      now: () => NOW,
      nextId: (prefix: string) => `${prefix}-x-${++seq}`,
      projects: { assertOutputOwned: async () => {} },
      ingestion: {
        assertRunExists: async () => {
          throw new ValidationError("ValidationError: run not found");
        },
      },
      analytics: { recordConversionMetric: async () => {} },
      search: { indexProduct: async () => {} },
      notifications: { notifyConversion: async () => {} },
    });
    await expect(
      dangling.ingestSurveyLeads(ctxA, "run-x", [{ recordKey: "r1" }]),
    ).rejects.toBeInstanceOf(ValidationError);

    const svc = makeService(db);
    const records = [{ recordKey: "r1" }, { recordKey: "r2" }];
    expect((await svc.ingestSurveyLeads(ctxA, "run-1", records)).created).toBe(2);
    const second = await svc.ingestSurveyLeads(ctxA, "run-1", records);
    expect(second.created).toBe(0);
    expect(second.skipped).toBe(2);
  });

  it("funnel always honest: mandatory unattributed bucket, never force-allocated", async () => {
    const svc = makeService(db);
    const lead = await svc.createLead(ctxA, { source: "manual" }); // unattributed
    await svc.createConversion(ctxA, lead.id, {
      eventType: "purchase",
      value: 200,
    });
    const funnel = await svc.getFunnel(ctxA, {});
    expect(funnel.unattributed).toBeDefined();
    expect(funnel.revenueAttributed).toBe(0);
    expect(funnel.unattributed.revenue).toBe(200);
    expect(funnel.unattributedRatio).toBe(1);
  });

  it("multi-tenant: user A cannot get user B's product or lead (404-safe OwnershipError)", async () => {
    const svcA = makeService(db, "a");
    const svcB = makeService(db, "b");
    const product = await svcA.createProduct(ctxA, { name: "p", kind: "k" });
    const lead = await svcA.createLead(ctxA, { source: "manual" });
    await expect(svcB.getProduct(ctxB, product.id)).rejects.toBeInstanceOf(
      OwnershipError,
    );
    await expect(svcB.getLead(ctxB, lead.id)).rejects.toBeInstanceOf(
      OwnershipError,
    );
  });

  it("spec §9 q6: getFunnelForOutput + ContentOutputProduct answer 哪条内容带来线索/为哪个产品铺路", async () => {
    const svc = makeService(db);
    const product = await svc.createProduct(ctxA, { name: "p", kind: "k" });
    // 意图层: this content铺路 the product.
    const link = await svc.linkOutputProduct(ctxA, "out-1", {
      productId: product.id,
      contentRole: "conversion",
    });
    expect(link.contentOutputId).toBe("out-1");
    // 实绩层: a lead attributed to that content converts.
    const lead = await svc.createLead(ctxA, {
      source: "manual",
      attributedContentId: "out-1",
      attributionConfidence: "high",
    });
    await svc.createConversion(ctxA, lead.id, { eventType: "purchase", value: 1 });
    const stages = await svc.getFunnelForOutput(ctxA, "out-1");
    expect(stages.find((s) => s.stage === "purchase")!.count).toBe(1);
  });

  it("C-2: conversion fan-out reaches Analytics + Notifications via injected ports only (full op → service path)", async () => {
    const analytics = vi.fn(async () => {});
    const notifications = vi.fn(async () => {});
    let seq = 0;
    const svc = createMonetizationService({
      db,
      now: () => NOW,
      nextId: (prefix: string) => `${prefix}-c2-${++seq}`,
      projects: { assertOutputOwned: async () => {} },
      ingestion: { assertRunExists: async () => {} },
      analytics: { recordConversionMetric: analytics },
      search: { indexProduct: async () => {} },
      notifications: { notifyConversion: notifications },
    });
    const lead = await svc.createLead(ctxA, { source: "manual" });
    await svc.createConversion(ctxA, lead.id, {
      eventType: "purchase",
      value: 10,
    });
    expect(analytics).toHaveBeenCalledTimes(1);
    expect(notifications).toHaveBeenCalledTimes(1);
  });
});
