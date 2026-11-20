import * as React from "react";
import {afterEach, expect, it, vi} from "vitest";
import {cleanup, render, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {NewProjectForm} from "./new-project-form";

afterEach(cleanup);
it("统一表单只有文章图文两种形式，平台可选；切换形式保留主题并清除不兼容平台", async () => {
  const user = userEvent.setup(); const onCreate = vi.fn();
  render(<NewProjectForm includeWorkType multipleWorkTypes={false} onCreate={onCreate} onCancel={() => {}} defaultValues={{name:"保留主题",contentType:"image",targetPlatform:"xiaohongshu"}} />);
  expect(screen.getByRole("radio",{name:"图文"})).toBeChecked();
  expect(screen.queryByRole("radio",{name:"视频"})).not.toBeInTheDocument();
  await user.click(screen.getByRole("radio",{name:"文章"}));
  expect(screen.getByLabelText(/作品主题/)).toHaveValue("保留主题");
  expect(screen.getByLabelText("发布目标")).toHaveValue("");
  await user.click(screen.getByRole("button",{name:"创建"}));
  await waitFor(() => expect(onCreate).toHaveBeenCalledOnce());
  expect(onCreate.mock.calls[0][0]).toMatchObject({name:"保留主题",contentType:"article"});
  expect(onCreate.mock.calls[0][0].targetPlatform).toBeUndefined();
});
it("不跳转时仍可继续创建下一份作品，保持作品类型可继续提交", async () => {
  const user = userEvent.setup(); const onCreate = vi.fn();
  render(<NewProjectForm includeWorkType multipleWorkTypes={false} onCreate={onCreate} onCancel={() => {}} defaultValues={{name:"第一篇",contentType:"article",enterAfterCreate:false}} />);
  await user.click(screen.getByRole("button",{name:"创建"}));
  await waitFor(() => expect(onCreate).toHaveBeenCalledOnce());
  expect(screen.getByRole("checkbox",{name:"创建后进入工作区"})).not.toBeChecked();
  expect(screen.getByRole("radio",{name:"文章"})).toBeChecked();
  await user.type(screen.getByLabelText(/作品主题/), "下一篇");
  expect(screen.getByRole("button",{name:"创建"})).toBeEnabled();
  await user.click(screen.getByRole("button",{name:"创建"}));
  await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(2));
});
it("旧视频默认回到文章，提交失败仍保留主题及高级配置", async () => {
  const user=userEvent.setup();const onCreate=vi.fn().mockRejectedValue(new Error("保存失败"));
  render(<NewProjectForm includeWorkType multipleWorkTypes={false} onCreate={onCreate} onCancel={() => {}} defaultValues={{name:"当前稿",brief:"资料",contentType:"video",targetPlatform:"kuaishou"}} />);
  await user.click(screen.getByRole("button",{name:"创建"}));
  expect(await screen.findByRole("alert")).toBeVisible();
  expect(screen.getByLabelText(/作品主题/)).toHaveValue("当前稿");
  expect(screen.getByLabelText("发布目标")).toHaveValue("");
  expect(screen.getByRole("radio",{name:"文章"})).toBeChecked();
  expect(onCreate.mock.calls[0][0]).toMatchObject({brief:"资料"});
});
