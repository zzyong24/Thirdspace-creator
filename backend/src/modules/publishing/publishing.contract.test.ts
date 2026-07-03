import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import {
  successEnvelope,
  type Endpoint,
  type RequestContext,
  type Transport,
} from "@creatoros/contract";
import { createPublishingService } from "./publishing.service";
import { createPublishingTransport } from "./publishing.transport";
import { createMockPublisher } from "./platform-publisher";
import {
  publicationResource,
  publicationRevisionResource,
} from "./publishing.schema";

// Step 4 — drive each of the 5 ops through the transport against a real pglite db
// and assert the envelope `data` validates against the op's contract response DTO
// (foundation §5.4). Confirms enum coercion, non-null currentRevisionId (auto-mint,
// OQ4), the list item shape, and the publications.transition → published happy path
// producing a DTO whose status parses as "published" with non-null external fields.

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
  const service = createPublishingService({
    db,
    now: () => "2026-06-21T04:00:00.000Z",
    nextId: (prefix: string) => `${prefix}-${++seq}`,
    publisher: createMockPublisher(),
  });
  transport = createPublishingTransport(() => service);
});

async function call(id: string, input: unknown) {
  return transport.request(ep(id), input as never, ctx);
}

async function newPublicationId(platform = "bilibili"): Promise<string> {
  const res = await call("outputs.publications.create", {
    params: { outputId: "output-1" },
    body: { platform, accountReference: "@creator" },
  });
  return (res as { data: { id: string } }).data.id;
}

describe("publishing.transport — 5-op contract conformance", () => {
  it("outputs.publications.create → publicationResource (draft, real currentRevisionId)", async () => {
    const res = await call("outputs.publications.create", {
      params: { outputId: "output-1" },
      body: { platform: "douyin", accountReference: "@creator" },
    });
    const parsed = successEnvelope(publicationResource).parse(res);
    expect(parsed.data.status).toBe("draft");
    expect(parsed.data.platform).toBe("douyin");
    expect(parsed.data.currentRevisionId).not.toBe("");
    expect(parsed.data.externalId).toBeNull();
  });

  it("outputs.publications.list → publicationResource[] (isList)", async () => {
    await newPublicationId("bilibili");
    await newPublicationId("youtube");
    const res = await call("outputs.publications.list", {
      params: { outputId: "output-1" },
      query: { limit: 20, offset: 0 },
    });
    const data = (res as { data: unknown[] }).data;
    expect(data.length).toBe(2);
    for (const item of data) {
      publicationResource.parse(item);
    }
  });

  it("publications.get → publicationResource", async () => {
    const id = await newPublicationId();
    const res = await call("publications.get", {
      params: { publicationId: id },
    });
    const parsed = successEnvelope(publicationResource).parse(res);
    expect(parsed.data.id).toBe(id);
  });

  it("publications.revisions.create → publicationRevisionResource", async () => {
    const id = await newPublicationId();
    const res = await call("publications.revisions.create", {
      params: { publicationId: id },
      body: { title: "正式标题", description: "正式描述" },
    });
    const parsed = successEnvelope(publicationRevisionResource).parse(res);
    expect(parsed.data.title).toBe("正式标题");
    expect(parsed.data.revisionNumber).toBe(2); // revision 1 auto-minted at create
    expect(parsed.data.platformTags).toEqual([]);
  });

  it("publications.transition → published DTO with non-null external fields", async () => {
    const id = await newPublicationId();
    const res = await call("publications.transition", {
      params: { publicationId: id },
      body: { status: "published" },
    });
    const parsed = successEnvelope(publicationResource).parse(res);
    expect(parsed.data.status).toBe("published");
    expect(parsed.data.externalId).not.toBeNull();
    expect(parsed.data.externalUrl).not.toBeNull();
    expect(parsed.data.publishedAt).not.toBeNull();
  });

  // [T-055h③/T-063c] 登记已发布:粘链接 → published publication 直接落库。
  it("outputs.publications.register → published DTO(external_id 落库 + revision 补铸 + 幂等)", async () => {
    const res = await call("outputs.publications.register", {
      params: { outputId: "output-1" },
      body: {
        platform: "douyin",
        externalId: "7423000000000000001",
        externalUrl: "https://www.douyin.com/video/7423000000000000001",
        title: "真机登记的作品",
      },
    });
    const parsed = successEnvelope(publicationResource).parse(res);
    expect(parsed.data.status).toBe("published");
    expect(parsed.data.externalId).toBe("7423000000000000001");
    expect(parsed.data.externalUrl).toBe(
      "https://www.douyin.com/video/7423000000000000001",
    );
    expect(parsed.data.publishedAt).not.toBeNull();
    // currentRevisionId 非空(补铸 revision,守 contract id min(1))。
    expect(parsed.data.currentRevisionId).not.toBe("");

    // 幂等:同 (platform, externalId) 重复登记返回既有行,不重复建。
    const again = await call("outputs.publications.register", {
      params: { outputId: "output-1" },
      body: { platform: "douyin", externalId: "7423000000000000001" },
    });
    const parsedAgain = successEnvelope(publicationResource).parse(again);
    expect(parsedAgain.data.id).toBe(parsed.data.id);
  });
});
