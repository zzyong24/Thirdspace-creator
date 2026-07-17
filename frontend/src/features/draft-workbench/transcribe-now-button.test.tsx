/**
 * [T-374] 稿面顶条「立即抓取逐字稿」接线测试:
 *   - 点击 → transcribeProjectWork({ params: { projectId } })(排 transcribe.douyin,后台跑);
 *   - 排队成功 → 「已排队,完成后刷新可见」+ 置灰(不轮询到完成 —— 转写分钟级,诚实提示刷新);
 *   - 失败 → 「抓取失败,重试」可再点(重试真的再发一次);
 *   - 请求中 → 「抓取中…后台跑」置灰,不重复发。
 * 确定性:mock client,可控 resolve/reject;无网络。
 */

import * as React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockClient = {
  transcribeProjectWork: vi.fn(
    (_i: unknown): Promise<unknown> => Promise.resolve({ taskId: "task-1" }),
  ),
};
vi.mock("@/lib/contract-client", () => ({
  client: {
    transcribeProjectWork: (i: unknown) => mockClient.transcribeProjectWork(i),
  },
}));

import { TranscribeNowButton } from "./transcribe-now-button";

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => cleanup());

describe("TranscribeNowButton (T-374)", () => {
  it("点击 → transcribeProjectWork 带 projectId;成功 → 已排队文案 + 置灰", async () => {
    render(<TranscribeNowButton projectId="p-42" />);
    const btn = screen.getByRole("button", { name: /立即抓取逐字稿/ });
    fireEvent.click(btn);
    await waitFor(() =>
      expect(screen.getByRole("button").textContent).toContain(
        "已排队,完成后刷新可见",
      ),
    );
    expect(mockClient.transcribeProjectWork).toHaveBeenCalledTimes(1);
    expect(mockClient.transcribeProjectWork).toHaveBeenCalledWith({
      params: { projectId: "p-42" },
      query: undefined,
      body: undefined,
    });
    // 已排队 → 置灰(任务在后台跑,重复排幂等任务无意义)。
    expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("请求中 → 「抓取中…后台跑」置灰", async () => {
    let release: (v: unknown) => void = () => {};
    mockClient.transcribeProjectWork.mockImplementationOnce(
      () => new Promise((r) => (release = r)),
    );
    render(<TranscribeNowButton projectId="p-1" />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() =>
      expect(screen.getByRole("button").textContent).toContain(
        "抓取中…后台跑",
      ),
    );
    expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(
      true,
    );
    release({ taskId: "task-1" });
    await waitFor(() =>
      expect(screen.getByRole("button").textContent).toContain("已排队"),
    );
  });

  it("失败 → 诚实报错可重试,再点真的重发", async () => {
    mockClient.transcribeProjectWork.mockRejectedValueOnce(
      new Error("boom"),
    );
    render(<TranscribeNowButton projectId="p-1" />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() =>
      expect(screen.getByRole("button").textContent).toContain(
        "抓取失败,重试",
      ),
    );
    expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(
      false,
    );
    // 重试:第二次成功 → 已排队。
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() =>
      expect(screen.getByRole("button").textContent).toContain("已排队"),
    );
    expect(mockClient.transcribeProjectWork).toHaveBeenCalledTimes(2);
  });
});
