import { describe, it, expect, vi } from "vitest";
import type { RequestContext } from "@creatoros/contract";
import type { BenchmarkTeardownOutput } from "@creatoros/ai-worker";
import type { PendingViralWork } from "../benchmark";
import {
  runBenchmarkTeardown,
  benchmarkVideoUrl,
  benchmarkBrief,
  type BenchmarkTeardownDeps,
} from "./benchmark-teardown-runner";

// [T-212c] 拆解转化编排单测(fake AI 端口 + fake benchmark/candidate 端口)。覆盖:
//   爆款→拆解→createCandidate(source=benchmark,≤3 条,标 done)、只转化 fit=high、
//   参考链接+爆款倍数入 angle、pending 幂等标 done、空池短路、单条失败跳过不崩+不标 done、定位透传。

const ctx: RequestContext = {
  userId: "u1",
  requestId: "r1",
  source: "user",
  accountId: "acc-1",
};

function work(over: Partial<PendingViralWork> = {}): PendingViralWork {
  return {
    id: "w1",
    platform: "douyin",
    awemeId: "aweme-1",
    description: "对标爆款标题",
    diggCount: 50000,
    commentCount: 1200,
    collectCount: 800,
    shareCount: 300,
    duration: 45000,
    viralMultiple: 8.5,
    sourceExternalAccountId: "sec-abc",
    ...over,
  };
}

function teardownOut(over: Partial<BenchmarkTeardownOutput> = {}): BenchmarkTeardownOutput {
  return {
    钩子拆解: "开头抛反常识",
    结构拆解: "总分总",
    为什么爆: "信息增量高",
    可借鉴点: ["数字钩子"],
    适配本账号建议: "换本账号场景",
    转化选题: [{ title: "本账号新题", angle: "落地角度", fit: "high" }],
    ...over,
  };
}

function makeDeps(over: Partial<BenchmarkTeardownDeps> = {}): {
  deps: BenchmarkTeardownDeps;
  created: Array<{ title: string; angle: string; source: string }>;
  doneIds: string[];
  patched: Array<{ candidateId: string; card: Record<string, unknown> }>;
} {
  const created: Array<{ title: string; angle: string; source: string }> = [];
  const doneIds: string[] = [];
  // [T-284a] 捕获补挂的 card.teardown —— 断言复刻拆解要素落库。
  const patched: Array<{ candidateId: string; card: Record<string, unknown> }> =
    [];
  const deps: BenchmarkTeardownDeps = {
    listPendingViralWorks: async () => [work()],
    getPositioningBrief: async () => "领域：AI 编导",
    teardown: async () => teardownOut(),
    createCandidate: async (_c, input) => {
      created.push(input);
      return { id: `cand-${created.length}` };
    },
    patchCandidate: async (_c, candidateId, patch) => {
      patched.push({ candidateId, card: patch.card });
    },
    markTeardownDone: async (_c, id) => {
      doneIds.push(id);
    },
    ...over,
  };
  return { deps, created, doneIds, patched };
}

