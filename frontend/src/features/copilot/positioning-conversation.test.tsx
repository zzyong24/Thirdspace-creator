import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PositioningConversationStart } from "./positioning-conversation";

describe("PositioningConversationStart", () => {
  afterEach(() => vi.restoreAllMocks());

  it("hasMaster 时显示软清除，并在确认后交给 scratch 回调", () => {
    const onSoftClear = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<PositioningConversationStart onPick={vi.fn()} disabled={false} hasMaster onSoftClear={onSoftClear} />);

    expect(screen.getByRole("button", { name: "清除现有定位信息" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "清除现有定位信息" }));
    expect(onSoftClear).toHaveBeenCalledTimes(1);
  });

  it("没有母版时不显示软清除按钮", () => {
    render(<PositioningConversationStart onPick={vi.fn()} disabled={false} />);
    expect(screen.queryByRole("button", { name: "清除现有定位信息" })).toBeNull();
  });
});
