import * as React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QuickCreateWork } from "./quick-create-work";

const mocks = vi.hoisted(() => ({
  push: vi.fn(), refresh: vi.fn(),
  createProject: vi.fn(), createOutput: vi.fn(), getAccount: vi.fn(), getIntelligenceItem: vi.fn(),
  graphic: vi.fn(), video: vi.fn(),
}));
vi.mock("next/navigation", () => ({useRouter: () => ({push: mocks.push, refresh: mocks.refresh})}));
vi.mock("@/lib/contract-client", () => ({client: {createProject: mocks.createProject, createOutput: mocks.createOutput, getAccount: mocks.getAccount, getIntelligenceItem: mocks.getIntelligenceItem}}));
vi.mock("./project-output-home", async importOriginal => ({...await importOriginal<typeof import("./project-output-home")>(),
  submitInitialGraphicBody: mocks.graphic, submitInitialVideoScript: mocks.video}));
beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.setItem("creatoros:current-account", "account-a");
  mocks.getAccount.mockResolvedValue({status: "active"});
  mocks.createProject.mockResolvedValue({id: "project-a", title: "主题"});
  mocks.createOutput.mockImplementation(async ({body}) => ({id: `${body.contentType}-a`, ...body}));
  mocks.graphic.mockResolvedValue("submitted");
  mocks.video.mockResolvedValue("submitted");
});
afterEach(() => {cleanup();window.localStorage.clear();});

describe("T-1050 直接创作入口", () => {
  it("三类多选创建真实作品，进入主脚本，不启动其他形式的模型", async () => {
    render(<QuickCreateWork accountId="account-a" />);
    await userEvent.type(screen.getByRole("textbox", {name: "作品主题"}), "主题");
    await userEvent.click(screen.getByRole("checkbox", {name: /^文章/}));
    await userEvent.click(screen.getByRole("checkbox", {name: /^图文/}));
    await userEvent.click(screen.getByRole("button", {name: "开始创作"}));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/projects/project-a"));
    expect(mocks.createProject).toHaveBeenCalledOnce();
    expect(mocks.createOutput.mock.calls.map(([input]) => input.body.contentType)).toEqual(["article", "image", "video"]);
    expect(mocks.graphic).not.toHaveBeenCalled();
    expect(mocks.video).not.toHaveBeenCalled();
  });
  it("图文和视频部分失败保留成功作品，重试后进入主脚本并保留选定来源", async () => {
    mocks.createOutput.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render(<QuickCreateWork accountId="account-a" />);
    await userEvent.type(screen.getByRole("textbox", {name: "作品主题"}), "主题");
    await userEvent.click(screen.getByRole("checkbox", {name: /^图文/}));
    await userEvent.click(screen.getByRole("button", {name: "开始创作"}));
    expect(await screen.findByRole("alert")).toHaveTextContent("图文未完成");
    expect(mocks.push).not.toHaveBeenCalled();
    const pendingBody = mocks.createOutput.mock.calls[0]![0].body;
    await userEvent.click(screen.getByRole("button", {name: "开始创作"}));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/projects/project-a"));
    expect(mocks.createProject).toHaveBeenCalledOnce();
    expect(mocks.createOutput).toHaveBeenCalledTimes(3);
    expect(mocks.createOutput.mock.calls[2]![0].body).toEqual(pendingBody);
    expect(mocks.graphic).not.toHaveBeenCalled();
    expect(mocks.video).not.toHaveBeenCalled();
  });
  it("来源正文进入主脚本项目的真实简介，不提前生成其他形式",async()=>{
    mocks.getIntelligenceItem.mockResolvedValue({item:{title:"选中的原文"},snapshots:[{capturedAt:"2026-10-03",safeExtract:"明确选中的参考正文"}],transcript:{status:"not_requested",text:null}});
    render(<QuickCreateWork sourceItemId="source-a" sourceType="article" sourceTitle="选中的原文" />);
    await userEvent.click(screen.getByRole("button",{name:"开始创作"}));
    await waitFor(()=>expect(mocks.push).toHaveBeenCalledWith("/projects/project-a"));
    expect(mocks.createProject.mock.calls[0]![0].body.brief).toContain("明确选中的参考正文");
    expect(mocks.graphic).not.toHaveBeenCalled();expect(mocks.video).not.toHaveBeenCalled();
  });

});

// T1062_COMPONENT_PORT_SEAM: 仅本文件既有业务spies；真实scope/epoch/signal/lifecycle不替换。
vi.mock("@/lib/creation-workspace-scope", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/creation-workspace-scope")>();
  const {client: componentPorts} = await import("@/lib/contract-client");
  type Workspace = ReturnType<typeof actual.createCreationWorkspace>;
  type Operation = ReturnType<Workspace["capture"]>;
  const views = new WeakMap<Workspace, Workspace>();
  function portClient(base: Operation["client"], capture: () => Operation): Operation["client"] {
    const methods = new Map<PropertyKey, unknown>();
    return new Proxy(base, {
      get(target, key, receiver) {
        const port = Reflect.get(componentPorts, key);
        const original = Reflect.get(target, key, receiver);
        if (typeof port !== "function") return original;
        if (!methods.has(key)) methods.set(key, async (...args: unknown[]) => {
          const operation = capture();
          operation.assertCurrent();
          try { return await Reflect.apply(Reflect.get(componentPorts, key), componentPorts, args); }
          finally { operation.assertCurrent(); }
        });
        return methods.get(key);
      },
    });
  }
  function view(workspace: Workspace): Workspace {
    const cached = views.get(workspace);
    if (cached) return cached;
    const client = portClient(workspace.client, () => workspace.capture());
    const capture = (): Operation => {
      const operation = workspace.capture();
      return Object.freeze({...operation, client: portClient(operation.client, () => operation)});
    };
    const proxy = new Proxy(workspace, {
      get(target, key) {
        if (key === "client") return client;
        if (key === "capture") return capture;
        // Reflect读取原对象getter，signal/epoch始终是原factory当前值；不spread workspace。
        return Reflect.get(target, key, target);
      },
    });
    views.set(workspace, proxy);
    return proxy;
  }
  return {
    ...actual,
    createCreationWorkspace: (...args: Parameters<typeof actual.createCreationWorkspace>) => view(actual.createCreationWorkspace(...args)),
    useCreationWorkspace: (scope: Parameters<typeof actual.useCreationWorkspace>[0]) => view(actual.useCreationWorkspace(scope)),
    useCreationClient: () => view(actual.useCreationWorkspace(actual.useCreationScope())).client,
  };
});
// T1062_COMPONENT_PORT_SEAM_END


// T1246 显式本例选择；不替换真实scope/epoch或生产default。
import {beforeEach as scopeBeforeEach,afterEach as scopeAfterEach} from "vitest";
scopeBeforeEach(()=>{localStorage.removeItem("creatoros:current-group");localStorage.setItem("creatoros:current-account","account-a");});
scopeAfterEach(()=>{localStorage.removeItem("creatoros:current-group");localStorage.removeItem("creatoros:current-account");});
