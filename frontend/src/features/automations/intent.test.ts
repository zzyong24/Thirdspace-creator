import { describe, expect, it } from "vitest";
import {
  classifyIntent,
  COLLECTION_TEMPLATES,
} from "./intent";

// T-030-D7 采集意图分类器测试(SPEC §8.2 / D-f:确定性关键词分类,不引 LLM)。
// 确定性:纯函数,输入定则输出定。

describe("classifyIntent — freeform prompt → sourceKind", () => {
  it("「抓我作品的评论」→ comments(评论优先)", () => {
    const c = classifyIntent("抓我作品的评论");
    expect(c.sourceKind).toBe("comments");
    expect(c.confidence).toBe("high");
  });

  it("「每天抓我所有作品的最新评论」→ comments", () => {
    expect(classifyIntent("每天抓我所有作品的最新评论").sourceKind).toBe(
      "comments",
    );
  });

  it("「抓我的新作品数据」→ self.metrics", () => {
    const c = classifyIntent("抓我的新作品数据");
    expect(c.sourceKind).toBe("self.metrics");
    expect(c.confidence).toBe("high");
  });

  it("「每天抓我主页的新作品和播放量」→ self.metrics", () => {
    expect(
      classifyIntent("每天抓我主页的新作品和播放量").sourceKind,
    ).toBe("self.metrics");
  });

  it("评论词与作品词同现时评论优先(意图落在评论)", () => {
    // 同时含「作品」「指标」「评论」→ comments
    const c = classifyIntent("把我作品的指标和评论都抓一下");
    expect(c.sourceKind).toBe("comments");
  });

  it("留言 也归 comments", () => {
    expect(classifyIntent("抓一下留言").sourceKind).toBe("comments");
  });

  it("无关键词(歧义/空)→ 默认 self.metrics + low 置信", () => {
    const c = classifyIntent("随便抓点东西");
    expect(c.sourceKind).toBe("self.metrics");
    expect(c.confidence).toBe("low");
    const empty = classifyIntent("");
    expect(empty.sourceKind).toBe("self.metrics");
    expect(empty.confidence).toBe("low");
  });

  it("英文关键词也命中(comment / metric)", () => {
    expect(classifyIntent("fetch latest comments daily").sourceKind).toBe(
      "comments",
    );
    expect(classifyIntent("grab video metric snapshot").sourceKind).toBe(
      "self.metrics",
    );
  });
});

describe("COLLECTION_TEMPLATES — 模板定义", () => {
  it("前两张模板真做(非灰置),明细模板灰置", () => {
    const metrics = COLLECTION_TEMPLATES.find(
      (t) => t.id === "daily-self-metrics",
    );
    const comments = COLLECTION_TEMPLATES.find((t) => t.id === "daily-comments");
    const detail = COLLECTION_TEMPLATES.find((t) => t.id === "daily-detail");

    expect(metrics?.sourceKind).toBe("self.metrics");
    expect(metrics?.disabled).toBeFalsy();
    expect(metrics?.prompt.length).toBeGreaterThan(0);

    expect(comments?.sourceKind).toBe("comments");
    expect(comments?.disabled).toBeFalsy();
    expect(comments?.prompt.length).toBeGreaterThan(0);

    // 明细模板(D8a 后补)灰置占位
    expect(detail?.disabled).toBe(true);
  });

  it("每个模板都带默认频率 cadence(每天)", () => {
    for (const t of COLLECTION_TEMPLATES) {
      expect(t.cadence.mode).toBe("period");
    }
  });

  it("模板的 prompt 经分类器映射回自身 sourceKind(自洽)", () => {
    // 非灰置模板:prompt 用确定性分类器分出的意图应与模板声明的 sourceKind 一致。
    for (const t of COLLECTION_TEMPLATES.filter((x) => !x.disabled)) {
      expect(classifyIntent(t.prompt).sourceKind).toBe(t.sourceKind);
    }
  });
});
