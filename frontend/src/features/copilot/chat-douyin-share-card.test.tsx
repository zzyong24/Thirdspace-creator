import * as React from "react";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const listExecutionTasks = vi.fn();
vi.mock("@/lib/contract-client", () => ({
  client: {
    listExecutionTasks: (input: unknown) => listExecutionTasks(input),
  },
}));

import { ChatDouyinShareCard } from "./chat-douyin-share-card";

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("ChatDouyinShareCard — T-523 持久父子状态真值", () => {
  it("普通分享只显示父建档终态，并明确不会自动跑 ASR", async () => {
    listExecutionTasks.mockResolvedValue([
      {
        id: "share-1",
        kind: "share_import",
        ownerId: "owner-1",
        status: "succeeded",
        checkpoint: {
          result: {
            item: { id: "item-1" },
            transcriptStatus: "not_requested",
            transcriptTaskIds: [],
          },
        },
        errorCode: null,
        errorMessage: null,
      },
    ]);
    const { container } = render(
      <ChatDouyinShareCard
        taskId="share-1"
        ownerId="owner-1"
        action="archive"
        error={null}
        pollIntervalMs={5}
      />,
    );
    await waitFor(() => {
      expect(
        container.querySelector('[data-slot="chat-douyin-parent-status"]')
          ?.textContent,
      ).toContain("已完成");
    });
    expect(
      container.querySelector('[data-slot="chat-douyin-no-transcript"]')
        ?.textContent,
    ).toContain("不会自动跑 ASR");
    expect(listExecutionTasks).toHaveBeenCalledTimes(1);
    expect(listExecutionTasks).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.objectContaining({
          kind: "share_import",
          ownerId: "owner-1",
        }),
      }),
    );
  });

  it("明确转写时读取 share_import 父任务和 transcribe 子任务真实终态", async () => {
    listExecutionTasks.mockImplementation(
      async (input: { query?: { kind?: string } }) => {
        if (input.query?.kind === "share_import") {
          return [
            {
              id: "share-2",
              kind: "share_import",
              ownerId: "owner-2",
              status: "succeeded",
              checkpoint: {
                result: {
                  item: { id: "item-2" },
                  transcriptStatus: "done",
                  transcriptTaskIds: ["transcribe-2"],
                },
              },
              errorCode: null,
              errorMessage: null,
            },
          ];
        }
        return [
          {
            id: "transcribe-2",
            kind: "transcribe",
            ownerId: "item-2",
            status: "succeeded",
            checkpoint: null,
            errorCode: null,
            errorMessage: null,
          },
        ];
      },
    );
    const { container } = render(
      <ChatDouyinShareCard
        taskId="share-2"
        ownerId="owner-2"
        action="archive_and_transcribe"
        error={null}
        pollIntervalMs={5}
      />,
    );
    await waitFor(() => {
      expect(
        container.querySelector('[data-slot="chat-douyin-child-status"]')
          ?.textContent,
      ).toContain("已完成");
    });
    expect(container.firstElementChild?.getAttribute("data-parent-status")).toBe(
      "succeeded",
    );
    expect(container.firstElementChild?.getAttribute("data-child-status")).toBe(
      "succeeded",
    );
    expect(listExecutionTasks).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.objectContaining({
          kind: "transcribe",
          ownerId: "item-2",
        }),
      }),
    );
  });

  it("子任务因模型未配置 blocked 时给出真实原因和可执行设置入口", async () => {
    listExecutionTasks.mockImplementation(
      async (input: { query?: { kind?: string } }) => {
        if (input.query?.kind === "share_import") {
          return [
            {
              id: "share-3",
              kind: "share_import",
              ownerId: "owner-3",
              status: "succeeded",
              checkpoint: {
                result: {
                  item: { id: "item-3" },
                  transcriptStatus: "blocked",
                  transcriptTaskIds: ["transcribe-3"],
                },
              },
              errorCode: null,
              errorMessage: null,
            },
          ];
        }
        return [
          {
            id: "transcribe-3",
            kind: "transcribe",
            ownerId: "item-3",
            status: "blocked",
            checkpoint: null,
            errorCode: "MODEL_NOT_CONFIGURED",
            errorMessage: "TranscribeConfigError",
          },
        ];
      },
    );
    const { container } = render(
      <ChatDouyinShareCard
        taskId="share-3"
        ownerId="owner-3"
        action="archive_and_transcribe"
        error={null}
        pollIntervalMs={5}
      />,
    );
    await waitFor(() => {
      expect(
        container.querySelector('[data-slot="chat-douyin-recovery"]')
          ?.textContent,
      ).toContain("还没有可用的转写模型");
    });
    const link = container.querySelector(
      '[data-slot="chat-douyin-recovery"] a',
    );
    expect(link?.getAttribute("href")).toBe("/settings?tab=models");
    expect(
      container.querySelector('[data-slot="chat-douyin-child-status"]')
        ?.textContent,
    ).toContain("需要处理");
  });

  it("没有可转写音频时把真实 skipped 状态视为已完成，不继续假等待", async () => {
    listExecutionTasks.mockImplementation(
      async (input: { query?: { kind?: string } }) =>
        input.query?.kind === "share_import"
          ? [
              {
                id: "share-4",
                kind: "share_import",
                ownerId: "owner-4",
                status: "succeeded",
                checkpoint: {
                  result: {
                    item: { id: "item-4" },
                    transcriptStatus: "skipped",
                    transcriptTaskIds: [],
                  },
                },
                errorCode: null,
                errorMessage: null,
              },
            ]
          : [],
    );
    const { container } = render(
      <ChatDouyinShareCard
        taskId="share-4"
        ownerId="owner-4"
        action="archive_and_transcribe"
        error={null}
        pollIntervalMs={5}
      />,
    );
    await waitFor(() => {
      expect(
        container.querySelector('[data-slot="chat-douyin-child-status"]')
          ?.textContent,
      ).toContain("已跳过");
      expect(container.firstElementChild?.textContent).toContain("已完成");
    });
    expect(listExecutionTasks).toHaveBeenCalledTimes(2);
  });
});
