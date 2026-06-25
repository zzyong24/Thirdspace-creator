/**
 * AdoptCandidateCard — the reusable candidate-confirm surface. Drives the full loop with
 * fake timers: start → createAITask → poll getTask(awaiting) → listTaskResults → review →
 * 采纳 → confirmTask + router.refresh. Mocks the contract client + next router.
 */

import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";

const mockRouter = { refresh: vi.fn(), replace: vi.fn(), push: vi.fn(), back: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => mockRouter }));

const mockClient = {
  createAITask: vi.fn((_i: unknown) =>
    Promise.resolve({ id: "task-1", status: "queued" }),
  ),
  getTask: vi.fn((_i: unknown) =>
    Promise.resolve({ status: "awaiting_confirmation" }),
  ),
  listTaskResults: vi.fn((_i: unknown) =>
    Promise.resolve([{ resultData: { items: [{ title: "甲" }, { title: "乙" }] } }]),
  ),
  confirmTask: vi.fn((_i: unknown) =>
    Promise.resolve({ id: "task-1", status: "succeeded" }),
  ),
  // P4 hydration: default to "no in-flight task" so the idle→start path is unchanged;
  // individual tests override per-mount to exercise resume.
  listAITasks: vi.fn((_i: unknown) => Promise.resolve([] as unknown[])),
};
vi.mock("@/lib/contract-client", () => ({
  client: {
    createAITask: (i: unknown) => mockClient.createAITask(i),
    getTask: (i: unknown) => mockClient.getTask(i),
    listTaskResults: (i: unknown) => mockClient.listTaskResults(i),
    confirmTask: (i: unknown) => mockClient.confirmTask(i),
    listAITasks: (i: unknown) => mockClient.listAITasks(i),
  },
}));

interface Item {
  title: string;
}

afterEach(() => cleanup());
beforeEach(() => {
  vi.useFakeTimers();
  Object.values(mockClient).forEach((m) => m.mockClear());
  mockRouter.refresh.mockClear();
});

async function renderCard() {
  const { AdoptCandidateCard } = await import("./adopt-candidate-card");
  return render(
    <AdoptCandidateCard<Item>
      title="测试节点"
      description="d"
      startLabel="开始"
      runningLabel="跑着…"
      taskType="test.node"
      inputData={{ projectId: "p-1" }}
      parseItems={(rd) => (rd.items as Item[]) ?? []}
      renderItem={(item) => <span>{item.title}</span>}
      adoptLabel={(n) => `采纳全部（${n}）`}
      doneLabel={(n) => `已采纳 ${n} 条。`}
    />,
  );
}

describe("AdoptCandidateCard", () => {
  it("start → poll(awaiting) → review renders candidates → 采纳 → confirmTask + refresh", async () => {
    const { getByText, queryByText, container } = await renderCard();

    // Advance one poll interval: createAITask resolves → getTask(awaiting) → listTaskResults.
    await act(async () => {
      fireEvent.click(container.querySelector('[data-slot="adopt-start"]')!);
      await vi.advanceTimersByTimeAsync(4000);
    });
    expect(mockClient.createAITask).toHaveBeenCalledWith(
      expect.objectContaining({ body: { taskType: "test.node", inputData: { projectId: "p-1" } } }),
    );
    expect(queryByText("甲")).not.toBeNull();
    expect(queryByText("乙")).not.toBeNull();

    await act(async () => {
      fireEvent.click(container.querySelector('[data-slot="adopt-confirm"]')!);
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mockClient.confirmTask).toHaveBeenCalledWith({
      params: { taskId: "task-1" },
      query: undefined,
      body: undefined,
    });
    expect(mockRouter.refresh).toHaveBeenCalled();
    expect(getByText(/已采纳 2 条/)).not.toBeNull();
  });

  it("a cancelled task surfaces the error state (no infinite poll)", async () => {
    mockClient.getTask.mockResolvedValueOnce({ status: "cancelled" });
    const { queryByText, container } = await renderCard();
    await act(async () => {
      fireEvent.click(container.querySelector('[data-slot="adopt-start"]')!);
      await vi.advanceTimersByTimeAsync(4000);
    });
    expect(container.querySelector('[data-slot="adopt-error"]')).not.toBeNull();
    expect(queryByText("甲")).toBeNull();
  });

  // P4 hydration (切页不丢): a fresh mount must reconcile against the server.

  it("hydrates an awaiting_confirmation task on mount → straight to review (no click)", async () => {
    mockClient.listAITasks.mockResolvedValueOnce([
      {
        id: "task-9",
        taskType: "test.node",
        projectId: "p-1",
        status: "awaiting_confirmation",
      },
    ]);
    const { queryByText, container } = await renderCard();
    // Flush the mount hydration effect (listAITasks → listTaskResults → review).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mockClient.createAITask).not.toHaveBeenCalled();
    expect(container.querySelector('[data-slot="adopt-review"]')).not.toBeNull();
    expect(queryByText("甲")).not.toBeNull();
    expect(queryByText("乙")).not.toBeNull();
    // 采纳 confirms the HYDRATED task id, proving taskId was restored.
    await act(async () => {
      fireEvent.click(container.querySelector('[data-slot="adopt-confirm"]')!);
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mockClient.confirmTask).toHaveBeenCalledWith({
      params: { taskId: "task-9" },
      query: undefined,
      body: undefined,
    });
  });

  it("hydrates a running task on mount → resumes polling into review", async () => {
    mockClient.listAITasks.mockResolvedValueOnce([
      { id: "task-7", taskType: "test.node", projectId: "p-1", status: "running" },
    ]);
    const { queryByText, container } = await renderCard();
    // Mount effect resolves → running phase; one poll interval → getTask(awaiting) → review.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(container.querySelector('[data-slot="adopt-running"]')).not.toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });
    expect(mockClient.getTask).toHaveBeenCalledWith({
      params: { taskId: "task-7" },
      query: undefined,
      body: undefined,
    });
    expect(queryByText("甲")).not.toBeNull();
  });

  it("ignores in-flight tasks of a different node (taskType / projectId mismatch)", async () => {
    mockClient.listAITasks.mockResolvedValueOnce([
      { id: "x", taskType: "other.node", projectId: "p-1", status: "running" },
      { id: "y", taskType: "test.node", projectId: "p-2", status: "running" },
    ]);
    const { container } = await renderCard();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    // Neither matches (taskType test.node ∩ projectId p-1) → stays idle.
    expect(container.querySelector('[data-slot="adopt-start"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="adopt-running"]')).toBeNull();
    expect(container.querySelector('[data-slot="adopt-review"]')).toBeNull();
  });
});
