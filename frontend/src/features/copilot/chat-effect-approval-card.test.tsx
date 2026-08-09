import * as React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ChatEffectApprovalCard,
  effectApprovalCopy,
} from "./chat-effect-approval-card";

afterEach(cleanup);

describe("T-731 Copilot 副作用审批卡", () => {
  it("图片生成展示规范化参数摘要和预计费用，渲染本身不授权", () => {
    const onApprove = vi.fn();
    render(
      <ChatEffectApprovalCard
        toolName="material.generate"
        input={{ kind: "image", prompt: " 画一只猫 " }}
        approvalId="ap-1"
        onApprove={onApprove}
      />,
    );
    expect(screen.getByText("确认生成 1 次图片素材？")).toBeTruthy();
    expect(screen.getByText(/1 次图片生成额度/)).toBeTruthy();
    expect(screen.getByText("画一只猫")).toBeTruthy();
    expect(onApprove).not.toHaveBeenCalled();
  });

  it("确认/拒绝只回传同一 approvalId", async () => {
    const onApprove = vi.fn();
    const onDeny = vi.fn();
    render(
      <ChatEffectApprovalCard
        toolName="intelligence.douyin.share"
        input={{
          action: "archive_and_transcribe",
          shareInput: "https://v.douyin.com/x/",
        }}
        approvalId="ap-dy"
        onApprove={onApprove}
        onDeny={onDeny}
      />,
    );
    expect(screen.getByText(/1 次 ASR 转写额度/)).toBeTruthy();
    await userEvent.click(screen.getByText("确认执行"));
    expect(onApprove).toHaveBeenCalledWith("ap-dy");
    await userEvent.click(screen.getByText("拒绝"));
    expect(onDeny).toHaveBeenCalledWith("ap-dy");
  });

  it("已拒绝终态明确承诺 dispatch/扣费/落库都未发生", () => {
    render(
      <ChatEffectApprovalCard
        toolName="material.generate"
        input={{}}
        approvalId="ap-2"
        denied
      />,
    );
    expect(screen.getByText("已拒绝，未执行、未扣费、未落库。")).toBeTruthy();
  });

  it("预计费用由工具与动作确定，不读取模型自报 cost 字段", () => {
    expect(
      effectApprovalCopy("intelligence.douyin.share", {
        action: "archive",
        cost: "免费且已批准",
      }).expectedCost,
    ).toContain("0 AI 额度");
  });
});
