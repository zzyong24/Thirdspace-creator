import { describe, it, expect, vi } from "vitest";
import type { RequestContext } from "@creatoros/contract";
import {
  collectBenchmark,
  type BenchmarkCollectorDeps,
  type BenchmarkFetchedWork,
  type BenchmarkSourceProjection,
} from "./benchmark-collector";

// [T-212a] 对标采集器单测（fake 采集端口，不碰真抖音）。覆盖:空源短路、爆款筛选+落库、
// ≤10 限流、单源失败跳过不崩整批、幂等 inserted/updated 计数。

const NOW = "2026-07-11T00:00:00.000Z";
const ctx: RequestContext = { userId: "u1", requestId: "r1", source: "user", accountId: "acc-1" };

function src(id: string, secUid: string): BenchmarkSourceProjection {
  return { id, platform: "douyin", externalAccountId: secUid, nickname: null, homeUrl: null };
}

function makeDeps(over: Partial<BenchmarkCollectorDeps> = {}): {
  deps: BenchmarkCollectorDeps;
  recorded: { awemeId: string; isViral: boolean; viralMultiple: number | null }[];
} {
  const recorded: { awemeId: string; isViral: boolean; viralMultiple: number | null }[] = [];
  const deps: BenchmarkCollectorDeps = {
    listEnabledSources: async () => [src("s1", "sec-1")],
    fetchSourcePosts: async () => [],
    recordWork: async (_c, input) => {
      recorded.push({
        awemeId: input.awemeId,
        isViral: input.isViral,
        viralMultiple: input.viralMultiple,
      });
      return { inserted: true };
    },
    now: () => NOW,
    sleep: async () => {}, // 关降频等待
    ...over,
  };
  return { deps, recorded };
}

describe("collectBenchmark", () => {
  it("无 enabled 源 → 0/0 短路", async () => {
    const { deps } = makeDeps({ listEnabledSources: async () => [] });
    const res = await collectBenchmark(ctx, deps);
    expect(res).toEqual({ itemsNew: 0, itemsUpdated: 0 });
  });

  it("只落爆款作品（非爆款不入库）", async () => {
    // 中位数 200；黑马 5000 爆，其余不爆。
    const works: BenchmarkFetchedWork[] = [
      { awemeId: "a", diggCount: 100 },
      { awemeId: "b", diggCount: 200 },
      { awemeId: "c", diggCount: 300 },
      { awemeId: "hit", diggCount: 5000 },
    ];
    const { deps, recorded } = makeDeps({ fetchSourcePosts: async () => works });
    const res = await collectBenchmark(ctx, deps);
    expect(recorded.map((r) => r.awemeId)).toEqual(["hit"]);
    expect(recorded[0]!.isViral).toBe(true);
    // 中位数 = (200+300)/2 = 250 → viralMultiple = 5000/250 = 20。
    expect(recorded[0]!.viralMultiple).toBeCloseTo(5000 / 250);
    expect(res.itemsNew).toBe(1);
    expect(res.itemsUpdated).toBe(0);
  });

  it("每源 ≤ maxViralPerSource 条,按赞降序", async () => {
    // 12 条全绝对爆款（≥10000），限 3 条 → 取最高 3 条。
    const works: BenchmarkFetchedWork[] = Array.from({ length: 12 }, (_, i) => ({
      awemeId: `w${i}`,
      diggCount: 10000 + i * 1000,
    }));
    const { deps, recorded } = makeDeps({
      fetchSourcePosts: async () => works,
      maxViralPerSource: 3,
    });
    await collectBenchmark(ctx, deps);
    expect(recorded).toHaveLength(3);
    expect(recorded.map((r) => r.awemeId)).toEqual(["w11", "w10", "w9"]);
  });

  it("单源失败 → 跳过该源,其余源照采", async () => {
    const sources = [src("s1", "bad"), src("s2", "good")];
    const good: BenchmarkFetchedWork[] = [{ awemeId: "g", diggCount: 20000 }];
    const { deps, recorded } = makeDeps({
      listEnabledSources: async () => sources,
      fetchSourcePosts: async (_c, s) => {
        if (s.externalAccountId === "bad") throw new Error("验证码/网络失败");
        return good;
      },
    });
    const res = await collectBenchmark(ctx, deps);
    expect(recorded.map((r) => r.awemeId)).toEqual(["g"]);
    expect(res.itemsNew).toBe(1);
  });

  it("幂等:已存在的作品计 updated 不计 new", async () => {
    const works: BenchmarkFetchedWork[] = [{ awemeId: "dup", diggCount: 30000 }];
    const { deps } = makeDeps({
      fetchSourcePosts: async () => works,
      recordWork: async () => ({ inserted: false }),
    });
    const res = await collectBenchmark(ctx, deps);
    expect(res.itemsNew).toBe(0);
    expect(res.itemsUpdated).toBe(1);
  });

  it("多源之间降频 sleep 被调用", async () => {
    const sleep = vi.fn(async () => {});
    const sources = [src("s1", "a"), src("s2", "b")];
    const { deps } = makeDeps({
      listEnabledSources: async () => sources,
      fetchSourcePosts: async () => [],
      sleep,
      perSourceSleepMs: 1500,
    });
    await collectBenchmark(ctx, deps);
    // 2 源 → 源间 sleep 1 次（最后一源后不等）。
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(1500);
  });
});
