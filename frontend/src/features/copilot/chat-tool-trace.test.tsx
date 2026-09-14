import * as React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChatToolTrace } from "./chat-tool-trace";

describe("工具详情按需呈现", () => {
  it("折叠及重渲染不序列化；展开才读取结果，收起后不重复读取", async () => {
    const input = { toJSON: vi.fn(() => ({ query: "热点" })) };
    const output = { total: 12, toJSON: vi.fn(() => ({ result: "真实工具结果" })) };
    const { container, rerender } = render(<ChatToolTrace label="热点查询" input={input} output={output} />);
    expect(input.toJSON).not.toHaveBeenCalled();
    expect(output.toJSON).not.toHaveBeenCalled();
    expect(container.querySelector("pre")).toBeNull();
    rerender(<ChatToolTrace label="RedFox 热点查询" input={input} output={output} />);
    expect(output.toJSON).not.toHaveBeenCalled();

    const details = container.querySelector("details")!;
    details.open = true;
    fireEvent(details, new Event("toggle"));
    await screen.findByText(/真实工具结果/);
    expect(output.toJSON).toHaveBeenCalledTimes(1);
    expect(input.toJSON).toHaveBeenCalledTimes(1);
    rerender(<ChatToolTrace label="查询完成" input={input} output={output} />);
    expect(output.toJSON).toHaveBeenCalledTimes(1);
    details.open = false;
    fireEvent(details, new Event("toggle"));
    await waitFor(() => expect(container.querySelector("pre")).toBeNull());
    expect(output.toJSON).toHaveBeenCalledTimes(1);
  });

  it("展开保持原有400字入参和800字结果摘要，更新时显示新结果", async () => {
    const input = { text: "甲".repeat(500) };
    const output = { text: "乙".repeat(1000) };
    const { container, rerender } = render(<ChatToolTrace label="查询" input={input} output={output} />);
    const details = container.querySelector("details")!;
    details.open = true;
    fireEvent(details, new Event("toggle"));
    await waitFor(() => expect(container.querySelector("pre")?.textContent).toBe(`入参 ${JSON.stringify(input, null, 1).slice(0, 400)}\n结果 ${JSON.stringify(output, null, 1).slice(0, 800)}`));
    rerender(<ChatToolTrace label="查询" input={input} output={{ text: "更新后的结果" }} />);
    expect(container.querySelector("pre")?.textContent).toContain("更新后的结果");
  });
});
