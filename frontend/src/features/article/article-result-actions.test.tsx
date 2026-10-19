import * as React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ listCreativeCapabilities: vi.fn(), listResults: vi.fn(), generateResult: vi.fn(),
  getAssetFileDownloadUrl: vi.fn(), adoptResult: vi.fn(), getResult: vi.fn() }));
vi.mock("@/lib/contract-client", () => ({ client: api }));

import { ArticleResultActions } from "./article-result-actions";

const image = { assetId: "asset-cover", assetFileId: "file-cover", order: 0, role: "cover" };
const result = { resultId: "result-cover", outputId: "output-article", kind: "cover", status: "awaiting_confirmation",
  value: [image], createdAt: "2026-10-01T01:00:00Z", targetPlatform: null };

describe("文章封面单项结果", () => {
  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset());
    api.listCreativeCapabilities.mockResolvedValue({ items: [{ outputType: "article", platform: null, kind: "cover", state: "supported" }] });
    api.listResults.mockResolvedValue({ items: [] });
    api.getAssetFileDownloadUrl.mockResolvedValue({ url: "http://example.test/cover.png" });
    api.generateResult.mockResolvedValue(result);
    api.adoptResult.mockResolvedValue({ status: "adopted" });
    api.getResult.mockResolvedValue({ ...result, status: "adopted" });
  });

  it("无候选可打开，生成后只读预览真实文件并以文章版本 CAS 采纳", async () => {
    const onAdopt = vi.fn(async () => {});
    render(<ArticleResultActions accountId="account" outputId="output-article" currentVersionId="version-1"
      dirty={false} bodyReplaceBlocked={false} sections={[]} onAdopt={onAdopt} />);
    fireEvent.click(await screen.findByRole("button", { name: "生成封面" }));
    await waitFor(() => expect(api.getAssetFileDownloadUrl).toHaveBeenCalledWith({ params: { assetId: "asset-cover", assetFileId: "file-cover" }, query: undefined, body: undefined }));
    fireEvent.click(await screen.findByRole("button", { name: "采纳这张封面" }));
    await waitFor(() => expect(api.adoptResult).toHaveBeenCalled());
    expect(api.adoptResult).toHaveBeenCalledWith({ params: { resultId: "result-cover" }, query: undefined,
      body: { expected: { owner: "wechat_article", versionId: "version-1" }, editedValue: [image], clientRequestId: expect.any(String) } });
    expect(onAdopt).toHaveBeenCalled();
  });

  it("文章有未保存修改时不提供生成或采纳", async () => {
    api.listResults.mockResolvedValue({ items: [result] });
    render(<ArticleResultActions accountId="account" outputId="output-article" currentVersionId="version-1"
      dirty bodyReplaceBlocked={false} sections={[]} onAdopt={vi.fn()} />);
    expect(await screen.findByRole("button", { name: "重新生成封面" })).toBeDisabled();
    expect(await screen.findByRole("button", { name: "采纳这张封面" })).toBeDisabled();
  });

  it("按当前段落 ID 生成图卡，刷新后只在所属段落恢复并采纳", async () => {
    const card = { ...result, resultId: "result-card", kind: "image_card", targetSectionId: "section-b",
      value: [{ assetId: "asset-card", assetFileId: "file-card", order: 0, role: "card" }] };
    api.listCreativeCapabilities.mockResolvedValue({ items: [{ outputType: "article", platform: null, kind: "image_card", state: "supported" }] });
    api.listResults.mockResolvedValue({ items: [card] });
    api.generateResult.mockResolvedValue({ ...card, resultId: "result-a", targetSectionId: "section-a", status: "queued", value: null });
    api.getResult.mockResolvedValue({ ...card, status: "adopted" });
    const onAdopt = vi.fn(async () => {});
    render(<ArticleResultActions accountId="account" outputId="output-article" currentVersionId="version-1"
      dirty={false} bodyReplaceBlocked={false} sections={[{ sectionId: "section-a", heading: "第一段" },
        { sectionId: "section-b", heading: "第二段" }]} onAdopt={onAdopt} />);
    expect(await screen.findByRole("button", { name: "重新生成这段配图" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "生成这段配图" }));
    await waitFor(() => expect(api.generateResult).toHaveBeenCalledWith({ params: { outputId: "output-article" }, query: undefined,
      body: { kind: "image_card", targetSectionId: "section-a", clientRequestId: expect.any(String) } }));
    expect(screen.getByText("第 2 段 · 第二段")).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "采纳到这一段" }));
    await waitFor(() => expect(api.adoptResult).toHaveBeenCalledWith({ params: { resultId: "result-card" }, query: undefined,
      body: { expected: { owner: "wechat_article", versionId: "version-1" }, editedValue: card.value, clientRequestId: expect.any(String) } }));
    expect(onAdopt).toHaveBeenCalled();
  });
});


