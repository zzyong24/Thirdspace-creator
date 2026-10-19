import { describe, expect, it } from "vitest";
import {
  compareKuaishouWorkPasses, kuaishouSourceWorks,
  parseKuaishouCreatorIdentity, parseKuaishouWorkPage,
} from "./kuaishou-creator-normalizer";

const at = "2026-09-30T00:00:00.000Z";
const wrap = (data: unknown) => ({ result: 1, data });
const page = (requestCursor: string | null, nextCursor: string, ids: number[], total: number) =>
  parseKuaishouWorkPage(wrap({ nextCursor, total, list: ids.map((workId) => ({ workId,
    title: `作品${workId}`, uploadTime: 1790726400000, playCount: 0,
    likeCount: 2, commentCount: null, token: "never-output-this" })) }), requestCursor, at);

describe("快手创作者页面解析", () => {
  it("只用稳定 userId 核验身份，粉丝真零不当缺值", () => {
    const identity = parseKuaishouCreatorIdentity(wrap({ userId: 12345,
      userName: "测试账号", userKwaiId: "ks-123", fansCnt: 0, token: "secret" }), "12345");
    expect(identity).toMatchObject({ platformIdentity: "12345", followerCount: 0, kwaiId: "ks-123" });
    expect(JSON.stringify(identity)).not.toContain("secret");
    expect(() => parseKuaishouCreatorIdentity(wrap({ userId: 12345 }), "54321")).toThrow("IDENTITY_MISMATCH");
  });

  it("游标终止和两次完整扫描一致才能认定全量，未知公开状态留空", () => {
    const first = [page(null, "cursor-2", [1], 2), page("cursor-2", "no_more", [2], 2)];
    const second = [page(null, "cursor-2", [2], 2), page("cursor-2", "no_more", [1], 2)];
    expect(compareKuaishouWorkPasses(first, second)).toMatchObject({ total: 2, ids: ["1", "2"] });
    expect(kuaishouSourceWorks(first[0]!)[0]).toMatchObject({
      externalId: "1", title: "作品1", visibility: { visibility: "unknown" },
    });
    expect(JSON.stringify(first)).not.toContain("never-output-this");
    expect(first[0]!.works[0]).toMatchObject({ playCount: 0, likeCount: 2, commentCount: null });
  });

  it("拒绝错页、总数漂移、缺失终页和重复身份", () => {
    const first = page(null, "cursor-2", [1], 2);
    expect(() => page("cursor-2", "cursor-2", [2], 2)).toThrow("INCOMPLETE_CATALOG");
    expect(() => compareKuaishouWorkPasses([first], [first])).toThrow("INCOMPLETE_CATALOG");
    expect(() => compareKuaishouWorkPasses([first, page("cursor-2", "no_more", [2], 3)],
      [first, page("cursor-2", "no_more", [2], 3)])).toThrow("INCOMPLETE_CATALOG");
    expect(() => parseKuaishouWorkPage(wrap({ nextCursor: "no_more", total: 2,
      list: [{ workId: 1 }, { workId: 1 }] }), null, at)).toThrow("DATA_SCHEMA");
  });
});
