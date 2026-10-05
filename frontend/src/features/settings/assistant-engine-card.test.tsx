import {fireEvent, render, screen, waitFor} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";
import {AssistantEngineCard} from "./assistant-engine-card";

const response = (available = true) => new Response(JSON.stringify({engines: [{
  engine: "codex", installed: true, available, version: "0.159.3", loginStatus: "authenticated",
}]}), {status: 200});

describe("T-1055 设置的真实编导引擎卡", () => {
  it("使用原键保存选择并读取真实 Codex 状态；不需要服务端假偏好", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(response());
    const {container} = render(<AssistantEngineCard />);
    expect(container.querySelector('[data-highlight="assistant-engine"]')).not.toBeNull();
    const select = screen.getByRole("combobox", {name: "编导引擎"});
    expect(select).toHaveValue("pi");
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.change(select, {target: {value: "codex"}});
    expect(localStorage.getItem("creatoros:assistant-engine:v1")).toBe("codex");
    await screen.findByText("本地 Codex 文本会话已连接 · 0.159.3（工具执行未验证）");
    expect(screen.getByRole("button", {name: "重新检查"})).toBeEnabled();
  });

  it("检查中按钮不会并发重复提交，真实失败后允许重查", async () => {
    localStorage.setItem("creatoros:assistant-engine:v1", "codex");
    let reject!: (reason: unknown) => void;
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementationOnce(() => new Promise((_resolve, r) => {reject = r;})).mockResolvedValue(response());
    render(<AssistantEngineCard />);
    const recheck = screen.getByRole("button", {name: "重新检查"});
    expect(recheck).toBeDisabled();
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    fireEvent.click(recheck);
    expect(fetch).toHaveBeenCalledOnce();
    reject(Error("status read unavailable"));
    await screen.findByText("本地 Codex 状态暂未核实");
    fireEvent.click(recheck);
    await screen.findByText("本地 Codex 文本会话已连接 · 0.159.3（工具执行未验证）");
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
