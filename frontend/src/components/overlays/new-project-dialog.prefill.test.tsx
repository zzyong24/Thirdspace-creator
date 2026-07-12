/**
 * [T-247] 设置「偏好 · 默认创作模式」→ 新建项目弹窗预选(假设置清算:接消费)。
 *
 *  - 偏好为非默认值(flexible/freeform)→ 弹窗读 settings.preferences.get 后
 *    表单预选该模式;
 *  - 偏好读失败(op 缺失 / transport 挂)→ 保持内置默认 guided,不报错。
 */

import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

// next/navigation mock — 弹窗只用到 usePathname / useRouter。
const mockRouter = {
  back: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
};
vi.mock("next/navigation", () => ({
  usePathname: () => "/projects/new",
  useRouter: () => mockRouter,
}));

// contract-client mock — getPreferences 每个用例单独编排。
const mockClient = {
  getPreferences: vi.fn(),
  createProject: vi.fn(),
};
vi.mock("@/lib/contract-client", () => ({
  client: {
    getPreferences: (input: unknown) => mockClient.getPreferences(input),
    createProject: (input: unknown) => mockClient.createProject(input),
  },
}));

import { NewProjectDialog } from "./new-project-dialog";

beforeEach(() => {
  mockClient.getPreferences.mockReset();
  mockClient.createProject.mockReset();
  mockRouter.back.mockClear();
  mockRouter.push.mockClear();
  mockRouter.replace.mockClear();
  mockRouter.refresh.mockClear();
});

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

function creationModeRadio(value: string): HTMLInputElement {
  const input = document.querySelector(
    `input[name="creation-mode"][value="${value}"]`,
  );
  expect(input).not.toBeNull();
  return input as HTMLInputElement;
}

describe("NewProjectDialog × 偏好默认创作模式 (T-247)", () => {
  it("偏好 defaultCreationMode=flexible → 表单预选 AI 协作创作", async () => {
    mockClient.getPreferences.mockResolvedValue({
      defaultCreationMode: "flexible",
      autosaveEnabled: true,
    });
    render(<NewProjectDialog />);
    // 弹窗即时渲染(不等偏好),先是内置默认。
    expect(screen.getByRole("dialog", { name: /新建项目/i })).toBeInTheDocument();
    // 偏好回读后,creation-mode 预选翻成 flexible。
    await waitFor(() => {
      expect(creationModeRadio("flexible").checked).toBe(true);
    });
    expect(creationModeRadio("guided").checked).toBe(false);
    expect(mockClient.getPreferences).toHaveBeenCalledTimes(1);
  });

  it("偏好读失败 → 保持内置默认 guided,不报错", async () => {
    mockClient.getPreferences.mockRejectedValue(new Error("no preferences"));
    render(<NewProjectDialog />);
    await waitFor(() =>
      expect(mockClient.getPreferences).toHaveBeenCalledTimes(1),
    );
    expect(creationModeRadio("guided").checked).toBe(true);
  });
});
