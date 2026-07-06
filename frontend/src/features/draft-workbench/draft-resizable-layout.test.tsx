/**
 * [T-130] 稿面可拖拽分栏单测。pointer 拖拽的几何数学依赖真实 getBoundingClientRect(jsdom 恒返
 * 0),故这里用 **键盘可调**(←/→,共享同一 clampRail + setRailWidth + persist 逻辑)覆盖核心:
 * slot 渲染、默认宽、加宽/收窄、边界钳制、localStorage 持久 + 读回。
 *
 * [T-150] 追加:右栏折叠开关(收起/展开)的持久、收起态布局、以及「收起态来新 request →
 * 自动展开」的边界(用真实 DraftChatRequestProvider + 触发 openChat 驱动 nonce 变化验证)。
 */

import * as React from "react";
import { afterEach, describe, expect, it } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

import { DraftResizableLayout } from "./draft-resizable-layout";
import {
  DraftChatRequestProvider,
  useDraftChatRequest,
} from "./draft-chat-request";

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
const COLLAPSE_KEY = "creatoros:draft:rail-collapsed";

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

// ---------------------------------------------------------------------------
// [T-150] 右栏折叠开关
// ---------------------------------------------------------------------------

/** 测试辅助:渲染一个能主动 openChat 的按钮,用来驱动 request.nonce 变化(模拟稿面 AI 按钮)。 */
function OpenChatButton() {
  const { openChat } = useDraftChatRequest();
  return (
    <button
      type="button"
      data-testid="fire-request"
      onClick={() =>
        openChat({ functionKey: "review.script", prefill: "审一下" })
      }
    >
      发起请求
    </button>
  );
}

function renderLayoutWithProvider() {
  return render(
    <DraftChatRequestProvider>
      <OpenChatButton />
      <DraftResizableLayout
        left={<div data-testid="left-content">稿面</div>}
        right={<div data-testid="right-content">编导</div>}
      />
    </DraftChatRequestProvider>,
  );
}

describe("DraftResizableLayout 折叠开关 (T-150)", () => {
  it("默认展开:收起按钮可见、展开 affordance 不在、右栏可见", () => {
    const { container } = renderLayout();
    expect(
      screen.getByTestId("draft-rail-collapse-toggle"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("draft-rail-expand-toggle"),
    ).not.toBeInTheDocument();
    expect(
      container.querySelector('[data-slot="draft-chat-rail"]'),
    ).toBeInTheDocument();
  });

  it("点收起 → 右栏 + 拖拽手柄隐藏、露出展开 affordance,且持久化 collapsed=1", () => {
    const { container } = renderLayout();
    fireEvent.click(screen.getByTestId("draft-rail-collapse-toggle"));

    expect(
      container.querySelector('[data-slot="draft-chat-rail"]'),
    ).not.toBeInTheDocument();
    expect(
      container.querySelector('[data-slot="draft-rail-resize-handle"]'),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("draft-rail-expand-toggle")).toBeInTheDocument();
    expect(window.localStorage.getItem(COLLAPSE_KEY)).toBe("1");
  });

  it("收起后再点展开 → 右栏恢复、持久化 collapsed=0", () => {
    const { container } = renderLayout();
    fireEvent.click(screen.getByTestId("draft-rail-collapse-toggle"));
    fireEvent.click(screen.getByTestId("draft-rail-expand-toggle"));

    expect(
      container.querySelector('[data-slot="draft-chat-rail"]'),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("draft-rail-expand-toggle"),
    ).not.toBeInTheDocument();
    expect(window.localStorage.getItem(COLLAPSE_KEY)).toBe("0");
  });

  it("localStorage collapsed=1 → 挂载后读回应用为收起态(右栏隐藏)", async () => {
    window.localStorage.setItem(COLLAPSE_KEY, "1");
    const { container } = renderLayout();
    await waitFor(() =>
      expect(screen.getByTestId("draft-rail-expand-toggle")).toBeInTheDocument(),
    );
    expect(
      container.querySelector('[data-slot="draft-chat-rail"]'),
    ).not.toBeInTheDocument();
  });

  it("收起态展开后仍保留之前持久的宽度(不丢 T-130 记忆:512)", async () => {
    window.localStorage.setItem(KEY, "512");
    window.localStorage.setItem(COLLAPSE_KEY, "1");
    const { container } = renderLayout();
    // 先确认已读回收起态
    await waitFor(() =>
      expect(screen.getByTestId("draft-rail-expand-toggle")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId("draft-rail-expand-toggle"));
    const aside = container.querySelector(
      '[data-slot="draft-chat-rail"]',
    ) as HTMLElement;
    await waitFor(() => expect(aside.style.width).toBe("512px"));
  });

  it("边界:收起态来了新 request(nonce 变)→ 自动展开右栏", async () => {
    window.localStorage.setItem(COLLAPSE_KEY, "1");
    const { container } = renderLayoutWithProvider();
    // 初始为收起态(读回 collapsed=1)。
    await waitFor(() =>
      expect(screen.getByTestId("draft-rail-expand-toggle")).toBeInTheDocument(),
    );
    // 稿面 AI 按钮发请求(nonce 0 → 1)。
    fireEvent.click(screen.getByTestId("fire-request"));
    // 右栏应自动展开(结果不再喂进隐藏 rail)。
    await waitFor(() =>
      expect(
        container.querySelector('[data-slot="draft-chat-rail"]'),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByTestId("draft-rail-expand-toggle"),
    ).not.toBeInTheDocument();
  });

  it("首挂载(request=null)不误触发展开:显式收起后仍保持收起", async () => {
    // Provider 内首帧 request=null(nonce 概念上为 0);挂载 effect 不该把手动收起顶开。
    const { container } = renderLayoutWithProvider();
    // 手动收起。
    fireEvent.click(screen.getByTestId("draft-rail-collapse-toggle"));
    expect(
      container.querySelector('[data-slot="draft-chat-rail"]'),
    ).not.toBeInTheDocument();
    // 等若干 tick 确认没有「幽灵 nonce」把它顶开。
    await new Promise((r) => setTimeout(r, 20));
    expect(
      container.querySelector('[data-slot="draft-chat-rail"]'),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("draft-rail-expand-toggle")).toBeInTheDocument();
  });
});
