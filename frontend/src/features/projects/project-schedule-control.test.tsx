import * as React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockRouter = { refresh: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

const mockClient = {
  createEntry: vi.fn((input: unknown): Promise<unknown> => Promise.resolve(input)),
  updateEntry: vi.fn((input: unknown): Promise<unknown> => Promise.resolve(input)),
  deleteEntry: vi.fn((input: unknown): Promise<unknown> => Promise.resolve(input)),
};

vi.mock("@/lib/contract-client", () => ({
  client: {
    createEntry: (input: unknown) => mockClient.createEntry(input),
    updateEntry: (input: unknown) => mockClient.updateEntry(input),
    deleteEntry: (input: unknown) => mockClient.deleteEntry(input),
  },
}));

import {
  ProjectScheduleControl,
  type ProjectScheduleSummary,
} from "./project-schedule-control";

const SCHEDULE: ProjectScheduleSummary = {
  id: "cal-1",
  projectId: "project-1",
  plannedDate: "2026-08-03",
  status: "planned",
};

function renderControl(
  overrides: Partial<React.ComponentProps<typeof ProjectScheduleControl>> = {},
) {
  return render(
    <ProjectScheduleControl
      accountId="account-1"
      projectId="project-1"
      projectTitle="夏季栏目"
      referenceDateKey="2026-07-29"
      schedule={null}
      eligible
      {...overrides}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockClient.createEntry.mockImplementation((input) => Promise.resolve(input));
  mockClient.updateEntry.mockImplementation((input) => Promise.resolve(input));
  mockClient.deleteEntry.mockImplementation((input) => Promise.resolve(input));
});

afterEach(() => cleanup());

describe("ProjectScheduleControl", () => {
  it("未排期项目选择今天或未来日期后走真实 createEntry，并刷新读回", async () => {
    renderControl();

    fireEvent.click(screen.getByRole("button", { name: "为夏季栏目排期" }));
    const input = screen.getByLabelText("计划发布日期");
    expect(input).toHaveAttribute("type", "date");
    expect(input).toHaveAttribute("min", "2026-07-29");

    fireEvent.change(input, { target: { value: "2026-08-03" } });
    fireEvent.click(screen.getByRole("button", { name: "确认排期" }));

    await waitFor(() => expect(mockClient.createEntry).toHaveBeenCalledTimes(1));
    expect(mockClient.createEntry).toHaveBeenCalledWith({
      params: { accountId: "account-1" },
      query: undefined,
      body: {
        projectId: "project-1",
        plannedDate: "2026-08-03",
      },
    });
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalledTimes(1));
  });

  it("已有排期把“改期”和日期都明确显示，保存时走 updateEntry", async () => {
    renderControl({ schedule: SCHEDULE });

    expect(
      screen.getByRole("button", {
        name: "修改夏季栏目排期，当前 8月3日",
      }),
    ).toHaveTextContent("改期 · 8月3日");
    fireEvent.click(screen.getByRole("button", { name: "修改夏季栏目排期，当前 8月3日" }));
    const input = screen.getByLabelText("计划发布日期");
    expect(input).toHaveValue("2026-08-03");
    fireEvent.change(input, { target: { value: "2026-08-08" } });
    fireEvent.click(screen.getByRole("button", { name: "保存改期" }));

    await waitFor(() => expect(mockClient.updateEntry).toHaveBeenCalledTimes(1));
    expect(mockClient.updateEntry).toHaveBeenCalledWith({
      params: { entryId: "cal-1" },
      query: undefined,
      body: { plannedDate: "2026-08-08" },
    });
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalledTimes(1));
  });

  it("取消排期必须经过系统 Dialog 二次确认，再走 deleteEntry", async () => {
    renderControl({ schedule: SCHEDULE });

    fireEvent.click(screen.getByRole("button", { name: /修改夏季栏目排期/ }));
    fireEvent.click(screen.getByRole("button", { name: "取消排期" }));
    expect(screen.getByRole("dialog", { name: "取消这项排期？" })).toBeTruthy();
    expect(mockClient.deleteEntry).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "确认取消排期" }));
    await waitFor(() => expect(mockClient.deleteEntry).toHaveBeenCalledTimes(1));
    expect(mockClient.deleteEntry).toHaveBeenCalledWith({
      params: { entryId: "cal-1" },
      query: undefined,
      body: undefined,
    });
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalledTimes(1));
  });

  it("请求失败保留浮层和用户刚选的日期，显示可重试错误且不刷新", async () => {
    mockClient.createEntry.mockRejectedValueOnce(new Error("500"));
    renderControl();

    fireEvent.click(screen.getByRole("button", { name: "为夏季栏目排期" }));
    fireEvent.change(screen.getByLabelText("计划发布日期"), {
      target: { value: "2026-08-05" },
    });
    fireEvent.click(screen.getByRole("button", { name: "确认排期" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "排期失败，请稍后重试。",
    );
    expect(screen.getByLabelText("计划发布日期")).toHaveValue("2026-08-05");
    expect(screen.getByTestId("project-schedule-popover")).toBeTruthy();
    expect(mockRouter.refresh).not.toHaveBeenCalled();
  });

  it("取消排期失败时保留确认框和服务端原日期，允许直接重试", async () => {
    mockClient.deleteEntry.mockRejectedValueOnce(new Error("500"));
    renderControl({ schedule: SCHEDULE });

    fireEvent.click(screen.getByRole("button", { name: /修改夏季栏目排期/ }));
    fireEvent.click(screen.getByRole("button", { name: "取消排期" }));
    fireEvent.click(screen.getByRole("button", { name: "确认取消排期" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "取消排期失败，请稍后重试。",
    );
    expect(screen.getByRole("dialog", { name: "取消这项排期？" })).toBeTruthy();
    expect(mockRouter.refresh).not.toHaveBeenCalled();
  });

  it("pending 时禁止重复提交，按钮给出明确状态", async () => {
    let resolve!: (value: unknown) => void;
    mockClient.createEntry.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    renderControl();

    fireEvent.click(screen.getByRole("button", { name: "为夏季栏目排期" }));
    fireEvent.change(screen.getByLabelText("计划发布日期"), {
      target: { value: "2026-08-05" },
    });
    fireEvent.click(screen.getByRole("button", { name: "确认排期" }));

    expect(screen.getByRole("button", { name: "保存中…" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "保存中…" }));
    expect(mockClient.createEntry).toHaveBeenCalledTimes(1);

    resolve({});
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalledTimes(1));
  });

  it("不具备排期资格时完全不渲染控件", () => {
    const { container } = renderControl({ eligible: false });
    expect(container).toBeEmptyDOMElement();
  });

  it("触发器暴露展开状态，Escape 关闭浮层后焦点返回触发器", async () => {
    renderControl();
    const trigger = screen.getByRole("button", { name: "为夏季栏目排期" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    screen.getByLabelText("计划发布日期").focus();
    fireEvent.keyDown(document, { key: "Escape", code: "Escape" });

    await waitFor(() => {
      expect(trigger).toHaveAttribute("aria-expanded", "false");
      expect(trigger).toHaveFocus();
    });
  });
});
