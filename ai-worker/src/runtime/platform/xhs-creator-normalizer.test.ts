import { describe, expect, it } from "vitest";
import {
  compareXhsCatalogPasses,
  dedupeXhsCatalogPass,
  inspectXhsCatalogPass,
  parseXhsCreatorCatalogPage,
  parseXhsCreatorIdentity,
  xhsSourceWorks,
} from "./xhs-creator-normalizer";

const at = "2026-09-30T00:00:00.000Z";
const wrap = (data: unknown) => ({ success: true, code: 0, data });
const note = (id: string) => ({ id, type: "video", visible_time: 1609459200,
  view_count: 0, likes: 2, comments_count: 0, collected_count: 3,
  shared_count: 1, tab_status: 1, xsec_token: "never-output-this" });
const page = (cursor: string | null, next: number | null, records: string[], total?: number) =>
  parseXhsCreatorCatalogPage(wrap({ page: next,
    tags: total === undefined ? [] : [{ id: "special.note_time_desc", notes_count: total }],
    notes: records.map(note) }), cursor, at);

describe("小红书官网来源纯解析层", () => {
  it("核对真实身份，拒绝错号，输出不包含登录凭据", () => {
    const raw = wrap({ userId: "account_1234", userName: "测试账号", redId: "red-id", token: "secret" });
    expect(parseXhsCreatorIdentity(raw, "account_1234")).toEqual({
      platformIdentity: "account_1234", displayName: "测试账号", redId: "red-id",
      source: "/api/galaxy/user/info",
    });
    expect(() => parseXhsCreatorIdentity(raw, "account_9999")).toThrow("IDENTITY_MISMATCH");
    expect(JSON.stringify(parseXhsCreatorIdentity(raw))).not.toContain("secret");
  });

  it("把数字零保留为真零，缺失留空，状态未知且不泄露令牌", () => {
    const parsed = page(null, 1, ["note_0001"], 2);
    expect(parsed.records[0]!.counts).toEqual({ view_count: 0, likes: 2, comments_count: 0,
      collected_count: 3, shared_count: 1 });
    expect(parsed.records[0]!.publishedAt).toBe("2021-01-01T00:00:00.000Z");
    expect(parsed.records[0]!.visibility.visibility).toBe("unknown");
    expect(JSON.stringify(parsed)).not.toContain("never-output-this");
    expect(xhsSourceWorks(parsed)[0]).toEqual({
      externalId: "note_0001", title: null, kind: "video", publishedAt: "2021-01-01T00:00:00.000Z",
      visibility: { visibility: "unknown", source: "/api/galaxy/v2/creator/note/user/posted", observedAt: at },
      source: "/api/galaxy/v2/creator/note/user/posted", observedAt: at,
    });
  });

  it("页面格式化指标不伪造精确值，纯数字文本保留真零", () => {
    const parsed = parseXhsCreatorCatalogPage(wrap({ page: null,
      tags: [{ id: "special.note_time_desc", notes_count: 1 }],
      notes: [{ ...note("note_0001"), view_count: "1.2万", likes: "0" }] }), null, at);
    expect(parsed.records[0]!.counts.view_count).toBeNull();
    expect(parsed.records[0]!.counts.likes).toBe(0);
  });

  it("官网以 -1 表示作品目录终页", () => {
    const parsed = parseXhsCreatorCatalogPage(wrap({ page: -1,
      tags: [{ id: "special.note_time_desc", notes_count: 1 }],
      notes: [note("note_0001")] }), "10", at);
    expect(parsed.nextCursor).toBeNull();
  });

  it("遵循返回游标跳号与跨页重叠，目录仍需要终页证据", () => {
    const first = page(null, 2, ["note_0001"], 3);
    const second = page("2", 4, ["note_0001", "note_0002"], undefined);
    const third = page("4", 5, ["note_0003"], undefined);
    const normalized = dedupeXhsCatalogPass([first, second, third]);
    expect(normalized[1]!.records.map((n) => n.externalId)).toEqual(["note_0002"]);
    expect(inspectXhsCatalogPass(normalized)).toMatchObject({ fetched: 3, reportedTotal: 3,
      needsTerminalEvidence: true });
    expect(compareXhsCatalogPasses(normalized, dedupeXhsCatalogPass([
      page(null, 2, ["note_0003"], 3), page("2", 4, ["note_0001", "note_0002"]),
    ])).stillNeedsTerminalEvidence).toBe(true);
  });

  it("拒绝循环游标、总量漂移和第二轮集合变化", () => {
    expect(() => page("2", 2, ["note_0002"], 2)).toThrow("DATA_SCHEMA");
    const first = page(null, 2, ["note_0001"], 2);
    const drift = page("2", 4, ["note_0002"], 3);
    expect(() => inspectXhsCatalogPass([first, drift])).toThrow("INCOMPLETE_CATALOG");
    expect(() => compareXhsCatalogPasses([first, page("2", 4, ["note_0002"])],
      [first, page("2", 4, ["note_0003"])] )).toThrow("INCOMPLETE_CATALOG");
  });
});