describe("runBenchmarkTeardown", () => {
  it("空待拆池 → 0/0 短路,不调拆解/转化", async () => {
    const teardown = vi.fn();
    const { deps } = makeDeps({
      listPendingViralWorks: async () => [],
      teardown,
    });
    const res = await runBenchmarkTeardown(ctx, deps);
    expect(res).toEqual({ worksProcessed: 0, promoted: 0 });
    expect(teardown).not.toHaveBeenCalled();
  });

  it("爆款 → 拆解 → createCandidate(source=benchmark) + 标 done", async () => {
    const { deps, created, doneIds } = makeDeps();
    const res = await runBenchmarkTeardown(ctx, deps);
    expect(res).toEqual({ worksProcessed: 1, promoted: 1 });
    expect(created).toHaveLength(1);
    expect(created[0]!.source).toBe("benchmark");
    expect(created[0]!.title).toBe("本账号新题");
    // 参考链接(原视频 url)+ 爆款倍数落 angle。
    expect(created[0]!.angle).toContain("落地角度");
    expect(created[0]!.angle).toContain("https://www.douyin.com/video/aweme-1");
    expect(created[0]!.angle).toContain("爆款倍数 8.5x");
    // 拆完标 done(幂等锚)。
    expect(doneIds).toEqual(["w1"]);
  });

  // [T-284a] 复刻补链 G1:每条 benchmark 候选建好后补挂 5 段原爆款拆解要素到 card.teardown。
  it("补挂 card.teardown(5 段拆解要素,不含转化选题)", async () => {
    const { deps, created, patched } = makeDeps();
    await runBenchmarkTeardown(ctx, deps);
    expect(created).toHaveLength(1);
    expect(patched).toHaveLength(1);
    expect(patched[0]!.candidateId).toBe("cand-1");
    const teardown = patched[0]!.card.teardown as Record<string, unknown>;
    expect(teardown).toEqual({
      钩子拆解: "开头抛反常识",
      结构拆解: "总分总",
      为什么爆: "信息增量高",
      可借鉴点: ["数字钩子"],
      适配本账号建议: "换本账号场景",
    });
    // 「转化选题」不进 card.teardown(它本身就是候选)。
    expect(teardown).not.toHaveProperty("转化选题");
  });

  // [T-284a] patch 失败 best-effort:候选已建、标 done,不崩整批,只是少了 teardown card。
  it("补挂 card.teardown 失败 → 候选仍建、仍标 done(best-effort)", async () => {
    const { deps, created, doneIds } = makeDeps({
      patchCandidate: async () => {
        throw new Error("patch boom");
      },
    });
    const res = await runBenchmarkTeardown(ctx, deps);
    expect(res).toEqual({ worksProcessed: 1, promoted: 1 });
    expect(created).toHaveLength(1);
    expect(doneIds).toEqual(["w1"]);
  });

  // [T-284a] 拆解 5 段全空 → 不 patch(诚实:无可参照要素,候选不补空壳 teardown)。
  it("拆解要素全空 → 不补挂 card.teardown", async () => {
    const { deps, patched } = makeDeps({
      teardown: async () =>
        teardownOut({
          钩子拆解: "",
          结构拆解: "",
          为什么爆: "",
          可借鉴点: [],
          适配本账号建议: "",
        }),
    });
    await runBenchmarkTeardown(ctx, deps);
    expect(patched).toHaveLength(0);
  });

  it("只转化 fit=high(medium/low 不进池)", async () => {
    const { deps, created } = makeDeps({
      teardown: async () =>
        teardownOut({
          转化选题: [
            { title: "高适配", angle: "a", fit: "high" },
            { title: "中适配", angle: "b", fit: "medium" },
            { title: "低适配", angle: "c", fit: "low" },
            { title: "", angle: "d", fit: "high" }, // 空标题也丢弃
          ],
        }),
    });
    const res = await runBenchmarkTeardown(ctx, deps);
    expect(created.map((c) => c.title)).toEqual(["高适配"]);
    expect(res.promoted).toBe(1);
  });

  it("单次转化 ≤ maxPromotePerRun(默认 3,防灌库)", async () => {
    const many = Array.from({ length: 5 }, (_, i) => ({
      title: `题${i}`,
      angle: "",
      fit: "high" as const,
    }));
    const { deps, created, doneIds } = makeDeps({
      listPendingViralWorks: async () => [work({ id: "w1" })],
      teardown: async () => teardownOut({ 转化选题: many }),
    });
    const res = await runBenchmarkTeardown(ctx, deps);
    expect(created).toHaveLength(3); // 全局上限 3
    expect(res.promoted).toBe(3);
    // 即便超额,作品仍标 done(已分析,不重拆)。
    expect(doneIds).toEqual(["w1"]);
  });

  it("多作品累计仍 ≤ maxPromotePerRun 全局上限", async () => {
    const works = [
      work({ id: "w1", awemeId: "a1" }),
      work({ id: "w2", awemeId: "a2" }),
      work({ id: "w3", awemeId: "a3" }),
    ];
    const { deps, created, doneIds } = makeDeps({
      listPendingViralWorks: async () => works,
      teardown: async () =>
        teardownOut({
          转化选题: [
            { title: "t1", angle: "", fit: "high" },
            { title: "t2", angle: "", fit: "high" },
          ],
        }),
    });
    const res = await runBenchmarkTeardown(ctx, deps);
    // 3 作品 × 2 高适配 = 6 待转,但全局封顶 3。
    expect(created).toHaveLength(3);
    expect(res.promoted).toBe(3);
    // 三条作品都拆解并标 done。
    expect(doneIds).toEqual(["w1", "w2", "w3"]);
  });

  it("pending 幂等:0 高适配也标 done(不重拆)", async () => {
    const { deps, created, doneIds } = makeDeps({
      teardown: async () => teardownOut({ 转化选题: [] }),
    });
    const res = await runBenchmarkTeardown(ctx, deps);
    expect(created).toHaveLength(0);
    expect(doneIds).toEqual(["w1"]); // 已分析 → 标 done
    expect(res).toEqual({ worksProcessed: 1, promoted: 0 });
  });

  it("单条作品拆解失败 → 跳过、不崩、不标 done(下次重试)", async () => {
    const works = [work({ id: "bad" }), work({ id: "good", awemeId: "a-good" })];
    const { deps, created, doneIds } = makeDeps({
      listPendingViralWorks: async () => works,
      teardown: async (_c, input) => {
        if (input.work.id === "bad") throw new Error("模型挂起");
        return teardownOut();
      },
    });
    const res = await runBenchmarkTeardown(ctx, deps);
    expect(res.worksProcessed).toBe(1); // 只 good 成功
    expect(created).toHaveLength(1);
    expect(doneIds).toEqual(["good"]); // bad 未标 done → 保持 pending 重试
  });

  it("本账号定位透传进拆解端口", async () => {
    const seen: string[] = [];
    const { deps } = makeDeps({
      getPositioningBrief: async () => "领域：母婴",
      teardown: async (_c, input) => {
        seen.push(input.positioningBrief);
        return teardownOut();
      },
    });
    await runBenchmarkTeardown(ctx, deps);
    expect(seen).toEqual(["领域：母婴"]);
  });

  it("定位读失败 → 降级空串,不阻塞拆解", async () => {
    const seen: string[] = [];
    const { deps } = makeDeps({
      getPositioningBrief: async () => {
        throw new Error("定位读失败");
      },
      teardown: async (_c, input) => {
        seen.push(input.positioningBrief);
        return teardownOut();
      },
    });
    const res = await runBenchmarkTeardown(ctx, deps);
    expect(seen).toEqual([""]);
    expect(res.promoted).toBe(1);
  });
});

describe("benchmarkVideoUrl / benchmarkBrief 纯函数", () => {
  it("douyin 作品 → 标准视频 URL", () => {
    expect(benchmarkVideoUrl("douyin", "123")).toBe(
      "https://www.douyin.com/video/123",
    );
  });
  it("其它平台 → 回退作品 id", () => {
    expect(benchmarkVideoUrl("xhs", "abc")).toBe("abc");
  });
  it("benchmarkBrief 拼标题/数据/爆款倍数(缺字段跳过)", () => {
    const brief = benchmarkBrief(
      work({ commentCount: null, collectCount: null, shareCount: null }),
    );
    expect(brief).toContain("· 标题：对标爆款标题");
    expect(brief).toContain("· 点赞：50000");
    expect(brief).toContain("· 爆款倍数：8.5x");
    expect(brief).not.toContain("· 评论：");
  });
});
