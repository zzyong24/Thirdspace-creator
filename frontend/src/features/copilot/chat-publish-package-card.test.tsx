import * as React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// [T-350b] 对话内发布物料卡:publish.package 工具 dispatch 异步 publish.platform_adapt(单平台抖音)
// 后返回 { taskId }。卡据 taskId 轮询 getTask → awaiting_confirmation 后 listTaskResults 拿
// publication_drafts 候选 → 渲 标题/简介/标签/封面文案/审核结论 → 「采纳」confirmTask
// (→ createPublicationFromDraft 物化 Publication)→ router.refresh 回填发布包。
//   - dispatch 失败态(error 非 null / 无 taskId)→ 卡渲诚实错误,不轮询。
//   - 轮询到 awaiting_confirmation → 渲物料 + 采纳按钮。
//   - 点采纳 → confirmTask + router.refresh。

const routerRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: routerRefresh, push: vi.fn(), replace: vi.fn() }),
}));

const getTask = vi.fn();
const listTaskResults = vi.fn();
const confirmTask = vi.fn();

vi.mock("@/lib/contract-client", () => ({
  client: {
    getTask: (...a: unknown[]) => getTask(...a),
    listTaskResults: (...a: unknown[]) => listTaskResults(...a),
    confirmTask: (...a: unknown[]) => confirmTask(...a),
  },
}));

import { ChatPublishPackageCard } from "./chat-publish-package-card";

// platform-adapt-runner recordCandidate 的 resultData 形状:{ drafts:[{platform,title,body,
// tags,coverIdea,auditFlags}], outputId }。单平台链只有 douyin 一条。
const CANDIDATE = {
  resultData: {
    outputId: "out-1",
    drafts: [
      {
        platform: "douyin",
        title: "90% 的人写文档没人看，问题出在前 3 秒",
        body: "分享一个把完读率翻倍的写法：开头先给理由。关注看下一条。",
        tags: ["写作", "效率", "文档"],
        coverIdea: "前3秒决定完读",
        auditFlags: ["营销词『变现』→『跑通』", "去掉导流『主页有』→站内关注"],
      },
    ],
  },
};

afterEach(() => cleanup());
beforeEach(() => {
  vi.clearAllMocks();
  getTask.mockResolvedValue({ status: "awaiting_confirmation" });
  listTaskResults.mockResolvedValue([CANDIDATE]);
  confirmTask.mockResolvedValue({ id: "task-pkg-1", status: "succeeded" });
});

describe("ChatPublishPackageCard(对话内发布物料卡,T-350b 异步)", () => {
  it("dispatch 失败(error 非 null,如空稿门)→ 诚实错误态,不轮询", () => {
    render(
      <ChatPublishPackageCard
        taskId={null}
        projectId={null}
        error="当前项目还没有可用的整稿(稿面为空或太短)—— 先生成整稿再来生成发布物料。"
        pollIntervalMs={0}
      />,
    );
    expect(
      document.querySelector('[data-slot="chat-publish-error"]')?.textContent,
    ).toContain("整稿");
    expect(getTask).not.toHaveBeenCalled();
  });

  it("轮询 awaiting_confirmation → 渲 标题/简介/标签/封面/审核结论 + 采纳按钮", async () => {
    render(
      <ChatPublishPackageCard
        taskId="task-pkg-1"
        projectId="proj-1"
        error={null}
        pollIntervalMs={0}
      />,
    );
    await waitFor(() => {
      expect(
        document.querySelector('[data-slot="chat-publish-review"]'),
      ).toBeTruthy();
    });
    const review = document.querySelector('[data-slot="chat-publish-review"]')!;
    expect(review.textContent).toContain("前 3 秒"); // 标题
    expect(review.textContent).toContain("完读率翻倍"); // 简介
    expect(review.textContent).toContain("写作"); // 标签
    expect(review.textContent).toContain("前3秒决定完读"); // 封面文案
    // 审核结论(auditFlags)呈现 —— 硬规则命中的改动记录。
    const audit = document.querySelector('[data-slot="chat-publish-audit"]')!;
    expect(audit.textContent).toContain("跑通");
    expect(
      document.querySelector('[data-slot="chat-publish-adopt"]'),
    ).toBeTruthy();
    expect(confirmTask).not.toHaveBeenCalled();
  });

  it("点「采纳发布物料」→ confirmTask + router.refresh(回填发布包)", async () => {
    render(
      <ChatPublishPackageCard
        taskId="task-pkg-1"
        projectId="proj-1"
        error={null}
        pollIntervalMs={0}
      />,
    );
    const adopt = await screen.findByText("采纳发布物料");
    fireEvent.click(adopt);
    await waitFor(() => {
      expect(confirmTask).toHaveBeenCalledWith({
        params: { taskId: "task-pkg-1" },
        query: undefined,
        body: undefined,
      });
    });
    await waitFor(() => expect(routerRefresh).toHaveBeenCalled());
    await waitFor(() => {
      expect(
        document.querySelector('[data-slot="chat-publish-done"]'),
      ).toBeTruthy();
    });
  });

  it("任务 cancelled/failed(如未配模型)→ 诚实错误态 +「去设置」", async () => {
    getTask.mockResolvedValue({ status: "failed" });
    render(
      <ChatPublishPackageCard
        taskId="task-pkg-1"
        projectId="proj-1"
        error={null}
        pollIntervalMs={0}
      />,
    );
    await waitFor(() => {
      expect(
        document.querySelector('[data-slot="chat-publish-error"]'),
      ).toBeTruthy();
    });
    expect(
      document.querySelector('[data-slot="chat-publish-settings-link"]'),
    ).toBeTruthy();
  });

  it("候选无可解析 draft(drafts 空)→ 诚实错误态", async () => {
    listTaskResults.mockResolvedValue([{ resultData: { outputId: "out-1", drafts: [] } }]);
    render(
      <ChatPublishPackageCard
        taskId="task-pkg-1"
        projectId="proj-1"
        error={null}
        pollIntervalMs={0}
      />,
    );
    await waitFor(() => {
      expect(
        document.querySelector('[data-slot="chat-publish-error"]'),
      ).toBeTruthy();
    });
  });
});
