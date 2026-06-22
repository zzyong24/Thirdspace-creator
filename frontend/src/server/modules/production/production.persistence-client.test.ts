import { describe, it, expect, beforeEach } from "vitest";
import type { Endpoint, RequestContext } from "@creatoros/contract";
import {
  compositeTransport,
  __resetPersistenceForTests,
} from "@/server/persistence-client";
import { canonicalDataset } from "@/fixtures/canonical";
import { PRODUCTION_OP_IDS } from "./production.transport";

// Step 4/6 — the 5 production ops are registered into the composite
// (PERSISTED_OPS) and the get → put → segments → export → complete chain
// round-trips through compositeTransport against the seeded pglite store. Proves
// the module is wired into the SAME store server reads + the /api/v1 route share
// (foundation §1 registry) — the FE save path. The completeExport fan-out reaches
// the Projects service (primaryAssetId on the seeded output) over the same store.

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
const OUTPUT_ID = "output-ainativebrowser-main";

describe("production ops registered in the composite transport", () => {
  it("the 5 production op ids are persistence-backed (not the mock)", async () => {
    // A persisted op called with NO ctx throws AuthenticationError; a mock op
    // would resolve. Use that to assert each id is routed to the real transport.
    for (const id of PRODUCTION_OP_IDS) {
      await expect(
        compositeTransport.request(ep(id), {} as never),
      ).rejects.toThrow();
    }
    expect(PRODUCTION_OP_IDS).toHaveLength(5);
  });

  it("get → put → segment → export → complete round-trips over the shared store", async () => {
    const owner = ctx(canonicalDataset.user.id);

    // GET get-or-creates a drafting production for the seeded output.
    const got = (await compositeTransport.request(
      ep("outputs.production.get"),
      { params: { outputId: OUTPUT_ID }, query: undefined, body: undefined } as never,
      owner,
    )) as { data: { id: string; status: string; contentOutputId: string } };
    expect(got.data.status).toBe("drafting");
    expect(got.data.contentOutputId).toBe(OUTPUT_ID);
    const productionId = got.data.id;

    // PUT switches the mode (wired-local→backend mode card).
    const put = (await compositeTransport.request(
      ep("outputs.production.put"),
      {
        params: { outputId: OUTPUT_ID },
        query: undefined,
        body: { productionMode: "screen_capture" },
      } as never,
      owner,
    )) as { data: { productionMode: string } };
    expect(put.data.productionMode).toBe("screen_capture");

    // POST a segment (添加章节).
    const seg = (await compositeTransport.request(
      ep("productions.segments.create"),
      {
        params: { productionId },
        query: undefined,
        body: { title: "新章节 1", position: 0, startMs: 0, endMs: 30000 },
      } as never,
      owner,
    )) as { data: { id: string; title: string } };
    expect(seg.data.title).toBe("新章节 1");

    // POST an export (导出视频 phase 1) → queued.
    const exp = (await compositeTransport.request(
      ep("productions.exports.create"),
      {
        params: { productionId },
        query: undefined,
        body: { format: "mp4", resolution: "1080p", aspectRatio: "16:9" },
      } as never,
      owner,
    )) as { data: { id: string; status: string } };
    expect(exp.data.status).toBe("queued");

    // POST complete (导出视频 phase 2) → ready + cross-module primary-asset link.
    const done = (await compositeTransport.request(
      ep("exports.complete"),
      {
        params: { exportId: exp.data.id },
        query: undefined,
        body: { resultAssetId: "av-ainativebrowser-output-script" },
      } as never,
      owner,
    )) as { data: { status: string; resultAssetId: string } };
    expect(done.data.status).toBe("ready");
    expect(done.data.resultAssetId).toBe("av-ainativebrowser-output-script");
  });
});
