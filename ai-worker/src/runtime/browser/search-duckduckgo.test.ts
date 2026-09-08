import { expect, it } from "vitest";
import { parseDuckDuckGoResults, resolveDuckDuckGoResultUrl } from "./search-duckduckgo";
import { buildSearchUrl, parseSerpResults } from "./search-browser";

it("DuckDuckGo跳转还原真实HTTP地址并解码HTML字符引用", () => {
  const target = "https://example.com/help?a=1&b=2";
  expect(resolveDuckDuckGoResultUrl(`//duckduckgo.com/l/?uddg=${encodeURIComponent(target)}&amp;rut=trace`)).toBe(target);
  expect(resolveDuckDuckGoResultUrl("javascript:alert(1)")).toBe("");
  expect(resolveDuckDuckGoResultUrl("//duckduckgo.com/l/?uddg=javascript%3Aalert(1)")).toBe("");
  expect(resolveDuckDuckGoResultUrl("")).toBe("");
});

it("DuckDuckGo独立容器不借下一条标题或摘要", () => {
  const html = `<div class="result results_links"><a class="result__snippet">不能借给下一条</a></div>
    <div class="result results_links"><h2><a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fone&amp;rut=x">支付 &amp; KYC &#x1F4B3;</a></h2></div>
    <div class="result results_links"><h2><a href="https://example.com/two" class="result__a">第二条</a></h2><a class="result__snippet">资料 &quot;原文&quot; &#39;引用&#39;</a></div>`;
  expect(parseDuckDuckGoResults(html)).toEqual([
    { title: "支付 & KYC 💳", url: "https://example.com/one", snippet: "", siteName: "example.com" },
    { title: "第二条", url: "https://example.com/two", snippet: '资料 "原文" \'引用\'', siteName: "example.com" },
  ]);
  expect(parseSerpResults("https://html.duckduckgo.com/html/?q=支付", html)).toHaveLength(2);
});

it("默认引擎为DuckDuckGo，显式Bing模板保留", () => {
  const input = { provider: "browser" as const, baseUrl: null, model: "", token: "" };
  expect(buildSearchUrl(input, "支付 合规")).toBe("https://html.duckduckgo.com/html/?q=%E6%94%AF%E4%BB%98%20%E5%90%88%E8%A7%84");
  expect(buildSearchUrl({ ...input, baseUrl: "https://www.bing.com/search?q={q}" }, "支付")).toBe("https://www.bing.com/search?q=%E6%94%AF%E4%BB%98");
});
