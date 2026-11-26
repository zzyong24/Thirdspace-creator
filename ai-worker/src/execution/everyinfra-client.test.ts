import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { defaultEveryInfraHost, type EveryInfraHost, type EveryInfraQuery } from "@creatoros/contract/internal/everyinfra";
import { EveryInfraClient } from "./everyinfra-client";

const douyinSearch = { platform: "douyin", action: "search", params: { keyword: "咖啡" } } as const;
const xiaohongshuSearch = { platform: "xiaohongshu", action: "search", params: { keyword: "咖啡", content_type: "video" } } as const;
const channelsSearch = { platform: "wechatVideo", action: "search", params: { keyword: "咖啡" } } as const;
const noteId = "0123456789abcdef01234567";
const channelsId = "15039881603147501275";
const json = (data: unknown) => Response.json(data);
const syntheticFile = (name: string) => new Response(readFileSync(new URL(`./fixtures/everyinfra/${name}.json`, import.meta.url), "utf8"));
const setup = (baseUrl: EveryInfraHost = defaultEveryInfraHost) => {
  const apiKey = randomUUID();
  const fetcher = vi.fn<typeof fetch>();
  const wait = vi.fn(async (_ms: number) => {});
  const client = new EveryInfraClient({ apiKey, baseUrl }, { fetch: fetcher, wait, now: () => Date.UTC(2026, 10, 25) });
  return { apiKey, fetcher, wait, client };
};

