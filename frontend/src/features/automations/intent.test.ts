import { describe, expect, it } from "vitest";
import { scheduledJobSourceKind } from "@creatoros/contract";
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

  it("「拉我作品的后台明细数据」→ 统一 self.metrics", () => {
    const c = classifyIntent("每天拉我作品的后台明细数据");
    expect(c.sourceKind).toBe("self.metrics");
    expect(c.confidence).toBe("high");
  });

  it("明细优先于评论/作品，但归入统一作品数据任务", () => {
    expect(classifyIntent("把我作品的明细完播率和评论都拉一下").sourceKind).toBe(
      "self.metrics",
    );
  });

  it("「完播率/留存」等明细词命中 self.metrics", () => {
    expect(classifyIntent("我想看完播率和留存").sourceKind).toBe("self.metrics");
  });
});

describe("COLLECTION_TEMPLATES — 模板定义", () => {
  // 分类器覆盖域：freeform prompt 只确定性映射到作品数据或评论。
  // 登记源驱动的 benchmark/topic.daily/favorites 是显式(模板卡/下拉)源,分类器不覆盖(设计如此)。
  const CLASSIFIER_KINDS = ["self.metrics", "comments"] as const;

  it("[T-598] 通用模板只保留非内容雷达重复入口", () => {
    expect(COLLECTION_TEMPLATES).toHaveLength(2);

    const byId = Object.fromEntries(
      COLLECTION_TEMPLATES.map((t) => [t.id, t]),
    );
    expect(byId["daily-self-metrics"]?.sourceKind).toBe("self.metrics");
    expect(byId["daily-comments"]).toBeUndefined();
    expect(byId["daily-topic"]?.sourceKind).toBe("topic.daily");
    expect(byId["daily-detail"]).toBeUndefined();
    expect(byId["daily-benchmark"]).toBeUndefined();
    expect(byId["daily-favorites"]).toBeUndefined();

    for (const t of COLLECTION_TEMPLATES) {
      expect(t.prompt.length).toBeGreaterThan(0);
      expect(t.description.length).toBeGreaterThan(0);
    }
  });

  it("[T-258] 每张模板的 sourceKind 都是 contract 合法枚举值", () => {
    // 单一真值 scheduledJobSourceKind(6 值)。任一模板卡若带非法源 → 创建/调度校验会拒。
    const legal = new Set<string>(scheduledJobSourceKind.options);
    for (const t of COLLECTION_TEMPLATES) {
      expect(legal.has(t.sourceKind)).toBe(true);
    }
  });

  it("每个模板都带默认频率 cadence(每天)", () => {
    for (const t of COLLECTION_TEMPLATES) {
      expect(t.cadence.mode).toBe(t.sourceKind === "self.metrics" ? "interval" : "period");
    }
  });

  it("[T-598] 每日选题仍保留 9:40，内容雷达聚合作业不进入通用模板", () => {
    const newCardMinute: Record<string, number> = {
      "daily-topic": 40,
    };
    for (const [id, minute] of Object.entries(newCardMinute)) {
      const t = COLLECTION_TEMPLATES.find((x) => x.id === id);
      expect(t?.cadence.mode).toBe("period");
      if (t?.cadence.mode === "period") {
        expect(t.cadence.hour).toBe(9);
        expect(t.cadence.minute).toBe(minute);
      }
    }
    // 全部 6 卡都在 9 点档(period/hour=9)。
    for (const t of COLLECTION_TEMPLATES) {
      if (t.cadence.mode === "period") expect(t.cadence.hour).toBe(9);
    }
  });

  it("统一同步模板以用户选择的类型为准，描述不触发关键词改路由",()=>{
    expect(COLLECTION_TEMPLATES.find(t=>t.sourceKind==="self.metrics")?.cadence).toEqual({mode:"interval",unit:"hours",every:2});
  });
});
