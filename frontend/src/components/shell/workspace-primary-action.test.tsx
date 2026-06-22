/**
 * Contract tests for the workspace header's primary action island (Plan A6).
 *
 * The workspace "进入下一步:<next>" action must PERSIST the stage transition
 * (same contract op the overview page uses) and only then navigate + refresh,
 * so progress and position never desync:
 *   island -> client.transitionProjectStage -> router.push(next) -> router.refresh()
 * Terminal / non-advancing actions stay plain buttons (no transition, no nav).
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
};

vi.mock("@/lib/contract-client", () => ({
  client: {
    transitionProjectStage: (input: unknown) =>
      mockClient.transitionProjectStage(input),
  },
}));

async function importIsland() {
  return await import("./workspace-primary-action");
}

beforeEach(() => {
  mockRouter.refresh.mockClear();
  mockRouter.push.mockClear();
  mockClient.transitionProjectStage.mockClear();
});

afterEach(() => {
  cleanup();
});

describe("WorkspacePrimaryAction", () => {
  it("persists the transition then navigates + refreshes when advancing", async () => {
    const { WorkspacePrimaryAction } = await importIsland();
    render(
      <WorkspacePrimaryAction
        label="进入下一步:策划构思"
        routeProjectId="project-ainativebrowser"
        currentStage="research"
        advances
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /进入下一步/ }));
    await waitFor(() => {
      expect(mockClient.transitionProjectStage).toHaveBeenCalledTimes(1);
    });
    expect(mockClient.transitionProjectStage.mock.calls[0]![0]).toMatchObject({
      params: { projectId: "project-ainativebrowser", stage: "planning" },
    });
    await waitFor(() => {
      expect(mockRouter.push).toHaveBeenCalledWith(
        "/projects/project-ainativebrowser/planning",
      );
      expect(mockRouter.refresh).toHaveBeenCalledTimes(1);
    });
  });

  it("does NOT transition for a terminal / non-advancing action", async () => {
    const { WorkspacePrimaryAction } = await importIsland();
    render(
      <WorkspacePrimaryAction
        label="导出报告"
        routeProjectId="project-ainativebrowser"
        currentStage="review"
        advances={false}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /导出报告/ }));
    expect(mockClient.transitionProjectStage).not.toHaveBeenCalled();
    expect(mockRouter.push).not.toHaveBeenCalled();
  });
});
