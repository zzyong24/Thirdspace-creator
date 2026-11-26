import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ENDPOINTS, type RequestContext } from "@creatoros/contract";
import type { EveryInfraQuery, EveryInfraVideoHit } from "@creatoros/contract/internal/everyinfra";
import { eq, sql } from "drizzle-orm";
import { createProjectIntakeApplication } from "../../application/projects/project-intake";
import { createDb, type Db } from "../../db";
import { accountGroups } from "../../schema/account-groups";
import { executionTasks, intelligenceItems, itemMetricSnapshots, sourceSnapshots } from "../../schema/intelligence";
import { createPersistentTaskService } from "../execution";
import { createEveryInfraRadar, mapEveryInfraItem } from "./everyinfra-item-import";
import { createIntelligenceService } from "./intelligence.service";
import { createIntelligenceTransport } from "./intelligence.transport";

const now = () => "2026-11-01T12:00:00.000Z";
const channelsId = "15039881603147501275";
const noteId = "abcdef123456abcdef123456";
const fallbackNoteUrl = `https://www.xiaohongshu.com/explore/${noteId}`;
function privateNoteUrl() {
  const url = new URL(fallbackNoteUrl);
  url.searchParams.set("xsec_token", randomUUID());
  url.searchParams.set("xsec_source", "fixture");
  return url.href;
}
const search: EveryInfraQuery = { platform: "xiaohongshu", action: "search", params: { keyword: "合成样本" } };
const note: EveryInfraVideoHit = {
  platform: "xiaohongshu", action: "search", externalId: noteId,
  canonicalUrl: fallbackNoteUrl, title: "合成图文", type: "article", addable: true, metrics: { likes: 4 },
};
const channels: EveryInfraVideoHit = {
  platform: "wechatVideo", action: "user_posts", externalId: channelsId,
  title: "合成视频号作品", type: "video", addable: true, metrics: {},
};

