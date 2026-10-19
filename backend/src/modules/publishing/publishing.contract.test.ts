import {seedAdjacentContent} from "../../integration/adjacent-domain-fixtures";
import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import {
  createClient,
  ENDPOINTS,
  successEnvelope,
  type Endpoint,
  type RequestContext,
  type Transport,
} from "@creatoros/contract";
import {
  createPublishingService,
  type PublishingService,
} from "./publishing.service";
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

// [T-332 S2] per-account 域 service 一律要求 ctx.accountId(strict);测试 ctx 统一带号。
const ctx: RequestContext = {
  userId: "user-1",
  requestId: "req-1",
  source: "user",
  accountId: "acct-1",
};
const ep = (id: string) => ({ id }) as unknown as Endpoint;

let db: Db;
let transport: Transport;
let service: PublishingService;

beforeEach(async () => {
  ({ db } = await createDb());
  await seedAdjacentContent(db,ctx,["output-1","output-imp"]);
  let seq = 0;
  service = createPublishingService({
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

// [B-02] 真实 client 集成:模拟日拉建一条 imported 作品(ingestion 经注入端口调
// createImportedPublication),再经 contract client 读 publication list + detail。client 对
// envelope 做 Zod parse(currentRevisionId 是非空 id)—— 旧实现落 null + transport "" 占位会在
// 此整体解析失败;本用例断言原子补铸 revision-1 后 parse 通过。
describe("[B-02] imported publication 经 contract client 读:Zod parse 通过", () => {
  it("日拉建 imported 作品 → client list + detail 解析成功(currentRevisionId 恒为真实非空 id)", async () => {
    // 模拟日拉:直接落 published + external_id(无 outputs.publications.create 那条草稿路径)。
    const imported = await service.createImportedPublication(ctx, "output-imp", {
      platform: "douyin",
      externalId: "7423000000000000042",
      publishedAt: "2026-07-10T08:00:00.000Z",
    });
    // 底层已原子补铸 revision-1(不再是 null)。
    expect(imported.currentRevisionId).not.toBeNull();
    expect(imported.currentRevisionId).not.toBe("");

    // 经真实 contract client(envelope.parse 是 client 内部行为,解析失败即抛)。
    const client = createClient(ENDPOINTS, transport, ctx);

    // list 端点 isList → client 内部走 listEnvelope.parse(data 为资源数组);client 方法
    //   返回类型标注为单资源(契约客户端已知类型限制),运行时是数组,断言前收窄。
    const listRaw = await client.listPublications({
      params: { outputId: "output-imp" },
      query: { page: 1, pageSize: 20 },
      body: undefined,
    });
    const list = listRaw as unknown as Array<{
      id: string;
      currentRevisionId: string;
      status: string;
    }>;
    expect(list.length).toBe(1);
    expect(list[0]!.id).toBe(imported.id);
    // currentRevisionId 是非空真实 id(z.string().min(1) 已在 client 内部 parse 通过)。
    expect(list[0]!.currentRevisionId.length).toBeGreaterThan(0);
    expect(list[0]!.status).toBe("published");

    const detail = await client.getPublication({
      params: { publicationId: imported.id },
      query: undefined,
      body: undefined,
    });
    expect(detail.id).toBe(imported.id);
    expect(detail.status).toBe("published");
    expect(detail.currentRevisionId.length).toBeGreaterThan(0);
    expect(detail.publishedAt).toBe("2026-07-10T08:00:00.000Z");
  });
});
