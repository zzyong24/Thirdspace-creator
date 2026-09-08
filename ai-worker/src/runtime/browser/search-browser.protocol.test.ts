import { describe, expect, it } from "vitest";
import { assertSearchQueryIdentity, buildSearchUrl, createBrowserScrapeAdapter, parseBaiduResults } from "./search-browser";
import type { SearchSpec } from "../search-factory";
const spec = (baseUrl: string | null): SearchSpec => ({ provider: "browser", baseUrl, model: "", token: "" });

describe("搜索回执传输身份（无网络）", () => {
  it("中文多词及特殊字符完整保留，正常跟踪参数和地区子域不改查询", () => {
    const query = "个人开发者 支付合规 & KYC + 税务";
    for (const baseUrl of [null, "https://www.baidu.com/s?wd={q}"]) {
      const requested = buildSearchUrl(spec(baseUrl), query);
      const actual = new URL(requested);
      actual.searchParams.set("tracking", "1");
      if (!baseUrl) actual.hostname = "duckduckgo.com";
      expect(() => assertSearchQueryIdentity(requested, actual.href, query)).not.toThrow();
    }
  });
  it("不同查询、缺字段、重复字段和不同引擎不能算原查询结果", () => {
    const url = buildSearchUrl(spec("https://www.bing.com/search?q={q}"), "支付合规");
    for (const actual of ["https://www.bing.com/search?q=plumber", "https://www.bing.com/", `${url}&q=other`, "https://www.baidu.com/s?wd=支付合规"]) {
      expect(() => assertSearchQueryIdentity(url, actual, "支付合规")).toThrow();
    }
  });
  it("自定义查询参数允许地区跳转和跟踪参数，仍拒绝查询值改变", () => {
    const requested = buildSearchUrl(spec("https://search.example/search?query={q}&lang=zh"), "支付 合规");
    expect(() => assertSearchQueryIdentity(requested, "https://cn.search.example/find?query=支付+合规&lang=zh-CN&source=desktop", "支付 合规")).not.toThrow();
    expect(() => assertSearchQueryIdentity(requested, "https://cn.search.example/find?query=other", "支付 合规")).toThrow();
  });
  it("自定义路径查询允许地区前缀和尾斜线，仍拒绝明确查询段丢失", () => {
    const requested = buildSearchUrl(spec("https://search.example/search/{q}"), "支付 合规");
    expect(() => assertSearchQueryIdentity(requested, "https://cn.search.example/zh/search/支付%20合规/?source=desktop", "支付 合规")).not.toThrow();
    expect(() => assertSearchQueryIdentity(requested, "https://cn.search.example/zh/search/other/", "支付 合规")).toThrow();
  });
  it("未知自定义载体不新增推测约束", () => {
    const requested = buildSearchUrl(spec("https://search.example/search?term=prefix-{q}"), "支付合规");
    expect(() => assertSearchQueryIdentity(requested, "https://cn.search.example/result?opaque=123", "支付合规")).not.toThrow();
  });
  it("读取DOM过程中换成另一查询会拒绝，追加跟踪参数仍可用", async () => {
    for (const changeQuery of [true, false]) {
      let pageUrl = "";
      const adapter = createBrowserScrapeAdapter({ openContext: async () => ({
        newPage: async () => ({ goto: async url => { pageUrl = url; return { status: () => 200, url: () => url }; },
          url: () => pageUrl, title: async () => "", content: async () => {
            pageUrl = changeQuery ? "https://www.bing.com/search?q=other" : `${pageUrl}&tracking=1`;
            return '<li class="b_algo"><h2><a href="https://example.com">资料</a></h2></li>';
          }, screenshot: async () => new Uint8Array() }), close: async () => {},
      }), saveScreenshot: async () => {} });
      const result = adapter.search(spec("https://www.bing.com/search?q={q}"), "支付合规", { count: 10, timeoutMs: 15000 });
      if (changeQuery) await expect(result).rejects.toThrow("查询词");
      else expect(await result).toHaveLength(1);
    }
  });
  it("实际页面改词时不能被旧导航响应掩盖，且仍关闭上下文", async () => {
    let requested = "", closed = false;
    const adapter = createBrowserScrapeAdapter({ openContext: async () => ({
      newPage: async () => ({ goto: async url => { requested = url; return { status: () => 200, url: () => requested }; },
        url: () => "https://www.bing.com/search?q=Redmond+plumber", title: async () => "", content: async () => '<li class="b_algo"><h2><a href="https://example.com">水管工</a></h2></li>', screenshot: async () => new Uint8Array() }),
      close: async () => { closed = true; },
    }), saveScreenshot: async () => {} });
    await expect(adapter.search(spec("https://www.bing.com/search?q={q}"), "支付合规", { count: 10, timeoutMs: 15000 })).rejects.toThrow("查询词");
    expect(closed).toBe(true);
  });
});

it("百度下一结果标题与摘要不能串到无标题上一条", () => {
  const rows = parseBaiduResults('<div class="result c-container" mu="https://example.com/first"></div><div class="result c-container" mu="https://example.com/second"><h3><a>第二条标题</a></h3><span class="content-right">第二条摘要</span></div>');
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ url: "https://example.com/second", title: "第二条标题", snippet: "第二条摘要" });
});
