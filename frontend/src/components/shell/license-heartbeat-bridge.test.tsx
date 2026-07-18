/**
 * [T-372 L3] LicenseHeartbeatBridge 组件测试。
 *
 * 锚定的行为契约(SPEC §7/§9):
 *   ① 挂载时补读最近判定(license_last_decision):licensed=false → 立即 replace("/activate")
 *      (内测到期硬跳/超宽限/吊销,启动查早于 webview 挂载也不漏)。
 *   ② 心跳事件(creatoros://license-decision)licensed=false → 立即跳激活页
 *      (内测 60min 心跳命中 revoked 即时生效,不等下次导航)。
 *   ③ licensed=true(含买断 fail-open 离线放行)→ 绝不跳转。
 *   ④ 卸载 → 退订事件(不留悬挂监听)。
 * `@/lib/shell-license` 全 mock(不真跑 Tauri IPC)。
 */

import * as React from "react";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockRouter = {
  refresh: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
};
vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

// shell-license 薄封装 mock:逐用例控制初始判定 + 捕获事件回调。
const mockFetchLast = vi.fn();
const mockUnlisten = vi.fn();
let capturedOnDecision: ((d: unknown) => void) | null = null;
vi.mock("@/lib/shell-license", () => ({
  fetchLastShellDecision: () => mockFetchLast(),
  subscribeShellDecision: (cb: (d: unknown) => void) => {
    capturedOnDecision = cb;
    return Promise.resolve(mockUnlisten);
  },
}));

import { LicenseHeartbeatBridge } from "./license-heartbeat-bridge";

// 判定 fixture(Rust GateDecision camelCase 形状,字段与 shell-license.ts 对齐)。
function decision(over: Record<string, unknown> = {}) {
  return {
    licensed: true,
    status: "active",
    mode: "trial",
    expiresAt: "2026-07-20T12:00:00Z",
    revoked: false,
    updatesBlocked: false,
    offlineRemaining: null,
    signatureVerified: true,
    strictVerify: true,
    message: "已激活",
    ...over,
  };
}

beforeEach(() => {
  mockRouter.replace.mockReset();
  mockFetchLast.mockReset();
  mockUnlisten.mockReset();
  capturedOnDecision = null;
  mockFetchLast.mockResolvedValue(null);
});
afterEach(() => cleanup());

describe("LicenseHeartbeatBridge (T-372 L3)", () => {
  it("初始判定 licensed=false(内测到期/超宽限/吊销)→ 立即跳激活页", async () => {
    mockFetchLast.mockResolvedValue(
      decision({ licensed: false, status: "expired", message: "授权已过期" }),
    );
    render(<LicenseHeartbeatBridge />);
    await waitFor(() =>
      expect(mockRouter.replace).toHaveBeenCalledWith("/activate"),
    );
  });

  it("初始判定 licensed=true → 不跳;心跳事件 licensed=false → 立即跳", async () => {
    mockFetchLast.mockResolvedValue(decision());
    render(<LicenseHeartbeatBridge />);
    await waitFor(() => expect(capturedOnDecision).not.toBeNull());
    expect(mockRouter.replace).not.toHaveBeenCalled();
    // 心跳命中吊销(内测 60min 复校)→ 事件驱动即时跳转。
    capturedOnDecision!(
      decision({ licensed: false, status: "expired", revoked: true }),
    );
    await waitFor(() =>
      expect(mockRouter.replace).toHaveBeenCalledWith("/activate"),
    );
  });

  it("买断 fail-open(离线 licensed=true)/ 仅停更新(updatesBlocked)→ 绝不跳转", async () => {
    mockFetchLast.mockResolvedValue(
      decision({ mode: "perpetual", expiresAt: null, status: "active" }),
    );
    render(<LicenseHeartbeatBridge />);
    await waitFor(() => expect(capturedOnDecision).not.toBeNull());
    // 买断签名撤销:licensed 仍 true(停更新不锁功能)→ 不跳激活页。
    capturedOnDecision!(
      decision({
        mode: "perpetual",
        expiresAt: null,
        revoked: true,
        updatesBlocked: true,
      }),
    );
    // 微任务排空后仍未跳转。
    await new Promise((r) => setTimeout(r, 0));
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it("卸载 → 退订事件监听", async () => {
    mockFetchLast.mockResolvedValue(decision());
    const { unmount } = render(<LicenseHeartbeatBridge />);
    await waitFor(() => expect(capturedOnDecision).not.toBeNull());
    unmount();
    expect(mockUnlisten).toHaveBeenCalled();
  });
});
