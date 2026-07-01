/**
 * `AssetGenerateIsland` 组件测(L5 录制页区③:AI 生成)。锁:
 *  - video-asset-kit 决策提示渲染(隐喻点缀 ≤1-2 / 动态→视频、静态→图 引导)。
 *  - 未配禁用:该 kind 未配模型 → 禁用生成按钮 + 「去设置配…模型」引导链接(诚实,不 dispatch)。
 *  - `[gate-F3]` aspectRatio 默认跟随项目横竖屏:竖屏 output → 默认 9:16;横屏 output → 默认 16:9。
 *  - dispatch 入参:已配 + 有 prompt → 点生成 → createAITask 的 inputData 带
 *    {projectId, prompt, kind, aspectRatio}(aspectRatio 跟随项目)。
 *  - `[gate-F3]` provider 只横屏提示:kind=video + 选竖屏 → 显式「需自行裁 9:16」提示,不静默产横屏。
 *
 * Determinism:contract client + next router 全 mock;AdoptCandidateCard 的 poll 用 fake timers。
 */

import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";

const mockRouter = { refresh: vi.fn(), replace: vi.fn(), push: vi.fn(), back: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => mockRouter }));

// AdoptCandidateCard 走的 client op(dispatch→poll→confirm)。默认 awaiting 一个候选。
const mockClient = {
  createAITask: vi.fn((_i: unknown) =>
    Promise.resolve({ id: "task-1", status: "queued" }),
  ),
  getTask: vi.fn((_i: unknown) =>
    Promise.resolve({ status: "awaiting_confirmation" }),
  ),
  listTaskResults: vi.fn((_i: unknown) =>
    Promise.resolve([
      {
        resultData: {
          assetId: "asset-1",
          assetType: "image",
          name: "隐喻图",
          prompt: "flat metaphor",
          aspectRatio: "9:16",
        },
      },
    ]),
  ),
  listTaskSteps: vi.fn((_i: unknown) => Promise.resolve([] as unknown[])),
  confirmTask: vi.fn((_i: unknown) =>
    Promise.resolve({ id: "task-1", status: "succeeded" }),
  ),
  patchTaskResultItems: vi.fn((_i: unknown) => Promise.resolve({})),
  listAITasks: vi.fn((_i: unknown) => Promise.resolve([] as unknown[])),
};
vi.mock("@/lib/contract-client", () => ({
  client: {
    createAITask: (i: unknown) => mockClient.createAITask(i),
    getTask: (i: unknown) => mockClient.getTask(i),
    listTaskResults: (i: unknown) => mockClient.listTaskResults(i),
    listTaskSteps: (i: unknown) => mockClient.listTaskSteps(i),
    confirmTask: (i: unknown) => mockClient.confirmTask(i),
    patchTaskResultItems: (i: unknown) => mockClient.patchTaskResultItems(i),
    listAITasks: (i: unknown) => mockClient.listAITasks(i),
  },
}));

afterEach(() => cleanup());
beforeEach(() => {
  vi.useFakeTimers();
  Object.values(mockClient).forEach((m) => m.mockClear());
  mockRouter.refresh.mockClear();
});

async function renderIsland(
  props?: Partial<{
    outputAspectRatio: string;
    initialPrompt: string;
    imageConfigured: boolean;
    videoConfigured: boolean;
  }>,
) {
  const { AssetGenerateIsland } = await import("./asset-generate-island");
  return render(
    <AssetGenerateIsland
      projectId="proj-1"
      outputAspectRatio={props?.outputAspectRatio}
      initialPrompt={props?.initialPrompt}
      imageConfigured={props?.imageConfigured ?? true}
      videoConfigured={props?.videoConfigured ?? true}
    />,
  );
}

