/**
 * Settings island wiring tests (Settings module Step 5).
 *
 * Proves the needs-backend controls call their mapped contract op and then
 * `router.refresh()` (the island → client.* → router.refresh seam). The
 * structural/order assertions live in
 * settings-page.test.tsx; here we only assert the mutation wiring.
 */

import * as React from "react";
import { act, cleanup, fireEvent, render as rtlRender, screen, waitFor } from "@testing-library/react";
import { ENDPOINTS } from "@creatoros/contract";
import { CURRENT_ACCOUNT_KEY, CURRENT_GROUP_KEY } from "@/lib/http-transport";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";


// 显式测试操作：legacy GET 不造 effectiveChoices；打开原配置必须真实选择来源、再点配置。
// 这里不点击来源保存，不发 routing PUT，不模拟官方模型调用。
function openSourceConfiguration(family:string,source='self') {
 const row=document.querySelector(`[data-model-family="${family}"]`);
 if(!row)return;
 const select=row.querySelector('select') as HTMLSelectElement;
 if(select.value!==source)fireEvent.change(select,{target:{value:source}});
 const button=row.querySelector('button[aria-label^="配置"]') as HTMLButtonElement;
 if(button&&button.getAttribute('aria-expanded')!=='true')fireEvent.click(button);
}
function modelAuthorityInTree(node:React.ReactNode):import('./settings-page').ModelAuthorityState|undefined {
 if(!React.isValidElement<Record<string,unknown>>(node))return undefined;
 if(node.props.modelAuthority)return node.props.modelAuthority as import('./settings-page').ModelAuthorityState;
 let found:import('./settings-page').ModelAuthorityState|undefined;
 React.Children.forEach(node.props.children as React.ReactNode,child=>{found??=modelAuthorityInTree(child);});return found;
}
function render(...args:Parameters<typeof rtlRender>) {
 const tree=rtlRender(...args),authority=modelAuthorityInTree(args[0]);
 const caps:Record<string,string>={text:'default',vision:'asset.classify',image:'image.generate',video:'video.generate',audio:'transcribe.audio',embed:'knowledge.search.embed'};
 for(const [family,capability] of Object.entries(caps))openSourceConfiguration(family,(document.querySelector(`[data-model-family="${family}"] select`) as HTMLSelectElement)?.value||((authority?.capabilities as Record<string,{authority?:string}>|undefined)?.[capability]?.authority==='channel'?'official':'self'));
 const textSource=(document.querySelector('[data-model-family="text"] select') as HTMLSelectElement)?.value||(authority?.capabilities?.default?.authority==='channel'?'official':'self');openSourceConfiguration('text',textSource);
 return tree;
}

const mockRouter = { refresh: vi.fn(), push: vi.fn(), replace: vi.fn() };
const mockOpenExternalUrl = vi.fn();
// [T-132] SettingsDialog 读 ?highlight;默认无 query(highlight 相关测试各自覆盖 mock)。
let mockSearchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
  useSearchParams: () => mockSearchParams,
}));
vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: (url: string) => mockOpenExternalUrl(url),
}));

const mockClient = {
  getModelRouting: vi.fn().mockResolvedValue({schemaVersion:1,revision:0,choices:null,legacyExecutionEngine:'pi',effectiveChoices:{},capabilities:[]}),
  putModelRouting: vi.fn(),
  getPreferences: vi.fn().mockResolvedValue({assistantExecutionEngine:"pi"}),
  patchPreferences: vi.fn((input: unknown): Promise<unknown> => Promise.resolve(input)),
  putModel: vi.fn((input: unknown): Promise<unknown> => Promise.resolve(input)),
  putChannelModelCredential: vi.fn(
    (input: unknown): Promise<unknown> => Promise.resolve(input),
  ),
  patchProfile: vi.fn((input: unknown): Promise<unknown> => Promise.resolve(input)),
  putStorage: vi.fn((input: unknown): Promise<unknown> => Promise.resolve(input)),
  // AccountBindingCard (T-032a): status pull on mount + loginDouyin on click.
  statusDouyin: vi.fn(
    (input: unknown): Promise<{ loggedIn: boolean; sourceReady?: boolean }> => {
      void input;
      return Promise.resolve({ loggedIn: false });
    },
  ),
  loginDouyin: vi.fn(
    (input: unknown): Promise<{ loggedIn: boolean }> => {
      void input;
      return Promise.resolve({ loggedIn: true });
    },
  ),
  // [T-377] 测试连接(settings.models.test):默认 ✓ 连通;失败态各测试自行覆盖。
  testModelConnection: vi.fn(
    (input: unknown): Promise<{
      ok: boolean;
      detail: string;
      status?: "ok" | "warn" | "fail";
    }> => {
      void input;
      return Promise.resolve({ ok: true, detail: "已发 1 token 真实补全,连通。" });
    },
  ),
};
vi.mock("@/lib/contract-client", () => ({
  client: {
    getModelRouting: () => mockClient.getModelRouting(),
    putModelRouting: (input:unknown) => mockClient.putModelRouting(input),
    getPreferences: () => mockClient.getPreferences(),
    getReportingStatus: () => Promise.resolve({consentVersion:1,diagnostics:{scope:"diagnostics",accountId:null,accountLabel:null,platform:null,accountActive:true,enabled:false,needsReconsent:false,consentEpoch:0,changedAt:null,queuedCount:0},accounts:[],preparationAvailable:true,uploadAvailable:false}),
    patchPreferences: (input: unknown) => mockClient.patchPreferences(input),
    putModel: (input: unknown) => mockClient.putModel(input),
    putChannelModelCredential: (input: unknown) =>
      mockClient.putChannelModelCredential(input),
    patchProfile: (input: unknown) => mockClient.patchProfile(input),
    putStorage: (input: unknown) => mockClient.putStorage(input),
    statusDouyin: (input: unknown) => mockClient.statusDouyin(input),
    loginDouyin: (input: unknown) => mockClient.loginDouyin(input),
    testModelConnection: (input: unknown) => mockClient.testModelConnection(input),
  },
}));

import { SettingsDialog } from "./settings-interactive-region";
import type { SettingsViewModel } from "./settings-page";

const VM: SettingsViewModel = {
  account: {
    displayName: "Zyong Zhu",
    email: "z@creatoros.local",
    initials: "ZZ",
    planLabel: "个人版",
    timezone: "Asia/Shanghai",
    locale: "zh-CN",
  },
  preferences: {
    defaultCreationMode: "guided",
    autosaveEnabled: true,
  },
  system: {
    theme: "system",
    density: "comfortable",
    notifications: true,
    locale: "zh-CN",
  },
  storage: {
    backend: "local" as const,
    rootPath: "~/CreatorOS/media",
    usedBytes: 18_000_000_000,
    totalBytes: 64_000_000_000,
    breakdown: [],
  },
  model: {
    capability: "default",
    provider: "anthropic",
    modelName: "claude-opus-4-8",
    baseUrl: "",
    apiFormat: "anthropic",
    hasSecret: false,
    temperature: 0.6,
  },
  multimodalModels: {
    image: {
      capability: "image.generate",
      provider: "",
      modelName: "",
      baseUrl: "",
      hasSecret: false,
    },
    video: {
      capability: "video.generate",
      provider: "",
      modelName: "",
      baseUrl: "",
      hasSecret: false,
    },
    audio: {
      capability: "transcribe.audio",
      provider: "",
      modelName: "",
      baseUrl: "",
      hasSecret: false,
    },
    vision: {
      capability: "asset.classify" as const,
      provider: "",
      modelName: "",
      baseUrl: "",
      hasSecret: false as const,
    },
    // [T-093] 知识库语义搜索 embedding(测试 fixture 默认未配置)。
    embed: {
      capability: "knowledge.search.embed" as const,
      provider: "",
      modelName: "",
      baseUrl: "",
      hasSecret: false as const,
    },
    // [T-084a] 联网搜索(测试 fixture 默认未配置)。
    search: {
      capability: "web.search" as const,
      provider: "",
      modelName: "",
      baseUrl: "",
      hasSecret: false as const,
    },
    // [T-239b] 备用对话模型(测试 fixture 默认未配置)。
    fallback: {
      capability: "chat.fallback" as const,
      provider: "",
      modelName: "",
      baseUrl: "",
      hasSecret: false as const,
    },
  },
  douyinAccount: { loggedIn: false },
};

beforeEach(async () => {
  mockClient.getPreferences.mockReset().mockResolvedValue({assistantExecutionEngine:"pi"});
  mockSearchParams = new URLSearchParams();
  mockRouter.refresh.mockReset();
  mockClient.patchPreferences.mockClear();
  mockClient.putModel.mockClear();
  mockClient.putChannelModelCredential.mockClear();
  mockClient.patchProfile.mockClear();
  mockClient.putStorage.mockClear();
  mockClient.statusDouyin.mockClear();
  mockClient.statusDouyin.mockResolvedValue({ loggedIn: false });
  mockClient.loginDouyin.mockClear();
  mockClient.loginDouyin.mockResolvedValue({ loggedIn: true });
  mockClient.testModelConnection.mockClear();
  mockClient.testModelConnection.mockResolvedValue({
    ok: true,
    detail: "已发 1 token 真实补全,连通。",
  });
  mockOpenExternalUrl.mockReset();
  const {loadAssistantEngine}=await import("@/features/copilot/assistant-engine");
  const {loadModelRouting}=await import("@/features/copilot/assistant-engine");
  mockClient.getModelRouting.mockResolvedValue({schemaVersion:1,revision:0,choices:null,legacyExecutionEngine:'pi',effectiveChoices:{},capabilities:[]});await loadModelRouting(true);
});

afterEach(() => {
  cleanup();
  delete (
    window as unknown as Record<string, unknown>
  ).__TAURI_INTERNALS__;
  vi.restoreAllMocks();
});

// SettingsDialog renders through a Radix Portal (mounted on document.body), so
// queries go through `document` rather than the render container. The dialog is
// open by default and every tab panel is force-mounted, so all controls are in
// the DOM regardless of the active tab.
function renderDialog(vm: SettingsViewModel = VM) {
  render(<SettingsDialog viewModel={vm} />);
  return document;
}

