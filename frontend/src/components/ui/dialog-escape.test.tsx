import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./dialog";

function Harness({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>设置</DialogTitle>
        <DialogDescription>模型配置</DialogDescription>
        <select aria-label="模型来源" defaultValue="a">
          <option value="a">官方</option>
          <option value="b">自配</option>
        </select>
        <button type="button">其它</button>
      </DialogContent>
    </Dialog>
  );
}

describe("弹窗里的原生下拉框按 Esc（月明录屏 2026-11-10）", () => {
  it("焦点在下拉框上按 Esc 只收起下拉，不关闭弹窗；再按 Esc 才关闭", () => {
    const onOpenChange = vi.fn();
    render(<Harness onOpenChange={onOpenChange} />);
    const select = screen.getByLabelText("模型来源");
    select.focus();
    fireEvent.keyDown(select, { key: "Escape" });
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(document.activeElement).not.toBe(select);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
  it("焦点不在下拉框时 Esc 照常关闭弹窗", () => {
    const onOpenChange = vi.fn();
    render(<Harness onOpenChange={onOpenChange} />);
    const button = screen.getByRole("button", { name: "其它" });
    button.focus();
    fireEvent.keyDown(button, { key: "Escape" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
