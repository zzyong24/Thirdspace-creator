import { describe, expect, it, vi } from "vitest";

import {
  createBrowserSearchFallbackState,
  searchBundledBrowserWithFallback,
} from "./browser-search-fallback";

describe("内置浏览器检索双引擎降级", () => {
  it("百度有结果时直接返回，不启动备用引擎", async () => {
    const run = vi.fn(async () => [
      { title: "国内来源", url: "https://example.cn/a", snippet: "摘要" },
    ]);
    await expect(searchBundledBrowserWithFallback("湖南餐饮 IP", { count: 8 }, run)).resolves.toHaveLength(1);
    expect(run).toHaveBeenCalledTimes(1);
    const calls = run.mock.calls as unknown as Array<[string | null]>;
    expect(calls[0]?.[0]).toContain("baidu.com");
  });

  it("百度报错或零结果时切换 DuckDuckGo，仍只返回真实 URL", async () => {
    const run = vi.fn(async (baseUrl: string | null) => {
      if (baseUrl) throw new Error("captcha");
      return [{ title: "备用来源", url: "https://example.com/b", snippet: "摘要" }];
    });
    const attempts: string[] = [];
    const rows = await searchBundledBrowserWithFallback("国内智能体", undefined, run, (attempt) => {
      attempts.push(`${attempt.engine}:${attempt.status}`);
    });
    expect(rows[0]?.url).toBe("https://example.com/b");
    expect(attempts).toEqual(["baidu:error", "duckduckgo:ok"]);
  });

  it("两个引擎都正常但无结果时诚实返回空，不造模型记忆素材", async () => {
    await expect(searchBundledBrowserWithFallback("没有结果", undefined, async () => [])).resolves.toEqual([]);
  });

  it("两个引擎都失败时返回可诊断聚合错误", async () => {
    await expect(
      searchBundledBrowserWithFallback("失败", undefined, async () => {
        throw new Error("blocked");
      }),
    ).rejects.toThrow(/baidu.*blocked.*duckduckgo.*blocked/);
  });

  it("同一运行轮次已确认百度登录墙后有界跳过，冷却到期再真实重试", async () => {
    let now = 1_000;
    const state = createBrowserSearchFallbackState();
    const runtime = {
      state,
      now: () => now,
      loginWallCooldownMs: 60_000,
    };
    const calls: Array<string | null> = [];
    const attempts: string[] = [];
    const run = async (baseUrl: string | null) => {
      calls.push(baseUrl);
      if (baseUrl) throw new Error("检索命中登录墙 / 反爬验证");
      return [{ title: "DuckDuckGo", url: "https://example.com", snippet: "真实结果" }];
    };

    await searchBundledBrowserWithFallback("第一次", undefined, run, undefined, runtime);
    await searchBundledBrowserWithFallback("第二次", undefined, run, (attempt) => {
      attempts.push(`${attempt.engine}:${attempt.status}`);
    }, runtime);

    expect(calls).toEqual([
      expect.stringContaining("baidu.com"),
      null,
      null,
    ]);
    expect(attempts).toEqual(["baidu:skipped", "duckduckgo:ok"]);

    now += 60_001;
    await searchBundledBrowserWithFallback("冷却后", undefined, run, undefined, runtime);
    expect(calls.at(-2)).toEqual(expect.stringContaining("baidu.com"));
    expect(calls.at(-1)).toBeNull();
  });

  it("普通网络失败不会误封百度", async () => {
    const state = createBrowserSearchFallbackState();
    let baiduCalls = 0;
    const run = async (baseUrl: string | null) => {
      if (baseUrl) {
        baiduCalls += 1;
        throw new Error("ECONNRESET");
      }
      return [{ title: "DuckDuckGo", url: "https://example.com", snippet: "真实结果" }];
    };
    const runtime = { state, now: () => 1_000 };

    await searchBundledBrowserWithFallback("a", undefined, run, undefined, runtime);
    await searchBundledBrowserWithFallback("b", undefined, run, undefined, runtime);

    expect(baiduCalls).toBe(2);
  });
});

it("T-915 取消后不再启动 DuckDuckGo，也不把取消改写成搜索失败", async () => {
  const controller = new AbortController();
  const run = vi.fn(async () => {controller.abort(); throw controller.signal.reason;});
  await expect(searchBundledBrowserWithFallback("查来源", {signal: controller.signal}, run)).rejects.toBe(controller.signal.reason);
  expect(run).toHaveBeenCalledTimes(1);
});