describe("AssetGenerateIsland", () => {
  it("renders the video-asset-kit 决策提示(隐喻点缀 + 动态/静态引导)", async () => {
    const { container } = await renderIsland();
    const guidance = container.querySelector(
      '[data-slot="asset-generate-guidance"]',
    );
    expect(guidance).not.toBeNull();
    // 决策提示含「隐喻点缀 ≤1-2」+「动态→文生视频 / 静态→文生图」引导(scoped to guidance)。
    expect(guidance!.textContent).toMatch(/隐喻点缀/);
    expect(guidance!.textContent).toMatch(/文生视频/);
    expect(guidance!.textContent).toMatch(/文生图/);
  });

  it("未配文生图 → 禁用生成 + 去设置引导链接(不 dispatch)", async () => {
    const { container, getByText } = await renderIsland({
      imageConfigured: false,
      videoConfigured: false,
      initialPrompt: "flat metaphor",
    });
    // kind 默认 image;未配 → 未配面板 + 禁用按钮 + 设置链接。
    expect(
      container.querySelector('[data-slot="asset-generate-unconfigured"]'),
    ).not.toBeNull();
    const link = container.querySelector(
      '[data-slot="asset-generate-settings-link"]',
    ) as HTMLAnchorElement;
    expect(link).not.toBeNull();
    expect(link.getAttribute("href")).toBe("/settings");
    expect(getByText(/去设置配文生图模型/)).not.toBeNull();
    // 禁用按钮存在,真 AdoptCandidateCard 的 start 不渲染。
    expect(
      container.querySelector('[data-slot="asset-generate-start-disabled"]'),
    ).not.toBeNull();
    expect(container.querySelector('[data-slot="adopt-start"]')).toBeNull();
  });

  it("[gate-F3] 竖屏 output → 默认 9:16;横屏 output → 默认 16:9", async () => {
    const portrait = await renderIsland({ outputAspectRatio: "9:16" });
    expect(
      (
        portrait.container.querySelector(
          '[data-slot="asset-generate-aspect"]',
        ) as HTMLSelectElement
      ).value,
    ).toBe("9:16");
    cleanup();
    const landscape = await renderIsland({ outputAspectRatio: "16:9" });
    expect(
      (
        landscape.container.querySelector(
          '[data-slot="asset-generate-aspect"]',
        ) as HTMLSelectElement
      ).value,
    ).toBe("16:9");
  });

  it("[gate-F3] 无 output aspectRatio → 竖屏优先(默认 9:16)", async () => {
    const { container } = await renderIsland({ outputAspectRatio: undefined });
    expect(
      (
        container.querySelector(
          '[data-slot="asset-generate-aspect"]',
        ) as HTMLSelectElement
      ).value,
    ).toBe("9:16");
  });

  it("已配 + 有 prompt → 生成 → createAITask.inputData 带 {projectId,prompt,kind,aspectRatio}", async () => {
    const { container } = await renderIsland({
      outputAspectRatio: "9:16",
      initialPrompt: "flat single-color metaphor, no text",
    });
    // 门槛已过 → 真 AdoptCandidateCard 的 start 可点。
    const start = container.querySelector('[data-slot="adopt-start"]')!;
    await act(async () => {
      fireEvent.click(start);
      await vi.advanceTimersByTimeAsync(4000);
    });
    expect(mockClient.createAITask).toHaveBeenCalledWith(
      expect.objectContaining({
        body: {
          taskType: "asset.generate",
          inputData: {
            projectId: "proj-1",
            prompt: "flat single-color metaphor, no text",
            kind: "image",
            aspectRatio: "9:16",
          },
        },
      }),
    );
  });

  it("[gate-F3] kind=video + 竖屏 → 显式「需自行裁 9:16」提示(不静默产横屏)", async () => {
    const { container } = await renderIsland({ outputAspectRatio: "9:16" });
    // 切到文生视频。
    const videoOption = container.querySelector(
      '[data-slot="asset-generate-kind-option"][data-kind="video"]',
    )!;
    await act(async () => {
      fireEvent.click(videoOption);
    });
    // 当前 aspectRatio=9:16 且 kind=video → crop 提示出现。
    expect(
      container.querySelector('[data-slot="asset-generate-crop-hint"]'),
    ).not.toBeNull();
  });

  it("kind=video + 选 16:9 → 无 crop 提示(横屏本就匹配)", async () => {
    const { container } = await renderIsland({ outputAspectRatio: "16:9" });
    const videoOption = container.querySelector(
      '[data-slot="asset-generate-kind-option"][data-kind="video"]',
    )!;
    await act(async () => {
      fireEvent.click(videoOption);
    });
    expect(
      container.querySelector('[data-slot="asset-generate-crop-hint"]'),
    ).toBeNull();
  });
});
