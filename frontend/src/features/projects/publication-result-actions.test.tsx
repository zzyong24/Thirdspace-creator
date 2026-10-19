import * as React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ listCreativeCapabilities: vi.fn(), listResults: vi.fn(), listPublications: vi.fn(),
  listPublicationRevisions: vi.fn(), generateResult: vi.fn(), adoptResult: vi.fn(), getResult: vi.fn(),
  getAssetFileDownloadUrl: vi.fn() }));
vi.mock("@/lib/contract-client", () => ({ client: api }));

import { PublicationResultActions, publicationExpectedRevision } from "./publication-result-actions";

describe("发布内容卡片", () => {
  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset());
    api.listCreativeCapabilities.mockResolvedValue({ items: [] });
    api.listResults.mockResolvedValue({ items: [] });
    api.listPublications.mockResolvedValue([]);
    api.getAssetFileDownloadUrl.mockResolvedValue({ url: "http://example.test/publish-cover.png" });
  });

  it.each(["image", "video"] as const)("%s 空候选可渲染，不出现假生成按钮", async (outputType) => {
    render(<PublicationResultActions accountId="account" outputId="output" outputType={outputType} platform="xiaohongshu" />);
    await waitFor(() => expect(api.listResults).toHaveBeenCalled());
    expect(screen.getByRole("heading", { name: "发布内容" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "生成发布标题" })).toBeNull();
  });

  it("首次与已有修订分别携带明确的 CAS 目标", () => {
    expect(publicationExpectedRevision("output", "douyin", [], null)).toEqual({ owner: "publication", mode: "create",
      outputId: "output", platform: "douyin", expectedAbsent: true });
    expect(publicationExpectedRevision("output", "douyin", [{ id: "pub", contentOutputId: "output", platform: "douyin",
      currentRevisionId: "rev" }], { id: "rev", title: "", description: "", platformTags: [], revisionNumber: 1 }))
      .toEqual({ owner: "publication", mode: "existing", publicationId: "pub", revisionId: "rev" });
    expect(publicationExpectedRevision("output", "douyin", [
      { id: "one", contentOutputId: "output", platform: "douyin", currentRevisionId: "a" },
      { id: "two", contentOutputId: "output", platform: "douyin", currentRevisionId: "b" },
    ], null)).toBeNull();
  });

  it("真实发布封面候选预览后按 expectedAbsent 首次采纳", async () => {
    const image = { assetId: "asset-cover", assetFileId: "file-cover", order: 0, role: "cover" };
    const cover = { resultId: "result-cover", outputId: "output", targetPlatform: "xiaohongshu",
      kind: "publish_cover", status: "awaiting_confirmation", value: [image], createdAt: "2026-10-01T01:00:00Z" };
    api.listCreativeCapabilities.mockResolvedValue({ items: [{ outputType: "image", platform: "xiaohongshu", kind: "publish_cover", state: "supported" }] });
    api.listResults.mockResolvedValue({ items: [cover] });
    api.getResult.mockResolvedValue({ ...cover, status: "adopted" });
    api.adoptResult.mockResolvedValue({ status: "adopted" });
    render(<PublicationResultActions accountId="account" outputId="output" outputType="image" platform="xiaohongshu" />);
    await waitFor(() => expect(api.getAssetFileDownloadUrl).toHaveBeenCalledWith({ params: { assetId: "asset-cover", assetFileId: "file-cover" }, query: undefined, body: undefined }));
    fireEvent.click(await screen.findByRole("button", { name: "采纳这张发布封面" }));
    await waitFor(() => expect(api.adoptResult).toHaveBeenCalledWith({ params: { resultId: "result-cover" }, query: undefined,
      body: { expected: { owner: "publication", mode: "create", outputId: "output", platform: "xiaohongshu", expectedAbsent: true },
        editedValue: [image], clientRequestId: expect.any(String) } }));
  });

  it("已有发布修订使用当前 revisionId，dirty 禁用", async () => {
    const cover = { resultId: "result-cover", outputId: "output", targetPlatform: "douyin", kind: "publish_cover",
      status: "awaiting_confirmation", value: [{ assetId: "asset", assetFileId: "file", order: 0, role: "cover" }], createdAt: "2026-10-01T01:00:00Z" };
    api.listCreativeCapabilities.mockResolvedValue({ items: [{ outputType: "video", platform: "douyin", kind: "publish_cover", state: "supported" }] });
    api.listResults.mockResolvedValue({ items: [cover] });
    api.listPublications.mockResolvedValue([{ id: "pub", contentOutputId: "output", platform: "douyin", currentRevisionId: "rev" }]);
    api.listPublicationRevisions.mockResolvedValue([{ id: "rev", revisionNumber: 2, title: "旧标题", description: "", platformTags: [] }]);
    api.adoptResult.mockResolvedValue({ status: "adopted" });
    api.getResult.mockResolvedValue({ ...cover, status: "adopted" });
    const { rerender } = render(<PublicationResultActions accountId="account" outputId="output" outputType="video" platform="douyin" dirty />);
    expect(await screen.findByRole("button", { name: "重新生成发布封面" })).toBeDisabled();
    expect(await screen.findByRole("button", { name: "采纳这张发布封面" })).toBeDisabled();
    rerender(<PublicationResultActions accountId="account" outputId="output" outputType="video" platform="douyin" />);
    fireEvent.click(await screen.findByRole("button", { name: "采纳这张发布封面" }));
    await waitFor(() => expect(api.adoptResult).toHaveBeenCalledWith({ params: { resultId: "result-cover" }, query: undefined,
      body: { expected: { owner: "publication", mode: "existing", publicationId: "pub", revisionId: "rev" },
        editedValue: cover.value, clientRequestId: expect.any(String) } }));
  });

  it("同平台重复发布记录时禁用封面生成和采纳", async () => {
    const cover = { resultId: "result-cover", outputId: "output", targetPlatform: "douyin", kind: "publish_cover",
      status: "awaiting_confirmation", value: [{ assetId: "asset", assetFileId: "file", order: 0, role: "cover" }], createdAt: "2026-10-01T01:00:00Z" };
    api.listCreativeCapabilities.mockResolvedValue({ items: [{ outputType: "video", platform: "douyin", kind: "publish_cover", state: "supported" }] });
    api.listResults.mockResolvedValue({ items: [cover] });
    api.listPublications.mockResolvedValue([
      { id: "one", contentOutputId: "output", platform: "douyin", currentRevisionId: "a" },
      { id: "two", contentOutputId: "output", platform: "douyin", currentRevisionId: "b" },
    ]);
    render(<PublicationResultActions accountId="account" outputId="output" outputType="video" platform="douyin" />);
    expect(await screen.findByRole("button", { name: "重新生成发布封面" })).toBeDisabled();
    expect(await screen.findByRole("button", { name: "采纳这张发布封面" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("存在多份发布记录");
  });
});


describe("发布标签候选刷新与编辑保护", () => {
  const queued = { resultId: "queued-text", kind: "publish_tags", outputId: "output",
    targetPlatform: "xiaohongshu", status: "queued", value: null,
    createdAt: "2026-10-01T01:00:00Z", errorCode: null, appliedRules: "not_applied", sourceRefs: [] };
  const succeeded = { ...queued, status: "succeeded", value: ["内容运营", "创作者"] };

  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset());
    api.listCreativeCapabilities.mockResolvedValue({ items: [] });
    api.listResults.mockResolvedValue({ items: [queued] });
    api.listPublications.mockResolvedValue([]);
  });

  it("queued 空值随后成功时呈现真实可编辑候选", async () => {
    render(<PublicationResultActions accountId="account" outputId="output" outputType="image" platform="xiaohongshu" />);
    await waitFor(() => expect(api.listResults).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("textbox", { name: "发布标签候选" })).toBeNull();
    api.listResults.mockResolvedValue({ items: [succeeded] });
    fireEvent.click(screen.getByRole("button", { name: "刷新发布内容" }));
    expect(await screen.findByRole("textbox", { name: "发布标签候选" })).toHaveValue("内容运营、创作者");
  });

  it("刷新保留用户修改和主动清空，迟到的旧候选不污染较新编辑", async () => {
    api.listResults.mockResolvedValue({ items: [succeeded] });
    render(<PublicationResultActions accountId="account" outputId="output" outputType="image" platform="xiaohongshu" />);
    const field = await screen.findByRole("textbox", { name: "发布标签候选" });
    fireEvent.change(field, { target: { value: "用户确认的修改" } });
    fireEvent.click(screen.getByRole("button", { name: "刷新发布内容" }));
    await waitFor(() => expect(api.listResults).toHaveBeenCalledTimes(2));
    expect(field).toHaveValue("用户确认的修改");
    fireEvent.change(field, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "刷新发布内容" }));
    await waitFor(() => expect(api.listResults).toHaveBeenCalledTimes(3));
    expect(field).toHaveValue("");
    const newer = { ...succeeded, resultId: "newer-text", createdAt: "2026-10-01T02:00:00Z" };
    api.listResults.mockResolvedValue({ items: [newer] });
    fireEvent.click(screen.getByRole("button", { name: "刷新发布内容" }));
    await waitFor(() => expect(field).toHaveValue("内容运营、创作者"));
    fireEvent.change(field, { target: { value: "较新候选的修改" } });
    api.listResults.mockResolvedValue({ items: [succeeded] });
    fireEvent.click(screen.getByRole("button", { name: "刷新发布内容" }));
    await waitFor(() => expect(api.listResults).toHaveBeenCalledTimes(5));
    expect(field).toHaveValue("较新候选的修改");
  });
  it("已采纳结果缺少候选值时指向正式稿，不误报采纳未生效", async () => {
    api.listResults.mockResolvedValue({ items: [{ ...succeeded, status: "adopted", value: null }] });
    render(<PublicationResultActions accountId="account" outputId="output" outputType="image" platform="xiaohongshu" />);
    expect(await screen.findByText("已采纳")).toBeInTheDocument();
    expect(screen.queryByText(/候选内容尚未读到/)).toBeNull();
    expect(screen.getByText(/已保存到/)).toBeInTheDocument();
  });
  it.each([
    {code: "VERSION_CONFLICT", status: 409, expected: "请刷新后重新审阅"},
    {code: "ConflictError", status: 400, expected: "请刷新后重新审阅"},
    {code: null, status: 409, expected: "请刷新后重新审阅"},
    {code: "SOURCE_UNAVAILABLE", status: 409, expected: "请重新生成这一项"},
  ])("结构化错误 $code/$status 给出实际恢复动作并保留编辑", async (rejection) => {
    const onAdopt = vi.fn(async () => {});
    onAdopt.mockClear();
    api.listResults.mockResolvedValue({ items: [succeeded] });
    api.adoptResult.mockRejectedValue(Object.assign(new Error("internal schema stack failure"), {name: "HttpTransportError", code: rejection.code, status: rejection.status}));
    render(<PublicationResultActions accountId="account" outputId="output" outputType="image" platform="xiaohongshu" />);
    const field = await screen.findByRole("textbox", { name: "发布标签候选" });
    fireEvent.change(field, { target: { value: "保留这份用户修改" } });
    fireEvent.click(screen.getByRole("button", { name: "采纳发布标签" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(rejection.expected);
    expect(alert).toHaveTextContent("仍保留");
    expect(alert).not.toHaveTextContent(/schema|stack|系统有问题/);
    expect(field).toHaveValue("保留这份用户修改");
    expect(onAdopt).not.toHaveBeenCalled();
    expect(api.getResult).not.toHaveBeenCalled();
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
scopeBeforeEach(()=>{localStorage.removeItem("creatoros:current-group");localStorage.setItem("creatoros:current-account","account");});
scopeAfterEach(()=>{localStorage.removeItem("creatoros:current-group");localStorage.removeItem("creatoros:current-account");});
