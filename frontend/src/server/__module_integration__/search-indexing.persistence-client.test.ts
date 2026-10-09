import { describe, it, expect, beforeEach } from "vitest";
import type { Endpoint, RequestContext } from "@creatoros/contract";
import {
  compositeTransport,
  __resetPersistenceForTests,
} from "@/server/persistence-client";
import { canonicalDataset } from "@/fixtures/canonical";

// 「全局搜索完全不可用」回归护栏(实测确诊:建项目/知识后 search_documents 空)。
// 每条都走 compositeTransport(= /api/v1 route 与 server 读共享的同一 store,
// T-1022：写入前正常创建所属账号及其资源组，不伪造 legacy group 外键。
async function createAccountContext(platform: "douyin" | "bilibili" = "douyin", userId = canonicalDataset.user.id): Promise<RequestContext> {
  const owner = ctx(userId);
  const created = await compositeTransport.request(ep("accounts.create"), {body:{platform,accountHandle:"@isolated-index",followerBaseline:0}} as never, {...owner,accountId:null}) as {data:{id:string}};
  return {...owner,accountId:created.data.id};
}

// pages.search.get 由 query-services 模块接管),证明实体的 create/update/delete
// 路径真写/删了 search_document、且 pages.search.get 能命中/失效。
//
//   1. projects.create → pages.search.get(标题)命中 project tab(核心 bug:漏接索引)。
//   2. projects.patch(改名)→ 新标题可搜、旧标题不再命中(update 路径重投影)。
//   3. projects.delete → 该项目从索引移除(delete 路径 removeDocument)。
//   4. knowledge.create → pages.search.get 命中 knowledge tab(既有 fan-out 不回归,
//      且 void→await 消竞态:create 返回后立刻搜即命中)。
//   5. video/publication tab 对齐:发布作品索引 entity_type='video',video tab 可搜。

const ep = (id: string, isList = false) =>
  ({ id, isList }) as unknown as Endpoint;
// [T-332 S2] strict 账号门:search_documents 及其源实体(projects/knowledge/publications)
// 全部 per-account,ctx 必须带 accountId(未选号 → AccountRequiredError,SPEC §4.2)。
// 同一派生号贯穿写入与搜索,保证投影/命中在同号域内闭环。
const ctx = (userId: string, accountId = `acct-of-${userId}`): RequestContext => ({
  userId,
  requestId: "req-test",
  source: "user",
  accountId,
});

// pages.search.get 回包形状(只取本测断言用到的字段)。
interface SearchPage {
  data: {
    projects: ReadonlyArray<{ id: string; title: string }>;
    knowledge: ReadonlyArray<{ id: string; title: string }>;
    videos: ReadonlyArray<{ id: string; title: string }>;
    resultTabs: ReadonlyArray<{ id: string; count: number }>;
  };
}

async function search(
  owner: RequestContext,
  q: string,
  type?: string,
): Promise<SearchPage["data"]> {
  const res = (await compositeTransport.request(
    ep("pages.search.get"),
    { params: undefined, query: { q, type }, body: undefined } as never,
    owner,
  )) as SearchPage;
  return res.data;
}

function tabCount(data: SearchPage["data"], tabId: string): number {
  return data.resultTabs.find((t) => t.id === tabId)?.count ?? 0;
}

async function createProject(
  owner: RequestContext,
  title: string,
  brief: string,
): Promise<string> {
  const created = (await compositeTransport.request(
    ep("projects.create"),
    { params: undefined, query: undefined, body: { title, brief } } as never,
    owner,
  )) as { data: { id: string } };
  return created.data.id;
}

beforeEach(() => {
  __resetPersistenceForTests();
});

