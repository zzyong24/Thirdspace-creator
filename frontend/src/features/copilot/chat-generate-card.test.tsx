/**
 * [T-376] 对话内 AI 生成素材卡 —— 失败态诚实呈现测锚:
 *   - 任务终败(cancelled)→ 读步骤流末条(kind:"error")拿 runner 分类的真实原因,
 *     原样展示「配置了但调用失败:<原因>」,**不再一律**「很可能是还没配置生图模型」;
 *   - 步骤流没有 error 条(老任务/读取失败)→ 兜底老猜测文案(不编造原因);
 *   - 链接文案随原因切换:非「未配置」类 → 「去设置检查模型配置 →」。
 * 确定性:mock client + fake timers(轮询 4s 间隔);无网络。
 */

import * as React from "react";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/components/resources/asset-preview-url", () => ({
  resolveAssetPreviewUrl: vi.fn(async () => null),
}));

const mockClient = {
  getTask: vi.fn(
    (_i: unknown): Promise<unknown> => Promise.resolve({ status: "cancelled" }),
  ),
  listTaskResults: vi.fn((_i: unknown): Promise<unknown> => Promise.resolve([])),
  listTaskSteps: vi.fn(
    (_i: unknown): Promise<unknown> =>
      Promise.resolve([
        {
          kind: "error",
          text: "生图模型已配置,但调用失败:minimax API 401: invalid api key",
        },
      ]),
  ),
  confirmTask: vi.fn((_i: unknown): Promise<unknown> => Promise.resolve({})),
};
vi.mock("@/lib/contract-client", () => ({
  client: {
    getTask: (i: unknown) => mockClient.getTask(i),
    listTaskResults: (i: unknown) => mockClient.listTaskResults(i),
    listTaskSteps: (i: unknown) => mockClient.listTaskSteps(i),
    confirmTask: (i: unknown) => mockClient.confirmTask(i),
  },
}));

import { ChatGenerateCard } from "./chat-generate-card";

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe("ChatGenerateCard — T-376 失败态诚实呈现", () => {
  it("重新进入项目时任务已经采纳成功，立即恢复完成态，不继续显示正在生成", async () => {
    mockClient.getTask.mockResolvedValueOnce({ status: "succeeded" });
    const { container } = render(
      <ChatGenerateCard taskId="t-succeeded" kindOf="image" error={null} />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(
      container
        .querySelector('[data-slot="chat-generate-card"]')
        ?.getAttribute("data-phase"),
    ).toBe("done");
    expect(container.querySelector('[data-slot="chat-generate-running"]')).toBeNull();
  });

  it("任务 cancelled + 步骤流有 error 条 → 展示真实原因(已配置,但调用失败),链接改「检查配置」", async () => {
    const { container } = render(
      <ChatGenerateCard taskId="t-1" kindOf="image" error={null} />,
    );
    // 轮询 4s 间隔 → 推进一轮拿到 cancelled + 步骤流。
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4100);
    });
    const errSlot = container.querySelector('[data-slot="chat-generate-error"]');
    expect(errSlot).not.toBeNull();
    const text = errSlot!.textContent ?? "";
    expect(text).toContain("已配置,但调用失败");
    expect(text).toContain("invalid api key");
    // 不再冤枉「还没配置」。
    expect(text).not.toContain("很可能是还没配置");
    const link = container.querySelector(
      '[data-slot="chat-generate-settings-link"]',
    );
    expect(link?.textContent ?? "").toContain("去设置检查模型配置");
    expect(mockClient.listTaskSteps).toHaveBeenCalledWith(
      expect.objectContaining({ params: { taskId: "t-1" } }),
    );
  });

  it("步骤流无 error 条(老任务)→ 兜底老猜测文案 + 「去设置配生图模型」链接", async () => {
    mockClient.listTaskSteps.mockResolvedValueOnce([]);
    const { container } = render(
      <ChatGenerateCard taskId="t-2" kindOf="image" error={null} />,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4100);
    });
    const errSlot = container.querySelector('[data-slot="chat-generate-error"]');
    expect(errSlot).not.toBeNull();
    expect(errSlot!.textContent ?? "").toContain("很可能是还没配置生图模型");
    const link = container.querySelector(
      '[data-slot="chat-generate-settings-link"]',
    );
    expect(link?.textContent ?? "").toContain("去设置配生图模型");
  });

  it("未配置类原因(含「未配置」关键词)→ 原样展示 + 保留「去设置配生图模型」链接", async () => {
    mockClient.listTaskSteps.mockResolvedValueOnce([
      {
        kind: "error",
        text: 'capability "image.generate" 未配置生图模型:请在设置里配 provider/model/key',
      },
    ]);
    const { container } = render(
      <ChatGenerateCard taskId="t-3" kindOf="image" error={null} />,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4100);
    });
    const text =
      container.querySelector('[data-slot="chat-generate-error"]')?.textContent ??
      "";
    expect(text).toContain("未配置生图模型");
    const link = container.querySelector(
      '[data-slot="chat-generate-settings-link"]',
    );
    expect(link?.textContent ?? "").toContain("去设置配生图模型");
  });
});

