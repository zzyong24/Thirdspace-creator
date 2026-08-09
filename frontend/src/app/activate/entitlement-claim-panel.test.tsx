import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EntitlementClaimPanel } from "./entitlement-claim-panel";

const invoke = vi.fn();
const fetchMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

describe("EntitlementClaimPanel", () => {
  beforeEach(() => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    invoke.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    invoke.mockImplementation(async (command: string) => {
      if (command === "entitlement_claim_resume") return null;
      return {
        state: "awaitingApproval",
        userCode: "ABCD-EFGH",
        verificationUrl: "https://growth.example.com/claim",
        expiresAt: "2026-07-27T12:15:00.000Z",
        retryAfterSeconds: 5,
        message: "请在网页确认领取",
      };
    });
  });

  it("[T-575] 默认关闭时不渲染假领取按钮", () => {
    render(<EntitlementClaimPanel enabled={false} />);
    expect(
      screen.queryByRole("button", { name: "领取产品" }),
    ).not.toBeInTheDocument();
  });

  it("[T-575] 只展示短时 userCode，并用不带 query/fragment 的 verificationUrl 打开浏览器", async () => {
    const user = userEvent.setup();
    render(<EntitlementClaimPanel enabled />);
    await user.click(screen.getByRole("button", { name: "领取产品" }));

    expect(await screen.findByText("ABCD-EFGH")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "去官方页面确认" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/local/open-url", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "https://growth.example.com/claim" }),
    });
    expect(document.body.textContent).not.toMatch(/deviceSecret|claimToken|codeVerifier/);
  });

  it("[T-575] session 失效后提供真实重新领取动作", async () => {
    invoke.mockImplementation(async (command: string) => {
      if (command === "entitlement_claim_resume") return null;
      if (command === "entitlement_claim_start") {
        return {
          state: "awaitingApproval",
          userCode: "ABCD-EFGH",
          verificationUrl: "https://growth.example.com/claim",
          expiresAt: "2026-07-27T12:15:00.000Z",
          retryAfterSeconds: 5,
          message: "请在网页确认领取",
        };
      }
      return {
        state: "restartRequired",
        userCode: null,
        verificationUrl: null,
        expiresAt: null,
        retryAfterSeconds: null,
        message: "本次验证码已失效，请重新领取",
      };
    });
    const user = userEvent.setup();
    render(<EntitlementClaimPanel enabled />);
    await user.click(screen.getByRole("button", { name: "领取产品" }));
    await user.click(screen.getByRole("button", { name: "我已确认，继续" }));
    expect(
      await screen.findByRole("button", { name: "重新领取产品" }),
    ).toBeInTheDocument();
  });

  it("[T-575] AM 授权原子保存后先显示激活成功，再由用户明确重新进入应用", async () => {
    invoke.mockImplementation(async (command: string) => {
      if (command === "entitlement_claim_resume") return null;
      if (command === "entitlement_claim_start") {
        return {
          state: "awaitingApproval",
          userCode: "ABCD-EFGH",
          verificationUrl: "https://growth.example.com/claim",
          expiresAt: "2026-07-27T12:15:00.000Z",
          retryAfterSeconds: 5,
          message: "请在网页确认领取",
        };
      }
      return {
        state: "activated",
        userCode: null,
        verificationUrl: null,
        expiresAt: null,
        retryAfterSeconds: null,
        message: "权益已领取并激活",
      };
    });
    const user = userEvent.setup();
    render(<EntitlementClaimPanel enabled />);

    await user.click(screen.getByRole("button", { name: "领取产品" }));
    await user.click(screen.getByRole("button", { name: "我已确认，继续" }));

    expect(await screen.findByText("产品已领取")).toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalledWith("relaunch_app");
    await user.click(screen.getByRole("button", { name: "进入应用" }));
    expect(invoke).toHaveBeenCalledWith("relaunch_app");
  });

  it("[T-575] native 技术错误不进入普通页面，失败后仍可重试", async () => {
    invoke.mockImplementation(async (command: string) => {
      if (command === "entitlement_claim_resume") return null;
      throw new Error(
        "claimToken provider closed-contract signature requestId mismatch",
      );
    });
    const user = userEvent.setup();
    render(<EntitlementClaimPanel enabled />);

    await user.click(screen.getByRole("button", { name: "领取产品" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "领取没有完成，请稍后重试",
    );
    expect(document.body.textContent).not.toMatch(
      /claimToken|provider|closed-contract|requestId/,
    );
    expect(screen.getByRole("button", { name: "领取产品" })).toBeEnabled();
  });
});