describe("实体 create/update/delete 写搜索索引(全局搜索可用)", () => {
  it("1. projects.create 后,pages.search.get 用标题能命中 project tab", async () => {
    const owner = ctx(canonicalDataset.user.id);
    const id = await createProject(
      owner,
      "AI工具评测独特标题ZZZ",
      "一条关于 AI 工具的项目简介",
    );
    expect(id).toBeTruthy();

    const data = await search(owner, "AI工具评测独特标题ZZZ");
    expect(data.projects.some((p) => p.id === id)).toBe(true);
    expect(tabCount(data, "project")).toBeGreaterThanOrEqual(1);
  });

  it("2. projects.patch 改名后,新标题可搜、旧标题不再命中(update 重投影)", async () => {
    const owner = ctx(canonicalDataset.user.id);
    const id = await createProject(owner, "旧标题唯一词AAA", "简介");

    await compositeTransport.request(
      ep("projects.patch"),
      {
        params: { projectId: id },
        query: undefined,
        body: { title: "新标题唯一词BBB" },
      } as never,
      owner,
    );

    const byNew = await search(owner, "新标题唯一词BBB");
    expect(byNew.projects.some((p) => p.id === id)).toBe(true);

    const byOld = await search(owner, "旧标题唯一词AAA");
    expect(byOld.projects.some((p) => p.id === id)).toBe(false);
  });

  it("3. projects.delete 后,该项目从搜索索引移除(delete 路径 removeDocument)", async () => {
    const owner = ctx(canonicalDataset.user.id);
    const id = await createProject(owner, "待删项目唯一词DDD", "简介");

    // 删前可搜。
    const before = await search(owner, "待删项目唯一词DDD");
    expect(before.projects.some((p) => p.id === id)).toBe(true);

    await compositeTransport.request(
      ep("projects.delete"),
      { params: { projectId: id }, query: undefined, body: undefined } as never,
      owner,
    );

    // 删后不再命中。
    const after = await search(owner, "待删项目唯一词DDD");
    expect(after.projects.some((p) => p.id === id)).toBe(false);
  });

  it("4. knowledge.create 后,pages.search.get 立刻命中 knowledge tab(await 消竞态)", async () => {
    const owner = await createAccountContext();
    const created = (await compositeTransport.request(
      ep("knowledge.create"),
      {
        params: undefined,
        query: undefined,
        body: {
          title: "知识唯一标题KKK",
          knowledgeType: "note",
          content: "知识正文内容",
        },
      } as never,
      owner,
    )) as { data: { id: string } };

    // create 返回后立刻搜(fire-and-forget 时代这里会因竞态偶发命中不到)。
    const data = await search(owner, "知识唯一标题KKK");
    expect(data.knowledge.some((k) => k.id === created.data.id)).toBe(true);
    expect(tabCount(data, "knowledge")).toBeGreaterThanOrEqual(1);
  });

  it("5. 发布作品索引 entity_type='video',video 作品 tab 能搜到(tab 对齐)", async () => {
    const owner = await createAccountContext("bilibili");
    // [T-326 DATA-H03] createPublication 有归属门,fixture output id 在 seeded 库不存在
    //   会被正确拒绝 —— 走真 op 链现建 project + output。
    const projectId = await createProject(owner, "视频tab探针项目", "简介");
    const outputCreated = (await compositeTransport.request(
      ep("projects.outputs.create"),
      {
        params: { projectId },
        query: undefined,
        body: { title: "视频tab探针作品" },
      } as never,
      owner,
    )) as { data: { id: string } };
    const outputId = outputCreated.data.id;

    // 自动 publisher 尚未接通；用既有正式手工登记交接并触发同一搜索投影。
    const created = (await compositeTransport.request(
      ep("outputs.publications.register"),
      {params:{outputId},body:{platform:"bilibili",externalId:"BV-isolated-index",externalUrl:"https://www.bilibili.com/video/BV-isolated-index",title:"bilibili 隔离搜索作品",publishedAt:"2026-09-05T00:00:00.000Z"}} as never,
      owner,
    )) as {data:{id:string}};
    const publicationId=created.data.id;

    // 搜 "bilibili"(命中发布索引 title `bilibili 发布`)应落在 video tab
    // (entity_type='video'),而不是 tab 白名单外的 'publication' 类型(那样恒 0)。
    const data = await search(owner, "bilibili");
    expect(data.videos.some((v) => v.id === publicationId)).toBe(true);
    expect(tabCount(data, "video")).toBeGreaterThanOrEqual(1);

    // 显式窄化到 video tab 也能命中(?type=video)。
    const narrowed = await search(owner, "bilibili", "video");
    expect(narrowed.videos.some((v) => v.id === publicationId)).toBe(true);

    // 另一个正常创建的工作区与另一个操作者只回读各自搜索域。
    const otherWorkspace = await createAccountContext("bilibili");
    const otherOwner = await createAccountContext("bilibili", "isolated-search-other-owner");
    for (const foreign of [otherWorkspace, otherOwner]) {
      expect(foreign.accountId).not.toBe(owner.accountId);
      const all = await search(foreign, "bilibili");
      const videos = await search(foreign, "bilibili", "video");
      expect(all.videos).toEqual([]);
      expect(videos.videos).toEqual([]);
      expect(tabCount(all, "video")).toBe(0);
      expect(tabCount(videos, "video")).toBe(0);
    }
  });
});
