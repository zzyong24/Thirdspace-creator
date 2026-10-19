/** T1050 已批准退役创作模式偏好。新建项目由用户明确多选作品形式；旧偏好不再读取或覆盖选择。 */

import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";

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

describe("NewProjectDialog × 已退役的创作模式偏好", () => {
  it("旧 flexible 偏好不读取；默认视频且用户可明确多选文章", () => {
    mockClient.getPreferences.mockResolvedValue({defaultCreationMode:"flexible",autosaveEnabled:true});
    render(<NewProjectDialog />);
    expect(screen.getByRole("dialog", {name:/新建项目/})).toBeInTheDocument();
    expect(screen.getByRole("checkbox", {name:/^视频/})).toBeChecked();
    expect(screen.getByRole("checkbox", {name:/^文章/})).not.toBeChecked();
    fireEvent.click(screen.getByRole("checkbox", {name:/^文章/}));
    expect(screen.getByRole("checkbox", {name:/^文章/})).toBeChecked();
    expect(screen.getByRole("checkbox", {name:/^视频/})).toBeChecked();
    expect(document.querySelector('input[name="creation-mode"]')).toBeNull();
    expect(mockClient.getPreferences).not.toHaveBeenCalled();
    expect(mockClient.createProject).not.toHaveBeenCalled();
  });
  it("不可用旧偏好不阻塞表单；用户仍可明确从视频改选图文", () => {
    mockClient.getPreferences.mockImplementation(()=>{throw new Error("no preferences");});
    render(<NewProjectDialog />);
    expect(screen.getByRole("checkbox", {name:/^视频/})).toBeChecked();
    fireEvent.click(screen.getByRole("checkbox", {name:/^视频/}));
    fireEvent.click(screen.getByRole("checkbox", {name:/^图文/}));
    expect(screen.getByRole("checkbox", {name:/^视频/})).not.toBeChecked();
    expect(screen.getByRole("checkbox", {name:/^图文/})).toBeChecked();
    expect(document.querySelector('input[name="creation-mode"]')).toBeNull();
    expect(mockClient.getPreferences).not.toHaveBeenCalled();
    expect(mockClient.createProject).not.toHaveBeenCalled();
  });
});
