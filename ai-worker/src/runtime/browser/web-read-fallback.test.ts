import { describe, it, expect, vi } from "vitest";
import {
  findAlternatesViaSearch,
  alternatesQueryForUrl,
  type AlternateSearcher,
} from "./web-read-fallback";

// [T-390] web.read 被拒后的搜索引擎替代来源回退 —— 纯编排单测(searcher 注入,不碰网络):
// 回退顺序 / 单路失败跳过 / 原 URL 过滤 / 去重 / 全空诚实返 []。

const alt = (url: string, title = "t") => ({ title, url, snippet: "s" });

describe("[T-390] alternatesQueryForUrl — 搜索 query 构造", () => {
  it("去协议(裸 URL 串搜索命中更稳)", () => {
    expect(alternatesQueryForUrl("https://36kr.com/p/123")).toBe("36kr.com/p/123");
    expect(alternatesQueryForUrl("http://example.com/a")).toBe("example.com/a");
  });
});

describe("[T-390] findAlternatesViaSearch — 多路回退编排", () => {
  it("调用前已取消时不启动任何搜索", async () => {
    const controller = new AbortController(); controller.abort();
    const search = vi.fn(async () => [alt("https://other.com/a")]);
    await expect(findAlternatesViaSearch("https://example.com/a", [search], { signal: controller.signal })).rejects.toThrow();
    expect(search).not.toHaveBeenCalled();
  });

  it("第一路搜索取消后抛错，不再启动下一路", async () => {
    const controller = new AbortController();
    const first = vi.fn(async () => { controller.abort(); throw new Error("中断"); });
    const second = vi.fn(async () => [alt("https://other.com/a")]);
    await expect(findAlternatesViaSearch("https://example.com/a", [first, second], { signal: controller.signal })).rejects.toThrow();
    expect(second).not.toHaveBeenCalled();
  });

  it("搜索收到同一信号，取消后的迟到结果不返回为候选", async () => {
    const controller = new AbortController();
    const search = vi.fn(async () => { controller.abort(); return [alt("https://other.com/a")]; });
    await expect(findAlternatesViaSearch("https://example.com/a", [search], { signal: controller.signal })).rejects.toThrow();
    expect(search).toHaveBeenCalledWith("example.com/a", 5, controller.signal);
  });
  it("第一路命中即返回,不再调后续路", async () => {
    const first = vi.fn(async () => [alt("https://a.com/1")]);
    const second = vi.fn(async () => [alt("https://b.com/2")]);
    const out = await findAlternatesViaSearch("https://36kr.com/p/1", [
      first,
      second,
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.url).toBe("https://a.com/1");
    expect(second).not.toHaveBeenCalled();
  });

  it("单路抛错(引擎反爬/未配 key)静默跳下一路", async () => {
    const failing: AlternateSearcher = async () => {
      throw new Error("browser 检索命中登录墙");
    };
    const ok = vi.fn(async () => [alt("https://b.com/2")]);
    const out = await findAlternatesViaSearch("https://36kr.com/p/1", [
      failing,
      ok,
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.url).toBe("https://b.com/2");
  });

  it("过滤原 URL 自身(协议/尾斜杠差异也算同一 URL)+ 去重;该路全被滤空则落下一路", async () => {
    const first = vi.fn(async () => [
      alt("http://36kr.com/p/1/"), // 原 URL 变体 → 滤掉
      alt("HTTPS://36KR.COM/p/1"), // 大小写 host 变体 → path 大小写不同?path 保留大小写,host 归一
    ]);
    const second = vi.fn(async () => [
      alt("https://other.com/x"),
      alt("https://other.com/x"), // 重复 → 去重
    ]);
    const out = await findAlternatesViaSearch("https://36kr.com/p/1", [
      first,
      second,
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.url).toBe("https://other.com/x");
  });

  it("非 http(s)/畸形 URL 的结果条目被过滤", async () => {
    const s = async () => [
      alt("javascript:alert(1)"),
      alt("ftp://x.com/a"),
      alt("https://good.com/a"),
    ];
    const out = await findAlternatesViaSearch("https://36kr.com/p/1", [s]);
    expect(out).toHaveLength(1);
    expect(out[0]!.url).toBe("https://good.com/a");
  });

  it("全部路失败/空 → 诚实返 [](不抛)", async () => {
    const failing: AlternateSearcher = async () => {
      throw new Error("x");
    };
    const empty: AlternateSearcher = async () => [];
    const out = await findAlternatesViaSearch("https://36kr.com/p/1", [
      failing,
      empty,
    ]);
    expect(out).toEqual([]);
  });

  it("截前 count 条(默认 5)", async () => {
    const many = async () =>
      Array.from({ length: 9 }, (_, i) => alt(`https://x.com/${i}`));
    const out = await findAlternatesViaSearch("https://36kr.com/p/1", [many]);
    expect(out).toHaveLength(5);
  });
});
