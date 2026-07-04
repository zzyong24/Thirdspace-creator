/**
 * Contract tests for the Project Overview action island (Task 8).
 *
 * The island wires the project header's mutating affordances to the mock
 * backend through the typed `client`, then asks the router to revalidate:
 *  - 进入下一步 calls `client.transitionProjectStage` with the CURRENT stage (SKL-11: advance current
 *    stage, then `router.refresh()`,
 *  - 收藏 toggles `client.patchProject({ starred })`, then `router.refresh()`,
 *  - 归档 calls `client.archiveProject`, then `router.refresh()`.
 *
 * Mutations flow island -> client.* -> store mutation -> router.refresh(),
 * per the island-mode / URL-state-only architecture.
 */

import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockRouter = {
  refresh: vi.fn(),
  replace: vi.fn(),
  push: vi.fn(),
  back: vi.fn(),
};

vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

const mockClient = {
  transitionProjectStage: vi.fn(
    (input: unknown): Promise<unknown> =>
      Promise.resolve({ id: "p", currentStage: "planning", input }),
  ),
  patchProject: vi.fn(
    (input: unknown): Promise<unknown> =>
      Promise.resolve({ id: "p", starred: true, input }),
  ),
  archiveProject: vi.fn(
    (input: unknown): Promise<unknown> =>
      Promise.resolve({ id: "p", status: "archived", input }),
  ),
  // [T-102] 物理删除:返回删除前快照。
  deleteProject: vi.fn(
    (input: unknown): Promise<unknown> =>
      Promise.resolve({ id: "p", status: "active", input }),
  ),
};

vi.mock("@/lib/contract-client", () => ({
  client: {
    transitionProjectStage: (input: unknown) =>
      mockClient.transitionProjectStage(input),
    patchProject: (input: unknown) => mockClient.patchProject(input),
    archiveProject: (input: unknown) => mockClient.archiveProject(input),
    deleteProject: (input: unknown) => mockClient.deleteProject(input),
  },
}));

async function importIsland() {
  return await import("./project-actions");
}

beforeEach(() => {
  mockRouter.refresh.mockClear();
  mockRouter.push.mockClear();
  mockClient.transitionProjectStage.mockClear();
  mockClient.patchProject.mockClear();
  mockClient.archiveProject.mockClear();
  mockClient.deleteProject.mockClear();
});

afterEach(() => {
  cleanup();
});

