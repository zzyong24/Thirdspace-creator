import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OwnedDeviceConnection } from "./owned-device-connection";
const openUrl = vi.fn();
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl }));
const invoke = vi.fn(); vi.mock("@tauri-apps/api/core", () => ({ invoke }));
const idle = { state: "idle", intent: null, userCode: null, verificationUrl: null, expiresAt: null, retryAfterSeconds: null, message: "可连接手机号" };
describe("原电脑账号与设备入口", () => {
  beforeEach(() => { invoke.mockReset(); openUrl.mockReset(); invoke.mockResolvedValue(idle); });
  it("未激活无入口，未开放安装包探测后隐藏入口", async () => { const mounted = render(<OwnedDeviceConnection visible={false} />); expect(invoke).not.toHaveBeenCalled(); mounted.rerender(<OwnedDeviceConnection visible />); await waitFor(() => expect(invoke).toHaveBeenCalled()); mounted.unmount(); invoke.mockResolvedValue({ ...idle, state: "unavailable" }); render(<OwnedDeviceConnection visible />); await waitFor(() => expect(screen.queryByRole("region", { name: "账号与设备" })).not.toBeInTheDocument()); });
  it("原电脑发起独立owner意向，不让JS输入machine或票据", async () => { const user = userEvent.setup(); render(<OwnedDeviceConnection visible />); const button = await screen.findByRole("button", { name: "连接手机号账号" }); await waitFor(() => expect(button).toBeEnabled()); await user.click(button); expect(invoke).toHaveBeenCalledWith("owned_device_start", { intent: "link_owner", deviceLabel: "这台电脑" }); expect(screen.queryByRole("textbox")).not.toBeInTheDocument(); });
  it("完成owner连接后可重新打开固定本人产品页，不依赖已关闭的确认tab", async () => {
    const user = userEvent.setup(); invoke.mockResolvedValue({ ...idle, state: "linked", message: "产品已连接本人账号" });
    render(<OwnedDeviceConnection visible />); await user.click(await screen.findByRole("button", { name: "管理产品与设备" }));
    expect(openUrl).toHaveBeenCalledWith("https://growth.aitongban.cloud/app/products");
  });

});
