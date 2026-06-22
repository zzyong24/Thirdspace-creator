import { describe, it, expect, beforeEach } from "vitest";
import type { Endpoint, RequestContext } from "@creatoros/contract";
import {
  compositeTransport,
  __resetPersistenceForTests,
} from "@/server/persistence-client";
import { canonicalDataset } from "@/fixtures/canonical";
import { PUBLISHING_OP_IDS } from "./publishing.transport";

// Step 4/6 — the 5 publishing ops are registered into the composite
// (PERSISTED_OPS) and the create → list → revisions.create → transition chain
// round-trips through compositeTransport against the seeded pglite store. Proves
// the module is wired into the SAME store server reads + the /api/v1 route share
// (foundation §1 registry) — the FE 确认发布 path. The transition → published
// fan-out runs over the same store (MockPublisher mints the external id; search
// upsert is best-effort post-commit).

const ep = (id: string) => ({ id }) as unknown as Endpoint;
const ctx = (userId: string): RequestContext => ({
  userId,
  requestId: "req-test",
  source: "user",
});

beforeEach(() => {
  __resetPersistenceForTests();
});

// A seeded content output owned by the canonical user.
const OUTPUT_ID = canonicalDataset.contentOutputs[0]!.id;

describe("publishing ops registered in the composite transport", () => {
  it("the 5 publishing op ids are persistence-backed (not the mock)", async () => {
    // A persisted op called with NO ctx throws AuthenticationError; a mock op
    // would resolve. Use that to assert each id is routed to the real transport.
    for (const id of PUBLISHING_OP_IDS) {
      await expect(
        compositeTransport.request(ep(id), {} as never),
      ).rejects.toThrow();
    }
    expect(PUBLISHING_OP_IDS).toHaveLength(5);
  });

  it("create → list → revise → transition(published) round-trips over the shared store", async () => {
    const owner = ctx(canonicalDataset.user.id);

    // POST create a publication for the seeded output (draft, auto-mints rev-1).
    const created = (await compositeTransport.request(
      ep("outputs.publications.create"),
      {
        params: { outputId: OUTPUT_ID },
        query: undefined,
        body: { platform: "bilibili", accountReference: "@creator" },
      } as never,
      owner,
    )) as { data: { id: string; status: string; currentRevisionId: string } };
    expect(created.data.status).toBe("draft");
    expect(created.data.currentRevisionId).not.toBe("");
    const publicationId = created.data.id;

    // GET list returns the new publication.
    const listed = (await compositeTransport.request(
      ep("outputs.publications.list"),
      {
        params: { outputId: OUTPUT_ID },
        query: { limit: 20, offset: 0 },
        body: undefined,
      } as never,
      owner,
    )) as { data: Array<{ id: string }> };
    expect(listed.data.some((p) => p.id === publicationId)).toBe(true);

    // POST a revision (Title-input commit).
    const rev = (await compositeTransport.request(
      ep("publications.revisions.create"),
      {
        params: { publicationId },
        query: undefined,
        body: { title: "正式标题", description: "正式描述" },
      } as never,
      owner,
    )) as { data: { id: string; title: string; revisionNumber: number } };
    expect(rev.data.title).toBe("正式标题");
    expect(rev.data.revisionNumber).toBe(2);

    // POST transition → published (确认发布). MockPublisher mints external id.
    const published = (await compositeTransport.request(
      ep("publications.transition"),
      {
        params: { publicationId },
        query: undefined,
        body: { status: "published" },
      } as never,
      owner,
    )) as { data: { status: string; externalId: string | null } };
    expect(published.data.status).toBe("published");
    expect(published.data.externalId).not.toBeNull();

    // Idempotent re-publish returns the same external id (no duplicate).
    const again = (await compositeTransport.request(
      ep("publications.transition"),
      {
        params: { publicationId },
        query: undefined,
        body: { status: "published" },
      } as never,
      owner,
    )) as { data: { externalId: string | null } };
    expect(again.data.externalId).toBe(published.data.externalId);
  });
});