describe("ProjectOverviewActions", () => {
  it("transitions to the next adjacent stage then refreshes", async () => {
    const { ProjectOverviewActions } = await importIsland();
    render(
      <ProjectOverviewActions
        projectId="project-ainativebrowser"
        currentStage="research"
        starred={false}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /进入下一步/ }));
    await waitFor(() => {
      expect(mockClient.transitionProjectStage).toHaveBeenCalledTimes(1);
    });
    // SKL-11:推进的是**当前**阶段(research,in_progress→completed 触发 gate),
    // 而非直接点亮下一阶段(planning)绕过 gate。
    expect(mockClient.transitionProjectStage.mock.calls[0]![0]).toMatchObject({
      params: { projectId: "project-ainativebrowser", stage: "research" },
    });
    await waitFor(() => {
      expect(mockRouter.refresh).toHaveBeenCalledTimes(1);
    });
  });

  it("does not render a next-step action at the terminal stage", async () => {
    const { ProjectOverviewActions } = await importIsland();
    render(
      <ProjectOverviewActions
        projectId="project-ainativebrowser"
        currentStage="review"
        starred={false}
      />,
    );
    expect(screen.queryByRole("button", { name: /进入下一步/ })).toBeNull();
  });

  it("toggles the starred flag then refreshes", async () => {
    const { ProjectOverviewActions } = await importIsland();
    render(
      <ProjectOverviewActions
        projectId="project-ainativebrowser"
        currentStage="research"
        starred={false}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /收藏/ }));
    await waitFor(() => {
      expect(mockClient.patchProject).toHaveBeenCalledTimes(1);
    });
    expect(mockClient.patchProject.mock.calls[0]![0]).toMatchObject({
      params: { projectId: "project-ainativebrowser" },
      body: { starred: true },
    });
    await waitFor(() => {
      expect(mockRouter.refresh).toHaveBeenCalledTimes(1);
    });
  });

  it("archives the project then refreshes", async () => {
    const { ProjectOverviewActions } = await importIsland();
    render(
      <ProjectOverviewActions
        projectId="project-ainativebrowser"
        currentStage="research"
        starred={false}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /归档/ }));
    await waitFor(() => {
      expect(mockClient.archiveProject).toHaveBeenCalledTimes(1);
    });
    expect(mockClient.archiveProject.mock.calls[0]![0]).toMatchObject({
      params: { projectId: "project-ainativebrowser" },
    });
    await waitFor(() => {
      expect(mockRouter.refresh).toHaveBeenCalledTimes(1);
    });
  });

  // [T-085] 已归档项目:归档按钮换禁用态「已归档」,点不动 → 不再产生必 409 的重复归档。
  it("renders a disabled 已归档 state instead of the archive action when archived", async () => {
    const { ProjectOverviewActions } = await importIsland();
    render(
      <ProjectOverviewActions
        projectId="project-ainativebrowser"
        currentStage="review"
        starred={false}
        projectStatus="archived"
      />,
    );
    const archivedBtn = screen.getByRole("button", { name: "已归档" });
    expect((archivedBtn as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "归档" })).toBeNull();
    expect(mockClient.archiveProject).not.toHaveBeenCalled();
  });

  // [T-085] 归档 409(已归档竞态)不再静默 —— 转人话内联错误条(role=alert),禁浏览器 alert。
  it("surfaces an inline human-readable error when archive returns 409", async () => {
    mockClient.archiveProject.mockRejectedValueOnce(
      new Error(
        "HttpTransport: 409 for projects.archive: Project already archived",
      ),
    );
    const { ProjectOverviewActions } = await importIsland();
    render(
      <ProjectOverviewActions
        projectId="project-ainativebrowser"
        currentStage="research"
        starred={false}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /归档/ }));
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("已归档");
    });
    // 失败后仍 refresh(拿到最新 status,按钮下一帧变禁用态)。
    await waitFor(() => {
      expect(mockRouter.refresh).toHaveBeenCalledTimes(1);
    });
  });

  // [T-102] 删除确认流:点删除只弹系统级确认框、不直接删;确认才调 deleteProject + 跳列表。
  it("点删除只弹确认框、不调 deleteProject;确认后才删并跳回项目列表", async () => {
    const { ProjectOverviewActions } = await importIsland();
    render(
      <ProjectOverviewActions
        projectId="project-ainativebrowser"
        currentStage="research"
        starred={false}
        projectTitle="AI 原生浏览器"
      />,
    );
    // 点触发按钮 → 只打开确认框,尚未删。
    await userEvent.click(screen.getByRole("button", { name: "删除项目" }));
    await waitFor(() => {
      expect(screen.getByText(/删除项目「AI 原生浏览器」/)).toBeTruthy();
    });
    expect(mockClient.deleteProject).not.toHaveBeenCalled();
    // 警告文案含不可恢复 + 会清除的关联物。
    expect(screen.getByText(/不可恢复/)).toBeTruthy();

    // 点「永久删除」→ 调 deleteProject + push('/projects') + refresh。
    await userEvent.click(screen.getByRole("button", { name: "永久删除" }));
    await waitFor(() => {
      expect(mockClient.deleteProject).toHaveBeenCalledTimes(1);
    });
    expect(mockClient.deleteProject.mock.calls[0]![0]).toMatchObject({
      params: { projectId: "project-ainativebrowser" },
    });
    await waitFor(() => {
      expect(mockRouter.push).toHaveBeenCalledWith("/projects");
    });
  });

  it("删除确认框点取消 → 不调 deleteProject", async () => {
    const { ProjectOverviewActions } = await importIsland();
    render(
      <ProjectOverviewActions
        projectId="project-ainativebrowser"
        currentStage="research"
        starred={false}
        projectTitle="AI 原生浏览器"
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "删除项目" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "取消" })).toBeTruthy();
    });
    await userEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(mockClient.deleteProject).not.toHaveBeenCalled();
  });

  // [T-102] imported 项目:确认框额外强调「含真实作品数据」。
  it("imported 项目删除确认框额外警告含真实作品数据", async () => {
    const { ProjectOverviewActions } = await importIsland();
    render(
      <ProjectOverviewActions
        projectId="project-imported-1"
        currentStage="review"
        starred={false}
        projectTitle="历史作品"
        projectSource="imported"
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "删除项目" }));
    await waitFor(() => {
      expect(screen.getByText(/含真实作品数据/)).toBeTruthy();
    });
  });
});
