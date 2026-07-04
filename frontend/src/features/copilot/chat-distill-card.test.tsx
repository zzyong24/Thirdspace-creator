/**
 * ChatDistillCard 单测(T-094)—— 对话内蒸馏结果卡:
 *  - 成功:渲共享确认门(KnowledgeAtomGate,默认全选 + 采纳按钮);
 *  - 失败:错误**人话**卡(role=alert),suggestSwitchModel=true 时附「去设置」链接;
 *  - 空原子:诚实空态。
 */

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mockRouter = { refresh: vi.fn(), replace: vi.fn(), push: vi.fn(), back: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => mockRouter }));
vi.mock("@/lib/contract-client", () => ({
  client: { createKnowledge: vi.fn(async () => ({ id: "k-1" })) },
}));

import { ChatDistillCard, type ChatDistillResult } from "./chat-distill-card";

afterEach(() => cleanup());

function q<T extends Element>(container: HTMLElement, slot: string): T | null {
  return container.querySelector<T>(`[data-slot="${slot}"]`);
}

const OK_RESULT: ChatDistillResult = {
  atoms: [
    { type: "claim", title: "观点一", note: "", sourceNote: "" },
    { type: "quote", title: "金句一", note: "", sourceNote: "作者" },
  ],
  suggestedTags: ["主题"],
  originalText: "原文全文",
  error: null,
  suggestSwitchModel: false,
};

describe("ChatDistillCard", () => {
  it("成功 → 渲共享确认门(默认全选,采纳按钮显条数)", () => {
    const { container } = render(<ChatDistillCard result={OK_RESULT} />);
    expect(q(container, "knowledge-distill-batch")).not.toBeNull();
    const checks = container.querySelectorAll(
      '[data-slot="knowledge-atom-select"]',
    );
    expect(checks).toHaveLength(2);
    expect(
      q<HTMLButtonElement>(container, "knowledge-distill-adopt")!.textContent,
    ).toContain("采纳选中 2 条");
  });

  it("失败(人话 error + suggestSwitchModel)→ 错误卡 + 「去设置」链接,不渲确认门", () => {
    const { container } = render(
      <ChatDistillCard
        result={{
          ...OK_RESULT,
          atoms: [],
          error:
            "内容触发了模型方(MiniMax)的内容安全审核,已重试仍被拦。建议:在设置里换一个模型再试,或删去疑似敏感段落后重试。",
          suggestSwitchModel: true,
        }}
      />,
    );
    const card = q(container, "chat-distill-card")!;
    expect(card.getAttribute("data-error")).toBe("true");
    expect(card.textContent).toContain("内容安全审核");
    const link = q<HTMLAnchorElement>(container, "chat-distill-settings-link");
    expect(link).not.toBeNull();
    expect(link!.getAttribute("href")).toBe("/settings");
    expect(q(container, "knowledge-distill-batch")).toBeNull();
  });

  it("失败但非「换模型可解」→ 无设置链接(不给死路选项)", () => {
    const { container } = render(
      <ChatDistillCard
        result={{
          ...OK_RESULT,
          atoms: [],
          error: "ECONNREFUSED",
          suggestSwitchModel: false,
        }}
      />,
    );
    expect(q(container, "chat-distill-settings-link")).toBeNull();
  });

  it("空原子(无 error)→ 诚实空态", () => {
    const { container } = render(
      <ChatDistillCard result={{ ...OK_RESULT, atoms: [] }} />,
    );
    const card = q(container, "chat-distill-card")!;
    expect(card.getAttribute("data-empty")).toBe("true");
    expect(card.textContent).toContain("没蒸出");
  });
});
