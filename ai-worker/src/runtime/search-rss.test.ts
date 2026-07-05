import { describe, it, expect } from "vitest";
import { createRssAdapter } from "./search-rss";
import {
  searchWeb,
  SearchExecutionError,
  type SearchProviderRegistry,
  type SearchSpec,
} from "./search-factory";

// T-126a:用注入 fake fetch 验 RSS/Atom 适配器的**响应映射 + query 过滤**(不走网络、免 key)。
// RSS 返 XML 文本(非 JSON),故用 textResponse helper。

function textResponse(body: string, ok = true, status = 200): Response {
  return { ok, status, text: async () => body } as unknown as Response;
}

const OPTS = { count: 10, timeoutMs: 5000 };
const rssSpec = (baseUrl: string | null): SearchSpec => ({
  provider: "rss",
  baseUrl,
  model: "",
  token: "",
});

const RSS_XML = `<?xml version="1.0"?><rss version="2.0"><channel>
  <item><title>抖音运营技巧</title><link>https://a.com/1</link><description>讲抖音运营的方法</description><pubDate>Wed, 02 Jul 2026 10:00:00 GMT</pubDate></item>
  <item><title><![CDATA[小红书增长]]></title><link>https://a.com/2</link><description><![CDATA[小红书涨粉]]></description><pubDate>Wed, 01 Jul 2026 10:00:00 GMT</pubDate></item>
  <item><title>无关内容</title><link>https://a.com/3</link><description>美食做法</description><pubDate>Wed, 03 Jul 2026 10:00:00 GMT</pubDate></item>
</channel></rss>`;

const ATOM_XML = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
  <entry><title>抖音算法解读</title><link href="https://b.com/x" rel="alternate"/><summary>抖音推荐算法</summary><updated>2026-07-04T10:00:00Z</updated></entry>
</feed>`;

describe("RSS 适配器(T-126a) —— 免 key 检索响应映射", () => {
  it("解 RSS <item> → SearchResult,按 query token 过滤 + pubDate 倒序 + siteName=hostname", async () => {
    const fake = (async () => textResponse(RSS_XML)) as unknown as typeof fetch;
    const results = await createRssAdapter(fake).search(
      rssSpec("https://a.com/feed.xml"),
      "抖音",
      OPTS,
    );
    // 只有第 1 条标题/描述含「抖音」;小红书/美食条不含 → 过滤掉。
    expect(results.map((r) => r.url)).toEqual(["https://a.com/1"]);
    expect(results[0]?.title).toBe("抖音运营技巧");
    expect(results[0]?.siteName).toBe("a.com");
    expect(results[0]?.publishedAt).toBeTruthy();
  });

  it("解 Atom <entry>(link href 属性 + summary + CDATA 兼容)", async () => {
    const fake = (async () => textResponse(ATOM_XML)) as unknown as typeof fetch;
    const results = await createRssAdapter(fake).search(
      rssSpec("https://b.com/atom"),
      "抖音",
      OPTS,
    );
    expect(results.map((r) => r.url)).toEqual(["https://b.com/x"]);
    expect(results[0]?.title).toBe("抖音算法解读");
  });

  it("query 无命中 → 返 [](诚实,不假装有素材)", async () => {
    const fake = (async () => textResponse(RSS_XML)) as unknown as typeof fetch;
    const results = await createRssAdapter(fake).search(
      rssSpec("https://a.com/feed.xml"),
      "量子计算",
      OPTS,
    );
    expect(results).toEqual([]);
  });

  it("多 feed(逗号分隔)合并 + 按 url 去重", async () => {
    const fake = (async (url: string) =>
      textResponse(url.includes("atom") ? ATOM_XML : RSS_XML)) as unknown as typeof fetch;
    const results = await createRssAdapter(fake).search(
      rssSpec("https://a.com/feed.xml, https://b.com/atom"),
      "抖音",
      OPTS,
    );
    expect(results.map((r) => r.url).sort()).toEqual([
      "https://a.com/1",
      "https://b.com/x",
    ]);
  });

  it("无 baseUrl → SearchExecutionError(需配 feed)", async () => {
    const fake = (async () => textResponse("")) as unknown as typeof fetch;
    await expect(
      createRssAdapter(fake).search(rssSpec(null), "抖音", OPTS),
    ).rejects.toBeInstanceOf(SearchExecutionError);
  });

  it("所有 feed HTTP 失败 → SearchExecutionError(上层 catch 成 model_memory 降级)", async () => {
    const fake = (async () =>
      textResponse("nope", false, 500)) as unknown as typeof fetch;
    await expect(
      createRssAdapter(fake).search(rssSpec("https://a.com/feed.xml"), "抖音", OPTS),
    ).rejects.toBeInstanceOf(SearchExecutionError);
  });

  it("经 searchWeb 工厂 + registry 分派到 rss provider", async () => {
    const fake = (async () => textResponse(RSS_XML)) as unknown as typeof fetch;
    const registry: SearchProviderRegistry = { rss: createRssAdapter(fake) };
    const results = await searchWeb(
      rssSpec("https://a.com/feed.xml"),
      "抖音",
      registry,
      OPTS,
    );
    expect(results[0]?.url).toBe("https://a.com/1");
  });
});
