/**
 * Brief 工作台「画幅 横屏/竖屏」(SKL-01/02)契约测试。
 *
 * 画幅是产品唯一的"类型"区分。这里锁住两条不可回退的行为:
 *  - 选竖屏后保存 → `client.patchProject` 的 body.briefDetail.orientation === "portrait"
 *    (人选的画幅真落库,不是装饰);
 *  - 初值带 orientation 时对应按钮渲染为选中(aria-pressed),读真值回显。
 */

import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockRouter = {
  refresh: vi.fn(),
  replace: vi.fn(),
  push: vi.fn(),
  back: vi.fn(),
};
vi.mock("next/navigation", () => ({ useRouter: () => mockRouter }));

const patchProject = vi.fn(
  (input: unknown): Promise<unknown> => Promise.resolve({ id: "p", input }),
);
vi.mock("@/lib/contract-client", () => ({
  client: { patchProject: (input: unknown) => patchProject(input) },
}));

import { BriefWorkbench } from "./brief-workbench";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("BriefWorkbench 画幅 orientation", () => {
  it("选竖屏后保存,patchProject body 带 briefDetail.orientation='portrait'", async () => {
    const user = userEvent.setup();
    render(
      <BriefWorkbench
        projectId="p1"
        projectTitle="演示项目"
        briefDetail={{ targetPlatforms: [] }}
      />,
    );
    await user.click(screen.getByTestId("brief-orientation-portrait"));
    await user.click(screen.getByTestId("brief-save"));
    await waitFor(() => expect(patchProject).toHaveBeenCalled());
    const arg = patchProject.mock.calls[0]![0] as {
      body: { briefDetail: { orientation?: string } };
    };
    expect(arg.body.briefDetail.orientation).toBe("portrait");
  });

  it("初值 portrait 渲染为选中,landscape 未选", () => {
    render(
      <BriefWorkbench
        projectId="p1"
        projectTitle="演示项目"
        briefDetail={{ targetPlatforms: [], orientation: "portrait" }}
      />,
    );
    expect(
      screen.getByTestId("brief-orientation-portrait").getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen
        .getByTestId("brief-orientation-landscape")
        .getAttribute("aria-pressed"),
    ).toBe("false");
  });

  it("再点一次已选画幅 = 取消(回到未选)", async () => {
    const user = userEvent.setup();
    render(
      <BriefWorkbench
        projectId="p1"
        projectTitle="演示项目"
        briefDetail={{ targetPlatforms: [], orientation: "landscape" }}
      />,
    );
    const landscape = screen.getByTestId("brief-orientation-landscape");
    expect(landscape.getAttribute("aria-pressed")).toBe("true");
    await user.click(landscape);
    expect(landscape.getAttribute("aria-pressed")).toBe("false");
  });
});
