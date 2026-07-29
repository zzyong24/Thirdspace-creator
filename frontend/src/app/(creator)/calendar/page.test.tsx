import { beforeEach, describe, expect, it, vi } from "vitest";

const redirectMock = vi.fn((href: string) => {
  throw new Error(`REDIRECT:${href}`);
});

vi.mock("next/navigation", () => ({
  redirect: (href: string) => redirectMock(href),
}));

vi.mock("@/lib/session.server", () => ({
  resolveSession: vi.fn(() => {
    throw new Error("兼容路由不应再解析 session");
  }),
}));

import CalendarRoutePage from "./page";

beforeEach(() => vi.clearAllMocks());

describe("/calendar 兼容跳转", () => {
  it("保留合法 month 并服务端跳到发布中心", async () => {
    await expect(
      CalendarRoutePage({
        searchParams: Promise.resolve({ month: "2026-08" }),
      }),
    ).rejects.toThrow("REDIRECT:/publishing?month=2026-08");
    expect(redirectMock).toHaveBeenCalledWith("/publishing?month=2026-08");
  });

  it("非法或缺省 month 不透传", async () => {
    await expect(
      CalendarRoutePage({
        searchParams: Promise.resolve({ month: "2026-99" }),
      }),
    ).rejects.toThrow("REDIRECT:/publishing");
    expect(redirectMock).toHaveBeenLastCalledWith("/publishing");
  });
});
