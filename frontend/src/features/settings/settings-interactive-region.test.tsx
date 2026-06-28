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
};
vi.mock("@/lib/contract-client", () => ({
  client: {
    patchPreferences: (input: unknown) => mockClient.patchPreferences(input),
    putModel: (input: unknown) => mockClient.putModel(input),
    patchProfile: (input: unknown) => mockClient.patchProfile(input),
  },
}));

import {
  SettingsMainColumn,
  SettingsRailColumn,
} from "./settings-interactive-region";
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
  storage: { usedGb: 18, totalGb: 64, breakdown: [] },
  model: {
    capability: "default",
    provider: "anthropic",
    modelName: "claude-opus-4-8",
    baseUrl: "",
    apiFormat: "anthropic",
    hasSecret: false,
    temperature: 0.6,
  },
};

beforeEach(() => {
  mockRouter.refresh.mockClear();
  mockClient.patchPreferences.mockClear();
  mockClient.putModel.mockClear();
  mockClient.patchProfile.mockClear();
});

afterEach(() => cleanup());

describe("Settings island wiring (needs-backend → op + refresh)", () => {
  it("toggling 自动保存 calls patchPreferences({ autosaveEnabled }) then router.refresh()", async () => {
    const { container } = render(<SettingsMainColumn viewModel={VM} />);
    const sw = container.querySelector(
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
    const { container } = render(<SettingsMainColumn viewModel={VM} />);
    const input = container.querySelector(
      '[data-slot="account-nickname-input"]',
    ) as HTMLInputElement;
    const save = container.querySelector(
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
    const { container } = render(<SettingsMainColumn viewModel={VM} />);
    const sw = container.querySelector(
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
    const { container } = render(<SettingsRailColumn viewModel={VM} />);
    const provider = container.querySelector(
      '[data-slot="model-provider-input"]',
    ) as HTMLInputElement;
    const modelName = container.querySelector(
      '[data-slot="model-name-input"]',
    ) as HTMLInputElement;
    const baseUrl = container.querySelector(
      '[data-slot="model-base-url-input"]',
    ) as HTMLInputElement;
    const secret = container.querySelector(
      '[data-slot="model-secret-input"]',
    ) as HTMLInputElement;
    const temperature = container.querySelector(
      '[data-slot="model-temperature-input"]',
    ) as HTMLInputElement;
    const save = container.querySelector(
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

  it("omits the secret when left blank (a re-save keeps the stored key)", async () => {
    const VM_WITH_SECRET: SettingsViewModel = {
      ...VM,
      model: { ...VM.model, hasSecret: true },
    };
    const { container } = render(
      <SettingsRailColumn viewModel={VM_WITH_SECRET} />,
    );
    const modelName = container.querySelector(
      '[data-slot="model-name-input"]',
    ) as HTMLInputElement;
    const save = container.querySelector(
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
});
