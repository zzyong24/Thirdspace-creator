import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { TopicCandidateEditor } from "./topic-candidate-editor";
import type { RadarItemDetail } from "./intelligence-workbench-types";
afterEach(cleanup);
const snapshot = {
  title: "流程决定交付", contentRole: "traffic" as const, contentRoleReason: "原作以共同处境吸引观看，本账号也服务这些观众。",
  adaptedDraft: { contentText: "原流量目的初稿", generatedFromTranscriptHash: "hash", strategyHash: "strategy", templateVersion: "v1" },
};
it("同一任务逐段到达的推荐和初稿能进入确认，用户改选不会被轮询覆盖", async () => {
  const onUpgradeProject = vi.fn();
  const props = { sourceTranscript: "原文", busy: false, retryDisabled: false, onRetry: vi.fn(), onConfirm: vi.fn(), onUpgradeProject };
  const base = { id: "same-transform", status: "candidate" as const, taskStatus: "running" as const, targetTopicId: null };
  const { rerender } = render(<TopicCandidateEditor {...props} transform={{ ...base, outputSnapshot: { hook: "开头" } }} />);
  expect(screen.getByLabelText("选题候选内容目的")).toHaveValue("");
  rerender(<TopicCandidateEditor {...props} transform={{ ...base, taskStatus: "succeeded", outputSnapshot: snapshot }} />);
  expect(screen.getByLabelText("选题候选内容目的")).toHaveValue("traffic");
  expect(screen.getByLabelText("我的改写初稿")).toHaveValue(snapshot.adaptedDraft.contentText);
  await userEvent.selectOptions(screen.getByLabelText("选题候选内容目的"), "conversion");
  rerender(<TopicCandidateEditor {...props} transform={{ ...base, taskStatus: "succeeded", outputSnapshot: { ...snapshot, angle: "补充角度" } }} />);
  expect(screen.getByLabelText("选题候选内容目的")).toHaveValue("conversion");
  expect(screen.getByLabelText("选题候选角度")).toHaveValue("补充角度");
  await userEvent.click(screen.getByRole("button", { name: "一键升级项目" }));
  expect(onUpgradeProject).toHaveBeenCalledWith("same-transform", expect.objectContaining({ contentRole: "conversion", title: snapshot.title }), null);
  await userEvent.selectOptions(screen.getByLabelText("选题候选内容目的"), "");
  rerender(<TopicCandidateEditor {...props} transform={{ ...base, taskStatus: "succeeded", outputSnapshot: { ...snapshot } }} />);
  expect(screen.getByLabelText("选题候选内容目的")).toHaveValue("");
});
it("已确认卡片展示原推荐和现选值，不允许产生未保存改选；旧卡诚实显示未推荐", () => {
  const props = { sourceTranscript: "原文", busy: false, retryDisabled: false, onRetry: vi.fn(), onConfirm: vi.fn(), onUpgradeProject: vi.fn() };
  const transform: RadarItemDetail["transforms"][number] = { id: "confirmed", status: "confirmed", targetTopicId: "topic", outputSnapshot: { ...snapshot, contentRole: "conversion", recommendedContentRole: "traffic" } };
  const { rerender } = render(<TopicCandidateEditor {...props} transform={{ ...transform, outputSnapshot: transform.outputSnapshot! }} />);
  expect(screen.getByLabelText("选题候选内容目的")).toHaveValue("conversion");
  expect(screen.getByLabelText("选题候选内容目的")).toBeDisabled();
  expect(screen.getByText("原推荐：流量型")).toBeInTheDocument();
  rerender(<TopicCandidateEditor {...props} transform={{ ...transform, outputSnapshot: { title: "旧卡" } }} />);
  expect(screen.getByText("原推荐：未推荐")).toBeInTheDocument();
});