describe("[T-1236] 模型探针会话与配置生命周期", () => {
  type ProbeReply = {ok: boolean; detail: string; status?: "ok" | "warn" | "fail"};
  function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
    return {promise, resolve, reject};
  }
  function fixture() {
    const saved = ENDPOINTS.putModel.response.parse({
      id: "t1236-model", userId: "t1236-user", capability: "default",
      provider: "openai-compatible", modelName: "t1236-model-name", baseUrl: null,
      apiFormat: "openai_chat", settings: {}, secretReference: "opaque-reference",
      isDefault: true, hasSecret: true,
    });
    const initial: SettingsViewModel = {...VM, model: {
      capability: saved.capability, provider: saved.provider, modelName: saved.modelName,
      baseUrl: "", apiFormat: saved.apiFormat, hasSecret: false, temperature: 0.6,
    }};
    const echoed = {...initial, model: {...initial.model, hasSecret: true}};
    return {saved, initial, echoed};
  }
  function element(slot: string) { return document.querySelector(`[data-slot="${slot}"]`)!; }
  function category(id: string) { fireEvent.click(document.querySelector(`[role="tab"][data-tab-id="${id}"]`)!); }
  async function scopeChanged(group: string, account: string | null = null) {
    localStorage.setItem(CURRENT_GROUP_KEY, group);
    if(account) localStorage.setItem(CURRENT_ACCOUNT_KEY, account);
    else localStorage.removeItem(CURRENT_ACCOUNT_KEY);
    window.dispatchEvent(new CustomEvent("creatoros:accounts-changed", {detail: {groupId: group, source: "external", routeRefreshScheduled: true}}));
    const {loadModelRouting}=await import("@/features/copilot/assistant-engine");await loadModelRouting(true);if(localStorage.getItem(CURRENT_GROUP_KEY)===group)openSourceConfiguration("text","self");
  }
  let previousGroup: string | null;
  let previousAccount: string | null;
  beforeEach(async () => {
    previousGroup = localStorage.getItem(CURRENT_GROUP_KEY);
    previousAccount = localStorage.getItem(CURRENT_ACCOUNT_KEY);
    localStorage.setItem(CURRENT_GROUP_KEY, "t1236-group-a");
    localStorage.removeItem(CURRENT_ACCOUNT_KEY);
    const {loadModelRouting}=await import("@/features/copilot/assistant-engine");await loadModelRouting(true);
  });
  afterEach(() => {
    if(previousGroup === null) localStorage.removeItem(CURRENT_GROUP_KEY);
    else localStorage.setItem(CURRENT_GROUP_KEY, previousGroup);
    if(previousAccount === null) localStorage.removeItem(CURRENT_ACCOUNT_KEY);
    else localStorage.setItem(CURRENT_ACCOUNT_KEY, previousAccount);
  });
  async function startProbe(echo = true) {
    const data = fixture();
    const probe = deferred<ProbeReply>();
    mockClient.putModel.mockResolvedValueOnce(data.saved);
    mockClient.testModelConnection.mockImplementationOnce(() => probe.promise);
    const tree = render(<SettingsDialog viewModel={data.initial} />);
    category("models");
    fireEvent.change(element("model-secret-input"), {target: {value: "t1236-neutral-key"}});
    fireEvent.click(element("model-test-connection"));
    await waitFor(() => expect(mockClient.testModelConnection).toHaveBeenCalledTimes(1), {timeout: 120000});
    if(echo) tree.rerender(<SettingsDialog viewModel={data.echoed} />);
    return {...data, tree, probe};
  }

  it.each([
    {status: "ok" as const, ok: true}, {status: "fail" as const, ok: false}, {status: "warn" as const, ok: true},
  ])("同值保存回显后保留真实$status，不改结果分类", async ({status, ok}) => {
    const run = await startProbe();
    await act(async () => { run.probe.resolve({status, ok, detail: `t1236 ${status} detail`}); });
    expect(element("model-test-result")).toHaveAttribute("data-status", status);
    expect(element("model-test-result")).toHaveTextContent(`t1236 ${status} detail`);
    expect(element("model-secret-input")).toHaveValue("");
    expect(mockClient.putModel).toHaveBeenCalledTimes(1);
    expect(mockClient.testModelConnection).toHaveBeenCalledTimes(1);
  }, 240000);

  it("未知请求异常保真实失败原因且不自动重发", async () => {
    const run = await startProbe();
    await act(async () => { run.probe.reject(new Error("t1236 transport unknown")); });
    expect(element("model-test-result")).toHaveAttribute("data-status", "fail");
    expect(element("model-test-result")).toHaveTextContent("t1236 transport unknown");
    expect(mockClient.testModelConnection).toHaveBeenCalledTimes(1);
  }, 240000);

  it("保存失败保真实原因、probe0、没有虚构连通", async () => {
    const data = fixture();
    mockClient.putModel.mockRejectedValueOnce(new Error("t1236 save rejected"));
    render(<SettingsDialog viewModel={data.initial} />);
    category("models");
    fireEvent.click(element("model-test-connection"));
    await waitFor(() => expect(document.querySelector('[role="alert"]')).toHaveTextContent("t1236 save rejected"), {timeout: 120000});
    expect(mockClient.testModelConnection).not.toHaveBeenCalled();
    expect(element("model-test-result")).toHaveAttribute("data-status", "fail");
  }, 240000);

  it("保存回显早于beforeTest返回也继续同次probe", async () => {
    const data = fixture();
    mockClient.putModel.mockResolvedValueOnce(data.saved);
    const tree = render(<SettingsDialog viewModel={data.initial} />);
    category("models");
    mockRouter.refresh.mockImplementationOnce(() => tree.rerender(<SettingsDialog viewModel={data.echoed} />));
    fireEvent.click(element("model-test-connection"));
    await waitFor(() => expect(element("model-test-result")).toHaveAttribute("data-status", "ok"), {timeout: 120000});
    expect(mockClient.putModel).toHaveBeenCalledTimes(1);
    expect(mockClient.testModelConnection).toHaveBeenCalledTimes(1);
  }, 240000);

  it("hidden分类不取消同scope会话，返回可见真实结果", async () => {
    const run = await startProbe();
    category("account");
    expect(document.querySelector('[data-slot="settings-panel"][data-tab-id="models"]')).toHaveAttribute("hidden");
    await act(async () => { run.probe.resolve({ok: true, detail: "t1236 hidden completion"}); });
    category("models");
    expect(element("model-test-result")).toBeVisible();
    expect(element("model-test-result")).toHaveTextContent("t1236 hidden completion");
    expect(mockClient.putModel).toHaveBeenCalledTimes(1);
    expect(mockClient.testModelConnection).toHaveBeenCalledTimes(1);
  }, 240000);

  it.each([true, false])("group-only切组拒绝旧%s结果（account都null）", async ok => {
    const run = await startProbe();
    category("account");
    await act(async () => {await scopeChanged("t1236-group-b");});
    await act(async () => { run.probe.resolve({ok, detail: "t1236 old group result"}); });
    category("models");
    expect(document.querySelector('[data-slot="model-test-result"]')).toBeNull();
    expect(mockClient.testModelConnection).toHaveBeenCalledTimes(1);
  }, 240000);

  it("切账号拒绝迟到结果", async () => {
    const run = await startProbe();
    await act(async () => {await scopeChanged("t1236-group-a", "t1236-account-b");});
    await act(async () => { run.probe.resolve({ok: true, detail: "old account"}); });
    expect(document.querySelector('[data-slot="model-test-result"]')).toBeNull();
  }, 240000);

  it("真正卸载后旧结果不落在重新打开的Dialog", async () => {
    const run = await startProbe();
    run.tree.unmount();
    render(<SettingsDialog viewModel={run.echoed} />);
    category("models");
    await act(async () => { run.probe.resolve({ok: true, detail: "unmounted response"}); });
    expect(document.querySelector('[data-slot="model-test-result"]')).toBeNull();
    expect(mockClient.testModelConnection).toHaveBeenCalledTimes(1);
  }, 240000);

  it("外部配置不同仍按原key重置表单并拒绝旧结果", async () => {
    const run = await startProbe();
    run.tree.rerender(<SettingsDialog viewModel={{...run.echoed, model: {...run.echoed.model, modelName: "t1236-external-model"}}} />);
    await act(async () => { run.probe.resolve({ok: true, detail: "old configuration"}); });
    expect(element("model-name-input")).toHaveValue("t1236-external-model");
    expect(document.querySelector('[data-slot="model-test-result"]')).toBeNull();
  }, 240000);

  it.each(["model-name-input", "model-secret-input", "model-provider-input", "model-base-url-input", "model-temperature-input"])("用户编辑%s后旧反馈失效", async slot => {
    const run = await startProbe();
    fireEvent.change(element(slot), {target: {value: slot === "model-temperature-input" ? "0.8" : "t1236-user-edited"}});
    await act(async () => { run.probe.resolve({ok: true, detail: "old draft result"}); });
    expect(document.querySelector('[data-slot="model-test-result"]')).toBeNull();
    expect(mockClient.testModelConnection).toHaveBeenCalledTimes(1);
  }, 240000);

  it("双击pending按钮只有一次保存与probe", async () => {
    const run = await startProbe();
    fireEvent.click(element("model-test-connection"));
    fireEvent.click(element("model-test-connection"));
    await act(async () => { run.probe.resolve({ok: true, detail: "single request"}); });
    expect(mockClient.putModel).toHaveBeenCalledTimes(1);
    expect(mockClient.testModelConnection).toHaveBeenCalledTimes(1);
  }, 240000);

  it("保存pending时group改变，完成保存后不向新scope发probe", async () => {
    const data = fixture();
    const save = deferred<unknown>();
    mockClient.putModel.mockImplementationOnce(() => save.promise);
    render(<SettingsDialog viewModel={data.initial} />);
    category("models");
    fireEvent.click(element("model-test-connection"));
    await waitFor(() => expect(mockClient.putModel).toHaveBeenCalledTimes(1), {timeout: 120000});
    await act(async () => {await scopeChanged("t1236-group-b");});
    await act(async () => { save.resolve(data.saved); });
    expect(mockClient.testModelConnection).not.toHaveBeenCalled();
    expect(document.querySelector('[data-slot="model-test-result"]')).toBeNull();
    expect(mockRouter.refresh).not.toHaveBeenCalled();
  }, 240000);

  it("空密钥仅保存保原值且probe0", async () => {
    const data = fixture();
    mockClient.putModel.mockResolvedValueOnce(data.saved);
    render(<SettingsDialog viewModel={data.echoed} />);
    category("models");
    fireEvent.click(element("model-save"));
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalledTimes(1), {timeout: 120000});
    expect(mockClient.putModel).toHaveBeenCalledWith(expect.objectContaining({body: expect.objectContaining({secret: undefined})}));
    expect(element("model-secret-input")).toHaveValue("");
    expect(element("model-secret-status")).toHaveTextContent("已配置");
    expect(mockClient.testModelConnection).not.toHaveBeenCalled();
  }, 240000);

  it("保存pending时切组，旧保存失败不归新scope表单", async () => {
    const data = fixture();
    const save = deferred<unknown>();
    mockClient.putModel.mockImplementationOnce(() => save.promise);
    render(<SettingsDialog viewModel={data.initial} />);
    category("models");
    fireEvent.click(element("model-test-connection"));
    await waitFor(() => expect(mockClient.putModel).toHaveBeenCalledTimes(1), {timeout: 120000});
    await act(async () => {await scopeChanged("t1236-group-b");});
    await act(async () => { save.reject(new Error("t1236 previous scope save error")); });
    expect(document.querySelector('[role="alert"]')).toBeNull();
    expect(document.querySelector('[data-slot="model-test-result"]')).toBeNull();
    expect(mockClient.testModelConnection).not.toHaveBeenCalled();
    expect(mockRouter.refresh).not.toHaveBeenCalled();
  }, 240000);

  it("无广播的实际group变化也拒绝迟到probe", async () => {
    const run = await startProbe();
    localStorage.setItem(CURRENT_GROUP_KEY, "t1236-group-b");
    await act(async () => { run.probe.resolve({ok: true, detail: "no event old scope"}); });
    expect(document.querySelector('[data-slot="model-test-result"]')).toBeNull();
  }, 240000);

  it("旧finally不会清新scope的正在测试或写入旧结果", async () => {
    const run = await startProbe();
    await act(async () => {await scopeChanged("t1236-group-b");});
    const next = deferred<ProbeReply>();
    mockClient.putModel.mockResolvedValueOnce(run.saved);
    mockClient.testModelConnection.mockImplementationOnce(() => next.promise);
    fireEvent.click(element("model-test-connection"));
    await waitFor(() => expect(mockClient.testModelConnection).toHaveBeenCalledTimes(2), {timeout: 120000});
    await act(async () => { run.probe.resolve({ok: true, detail: "old scope response"}); });
    expect(element("model-test-connection")).toBeDisabled();
    expect(element("model-test-connection")).toHaveTextContent("测试中");
    expect(document.querySelector('[data-slot="model-test-result"]')).toBeNull();
    await act(async () => { next.resolve({ok: true, detail: "new scope response"}); });
    expect(element("model-test-result")).toHaveTextContent("new scope response");
    expect(mockClient.putModel).toHaveBeenCalledTimes(2);
  }, 240000);

  it("当前authority变受管时旧本地结果不可回写", async () => {
    const run = await startProbe();
    run.tree.rerender(<SettingsDialog viewModel={run.echoed} modelAuthority={{
      authority: "channel", outcome: "configured", action: "当前权益模型",
      capabilities: {default: {capability: "default", authority: "channel",
        serviceId: "t1236-channel", serviceName: "测试权益", provider: "openai-compatible",
        modelName: "managed-model", model: "managed-model", baseUrl: "https://example.invalid/v1", hasSecret: true}},
    }} />);
    openSourceConfiguration("text","official");
    await act(async () => { run.probe.resolve({ok: true, detail: "old local result"}); });
    const active=document.querySelector('[data-slot="model-source-configuration"]:not([hidden])');
    expect(active?.querySelector('[data-slot="model-test-result"]')).toBeNull();
    expect(active?.querySelector('[data-slot="model-configuration-card"]')).toBeNull();
    expect(mockClient.testModelConnection).toHaveBeenCalledTimes(1);
  }, 240000);

  it("完成后真实PUT回显仍保原结果", async () => {
    const run = await startProbe(false);
    await act(async () => { run.probe.resolve({ok: true, detail: "completed before echo"}); });
    expect(element("model-test-result")).toHaveTextContent("completed before echo");
    run.tree.rerender(<SettingsDialog viewModel={run.echoed} />);
    expect(element("model-test-result")).toHaveTextContent("completed before echo");
    expect(element("model-secret-input")).toHaveValue("");
  }, 240000);

  it("预设编辑使旧配置结果失效", async () => {
    const run = await startProbe();
    const user = userEvent.setup();
    await user.click(element("model-preset-trigger"));
    const preset = await waitFor(() => {
      const node = document.querySelector('[data-slot="model-preset-item-deepseek"]');
      expect(node).not.toBeNull(); return node!;
    }, {timeout: 120000});
    await user.click(preset);
    await act(async () => { run.probe.resolve({ok: true, detail: "old preset result"}); });
    expect(document.querySelector('[data-slot="model-test-result"]')).toBeNull();
    expect(element("model-base-url-input")).toHaveValue("https://api.deepseek.com");
  }, 240000);

  it("接口协议编辑使旧探针结果失效", async () => {
    const run = await startProbe();
    const user = userEvent.setup();
    await user.click(element("model-api-format-trigger"));
    const option = await waitFor(() => screen.getByRole("option", {name: /Anthropic/}), {timeout: 120000});
    await user.click(option);
    await act(async () => { run.probe.resolve({ok: true, detail: "old protocol result"}); });
    expect(document.querySelector('[data-slot="model-test-result"]')).toBeNull();
    expect(mockClient.testModelConnection).toHaveBeenCalledTimes(1);
  }, 240000);

  it("实际scope ABA后旧保存仍不refresh、不probe", async () => {
    const data = fixture();
    const save = deferred<unknown>();
    mockClient.putModel.mockImplementationOnce(() => save.promise);
    render(<SettingsDialog viewModel={data.initial} />);
    category("models");
    fireEvent.click(element("model-test-connection"));
    await waitFor(() => expect(mockClient.putModel).toHaveBeenCalledTimes(1), {timeout: 120000});
    await act(async () => { await scopeChanged("t1236-group-b"); await scopeChanged("t1236-group-a"); });
    await act(async () => { save.resolve(data.saved); });
    expect(mockRouter.refresh).not.toHaveBeenCalled();
    expect(mockClient.testModelConnection).not.toHaveBeenCalled();
    expect(document.querySelector('[role="alert"]')).toBeNull();
    expect(document.querySelector('[data-slot="model-test-result"]')).toBeNull();
  }, 240000);

  it("实际scope ABA后旧probe也不能恢复连通结果", async () => {
    const run = await startProbe();
    await act(async () => { await scopeChanged("t1236-group-b"); await scopeChanged("t1236-group-a"); });
    await act(async () => { run.probe.resolve({ok: true, detail: "obsolete ABA result"}); });
    expect(document.querySelector('[data-slot="model-test-result"]')).toBeNull();
    expect(mockClient.putModel).toHaveBeenCalledTimes(1);
    expect(mockClient.testModelConnection).toHaveBeenCalledTimes(1);
  }, 240000);
});

