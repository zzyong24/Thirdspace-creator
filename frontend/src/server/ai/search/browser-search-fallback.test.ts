import { describe, expect, it, vi } from "vitest";

import { searchBundledBrowserWithFallback } from "./browser-search-fallback";

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

  it("百度报错或零结果时切换 Bing，仍只返回真实 URL", async () => {
    const run = vi.fn(async (baseUrl: string | null) => {
      if (baseUrl) throw new Error("captcha");
      return [{ title: "备用来源", url: "https://example.com/b", snippet: "摘要" }];
    });
    const attempts: string[] = [];
    const rows = await searchBundledBrowserWithFallback("国内智能体", undefined, run, (attempt) => {
      attempts.push(`${attempt.engine}:${attempt.status}`);
    });
    expect(rows[0]?.url).toBe("https://example.com/b");
    expect(attempts).toEqual(["baidu:error", "bing:ok"]);
  });

  it("两个引擎都正常但无结果时诚实返回空，不造模型记忆素材", async () => {
    await expect(searchBundledBrowserWithFallback("没有结果", undefined, async () => [])).resolves.toEqual([]);
  });

  it("两个引擎都失败时返回可诊断聚合错误", async () => {
    await expect(
      searchBundledBrowserWithFallback("失败", undefined, async () => {
        throw new Error("blocked");
      }),
    ).rejects.toThrow(/baidu.*blocked.*bing.*blocked/);
  });
});
