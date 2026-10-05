import * as React from "react";
import {act, fireEvent, render, screen, waitFor} from "@testing-library/react";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";

const api = vi.hoisted(() => ({listArtifacts: vi.fn(), listArtifactVersions: vi.fn(), listCreativeCapabilities: vi.fn(),
  listResults: vi.fn(), getResult: vi.fn(), generateResult: vi.fn(), adoptResult: vi.fn(), createArtifactVersion: vi.fn()}));
vi.mock("@/lib/contract-client", () => ({client: api}));
vi.mock("./publication-result-actions", () => ({PublicationResultActions: () => <section aria-label="发布内容" />}));
import {VideoOutputWorkbench} from "./video-output-workbench";

const props = {projectId: "project", projectTitle: "项目", outputId: "output", outputTitle: "视频作品",
  accountId: "account", targetPlatform: "douyin"};
const queued = {resultId: "script-result", kind: "script", outputId: "output", status: "queued", value: null,
  createdAt: "2026-10-01T01:00:00Z", errorCode: null, sourceRefs: []};
const succeeded = {...queued, status: "succeeded", value: "模型脚本候选"};
const refresh = () => fireEvent.click(screen.getByRole("button", {name: "刷新能力与候选"}));

beforeEach(() => {
  Object.values(api).forEach(mock => mock.mockReset());
  api.listArtifacts.mockResolvedValue([{id: "artifact", projectId: "project", contentOutputId: "output", artifactType: "output_script", currentVersionId: "version-one"}]);
  api.listArtifactVersions.mockResolvedValue([{id: "version-one", artifactId: "artifact", versionNumber: 1, contentText: "正式脚本", createdAt: "2026-10-01T00:00:00Z"}]);
  api.listCreativeCapabilities.mockResolvedValue({items: [{outputType: "video", kind: "script", platform: "douyin", state: "supported"}]});
  api.listResults.mockResolvedValue({items: [succeeded]});
});
afterEach(() => {vi.useRealTimers();});

