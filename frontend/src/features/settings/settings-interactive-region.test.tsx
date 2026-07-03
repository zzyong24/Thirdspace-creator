/**
 * Settings island wiring tests (Settings module Step 5).
 *
 * Proves the needs-backend controls call their mapped contract op and then
 * `router.refresh()` (the island → client.* → router.refresh seam, mirroring
 * project-overview/project-actions.test). The structural/order assertions live in
 * settings-page.test.tsx; here we only assert the mutation wiring.
 */

import * as React from "react";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockRouter = { refresh: vi.fn(), push: vi.fn(), replace: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => mockRouter }));

const mockClient = {
  patchPreferences: vi.fn((input: unknown): Promise<unknown> => Promise.resolve(input)),
  putModel: vi.fn((input: unknown): Promise<unknown> => Promise.resolve(input)),
  patchProfile: vi.fn((input: unknown): Promise<unknown> => Promise.resolve(input)),
  putStorage: vi.fn((input: unknown): Promise<unknown> => Promise.resolve(input)),
  // AccountBindingCard (T-032a): status pull on mount + loginDouyin on click.
  statusDouyin: vi.fn(
    (_input: unknown): Promise<{ loggedIn: boolean }> =>
      Promise.resolve({ loggedIn: false }),
  ),
  loginDouyin: vi.fn(
    (_input: unknown): Promise<{ loggedIn: boolean }> =>
      Promise.resolve({ loggedIn: true }),
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
    defaultHome: "dashboard",
    defaultCreationMode: "guided",
    defaultVisibility: "private",
    autosaveEnabled: true,
    analyticsEnabled: true,
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
  },
  douyinAccount: { loggedIn: false },
};

beforeEach(() => {
  mockRouter.refresh.mockClear();
  mockClient.patchPreferences.mockClear();
  mockClient.putModel.mockClear();
  mockClient.patchProfile.mockClear();
  mockClient.putStorage.mockClear();
  mockClient.statusDouyin.mockClear();
  mockClient.statusDouyin.mockResolvedValue({ loggedIn: false });
  mockClient.loginDouyin.mockClear();
  mockClient.loginDouyin.mockResolvedValue({ loggedIn: true });
});

afterEach(() => cleanup());

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

  it("toggling 使用情况分析 PATCHes only its own key", async () => {
    const doc = renderDialog();
    const sw = doc.querySelector(
      '[data-slot="pref-analytics-switch"]',
    ) as HTMLElement;
    fireEvent.click(sw);
    await waitFor(() =>
      expect(mockClient.patchPreferences).toHaveBeenCalledWith(
        expect.objectContaining({ body: { analyticsEnabled: false } }),
      ),
    );
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

  // --- Multimodal model config (SPEC 2026-07-01 M3) -------------------------

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

  it("renders the 逐字稿(audio) card without regressing the image/video cards", async () => {
    const doc = renderDialog();
    // 逐字稿(audio)卡渲出,capability=transcribe.audio。
    const audioCard = doc.querySelector('[data-slot="multimodal-audio-card"]');
    expect(audioCard).not.toBeNull();
    expect(audioCard!.getAttribute("data-capability")).toBe("transcribe.audio");
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
