import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ActivationResetControl } from "./activation-reset-control";

const invoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

describe("ActivationResetControl (T-746)", () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it("只在已有本机激活态时显示真实入口", () => {
    const { rerender } = render(<ActivationResetControl visible={false} />);
    expect(
      screen.queryByRole("button", { name: "重新输入激活码" }),
    ).not.toBeInTheDocument();

    rerender(<ActivationResetControl visible />);
    expect(
      screen.getByRole("button", { name: "重新输入激活码" }),
    ).toBeInTheDocument();
  });

  it("确认层明确本地边界，取消时不调用原生命令", () => {
    render(<ActivationResetControl visible />);
    fireEvent.click(screen.getByRole("button", { name: "重新输入激活码" }));

    expect(screen.getByRole("dialog")).toHaveTextContent(
      "不会删除项目、素材、账号、模型配置、模型密钥或机器码",
    );
    expect(screen.getByRole("dialog")).toHaveTextContent(
      "不会解除服务端绑定",
    );
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(invoke).not.toHaveBeenCalled();
  });

  it("确认后只调用无参数原生命令，由原生壳停止旧会话并重启", async () => {
    invoke.mockResolvedValue({ clearedItems: 5, restartRequired: true });
    render(<ActivationResetControl visible />);
    fireEvent.click(screen.getByRole("button", { name: "重新输入激活码" }));
    fireEvent.click(screen.getByRole("button", { name: "确认并重新启动" }));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledTimes(1);
      expect(invoke).toHaveBeenCalledWith("license_reset_local");
    });
    expect(screen.getByText("正在重新启动 CreatorOS…")).toBeInTheDocument();
  });

  it("原生清理失败时如实显示错误，不声称已完成", async () => {
    invoke.mockRejectedValue(new Error("未能确认本机服务进程已停止"));
    render(<ActivationResetControl visible />);
    fireEvent.click(screen.getByRole("button", { name: "重新输入激活码" }));
    fireEvent.click(screen.getByRole("button", { name: "确认并重新启动" }));

    expect(
      await screen.findByText("未能确认本机服务进程已停止"),
    ).toBeInTheDocument();
    expect(screen.queryByText("已完成")).not.toBeInTheDocument();
  });
});
