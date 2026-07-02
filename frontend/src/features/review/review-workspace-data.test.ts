import { describe, it, expect } from "vitest";
import {
  fetchReviewComments,
  type ReviewDataClient,
} from "./review-workspace-data";
import type { MetricSnapshotDto } from "./analytics-review-view-model";

// T-042 评论热榜排序:fetchReviewComments 跨作品合并后必须按点赞数(热榜)降序,
// 同赞数按 created_at 降序兜底,null 点赞(存量 0014 前采集)沉榜尾,封顶前 100 条。

// 两个作品的评论(点赞数交错),用来验「合并后全局热榜序」而非「按作品分段」。
const COMMENTS: Record<string, ReadonlyArray<Record<string, unknown>>> = {
  "pub-A": [
    { id: "a1", rawText: "A 最热", demandTag: null, likeCount: 300, createdAt: "2026-06-30T02:00:00.000Z" },
    { id: "a2", rawText: "A 冷门", demandTag: null, likeCount: 5, createdAt: "2026-06-30T01:00:00.000Z" },
  ],
  "pub-B": [
    { id: "b1", rawText: "B 中等", demandTag: null, likeCount: 100, createdAt: "2026-06-30T03:00:00.000Z" },
    { id: "b2", rawText: "B 无点赞(存量)", demandTag: null, likeCount: null, createdAt: "2026-06-30T09:00:00.000Z" },
  ],
};

function fakeClient(): ReviewDataClient {
  return {
    async listPublicationComments(input: { params: { publicationId: string } }) {
      return COMMENTS[input.params.publicationId] ?? [];
    },
  } as unknown as ReviewDataClient;
}

// 只需 publicationId 字段驱动 publicationIdsFromSnapshots;其余 snapshot 形状本测不关心。
function snap(publicationId: string): MetricSnapshotDto {
  return { publicationId } as unknown as MetricSnapshotDto;
}

describe("fetchReviewComments — 热榜排序 (T-042)", () => {
  it("跨作品合并后按点赞降序(热榜),null 点赞沉榜尾", async () => {
    const rows = await fetchReviewComments(fakeClient(), [
      snap("pub-A"),
      snap("pub-B"),
    ]);
    // 全局热榜序:a1(300) > b1(100) > a2(5) > b2(null=-1),不是按作品分段(A 全部再 B 全部)。
    expect(rows.map((r) => r.id)).toEqual(["a1", "b1", "a2", "b2"]);
    expect(rows[0].likeCount).toBe(300);
    // null 点赞映射为 null(不伪造 0),且排最后。
    expect(rows[rows.length - 1].id).toBe("b2");
    expect(rows[rows.length - 1].likeCount).toBeNull();
    // 文本/需求标签照常投影。
    expect(rows[0].text).toBe("A 最热");
  });

  it("无作品快照 → 空数组(诚实空态,不请求)", async () => {
    const rows = await fetchReviewComments(fakeClient(), []);
    expect(rows).toEqual([]);
  });
});
