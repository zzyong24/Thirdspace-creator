import { describe, it, expect } from "vitest";
import {
  resolveCurrentAccount,
  type SwitcherAccount,
} from "./account-switcher-logic";

const acct = (
  id: string,
  status: "active" | "archived" = "active",
): SwitcherAccount => ({
  id,
  accountHandle: `@${id}`,
  platform: "douyin",
  status,
});

describe("resolveCurrentAccount — SPEC §E 退化", () => {
  it("① 0 个号 → currentId=null(走绑定引导)", () => {
    expect(resolveCurrentAccount([], null)).toEqual({
      currentId: null,
      shouldPersist: false,
    });
  });

  it("② 有号但 stored 为空 → 自动选第一个 active + 需写回", () => {
    const r = resolveCurrentAccount([acct("a"), acct("b")], null);
    expect(r).toEqual({ currentId: "a", shouldPersist: true });
  });

  it("stored 命中一个 active 号 → 保持不动,不写回", () => {
    const r = resolveCurrentAccount([acct("a"), acct("b")], "b");
    expect(r).toEqual({ currentId: "b", shouldPersist: false });
  });

  it("③ stored 指向已删号(列表里没有)→ 清除 + 回落第一个 active", () => {
    const r = resolveCurrentAccount([acct("a"), acct("b")], "ghost");
    expect(r).toEqual({ currentId: "a", shouldPersist: true });
  });

  it("stored 指向已归档号 → 不选归档,回落第一个 active", () => {
    const r = resolveCurrentAccount(
      [acct("arch", "archived"), acct("live")],
      "arch",
    );
    expect(r).toEqual({ currentId: "live", shouldPersist: true });
  });

  it("只有归档号(无 active)→ currentId=null;stored 失效时需清除", () => {
    const r = resolveCurrentAccount([acct("arch", "archived")], "arch");
    expect(r).toEqual({ currentId: null, shouldPersist: true });
  });

  it("只有归档号 + stored 本就为空 → null 且无需写回", () => {
    const r = resolveCurrentAccount([acct("arch", "archived")], null);
    expect(r).toEqual({ currentId: null, shouldPersist: false });
  });

  it("第一个是归档、第二个 active、stored 空 → 选第二个(第一个 active)", () => {
    const r = resolveCurrentAccount(
      [acct("arch", "archived"), acct("live1"), acct("live2")],
      null,
    );
    expect(r).toEqual({ currentId: "live1", shouldPersist: true });
  });
});
