/**
 * [T-055h③/T-063c] 抖音链接 → aweme_id 纯解析测试。
 */

import { describe, expect, it } from "vitest";

import { parseDouyinAwemeId, douyinVideoUrl } from "./douyin-link";

describe("parseDouyinAwemeId", () => {
  it("解析标准作品页 /video/<id>(容忍查询串)", () => {
    expect(
      parseDouyinAwemeId("https://www.douyin.com/video/7423000000000000001"),
    ).toBe("7423000000000000001");
    expect(
      parseDouyinAwemeId(
        "https://www.douyin.com/video/7423000000000000001?modeFrom=userPost&secUid=abc",
      ),
    ).toBe("7423000000000000001");
  });

  it("解析 iesdouyin 分享页与 modal_id / aweme_id 查询参数", () => {
    expect(
      parseDouyinAwemeId(
        "https://www.iesdouyin.com/share/video/7423000000000000002/",
      ),
    ).toBe("7423000000000000002");
    expect(
      parseDouyinAwemeId(
        "https://www.douyin.com/user/self?modal_id=7423000000000000003",
      ),
    ).toBe("7423000000000000003");
    expect(
      parseDouyinAwemeId("https://example.com/x?aweme_id=7423000000000000004"),
    ).toBe("7423000000000000004");
  });

  it("直接粘视频编号(10–25 位纯数字)也认", () => {
    expect(parseDouyinAwemeId("  7423000000000000005 ")).toBe(
      "7423000000000000005",
    );
  });

  it("v.douyin.com 短链 / 无编号文本诚实返回 null(不做假解析)", () => {
    expect(parseDouyinAwemeId("https://v.douyin.com/iAbCdEf/")).toBeNull();
    expect(parseDouyinAwemeId("随便一段文字")).toBeNull();
    expect(parseDouyinAwemeId("")).toBeNull();
    expect(parseDouyinAwemeId("12345")).toBeNull(); // 位数不足,不当编号
  });
});

describe("douyinVideoUrl", () => {
  it("用户粘的是 http 链接 → 保留原链;否则由编号构造标准作品页", () => {
    expect(
      douyinVideoUrl(
        "7423000000000000001",
        "https://www.douyin.com/video/7423000000000000001?foo=1",
      ),
    ).toBe("https://www.douyin.com/video/7423000000000000001?foo=1");
    expect(douyinVideoUrl("7423000000000000001", "7423000000000000001")).toBe(
      "https://www.douyin.com/video/7423000000000000001",
    );
    expect(douyinVideoUrl("7423000000000000001")).toBe(
      "https://www.douyin.com/video/7423000000000000001",
    );
  });
});
