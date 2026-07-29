import { describe, expect, it } from "vitest";
import type { MetricRecord } from "@creatoros/backend/modules/ingestion";
import type {
  DouyinWorkDetail,
  PublicationCatalogEntry,
} from "./douyin-work-detail";
import { decideVisibleDouyinCollection } from "./visible-douyin-collection";

const record = (externalId: string, title: string, publishedAt: string): MetricRecord => ({
  recordKey: `douyin:${externalId}:2026-07-28T10:00:00.000Z`,
  platform: "douyin",
  externalId,
  capturedAt: "2026-07-28T10:00:00.000Z",
  title,
  publishedAt,
  metrics: { views: 1 },
});

const detail = (
  title: string,
  pubDate: string,
  status: string,
): DouyinWorkDetail => ({
  title,
  pubDate,
  genre: "视频",
  status,
  plays: 0,
  finishRate: 0,
  finish5sRate: 0,
  coverCtr: null,
  bounce2sRate: 0,
  avgDurationSec: 0,
  likes: 0,
  shares: 0,
  comments: 0,
  favorites: 0,
  profileVisits: 0,
  followerGain: 0,
});

const catalog = (
  externalId: string,
  title: string,
  publishedAt: string,
): PublicationCatalogEntry => ({
  id: externalId,
  platform: "douyin",
  externalId,
  title,
  publishedAt,
});

describe("decideVisibleDouyinCollection", () => {
  it("只放行明确公开记录，隐藏只产清理决议，未知零写入零清理", () => {
    const records = [
      record("aweme-visible", "公开作品", "2026-07-28T01:00:00.000Z"),
      record("aweme-hidden", "隐藏作品", "2026-07-27T01:00:00.000Z"),
      record("aweme-unknown", "审核中作品", "2026-07-26T01:00:00.000Z"),
      record("aweme-unmatched", "未匹配作品", "2026-07-25T01:00:00.000Z"),
    ];

    const result = decideVisibleDouyinCollection({
      records,
      details: [
        detail("公开作品", "2026-07-28 09:00:00", "公开"),
        detail("隐藏作品", "2026-07-27 09:00:00", "自见"),
        detail("审核中作品", "2026-07-26 09:00:00", "审核中"),
      ],
      catalog: records.map((item) =>
        catalog(item.externalId, item.title ?? "", item.publishedAt ?? ""),
      ),
    });

    expect(result.visibleRecords.map((item) => item.externalId)).toEqual([
      "aweme-visible",
    ]);
    expect(result.hiddenExternalIds).toEqual(["aweme-hidden"]);
    expect(result.counts).toEqual({
      observed: 4,
      visible: 1,
      hidden: 1,
      unknown: 2,
      unmatchedDetails: 0,
    });
  });

  it("同标题同发布时间存在多个候选时一律 unknown，不任取首条", () => {
    const records = [
      record("aweme-a", "重名作品", "2026-07-28T01:00:00.000Z"),
      record("aweme-b", "重名作品", "2026-07-28T01:00:00.000Z"),
    ];
    const result = decideVisibleDouyinCollection({
      records,
      details: [detail("重名作品", "2026-07-28 09:00:00", "自见")],
      catalog: records.map((item) =>
        catalog(item.externalId, item.title ?? "", item.publishedAt ?? ""),
      ),
    });

    expect(result.visibleRecords).toEqual([]);
    expect(result.hiddenExternalIds).toEqual([]);
    expect(result.counts.unknown).toBe(2);
    expect(result.counts.unmatchedDetails).toBe(1);
  });

  it("已不在本轮指标列表的存量作品仍可由全量明细判隐藏并清理", () => {
    const result = decideVisibleDouyinCollection({
      records: [],
      details: [detail("旧隐藏作品", "2026-06-01 09:00:00", "仅自己可见")],
      catalog: [
        catalog("aweme-stale", "旧隐藏作品", "2026-06-01T01:00:00.000Z"),
      ],
    });

    expect(result.visibleRecords).toEqual([]);
    expect(result.hiddenExternalIds).toEqual(["aweme-stale"]);
    expect(result.counts.hidden).toBe(1);
  });
});
