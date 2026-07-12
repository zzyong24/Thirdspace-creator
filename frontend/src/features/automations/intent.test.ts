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

  it("「拉我作品的后台明细数据」→ self.detail(明细优先,T-030-D8a)", () => {
    const c = classifyIntent("每天拉我作品的后台明细数据");
    expect(c.sourceKind).toBe("self.detail");
    expect(c.confidence).toBe("high");
  });

  it("明细优先于评论/作品:「作品的明细完播和评论」→ self.detail", () => {
    // 同时含「作品」「明细」「完播」「评论」→ self.detail(最具体的意图落在明细导出)
    expect(classifyIntent("把我作品的明细完播率和评论都拉一下").sourceKind).toBe(
      "self.detail",
    );
  });

  it("「完播率/留存」等明细独有词命中 self.detail", () => {
    expect(classifyIntent("我想看完播率和留存").sourceKind).toBe("self.detail");
  });
});

describe("COLLECTION_TEMPLATES — 模板定义", () => {
  // 分类器覆盖域:freeform prompt 只确定性映射到这 3 个源(明细/评论/作品)。
  // 登记源驱动的 benchmark/topic.daily/favorites 是显式(模板卡/下拉)源,分类器不覆盖(设计如此)。
  const CLASSIFIER_KINDS = ["self.metrics", "comments", "self.detail"] as const;

  it("[T-258] 六张模板,一一对齐后端 DAILY_COLLECTION_JOB_DEFAULTS", () => {
    expect(COLLECTION_TEMPLATES).toHaveLength(6);

    const byId = Object.fromEntries(
      COLLECTION_TEMPLATES.map((t) => [t.id, t]),
    );
    // 前三张:有 per-job 手动 target 的源(明细模板 T-030-D8a 已翻真)。
    expect(byId["daily-self-metrics"]?.sourceKind).toBe("self.metrics");
    expect(byId["daily-comments"]?.sourceKind).toBe("comments");
    expect(byId["daily-detail"]?.sourceKind).toBe("self.detail");
    // 后三张([T-258] 补齐):登记源驱动的采集器,手动补建入口。
    expect(byId["daily-benchmark"]?.sourceKind).toBe("benchmark");
    expect(byId["daily-topic"]?.sourceKind).toBe("topic.daily");
    expect(byId["daily-favorites"]?.sourceKind).toBe("favorites");

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
      expect(t.cadence.mode).toBe("period");
    }
  });

  it("[T-258] 新增三张卡的 cadence 分钟与后端错峰 cron 对齐(benchmark 9:30 / topic.daily 9:40 / favorites 9:50)", () => {
    // 新增 3 卡按 backend DAILY_COLLECTION_JOB_DEFAULTS 的 cron 分钟错峰对齐(30/40/50)。
    // 原有 3 卡沿用 9:00 缺省(模板 cadence 只是「手动补建」时的友好预填,用户可改;与自动建 job
    // 的实际时刻各自独立,不强行改动既有 UX)。
    const newCardMinute: Record<string, number> = {
      "daily-benchmark": 30,
      "daily-topic": 40,
      "daily-favorites": 50,
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

  it("分类器覆盖域内的模板 prompt 经分类器映射回自身 sourceKind(自洽)", () => {
    // 仅对 3 个分类器覆盖的源做自洽校验;登记源驱动源(benchmark/topic.daily/favorites)是显式源,
    // 分类器不覆盖(prompt 里含「作品」等词会被分到 self.metrics,属预期,不参与自洽)。
    for (const t of COLLECTION_TEMPLATES) {
      if (!CLASSIFIER_KINDS.includes(t.sourceKind as (typeof CLASSIFIER_KINDS)[number])) {
        continue;
      }
      expect(classifyIntent(t.prompt).sourceKind).toBe(t.sourceKind);
    }
  });
});
