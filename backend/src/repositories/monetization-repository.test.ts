import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "../db";
import {
  createMonetizationRepository,
  type MonetizationRepository,
  type RepoDeps,
} from "./monetization-repository";

const FIXED_NOW = "2026-06-22T10:00:00+08:00";

// Deterministic deps; ids are namespaced per userId so two users' rows never
// collide on the shared (PK) id space within one pglite db.
function deterministicDeps(userId: string): RepoDeps {
  const counters = new Map<string, number>();
  return {
    now: () => FIXED_NOW,
    nextId: (prefix: string) => {
      const n = (counters.get(prefix) ?? 0) + 1;
      counters.set(prefix, n);
      return `${prefix}-${userId}-${n}`;
    },
    userId,
  };
}

let db: Db;
let repo: MonetizationRepository;

beforeEach(async () => {
  ({ db } = await createDb()); // fresh in-memory pglite per test
  repo = createMonetizationRepository(db, deterministicDeps("user-1"));
});

describe("MonetizationRepository (pglite-backed real persistence)", () => {
  it("creates a product and reads it back from SQL (create -> get -> list)", async () => {
    const created = await repo.createProduct({
      name: "陪跑训练营",
      kind: "course",
      tier: "核心",
    });
    expect(created.id).toBe("product-user-1-1");
    expect(created.status).toBe("active");
    expect(created.tier).toBe("核心");

    const fetched = await repo.getProduct("product-user-1-1");
    expect(fetched.name).toBe("陪跑训练营");

    const list = await repo.listProducts();
    expect(list.map((p) => p.id)).toContain("product-user-1-1");
  });

  it("throws OwnershipError-style not-found for a missing product", async () => {
    await expect(repo.getProduct("nope")).rejects.toThrow(/not found/);
  });

  it("KEY INVARIANT: offers are append-only versioned (1, 2, 3 …) and never mutate", async () => {
    const product = await repo.createProduct({ name: "P", kind: "service" });

    const v1 = await repo.createOffer(product.id, { price: 99 });
    expect(v1.version).toBe(1);
    expect(v1.price).toBe(99);

    // A re-price = a NEW offer row with version+1; v1 is untouched.
    const v2 = await repo.createOffer(product.id, { price: 199 });
    expect(v2.version).toBe(2);

    const v3 = await repo.createOffer(product.id, {
      price: 299,
      currency: "USD",
      note: "promo",
    });
    expect(v3.version).toBe(3);

    const all = await repo.listOffers(product.id);
    expect(all.map((o) => o.version)).toEqual([1, 2, 3]);
    // the original v1 row is unchanged (append-only, not overwritten)
    expect(all.find((o) => o.version === 1)!.price).toBe(99);
  });

  it("conversion events are idempotent via the UNIQUE dedup guard", async () => {
    const lead = await repo.createLead({ source: "survey" });
    const first = await repo.recordConversionEvent(lead.id, {
      eventType: "purchase",
      value: 199,
      occurredAt: FIXED_NOW,
    });
    // duplicate (user, lead, event_type, occurred_at) → no-op, returns same row
    const dup = await repo.recordConversionEvent(lead.id, {
      eventType: "purchase",
      value: 199,
      occurredAt: FIXED_NOW,
    });
    expect(dup.id).toBe(first.id);

    const events = await repo.listConversionEvents(lead.id);
    expect(events).toHaveLength(1);
  });

  it("lead status FSM allows adjacent forward + lost, rejects skips", async () => {
    const lead = await repo.createLead({ source: "manual" });
    expect(lead.status).toBe("new");

    const qualified = await repo.transitionLead(lead.id, "qualified");
    expect(qualified.status).toBe("qualified");

    const won = await repo.transitionLead(lead.id, "won");
    expect(won.status).toBe("won");

    // can't skip new -> won
    const lead2 = await repo.createLead({ source: "manual" });
    await expect(repo.transitionLead(lead2.id, "won")).rejects.toThrow(
      /illegal lead status transition/,
    );
    // lost is reachable from a non-terminal stage
    const lost = await repo.transitionLead(lead2.id, "lost");
    expect(lost.status).toBe("lost");
  });

  it("product status FSM: active -> retired, rejects illegal re-retire", async () => {
    const product = await repo.createProduct({ name: "P", kind: "k" });
    const retired = await repo.retireProduct(product.id);
    expect(retired.status).toBe("retired");
    await expect(repo.retireProduct(product.id)).rejects.toThrow(
      /illegal product status transition/,
    );
  });

  it("OWNERSHIP: a product owned by user-2 is invisible to user-1", async () => {
    const repo2 = createMonetizationRepository(db, deterministicDeps("user-2"));
    const owned = await repo2.createProduct({ name: "他人的产品", kind: "k" });

    // user-1 cannot get / mutate user-2's row → same not-found surface
    await expect(repo.getProduct(owned.id)).rejects.toThrow(/not found/);
    await expect(repo.retireProduct(owned.id)).rejects.toThrow(/not found/);
    await expect(repo.createOffer(owned.id, { price: 1 })).rejects.toThrow(
      /not found/,
    );

    // and it never shows up in user-1's list
    const list = await repo.listProducts();
    expect(list.map((p) => p.id)).not.toContain(owned.id);
  });

  it("links a content output to a product idempotently (UNIQUE join)", async () => {
    const product = await repo.createProduct({ name: "P", kind: "k" });
    const link = await repo.linkContentToProduct({
      contentOutputId: "content-1",
      productId: product.id,
      contentRole: "conversion",
    });
    const again = await repo.linkContentToProduct({
      contentOutputId: "content-1",
      productId: product.id,
    });
    expect(again.id).toBe(link.id);

    const links = await repo.listProductContentLinks(product.id);
    expect(links).toHaveLength(1);
  });
});
