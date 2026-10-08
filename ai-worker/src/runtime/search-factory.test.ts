import { describe, it, expect, vi } from "vitest";
import {
  searchWeb,
  SearchConfigError,
  SearchExecutionError,
  type SearchProviderRegistry,
  type SearchSpec,
} from "./search-factory";
import { createBochaAdapter } from "./search-bocha";
import { createTavilyAdapter } from "./search-tavily";
import { createSerpapiAdapter } from "./search-serpapi";

// 用注入的 fake fetch 验三家搜索适配器的**响应映射**(不走网络、不需 key)。这覆盖真产物没法
// 零成本验的那部分逻辑:各家异构响应 → 归一 SearchResult[]。真 endpoint 语义留给用户配 key 后。

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

const bochaSpec: SearchSpec = {
  provider: "bocha",
  baseUrl: null,
  model: "",
  token: "sk-bocha",
};
const tavilySpec: SearchSpec = {
  provider: "tavily",
  baseUrl: null,
  model: "",
  token: "sk-tavily",
};
const serpapiSpec: SearchSpec = {
  provider: "serpapi",
  baseUrl: null,
  model: "",
  token: "sk-serp",
};

describe("Bocha 适配器 —— 响应映射", () => {
  it("POST /v1/web-search,解 data.webPages.value[] → SearchResult(优先 summary,回填 siteName/datePublished)", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fakeFetch = (async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return jsonResponse({
        data: {
          webPages: {
            value: [
              {
                name: "AI 提效复盘",
                url: "https://a.com/x",
                snippet: "短摘要",
                summary: "完整摘要更长",
                siteName: "a.com",
                datePublished: "2026-07-01",
              },
              // 无 URL 的结果 → 丢弃(诚实,不留空链)
              { name: "无链接", snippet: "s" },
            ],
          },
        },
      });
    }) as unknown as typeof fetch;

    const adapter = createBochaAdapter(fakeFetch);
    const results = await adapter.search(bochaSpec, "AI 提效", {
      count: 10,
      timeoutMs: 10000,
    });
    // Bearer 鉴权 + POST + body 带 query/count
    expect(calls[0]?.url).toContain("/v1/web-search");
    expect((calls[0]?.init?.headers as Record<string, string>).Authorization).toBe(
      "Bearer sk-bocha",
    );
    const body = JSON.parse(String(calls[0]?.init?.body));
    expect(body.query).toBe("AI 提效");
    expect(body.count).toBe(10);
    // 映射:只保留有 URL 的一条,snippet 取 summary(优先),带 siteName/publishedAt
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      title: "AI 提效复盘",
      url: "https://a.com/x",
      snippet: "完整摘要更长",
      publishedAt: "2026-07-01",
      siteName: "a.com",
    });
  });

  it("兼容不套 data 的响应(直接 webPages.value)", async () => {
    const fakeFetch = (async () =>
      jsonResponse({
        webPages: { value: [{ name: "T", url: "https://b.com", snippet: "s" }] },
      })) as unknown as typeof fetch;
    const results = await createBochaAdapter(fakeFetch).search(bochaSpec, "q", {
      count: 5,
      timeoutMs: 10000,
    });
    expect(results).toHaveLength(1);
    expect(results[0]?.url).toBe("https://b.com");
  });

  it("HTTP 非 2xx → SearchExecutionError", async () => {
    const fakeFetch = (async () =>
      jsonResponse({ msg: "bad key" }, false, 401)) as unknown as typeof fetch;
    await expect(
      createBochaAdapter(fakeFetch).search(bochaSpec, "q", {
        count: 5,
        timeoutMs: 10000,
      }),
    ).rejects.toThrow(SearchExecutionError);
  });
});

describe("Tavily 适配器 —— 响应映射", () => {
  it("POST /search,解 results[] → SearchResult(content→snippet,url 派生 siteName)", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fakeFetch = (async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return jsonResponse({
        results: [
          {
            title: "Tavily 结果",
            url: "https://www.example.org/a",
            content: "正文片段",
            score: 0.9,
            published_date: "2026-06-30",
          },
        ],
      });
    }) as unknown as typeof fetch;

    const results = await createTavilyAdapter(fakeFetch).search(
      tavilySpec,
      "hello",
      { count: 8, timeoutMs: 10000 },
    );
    expect(calls[0]?.url).toContain("/search");
    const body = JSON.parse(String(calls[0]?.init?.body));
    expect(body.max_results).toBe(8);
    expect(results[0]).toEqual({
      title: "Tavily 结果",
      url: "https://www.example.org/a",
      snippet: "正文片段",
      publishedAt: "2026-06-30",
      siteName: "example.org", // www. 去掉
    });
  });
});

