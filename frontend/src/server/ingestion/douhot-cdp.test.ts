import { describe, expect, it } from "vitest";

import { parseDouhotBillboard } from "./douhot-cdp";

describe("T-482 热点宝低粉爆款响应解析", () => {
  it("只接受 code/data/objs，并保留 0 粉与未知粉丝的区别", () => {
    const parsed = parseDouhotBillboard(
      {
        code: 0,
        data: {
          objs: [
            {
              item_id: "item-zero",
              item_title: "零粉作品",
              item_url: "https://www.douyin.com/video/item-zero",
              fans_cnt: 0,
              like_cnt: 1200,
              comment_cnt: 12,
              publish_time: 1_800_000_000,
            },
            {
              item_id: "item-unknown",
              item_title: "粉丝未知作品",
              like_cnt: 3000,
              publish_time: 1_800_000_000,
            },
          ],
        },
      },
      {
        page: 1,
        page_size: 30,
        date_window: "2d",
        sub_type: "low_follower_breakout",
        keyword: "AI 写作",
      },
    );

    expect(parsed).toMatchObject({
      listValid: true,
      officialWindow: "2d",
      windowHours: 48,
      responseShape: "code/data/objs",
    });
    expect(parsed.candidates).toHaveLength(2);
    expect(parsed.candidates[0]).toMatchObject({
      itemId: "item-zero",
      followerCount: 0,
      likeCount: 1200,
      commentCount: 12,
    });
    expect(parsed.candidates[1]).toMatchObject({
      itemId: "item-unknown",
      followerCount: null,
    });
  });

  it("缺失 objs 或非零 code 时返回无效证据，不折叠成合法空榜", () => {
    expect(
      parseDouhotBillboard(
        { code: 500, data: {} },
        { date_window: 2 },
      ),
    ).toMatchObject({
      listValid: false,
      responseShape: "invalid-code/data/objs",
      candidates: [],
    });
  });
});