describe("万有引擎加入内容雷达", () => {
  let db: Db;
  let close: () => Promise<void>;
  beforeAll(async () => {
    const opened = await createDb();
    db = opened.db;
    close = () => opened.client.close();
  }, 120_000);
  afterAll(async () => close?.(), 120_000);

  async function fixture(suffix: string) {
    const ctx: RequestContext = { userId: "radar-everyinfra-user", groupId: `group-${suffix}`, requestId: suffix, source: "user" };
    await db.insert(accountGroups).values({
      id: ctx.groupId!, userId: ctx.userId, name: suffix, status: "active", createdAt: now(), updatedAt: now(),
    });
    const queryForRadar = vi.fn<() => Promise<{ hits: EveryInfraVideoHit[] }>>();
    const readXiaohongshuNoteUrl = vi.fn<(id: string, options: { idempotencyKey: string }) => Promise<string | undefined>>();
    const intel = createIntelligenceService(db, { now, tasks: createPersistentTaskService(db) });
    const radar = createEveryInfraRadar(db, {
      now, assertWorkspaceReadable: intel.assertWorkspaceReadable,
      client: async () => ({ queryForRadar, readXiaohongshuNoteUrl }),
    });
    const transport = createIntelligenceTransport(() => intel, undefined, undefined, radar);
    async function query(input: EveryInfraQuery, hits: EveryInfraVideoHit[]) {
      queryForRadar.mockResolvedValueOnce({ hits });
      const endpoint = ENDPOINTS.queryEveryInfraRadar;
      const result = await transport.request(endpoint, {
        params: undefined, query: undefined, body: { query: input, idempotencyKey: "radar-search-test" },
      }, ctx);
      return endpoint.response.parse((result as { data: unknown }).data).hits;
    }
    async function add(importId: string, scope = ctx) {
      const endpoint = ENDPOINTS.addEveryInfraRadarItem;
      const result = await transport.request(endpoint, {
        params: undefined, query: undefined, body: { importId },
      }, scope);
      return endpoint.response.parse((result as { data: unknown }).data).itemId;
    }
    return { ctx, query, add, intel, transport, readXiaohongshuNoteUrl };
  }

  it("映射抖音作品、图文小红书及大数字视频号 ID；忽略未知指标与无效数据", () => {
    expect(mapEveryInfraItem({
      platform: "douyin", action: "search", addable: true,
      externalId: "79123", summary: "  合成标题  ", type: "video", metrics: {},
      durationMs: 2000, publishedAt: "2026-11-01T20:00:00+08:00",
    })).toMatchObject({
      captureChannel: "everyinfra", canonicalUrl: "https://www.douyin.com/video/79123",
      title: "合成标题", type: "video", durationMs: 2000, publishedAt: now(),
    });
    expect(mapEveryInfraItem({ ...note, durationMs: 2000, publishedAt: "未知" })).toMatchObject({
      type: "article", durationMs: null, publishedAt: null, canonicalUrl: fallbackNoteUrl,
    });
    expect(mapEveryInfraItem(channels)).toMatchObject({
      externalId: channelsId, canonicalUrl: `https://creatoros.local/sources/wechatVideo/${channelsId}`,
    });
    expect(mapEveryInfraItem({ ...channels, action: "video", canonicalUrl: "https://weixin.qq.com/sph/fixtureShare" }))
      .toMatchObject({ externalId: channelsId, canonicalUrl: "https://weixin.qq.com/sph/fixtureShare" });
  });

  it("拒绝视频号搜索结果、小红书未知类型、伪造句柄和跨组加入", async () => {
    const first = await fixture("non-addable");
    const other = await fixture("non-addable-other");
    const [channelsHit] = await first.query(
      { platform: "wechatVideo", action: "search", params: { keyword: "样本" } }, [{ ...channels, action: "search" }],
    );
    expect(channelsHit).toMatchObject({ addable: false });
    expect(channelsHit).not.toHaveProperty("importId");
    const [unclassified] = await first.query(search, [{ ...note, type: undefined }]);
    expect(unclassified).not.toHaveProperty("importId");
    const [valid] = await first.query(search, [note]);
    await expect(first.add("00000000-0000-4000-8000-000000000000")).rejects.toMatchObject({ details: { domainCode: "EVERYINFRA_HIT_NOT_ADDABLE" } });
    await expect(first.add(valid!.importId!, other.ctx)).rejects.toMatchObject({ details: { domainCode: "EVERYINFRA_HIT_NOT_ADDABLE" } });
    expect(await db.select().from(intelligenceItems).where(eq(intelligenceItems.groupId, first.ctx.groupId!))).toEqual([]);
  });

  it("同组并发和带新令牌的重复点击复用条目，不写转写队列或带查询的来源快照", async () => {
    const f = await fixture("dedupe");
    const secondNoteUrl = privateNoteUrl();
    const [firstHit] = await f.query(search, [{ ...note, canonicalUrl: privateNoteUrl() }]);
    expect(firstHit).not.toHaveProperty("canonicalUrl");
    const [id1, id2] = await Promise.all([f.add(firstHit!.importId!), f.add(firstHit!.importId!)]);
    const [secondHit] = await f.query(search, [{ ...note, canonicalUrl: secondNoteUrl }]);
    expect(await f.add(secondHit!.importId!)).toBe(id1);
    expect(id2).toBe(id1);
    const rows = await db.select().from(intelligenceItems).where(eq(intelligenceItems.groupId, f.ctx.groupId!));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: id1, canonicalUrl: secondNoteUrl, captureChannel: "everyinfra", type: "article" });
    expect(await db.select().from(executionTasks).where(eq(executionTasks.groupId, f.ctx.groupId!))).toEqual([]);
    expect(await db.select().from(sourceSnapshots).where(eq(sourceSnapshots.itemId, id1))).toMatchObject([{ finalUrl: fallbackNoteUrl }]);
    expect(await db.select().from(itemMetricSnapshots).where(eq(itemMetricSnapshots.itemId, id1)))
      .toMatchObject([{ likeCount: 4, collectCount: null, shareCount: null, commentCount: null }]);
  });

  it("小红书账号作品只在点击加入时刷新链接，刷新失败仍保存稳定笔记 ID", async () => {
    const f = await fixture("token-refresh");
    const userPosts: EveryInfraQuery = { platform: "xiaohongshu", action: "user_posts", params: { user_id: noteId } };
    const accountHit: EveryInfraVideoHit = { ...note, action: "user_posts" };
    f.readXiaohongshuNoteUrl.mockRejectedValueOnce(new Error("fixture upstream failure"));
    const [first] = await f.query(userPosts, [accountHit]);
    expect(f.readXiaohongshuNoteUrl).not.toHaveBeenCalled();
    const [itemId, concurrent] = await Promise.all([f.add(first!.importId!), f.add(first!.importId!)]);
    expect(concurrent).toBe(itemId);
    expect(f.readXiaohongshuNoteUrl).toHaveBeenCalledExactlyOnceWith(noteId, expect.objectContaining({ idempotencyKey: expect.any(String) }));
    expect((await f.intel.getItem(f.ctx, itemId)).item.canonicalUrl).toBe(fallbackNoteUrl);
    const freshUrl = privateNoteUrl();
    f.readXiaohongshuNoteUrl.mockResolvedValueOnce(freshUrl);
    const [again] = await f.query(userPosts, [accountHit]);
    expect(await f.add(again!.importId!)).toBe(itemId);
    const [row] = await db.select().from(intelligenceItems).where(eq(intelligenceItems.id, itemId));
    expect(row?.canonicalUrl).toBe(freshUrl);
    expect((await f.intel.getItem(f.ctx, itemId)).item.canonicalUrl).toBe(fallbackNoteUrl);
  });

  it("查询、列表、详情和项目来源接口只投影小红书公开笔记地址", async () => {
    const f = await fixture("public-note-url");
    const privateUrl = privateNoteUrl();
    const publicCoverUrl = "https://cover.example.test/note.webp";
    const coverUrl = new URL(publicCoverUrl);
    coverUrl.searchParams.set("XSEC_TOKEN", randomUUID());
    const [hit] = await f.query(search, [{ ...note, canonicalUrl: privateUrl, coverUrl: coverUrl.href }]);
    expect(hit).not.toHaveProperty("canonicalUrl");
    expect(hit).not.toHaveProperty("coverUrl");
    const itemId = await f.add(hit!.importId!);
    // 模拟旧快照和封面保留了完整地址。读回时应同样只返回公开地址。
    await db.update(sourceSnapshots).set({ finalUrl: privateUrl }).where(eq(sourceSnapshots.itemId, itemId));
    await db.update(intelligenceItems).set({ coverUrl: coverUrl.href }).where(eq(intelligenceItems.id, itemId));
    const list = await f.transport.request(ENDPOINTS.listIntelligenceItems, {
      params: undefined, query: { page: 1, pageSize: 10, sort: "newest" }, body: undefined,
    }, f.ctx);
    const detail = await f.transport.request(ENDPOINTS.getIntelligenceItem, {
      params: { itemId }, query: undefined, body: undefined,
    }, f.ctx);
    const source = await f.intel.getProjectIntakeSource(f.ctx, itemId);
    expect(list).toMatchObject({ data: [{ item: { id: itemId, canonicalUrl: fallbackNoteUrl, coverUrl: publicCoverUrl } }] });
    expect(detail).toMatchObject({
      data: { item: { canonicalUrl: fallbackNoteUrl, coverUrl: publicCoverUrl }, snapshots: [{ finalUrl: fallbackNoteUrl }] },
    });
    expect(source.url).toBe(fallbackNoteUrl);
    expect(JSON.stringify({ list, detail, source })).not.toMatch(/xsec_token/i);
  });

  it("数据库写入失败仅返回固定文案，底层错误中的地址不进入接口回执", async () => {
    const f = await fixture("note-db-error");
    const [hit] = await f.query(search, [{ ...note, canonicalUrl: privateNoteUrl() }]);
    await db.execute(sql`CREATE FUNCTION reject_fixture_note() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION '%', NEW.canonical_url; END;
    $$ LANGUAGE plpgsql`);
    await db.execute(sql`CREATE TRIGGER reject_fixture_note BEFORE INSERT ON intelligence_items
      FOR EACH ROW EXECUTE FUNCTION reject_fixture_note()`);
    try {
      await expect(f.add(hit!.importId!)).rejects.toMatchObject({
        code: "UnexpectedError", message: "暂时无法加入内容雷达，请稍后重试。",
      });
    } finally {
      await db.execute(sql`DROP TRIGGER reject_fixture_note ON intelligence_items`);
      await db.execute(sql`DROP FUNCTION reject_fixture_note()`);
    }
  });

  it("视频号账号作品可通过 projects.ensure 升级，内部 URL 不进入项目链接", async () => {
    const f = await fixture("channels-project");
    const accountWorks: EveryInfraQuery = { platform: "wechatVideo", action: "user_posts", params: { username: "sphFixture" } };
    const [hit] = await f.query(accountWorks, [channels]);
    const itemId = await f.add(hit!.importId!);
    let sequence = 0;
    const intake = createProjectIntakeApplication(db, { now, nextId: (prefix) => `${prefix}-channels-test-${++sequence}` });
    const result = await intake.ensureProject(f.ctx, { source: "radar", itemId, idempotencyKey: "from-channels-radar" });
    expect(result.project.source).toBe("radar");
    expect(result.sourceReferences).toMatchObject([{ itemId, url: null }]);
    const shareUrl = "https://weixin.qq.com/sph/fixtureShare";
    const [shared] = await f.query({ platform: "wechatVideo", action: "video", params: { object_id: shareUrl } }, [
      { ...channels, action: "video", canonicalUrl: shareUrl },
    ]);
    expect(await f.add(shared!.importId!)).toBe(itemId);
    expect((await f.intel.getItem(f.ctx, itemId)).item.canonicalUrl).toBe(shareUrl);
    await expect(f.intel.getProjectIntakeSource(f.ctx, itemId)).resolves.toMatchObject({ url: shareUrl });
    const [again] = await f.query(accountWorks, [channels]);
    expect(await f.add(again!.importId!)).toBe(itemId);
    expect((await f.intel.getItem(f.ctx, itemId)).item.canonicalUrl)
      .toBe(`https://creatoros.local/sources/wechatVideo/${channelsId}`);
    await expect(f.intel.getProjectIntakeSource(f.ctx, itemId)).resolves.toMatchObject({ url: "" });
    const tasks = await db.select().from(executionTasks).where(eq(executionTasks.groupId, f.ctx.groupId!));
    expect(tasks.filter((task) => task.kind === "transcribe")).toEqual([]);
  });
});
