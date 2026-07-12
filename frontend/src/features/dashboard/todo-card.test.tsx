/**
 * [T-247] 待办完成勾选:点勾 → tasks.patch { status:'done' } → 乐观划线 +
 * router.refresh();失败 → 回滚 + 行内错误。
 */

import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";

const mockRouter = {
  refresh: vi.fn(),
  replace: vi.fn(),
  push: vi.fn(),
  back: vi.fn(),
};
vi.mock("next/navigation", () => ({ useRouter: () => mockRouter }));

const mockPatchTask = vi.fn(
  (input: unknown): Promise<unknown> => Promise.resolve({ id: "task-1", input }),
);
vi.mock("@/lib/contract-client", () => ({
  client: {
    patchTask: (input: unknown) => mockPatchTask(input),
  },
}));

import { TodoCard } from "./todo-card";
import type { TodoRow } from "@/types/view-models";

const TODOS: ReadonlyArray<TodoRow> = [
  {
    id: "task-1",
    title: "写口播脚本",
    projectId: "project-1",
    projectTitle: "AI 浏览器深解",
    stage: "script",
    dueAt: null,
    priority: 1,
    status: "todo",
  },
  {
    id: "task-2",
    title: "复盘上一条",
    projectId: "project-2",
    projectTitle: "上一条视频",
    stage: "review",
    dueAt: null,
    priority: 3,
    status: "todo",
  },
];

beforeEach(() => {
  mockRouter.refresh.mockClear();
  mockPatchTask.mockClear();
  mockPatchTask.mockResolvedValue({ id: "task-1" });
});

afterEach(() => cleanup());

describe("TodoCard 完成勾选 (T-247)", () => {
  it("点勾 → patchTask({status:'done'}) + 乐观划线 + router.refresh", async () => {
    const { container } = render(<TodoCard todos={TODOS} />);
    const rows = container.querySelectorAll('[data-slot="todo-row"]');
    expect(rows.length).toBe(2);
    const btn = rows[0]!.querySelector(
      '[data-slot="todo-complete"]',
    ) as HTMLButtonElement;
    expect(btn).not.toBeNull();
    fireEvent.click(btn);

    // 乐观:该行立即标记完成(data-done)。
    await waitFor(() =>
      expect(
        container
          .querySelector('[data-slot="todo-row"]')!
          .getAttribute("data-done"),
      ).toBe("true"),
    );
    await waitFor(() => expect(mockPatchTask).toHaveBeenCalledTimes(1));
    expect(mockPatchTask).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { taskId: "task-1" },
        body: { status: "done" },
      }),
    );
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalledTimes(1));
  });

  it("patchTask 失败 → 回滚乐观态 + 行内错误提示(不假装已完成)", async () => {
    mockPatchTask.mockRejectedValue(new Error("boom"));
    const { container } = render(<TodoCard todos={TODOS} />);
    const btn = container.querySelector(
      '[data-slot="todo-complete"]',
    ) as HTMLButtonElement;
    fireEvent.click(btn);

    await waitFor(() =>
      expect(
        container.querySelector('[data-slot="todo-complete-error"]'),
      ).not.toBeNull(),
    );
    expect(
      container.querySelector('[data-slot="todo-row"]')!.getAttribute("data-done"),
    ).toBe("false");
    expect(mockRouter.refresh).not.toHaveBeenCalled();
  });

  it("空待办 → 诚实空态 + 选题池引导(既有行为不回归)", () => {
    const { container } = render(<TodoCard todos={[]} />);
    expect(container.querySelector('[data-slot="todo-empty"]')).not.toBeNull();
  });
});
