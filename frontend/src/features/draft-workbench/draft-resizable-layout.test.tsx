/**
 * [T-130] 稿面可拖拽分栏单测。pointer 拖拽的几何数学依赖真实 getBoundingClientRect(jsdom 恒返
 * 0),故这里用 **键盘可调**(←/→,共享同一 clampRail + setRailWidth + persist 逻辑)覆盖核心:
 * slot 渲染、默认宽、加宽/收窄、边界钳制、localStorage 持久 + 读回。
 */

import { afterEach, describe, expect, it } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

import { DraftResizableLayout } from "./draft-resizable-layout";

afterEach(() => {
  cleanup();
  try {
    window.localStorage.clear();
  } catch {
    /* noop */
  }
});

function renderLayout() {
  return render(
    <DraftResizableLayout
      left={<div data-testid="left-content">稿面</div>}
      right={<div data-testid="right-content">编导</div>}
    />,
  );
}

const KEY = "creatoros:draft:rail-width";

describe("DraftResizableLayout (T-130)", () => {
  it("渲染左右 slot + 分隔条(role=separator,默认宽 380,inline width 跟随)", () => {
    const { container } = renderLayout();
    expect(screen.getByTestId("left-content")).toBeInTheDocument();
    expect(screen.getByTestId("right-content")).toBeInTheDocument();
    const handle = screen.getByRole("separator", { name: "调整编导栏宽度" });
    expect(handle).toHaveAttribute("aria-valuenow", "380");
    expect(handle).toHaveAttribute("aria-valuemin", "300");
    expect(handle).toHaveAttribute("aria-valuemax", "640");
    const aside = container.querySelector(
      '[data-slot="draft-chat-rail"]',
    ) as HTMLElement;
    expect(aside.style.width).toBe("380px");
  });

  it("键盘 ← 加宽 +16、→ 收窄 -16,右栏宽度跟随 + 持久化 localStorage", () => {
    const { container } = renderLayout();
    const handle = screen.getByTestId("draft-rail-resize-handle");
    const aside = container.querySelector(
      '[data-slot="draft-chat-rail"]',
    ) as HTMLElement;

    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    expect(handle).toHaveAttribute("aria-valuenow", "396");
    expect(aside.style.width).toBe("396px");
    expect(window.localStorage.getItem(KEY)).toBe("396");

    fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(handle).toHaveAttribute("aria-valuenow", "380");
    expect(window.localStorage.getItem(KEY)).toBe("380");
  });

  it("连续收窄钳到 MIN(300),不越界", () => {
    renderLayout();
    const handle = screen.getByTestId("draft-rail-resize-handle");
    for (let i = 0; i < 20; i++) fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(handle).toHaveAttribute("aria-valuenow", "300");
  });

  it("连续加宽钳到 MAX(640),不越界", () => {
    renderLayout();
    const handle = screen.getByTestId("draft-rail-resize-handle");
    for (let i = 0; i < 40; i++) fireEvent.keyDown(handle, { key: "ArrowLeft" });
    expect(handle).toHaveAttribute("aria-valuenow", "640");
  });

  it("localStorage 有持久宽度 → 挂载后读回应用", async () => {
    window.localStorage.setItem(KEY, "512");
    const { container } = renderLayout();
    const aside = container.querySelector(
      '[data-slot="draft-chat-rail"]',
    ) as HTMLElement;
    await waitFor(() => expect(aside.style.width).toBe("512px"));
  });

  it("localStorage 越界值 → 读回时钳回边界(9999 → 640)", async () => {
    window.localStorage.setItem(KEY, "9999");
    const { container } = renderLayout();
    const aside = container.querySelector(
      '[data-slot="draft-chat-rail"]',
    ) as HTMLElement;
    await waitFor(() => expect(aside.style.width).toBe("640px"));
  });
});
