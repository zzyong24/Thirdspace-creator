// [T-332 S4] 日历页「当前号」接线测(SPEC §6.1/§4.2):
//  - 只按 route 传入的 ctx 当前号读(不再自选第一个 active —— 那会与 ctx 撞
//    S2 的号一致性门 404);
//  - 未选号 / 号不在本 user active 列表 → 诚实空态,绝不代猜;
//  - 0 个号 → 绑定引导 + /accounts 深链。
// Deterministic:now 注入固定时钟,client 全 mock。

import * as React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ContentCalendarPage,
  type ContentCalendarReadClient,
} from "./content-calendar-page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

afterEach(() => cleanup());

const NOW = new Date("2026-07-15T10:00:00");

function account(id: string, status: "active" | "archived" = "active") {
  return {
    id,
    userId: "user-a",
    platform: "douyin",
    accountHandle: `@${id}`,
    secretReference: null,
    followerBaseline: 0,
    status,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
  };
}

// 窄 mock client:日历自己的读全 stub;发布中心装配缺方法会在其内部 try/catch 兜成
// error VM(publications 空),日历诚实渲空,不影响本测关注的「按哪个号读」。
function makeClient(accounts: ReturnType<typeof account>[]) {
  const listAccounts = vi.fn(async (_i: unknown) => accounts);
  const listCalendar = vi.fn(async (_i: unknown) => []);
  const listProjects = vi.fn(async (_i: unknown) => []);
  const getCadence = vi.fn(async (_i: unknown) => null);
  const getCadenceAttainment = vi.fn(async (_i: unknown) => null);
  const client = {
    listAccounts,
    listCalendar,
    listProjects,
    getCadence,
    getCadenceAttainment,
  } as unknown as ContentCalendarReadClient;
  return { client, listAccounts, listCalendar, getCadence, getCadenceAttainment };
}

describe("ContentCalendarPage — 当前号接线(T-332 S4)", () => {
  it("用 ctx 当前号读,不自选第一个 active(两号并存时读的是传入的 b,不是 a)", async () => {
    const { client, listCalendar, getCadence } = makeClient([
      account("a"),
      account("b"),
    ]);
    render(
      await ContentCalendarPage({
        client,
        now: NOW,
        currentAccountId: "b",
      }),
    );
    expect(listCalendar).toHaveBeenCalledTimes(1);
    expect(listCalendar.mock.calls[0]![0]).toMatchObject({
      params: { accountId: "b" },
    });
    expect(getCadence.mock.calls[0]![0]).toMatchObject({
      params: { accountId: "b" },
    });
  });

  it("未选号(currentAccountId=null)但有 active 号 → 选号引导空态,不读日历", async () => {
    const { client, listCalendar } = makeClient([account("a")]);
    render(
      await ContentCalendarPage({ client, now: NOW, currentAccountId: null }),
    );
    expect(listCalendar).not.toHaveBeenCalled();
    expect(screen.getByTestId("calendar-empty-state").textContent).toContain(
      "账号切换器",
    );
    // 有号未选 ≠ 没号:不显绑定深链。
    expect(screen.queryByTestId("calendar-empty-bind-link")).toBeNull();
  });

  it("当前号已归档/不在列表 → 同未选号空态,绝不回落自选", async () => {
    const { client, listCalendar } = makeClient([
      account("arch", "archived"),
      account("live"),
    ]);
    render(
      await ContentCalendarPage({
        client,
        now: NOW,
        currentAccountId: "arch",
      }),
    );
    expect(listCalendar).not.toHaveBeenCalled();
    expect(screen.getByTestId("calendar-empty-state")).toBeInTheDocument();
  });

  it("0 个号 → 绑定引导 + /accounts 深链(§6.2 日历行)", async () => {
    const { client } = makeClient([]);
    render(
      await ContentCalendarPage({ client, now: NOW, currentAccountId: null }),
    );
    expect(screen.getByTestId("calendar-empty-state").textContent).toContain(
      "绑定",
    );
    expect(screen.getByTestId("calendar-empty-bind-link")).toHaveAttribute(
      "href",
      "/accounts",
    );
  });
});
