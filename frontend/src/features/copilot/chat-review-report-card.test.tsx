import * as React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// [T-103b] 对话内审核报告卡:review.script 工具 dispatch script.review 后返回 { taskId, projectId }。
// 卡据 taskId 轮询 getTask → succeeded 后读 getLatestScriptReview 渲报告(verdict + L1/L2 命中);
// 改写建议逐条走 createArtifactVersion append-only 应用门(复用稿面审核门链)。
//   - dispatch 失败态(error 非 null / 无 taskId / 无 projectId)→ 卡渲诚实错误，不伪造模型配置门。
//   - 轮询到 succeeded → 渲报告卡(verdict 徽标 + findings + 改写 apply 按钮)。
//   - 点「应用改写」→ readCurrentVersion → createArtifactVersion(不自动改稿)。

const routerRefresh = vi.fn();
const getTask = vi.fn();
const getLatestScriptReview = vi.fn();
const getArtifact = vi.fn();
const listArtifactVersions = vi.fn();
const createArtifactVersion = vi.fn();
const restoreArtifact = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: routerRefresh, push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/lib/contract-client", () => ({
  client: {
    getTask: (...a: unknown[]) => getTask(...a),
    getLatestScriptReview: (...a: unknown[]) => getLatestScriptReview(...a),
    getArtifact: (...a: unknown[]) => getArtifact(...a),
    listArtifactVersions: (...a: unknown[]) => listArtifactVersions(...a),
    createArtifactVersion: (...a: unknown[]) => createArtifactVersion(...a),
    restoreArtifact: (...a: unknown[]) => restoreArtifact(...a),
  },
}));

import { ChatReviewReportCard } from "./chat-review-report-card";

const REPORT = {
  id: "rep-1",
  projectId: "p1",
  artifactId: "a1",
  artifactVersion: 2,
  verdict: "risk" as const,
  summary: "有导流风险。",
  lintFindings: [
    {
      ruleId: "r1",
      quote: "第一",
      offset: 0,
      tier: "official_hard" as const,
      category: "绝对化",
      replacement: "较早",
      note: "公约34",
    },
  ],
  llmFindings: [
    {
      quote: "私信我",
      category: "导流",
      severity: "warn" as const,
      reason: "疑似站外导流",
      suggestion: "评论区交流",
      ruleRef: null,
    },
  ],
  modelLabel: "MiniMax-M3",
  reviewedAt: "2026-07-04T00:00:00.000Z",
};

afterEach(() => cleanup());
beforeEach(() => {
  vi.clearAllMocks();
  getTask.mockResolvedValue({ status: "succeeded" });
  getLatestScriptReview.mockResolvedValue(REPORT);
  getArtifact.mockResolvedValue({ id: "a1", currentVersionId: "v2" });
  listArtifactVersions.mockResolvedValue([
    {
      id: "v2",
      versionNumber: 2,
      contentText: "开头私信我领取",
      contentData: { sections: [{ id: "s1", heading: "开场", body: "开头私信我领取" }] },
    },
  ]);
  createArtifactVersion.mockResolvedValue({ id: "v3", versionNumber: 3 });
  restoreArtifact.mockResolvedValue({ id: "a1" });
});

describe("ChatReviewReportCard(对话内审核报告卡,T-103b)", () => {
  it("dispatch 失败(error 非 null)→ 诚实错误态，不展示过时的模型设置门", () => {
    render(
      <ChatReviewReportCard
        taskId={null}
        projectId={null}
        error="文案审核要在具体项目的稿面里进行。"
        pollIntervalMs={0}
      />,
    );
    expect(screen.getByTestId("chat-review-report-card")).toBeTruthy();
    expect(
      document.querySelector('[data-slot="chat-review-error"]')?.textContent,
    ).toContain("稿面里进行");
    expect(
      document.querySelector('[data-slot="chat-review-settings-link"]'),
    ).toBeNull();
    expect(getTask).not.toHaveBeenCalled();
  });

  it("轮询 succeeded → 读报告 → 渲 verdict + L1/L2 命中 + 通用文本模型", async () => {
    render(
      <ChatReviewReportCard
        taskId="task-rev-1"
        projectId="p1"
        error={null}
        pollIntervalMs={0}
      />,
    );
    await waitFor(() => {
      expect(getLatestScriptReview).toHaveBeenCalledWith({
        params: { projectId: "p1" },
        query: undefined,
        body: undefined,
      });
    });
    await waitFor(() => {
      expect(screen.getByTestId("chat-review-verdict").textContent).toContain(
        "有风险",
      );
    });
    const findings = screen.getByTestId("chat-review-findings");
    expect(findings.textContent).toContain("第一");
    expect(findings.textContent).toContain("私信我");
    // 只展示实际使用的通用文本模型。
    expect(screen.getByTestId("chat-review-model").textContent).toContain(
      "MiniMax-M3",
    );
    // 两条命中各带 replacement/suggestion → 两个应用按钮。
    const apply = document.querySelectorAll(
      '[data-slot="chat-review-apply-rewrite"]',
    );
    expect(apply.length).toBe(2);
  });

  it("改写门:点「应用改写」→ 单点替换 → createArtifactVersion(不自动改稿)", async () => {
    render(
      <ChatReviewReportCard
        taskId="task-rev-1"
        projectId="p1"
        error={null}
        pollIntervalMs={0}
      />,
    );
    await waitFor(() => {
      expect(
        document.querySelectorAll('[data-slot="chat-review-apply-rewrite"]')
          .length,
      ).toBe(2);
    });
    // 渲染报告时不应有任何写入(改写是候选,非自动)。
    expect(createArtifactVersion).not.toHaveBeenCalled();
    // 点 L2「私信我」→「评论区交流」的应用按钮(第 2 个)。
    const apply = document.querySelectorAll(
      '[data-slot="chat-review-apply-rewrite"]',
    );
    fireEvent.click(apply[1] as HTMLButtonElement);
    await waitFor(() => {
      expect(createArtifactVersion).toHaveBeenCalledTimes(1);
    });
    const call = createArtifactVersion.mock.calls[0]![0] as {
      params: { artifactId: string };
      body: { contentData?: { sections: { body?: string }[] } };
    };
    expect(call.params.artifactId).toBe("a1");
    // 命中片段被替换,原文其余保留(单点替换)。
    expect(call.body.contentData?.sections[0]?.body).toBe("开头评论区交流领取");
    await waitFor(() => {
      expect(
        document.querySelector('[data-slot="chat-review-rewrite-applied"]'),
      ).toBeTruthy();
    });
  });

  it("轮询 failed → 提示本次语义审核未完成并允许重试，不制造独立配置门", async () => {
    getTask.mockResolvedValue({ status: "failed" });
    render(
      <ChatReviewReportCard
        taskId="task-rev-1"
        projectId="p1"
        error={null}
        pollIntervalMs={0}
      />,
    );
    await waitFor(() => {
      expect(
        document.querySelector('[data-slot="chat-review-error"]')?.textContent,
      ).toContain("语义审核");
    });
    expect(
      document.querySelector('[data-slot="chat-review-settings-link"]'),
    ).toBeNull();
    expect(getLatestScriptReview).not.toHaveBeenCalled();
  });
});