describe("摘要候选刷新与编辑保护", () => {
  const queued = { resultId: "queued-text", kind: "summary", outputId: "output-article",
    targetPlatform: null, status: "queued", value: null,
    createdAt: "2026-10-01T01:00:00Z", errorCode: null, appliedRules: "not_applied", sourceRefs: [] };
  const succeeded = { ...queued, status: "succeeded", value: "这是一份真实摘要" };

  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset());
    api.listCreativeCapabilities.mockResolvedValue({ items: [] });
    api.listResults.mockResolvedValue({ items: [queued] });
  });

  it("queued 空值随后成功时呈现真实可编辑候选", async () => {
    render(<ArticleResultActions accountId="account" outputId="output-article" currentVersionId="version-1" dirty={false} bodyReplaceBlocked={false} sections={[]} onAdopt={vi.fn()} />);
    await waitFor(() => expect(api.listResults).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("textbox", { name: "摘要候选" })).toBeNull();
    api.listResults.mockResolvedValue({ items: [succeeded] });
    fireEvent.click(screen.getByRole("button", { name: "刷新能力与候选" }));
    expect(await screen.findByRole("textbox", { name: "摘要候选" })).toHaveValue("这是一份真实摘要");
  });

  it("刷新保留用户修改和主动清空，迟到的旧候选不污染较新编辑", async () => {
    api.listResults.mockResolvedValue({ items: [succeeded] });
    render(<ArticleResultActions accountId="account" outputId="output-article" currentVersionId="version-1" dirty={false} bodyReplaceBlocked={false} sections={[]} onAdopt={vi.fn()} />);
    const field = await screen.findByRole("textbox", { name: "摘要候选" });
    fireEvent.change(field, { target: { value: "用户确认的修改" } });
    fireEvent.click(screen.getByRole("button", { name: "刷新能力与候选" }));
    await waitFor(() => expect(api.listResults).toHaveBeenCalledTimes(2));
    expect(field).toHaveValue("用户确认的修改");
    fireEvent.change(field, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "刷新能力与候选" }));
    await waitFor(() => expect(api.listResults).toHaveBeenCalledTimes(3));
    expect(field).toHaveValue("");
    const newer = { ...succeeded, resultId: "newer-text", createdAt: "2026-10-01T02:00:00Z" };
    api.listResults.mockResolvedValue({ items: [newer] });
    fireEvent.click(screen.getByRole("button", { name: "刷新能力与候选" }));
    await waitFor(() => expect(field).toHaveValue("这是一份真实摘要"));
    fireEvent.change(field, { target: { value: "较新候选的修改" } });
    api.listResults.mockResolvedValue({ items: [succeeded] });
    fireEvent.click(screen.getByRole("button", { name: "刷新能力与候选" }));
    await waitFor(() => expect(api.listResults).toHaveBeenCalledTimes(5));
    expect(field).toHaveValue("较新候选的修改");
  });
  it("已采纳结果缺少候选值时指向正式稿，不误报采纳未生效", async () => {
    api.listResults.mockResolvedValue({ items: [{ ...succeeded, status: "adopted", value: null }] });
    render(<ArticleResultActions accountId="account" outputId="output-article" currentVersionId="version-1" dirty={false} bodyReplaceBlocked={false} sections={[]} onAdopt={vi.fn()} />);
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
    render(<ArticleResultActions accountId="account" outputId="output-article" currentVersionId="version-1" dirty={false} bodyReplaceBlocked={false} sections={[]} onAdopt={onAdopt} />);
    const field = await screen.findByRole("textbox", { name: "摘要候选" });
    fireEvent.change(field, { target: { value: "保留这份用户修改" } });
    fireEvent.click(screen.getByRole("button", { name: "采纳摘要到文章" }));
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

// T1062_UNIT_SCOPE_FIXTURE: 显式合成单测选择；不是当前用户/生产default。
import {beforeEach as t1062ScopeBeforeEach, afterEach as t1062ScopeAfterEach} from "vitest";
t1062ScopeBeforeEach(() => {
  window.localStorage.removeItem("creatoros:current-group");
  window.localStorage.setItem("creatoros:current-account", "account");
});
t1062ScopeAfterEach(() => {
  window.localStorage.removeItem("creatoros:current-group");
  window.localStorage.removeItem("creatoros:current-account");
});
// T1062_UNIT_SCOPE_FIXTURE_END

describe('精简公众号保留旧候选交付',()=>{
 beforeEach(()=>{sessionStorage.clear();Object.values(api).forEach(mock=>mock.mockReset());api.listCreativeCapabilities.mockResolvedValue({items:[]});api.listResults.mockResolvedValue({items:[]});});
 const props={accountId:'account',outputId:'output-article',currentVersionId:'v1',dirty:false,bodyReplaceBlocked:false,sections:[],onAdopt:vi.fn()};
 it('无候选时不出现独立生成按钮',async()=>{const view=render(<ArticleResultActions {...props} resultsOnly/>);await waitFor(()=>expect(api.listResults).toHaveBeenCalled());expect(view.container).toBeEmptyDOMElement();});
 it('承接稿未保存时提供准备动作，旧文本候选只读可审阅',async()=>{api.listResults.mockResolvedValue({items:[{...result,kind:'summary',status:'succeeded',value:'可审阅的摘要'}]});const prepare=vi.fn();render(<ArticleResultActions {...props} dirty resultsOnly prepareDelivery={prepare}/>);expect(await screen.findByText('可审阅的摘要')).toBeVisible();expect(screen.getByRole('button',{name:'采纳摘要'})).toBeDisabled();expect(screen.queryAllByRole('textbox')).toHaveLength(0);fireEvent.click(screen.getByRole('button',{name:'保存承接稿后审阅候选'}));expect(prepare).toHaveBeenCalledOnce();});
});
