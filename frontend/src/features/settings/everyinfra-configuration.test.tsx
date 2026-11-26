import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { EveryInfraConfiguration } from "./everyinfra-configuration";

const calls = vi.hoisted(() => ({
  getEveryInfra: vi.fn(),
  putEveryInfra: vi.fn(),
  deleteEveryInfra: vi.fn(),
}));
vi.mock("@/lib/contract-client", () => ({ client: calls }));

const status = { configured: false, baseUrl: "https://api.everyinfra.com" };
const mainland = "https://api-cn.everyinfra.com";

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

it("defaults to the global host and clears the input after saving or removing", async () => {
  calls.getEveryInfra.mockResolvedValue(status);
  calls.putEveryInfra.mockResolvedValue({ configured: true, baseUrl: mainland });
  calls.deleteEveryInfra.mockResolvedValue(status);
  render(<EveryInfraConfiguration />);
  await screen.findByText("尚未配置");
  const host = screen.getByLabelText<HTMLSelectElement>("主机");
  const key = screen.getByLabelText<HTMLInputElement>("API Key");
  expect(host.value).toBe(status.baseUrl);
  expect(Array.from(host.options, option => option.value)).toEqual([status.baseUrl, mainland]);
  expect(key.type).toBe("password");

  fireEvent.change(host, { target: { value: mainland } });
  fireEvent.change(key, { target: { value: "fake-settings-fixture" } });
  fireEvent.click(screen.getByRole("button", { name: "保存配置" }));
  await screen.findByText("已保存密钥");
  expect(calls.putEveryInfra).toHaveBeenCalledWith(expect.objectContaining({
    body: { secret: "fake-settings-fixture", baseUrl: mainland },
  }));
  expect(key.value).toBe("");

  fireEvent.click(screen.getByRole("button", { name: "移除密钥" }));
  await screen.findByText("尚未配置");
  expect(host.value).toBe(status.baseUrl);
});

it("changes a configured host with the stored key and shows a fixed failure message", async () => {
  calls.getEveryInfra.mockResolvedValue({ ...status, configured: true });
  calls.putEveryInfra.mockRejectedValue(new Error("private-fixture-value"));
  render(<EveryInfraConfiguration />);
  await screen.findByText("已保存密钥");
  const host = screen.getByLabelText<HTMLSelectElement>("主机");
  fireEvent.change(host, { target: { value: mainland } });
  fireEvent.click(screen.getByRole("button", { name: "保存配置" }));
  await waitFor(() => expect(calls.putEveryInfra).toHaveBeenCalledWith(expect.objectContaining({
    body: { secret: undefined, baseUrl: mainland },
  })));
  expect((await screen.findByRole("alert")).textContent).toBe("万有引擎配置未保存，请稍后重试。");
  expect(document.body.textContent).not.toContain("private-fixture-value");
});
