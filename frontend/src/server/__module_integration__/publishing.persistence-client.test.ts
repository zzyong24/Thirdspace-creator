import { describe, it, expect, beforeEach } from "vitest";
import type { Endpoint, RequestContext } from "@creatoros/contract";
import {
  compositeTransport,
  __resetPersistenceForTests,
} from "@/server/persistence-client";
import { canonicalDataset } from "@/fixtures/canonical";
import { PUBLISHING_OP_IDS } from "@creatoros/backend/modules/publishing";

// Step 4/6 — the 6 publishing ops are registered into the composite
// (PERSISTED_OPS) and the create → list → revisions.create → transition chain
// round-trips through compositeTransport against the seeded pglite store. Proves
// the module is wired into the SAME store server reads + the /api/v1 route share
// (foundation §1 registry) — the FE 确认发布 path. The transition → published
// fan-out runs over the same store (MockPublisher mints the external id; search
// upsert is best-effort post-commit).

const ep = (id: string) => ({ id }) as unknown as Endpoint;
// [T-332 S2] strict 账号门:projects/publishing 域 per-account,ctx 必须带 accountId
// (未选号 → AccountRequiredError,SPEC §4.2)。测试号按 userId 派生;composite 层 ctx
// 可信,无需真建账号行。
const ctx = (userId: string, accountId = `acct-of-${userId}`): RequestContext => ({
  userId,
  requestId: "req-test",
  source: "user",
  accountId,
});

beforeEach(() => {
  __resetPersistenceForTests();
});

// [T-326 DATA-H03] createPublication 现在有 output 归属门(assertOutputOwned 经
//   resolveOutputOwner 查真实 projects 库)—— fixture 数据集里的 output id 在 seeded
//   PGlite 里不存在,会被安全门正确拒绝。测试改走真 op 链现建 project + output。
async function createRealOutput(owner: RequestContext): Promise<string> {
  const proj = (await compositeTransport.request(
    ep("projects.create"),
    {
      params: undefined,
      query: undefined,
      body: { title: "publishing 集成测试项目" },
    } as never,
    owner,
  )) as { data: { id: string } };
  const output = (await compositeTransport.request(
    ep("projects.outputs.create"),
    {
      params: { projectId: proj.data.id },
      query: undefined,
      body: { title: "publishing 集成测试作品" },
    } as never,
    owner,
  )) as { data: { id: string } };
  return output.data.id;
}

describe("publishing ops registered in the composite transport", () => {
  it("the 6 publishing op ids are persistence-backed (not the mock)", async () => {
    // A persisted op called with NO ctx throws AuthenticationError; a mock op
    // would resolve. Use that to assert each id is routed to the real transport.
    for (const id of PUBLISHING_OP_IDS) {
      await expect(
        compositeTransport.request(ep(id), {} as never),
      ).rejects.toThrow();
    }
    // [T-055h③/T-063c] +1:outputs.publications.register(登记已发布)。
    expect(PUBLISHING_OP_IDS).toHaveLength(7);
  });

  it("create → list → revise → transition(published) round-trips over the shared store", async () => {
    const owner = ctx(canonicalDataset.user.id);
    const OUTPUT_ID = await createRealOutput(owner);

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

    // GET revisions list returns both revisions newest-first (rev-2 then rev-1).
    const revs = (await compositeTransport.request(
      ep("publications.revisions.list"),
      {
        params: { publicationId },
        query: { limit: 20, offset: 0 },
        body: undefined,
      } as never,
      owner,
    )) as { data: Array<{ id: string; revisionNumber: number; title: string }> };
    expect(revs.data.length).toBe(2);
    expect(revs.data[0]!.revisionNumber).toBe(2);
    expect(revs.data[0]!.title).toBe("正式标题");

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

  // [T-055h③/T-063c] 登记已发布:粘链接解析出的 aweme_id 经 composite 直接落一条
  // published publication(revision 补铸,幂等)—— 稿面/排期「登记已发布」的服务端链路。
  it("outputs.publications.register 落 published+external_id 且幂等(同 external key 返回既有行)", async () => {
    const owner = ctx(canonicalDataset.user.id);
    const OUTPUT_ID = await createRealOutput(owner);
    const registered = (await compositeTransport.request(
      ep("outputs.publications.register"),
      {
        params: { outputId: OUTPUT_ID },
        query: undefined,
        body: {
          platform: "douyin",
          externalId: "7423000000000000009",
          externalUrl: "https://www.douyin.com/video/7423000000000000009",
          title: "真机登记的作品",
        },
      } as never,
      owner,
    )) as {
      data: {
        id: string;
        status: string;
        externalId: string | null;
        currentRevisionId: string;
        publishedAt: string | null;
      };
    };
    expect(registered.data.status).toBe("published");
    expect(registered.data.externalId).toBe("7423000000000000009");
    expect(registered.data.currentRevisionId).not.toBe("");
    expect(registered.data.publishedAt).not.toBeNull();

    const again = (await compositeTransport.request(
      ep("outputs.publications.register"),
      {
        params: { outputId: OUTPUT_ID },
        query: undefined,
        body: { platform: "douyin", externalId: "7423000000000000009" },
      } as never,
      owner,
    )) as { data: { id: string } };
    expect(again.data.id).toBe(registered.data.id);
  });
});
