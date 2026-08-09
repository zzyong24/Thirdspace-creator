import { describe, expect, it } from "vitest";
import {
  canonicalEffectInput,
  ChatEffectApprovalRegistry,
  EffectApprovalError,
  findApprovalResponse,
  isReadOnlyToolAfterUntrustedContent,
} from "./chat-effect-approval";

function approvalMessages(input: {
  toolCallId: string;
  approvalId: string;
  approved?: boolean;
}) {
  return [
    {
      role: "assistant",
      content: [
        {
          type: "tool-approval-request",
          toolCallId: input.toolCallId,
          approvalId: input.approvalId,
        },
        {
          type: "tool-approval-response",
          approvalId: input.approvalId,
          approved: input.approved ?? true,
        },
      ],
    },
  ];
}

describe("T-731 副作用审批账本", () => {
  it("规范化参数不受对象键序和首尾空白影响", () => {
    expect(canonicalEffectInput({ b: " x ", a: { d: 2, c: " y " } })).toBe(
      canonicalEffectInput({ a: { c: "y", d: 2 }, b: "x" }),
    );
  });

  it("签发→同 approvalId/工具/规范化参数消费一次；重放在 dispatch 前失败", () => {
    let now = 1_000;
    const registry = new ChatEffectApprovalRegistry({ now: () => now });
    const base = {
      userId: "u1",
      toolName: "material.generate",
      toolCallId: "call-1",
      toolInput: { kind: "image", prompt: " 画一只猫 " },
    };
    expect(registry.request({ ...base, messages: [] })).toEqual({
      status: "user-approval",
    });
    const messages = approvalMessages({ toolCallId: "call-1", approvalId: "ap-1" });
    expect(registry.request({ ...base, messages })).toEqual({
      status: "user-approval",
    });
    const consumed = registry.consume({ ...base, messages });
    expect(consumed.approvalId).toBe("ap-1");
    expect(consumed.executionKey).toMatch(/^[a-f0-9]{64}$/);
    expect(() => registry.consume({ ...base, messages })).toThrow(EffectApprovalError);
    expect(registry.request({ ...base, messages })).toMatchObject({ status: "denied" });
    now += 1;
  });

  it("未知旧审批、参数变化、跨用户、拒绝与超时全部 fail closed", () => {
    let now = 5_000;
    const registry = new ChatEffectApprovalRegistry({
      now: () => now,
      ttlMs: 100,
    });
    const base = {
      userId: "u1",
      toolName: "material.generate",
      toolCallId: "call-2",
      toolInput: { kind: "video", prompt: "p" },
    };
    const approved = approvalMessages({ toolCallId: "call-2", approvalId: "ap-2" });
    expect(registry.request({ ...base, messages: approved })).toMatchObject({
      status: "denied",
    });

    expect(registry.request({ ...base, messages: [] })).toEqual({
      status: "user-approval",
    });
    expect(
      registry.request({
        ...base,
        toolInput: { kind: "video", prompt: "偷偷改参" },
        messages: approved,
      }),
    ).toMatchObject({ status: "denied" });
    expect(
      registry.request({ ...base, userId: "u2", messages: approved }),
    ).toMatchObject({ status: "denied" });
    expect(
      registry.request({
        ...base,
        messages: approvalMessages({
          toolCallId: "call-2",
          approvalId: "ap-2",
          approved: false,
        }),
      }),
    ).toMatchObject({ status: "denied" });
    now += 101;
    expect(registry.request({ ...base, messages: approved })).toMatchObject({
      status: "denied",
    });
  });

  it("审批回执必须和同 toolCall 的 request approvalId 成对", () => {
    expect(
      findApprovalResponse(
        [
          {
            role: "assistant",
            content: [
              {
                type: "tool-approval-request",
                toolCallId: "call-x",
                approvalId: "ap-real",
              },
              {
                type: "tool-approval-response",
                approvalId: "ap-forged",
                approved: true,
              },
            ],
          },
        ],
        "call-x",
      ),
    ).toBeNull();
  });

  it("同一消息有多个审批时按 approvalId 精确配对，不被后一条回执覆盖", () => {
    const messages = [
      {
        role: "assistant",
        content: [
          {
            type: "tool-approval-request",
            toolCallId: "call-a",
            approvalId: "ap-a",
          },
          {
            type: "tool-approval-request",
            toolCallId: "call-b",
            approvalId: "ap-b",
          },
          {
            type: "tool-approval-response",
            approvalId: "ap-a",
            approved: true,
          },
          {
            type: "tool-approval-response",
            approvalId: "ap-b",
            approved: true,
          },
        ],
      },
    ];
    expect(findApprovalResponse(messages, "call-a")).toEqual({
      approvalId: "ap-a",
      toolCallId: "call-a",
      approved: true,
    });
    expect(findApprovalResponse(messages, "call-b")).toEqual({
      approvalId: "ap-b",
      toolCallId: "call-b",
      approved: true,
    });
  });
});

describe("T-731 不可信内容后的只读工具域", () => {
  it("只保留本地 context/环境探测，外部正文不能继续驱动联网、本机读取或副作用", () => {
    expect(isReadOnlyToolAfterUntrustedContent("context.projects")).toBe(true);
    expect(isReadOnlyToolAfterUntrustedContent("local.tools")).toBe(true);
    for (const name of [
      "web.read",
      "local.read",
      "material.gather",
      "material.generate",
      "material.screenshot",
      "intelligence.douyin.share",
      "project.transcribe",
      "script.draft",
      "cover.generate",
    ]) {
      expect(isReadOnlyToolAfterUntrustedContent(name), name).toBe(false);
    }
  });
});
