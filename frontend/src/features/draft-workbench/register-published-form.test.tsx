/**
 * [T-055h③/T-063c] 稿面「登记已发布」表单接线测试:
 *   - 粘完整链接 → registerPublishedPublication(published + external_id)→
 *     尽力触发 self.metrics runNow → router.refresh;
 *   - 项目还没有 ContentOutput → 先 createOutput 铸一个再登记;
 *   - 短链解析不出编号 → 就地提示,不发任何写 op(不做假登记)。
 * 确定性:mock client 立即 resolve;无 Date.now / 网络。
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

const mockRouter = { refresh: vi.fn(), push: vi.fn(), replace: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => mockRouter }));

const mockClient = {
  createOutput: vi.fn(
    (_i: unknown): Promise<unknown> => Promise.resolve({ id: "output-new" }),
  ),
  registerPublishedPublication: vi.fn(
    (_i: unknown): Promise<unknown> =>
      Promise.resolve({ id: "pub-1", status: "published" }),
  ),
  listScheduledJobs: vi.fn(
    (_i: unknown): Promise<unknown> =>
      Promise.resolve([
        { id: "sched-1", enabled: true, sourceKind: "self.metrics" },
      ]),
  ),
  runScheduledJobNow: vi.fn(
    (_i: unknown): Promise<unknown> =>
      Promise.resolve({ jobRunId: "run-1", aiTaskId: "task-1", deduped: false }),
  ),
};
vi.mock("@/lib/contract-client", () => ({
  client: {
    createOutput: (i: unknown) => mockClient.createOutput(i),
    registerPublishedPublication: (i: unknown) =>
      mockClient.registerPublishedPublication(i),
    listScheduledJobs: (i: unknown) => mockClient.listScheduledJobs(i),
    runScheduledJobNow: (i: unknown) => mockClient.runScheduledJobNow(i),
  },
}));

import { RegisterPublishedForm } from "./register-published-form";

const LINK = "https://www.douyin.com/video/7423000000000000001";

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => cleanup());

describe("RegisterPublishedForm", () => {
  it("粘链接 → register(published+external_id)→ 触发 runNow → refresh", async () => {
    render(
      <RegisterPublishedForm
        projectId="project-1"
        projectTitle="我的作品"
        outputId="output-1"
      />,
    );
    fireEvent.change(screen.getByLabelText("抖音链接"), {
      target: { value: LINK },
    });
    fireEvent.click(screen.getByRole("button", { name: "登记已发布" }));

    await waitFor(() =>
      expect(mockClient.registerPublishedPublication).toHaveBeenCalledWith({
        params: { outputId: "output-1" },
        query: undefined,
        body: {
          platform: "douyin",
          externalId: "7423000000000000001",
          externalUrl: LINK,
          title: "我的作品",
        },
      }),
    );
    // 已有 output → 不再铸
    expect(mockClient.createOutput).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(mockClient.runScheduledJobNow).toHaveBeenCalledWith({
        params: { jobId: "sched-1" },
        query: undefined,
        body: {},
      }),
    );
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalled());
    expect(
      screen.getByTestId("register-published-message").textContent,
    ).toMatch(/已开始抓取这条作品的数据/);
  });

  it("项目还没有 ContentOutput → 先 createOutput 再登记到新 output", async () => {
    render(
      <RegisterPublishedForm
        projectId="project-1"
        projectTitle="我的作品"
        outputId={null}
      />,
    );
    fireEvent.change(screen.getByLabelText("抖音链接"), {
      target: { value: LINK },
    });
    fireEvent.click(screen.getByRole("button", { name: "登记已发布" }));

    await waitFor(() =>
      expect(mockClient.createOutput).toHaveBeenCalledWith({
        params: { projectId: "project-1" },
        query: undefined,
        body: { title: "我的作品" },
      }),
    );
    await waitFor(() =>
      expect(mockClient.registerPublishedPublication).toHaveBeenCalledWith(
        expect.objectContaining({ params: { outputId: "output-new" } }),
      ),
    );
  });

  it("没有启用的 self.metrics 作业 → 登记仍落库,提示下次采集覆盖", async () => {
    mockClient.listScheduledJobs.mockResolvedValueOnce([]);
    render(
      <RegisterPublishedForm
        projectId="project-1"
        projectTitle="我的作品"
        outputId="output-1"
      />,
    );
    fireEvent.change(screen.getByLabelText("抖音链接"), {
      target: { value: LINK },
    });
    fireEvent.click(screen.getByRole("button", { name: "登记已发布" }));

    await waitFor(() =>
      expect(mockClient.registerPublishedPublication).toHaveBeenCalled(),
    );
    expect(mockClient.runScheduledJobNow).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(
        screen.getByTestId("register-published-message").textContent,
      ).toMatch(/下次自动采集会带回这条作品的数据/),
    );
  });

  it("短链/无编号 → 就地提示,不发任何写 op(不做假登记)", async () => {
    render(
      <RegisterPublishedForm
        projectId="project-1"
        projectTitle="我的作品"
        outputId="output-1"
      />,
    );
    fireEvent.change(screen.getByLabelText("抖音链接"), {
      target: { value: "https://v.douyin.com/iAbCdEf/" },
    });
    fireEvent.click(screen.getByRole("button", { name: "登记已发布" }));

    expect(
      screen.getByTestId("register-published-message").textContent,
    ).toMatch(/没解析出视频编号/);
    expect(mockClient.registerPublishedPublication).not.toHaveBeenCalled();
    expect(mockClient.createOutput).not.toHaveBeenCalled();
    expect(mockRouter.refresh).not.toHaveBeenCalled();
  });
});
