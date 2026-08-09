import { describe, expect, it } from "vitest";
import {
  restoreToolApprovalSignatures,
  shouldResumeToolApprovalOnce,
} from "./tool-approval-resume-guard";

type TestPart = {
  type: string;
  toolCallId?: string;
  state?: string;
  input?: unknown;
  output?: unknown;
  approval?: {
    id?: string;
    approved?: boolean;
    reason?: string;
    signature?: string;
  };
};

function messageWithPart(part: TestPart) {
  return [
    {
      id: "assistant-1",
      role: "assistant",
      parts: [
        { type: "step-start" },
        part,
      ],
    },
  ];
}

function approvedMessage(approvalId = "approval-1") {
  return messageWithPart({
    type: "tool-local_read",
    toolCallId: "call-1",
    state: "approval-responded",
    input: { path: "/tmp/large.md" },
    approval: { id: approvalId, approved: true },
  });
}

describe("[T-673] tool approval resume guard", () => {
  const sdkComplete = ({ messages }: { messages: ReturnType<typeof approvedMessage> }) =>
    messages.at(-1)?.parts.some(
      (part) => part.state === "approval-responded",
    ) === true;

  it("同一批准状态只自动续跑一次，流畸形后不会形成请求风暴", () => {
    const attempted = new Set<string>();
    const messages = approvedMessage();

    expect(shouldResumeToolApprovalOnce(messages, attempted, sdkComplete)).toBe(
      true,
    );
    expect(shouldResumeToolApprovalOnce(messages, attempted, sdkComplete)).toBe(
      false,
    );
    expect(attempted).toEqual(new Set(["approval-1"]));
  });

  it("新的 approval id 仍可正常续跑", () => {
    const attempted = new Set<string>(["approval-1"]);
    expect(
      shouldResumeToolApprovalOnce(
        approvedMessage("approval-2"),
        attempted,
        sdkComplete,
      ),
    ).toBe(true);
  });

  it("尚未批准或已经有输出时不触发续跑", () => {
    const attempted = new Set<string>();
    const pending = messageWithPart({
      type: "tool-local_read",
      toolCallId: "call-1",
      state: "approval-requested",
      input: { path: "/tmp/large.md" },
      approval: { id: "approval-pending" },
    });
    expect(
      shouldResumeToolApprovalOnce(pending, attempted, sdkComplete),
    ).toBe(false);

    const completed = messageWithPart({
      type: "tool-local_read",
      toolCallId: "call-1",
      state: "output-available",
      input: { path: "/tmp/large.md" },
      output: { kind: "local.read", text: "done" },
    });
    expect(
      shouldResumeToolApprovalOnce(completed, attempted, sdkComplete),
    ).toBe(false);
  });
});

describe("[T-736] tool approval signature resume", () => {
  it("SDK 覆盖 approval 后，发请求前按同 approvalId 恢复原签名", () => {
    const messages = approvedMessage();
    expect(messages[0]!.parts[1]!.approval?.signature).toBeUndefined();

    const restored = restoreToolApprovalSignatures(
      messages,
      new Map([["approval-1", "server-hmac-signature"]]),
    );

    expect(restored[0]!.parts[1]!.approval).toEqual({
      id: "approval-1",
      approved: true,
      signature: "server-hmac-signature",
    });
    expect(messages[0]!.parts[1]!.approval?.signature).toBeUndefined();
  });

  it("未知 approvalId 不补签名，也不改写原消息", () => {
    const messages = approvedMessage("approval-unknown");
    const restored = restoreToolApprovalSignatures(
      messages,
      new Map([["approval-1", "server-hmac-signature"]]),
    );
    expect(restored[0]).toBe(messages[0]);
    expect(restored[0]!.parts[1]!.approval?.signature).toBeUndefined();
  });
});
