import * as React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NewProjectForm } from "./new-project-form";

afterEach(cleanup);
function setup(onCreate = vi.fn()) {
  const onCancel = vi.fn();
  render(<NewProjectForm includeWorkType onCreate={onCreate} onCancel={onCancel} />);
  return {onCreate, onCancel};
}

describe("T-1050 新建表单", () => {
  it("删除画幅和创作模式，作品形式可多选", () => {
    setup();
    expect(screen.queryByText(/横屏|竖屏|创作模式|AI 全流程创作/)).not.toBeInTheDocument();
    expect(screen.getByRole("group", {name: /作品形式.*可多选/})).toBeInTheDocument();
    expect(screen.getByRole("checkbox", {name: /^文章/})).toBeInTheDocument();
  });
  it("主题和至少一种形式必填，空选不能创建", async () => {
    const {onCreate} = setup();
    const submit = screen.getByRole("button", {name: "创建"});
    expect(submit).toBeDisabled();
    await userEvent.type(screen.getByRole("textbox", {name: "作品主题"}), "主题");
    expect(submit).toBeEnabled();
    await userEvent.click(screen.getByRole("checkbox", {name: /^视频/}));
    expect(submit).toBeDisabled();
    expect(onCreate).not.toHaveBeenCalled();
  });
  it("一次提交全部选择，按卡片顺序排列", async () => {
    const {onCreate} = setup();
    await userEvent.type(screen.getByRole("textbox", {name: "作品主题"}), "  主题  ");
    await userEvent.click(screen.getByRole("checkbox", {name: /^图文/}));
    await userEvent.click(screen.getByRole("checkbox", {name: /^文章/}));
    await userEvent.click(screen.getByRole("button", {name: "创建"}));
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({name: "主题", contentTypes: ["article", "image", "video"], enterAfterCreate: true}));
    expect(onCreate.mock.calls[0]![0]).not.toHaveProperty("orientation");
    expect(onCreate.mock.calls[0]![0]).not.toHaveProperty("creationMode");
  });
  it("复选卡支持键盘，Enter 切换而不提交", async () => {
    const {onCreate} = setup();
    const article = screen.getByRole("checkbox", {name: /^文章/});
    article.focus();
    await userEvent.keyboard("{Enter}");
    expect(article).toBeChecked();
    await userEvent.keyboard(" ");
    expect(article).not.toBeChecked();
    expect(onCreate).not.toHaveBeenCalled();
  });
  it("兼容平台取已选形式的并集，取消最后兼容形式时清空平台", async () => {
    setup();
    await userEvent.click(screen.getByRole("checkbox", {name: /^文章/}));
    const platform = screen.getByRole("combobox", {name: "发布目标"});
    await userEvent.selectOptions(platform, "wechatOfficialAccount");
    await userEvent.click(screen.getByRole("checkbox", {name: /^文章/}));
    expect(platform).toHaveValue("");
  });
  it("提交中所有输入和取消均禁用，避免重复提交", async () => {
    let resolve!: () => void;
    const pending = new Promise<void>(done => {resolve = done;});
    const onCreate = vi.fn(() => pending);
    setup(onCreate);
    await userEvent.type(screen.getByRole("textbox", {name: "作品主题"}), "主题");
    await userEvent.click(screen.getByRole("button", {name: "创建"}));
    expect(screen.getByRole("button", {name: "创建中…"})).toBeDisabled();
    expect(screen.getByRole("button", {name: "取消"})).toBeDisabled();
    expect(screen.getByRole("textbox", {name: "作品主题"})).toBeDisabled();
    resolve();
    await waitFor(() => expect(screen.getByRole("button", {name: "创建"})).toBeInTheDocument());
  });
  it("428 显示可操作账号引导并保留输入和勾选", async () => {
    setup(vi.fn().mockRejectedValue({code: "AccountRequiredError", status: 428}));
    await userEvent.type(screen.getByRole("textbox", {name: "作品主题"}), "保留主题");
    await userEvent.click(screen.getByRole("checkbox", {name: /^文章/}));
    await userEvent.click(screen.getByRole("button", {name: "创建"}));
    expect(await screen.findByRole("alert")).toHaveTextContent(/创作账号/);
    expect(screen.getByRole("link", {name: /添加或选择账号/})).toHaveAttribute("href", "/accounts");
    expect(screen.getByRole("textbox", {name: "作品主题"})).toHaveValue("保留主题");
    expect(screen.getByRole("checkbox", {name: /^文章/})).toBeChecked();
  });
  it("取消只触发取消回调", async () => {
    const {onCreate, onCancel} = setup();
    await userEvent.click(screen.getByRole("button", {name: "取消"}));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onCreate).not.toHaveBeenCalled();
  });
  it("已有项目新增单份作品仍保留单选", () => {
    render(<NewProjectForm includeWorkType multipleWorkTypes={false} onCreate={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole("radio", {name: /^文章/})).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", {name: /^文章/})).not.toBeInTheDocument();
  });
});
