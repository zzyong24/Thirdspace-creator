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

  it("T-767 同一脚本版本重新审核后，服务端新 report id 会替换本地旧结论", () => {
    const oldReport = {
      id: "review-old",
      artifactVersion: 2,
      verdict: "block",
      reviewedAt: "2026-08-11T08:00:00.000Z",
    } as never;
    const newReport = {
      id: "review-new",
      artifactVersion: 2,
      verdict: "pass",
      reviewedAt: "2026-08-11T08:01:00.000Z",
    } as never;
    const { result, rerender } = renderHook(
      ({ initial }) => useLatestScriptReview("project-1", initial, 2),
      { initialProps: { initial: oldReport } },
    );

    expect(result.current?.id).toBe("review-old");
    rerender({ initial: newReport });
    expect(result.current?.id).toBe("review-new");
    expect(result.current?.verdict).toBe("pass");
  });
});
