import * as React from "react";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, it, expect, vi } from "vitest";
import { BrowserTaskAuthorizationCard } from "./browser-task-authorization-card";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("交互默认不授权，提交用户改后的范围再回读", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => ({ status: "granted" }) });
  vi.stubGlobal("fetch", fetcher);
  const onSettled = vi.fn(async () => {});
  render(
    <BrowserTaskAuthorizationCard
      taskId="task"
      suggestion={{ allowedDomains: ["example.com"], allowInteraction: true }}
      onSettled={onSettled}
    />,
  );
  expect(screen.getByRole("checkbox")).not.toBeChecked();
  await userEvent.clear(screen.getByRole("textbox"));
  await userEvent.type(screen.getByRole("textbox"), "www.example.com");
  await userEvent.click(screen.getByRole("button", { name: "允许并继续" }));
  const body = JSON.parse(fetcher.mock.calls[0][1].body);
  expect(body).toMatchObject({
    taskId: "task",
    authorization: {
      allowedDomains: ["www.example.com"],
      allowInteraction: false,
    },
  });
  expect(onSettled).toHaveBeenCalledTimes(1);
});
it("拒绝浏览器保存真实选择；回执失败也回读，重发保持同键", async () => {
  const fetcher = vi.fn().mockRejectedValue(new Error("请求中断"));
  vi.stubGlobal("fetch", fetcher);
  const onSettled = vi.fn(async () => {});
  render(
    <BrowserTaskAuthorizationCard
      taskId="task"
      suggestion={{ allowedDomains: ["example.com"] }}
      onSettled={onSettled}
    />,
  );
  await userEvent.click(
    screen.getByRole("button", { name: "不使用浏览器继续" }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "不使用浏览器继续" }),
  );
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({
    authorization: null,
  });
  expect(fetcher.mock.calls[1][1].body).toBe(fetcher.mock.calls[0][1].body);
  expect(onSettled).toHaveBeenCalledTimes(2);
});
it("授权后准备失败只重试准备，不提交新权限", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue({
      ok: true,
      json: async () => ({ status: "prepared" }),
    });
  vi.stubGlobal("fetch", fetcher);
  render(
    <BrowserTaskAuthorizationCard
      taskId="task"
      authorized
      suggestion={null}
      onSettled={async () => {}}
    />,
  );
  expect(screen.queryByRole("checkbox")).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "继续任务" }));
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
    taskId: "task",
    action: "prepare",
  });
});
