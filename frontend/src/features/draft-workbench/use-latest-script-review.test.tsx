import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useLatestScriptReview } from "./use-latest-script-review";

const getLatestScriptReview = vi.fn();

vi.mock("@/lib/contract-client", () => ({
  client: {
    getLatestScriptReview: (...args: unknown[]) =>
      getLatestScriptReview(...args),
  },
}));

afterEach(() => {
  vi.useRealTimers();
  getLatestScriptReview.mockReset();
});

describe("T-585 稿面审核空态轮询", () => {
  it("从未审核时不再每 8 秒请求，窗口重新聚焦时才补拉一次", async () => {
    vi.useFakeTimers();
    getLatestScriptReview.mockRejectedValue(new Error("not found"));
    renderHook(() => useLatestScriptReview("project-1", null, 1));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(24_000);
    });
    expect(getLatestScriptReview).not.toHaveBeenCalled();

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      await Promise.resolve();
    });
    expect(getLatestScriptReview).toHaveBeenCalledTimes(1);
  });
});