describe("EveryInfra REST", () => {
  it.each([defaultEveryInfraHost, "https://api-cn.everyinfra.com"] as const)("只向选定主机 %s 发送请求", async (host) => {
    const { apiKey, client, fetcher } = setup(host);
    fetcher.mockResolvedValue(json({ results: [] }));
    await client.query(channelsSearch, { idempotencyKey: "fixture-operation" });
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(`${host}/api/v1/social`, expect.objectContaining({
      method: "POST", redirect: "error",
      headers: expect.objectContaining({ Authorization: `Bearer ${apiKey}`, "Idempotency-Key": "fixture-operation" }),
      body: JSON.stringify({ platform: "wechat_channels", action: "search", params: { keyword: "咖啡" } }),
    }));
  });

  it("拒绝任意主机、禁止下载动作从查询通道通过", async () => {
    const { apiKey, client, fetcher } = setup();
    expect(() => new EveryInfraClient({ apiKey, baseUrl: "https://not-allowed.example" as EveryInfraHost }, { fetch: fetcher })).toThrow();
    await expect(client.query({ platform: "douyin", action: "media_links", params: { urls: ["123"] } } as unknown as EveryInfraQuery))
      .rejects.toMatchObject({ code: "EVERYINFRA_RESPONSE_SHAPE" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([[401, "EVERYINFRA_AUTH_INVALID"], [403, "EVERYINFRA_AUTH_INVALID"], [402, "EVERYINFRA_QUOTA_EXHAUSTED"]] as const)(
    "将 HTTP %s 转为稳定错误且无原始响应",
    async (status, code) => {
      const { apiKey, client, fetcher } = setup();
      fetcher.mockResolvedValue(new Response(apiKey, { status }));
      await expect(client.query(douyinSearch)).rejects.toMatchObject({ code, message: expect.not.stringContaining(apiKey) });
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );

  it("429 等待 Retry-After 且沿用幂等键，长等待不立即重放", async () => {
    const { client, fetcher, wait } = setup();
    fetcher.mockResolvedValueOnce(new Response("", { status: 429, headers: { "Retry-After": "2" } }))
      .mockResolvedValueOnce(json({ results: [] }))
      .mockResolvedValueOnce(new Response("", { status: 429, headers: { "Retry-After": "60" } }));
    await client.query(douyinSearch);
    expect(wait).toHaveBeenCalledExactlyOnceWith(2000, expect.any(AbortSignal));
    const [first, second] = fetcher.mock.calls.map(([, init]) => new Headers(init?.headers).get("Idempotency-Key"));
    expect(first).toBeTruthy();
    expect(second).toBe(first);
    await expect(client.query(douyinSearch)).rejects.toMatchObject({ code: "EVERYINFRA_RATE_LIMIT" });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(wait).toHaveBeenCalledTimes(1);
  });

  it("5xx 重放相同正文和幂等键且不会切换主机", async () => {
    const { client, fetcher } = setup("https://api-cn.everyinfra.com");
    fetcher.mockResolvedValueOnce(new Response("", { status: 502 }))
      .mockResolvedValueOnce(new Response("", { status: 500 }));
    await expect(client.query(douyinSearch)).rejects.toMatchObject({ code: "EVERYINFRA_UPSTREAM" });
    expect(fetcher).toHaveBeenCalledTimes(2);
    const [first, second] = fetcher.mock.calls;
    expect(second?.[0]).toBe(first?.[0]);
    expect(second?.[1]?.headers).toEqual(first?.[1]?.headers);
    expect(second?.[1]?.body).toBe(first?.[1]?.body);
  });

  it.each(["refund_outcome_unknown", "submission_outcome_unknown"])("计费结果待核对时不自动重放", async (code) => {
    const { client, fetcher, apiKey } = setup();
    fetcher.mockResolvedValue(new Response(JSON.stringify({ error: { code, retryable: false, message: apiKey } }), { status: 503 }));
    await expect(client.query(douyinSearch)).rejects.toMatchObject({
      code: "EVERYINFRA_UPSTREAM", automaticReplayBlocked: true, message: expect.not.stringContaining(apiKey),
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([null, {}, { results: null }, { results: {} }, { results: ["row"] }, { results: [], platform: "wechat_channels" }])(
    "拒绝未确认的列表外壳 %#",
    async (value) => {
      const { client, fetcher } = setup();
      fetcher.mockResolvedValue(json(value));
      await expect(client.query(douyinSearch)).rejects.toMatchObject({ code: "EVERYINFRA_RESPONSE_SHAPE" });
    },
  );

  it("读三平台脱敏模拟夹具，稳定 ID 与图文状态正确", async () => {
    const { client, fetcher } = setup();
    fetcher.mockResolvedValueOnce(syntheticFile("douyin-search"))
      .mockResolvedValueOnce(syntheticFile("xiaohongshu-search"))
      .mockResolvedValueOnce(syntheticFile("channels-search"));
    expect((await client.query(douyinSearch)).hits[0]).toMatchObject({
      externalId: "7372024000000000001", canonicalUrl: "https://www.douyin.com/video/7372024000000000001",
      title: "冰手冲冲煮", publishedAt: "2026-10-03T09:10:00.000Z", metrics: { likes: 120 },
      durationMs: 37000, type: "video", addable: true,
    });
    expect((await client.query(xiaohongshuSearch)).hits).toMatchObject([
      { externalId: noteId, title: "冰手冲萃取示范。", durationMs: 31250, type: "video", addable: true },
      { type: "article", addable: true },
      { addable: false },
    ]);
    const [channels] = (await client.query(channelsSearch)).hits;
    expect(channels).toMatchObject({ platform: "wechatVideo", addable: false, metrics: { likes: 10202 } });
    expect(channels).not.toHaveProperty("externalId");
    expect(channels).not.toHaveProperty("canonicalUrl");
    expect(JSON.parse(String(fetcher.mock.calls[1]![1]?.body)).params).toEqual({ keyword: "咖啡", content_type: "video" });
  });

  it("单条视频号解析保留超出 JS 安全整数范围的 ID", async () => {
    const { client, fetcher } = setup();
    const body = `{"platform":"wechat_channels","action":"video","results":{"id":${channelsId},"title":"视频号单条样例","share_count":37}}`;
    fetcher.mockImplementation(async () => new Response(body));
    const input = { platform: "wechatVideo", action: "video", params: { object_id: channelsId } } as const;
    const result = await client.query(input);
    expect(result.hits[0]).toMatchObject({
      externalId: channelsId,
      addable: true,
      metrics: { shares: 37 },
    });
    expect(result.hits[0]).not.toHaveProperty("canonicalUrl");
    expect(result.hits[0]!.metrics).not.toHaveProperty("favorites");
    expect((await client.queryForRadar(input)).hits[0]).toMatchObject({
      canonicalUrl: `https://creatoros.local/sources/wechatVideo/${channelsId}`,
      addable: true,
    });
  });

  it("付费返回只向对话暴露脱敏字段，雷达可临时使用笔记查询串", async () => {
    const { apiKey, client, fetcher } = setup();
    const token = randomUUID();
    const signature = randomUUID();
    const decodeMaterial = randomUUID();
    const privateHeader = randomUUID();
    const note = new URL(`https://www.xiaohongshu.com/explore/${noteId}`);
    note.searchParams.set("xsec_token", token);
    const media = new URL("https://media.example.test/clip.mp4");
    media.searchParams.set("signature", signature);
    const row = {
      id: noteId, url: note.href, is_video: true, video_url: media.href,
      video_decode_key: decodeMaterial, request_headers: { cookie: privateHeader },
      author_name: `不可信作者名称 ${privateHeader}`,
      title: `不可信标题 ${apiKey}`,
      text: `不可信摘要 ${media.href}`,
    };
    fetcher.mockImplementation(async () => json({ results: [row] }));
    const output = await client.query(xiaohongshuSearch);
    const serialized = JSON.stringify(output);
    for (const forbidden of [apiKey, token, signature, decodeMaterial, privateHeader, "video_decode_key", "request_headers"]) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(output.hits[0]).toMatchObject({ title: "[已隐藏敏感内容]", summary: "[已隐藏敏感内容]", authorName: "[已隐藏敏感内容]" });
    expect((await client.queryForRadar(xiaohongshuSearch)).hits[0]?.canonicalUrl).toBe(note.href);
    fetcher.mockResolvedValueOnce(json({ results: { id: noteId, url: note.href } }))
      .mockResolvedValueOnce(json({ results: { id: noteId, url: media.href } }));
    await expect(client.readXiaohongshuNoteUrl(noteId)).resolves.toBe(note.href);
    await expect(client.readXiaohongshuNoteUrl(noteId)).resolves.toBeUndefined();
  });
});
