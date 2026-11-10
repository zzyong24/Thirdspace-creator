import { describe, expect, it } from "vitest";
import { scopeAccountListToGroup } from "./group-scoped-accounts";

const all = [{ id: "main-douyin", platform: "douyin" }, { id: "main-xhs", platform: "xiaohongshu" }, { id: "small-xhs", platform: "xiaohongshu" }];
const groups: Record<string, Array<{ accountId: string; leftAt: string | null }>> = {
  main: [{ accountId: "main-douyin", leftAt: null }, { accountId: "main-xhs", leftAt: null }, { accountId: "small-xhs", leftAt: "2026-11-01" }],
  small: [],
  other: [{ accountId: "small-xhs", leftAt: null }],
};
const ctx = (groupId: string | null) => ({ userId: "u", accountId: null, groupId, requestId: "r", source: "user" as const }) as any;
const scoped = scopeAccountListToGroup(async (_c: unknown, _q: { limit?: number; offset?: number }) => ({ rows: all, total: all.length }), async (_c, id) => ({ members: groups[id]! }));

describe("账号画像按当前账号组收窄（月明录屏 2026-11-10）", () => {
  it("未绑账号的账号组不显示其他组的账号", async () => {
    expect(await scoped.listAccounts(ctx("small"), { limit: 100, offset: 0 })).toEqual({ rows: [], total: 0 });
  });
  it("只列当前组仍在组的账号，已离组的不算", async () => {
    expect((await scoped.listAccounts(ctx("main"), {})).rows.map(r => r.id)).toEqual(["main-douyin", "main-xhs"]);
    expect((await scoped.listAccounts(ctx("other"), {})).rows.map(r => r.id)).toEqual(["small-xhs"]);
  });
  it("没有账号组上下文的旧调用保持用户级列表", async () => {
    expect((await scoped.listAccounts(ctx(null), {})).total).toBe(3);
  });
});
