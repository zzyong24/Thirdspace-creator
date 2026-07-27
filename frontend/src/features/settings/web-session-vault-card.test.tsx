import * as React from "react";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WebSessionVaultCard } from "./web-session-vault-card";

const STATUS_STORAGE_KEY = "creatoros.settings.web-session-status.v1";

const SESSIONS = [
  { domain: "chatgpt.com", lastLoginAt: "2026-07-22T09:19:00.000Z" },
  { domain: "zhihu.com", lastLoginAt: "2026-07-22T09:18:00.000Z" },
];

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as Response;
}

function requestedActions(fetchMock: ReturnType<typeof vi.fn>): string[] {
  return fetchMock.mock.calls.map((call) => {
    const init = call[1] as RequestInit;
    return (JSON.parse(String(init.body)) as { action: string }).action;
  });
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("WebSessionVaultCard 状态缓存", () => {
  it("重复挂载只读取 list + 本机缓存，不自动逐站调用 status", async () => {
    window.localStorage.setItem(
      STATUS_STORAGE_KEY,
      JSON.stringify({
        "chatgpt.com": {
          loggedIn: true,
          checkedAt: "2026-07-24T10:00:00.000Z",
        },
        "zhihu.com": {
          loggedIn: false,
          checkedAt: "2026-07-24T10:01:00.000Z",
        },
      }),
    );
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const action = (JSON.parse(String(init?.body)) as { action: string }).action;
      if (action === "list") return jsonResponse({ sessions: SESSIONS });
      return jsonResponse({ loggedIn: true });
    });
    vi.stubGlobal("fetch", fetchMock);

    const first = render(<WebSessionVaultCard />);
    await waitFor(() => expect(first.container.textContent).toContain("chatgpt.com"));
    expect(requestedActions(fetchMock)).toEqual(["list"]);
    expect(first.container.textContent).toContain("已登录");
    expect(first.container.textContent).toContain("需重登");

    first.unmount();
    render(<WebSessionVaultCard />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(requestedActions(fetchMock)).toEqual(["list", "list"]);
  });

  it("点“刷新状态”才逐站探测，并把结果与时间写回本机缓存", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        action: string;
        domain?: string;
      };
      if (body.action === "list") return jsonResponse({ sessions: SESSIONS });
      return jsonResponse({
        domain: body.domain,
        loggedIn: body.domain === "chatgpt.com",
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { container, getByRole } = render(<WebSessionVaultCard />);
    await waitFor(() => expect(container.textContent).toContain("2 个网站"));
    expect(container.textContent).toContain("未检查 2");

    fireEvent.click(getByRole("button", { name: "刷新全部网站状态" }));

    await waitFor(() =>
      expect(requestedActions(fetchMock)).toEqual(["list", "status", "status"]),
    );
    const stored = JSON.parse(
      window.localStorage.getItem(STATUS_STORAGE_KEY) ?? "{}",
    ) as Record<string, { loggedIn: boolean; checkedAt: string }>;
    expect(stored["chatgpt.com"]?.loggedIn).toBe(true);
    expect(stored["zhihu.com"]?.loggedIn).toBe(false);
    expect(Date.parse(stored["chatgpt.com"]?.checkedAt ?? "")).not.toBeNaN();
  });
});

describe("WebSessionVaultCard 长列表收纳", () => {
  it("网站列表默认折叠，可手动展开且列表体限高滚动", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ sessions: SESSIONS }));
    vi.stubGlobal("fetch", fetchMock);

    const { container, getByRole } = render(<WebSessionVaultCard />);
    await waitFor(() => expect(container.textContent).toContain("2 个网站"));

    const toggle = getByRole("button", { name: "展开网站列表" });
    const body = container.querySelector<HTMLElement>(
      '[data-slot="web-session-list-body"]',
    );
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(body?.hidden).toBe(true);
    expect(body?.className).toContain("overflow-y-auto");

    fireEvent.click(toggle);
    expect(getByRole("button", { name: "收起网站列表" })).not.toBeNull();
    expect(body?.hidden).toBe(false);
  });
});
