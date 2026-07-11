import { describe, it, expect, vi } from "vitest";
import type { RequestContext } from "@creatoros/contract";
import {
  collectDarkhorse,
  DARKHORSE_SOURCE_ID,
  type DarkhorseCollectorDeps,
  type DarkhorseFetchedVideo,
} from "./darkhorse-collector";

// [T-235b] 黑马雷达采集器单测(fake 端口,不碰真抖音/真库):关键词遍历 + 三档判定接线 +
// 落库形状(discovery=darkhorse / viralMultiple=赞粉比 / isViral=true)+ 跨词去重 +
// 单词失败跳过 + 无关键词诚实 0 跑。

const ctx: RequestContext = { userId: "u1", requestId: "r1", source: "user" };
const NOW_SEC = 1_800_000_000;
const NOW_ISO = "2026-07-11T09:30:00.000Z";

function video(p: Partial<DarkhorseFetchedVideo> & { awemeId: string }): DarkhorseFetchedVideo {
  return {
    description: "黑马视频",
    diggCount: 2000,
    commentCount: 10,
    collectCount: 20,
    shareCount: 5,
    duration: 45_000,
    createTime: NOW_SEC - 3600, // 1h 前发(窗口内)
    authorSecUid: "MS4w-author",
    authorNickname: "小号",
    authorFollowerCount: 500,
    ...p,
  };
}

type Recorded = Parameters<DarkhorseCollectorDeps["recordWork"]>[1];

function makeDeps(overrides: Partial<DarkhorseCollectorDeps> = {}) {
  const recorded: Recorded[] = [];
  const deps: DarkhorseCollectorDeps = {
    listKeywords: async () => ["孕晚期"],
    searchVideos: async () => [video({ awemeId: "a1" })],
    recordWork: async (_c, input) => {
      recorded.push(input);
      return { inserted: true };
    },
    now: () => NOW_ISO,
    nowSec: () => NOW_SEC,
    sleep: async () => {},
    ...overrides,
  };
  return { deps, recorded };
}

describe("collectDarkhorse", () => {
  it("命中黑马 → 落库形状:discovery=darkhorse、viralMultiple=赞粉比、isViral=true、关键词溯源", async () => {
    const { deps, recorded } = makeDeps();
    const result = await collectDarkhorse(ctx, deps);
    expect(result.itemsNew).toBe(1);
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      sourceId: DARKHORSE_SOURCE_ID,
      sourceExternalAccountId: "MS4w-author",
      platform: "douyin",
      awemeId: "a1",
      isViral: true, // 进 T-212c 待拆队列 → 拆解转化跟拍候选
      viralMultiple: 4, // 2000 赞 / 500 粉 = 赞粉比 4(黑马语义,非 digg/median)
      discovery: "darkhorse",
      authorFollowerCount: 500,
      discoveryKeyword: "孕晚期",
      capturedAt: NOW_ISO,
      createTime: String(NOW_SEC - 3600),
    });
    expect(result.message).toContain("黑马");
  });

  it("三档判定过滤:窗口外/不达标的不落库;每词 top5 截断", async () => {
    const { deps, recorded } = makeDeps({
      searchVideos: async () => [
        video({ awemeId: "in", diggCount: 1500, authorFollowerCount: 500 }),
        video({ awemeId: "stale", createTime: NOW_SEC - 50 * 3600 }), // 超 48h 窗口
        video({ awemeId: "weak", diggCount: 100, authorFollowerCount: 50_000 }), // 三档全不中
        ...Array.from({ length: 8 }, (_, i) =>
          video({ awemeId: `bulk${i}`, diggCount: 3000 + i, authorFollowerCount: 100 }),
        ),
      ],
    });
    await collectDarkhorse(ctx, deps);
    const ids = recorded.map((r) => r.awemeId);
    expect(ids).not.toContain("stale");
    expect(ids).not.toContain("weak");
    expect(ids).toHaveLength(5); // 每关键词 top5(赞粉比降序)
  });

  it("跨关键词去重:同视频多词命中只落一次;词间 sleep 降频", async () => {
    const sleep = vi.fn(async () => {});
    const { deps, recorded } = makeDeps({
      listKeywords: async () => ["词A", "词B"],
      searchVideos: async () => [video({ awemeId: "dup" })],
      sleep,
    });
    const result = await collectDarkhorse(ctx, deps);
    expect(recorded).toHaveLength(1);
    expect(result.itemsNew).toBe(1);
    expect(sleep).toHaveBeenCalledTimes(1); // 两词之间 sleep 一次
  });

  it("单词搜索失败(验证码/网络)→ 跳过该词不崩整批,其余词照采", async () => {
    const { deps, recorded } = makeDeps({
      listKeywords: async () => ["坏词", "好词"],
      searchVideos: async (_c, kw) => {
        if (kw === "坏词") throw new Error("net::ERR_TIMED_OUT");
        return [video({ awemeId: "ok1" })];
      },
    });
    const result = await collectDarkhorse(ctx, deps);
    expect(recorded.map((r) => r.awemeId)).toEqual(["ok1"]);
    expect(result.itemsNew).toBe(1);
  });

  it("无关键词(未配定位/env)→ 诚实 0 跑 + message,非失败;关键词去重去空", async () => {
    const { deps } = makeDeps({ listKeywords: async () => ["  ", ""] });
    const result = await collectDarkhorse(ctx, deps);
    expect(result).toMatchObject({ itemsNew: 0, itemsUpdated: 0 });
    expect(result.message).toContain("无黑马关键词");

    const searchVideos = vi.fn(async () => []);
    const { deps: d2 } = makeDeps({
      listKeywords: async () => ["同词", "同词", " 同词 "],
      searchVideos,
    });
    await collectDarkhorse(ctx, d2);
    expect(searchVideos).toHaveBeenCalledTimes(1); // 去重后只搜一次
  });

  it("已存在的黑马(重复采集)计 itemsUpdated;本轮无黑马 message 诚实注明", async () => {
    const { deps } = makeDeps({
      recordWork: async () => ({ inserted: false }),
    });
    const r1 = await collectDarkhorse(ctx, deps);
    expect(r1).toMatchObject({ itemsNew: 0, itemsUpdated: 1 });

    const { deps: d2 } = makeDeps({ searchVideos: async () => [] });
    const r2 = await collectDarkhorse(ctx, d2);
    expect(r2.message).toContain("无黑马");
  });
});
