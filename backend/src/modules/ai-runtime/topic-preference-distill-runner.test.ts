import { describe, it, expect, vi } from "vitest";
import type { RequestContext } from "@creatoros/contract";
import type { TopicPreferenceDistillOutput } from "@creatoros/ai-worker";
import {
  runTopicPreferenceDistill,
  type TopicPreferenceDistillDeps,
} from "./topic-preference-distill-runner";

// [T-212d] 淘汰原因蒸馏编排单测 —— 纯编排,注入 fake AI/落库端口(不碰真 AI、真库)。

const ctx: RequestContext = { userId: "u1", requestId: "r1", source: "user" };

const twoSignals: TopicPreferenceDistillOutput = {
  偏好信号: [
    { signal: "不喜欢纯理论", keyword: "理论", direction: "avoid", supportingCount: 3 },
    { signal: "偏好真实案例", keyword: "案例", direction: "prefer", supportingCount: 4 },
  ],
};

describe("runTopicPreferenceDistill", () => {
  it("无淘汰原因 → 诚实空跑,不调 AI", async () => {
    const distill = vi.fn(async () => twoSignals);
    const upsertPreference = vi.fn(async () => ({}));
    const deps: TopicPreferenceDistillDeps = {
      listDropReasons: async () => [],
      distill,
      upsertPreference,
    };
    const res = await runTopicPreferenceDistill(ctx, deps);
    expect(res).toEqual({ reasonsSeen: 0, upserted: 0 });
    expect(distill).not.toHaveBeenCalled();
    expect(upsertPreference).not.toHaveBeenCalled();
  });

  it("蒸馏 → 逐条 upsert(透传 supportingCount 作 exampleCount,方向/keyword 保真)", async () => {
    const upsertPreference = vi.fn(async () => ({}));
    const deps: TopicPreferenceDistillDeps = {
      listDropReasons: async () => ["太理论了", "又是纯理论", "还是理论没案例"],
      distill: async () => twoSignals,
      upsertPreference,
    };
    const res = await runTopicPreferenceDistill(ctx, deps);
    expect(res.reasonsSeen).toBe(3);
    expect(res.upserted).toBe(2);
    expect(upsertPreference).toHaveBeenCalledWith(ctx, {
      keyword: "理论",
      direction: "avoid",
      signal: "不喜欢纯理论",
      exampleCount: 3,
    });
    expect(upsertPreference).toHaveBeenCalledWith(ctx, {
      keyword: "案例",
      direction: "prefer",
      signal: "偏好真实案例",
      exampleCount: 4,
    });
  });

  it("防灌库:keyword 空的信号被跳过", async () => {
    const upsertPreference = vi.fn(async () => ({}));
    const deps: TopicPreferenceDistillDeps = {
      listDropReasons: async () => ["a"],
      distill: async () => ({
        偏好信号: [
          { signal: "空词", keyword: "  ", direction: "avoid", supportingCount: 5 },
          { signal: "有词", keyword: "复盘", direction: "avoid", supportingCount: 3 },
        ],
      }),
      upsertPreference,
    };
    const res = await runTopicPreferenceDistill(ctx, deps);
    expect(res.upserted).toBe(1);
    expect(upsertPreference).toHaveBeenCalledTimes(1);
  });

  it("best-effort:单条 upsert 失败跳过,不崩整批", async () => {
    const upsertPreference = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({});
    const deps: TopicPreferenceDistillDeps = {
      listDropReasons: async () => ["a"],
      distill: async () => twoSignals,
      upsertPreference,
    };
    const res = await runTopicPreferenceDistill(ctx, deps);
    expect(res.upserted).toBe(1); // 第一条抛错跳过,第二条成功
    expect(upsertPreference).toHaveBeenCalledTimes(2);
  });

  it("送 AI 的原因数封顶(maxReasons)", async () => {
    const many = Array.from({ length: 120 }, (_, i) => `原因${i}`);
    const distill = vi.fn(
      async (
        _ctx: RequestContext,
        _reasons: string[],
      ): Promise<TopicPreferenceDistillOutput> => ({ 偏好信号: [] }),
    );
    const deps: TopicPreferenceDistillDeps = {
      listDropReasons: async () => many,
      distill,
      upsertPreference: async () => ({}),
      maxReasons: 50,
    };
    const res = await runTopicPreferenceDistill(ctx, deps);
    expect(res.reasonsSeen).toBe(50);
    const passed = distill.mock.calls[0]?.[1] as string[];
    expect(passed).toHaveLength(50);
  });
});
