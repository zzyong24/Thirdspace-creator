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

describe("BriefWorkbench 平台退回发布层(SKL-08)", () => {
  // 核心四项(目标受众/内容目标/内容形式/核心信息)齐 + 项目名 → ready,即使没选任何平台。
  const FULL_NO_PLATFORM = {
    targetAudience: "想转型做内容的职场人",
    contentGoal: "建立专业信任",
    contentFormat: "口播",
    coreMessage: "一句话讲清楚定位",
    targetPlatforms: [],
  } as const;

  it("核心四项齐、无目标平台 → 「进入选题调研」可点(平台非必填)", () => {
    render(
      <BriefWorkbench
        projectId="p1"
        projectTitle="完整立项"
        briefDetail={FULL_NO_PLATFORM}
      />,
    );
    // 平台未选,但 advance 按钮不被禁用(平台已降级为可选)。
    expect(
      screen.getByTestId("brief-advance").hasAttribute("disabled"),
    ).toBe(false);
  });

  it("缺核心项(如内容形式)仍拦,且缺失提示不含「目标平台」", () => {
    render(
      <BriefWorkbench
        projectId="p1"
        projectTitle="缺一项"
        briefDetail={{ ...FULL_NO_PLATFORM, contentFormat: "" }}
      />,
    );
    expect(
      screen.getByTestId("brief-advance").hasAttribute("disabled"),
    ).toBe(true);
    // 缺失文案点名「内容形式」,绝不点名「目标平台」(后者已非必填)。
    expect(screen.getByText(/还需补全/).textContent).toContain("内容形式");
    expect(screen.getByText(/还需补全/).textContent).not.toContain("目标平台");
  });
});