describe("Settings island wiring (needs-backend → op + refresh)", () => {
  it("打开设置不接管根布局的主题", async () => {
    document.documentElement.classList.remove("dark");
    localStorage.setItem("creatoros.settings.theme", "system");
    vi.spyOn(window, "matchMedia").mockReturnValue({matches:true,addEventListener:vi.fn(),removeEventListener:vi.fn()} as unknown as MediaQueryList);
    renderDialog();
    await new Promise(resolve=>setTimeout(resolve,20));
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    localStorage.removeItem("creatoros.settings.theme");
  });
  describe("[T-733] 本地文本模型状态", () => {
    it("本地文本模型已保存可用时不渲染渠道权威状态", () => {
      render(
        <SettingsDialog
          viewModel={{
            ...VM,
            model: { ...VM.model, hasSecret: true },
          }}
          modelAuthority={{
            authority: "local",
            outcome: "security_error",
            action: "本地模型正在使用 · 渠道配置安全校验未通过",
            capabilities: {},
            services: [],
          }}
        />,
      );

      expect(
        document.querySelector('[data-slot="model-authority-status"]'),
      ).toBeNull();
      expect(document.body.textContent).not.toContain(
        "渠道配置安全校验未通过",
      );
      expect(document.body.textContent).not.toContain(
        "你可以继续编辑本地配置，保存后会作为当前或备用配置使用。",
      );
    });
    it("本地配置缺项保持可操作，来源状态未取得不伪造 ready",()=>{
      render(<SettingsDialog viewModel={VM} modelAuthority={{authority:'local',outcome:'not_configured',action:'请配置本地文本模型',capabilities:{},services:[]}}/>);
      expect(document.querySelector('[data-slot="model-source-status-text"]')).toHaveTextContent('状态未核实');
      expect(document.querySelector('[data-slot="model-configuration-card"]')).not.toBeNull();
      expect(document.querySelector('[data-slot="model-save"]')).toBeEnabled();
    });
    it("只有用户选择官方才打开官方缺项说明，不以渠道全局状态接管 self",()=>{
      render(<SettingsDialog viewModel={{...VM,model:{...VM.model,hasSecret:true}}} modelAuthority={{authority:'channel',outcome:'configured',action:'模型已由当前权益配置',capabilities:{},services:[]}}/>);
      expect(document.querySelector('[data-slot="model-configuration-card"]')).not.toBeNull();openSourceConfiguration('text','official');
      expect(document.querySelector('[data-slot="model-source-configuration"]:not([hidden])')).toHaveTextContent('当前官方配置尚未取得');
      expect(document.querySelector('[data-slot="model-source-configuration"]:not([hidden]) [data-slot="model-secret-input"]')).toBeNull();
    });
  });

  it("[T-645] 用户自行填写的模型访问密钥按 service 保存且不展示技术服务名", async () => {
    render(
      <SettingsDialog
        viewModel={VM}
        modelAuthority={{
          authority: "channel",
          outcome: "configured",
          action: "渠道已接管 1/4 类模型，其余由你配置",
          capabilities: {},
          services: [
            {
              serviceId: "relay-a",
              serviceName: "统一中转",
              credentialSource: "user_input",
              hasSecret: false,
              portalUrl: null,
              purchaseUrl: null,
              rechargeUrl: "https://growth.example/recharge",
              helpUrl: null,
            },
          ],
        }}
      />,
    );
    fireEvent.click(screen.getByRole("tab", { name: "模型配置" }));
    const input = document.querySelector(
      '[data-slot="channel-model-service-secret"]',
    ) as HTMLInputElement;
    expect(input).not.toBeNull();
    await userEvent.type(input, "sk-local");
    fireEvent.click(screen.getByRole("button", { name: "保存密钥" }));
    await waitFor(() =>
      expect(mockClient.putChannelModelCredential).toHaveBeenCalledWith({
        params: { serviceId: "relay-a" },
        query: undefined,
        body: { secret: "sk-local" },
      }),
    );
    const body = mockClient.putChannelModelCredential.mock.calls[0]?.[0] as
      | Record<string, unknown>
      | undefined;
    expect(JSON.stringify(body)).not.toContain("scopeId");
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalled());
    expect(document.body.textContent).not.toContain("统一中转");
  });

  it("[T-715] 受管模型只显示 AI 额度入口，安全打开 fragment 且不暴露服务技术信息", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            openUrl: "https://growth.example/credits/connect#ONE_TIME_123",
            expiresAt: "2026-08-06T12:10:00.000Z",
            expiresIn: 600,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    render(
      <SettingsDialog
        viewModel={VM}
        modelAuthority={{
          authority: "channel",
          outcome: "configured",
          action: "模型已由当前权益配置",
          capabilities: {
            default: {
              capability: "default",
              authority: "channel",
              serviceId: "omnihi-main",
              serviceName: "OmniHi Relay",
              provider: "openai-compatible",
              modelName: "MiniMax M3",
              model: "minimax-m3",
              baseUrl: "https://secret-provider.example/v1",
              hasSecret: true,
            },
          },
          services: [
            {
              serviceId: "omnihi-main",
              serviceName: "OmniHi Relay",
              credentialSource: "activation_managed",
              hasSecret: true,
              portalUrl: "https://secret-provider.example",
              purchaseUrl: null,
              rechargeUrl: null,
              helpUrl: null,
            },
          ],
        }}
      />,
    );
    fireEvent.click(screen.getByRole("tab", { name: "模型配置" }));
    expect(screen.getByText("AI 额度与消耗")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("OmniHi");
    expect(document.body.textContent).not.toContain("openai-compatible");
    expect(document.body.textContent).not.toContain("secret-provider");
    expect(document.body.textContent).not.toContain("受管 Key");

    await userEvent.click(
      screen.getByRole("button", { name: "查看 AI 额度与消耗" }),
    );
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/v1/local/ai-credits/connect",
        { method: "POST", headers: {} },
      ),
    );
    await waitFor(() =>
      expect(mockOpenExternalUrl).toHaveBeenCalledWith(
        "https://growth.example/credits/connect#ONE_TIME_123",
      ),
    );
  });
  it("[T1278/T679] official ASR缺项不要求手填官方Key，self/local仍可显式选择",()=>{
    render(<SettingsDialog viewModel={VM} modelAuthority={{authority:'channel',outcome:'configured',action:'当前权益缺少ASR',capabilities:{},services:[]}}/>);
    fireEvent.click(screen.getByRole('tab',{name:'模型配置'}));openSourceConfiguration('audio','official');
    const official=document.querySelector('[data-slot="model-source-configuration"]:not([hidden])');expect(official).toHaveTextContent('当前官方配置尚未取得');expect(official?.querySelector('[data-slot="multimodal-audio-secret-input"]')).toBeNull();
    expect(screen.getByRole('button',{name:'重新校验激活权益并重试配置同步'})).toBeInTheDocument();
    openSourceConfiguration('audio','self');expect(document.querySelector('[data-slot="model-source-configuration"]:not([hidden]) [data-slot="multimodal-audio-card"]')).not.toBeNull();
    openSourceConfiguration('audio','local');expect(document.querySelector('[data-slot="model-source-configuration"]:not([hidden])')).toHaveTextContent('本地 Whisper');expect(mockClient.putModel).not.toHaveBeenCalled();expect(mockClient.putModelRouting).not.toHaveBeenCalled();
  });

  it("[T-715] 即使本地接口异常返回管理端地址，也不会打开任何非用户额度页面", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            openUrl: "https://growth.example/admin/credits#ONE_TIME_123",
            expiresAt: "2026-08-06T12:10:00.000Z",
            expiresIn: 600,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    render(
      <SettingsDialog
        viewModel={VM}
        modelAuthority={{
          authority: "channel",
          outcome: "configured",
          action: "模型已由当前权益配置",
          capabilities: {},
          services: [
            {
              serviceId: "omnihi-main",
              serviceName: "hidden-service",
              credentialSource: "activation_managed",
              hasSecret: true,
              portalUrl: null,
              purchaseUrl: null,
              rechargeUrl: null,
              helpUrl: null,
            },
          ],
        }}
      />,
    );
    fireEvent.click(screen.getByRole("tab", { name: "模型配置" }));
    await userEvent.click(
      screen.getByRole("button", { name: "查看 AI 额度与消耗" }),
    );
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/v1/local/ai-credits/connect",
        { method: "POST", headers: {} },
      ),
    );
    await waitFor(() =>
      expect(screen.getByText("额度页面地址未通过安全校验")).toBeInTheDocument(),
    );
    expect(mockOpenExternalUrl).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain("管理员端");
    expect(document.body.textContent).not.toContain("渠道端");
  });

  it("[T-715] 已绑定后允许固定打开 Growth 用户端 launch", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            openUrl: "https://growth.example/credits/launch#PORTAL_CODE_123",
            expiresAt: "2026-08-06T12:01:00.000Z",
            expiresIn: 60,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    render(
      <SettingsDialog
        viewModel={VM}
        modelAuthority={{
          authority: "channel",
          outcome: "configured",
          action: "模型已由当前权益配置",
          capabilities: {},
          services: [
            {
              serviceId: "managed-service",
              serviceName: "hidden-service",
              credentialSource: "activation_managed",
              hasSecret: true,
              portalUrl: null,
              purchaseUrl: null,
              rechargeUrl: null,
              helpUrl: null,
            },
          ],
        }}
      />,
    );
    fireEvent.click(screen.getByRole("tab", { name: "模型配置" }));
    await userEvent.click(
      screen.getByRole("button", { name: "查看 AI 额度与消耗" }),
    );
    await waitFor(() =>
      expect(mockOpenExternalUrl).toHaveBeenCalledWith(
        "https://growth.example/credits/launch#PORTAL_CODE_123",
      ),
    );
  });

  it("toggling 自动保存 calls patchPreferences({ autosaveEnabled }) then router.refresh()", async () => {
    const doc = renderDialog();
    const sw = doc.querySelector(
      '[data-slot="pref-autosave-switch"]',
    ) as HTMLElement;
    expect(sw).not.toBeNull();
    fireEvent.click(sw);

    await waitFor(() =>
      expect(mockClient.patchPreferences).toHaveBeenCalledTimes(1),
    );
    expect(mockClient.patchPreferences).toHaveBeenCalledWith(
      expect.objectContaining({ body: { autosaveEnabled: false } }),
    );
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalledTimes(1));
  });

  it("saving an edited 昵称 calls patchProfile({ displayName }) then router.refresh()", async () => {
    const doc = renderDialog();
    const input = doc.querySelector(
      '[data-slot="account-nickname-input"]',
    ) as HTMLInputElement;
    const save = doc.querySelector(
      '[data-slot="account-nickname-save"]',
    ) as HTMLButtonElement;
    expect(input).not.toBeNull();
    // Save disabled until the draft diverges from the current displayName.
    expect(save.disabled).toBe(true);
    fireEvent.change(input, { target: { value: "新昵称" } });
    expect(save.disabled).toBe(false);
    fireEvent.click(save);

    await waitFor(() =>
      expect(mockClient.patchProfile).toHaveBeenCalledTimes(1),
    );
    expect(mockClient.patchProfile).toHaveBeenCalledWith(
      expect.objectContaining({ body: { displayName: "新昵称" } }),
    );
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalledTimes(1));
  });

  // [T-247 假设置清算] 撤掉的偏好控件不得再渲染:defaultHome(无处消费)、
  // defaultVisibility(项目无 visibility 字段)、analyticsEnabled(产品无埋点)。
  // 反向断言锚定「保存了没人读」的控件不复活。
  it("[T-247] 撤掉的假偏好控件(默认主页/默认可见性/使用情况分析)不再渲染", () => {
    const doc = renderDialog();
    expect(
      doc.querySelector('[data-slot="pref-default-home-trigger"]'),
    ).toBeNull();
    expect(doc.querySelector('[data-slot="pref-visibility-trigger"]')).toBeNull();
    expect(doc.querySelector('[data-slot="pref-analytics-switch"]')).toBeNull();
    // 留下来的两个真偏好仍在(有真实消费方:新建项目预选 / 编辑器失焦自动保存)。
    expect(
      doc.querySelector('[data-slot="pref-creation-mode-trigger"]'),
    ).not.toBeNull();
    expect(
      doc.querySelector('[data-slot="pref-autosave-switch"]'),
    ).not.toBeNull();
  });

  it("saving the model form PUTs the whole default config (provider/model/baseUrl/format/secret/temperature)", async () => {
    const doc = renderDialog();
    const provider = doc.querySelector(
      '[data-slot="model-provider-input"]',
    ) as HTMLInputElement;
    const modelName = doc.querySelector(
      '[data-slot="model-name-input"]',
    ) as HTMLInputElement;
    const baseUrl = doc.querySelector(
      '[data-slot="model-base-url-input"]',
    ) as HTMLInputElement;
    const secret = doc.querySelector(
      '[data-slot="model-secret-input"]',
    ) as HTMLInputElement;
    const temperature = doc.querySelector(
      '[data-slot="model-temperature-input"]',
    ) as HTMLInputElement;
    const save = doc.querySelector(
      '[data-slot="model-save"]',
    ) as HTMLButtonElement;
    expect(provider).not.toBeNull();
    expect(save).not.toBeNull();

    fireEvent.change(provider, { target: { value: "minimax" } });
    fireEvent.change(modelName, { target: { value: "MiniMax-M3" } });
    fireEvent.change(baseUrl, {
      target: { value: "https://api.minimaxi.com/anthropic" },
    });
    fireEvent.change(secret, { target: { value: "sk-real-key" } });
    fireEvent.change(temperature, { target: { value: "0.9" } });
    fireEvent.click(save);

    await waitFor(() => expect(mockClient.putModel).toHaveBeenCalledTimes(1));
    expect(mockClient.putModel).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { capability: "default" },
        body: expect.objectContaining({
          provider: "minimax",
          modelName: "MiniMax-M3",
          baseUrl: "https://api.minimaxi.com/anthropic",
          apiFormat: "anthropic",
          secret: "sk-real-key",
          settings: { temperature: 0.9 },
        }),
      }),
    );
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalledTimes(1));
  });

  it("[T-501] 默认收起不常用字段，主路径只要求预设、模型与密钥", () => {
    const doc = renderDialog();
    const advanced = doc.querySelector(
      '[data-slot="model-advanced-settings"]',
    ) as HTMLElement | null;
    expect(advanced).not.toBeNull();
    expect(advanced?.hidden).toBe(true);
    expect(
      doc.querySelector('[data-slot="model-advanced-toggle"]')?.textContent,
    ).toContain("高级设置");
  });

  // --- [T-325] 供应商预设目录(cc-switch 风格)-------------------------------

  // 取模型输入 datalist 的候选(随选中/匹配的预设切换)。
  function modelDatalistValues(doc: Document): string[] {
    const dl = doc.querySelector(
      "#model-name-suggestions",
    ) as HTMLDataListElement | null;
    if (!dl) return [];
    return Array.from(dl.querySelectorAll("option")).map((o) => o.value);
  }

  it("[T-325] 默认(空 baseUrl + anthropic)回显 Anthropic 官方预设,模型候选=claude 家族", () => {
    const doc = renderDialog();
    const trigger = doc.querySelector(
      '[data-slot="model-preset-trigger"]',
    ) as HTMLElement;
    expect(trigger).not.toBeNull();
    // 关闭态即高亮匹配到的预设(SelectValue 显示 label)。
    expect(trigger.textContent ?? "").toContain("Anthropic 官方");
    // [T-377] 模型候选不再硬编码(供应商上新频繁会误导)→ datalist 恒空,纯自由输入。
    expect(modelDatalistValues(doc)).toEqual([]);
  });

  it("[T-471] 接口格式下拉提供 OpenAI Responses", async () => {
    const user = userEvent.setup();
    const doc = renderDialog();
    const trigger = doc.querySelector(
      '[data-slot="model-api-format-trigger"]',
    ) as HTMLElement;
    await user.click(trigger);
    expect(
      await waitFor(() => {
        const option = Array.from(
          document.querySelectorAll('[role="option"]'),
        ).find((item) => item.textContent?.includes("OpenAI Responses"));
        if (!option) throw new Error("OpenAI Responses option not mounted");
        return option;
      }),
    ).not.toBeNull();
  });

  it("[T-325] 已保存配置按 baseUrl/apiFormat 回显匹配预设(DeepSeek),匹配不到显示自定义", () => {
    const deepseekDoc = renderDialog({
      ...VM,
      model: {
        ...VM.model,
        baseUrl: "https://api.deepseek.com",
        apiFormat: "openai_chat",
      },
    });
    const trigger = deepseekDoc.querySelector(
      '[data-slot="model-preset-trigger"]',
    ) as HTMLElement;
    expect(trigger.textContent ?? "").toContain("DeepSeek");
    // [T-377] 候选去硬编码 → 恒空。
    expect(modelDatalistValues(deepseekDoc)).toEqual([]);

    cleanup();

    const customDoc = renderDialog({
      ...VM,
      model: {
        ...VM.model,
        baseUrl: "https://relay.example.com/v1",
        apiFormat: "openai_chat",
      },
    });
    const customTrigger = customDoc.querySelector(
      '[data-slot="model-preset-trigger"]',
    ) as HTMLElement;
    expect(customTrigger.textContent ?? "").toContain("自定义");
    // 自定义 → 无候选(纯自由输入)。
    expect(modelDatalistValues(customDoc)).toEqual([]);
  });

  it("[T-325] 手改接口地址 → 预设高亮与模型候选按 baseUrl 重算(匹配→切,乱填→自定义)", () => {
    const doc = renderDialog();
    const baseUrl = doc.querySelector(
      '[data-slot="model-base-url-input"]',
    ) as HTMLInputElement;
    const trigger = doc.querySelector(
      '[data-slot="model-preset-trigger"]',
    ) as HTMLElement;

    fireEvent.change(baseUrl, {
      target: { value: "https://api.deepseek.com" },
    });
    // baseUrl 命中 deepseek(apiFormat 仍 anthropic → 其实不命中 openai_chat 的 deepseek)。
    // deepseek 预设是 openai_chat,故此处 apiFormat=anthropic 时匹配不到 → 自定义。
    expect(trigger.textContent ?? "").toContain("自定义");
    expect(modelDatalistValues(doc)).toEqual([]);

    // 换成 anthropic 家的中转端点(MiniMax,anthropic 格式)→ 命中 minimax。
    fireEvent.change(baseUrl, {
      target: { value: "https://api.minimaxi.com/anthropic" },
    });
    expect(trigger.textContent ?? "").toContain("MiniMax");
    // [T-377] 候选去硬编码 → 恒空(高亮仍按 baseUrl/格式回显)。
    expect(modelDatalistValues(doc)).toEqual([]);
  });

  it("[T-325] 选预设填 baseUrl/接口格式 + 切模型候选;仍可自由输入模型,保存带回填字段", async () => {
    const user = userEvent.setup();
    const doc = renderDialog();
    const trigger = doc.querySelector(
      '[data-slot="model-preset-trigger"]',
    ) as HTMLElement;

    // 打开预设下拉,选 DeepSeek。
    await user.click(trigger);
    const deepseekItem = await waitFor(() => {
      const el = document.querySelector(
        '[data-slot="model-preset-item-deepseek"]',
      );
      if (!el) throw new Error("preset item not mounted yet");
      return el as HTMLElement;
    });
    await user.click(deepseekItem);

    const baseUrl = doc.querySelector(
      '[data-slot="model-base-url-input"]',
    ) as HTMLInputElement;
    const provider = doc.querySelector(
      '[data-slot="model-provider-input"]',
    ) as HTMLInputElement;
    // 预设一次性填 baseUrl / provider;接口格式 → openai_chat。
    await waitFor(() =>
      expect(baseUrl.value).toBe("https://api.deepseek.com"),
    );
    expect(provider.value).toBe("deepseek");
    // [T-377] 候选去硬编码 → 恒空(模型名自由填)。
    expect(modelDatalistValues(doc)).toEqual([]);

    // 模型仍可自由输入(不锁死候选)。
    const modelName = doc.querySelector(
      '[data-slot="model-name-input"]',
    ) as HTMLInputElement;
    fireEvent.change(modelName, { target: { value: "deepseek-custom-xyz" } });
    const secret = doc.querySelector(
      '[data-slot="model-secret-input"]',
    ) as HTMLInputElement;
    fireEvent.change(secret, { target: { value: "sk-ds" } });
    fireEvent.click(
      doc.querySelector('[data-slot="model-save"]') as HTMLButtonElement,
    );

    await waitFor(() => expect(mockClient.putModel).toHaveBeenCalledTimes(1));
    expect(mockClient.putModel).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { capability: "default" },
        body: expect.objectContaining({
          provider: "deepseek",
          modelName: "deepseek-custom-xyz",
          baseUrl: "https://api.deepseek.com",
          apiFormat: "openai_chat",
          secret: "sk-ds",
        }),
      }),
    );
  });
  it("[T1278/T645] 六槽可达，旧四类原配置保留且新增 vision/embed/edit，不新增雷达/search",()=>{
    const doc=renderDialog();for(const kind of ['audio','image','imageEdit','video','embed','vision'])expect(doc.querySelector(`[data-slot="multimodal-${kind}-card"]`)).not.toBeNull();
    expect(doc.querySelector('[data-slot="model-configuration-card"]')).not.toBeNull();for(const kind of ['review','search','fallback'])expect(doc.querySelector(`[data-slot="multimodal-${kind}-card"]`)).toBeNull();expect(mockClient.putModelRouting).not.toHaveBeenCalled();
  });

  it("[T-590] 模型配置不再增加内容雷达专用卡", () => {
    const doc = renderDialog();
    expect(
      doc.querySelector('[data-slot="multimodal-radar-card"]'),
    ).toBeNull();
    expect(doc.body.textContent).not.toContain("内容雷达拆解模型");
  });

  // --- Multimodal model config (SPEC 2026-07-01 M3) -------------------------

  // [T-379/T-715] 生图支持 OpenAI 兼容 images API；生视频只展示中性的模型能力。
  it("文生图 provider 候选含 openai；文生视频不暴露受管服务品牌", () => {
    const doc = renderDialog();
    const imageOptions = Array.from(
      doc.querySelectorAll("#multimodal-image-provider-suggestions option"),
    ).map((o) => (o as HTMLOptionElement).value);
    expect(imageOptions).toEqual(["openai", "minimax"]);
    expect(doc.body.textContent).toContain("OpenAI 兼容图片接口");
    expect(doc.body.textContent).not.toContain("中转站");

    const videoOptions = Array.from(
      doc.querySelectorAll("#multimodal-video-provider-suggestions option"),
    ).map((o) => (o as HTMLOptionElement).value);
    expect(videoOptions).toEqual(["seedance", "minimax"]);
    expect(doc.body.textContent).toContain(
      "支持已接入的视频生成接口",
    );
    expect(doc.body.textContent).not.toContain("OmniHi");
  });

  it("saving the 文生图 form PUTs the image.generate capability (provider/model/baseUrl/secret, no apiFormat/temperature)", async () => {
    const doc = renderDialog();openSourceConfiguration('image','self');
    const provider = doc.querySelector(
      '[data-slot="multimodal-image-provider-input"]',
    ) as HTMLInputElement;
    const modelName = doc.querySelector(
      '[data-slot="multimodal-image-model-input"]',
    ) as HTMLInputElement;
    const baseUrl = doc.querySelector(
      '[data-slot="multimodal-image-base-url-input"]',
    ) as HTMLInputElement;
    const secret = doc.querySelector(
      '[data-slot="multimodal-image-secret-input"]',
    ) as HTMLInputElement;
    const save = doc.querySelector(
      '[data-slot="multimodal-image-save"]',
    ) as HTMLButtonElement;
    expect(provider).not.toBeNull();
    expect(save).not.toBeNull();
    // Unconfigured (blank provider/model) → save disabled until both are filled.
    expect(save.disabled).toBe(true);

    fireEvent.change(provider, { target: { value: "minimax" } });
    fireEvent.change(modelName, { target: { value: "image-01" } });
    fireEvent.change(baseUrl, {
      target: { value: "https://api.minimaxi.com/v1" },
    });
    fireEvent.change(secret, { target: { value: "sk-image-key" } });
    expect(save.disabled).toBe(false);
    fireEvent.click(save);

    await waitFor(() => expect(mockClient.putModel).toHaveBeenCalledTimes(1));
    const call = mockClient.putModel.mock.calls[0]![0] as {
      params: { capability: string };
      body: Record<string, unknown>;
    };
    expect(call.params).toEqual({ capability: "image.generate" });
    expect(call.body).toEqual({
      provider: "minimax",
      modelName: "image-01",
      baseUrl: "https://api.minimaxi.com/v1",
      secret: "sk-image-key",
    });
    // Multimodal rows carry NO apiFormat / settings (resolver ignores them).
    expect(call.body.apiFormat).toBeUndefined();
    expect(call.body.settings).toBeUndefined();
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalledTimes(1));
  });

  it("saving the 文生视频 form PUTs the video.generate capability", async () => {
    const doc = renderDialog();openSourceConfiguration('video','self');
    const provider = doc.querySelector(
      '[data-slot="multimodal-video-provider-input"]',
    ) as HTMLInputElement;
    const modelName = doc.querySelector(
      '[data-slot="multimodal-video-model-input"]',
    ) as HTMLInputElement;
    const save = doc.querySelector(
      '[data-slot="multimodal-video-save"]',
    ) as HTMLButtonElement;
    expect(provider).not.toBeNull();

    fireEvent.change(provider, { target: { value: "minimax" } });
    fireEvent.change(modelName, { target: { value: "video-01" } });
    fireEvent.click(save);

    await waitFor(() => expect(mockClient.putModel).toHaveBeenCalledTimes(1));
    expect(mockClient.putModel).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { capability: "video.generate" },
        body: expect.objectContaining({
          provider: "minimax",
          modelName: "video-01",
        }),
      }),
    );
  });

  it("reads back a configured multimodal row + masks the secret (hasSecret badge, blank secret omitted on re-save)", async () => {
    const VM_MULTIMODAL: SettingsViewModel = {
      ...VM,
      multimodalModels: {
        image: {
          capability: "image.generate",
          provider: "minimax",
          modelName: "image-01",
          baseUrl: "https://api.minimaxi.com/v1",
          hasSecret: true,
        },
        video: VM.multimodalModels.video,
        audio: VM.multimodalModels.audio,
        vision: VM.multimodalModels.vision,
        embed: VM.multimodalModels.embed,
        search: VM.multimodalModels.search,
        fallback: VM.multimodalModels.fallback,
      },
    };
    const doc = renderDialog(VM_MULTIMODAL);
    // Read-back: the stored provider/model/baseUrl render into the inputs.
    const provider = doc.querySelector(
      '[data-slot="multimodal-image-provider-input"]',
    ) as HTMLInputElement;
    const modelName = doc.querySelector(
      '[data-slot="multimodal-image-model-input"]',
    ) as HTMLInputElement;
    expect(provider.value).toBe("minimax");
    expect(modelName.value).toBe("image-01");
    // Masked: hasSecret badge shown; raw key never rendered.
    const badge = doc.querySelector('[data-slot="multimodal-image-secret-status"]');
    expect(badge).not.toBeNull();
    const secret = doc.querySelector(
      '[data-slot="multimodal-image-secret-input"]',
    ) as HTMLInputElement;
    expect(secret.value).toBe("");

    // Re-save with a blank secret → the secret key is omitted (stored key kept).
    fireEvent.change(modelName, { target: { value: "image-01-hd" } });
    const save = doc.querySelector(
      '[data-slot="multimodal-image-save"]',
    ) as HTMLButtonElement;
    fireEvent.click(save);
    await waitFor(() => expect(mockClient.putModel).toHaveBeenCalledTimes(1));
    const call = mockClient.putModel.mock.calls[0]![0] as {
      body: Record<string, unknown>;
    };
    expect(call.body.secret).toBeUndefined();
    expect(call.body.modelName).toBe("image-01-hd");
  });

  // --- Transcribe (ASR) model config (SPEC 2026-07-01 §5.1, T-030-D1) --------

  it("ASR 与文本模型同属重点配置区，并明确云端建议、本地可用", async () => {
    const user = userEvent.setup();
    const doc = renderDialog();
    const requiredGroup = doc.querySelector('[data-model-family="audio"]');
    expect(
      requiredGroup?.querySelector('[data-capability="transcribe.audio"]'),
    ).not.toBeNull();
    const moreBody = doc.querySelector('[data-slot="models-more-body"]');
    expect(moreBody).toBeNull();
    expect(requiredGroup?.textContent).toContain("语音转文字");
    expect(requiredGroup?.textContent).toContain(
      "建议配置 ASR 转录模型，避免本地转录时间过长",
    );
    expect(requiredGroup?.textContent).toContain("未配置时仍可使用本地 Whisper");

    await user.click(screen.getByRole("tab", { name: "模型配置" }));
    openSourceConfiguration("text","self");
    await user.click(screen.getByRole("button", { name: "打开模型配置手册" }));
    const manual = await screen.findByRole("dialog", { name: "模型配置手册" });
    expect(manual.textContent).toContain("先选供应商");
    expect(manual.textContent).toContain("接口地址");
    expect(manual.textContent).toContain("接口格式");
    expect(manual.textContent).toContain("API 密钥");
    expect(manual.textContent).toContain("自定义 API");
    expect(manual.textContent).not.toContain("中转站");
    expect(manual.textContent).toContain("保存并测试");
    expect(manual.textContent).toContain("语音转文字");
    expect(manual.textContent).toContain("建议配置 ASR 转录模型");
    expect(manual.textContent).toContain("未配置时仍可使用本地 Whisper");
    expect(
      manual.querySelector('[data-slot="model-manual-figure-default"]'),
    ).not.toBeNull();
    expect(
      manual.querySelector('[data-slot="model-manual-figure-asr"]'),
    ).not.toBeNull();
  });

  it("renders the 逐字稿(audio) card without regressing the image/video cards", async () => {
    const doc = renderDialog();openSourceConfiguration('audio','self');
    // 逐字稿(audio)卡渲出,capability=transcribe.audio。
    const audioCard = doc.querySelector('[data-slot="multimodal-audio-card"]');
    expect(audioCard).not.toBeNull();
    expect(audioCard!.getAttribute("data-capability")).toBe("transcribe.audio");
    const provider = doc.querySelector(
      '[data-slot="multimodal-audio-provider-input"]',
    ) as HTMLInputElement;
    const model = doc.querySelector(
      '[data-slot="multimodal-audio-model-input"]',
    ) as HTMLInputElement;
    const baseUrl = doc.querySelector(
      '[data-slot="multimodal-audio-base-url-input"]',
    ) as HTMLInputElement;
    // 空 DB 行必须保持真实空值；供应商与接口地址默认收进高级设置。
    expect(provider.value).toBe("");
    expect(model.value).toBe("");
    expect(baseUrl.value).toBe("");
    expect(model.placeholder).toBe("mimo-v2.5-asr");
    expect(
      doc.querySelector('[data-slot="multimodal-audio-preset-trigger"]'),
    ).not.toBeNull();
    expect(
      (doc.querySelector(
        '[data-slot="multimodal-audio-advanced-settings"]',
      ) as HTMLElement).hidden,
    ).toBe(true);
    expect(
      doc.querySelector('[data-slot="multimodal-audio-advanced-toggle"]'),
    ).not.toBeNull();
    expect(
      doc.querySelector('[data-slot="multimodal-audio-provider-input"]'),
    ).not.toBeNull();
    expect(
      doc.querySelector('[data-slot="multimodal-audio-model-input"]'),
    ).not.toBeNull();
    expect(
      doc.querySelector('[data-slot="multimodal-audio-save"]'),
    ).not.toBeNull();
    // 现有 image / video 卡不回归(仍在 DOM,capability 不变)。
    expect(
      doc
        .querySelector('[data-slot="multimodal-image-card"]')!
        .getAttribute("data-capability"),
    ).toBe("image.generate");
    expect(
      doc
        .querySelector('[data-slot="multimodal-video-card"]')!
        .getAttribute("data-capability"),
    ).toBe("video.generate");
  });

  it("选择小米 MiMo 预设会自动填模型和技术参数，普通路径只需再填 Key", async () => {
    const user = userEvent.setup();
    const doc = renderDialog();openSourceConfiguration("audio","self");
    await user.click(
      doc.querySelector(
        '[data-slot="multimodal-audio-preset-trigger"]',
      ) as HTMLElement,
    );
    const mimoItem = await waitFor(() => {
      const item = document.querySelector(
        '[data-slot="multimodal-audio-preset-item-xiaomi-mimo"]',
      );
      if (!item) throw new Error("MiMo preset item not mounted yet");
      return item as HTMLElement;
    });
    await user.click(mimoItem);
    expect(
      (doc.querySelector(
        '[data-slot="multimodal-audio-provider-input"]',
      ) as HTMLInputElement).value,
    ).toBe("xiaomi-mimo");
    expect(
      (doc.querySelector(
        '[data-slot="multimodal-audio-model-input"]',
      ) as HTMLInputElement).value,
    ).toBe("mimo-v2.5-asr");
    expect(
      (doc.querySelector(
        '[data-slot="multimodal-audio-base-url-input"]',
      ) as HTMLInputElement).value,
    ).toBe("https://api.xiaomimimo.com/v1");
    expect(
      (doc.querySelector(
        '[data-slot="multimodal-audio-advanced-settings"]',
      ) as HTMLElement).hidden,
    ).toBe(true);
  });

  it("选择通义千问 Qwen 预设会自动填方言 ASR 模型和百炼地址", async () => {
    const user = userEvent.setup();
    const doc = renderDialog();openSourceConfiguration("audio","self");
    await user.click(
      doc.querySelector(
        '[data-slot="multimodal-audio-preset-trigger"]',
      ) as HTMLElement,
    );
    const qwenItem = await waitFor(() => {
      const item = document.querySelector(
        '[data-slot="multimodal-audio-preset-item-qwen-asr"]',
      );
      if (!item) throw new Error("Qwen preset item not mounted yet");
      return item as HTMLElement;
    });
    await user.click(qwenItem);
    expect(
      (doc.querySelector(
        '[data-slot="multimodal-audio-provider-input"]',
      ) as HTMLInputElement).value,
    ).toBe("qwen-asr");
    expect(
      (doc.querySelector(
        '[data-slot="multimodal-audio-model-input"]',
      ) as HTMLInputElement).value,
    ).toBe("qwen3-asr-flash");
    expect(
      (doc.querySelector(
        '[data-slot="multimodal-audio-base-url-input"]',
      ) as HTMLInputElement).value,
    ).toBe("https://dashscope.aliyuncs.com/compatible-mode/v1");
    expect(
      (doc.querySelector(
        '[data-slot="multimodal-audio-advanced-settings"]',
      ) as HTMLElement).hidden,
    ).toBe(true);
  });

  it("saving the 逐字稿 form PUTs the transcribe.audio capability (provider/model/baseUrl/secret)", async () => {
    const doc = renderDialog();
    const provider = doc.querySelector(
      '[data-slot="multimodal-audio-provider-input"]',
    ) as HTMLInputElement;
    const modelName = doc.querySelector(
      '[data-slot="multimodal-audio-model-input"]',
    ) as HTMLInputElement;
    const baseUrl = doc.querySelector(
      '[data-slot="multimodal-audio-base-url-input"]',
    ) as HTMLInputElement;
    const secret = doc.querySelector(
      '[data-slot="multimodal-audio-secret-input"]',
    ) as HTMLInputElement;
    const save = doc.querySelector(
      '[data-slot="multimodal-audio-save"]',
    ) as HTMLButtonElement;
    // 云端 ASR 是建议配置；一旦填写新配置，仍必须 provider + model + Key 齐全。
    expect(save.disabled).toBe(true);

    fireEvent.change(provider, { target: { value: "xiaomi-mimo" } });
    fireEvent.change(modelName, {
      target: { value: "mimo-v2.5-asr" },
    });
    fireEvent.change(baseUrl, {
      target: { value: "https://api.xiaomimimo.com/v1" },
    });
    expect(save.disabled).toBe(true);
    fireEvent.change(secret, { target: { value: "mimo-key" } });
    expect(save.disabled).toBe(false);
    fireEvent.click(save);

    await waitFor(() => expect(mockClient.putModel).toHaveBeenCalledTimes(1));
    const call = mockClient.putModel.mock.calls[0]![0] as {
      params: { capability: string };
      body: Record<string, unknown>;
    };
    expect(call.params).toEqual({ capability: "transcribe.audio" });
    expect(call.body).toEqual({
      provider: "xiaomi-mimo",
      modelName: "mimo-v2.5-asr",
      baseUrl: "https://api.xiaomimimo.com/v1",
      secret: "mimo-key",
    });
    // Multimodal rows carry NO apiFormat / settings (resolver ignores them).
    expect(call.body.apiFormat).toBeUndefined();
    expect(call.body.settings).toBeUndefined();
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalledTimes(1));
  });

  it("omits the secret when left blank (a re-save keeps the stored key)", async () => {
    const VM_WITH_SECRET: SettingsViewModel = {
      ...VM,
      model: { ...VM.model, hasSecret: true },
    };
    const doc = renderDialog(VM_WITH_SECRET);
    const modelName = doc.querySelector(
      '[data-slot="model-name-input"]',
    ) as HTMLInputElement;
    const save = doc.querySelector(
      '[data-slot="model-save"]',
    ) as HTMLButtonElement;
    fireEvent.change(modelName, { target: { value: "claude-opus-4-8-v2" } });
    fireEvent.click(save);
    await waitFor(() => expect(mockClient.putModel).toHaveBeenCalledTimes(1));
    const call = mockClient.putModel.mock.calls[0]![0] as {
      body: Record<string, unknown>;
    };
    expect(call.body.secret).toBeUndefined();
    expect(call.body.modelName).toBe("claude-opus-4-8-v2");
  });

  // item B — StorageUsageCard 保存 wiring.
  it("saving an edited 媒体路径 calls putStorage({ rootPath }) then router.refresh()", async () => {
    const VM_STORAGE: SettingsViewModel = {
      ...VM,
      storage: {
        backend: "local",
        rootPath: "~/CreatorOS/media",
        usedBytes: 5_000_000_000,
        totalBytes: 500_000_000_000,
        breakdown: [
          { assetType: "video", label: "视频素材", bytes: 5_000_000_000, tone: "brand" },
        ],
      },
    };
    const doc = renderDialog(VM_STORAGE);
    const input = doc.querySelector(
      '[data-slot="storage-root-path-input"]',
    ) as HTMLInputElement;
    const save = doc.querySelector(
      '[data-slot="storage-save-button"]',
    ) as HTMLButtonElement;
    expect(input).not.toBeNull();
    expect(save).not.toBeNull();
    // The real used-bytes render goes through /1e9 → "5.0 GB".
    const storageCard = doc.querySelector('[data-slot="storage-usage-card"]');
    expect(storageCard?.textContent ?? "").toContain("5.0 GB");

    fireEvent.change(input, { target: { value: "/tmp/creatoros-media" } });
    fireEvent.click(save);

    await waitFor(() => expect(mockClient.putStorage).toHaveBeenCalledTimes(1));
    expect(mockClient.putStorage).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { rootPath: "/tmp/creatoros-media" },
      }),
    );
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalledTimes(1));
  });
});

