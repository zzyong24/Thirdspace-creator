/**
 * [T-376] 对话内 AI 生成素材卡 —— 失败态诚实呈现测锚:
 *   - 任务终败(cancelled)→ 读步骤流末条(kind:"error")拿 runner 分类的真实原因,
 *     原样展示「配置了但调用失败:<原因>」,**不再一律**「很可能是还没配置生图模型」;
 *   - 步骤流没有 error 条(老任务/读取失败)→ 兜底老猜测文案(不编造原因);
 *   - 链接文案随原因切换:非「未配置」类 → 「去设置检查模型配置 →」。
 * 确定性:mock client + fake timers(轮询 4s 间隔);无网络。
 */

import * as React from "react";
import { act, cleanup, render } from "@testing-library/react";
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
