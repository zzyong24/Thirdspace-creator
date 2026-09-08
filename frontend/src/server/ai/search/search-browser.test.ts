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
}): {
  deps: BrowserScrapeDeps;
  savedSlugs: string[];
  gotoOptions: Array<{ waitUntil?: string; timeout?: number }>;
} {
  const savedSlugs: string[] = [];
  const gotoOptions: Array<{ waitUntil?: string; timeout?: number }> = [];
  const page = {
    goto: async (_url: string, navigationOptions?: { waitUntil?: string; timeout?: number }) => {
      gotoOptions.push(navigationOptions ?? {});
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
    gotoOptions,
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
    const { deps, savedSlugs, gotoOptions } = fakeDeps({});
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
    expect(gotoOptions).toEqual([
      { waitUntil: "domcontentloaded", timeout: 20_000 },
    ]);
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

// ── [T-390] 百度 SERP 解析 + 引擎感知选择(素材搜集韧性:web.read 被拒回退多引擎)────────

const BAIDU_HTML = `<html><body><div id="content_left">
  <div class="result c-container new-pmd" srcid="1599" id="1" mu="https://a.com/article-1">
    <h3 class="c-title t t-tts"><a href="https://www.baidu.com/link?url=xyz" target="_blank">抖音<em>运营</em>指南</a></h3>
    <div class="c-gap"><span class="content-right_8Zs40">讲抖音运营的方法与技巧,涨粉实操路径。</span></div>
  </div>
  <div class="result-op c-container" id="2">运营卡片(无 mu,应跳过)</div>
  <div class="result c-container" id="3" mu="https://b.com/article-2">
    <h3><a href="https://www.baidu.com/link?url=abc">短视频脚本模板</a></h3>
  </div>
</div></body></html>`;

describe("[T-390] parseBaiduResults — 纯函数百度 SERP 解析", () => {
  it("从 result 块的 mu 属性取真实 URL(href 是 baidu.com/link 跳转链,不用),标题/摘要 best-effort", async () => {
    const { parseBaiduResults } = await import("./search-browser");
    const results = parseBaiduResults(BAIDU_HTML);
    expect(results).toHaveLength(2);
    expect(results[0]!.url).toBe("https://a.com/article-1");
    expect(results[0]!.title).toBe("抖音 运营 指南"); // <em> 标签剥离处空格归一
    expect(results[0]!.snippet).toContain("涨粉实操");
    expect(results[0]!.siteName).toBe("a.com");
    expect(results[1]!.url).toBe("https://b.com/article-2");
    expect(results[1]!.title).toBe("短视频脚本模板");
  });

  it("结构变了/无 mu → 诚实返 [](上层降级,不硬凑)", async () => {
    const { parseBaiduResults } = await import("./search-browser");
    expect(parseBaiduResults("<html>改版了</html>")).toEqual([]);
    expect(parseBaiduResults(BING_HTML)).toEqual([]);
  });
});

describe("[T-390] parseSerpResults — 按最终 host 选解析器", () => {
  it("baidu host → 百度解析;其余 → Bing 解析", async () => {
    const { parseSerpResults } = await import("./search-browser");
    const fromBaidu = parseSerpResults("https://www.baidu.com/s?wd=x", BAIDU_HTML);
    expect(fromBaidu[0]!.url).toBe("https://a.com/article-1");
    const fromBing = parseSerpResults("https://www.bing.com/search?q=x", BING_HTML);
    expect(fromBing[0]!.url).toBe("https://a.com/1");
  });

  it("主解析空结果时兜底试另一家(host 判断失误不归零)", async () => {
    const { parseSerpResults } = await import("./search-browser");
    // host 说是 bing,HTML 却是百度结构 → Bing 解析空 → 百度解析兜底。
    const out = parseSerpResults("https://www.bing.com/search?q=x", BAIDU_HTML);
    expect(out[0]!.url).toBe("https://a.com/article-1");
  });
});

describe("[T-390] createBrowserScrapeAdapter — baseUrl 指到百度也能解析", () => {
  it("百度 SERP(finalUrl baidu.com)→ 引擎感知解析出结果", async () => {
    const { deps } = fakeDeps({
      html: BAIDU_HTML,
      finalUrl: "https://www.baidu.com/s?wd=x",
    });
    const adapter = createBrowserScrapeAdapter(deps);
    const results = await adapter.search(
      browserSpec("https://www.baidu.com/s?wd={q}"),
      "抖音运营",
      OPTS,
    );
    expect(results).toHaveLength(2);
    expect(results[0]!.url).toBe("https://a.com/article-1");
  });
});

it("[T-919] Bing 跳转链接投影真实来源，拒绝非 HTTP 目标", () => {
  const target = "https://openai.com/index/example/?a=1&b=2";
  const wrap = (url: string) => `<li class="b_algo"><h2><a href="https://www.bing.com/ck/a?u=a1${Buffer.from(url).toString('base64url')}&amp;ntb=1">来源</a></h2></li>`;
  expect(parseBingResults(wrap(target))).toEqual([
    { title: "来源", url: target, snippet: "", siteName: "openai.com" },
  ]);
  expect(parseBingResults(wrap("javascript:alert(1)"))).toEqual([]);
});