describe("ChatGenerateCard — T-523 参考图使用真相", () => {
  it("封面候选只声明参考图已送适配器，不冒充模型采纳", async () => {
    mockClient.getTask.mockResolvedValueOnce({
      status: "awaiting_confirmation",
    });
    mockClient.listTaskResults.mockResolvedValueOnce([
      {
        resultData: {
          assetId: "asset-cover",
          assetType: "image",
          name: "封面",
          coverPlan: {
            headline: "主标题",
            subheadline: "",
            keyPoints: [],
            visualConcept: "",
            composition: "",
            palette: "",
          },
          referenceImage: {
            requestedAssetId: "asset-reference",
            status: "used",
            used: true,
          },
        },
      },
    ]);
    const { container } = render(
      <ChatGenerateCard taskId="t-reference" kindOf="image" error={null} />,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4100);
    });
    const text =
      container.querySelector('[data-slot="chat-cover-reference"]')
        ?.textContent ?? "";
    expect(text).toContain("已送给生图适配器");
    expect(text).toContain("不代表模型一定采纳");
    expect(text).toContain("asset-reference");
  });

  it("参考图读取失败时明确展示未送给适配器", async () => {
    mockClient.getTask.mockResolvedValueOnce({
      status: "awaiting_confirmation",
    });
    mockClient.listTaskResults.mockResolvedValueOnce([
      {
        resultData: {
          assetId: "asset-cover-fallback",
          assetType: "image",
          name: "降级封面",
          coverPlan: {
            headline: "主标题",
            subheadline: "",
            keyPoints: [],
            visualConcept: "",
            composition: "",
            palette: "",
          },
          referenceImage: {
            requestedAssetId: "asset-missing",
            status: "not_used",
            used: false,
          },
        },
      },
    ]);
    const { container } = render(
      <ChatGenerateCard
        taskId="t-reference-missing"
        kindOf="image"
        error={null}
      />,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4100);
    });
    expect(
      container.querySelector('[data-slot="chat-cover-reference"]')
        ?.textContent ?? "",
    ).toContain("未送给生图适配器");
  });
});

describe("ChatGenerateCard — T-687 可引用别名与项目刷新", () => {
  it("为生成图展示稳定别名，采纳后通知当前项目刷新素材并废弃旧决策", async () => {
    mockClient.getTask.mockResolvedValueOnce({ status: "awaiting_confirmation" });
    mockClient.listTaskResults.mockResolvedValueOnce([
      {
        resultData: {
          assetId: "asset-image-2",
          assetType: "image",
          name: "时薪对比图",
        },
      },
    ]);
    const changed = vi.fn();
    const aliasReady = vi.fn();
    window.addEventListener("creatoros:project-materials-changed", changed);
    window.addEventListener("creatoros:asset-alias-ready", aliasReady);
    const { container } = render(
      <ChatGenerateCard
        taskId="t-image-2"
        kindOf="image"
        error={null}
        aliasLabel="图2"
        aliasBatchKey="assistant-message-7"
        aliasBatchRank={7}
        projectId="project-1"
      />,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4100);
    });
    expect(container.textContent ?? "").toContain("图2");
    expect(aliasReady).toHaveBeenCalledOnce();
    expect((aliasReady.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({
      alias: "图2",
      assetId: "asset-image-2",
      batchKey: "assistant-message-7",
      batchRank: 7,
    });
    await act(async () => {
      fireEvent.click(
        container.querySelector('[data-slot="chat-generate-adopt"]')!,
      );
      await Promise.resolve();
    });
    expect(changed).toHaveBeenCalledOnce();
    const detail = (changed.mock.calls[0]?.[0] as CustomEvent).detail;
    expect(detail).toEqual({
      projectId: "project-1",
      assetId: "asset-image-2",
      role: "broll",
    });
    window.removeEventListener("creatoros:project-materials-changed", changed);
    window.removeEventListener("creatoros:asset-alias-ready", aliasReady);
  });
});
