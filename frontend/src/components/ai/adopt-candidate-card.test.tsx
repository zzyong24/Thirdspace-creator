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
};
vi.mock("@/lib/contract-client", () => ({
  client: {
    createAITask: (i: unknown) => mockClient.createAITask(i),
    getTask: (i: unknown) => mockClient.getTask(i),
    listTaskResults: (i: unknown) => mockClient.listTaskResults(i),
    confirmTask: (i: unknown) => mockClient.confirmTask(i),
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
});
