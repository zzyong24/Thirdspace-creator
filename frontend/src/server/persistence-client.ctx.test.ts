import { describe, it, expect, beforeEach } from "vitest";
import { AuthenticationError } from "@creatoros/backend";
import type { Endpoint } from "@creatoros/contract";
import type { RequestContext } from "@creatoros/backend";
import {
  compositeTransport,
  __resetPersistenceForTests,
} from "@/server/persistence-client";
import { canonicalDataset } from "@/fixtures/canonical";

// Task 8 — the transport signature gains a `ctx` parameter (foundation §2, the
// one cross-cutting substrate change). This proves the composite transport
// threads ctx end-to-end:
//   - a PERSISTED op with a ctx → returns the ctx-owner's rows
//   - a PERSISTED op with NO ctx → AuthenticationError (unauthenticated dispatch)
//   - a NON-persisted (mock) op → ignores ctx, still resolves (back-compat: the
//     browser-side typed client + static pages have no ctx)

const ep = (id: string, isList = false) => ({ id, isList }) as unknown as Endpoint;

const ctx = (userId: string): RequestContext => ({
  userId,
  requestId: "req-test",
  source: "user",
});

const noInput = { params: undefined, query: undefined, body: undefined } as never;

beforeEach(() => {
  __resetPersistenceForTests();
});

describe("compositeTransport ctx threading (Task 8)", () => {
  it("returns the ctx-owner's rows for a persisted op called with a ctx", async () => {
    const res = (await compositeTransport.request(
      ep("projects.list", true),
      { params: undefined, query: { page: 1, pageSize: 20 }, body: undefined } as never,
      ctx(canonicalDataset.user.id),
    )) as { data: Array<{ id: string; userId: string }> };

    expect(res.data.length).toBeGreaterThan(0);
    // every returned project is owned by the ctx user (multi-tenant scope)
    for (const row of res.data) {
      expect(row.userId).toBe(canonicalDataset.user.id);
    }
  });

  it("throws AuthenticationError for a persisted op called with NO ctx", async () => {
    await expect(
      compositeTransport.request(
        ep("projects.list", true),
        { params: undefined, query: { page: 1, pageSize: 20 }, body: undefined } as never,
      ),
    ).rejects.toBeInstanceOf(AuthenticationError);
  });

  it("ignores ctx for a non-persisted (mock) op and still resolves (back-compat)", async () => {
    const withCtx = await compositeTransport.request(
      ep("pages.dashboard.get"),
      noInput,
      ctx(canonicalDataset.user.id),
    );
    const withoutCtx = await compositeTransport.request(
      ep("pages.dashboard.get"),
      noInput,
    );
    expect(withCtx).toBeDefined();
    expect(withoutCtx).toBeDefined();
  });
});
