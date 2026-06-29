import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import {
  successEnvelope,
  type Endpoint,
  type RequestContext,
  type Transport,
} from "@creatoros/contract";
import { createProductionService } from "./production.service";
import { createProductionTransport } from "./production.transport";
import {
  productionResource,
  productionSegmentResource,
  exportRecordResource,
} from "./production.schema";

// Step 4 — drive each of the 5 ops through the transport against a real pglite db
// and assert the envelope `data` validates against the op's contract response DTO
// (foundation §5.4). Confirms record configs, non-null id coercion (queued export
// resultAssetId → ""), enum coercion, and the exports.complete happy path
// producing a DTO whose status parses as "ready".

const ctx: RequestContext = {
  userId: "user-1",
  requestId: "req-1",
  source: "user",
};
const ep = (id: string) => ({ id }) as unknown as Endpoint;

let db: Db;
let transport: Transport;

beforeEach(async () => {
  ({ db } = await createDb());
  let seq = 0;
  const service = createProductionService({
    db,
    now: () => "2026-06-21T04:00:00.000Z",
    nextId: (prefix: string) => `${prefix}-${++seq}`,
  });
  transport = createProductionTransport(() => service);
});

async function call(id: string, input: unknown) {
  return transport.request(ep(id), input as never, ctx);
}

async function productionId(): Promise<string> {
  const res = await call("outputs.production.get", {
    params: { outputId: "output-1" },
  });
  return (res as { data: { id: string } }).data.id;
}

describe("production.transport — 5-op contract conformance", () => {
  it("outputs.production.get → productionResource (get-or-create)", async () => {
    const res = await call("outputs.production.get", {
      params: { outputId: "output-1" },
    });
    const parsed = successEnvelope(productionResource).parse(res);
    expect(parsed.data.status).toBe("drafting");
    expect(parsed.data.contentOutputId).toBe("output-1");
    expect(parsed.data.startedAt).toBeNull();
  });

  it("outputs.production.put → productionResource", async () => {
    await productionId();
    const res = await call("outputs.production.put", {
      params: { outputId: "output-1" },
      body: { productionMode: "screen_capture", recordingConfig: { overlay: true } },
    });
    const parsed = successEnvelope(productionResource).parse(res);
    expect(parsed.data.productionMode).toBe("screen_capture");
    expect(parsed.data.recordingConfig).toEqual({ overlay: true });
  });

  it("productions.segments.create → productionSegmentResource", async () => {
    const pid = await productionId();
    const res = await call("productions.segments.create", {
      params: { productionId: pid },
      body: { title: "新章节 1", position: 0, startMs: 0, endMs: 30000 },
    });
    const parsed = successEnvelope(productionSegmentResource).parse(res);
    expect(parsed.data.title).toBe("新章节 1");
    expect(parsed.data.scriptSectionId).toBeNull();
  });

  it("productions.exports.create → exportRecordResource (queued, coerced asset id)", async () => {
    const pid = await productionId();
    const res = await call("productions.exports.create", {
      params: { productionId: pid },
      body: { format: "mp4", resolution: "1080p", aspectRatio: "16:9" },
    });
    const parsed = successEnvelope(exportRecordResource).parse(res);
    expect(parsed.data.status).toBe("queued");
    expect(parsed.data.resultAssetId).toBe("pending");
    expect(parsed.data.completedAt).toBeNull();
  });

  it("exports.complete → exportRecordResource with status ready", async () => {
    const pid = await productionId();
    const created = await call("productions.exports.create", {
      params: { productionId: pid },
      body: { format: "mp4", resolution: "1080p", aspectRatio: "16:9" },
    });
    const exportId = (created as { data: { id: string } }).data.id;
    const res = await call("exports.complete", {
      params: { exportId },
      body: { resultAssetId: "asset-result-1" },
    });
    const parsed = successEnvelope(exportRecordResource).parse(res);
    expect(parsed.data.status).toBe("ready");
    expect(parsed.data.resultAssetId).toBe("asset-result-1");
    expect(parsed.data.completedAt).not.toBeNull();
  });
});
