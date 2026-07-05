import { describe, it, expect } from "vitest";
import {
  buildSearchUrl,
  parseBingResults,
  createBrowserScrapeAdapter,
  type BrowserScrapeDeps,
} from "./search-browser";
import { SearchExecutionError, type SearchSpec } from "@creatoros/ai-worker";

// T-126b:浏览器搜索适配器。纯函数(buildSearchUrl/parseBingResults)+ 注入 fake openContext/screenshot
// 验导航→解析→自截图→登录墙/HTTP 降级,不起真浏览器。

const OPTS = { count: 10, timeoutMs: 5000 };
const browserSpec = (baseUrl: string | null): SearchSpec => ({
  provider: "browser",
  baseUrl,
  model: "",
  token: "",
});

const BING_HTML = `<html><body><ol id="b_results">
  <li class="b_algo"><h2><a href="https://a.com/1">抖音运营指南</a></h2><div class="b_caption"><p>讲抖音运营的方法与技巧,涨粉实操</p></div></li>
  <li class="b_algo"><h2><a href="https://b.com/2">短视频脚本模板</a></h2><p>短视频脚本写作框架</p></li>
  <li class="b_algo"><h2><a href="javascript:void(0)">广告位</a></h2><p>非 http 链接应被丢弃</p></li>
</ol></body></html>`;

// 造一个满足 CaptureCapableContext 的 fake(page 只实现用到的能力)。
function fakeDeps(opts: {
  html?: string;
  status?: number;
  finalUrl?: string;
  gotoThrows?: boolean;
}): { deps: BrowserScrapeDeps; savedSlugs: string[] } {
  const savedSlugs: string[] = [];
  const page = {
    goto: async () => {
      if (opts.gotoThrows) throw new Error("net::ERR_TIMED_OUT");
      return {
        status: () => opts.status ?? 200,
        url: () => opts.finalUrl ?? "https://www.bing.com/search?q=x",
      };
    },
    url: () => opts.finalUrl ?? "https://www.bing.com/search?q=x",
    title: async () => "Bing",
    content: async () => opts.html ?? BING_HTML,
    screenshot: async () => new Uint8Array([1, 2, 3]),
  };
  const ctx = {
    newPage: async () => page,
    close: async () => {},
  };
  return {
    deps: {
      openContext: async () => ctx as unknown as never,
      saveScreenshot: async (_b: Uint8Array, slug: string) => {
        savedSlugs.push(slug);
      },
    },
    savedSlugs,
  };
}

describe("buildSearchUrl(T-126b)", () => {
  it("无 baseUrl → 默认 Bing,query 编码进 {q}", () => {
    expect(buildSearchUrl(browserSpec(null), "抖音 运营")).toBe(
      `https://www.bing.com/search?q=${encodeURIComponent("抖音 运营")}`,
    );
  });
  it("baseUrl 含 {q} 模板 → 替换", () => {
    expect(
      buildSearchUrl(browserSpec("https://www.baidu.com/s?wd={q}"), "脚本"),
    ).toBe(`https://www.baidu.com/s?wd=${encodeURIComponent("脚本")}`);
  });
});

describe("parseBingResults(T-126b) —— 纯函数 SERP 解析", () => {
  it("解 b_algo 块 → title/url/snippet/siteName,丢弃非 http 链接", () => {
    const results = parseBingResults(BING_HTML);
    expect(results.map((r) => r.url)).toEqual([
      "https://a.com/1",
      "https://b.com/2",
    ]);
    expect(results[0]?.title).toBe("抖音运营指南");
    expect(results[0]?.snippet).toContain("涨粉实操");
    expect(results[0]?.siteName).toBe("a.com");
  });
  it("Bing 改版/无匹配 → 返 [](上层降级 model_memory)", () => {
    expect(parseBingResults("<html>结构变了</html>")).toEqual([]);
  });
});

describe("createBrowserScrapeAdapter(T-126b) —— 导航→解析→自截图→降级", () => {
  it("正常:导航成功 → 解析结果 + 触发自截图存证", async () => {
    const { deps, savedSlugs } = fakeDeps({});
    const results = await createBrowserScrapeAdapter(deps).search(
      browserSpec(null),
      "抖音运营",
      OPTS,
    );
    expect(results.map((r) => r.url)).toEqual([
      "https://a.com/1",
      "https://b.com/2",
    ]);
    expect(savedSlugs.length).toBe(1); // 截图存证被调用
  });

  it("命中登录墙/验证码 → SearchExecutionError(上层降级)", async () => {
    const { deps } = fakeDeps({ html: "<html>请完成人机验证 captcha</html>" });
    await expect(
      createBrowserScrapeAdapter(deps).search(browserSpec(null), "抖音", OPTS),
    ).rejects.toBeInstanceOf(SearchExecutionError);
  });

  it("HTTP 4xx → SearchExecutionError", async () => {
    const { deps } = fakeDeps({ status: 403 });
    await expect(
      createBrowserScrapeAdapter(deps).search(browserSpec(null), "抖音", OPTS),
    ).rejects.toBeInstanceOf(SearchExecutionError);
  });

  it("导航失败(超时/DNS)→ SearchExecutionError", async () => {
    const { deps } = fakeDeps({ gotoThrows: true });
    await expect(
      createBrowserScrapeAdapter(deps).search(browserSpec(null), "抖音", OPTS),
    ).rejects.toBeInstanceOf(SearchExecutionError);
  });
});
