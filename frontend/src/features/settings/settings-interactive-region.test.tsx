/**
 * Settings island wiring tests (Settings module Step 5).
 *
 * Proves the needs-backend controls call their mapped contract op and then
 * `router.refresh()` (the island → client.* → router.refresh seam). The
 * structural/order assertions live in
 * settings-page.test.tsx; here we only assert the mutation wiring.
 */

import * as React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockRouter = { refresh: vi.fn(), push: vi.fn(), replace: vi.fn() };
// [T-132] SettingsDialog 读 ?highlight;默认无 query(highlight 相关测试各自覆盖 mock)。
let mockSearchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
  useSearchParams: () => mockSearchParams,
}));

const mockClient = {
  patchPreferences: vi.fn((input: unknown): Promise<unknown> => Promise.resolve(input)),
  putModel: vi.fn((input: unknown): Promise<unknown> => Promise.resolve(input)),
  patchProfile: vi.fn((input: unknown): Promise<unknown> => Promise.resolve(input)),
  putStorage: vi.fn((input: unknown): Promise<unknown> => Promise.resolve(input)),
  // AccountBindingCard (T-032a): status pull on mount + loginDouyin on click.
  statusDouyin: vi.fn(
    (_input: unknown): Promise<{ loggedIn: boolean; sourceReady?: boolean }> =>
      Promise.resolve({ loggedIn: false }),
  ),
  loginDouyin: vi.fn(
    (_input: unknown): Promise<{ loggedIn: boolean }> =>
      Promise.resolve({ loggedIn: true }),
  ),
  // [T-377] 测试连接(settings.models.test):默认 ✓ 连通;失败态各测试自行覆盖。
  testModelConnection: vi.fn(
    (
      _input: unknown,
    ): Promise<{
      ok: boolean;
      detail: string;
      status?: "ok" | "warn" | "fail";
    }> =>
      Promise.resolve({ ok: true, detail: "已发 1 token 真实补全,连通。" }),
  ),
};
vi.mock("@/lib/contract-client", () => ({
  client: {
    patchPreferences: (input: unknown) => mockClient.patchPreferences(input),
    putModel: (input: unknown) => mockClient.putModel(input),
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
    // [T-086] 文案审核模型(测试 fixture 默认未配置)。
    review: {
      capability: "script.review" as const,
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

beforeEach(() => {
  mockSearchParams = new URLSearchParams();
  mockRouter.refresh.mockClear();
  mockClient.patchPreferences.mockClear();
  mockClient.putModel.mockClear();
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

describe("Settings island wiring (needs-backend → op + refresh)", () => {
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

  it("[T-325] 备用对话卡(chat.fallback)复用预设:回显匹配 + 候选切换", () => {
    const doc = renderDialog({
      ...VM,
      multimodalModels: {
        ...VM.multimodalModels,
        fallback: {
          ...VM.multimodalModels.fallback,
          baseUrl: "https://api.deepseek.com",
          apiFormat: "openai_chat" as const,
        },
      },
    });
    const trigger = doc.querySelector(
      '[data-slot="multimodal-fallback-preset-trigger"]',
    ) as HTMLElement;
    expect(trigger).not.toBeNull();
    expect(trigger.textContent ?? "").toContain("DeepSeek");
    const dl = doc.querySelector(
      "#multimodal-fallback-model-suggestions",
    ) as HTMLDataListElement;
    // [T-377] 候选去硬编码 → 恒空(模型名自由填)。
    expect(Array.from(dl.querySelectorAll("option")).map((o) => o.value)).toEqual(
      [],
    );
    // 预设行只挂在 fallback 卡,其它文本模态卡(如文生图)不渲染。
    expect(
      doc.querySelector('[data-slot="multimodal-image-preset-trigger"]'),
    ).toBeNull();
  });

  // --- Multimodal model config (SPEC 2026-07-01 M3) -------------------------

  // [T-379] 生图去 MiniMax 唯一:provider 候选加 openai(OpenAI 兼容 images API,中转站
  // 通用),帮助文案如实列内置适配;生视频文案如实「仅 minimax,Sora/Veo/Kling 待适配」。
  it("文生图 provider 候选含 openai + 文案列内置适配;文生视频文案如实仅 minimax", () => {
    const doc = renderDialog();
    const imageOptions = Array.from(
      doc.querySelectorAll("#multimodal-image-provider-suggestions option"),
    ).map((o) => (o as HTMLOptionElement).value);
    expect(imageOptions).toEqual(["openai", "minimax"]);
    expect(doc.body.textContent).toContain(
      "内置适配:minimax / openai 兼容(中转站通用)",
    );

    const videoOptions = Array.from(
      doc.querySelectorAll("#multimodal-video-provider-suggestions option"),
    ).map((o) => (o as HTMLOptionElement).value);
    expect(videoOptions).toEqual(["minimax"]);
    expect(doc.body.textContent).toContain(
      "内置适配:minimax;Sora / Veo / Kling 等需后续适配",
    );
  });

  it("saving the 文生图 form PUTs the image.generate capability (provider/model/baseUrl/secret, no apiFormat/temperature)", async () => {
    const doc = renderDialog();
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
    const doc = renderDialog();
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
        review: VM.multimodalModels.review,
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

  it("[T-489] ASR 是更多能力第一项，必配标题旁提供可读的模型配置手册", async () => {
    const user = userEvent.setup();
    const doc = renderDialog();
    const moreBody = doc.querySelector('[data-slot="models-more-body"]');
    expect(
      moreBody?.firstElementChild
        ?.querySelector("[data-capability]")
        ?.getAttribute("data-capability"),
    ).toBe("transcribe.audio");

    await user.click(screen.getByRole("tab", { name: "模型配置" }));
    await user.click(screen.getByRole("button", { name: "打开模型配置手册" }));
    const manual = await screen.findByRole("dialog", { name: "模型配置手册" });
    expect(manual.textContent).toContain("先选供应商");
    expect(manual.textContent).toContain("接口地址");
    expect(manual.textContent).toContain("接口格式");
    expect(manual.textContent).toContain("API 密钥");
    expect(manual.textContent).toContain("语音转文字");
    expect(
      manual.querySelector('[data-slot="model-manual-figure-default"]'),
    ).not.toBeNull();
    expect(
      manual.querySelector('[data-slot="model-manual-figure-asr"]'),
    ).not.toBeNull();
  });

  it("renders the 逐字稿(audio) card without regressing the image/video cards", async () => {
    const doc = renderDialog();
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
    // [T-470] 空 DB 行必须保持真实空值；提示值明确写“示例”，不能看起来像已保存配置。
    expect(provider.value).toBe("");
    expect(model.value).toBe("");
    expect(baseUrl.value).toBe("");
    expect(provider.placeholder).toContain("示例");
    expect(model.placeholder).toContain("示例");
    expect(baseUrl.placeholder).toContain("示例");
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
    const save = doc.querySelector(
      '[data-slot="multimodal-audio-save"]',
    ) as HTMLButtonElement;
    // Unconfigured → save disabled until provider + model filled.
    expect(save.disabled).toBe(true);

    fireEvent.change(provider, { target: { value: "siliconflow" } });
    fireEvent.change(modelName, {
      target: { value: "FunAudioLLM/SenseVoiceSmall" },
    });
    fireEvent.change(baseUrl, {
      target: { value: "https://api.siliconflow.cn/v1" },
    });
    expect(save.disabled).toBe(false);
    fireEvent.click(save);

    await waitFor(() => expect(mockClient.putModel).toHaveBeenCalledTimes(1));
    const call = mockClient.putModel.mock.calls[0]![0] as {
      params: { capability: string };
      body: Record<string, unknown>;
    };
    expect(call.params).toEqual({ capability: "transcribe.audio" });
    expect(call.body).toEqual({
      provider: "siliconflow",
      modelName: "FunAudioLLM/SenseVoiceSmall",
      baseUrl: "https://api.siliconflow.cn/v1",
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
  it("主模型卡点「测试连接」→ testModelConnection({capability:'default'}),成功渲 ✓ 连通", async () => {
    const doc = renderDialog();
    const btn = doc.querySelector(
      '[data-slot="model-test-connection"]',
    ) as HTMLButtonElement;
    expect(btn).not.toBeNull();
    fireEvent.click(btn);
    await waitFor(() =>
      expect(mockClient.testModelConnection).toHaveBeenCalledTimes(1),
    );
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

  it("[T-470] 未配云端 ASR 时显示中性本地回退说明，不出现绿色连通勾", async () => {
    mockClient.testModelConnection.mockResolvedValueOnce({
      ok: true,
      status: "warn",
      detail: "未配置云端 ASR，当前使用本地 Whisper。",
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
    expect(result.textContent ?? "").toContain("当前使用本地 Whisper");
    expect(result.textContent ?? "").not.toContain("✓ 连通");
  });
});