describe("SerpApi 适配器 —— 响应映射", () => {
  it("GET /search?engine=google&q=…&api_key=…,解 organic_results[] → SearchResult", async () => {
    const calls: string[] = [];
    const fakeFetch = (async (url: string) => {
      calls.push(String(url));
      return jsonResponse({
        organic_results: [
          {
            title: "Coffee - Wikipedia",
            link: "https://en.wikipedia.org/wiki/Coffee",
            snippet: "Coffee is a brewed drink",
            source: "Wikipedia",
            date: "Sep 20, 2018",
          },
        ],
      });
    }) as unknown as typeof fetch;

    const results = await createSerpapiAdapter(fakeFetch).search(
      serpapiSpec,
      "coffee",
      { count: 10, timeoutMs: 10000 },
    );
    // api_key 在 query(SerpApi 官方约定),engine 默认 google
    expect(calls[0]).toContain("engine=google");
    expect(calls[0]).toContain("q=coffee");
    expect(calls[0]).toContain("api_key=sk-serp");
    expect(results[0]).toEqual({
      title: "Coffee - Wikipedia",
      url: "https://en.wikipedia.org/wiki/Coffee",
      snippet: "Coffee is a brewed drink",
      publishedAt: "Sep 20, 2018",
      siteName: "Wikipedia", // 优先 source
    });
  });

  it("engine 走 spec.model(用户可配),响应 error 字段 → SearchExecutionError", async () => {
    const calls: string[] = [];
    const fakeFetch = (async (url: string) => {
      calls.push(String(url));
      return jsonResponse({ error: "Invalid API key" });
    }) as unknown as typeof fetch;
    await expect(
      createSerpapiAdapter(fakeFetch).search(
        { ...serpapiSpec, model: "bing" },
        "q",
        { count: 5, timeoutMs: 10000 },
      ),
    ).rejects.toThrow(/Invalid API key/);
    expect(calls[0]).toContain("engine=bing");
  });
});

describe("searchWeb 工厂 —— registry 分派", () => {
  const registry: SearchProviderRegistry = {
    bocha: createBochaAdapter(
      (async () =>
        jsonResponse({
          data: { webPages: { value: [{ name: "T", url: "https://c.com" }] } },
        })) as unknown as typeof fetch,
    ),
  };

  it("按 provider 命中适配器 → 返 SearchResult[]", async () => {
    const results = await searchWeb(bochaSpec, "q", registry);
    expect(results[0]?.url).toBe("https://c.com");
  });

  it("未注册 provider → SearchConfigError", async () => {
    await expect(
      searchWeb({ ...bochaSpec, provider: "unknown" }, "q", registry),
    ).rejects.toThrow(SearchConfigError);
  });

  it("空 query → 空数组(不打网络)", async () => {
    const results = await searchWeb(bochaSpec, "   ", registry);
    expect(results).toEqual([]);
  });

  it("超时(AbortError)→ SearchExecutionError", async () => {
    const abortFetch = (async (_url: string, init?: RequestInit) => {
      // 模拟 fetch 因 abort 抛 AbortError
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (signal?.aborted) {
          const e = new Error("aborted");
          e.name = "AbortError";
          reject(e);
          return;
        }
        signal?.addEventListener("abort", () => {
          const e = new Error("aborted");
          e.name = "AbortError";
          reject(e);
        });
      });
    }) as unknown as typeof fetch;
    vi.useFakeTimers();
    try {
      const waiting=searchWeb({ ...bochaSpec }, "q", { bocha: createBochaAdapter(abortFetch) }, {timeoutMs:5});
      const rejected=expect(waiting).rejects.toThrow(SearchExecutionError);
      await vi.advanceTimersByTimeAsync(119_999);
      await vi.advanceTimersByTimeAsync(1);
      await rejected;
    } finally {vi.useRealTimers();}
  });
});

it("T-915 响应头已到、正文未结束时取消仍终止读取", async () => {
  const controller = new AbortController();
  let bodyStarted!: () => void;
  const started = new Promise<void>(resolve => { bodyStarted = resolve; });
  const fetchImpl = (async (_url: unknown, init?: RequestInit) => {
    const body = new ReadableStream({start(stream) {
      init?.signal?.addEventListener("abort", () => stream.error(init.signal?.reason), {once: true});
      bodyStarted();
    }});
    return new Response(body);
  }) as typeof fetch;
  const pending = searchWeb(bochaSpec, "查来源", {bocha: createBochaAdapter(fetchImpl)}, {signal: controller.signal});
  await started;
  // 让 fetch 的响应头到达调用方。
  await Promise.resolve(); await Promise.resolve();
  controller.abort();
  await expect(pending).rejects.toBe(controller.signal.reason);
});
