import { describe, it, expect } from "vitest";
import {
  createResearchTools,
  RESEARCH_WEB_READ_WINDOW_CHARS,
  type ResearchPorts,
} from "./research-adapter";

// [T-256c] 调研适配器:web 搜索 / web.read 分窗(T-251)/ 知识写入门(pending,铁律②)。

const noSig = new AbortController().signal;
function toolsOf(over: Partial<ResearchPorts> = {}) {
  const writes: Array<{ title: string; note: string }> = [];
  const ports: ResearchPorts = {
    async webSearch({ query }) {
      return {
        grounding: "web",
        results: [{ title: `T-${query}`, url: "https://ex.com/x", snippet: "s" }],
      };
    },
    async webRead({ url }) {
      return {
        needLogin: false,
        title: "标题",
        fullText: "A".repeat(RESEARCH_WEB_READ_WINDOW_CHARS + 500),
        sourceUrl: url,
      };
    },
    async knowledgeWrite({ title, note }) {
      writes.push({ title, note });
      return { pendingId: "pk" };
    },
    ...over,
  };
  const byName = Object.fromEntries(
    createResearchTools(ports).map((t) => [t.name, t]),
  );
  return { byName, writes };
}

describe("createResearchTools", () => {
  it("三工具 + 副作用等级(web.search/web.read 只读,knowledge.write writeback)", () => {
    const { byName } = toolsOf();
    expect(Object.keys(byName).sort()).toEqual([
      "knowledge.write",
      "web.read",
      "web.search",
    ]);
    expect(byName["web.search"]!.effect).toBe("none");
    expect(byName["web.read"]!.effect).toBe("none");
    expect(byName["knowledge.write"]!.effect).toBe("writeback");
  });

  it("web.search:联网结果 + grounding 诚实", async () => {
    const { byName } = toolsOf();
    const r = await byName["web.search"]!.execute({ query: "选题" }, { signal: noSig, dryRun: false });
    expect(r.summary).toContain("联网检索到 1 条");
    expect((r.data as { results: unknown[] }).results.length).toBe(1);
  });

  it("web.read:全文按 T-251 窗口分窗截断,planInput 串上一步搜到的 URL", async () => {
    const { byName } = toolsOf();
    const read = byName["web.read"]!;
    // planInput 从 web.search 产出取第一个 url。
    const input = read.planInput!("goal", {
      "web.search": { results: [{ url: "https://ex.com/x" }] },
    });
    const r = await read.execute(input, { signal: noSig, dryRun: false });
    expect((r.data as { truncated: boolean }).truncated).toBe(true);
    expect((r.data as { text: string }).text.length).toBe(RESEARCH_WEB_READ_WINDOW_CHARS);
  });

  it("web.read:needLogin → 引导登录不抓(不抛)", async () => {
    const { byName } = toolsOf({
      async webRead() {
        return { needLogin: true, domain: "zhihu.com" };
      },
    });
    const r = await byName["web.read"]!.execute({ url: "https://zhihu.com/x" }, { signal: noSig, dryRun: false });
    expect(r.summary).toContain("需登录 zhihu.com");
    expect((r.data as { needLogin: boolean }).needLogin).toBe(true);
  });

  it("knowledge.write:非干跑落 pending;干跑只出计划不落(铁律② + SPEC §4.4)", async () => {
    const { byName, writes } = toolsOf();
    const w = byName["knowledge.write"]!;
    const dry = await w.execute(
      { title: "t", note: "n", sourceNote: "" },
      { signal: noSig, dryRun: true },
    );
    expect(dry.plan).toBeTruthy();
    expect(writes.length).toBe(0);
    const real = await w.execute(
      { title: "t", note: "n", sourceNote: "" },
      { signal: noSig, dryRun: false },
    );
    expect((real.data as { pendingId: string }).pendingId).toBe("pk");
    expect(writes.length).toBe(1);
  });
});
