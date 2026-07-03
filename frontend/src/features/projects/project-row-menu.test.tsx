/**
 * [T-085] ProjectRowMenu 状态感知测试:已归档行不再放出必 409 的归档动作
 * (换禁用态「已归档」);active 行保留归档动作。
 */

import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockRouter = { refresh: vi.fn(), replace: vi.fn(), push: vi.fn() };

vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

const mockClient = {
  archiveProject: vi.fn(
    (input: unknown): Promise<unknown> => Promise.resolve({ id: "p", input }),
  ),
};

vi.mock("@/lib/contract-client", () => ({
  client: {
    archiveProject: (input: unknown) => mockClient.archiveProject(input),
  },
}));

beforeEach(() => {
  mockRouter.refresh.mockClear();
  mockClient.archiveProject.mockClear();
});

afterEach(() => {
  cleanup();
});

describe("ProjectRowMenu — [T-085] 归档状态感知", () => {
  it("archived 行:菜单项是禁用态「已归档」,点了也不发请求", async () => {
    const { ProjectRowMenu } = await import("./project-row-menu");
    render(
      <ProjectRowMenu
        projectId="p-1"
        projectTitle="已归档项目"
        openHref="/projects/p-1"
        projectStatus="archived"
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: /已归档项目 的更多操作/ }),
    );
    const item = await screen.findByText("已归档");
    const menuItem = item.closest('[data-slot="project-row-archive"]');
    expect(menuItem).not.toBeNull();
    expect(menuItem!.getAttribute("aria-disabled")).toBe("true");
    await userEvent.click(item).catch(() => {});
    expect(mockClient.archiveProject).not.toHaveBeenCalled();
  });

  it("active 行:保留可点的「归档」动作", async () => {
    const { ProjectRowMenu } = await import("./project-row-menu");
    render(
      <ProjectRowMenu
        projectId="p-2"
        projectTitle="进行中项目"
        openHref="/projects/p-2"
        projectStatus="active"
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: /进行中项目 的更多操作/ }),
    );
    await userEvent.click(await screen.findByText("归档"));
    expect(mockClient.archiveProject).toHaveBeenCalledTimes(1);
  });
});