describe("视频候选刷新与编辑", () => {
  it("queued 空值更新成功后显示实际候选", async () => {
    api.listResults.mockResolvedValueOnce({items: [queued]});
    render(<VideoOutputWorkbench {...props} />);
    await waitFor(() => expect(api.listResults).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("textbox", {name: "脚本候选"})).toBeNull();
    refresh();
    expect(await screen.findByRole("textbox", {name: "脚本候选"})).toHaveValue("模型脚本候选");
  });
  it.each(["用户审阅修改的三段稿", ""])("重复读取同候选保留用户输入 %s", async value => {
    render(<VideoOutputWorkbench {...props} />);
    const field = await screen.findByRole("textbox", {name: "脚本候选"});
    fireEvent.change(field, {target: {value}});
    refresh();
    await waitFor(() => expect(api.listResults).toHaveBeenCalledTimes(2));
    expect(field).toHaveValue(value);
    expect(screen.getByRole("textbox", {name: "视频正式脚本"})).toHaveValue("正式脚本");
  });
  it("旧任务响应不能覆盖较新任务候选与已编辑输入", async () => {
    render(<VideoOutputWorkbench {...props} />);
    const field = await screen.findByRole("textbox", {name: "脚本候选"});
    const newer = {...succeeded, resultId: "newer-script", createdAt: "2026-10-01T02:00:00Z", value: "新任务的候选"};
    api.listResults.mockResolvedValueOnce({items: [newer]});
    refresh();
    await waitFor(() => expect(field).toHaveValue("新任务的候选"));
    fireEvent.change(field, {target: {value: "新任务的人工修改"}});
    refresh();
    await waitFor(() => expect(api.listResults).toHaveBeenCalledTimes(3));
    expect(field).toHaveValue("新任务的人工修改");
  });
  it("较早的刷新晚返回时不覆盖最新读到的任务", async () => {
    render(<VideoOutputWorkbench {...props} />);
    const field = await screen.findByRole("textbox", {name: "脚本候选"});
    let finish!: (value: {items: typeof succeeded[]}) => void;
    api.listResults.mockImplementationOnce(() => new Promise(resolve => {finish = resolve;}));
    refresh();
    api.listResults.mockResolvedValueOnce({items: [{...succeeded, resultId: "newer", createdAt: "2026-10-01T02:00:00Z", value: "新任务候选"}]});
    refresh();
    await waitFor(() => expect(field).toHaveValue("新任务候选"));
    fireEvent.change(field, {target: {value: "人工审阅后的稿件"}});
    await act(async () => finish({items: [succeeded]}));
    expect(field).toHaveValue("人工审阅后的稿件");
  });
  it("采纳提交人工修改后的候选，而非原模型稿", async () => {
    api.adoptResult.mockResolvedValue({status: "adopted"});
    api.getResult.mockResolvedValue({...succeeded, status: "adopted", value: null});
    render(<VideoOutputWorkbench {...props} />);
    const field = await screen.findByRole("textbox", {name: "脚本候选"});
    fireEvent.change(field, {target: {value: "人工审阅修改的三段稿"}});
    refresh();
    await waitFor(() => expect(api.listResults).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole("button", {name: "采纳到正式脚本"}));
    await waitFor(() => expect(api.adoptResult).toHaveBeenCalledWith({params: {resultId: "script-result"}, query: undefined,
      body: {expected: {owner: "output_script", versionId: "version-one"}, editedValue: "人工审阅修改的三段稿", clientRequestId: expect.any(String)}}));
  });
  it.each([
    {code: "VERSION_CONFLICT", status: 409, action: "请刷新后重新审阅"},
    {code: "ConflictError", status: 400, action: "请刷新后重新审阅"},
    {code: null, status: 409, action: "请刷新后重新审阅"},
    {code: "SOURCE_UNAVAILABLE", status: 409, action: "请重新生成这一项"},
  ])("采纳拒绝 $code/$status 时保留输入并说明恢复动作", async rejection => {
    api.adoptResult.mockRejectedValue(Object.assign(new Error("internal schema stack"), {code: rejection.code, status: rejection.status}));
    render(<VideoOutputWorkbench {...props} />);
    const field = await screen.findByRole("textbox", {name: "脚本候选"});
    fireEvent.change(field, {target: {value: "保留用户修改"}});
    fireEvent.click(screen.getByRole("button", {name: "采纳到正式脚本"}));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(rejection.action);
    expect(alert).toHaveTextContent("仍保留");
    expect(alert).not.toHaveTextContent(/schema|stack|系统有问题/);
    expect(field).toHaveValue("保留用户修改");
    expect(screen.getByRole("textbox", {name: "视频正式脚本"})).toHaveValue("正式脚本");
    expect(api.createArtifactVersion).not.toHaveBeenCalled();
  });
  it("慢轮询最多一个在途请求，完成后停止轮询", async () => {
    vi.useFakeTimers();
    api.listResults.mockResolvedValue({items: [queued]});
    let finish!: (value: typeof succeeded) => void;
    api.getResult.mockImplementation(() => new Promise(resolve => {finish = resolve;}));
    await act(async () => {render(<VideoOutputWorkbench {...props} />);});
    await act(async () => {await vi.advanceTimersByTimeAsync(1800);});
    expect(api.getResult).toHaveBeenCalledTimes(1);
    await act(async () => {await vi.advanceTimersByTimeAsync(7200);});
    expect(api.getResult).toHaveBeenCalledTimes(1);
    await act(async () => {finish(succeeded);});
    expect(screen.getByRole("textbox", {name: "脚本候选"})).toHaveValue("模型脚本候选");
    await act(async () => {await vi.advanceTimersByTimeAsync(7200);});
    expect(api.getResult).toHaveBeenCalledTimes(1);
  });
});
