import { describe, it, expect, beforeEach } from "vitest";
import type { Endpoint, RequestContext } from "@creatoros/contract";
import {
  compositeTransport,
  __resetPersistenceForTests,
} from "@/server/persistence-client";
import { canonicalDataset } from "@/fixtures/canonical";
import { ASSET_OP_IDS } from "./assets.transport";

// D8 / G7 — the 9 assets ops are registered into the composite (PERSISTED_OPS)
// and round-trip through compositeTransport against the seeded pglite store.
// Proves the module is wired into the same store server reads + the /api/v1 route
// share (foundation §1 registry), and asserts the multi-tenant boundary at the
// dispatch layer: user B cannot see / get user A's seeded assets.

const ep = (id: string, isList = false) =>
  ({ id, isList }) as unknown as Endpoint;
const ctx = (userId: string): RequestContext => ({
  userId,
  requestId: "req-test",
  source: "user",
});

beforeEach(() => {
  __resetPersistenceForTests();
});

describe("assets ops registered in the composite transport", () => {
  it("the 9 assets op ids are persistence-backed (not the mock)", async () => {
    // A persisted op called with NO ctx throws AuthenticationError; a mock op
    // would resolve. Use that to assert each id is routed to the real transport.
    for (const id of ASSET_OP_IDS) {
      await expect(
        compositeTransport.request(ep(id), {} as never),
      ).rejects.toThrow();
    }
    expect(ASSET_OP_IDS).toHaveLength(9);
  });

  it("assets.list returns the seeded canonical assets for the owner", async () => {
    const res = (await compositeTransport.request(
      ep("assets.list", true),
      {
        params: undefined,
        query: { page: 1, pageSize: 50 },
        body: undefined,
      } as never,
      ctx(canonicalDataset.user.id),
    )) as { data: Array<{ id: string; userId: string; status: string }> };
    expect(res.data.length).toBeGreaterThan(0);
    for (const row of res.data) {
      expect(row.userId).toBe(canonicalDataset.user.id);
      expect(row.status).toBe("active");
    }
  });

  it("upload→complete round-trips: the new asset is then listable", async () => {
    const owner = ctx(canonicalDataset.user.id);
    const up = (await compositeTransport.request(
      ep("assets.uploads.create"),
      {
        params: undefined,
        query: undefined,
        body: { assetType: "image", mimeType: "image/png", fileSize: 1024 },
      } as never,
      owner,
    )) as { data: { uploadId: string } };
    const done = (await compositeTransport.request(
      ep("assets.uploads.complete"),
      {
        params: { uploadId: up.data.uploadId },
        query: undefined,
        body: { name: "新上传素材" },
      } as never,
      owner,
    )) as { data: { id: string; status: string; currentFileId: string } };
    expect(done.data.status).toBe("active");
    expect(done.data.currentFileId).toBeTruthy();

    const list = (await compositeTransport.request(
      ep("assets.list", true),
      {
        params: undefined,
        query: { page: 1, pageSize: 50 },
        body: undefined,
      } as never,
      owner,
    )) as { data: Array<{ id: string }> };
    expect(list.data.some((r) => r.id === done.data.id)).toBe(true);
  });

  it("multi-tenant: user B cannot list or get user A's seeded assets", async () => {
    const seededAssetId = canonicalDataset.assets[0]!.id;
    // B's list excludes A's assets.
    const bList = (await compositeTransport.request(
      ep("assets.list", true),
      {
        params: undefined,
        query: { page: 1, pageSize: 50 },
        body: undefined,
      } as never,
      ctx("user-intruder"),
    )) as { data: Array<{ id: string }> };
    expect(bList.data.some((r) => r.id === seededAssetId)).toBe(false);

    // B's get of A's asset id → OwnershipError (404, no existence leak).
    await expect(
      compositeTransport.request(
        ep("assets.get"),
        {
          params: { assetId: seededAssetId },
          query: undefined,
          body: undefined,
        } as never,
        ctx("user-intruder"),
      ),
    ).rejects.toThrow();
  });

  it("assets.favorite.toggle flips the persisted isFavorite and is re-readable", async () => {
    const owner = ctx(canonicalDataset.user.id);
    const assetId = canonicalDataset.assets[0]!.id;
    const before = (await compositeTransport.request(
      ep("assets.get"),
      { params: { assetId }, query: undefined, body: undefined } as never,
      owner,
    )) as { data: { isFavorite: boolean } };
    const toggled = (await compositeTransport.request(
      ep("assets.favorite.toggle"),
      { params: { assetId }, query: undefined, body: undefined } as never,
      owner,
    )) as { data: { isFavorite: boolean } };
    expect(toggled.data.isFavorite).toBe(!before.data.isFavorite);
    // Persisted: a fresh get reflects the new flag.
    const after = (await compositeTransport.request(
      ep("assets.get"),
      { params: { assetId }, query: undefined, body: undefined } as never,
      owner,
    )) as { data: { isFavorite: boolean } };
    expect(after.data.isFavorite).toBe(!before.data.isFavorite);
  });

  it("assets.usage.list returns the 用料链 edges referencing the asset (用料反查)", async () => {
    const owner = ctx(canonicalDataset.user.id);
    const assetId = canonicalDataset.assets[0]!.id;
    // Create a 用料链 edge that references this asset, then reverse-look it up.
    const projectId = canonicalDataset.projects[0]!.id;
    await compositeTransport.request(
      ep("materialLinks.create"),
      {
        params: undefined,
        query: undefined,
        body: {
          projectId,
          entityType: "asset",
          entityId: assetId,
          role: "clip",
          stage: "production",
        },
      } as never,
      owner,
    );
    const usage = (await compositeTransport.request(
      ep("assets.usage.list", true),
      { params: { assetId }, query: undefined, body: undefined } as never,
      owner,
    )) as { data: Array<{ entityId: string; entityType: string }> };
    expect(usage.data.length).toBeGreaterThan(0);
    for (const row of usage.data) {
      expect(row.entityType).toBe("asset");
      expect(row.entityId).toBe(assetId);
    }

    // Multi-tenant: user B sees no usage for A's asset.
    const bUsage = (await compositeTransport.request(
      ep("assets.usage.list", true),
      { params: { assetId }, query: undefined, body: undefined } as never,
      ctx("user-intruder"),
    ).catch(() => ({ data: [] }))) as { data: unknown[] };
    expect(bUsage.data).toHaveLength(0);
  });
});
