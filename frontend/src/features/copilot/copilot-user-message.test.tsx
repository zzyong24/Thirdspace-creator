import * as React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CopilotUserMessageText } from "./copilot-user-message";

afterEach(() => cleanup());

describe("CopilotUserMessageText", () => {
  it("普通多行文本保留换行，超长链接允许在任意位置换行", () => {
    const { container } = render(
      <CopilotUserMessageText
        text={"第一行\nhttps://example.com/" + "very-long-segment-".repeat(20)}
      />,
    );
    const message = container.querySelector(
      '[data-slot="copilot-message-text"]',
    );
    expect(message?.className).toContain("whitespace-pre-wrap");
    expect(message?.className).toContain("[overflow-wrap:anywhere]");
  });

  it("定位前采包默认折叠但完整保留答案与长来源，不截断数据", () => {
    const longUrl = `https://example.com/source?token=${"x".repeat(500)}`;
    const text = `【定位前采已完成】\n用户答案：完整答案\n公开参考：${longUrl}`;
    render(<CopilotUserMessageText text={text} />);

    expect(
      screen.getByText("定位前采包 · 点击展开完整答案与来源"),
    ).toBeTruthy();
    const fullPacket = document.querySelector("pre");
    expect(fullPacket?.textContent).toContain(longUrl);
    expect(fullPacket?.textContent).toContain("完整答案");
  });
});