// ---------------------------------------------------------------------------
// AccountBindingCard — 账号绑定 / 抖音扫码登录入口 + 连接状态徽标 (T-032a)
// ---------------------------------------------------------------------------

describe("AccountBindingCard (T-032a — 抖音扫码登录入口 + 徽标)", () => {
  it("已连接(status → loggedIn=true): 显「已连接」徽标 + 「重新扫码」按钮", async () => {
    // 挂载后拉的 status 决定徽标(SSR 默认为 false;探针返 true → 翻已连接)。
    mockClient.statusDouyin.mockResolvedValue({ loggedIn: true });
    const doc = renderDialog();

    const badge = doc.querySelector(
      '[data-slot="douyin-binding-status"]',
    ) as HTMLElement;
    const action = doc.querySelector(
      '[data-slot="douyin-binding-action"]',
    ) as HTMLButtonElement;
    expect(badge).not.toBeNull();
    expect(action).not.toBeNull();

    // 挂载 effect 把徽标翻真(已连接)+ 按钮文案转「重新扫码」。
    await waitFor(() =>
      expect(badge.getAttribute("data-connected")).toBe("true"),
    );
    expect(badge.textContent).toContain("已连接");
    expect(action.textContent).toContain("重新扫码");
  });

  it("[T-144] 已扫码但采集源未就绪(loggedIn=true, sourceReady=false): 不说「可采集」", async () => {
    mockClient.statusDouyin.mockResolvedValue({
      loggedIn: true,
      sourceReady: false,
    });
    const doc = renderDialog();
    await waitFor(() => expect(mockClient.statusDouyin).toHaveBeenCalled());
    const hint = doc.querySelector(
      '[data-slot="douyin-binding-hint"]',
    ) as HTMLElement;
    await waitFor(() =>
      expect(hint.textContent).toContain("还没开始同步"),
    );
    // 去虚假承诺:登录态有效但无源时,绝不出现「可采集」承诺。
    expect(hint.textContent).not.toContain("可采集");
  });

  it("[T-144] 已连接且采集源就绪(loggedIn=true, sourceReady=true): 显「可采集」", async () => {
    mockClient.statusDouyin.mockResolvedValue({
      loggedIn: true,
      sourceReady: true,
    });
    const doc = renderDialog();
    await waitFor(() => expect(mockClient.statusDouyin).toHaveBeenCalled());
    const hint = doc.querySelector(
      '[data-slot="douyin-binding-hint"]',
    ) as HTMLElement;
    await waitFor(() => expect(hint.textContent).toContain("可采集"));
  });

  it("未连接(status → loggedIn=false): 显「未连接」徽标 + 「连接抖音(扫码)」按钮", async () => {
    mockClient.statusDouyin.mockResolvedValue({ loggedIn: false });
    const doc = renderDialog();

    const badge = doc.querySelector(
      '[data-slot="douyin-binding-status"]',
    ) as HTMLElement;
    const action = doc.querySelector(
      '[data-slot="douyin-binding-action"]',
    ) as HTMLButtonElement;
    // 探针跑完(mount effect 已 resolve),徽标为未连接。
    await waitFor(() => expect(mockClient.statusDouyin).toHaveBeenCalled());
    expect(badge.getAttribute("data-connected")).toBe("false");
    expect(badge.textContent).toContain("未连接");
    expect(action.textContent).toContain("连接抖音");
  });

  it("点「连接抖音」→ loginDouyin({}) → 重拉 status → 徽标转已连接(loading 态存在)", async () => {
    // 初始未连接;点击后 loginDouyin 返 true,随后重拉 status 也返 true → 徽标翻已连接。
    mockClient.statusDouyin.mockResolvedValue({ loggedIn: false });
    mockClient.loginDouyin.mockResolvedValue({ loggedIn: true });
    const doc = renderDialog();

    const badge = doc.querySelector(
      '[data-slot="douyin-binding-status"]',
    ) as HTMLElement;
    const action = doc.querySelector(
      '[data-slot="douyin-binding-action"]',
    ) as HTMLButtonElement;

    // 等 mount 探针跑完(未连接),再让重拉 status 返 true(扫码成功后的确认)。
    await waitFor(() => expect(mockClient.statusDouyin).toHaveBeenCalledTimes(1));
    mockClient.statusDouyin.mockResolvedValue({ loggedIn: true });

    fireEvent.click(action);

    // loading 态:`setPhase("scanning")` 在点击处理器里同步执行,fireEvent 已 flush,
    // 故点击后当帧按钮即 disabled + 「扫码中…请在弹出的 Chrome 窗口扫码」引导文案已在(异步
    // login/status resolve 后相位才推进,故在同步点这一帧断言 scanning 态最稳)。
    expect(action.disabled).toBe(true);
    expect(
      doc.querySelector('[data-slot="douyin-binding-scanning"]'),
    ).not.toBeNull();

    // 复用现成 loginDouyin(空 body)。
    await waitFor(() => expect(mockClient.loginDouyin).toHaveBeenCalledTimes(1));
    expect(mockClient.loginDouyin).toHaveBeenCalledWith(
      expect.objectContaining({ body: {} }),
    );

    // 扫码成功 → 重拉 status(第 2 次)确认 → 徽标转已连接 + 成功反馈。
    await waitFor(() =>
      expect(mockClient.statusDouyin).toHaveBeenCalledTimes(2),
    );
    await waitFor(() =>
      expect(badge.getAttribute("data-connected")).toBe("true"),
    );
    expect(badge.textContent).toContain("已连接");
    const feedback = doc.querySelector('[data-slot="douyin-binding-feedback"]');
    expect(feedback?.getAttribute("data-tone")).toBe("success");
    // loading 态收尾:按钮恢复可点。
    await waitFor(() => expect(action.disabled).toBe(false));
  });

  it("扫码超时(loginDouyin → loggedIn=false): 提示重试, 徽标保持未连接", async () => {
    mockClient.statusDouyin.mockResolvedValue({ loggedIn: false });
    mockClient.loginDouyin.mockResolvedValue({ loggedIn: false });
    const doc = renderDialog();

    const badge = doc.querySelector(
      '[data-slot="douyin-binding-status"]',
    ) as HTMLElement;
    const action = doc.querySelector(
      '[data-slot="douyin-binding-action"]',
    ) as HTMLButtonElement;
    await waitFor(() => expect(mockClient.statusDouyin).toHaveBeenCalledTimes(1));

    fireEvent.click(action);

    await waitFor(() => expect(mockClient.loginDouyin).toHaveBeenCalledTimes(1));
    // 超时 → 不重拉 status(仍只 1 次),徽标保持未连接 + 错误反馈。
    const feedback = doc.querySelector('[data-slot="douyin-binding-feedback"]');
    await waitFor(() =>
      expect(
        doc
          .querySelector('[data-slot="douyin-binding-feedback"]')
          ?.getAttribute("data-tone"),
      ).toBe("error"),
    );
    expect(feedback ?? doc.querySelector('[data-slot="douyin-binding-feedback"]'))
      .not.toBeNull();
    expect(badge.getAttribute("data-connected")).toBe("false");
    expect(mockClient.statusDouyin).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// [T-132 切片 4] ?highlight=<stepKey> 深链落地定位(非逐步 tour)
// ---------------------------------------------------------------------------
describe("SettingsDialog — ?highlight 深链定位", () => {
  // jsdom 不实现 scrollIntoView → stub 掉,只断言它被调用 + 高亮 class 加上。
  const scrollSpy = vi.fn();
  beforeEach(() => {
    scrollSpy.mockClear();
    Element.prototype.scrollIntoView = scrollSpy;
  });

  /** rAF 在 jsdom 是异步的,等它跑完一帧。 */
  async function flushRaf() {
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    await new Promise((r) => setTimeout(r, 0));
  }

  it("[T-1055] assistant-engine 深链落模型页并定位真实引擎卡", async () => {
    mockSearchParams = new URLSearchParams("highlight=assistant-engine");
    const doc = renderDialog();
    await flushRaf();
    const card = doc.querySelector('[data-highlight="assistant-engine"]');
    expect(card).not.toBeNull();
    expect(doc.querySelector('[data-slot="settings-panel"][data-tab-id="models"]')).toHaveAttribute("data-active", "true");
    expect(screen.getByRole("combobox", {name: "文本创作与结构化模型来源"})).toBeInTheDocument();
  });

  it("highlight=text-model → 滚动到文本模型配置卡并加高亮 ring", async () => {
    mockSearchParams = new URLSearchParams("highlight=text-model");
    const doc = renderDialog();
    await flushRaf();

    const card = doc.querySelector('[data-highlight="text-model"]') as HTMLElement;
    expect(card).not.toBeNull();
    expect(scrollSpy).toHaveBeenCalled();
    expect(card.classList.contains("ring-brand")).toBe(true);
    // 切到 models 页签(该卡所在)。
    const modelsPanel = doc.querySelector(
      '[data-slot="settings-panel"][data-tab-id="models"]',
    ) as HTMLElement;
    expect(modelsPanel.getAttribute("data-active")).toBe("true");
  });

  it("highlight=asr-model → 定位到逐字稿(audio)多模态卡(stepKey↔kind 非同名映射)", async () => {
    mockSearchParams = new URLSearchParams("highlight=asr-model");
    const doc = renderDialog();
    await flushRaf();

    const card = doc.querySelector('[data-highlight="asr-model"]') as HTMLElement;
    expect(card).not.toBeNull();
    // 该锚点正是 audio 多模态卡。
    expect(card.getAttribute("data-slot")).toBe("multimodal-audio-card");
    expect(scrollSpy).toHaveBeenCalled();
    expect(card.classList.contains("ring-brand")).toBe(true);
  });

  it("highlight=storage-root → 切到存储页签并定位存储卡", async () => {
    mockSearchParams = new URLSearchParams("highlight=storage-root");
    const doc = renderDialog();
    await flushRaf();

    const card = doc.querySelector('[data-highlight="storage-root"]') as HTMLElement;
    expect(card).not.toBeNull();
    expect(card.getAttribute("data-slot")).toBe("storage-usage-card");
    expect(scrollSpy).toHaveBeenCalled();
    const storagePanel = doc.querySelector(
      '[data-slot="settings-panel"][data-tab-id="storage"]',
    ) as HTMLElement;
    expect(storagePanel.getAttribute("data-active")).toBe("true");
  });

  it("highlight=web-session-vault → 定位到账户页的网站登录保管库", async () => {
    mockSearchParams = new URLSearchParams("highlight=web-session-vault");
    const doc = renderDialog();
    await flushRaf();

    const card = doc.querySelector(
      '[data-highlight="web-session-vault"]',
    ) as HTMLElement;
    expect(card).not.toBeNull();
    expect(scrollSpy).toHaveBeenCalled();
    const accountPanel = doc.querySelector(
      '[data-slot="settings-panel"][data-tab-id="account"]',
    ) as HTMLElement;
    expect(accountPanel.getAttribute("data-active")).toBe("true");
  });

  it("无 highlight → 无副作用(不滚动、默认页签)", async () => {
    mockSearchParams = new URLSearchParams();
    const doc = renderDialog();
    await flushRaf();

    expect(scrollSpy).not.toHaveBeenCalled();
    // 默认停在第一个页签(account)。
    const accountPanel = doc.querySelector(
      '[data-slot="settings-panel"][data-tab-id="account"]',
    ) as HTMLElement;
    expect(accountPanel.getAttribute("data-active")).toBe("true");
  });

  it("未知 highlight 值 → 无副作用、不报错", async () => {
    mockSearchParams = new URLSearchParams("highlight=does-not-exist");
    const doc = renderDialog();
    await flushRaf();

    expect(scrollSpy).not.toHaveBeenCalled();
    const accountPanel = doc.querySelector(
      '[data-slot="settings-panel"][data-tab-id="account"]',
    ) as HTMLElement;
    expect(accountPanel.getAttribute("data-active")).toBe("true");
  });
});

// [T-259] 诊断日志卡:桌面端「导出诊断日志」入口。jsdom 无 __TAURI_INTERNALS__ →
// isDesktopRuntimeClient() 为 false → 渲「桌面端专属」诚实空态(挂载即在账户页签,无网络副作用)。
describe("Settings 诊断日志卡 (T-259)", () => {
  it("非桌面(web/jsdom)→ 渲诊断日志诚实空态,不渲导出按钮", () => {
    const doc = renderDialog();
    const card = doc.querySelector('[data-slot="diagnostic-logs-card"]');
    expect(card).not.toBeNull();
    // web 态:空态(data-desktop=false),不渲「导出诊断日志」按钮(桌面态才有,挂载后翻真)。
    expect(card!.getAttribute("data-desktop")).toBe("false");
    expect(
      doc.querySelector('[data-slot="diagnostic-logs-action"]'),
    ).toBeNull();
  });

  it("[T-476] Windows 打开失败时展示真实日志目录，用户仍可手动前往", async () => {
    (
      window as unknown as Record<string, unknown>
    ).__TAURI_INTERNALS__ = {};
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input) =>
        String(input).includes("/api/v1/local/reveal-logs")
          ? new Response(
              JSON.stringify({
                error: "reveal failed",
                dir: "C:\\Users\\Alice\\AppData\\Roaming\\CreatorOS\\logs",
              }),
              { status: 500, headers: { "Content-Type": "application/json" } },
            )
          : new Response(JSON.stringify({}), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }),
      );
    const doc = renderDialog();
    const action = await waitFor(() => {
      const button = doc.querySelector(
        '[data-slot="diagnostic-logs-action"]',
      ) as HTMLButtonElement | null;
      if (!button) throw new Error("desktop action not ready");
      return button;
    });
    fireEvent.click(action);
    await waitFor(() => {
      expect(
        doc.querySelector('[data-slot="diagnostic-logs-fallback"]')
          ?.textContent,
      ).toContain("C:\\Users\\Alice\\AppData\\Roaming\\CreatorOS\\logs");
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/v1/local/reveal-logs",
      expect.objectContaining({ method: "POST" }),
    );
    delete (
      window as unknown as Record<string, unknown>
    ).__TAURI_INTERNALS__;
  });
});

// [T-377] 「测试连接」:每个 capability 卡旁,点击 → settings.models.test(测已保存配置)
// → 诚实渲「✓ 连通」/「✗ 失败:<真实原因>」。
describe("Settings 测试连接 (T-377)", () => {
  it("[T-1236] 真实保存回显替换表单时，同次pending探针结果仍在当前按钮旁", async () => {
    const saved = ENDPOINTS.putModel.response.parse({
      id: "t1236-default-model", userId: "t1236-user", capability: "default",
      provider: "openai-compatible", modelName: "t1236-current-model",
      baseUrl: "http://127.0.0.1:49999/v1", apiFormat: "openai_chat",
      settings: { temperature: 0.6 }, secretReference: "opaque-reference",
      isDefault: true, hasSecret: true,
    });
    let finishProbe!: (value: {ok: boolean; detail: string}) => void;
    mockClient.putModel.mockResolvedValueOnce(saved);
    mockClient.testModelConnection.mockImplementationOnce(() => new Promise(resolve => { finishProbe = resolve; }));
    const initial = {...VM, model: {...VM.model, ...saved, baseUrl: saved.baseUrl ?? "", temperature: 0.6, hasSecret: false}};
    const tree = render(<SettingsDialog viewModel={initial} />);
    fireEvent.click(document.querySelector('[data-tab-id="models"][role="tab"]')!);
    const originalInput = document.querySelector('[data-slot="model-name-input"]');
    fireEvent.change(document.querySelector('[data-slot="model-secret-input"]')!, {target: {value: "t1236-neutral-key"}});
    fireEvent.click(document.querySelector('[data-slot="model-test-connection"]')!);
    await waitFor(() => expect(mockClient.testModelConnection).toHaveBeenCalledTimes(1), {timeout: 120000});
    expect(mockClient.putModel).toHaveBeenCalledTimes(1);
    expect(mockRouter.refresh).toHaveBeenCalledTimes(1);
    tree.rerender(<SettingsDialog viewModel={{...initial, model: {...initial.model, hasSecret: true}}} />);
    expect(document.querySelector('[data-slot="model-name-input"]')).not.toBe(originalInput);
    expect(document.querySelector('[data-slot="model-secret-input"]')).toHaveValue("");
    expect(document.querySelector('[data-slot="model-secret-status"]')).toHaveTextContent("已配置");
    await act(async () => { finishProbe({ok: true, detail: "t1236 same saved configuration"}); });
    const result = document.querySelector('[data-slot="model-test-result"]');
    expect(result).not.toBeNull();
    expect(result).toHaveAttribute("data-status", "ok");
    expect(result).toHaveTextContent("t1236 same saved configuration");
    expect(mockClient.putModel).toHaveBeenCalledTimes(1);
    expect(mockClient.testModelConnection).toHaveBeenCalledTimes(1);
  }, 240000);

  it("[T-501] 主模型卡点「保存并测试」→ 先保存当前表单，再测试同一份配置", async () => {
    const doc = renderDialog();
    const btn = doc.querySelector(
      '[data-slot="model-test-connection"]',
    ) as HTMLButtonElement;
    expect(btn).not.toBeNull();
    expect(btn.textContent).toContain("保存并测试");
    fireEvent.click(btn);
    await waitFor(() => expect(mockClient.putModel).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(mockClient.testModelConnection).toHaveBeenCalledTimes(1),
    );
    expect(
      mockClient.putModel.mock.invocationCallOrder[0],
    ).toBeLessThan(mockClient.testModelConnection.mock.invocationCallOrder[0]!);
    expect(mockClient.testModelConnection).toHaveBeenCalledWith(
      expect.objectContaining({ params: { capability: "default" } }),
    );
    const result = await waitFor(() => {
      const el = doc.querySelector('[data-slot="model-test-result"]');
      if (!el) throw new Error("result not rendered yet");
      return el;
    });
    expect(result.getAttribute("data-ok")).toBe("true");
    expect(result.textContent ?? "").toContain("✓ 连通");
  });

  it("文生图卡测试失败 → ✗ 失败带真实原因(区分「未配置」vs「配置了但调用失败」由 host 侧分类)", async () => {
    mockClient.testModelConnection.mockResolvedValueOnce({
      ok: false,
      detail: "生图模型已配置,但调用失败:minimax API 401: invalid api key",
    });
    const doc = renderDialog();
    const btn = doc.querySelector(
      '[data-slot="multimodal-image-test-connection"]',
    ) as HTMLButtonElement;
    expect(btn).not.toBeNull();
    fireEvent.click(btn);
    await waitFor(() =>
      expect(mockClient.testModelConnection).toHaveBeenCalledWith(
        expect.objectContaining({ params: { capability: "image.generate" } }),
      ),
    );
    const result = await waitFor(() => {
      const el = doc.querySelector('[data-slot="multimodal-image-test-result"]');
      if (!el) throw new Error("result not rendered yet");
      return el;
    });
    expect(result.getAttribute("data-ok")).toBe("false");
    expect(result.textContent ?? "").toContain("✗ 失败");
    expect(result.textContent ?? "").toContain("invalid api key");
  });

  it("ASR 未配置时中性说明使用本地 Whisper，不显示失败", async () => {
    mockClient.testModelConnection.mockResolvedValueOnce({
      ok: true,
      status: "warn",
      detail: "未配置云端 ASR，当前使用本地 Whisper；处理时间可能更长。",
    });
    const doc = renderDialog();
    fireEvent.click(
      doc.querySelector(
        '[data-slot="multimodal-audio-test-connection"]',
      ) as HTMLButtonElement,
    );
    const result = await waitFor(() => {
      const el = doc.querySelector(
        '[data-slot="multimodal-audio-test-result"]',
      );
      if (!el) throw new Error("result not rendered yet");
      return el;
    });
    expect(result.getAttribute("data-status")).toBe("warn");
    expect(result.textContent ?? "").toContain("本地 Whisper");
    expect(result.textContent ?? "").not.toContain("✗ 失败");
  });
});
it("T1278/T1246 选定 text/image Codex 才免其 API 配置，ASR/video 不受覆盖",async()=>{
 mockClient.getModelRouting.mockResolvedValue({schemaVersion:1,revision:1,choices:{text:'codex',vision:'codex',image:'codex',video:'self',audio:'self',embed:'self'},legacyExecutionEngine:'pi',effectiveChoices:{},capabilities:[]});
 const {loadModelRouting}=await import("@/features/copilot/assistant-engine");await loadModelRouting(true);
 renderDialog();expect(document.querySelector('[data-slot="model-configuration-card"]')).toBeNull();expect(document.querySelector('[data-slot="multimodal-image-card"]')).toBeNull();expect(document.body).toHaveTextContent('Codex');expect(document.querySelector('[data-slot="multimodal-audio-card"]')).not.toBeNull();expect(document.querySelector('[data-slot="multimodal-video-card"]')).not.toBeNull();expect(mockClient.putModel).not.toHaveBeenCalled();expect(mockClient.testModelConnection).not.toHaveBeenCalled();expect(mockClient.putModelRouting).not.toHaveBeenCalled();
});

describe("T1278 真实额度卡首次充值与原操作恢复", () => {
  const code = `AICR-${"x".repeat(43)}`;
  const ref = "AICLE-T1278UI0001";
  const receipt = (status = "pending", override = {}) => ({ contractVersion: "growth-ai-credit-bootstrap-v1", operationRef: ref, status, creditUnits: 123, expiresAt: "2026-10-14T12:30:00+00:00", ...override });
  const reply = (value: unknown, status = 200) => Response.json(value, { status, headers: { "cache-control": "private, no-store" } });
  beforeEach(async () => {
    const { webcrypto } = await import("node:crypto");
    vi.stubGlobal("crypto", webcrypto);
  });
  afterEach(() => { vi.unstubAllGlobals(); });
  async function card() {
    const { AiCreditCenterCard } = await import("./channel-model-configuration");
    rtlRender(<AiCreditCenterCard/>);
    await userEvent.click(screen.getByText("使用充值码开通官方额度"));
  }
  it("真实not_configured账户不展示明知失败的额度连接，显式充值码入口仍可用", async () => {
    const { AiCreditCenterCard } = await import("./channel-model-configuration");
    const fetchMock = vi.spyOn(globalThis, "fetch");
    rtlRender(<AiCreditCenterCard accountStatus="not_configured"/>);
    expect(screen.queryByRole("button", { name: "查看 AI 额度与消耗" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByText("使用充值码开通官方额度"));
    expect(screen.getByLabelText("官方额度充值码")).toHaveValue("");
    expect(screen.getByRole("button", { name: "兑换并开通" })).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
  }, 180_000);

  it("空输入零开通；真实body/no-store，pending→unknown查询→同ref恢复，清充值码且不轮询", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      return reply(receipt(String(url).endsWith("/resume") ? "applied" : init?.method === "GET" ? "provider_unknown" : "pending"));
    });
    await card(); expect(screen.getByRole("button", { name: "兑换并开通" })).toBeDisabled(); expect(fetchMock).not.toHaveBeenCalled();
    await userEvent.type(screen.getByLabelText("官方额度充值码"), code);
    await userEvent.click(screen.getByRole("button", { name: "兑换并开通" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("开通处理中"), { timeout: 120_000 });
    expect(screen.queryByLabelText("官方额度充值码")).not.toBeInTheDocument();
    expect(screen.getByLabelText("原操作编号")).toHaveValue(ref);
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ serviceId: "omnihi-main", code });
    expect(calls[0].init.cache).toBe("no-store"); expect(calls[0].init.credentials).toBe("same-origin");
    expect(calls).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: "查询原操作" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("到账确认中"), { timeout: 120_000 });
    await userEvent.click(screen.getByRole("button", { name: "恢复原操作" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("本次兑换已到账"), { timeout: 120_000 });
    expect(calls.map(row => [row.url, row.init.method, row.init.body])).toEqual([
      ["/api/v1/local/ai-credits/bootstrap", "POST", JSON.stringify({ serviceId: "omnihi-main", code })],
      [`/api/v1/local/ai-credits/bootstrap/${ref}`, "GET", undefined],
      [`/api/v1/local/ai-credits/bootstrap/${ref}/resume`, "POST", "{}"],
    ]);
    expect(mockOpenExternalUrl).not.toHaveBeenCalled(); expect(mockClient.putModel).not.toHaveBeenCalled(); expect(mockClient.putModelRouting).not.toHaveBeenCalled();
    expect(JSON.stringify(localStorage)).not.toContain(code); expect(JSON.stringify(sessionStorage)).not.toContain(code);
  }, 180_000);

  it("提交未知只能显式重输同码恢复原幂等键，不能换码再开，StrictMode无自动开通", async () => {
    const { AiCreditCenterCard } = await import("./channel-model-configuration");
    const calls: RequestInit[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      calls.push(init ?? {});
      if (calls.length === 1) throw new TypeError("fixture offline");
      return reply(receipt("provider_unknown"));
    });
    rtlRender(<React.StrictMode><AiCreditCenterCard/></React.StrictMode>);
    await userEvent.click(screen.getByText("使用充值码开通官方额度"));
    expect(calls).toHaveLength(0);
    await userEvent.type(screen.getByLabelText("官方额度充值码"), code);
    await userEvent.click(screen.getByRole("button", { name: "兑换并开通" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "恢复原提交" })).toBeInTheDocument(), { timeout: 120_000 });
    expect(screen.getByLabelText("官方额度充值码")).toHaveValue("");
    await userEvent.type(screen.getByLabelText("官方额度充值码"), `AICR-${"y".repeat(43)}`);
    await userEvent.click(screen.getByRole("button", { name: "恢复原提交" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("本次结果尚未确认，请输入原充值码恢复同一次提交"), { timeout: 120_000 });
    expect(calls).toHaveLength(1);
    await userEvent.type(screen.getByLabelText("官方额度充值码"), code);
    await userEvent.click(screen.getByRole("button", { name: "恢复原提交" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("到账确认中"), { timeout: 120_000 });
    expect(calls).toHaveLength(2); expect(calls[1].headers).toEqual(calls[0].headers); expect(calls[1].body).toEqual(calls[0].body);
  }, 180_000);

  it("已到账先实际同步再沿原connect打开，失败保原ref/到账状态且不重发bootstrap", async () => {
    const calls: string[] = []; let failSync = true;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      calls.push(String(url));
      if (String(url) === "/api/v1/local/ai-credits/bootstrap") return reply(receipt("applied"));
      if (String(url) === "/api/v1/local/client-config") return reply(failSync ? { authority: "local", outcome: "unreachable" } : { authority: "channel", outcome: "configured" });
      if (String(url) === "/api/v1/local/ai-credits/connect") return reply({ openUrl: "https://growth.example/credits/connect#SAFE_LINK_CODE", expiresAt: "2026-10-14T12:05:00Z", expiresIn: 60 });
      throw new Error("unexpected route");
    });
    await card(); await userEvent.type(screen.getByLabelText("官方额度充值码"), code);
    await userEvent.click(screen.getByRole("button", { name: "兑换并开通" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("本次兑换已到账"), { timeout: 120_000 });
    await userEvent.click(screen.getByRole("button", { name: "同步并打开额度中心" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("兑换已到账，但配置同步暂未完成"), { timeout: 120_000 });
    expect(screen.getByLabelText("原操作编号")).toHaveValue(ref); expect(mockOpenExternalUrl).not.toHaveBeenCalled();
    failSync = false;
    await userEvent.click(screen.getByRole("button", { name: "同步并打开额度中心" }));
    await waitFor(() => expect(mockOpenExternalUrl).toHaveBeenCalledWith("https://growth.example/credits/connect#SAFE_LINK_CODE"), { timeout: 120_000 });
    expect(calls).toEqual(["/api/v1/local/ai-credits/bootstrap", "/api/v1/local/client-config", "/api/v1/local/client-config", "/api/v1/local/ai-credits/connect"]);
    expect(mockRouter.refresh).toHaveBeenCalled();
  }, 180_000);

  it("切组中断旧结果，不把旧operation显示到新scope；expired保编号且无另开/恢复按钮", async () => {
    let finish!: (response: Response) => void;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise<Response>(resolve => { finish = resolve; }));
    localStorage.setItem(CURRENT_GROUP_KEY, "group-a");
    await card(); await userEvent.type(screen.getByLabelText("官方额度充值码"), code);
    await userEvent.click(screen.getByRole("button", { name: "兑换并开通" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1), { timeout: 120_000 });
    await act(async () => { localStorage.setItem(CURRENT_GROUP_KEY, "group-b"); window.dispatchEvent(new Event("creatoros:accounts-changed")); finish(reply(receipt("applied"))); });
    expect(screen.getByLabelText("原操作编号")).toHaveValue(""); expect(screen.queryByRole("status")).not.toBeInTheDocument(); expect(mockOpenExternalUrl).not.toHaveBeenCalled();
    fetchMock.mockResolvedValue(reply(receipt("expired")));
    await userEvent.type(screen.getByLabelText("原操作编号"), ref);
    await userEvent.click(screen.getByRole("button", { name: "查询原操作" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("原操作期限已到"), { timeout: 120_000 });
    expect(screen.queryByRole("button", { name: "兑换并开通" })).not.toBeInTheDocument(); expect(screen.queryByRole("button", { name: "恢复原操作" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("原操作编号")).toHaveValue(ref);
  }, 180_000);
});

describe("T1278 settings authority 真实账户状态传卡片", () => {
  it.each(["ready", "not_configured", "unverified"] as const)("账户%s按安全authority保留，与合成hasSecret独立", async (managedAccountStatus) => {
    const { sanitizeModelAuthorityForClient } = await import("./settings-page");
    const { SettingsModelRegion } = await import("./settings-model-region");
    const raw = { authority: "channel" as const, outcome: "configured" as const, action: "原目录", managedAccountStatus, capabilities: {}, services: [{ serviceId: "omnihi-main", serviceName: "private-provider", credentialSource: "activation_managed" as const, hasSecret: true, portalUrl: null, purchaseUrl: null, rechargeUrl: null, helpUrl: null }] };
    const safe = sanitizeModelAuthorityForClient(raw);
    expect(safe?.managedAccountStatus).toBe(managedAccountStatus);
    expect(safe?.services?.[0].serviceId).toBe("managed-ai-credits");
    expect(safe?.services?.[0].hasSecret).toBe(true); // 保旧合成接口；账户按钮不能消费它猜ready。
    expect(JSON.stringify(safe)).not.toContain("omnihi-main"); expect(JSON.stringify(safe)).not.toContain("private-provider");
    rtlRender(<SettingsModelRegion viewModel={VM} modelAuthority={safe} highlight={null}/>);
    const button = screen.queryByRole("button", { name: "查看 AI 额度与消耗" });
    if (managedAccountStatus === "not_configured") expect(button).not.toBeInTheDocument(); else expect(button).toBeInTheDocument();
    expect(screen.getByText("使用充值码开通官方额度")).toBeInTheDocument();
    expect(mockClient.putModel).not.toHaveBeenCalled(); expect(mockClient.putModelRouting).not.toHaveBeenCalled();
  }, 180_000);
});
