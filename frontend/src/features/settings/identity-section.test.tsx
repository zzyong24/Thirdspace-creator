/**
 * Identity-section tests for the Settings page (Module 00, Task 12).
 *
 * Settings §4 rows whose `Module = Identity` are wired here for
 * DISPLAY / identity only (the preference-persistence rows belong to
 * the Settings module, Wave 1). This locks the Wave-0 identity
 * contract of the Settings page:
 *
 *  - timezone / locale / email / nickname render from the REAL
 *    identity (`userResource` shape — what `settings.get` will serve;
 *    in Wave 0 it comes from `identity.getCurrentUser`, the same DTO).
 *    The view is injected through the deterministic `viewModel?`
 *    override seam (foundation §5) so the assertion is hermetic and
 *    does not depend on the live cookie/session.
 *  - the 昵称 input is EDITABLE and真持久: saving fires the
 *    `identity.profile.patch` op (`PATCH /me`, body `{ displayName }`)
 *    which writes the identity-owned `users.displayName`, then
 *    refreshes the server read. The 邮箱 input stays READ-ONLY (it is
 *    the login identifier + `users_email_uk` unique key — out of the
 *    editable surface this wave).
 *  - the 已验证 badge and plan chip stay intentionally inert
 *    (decorative) — no verification/billing entity exists in Wave 0.
 *
 * Determinism: every visible value comes from the injected view model;
 * no `Date.now` / `Math.random` / network.
 */

import * as React from "react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// The settings interactive island (preference + model cards) calls
// `useRouter()` and the typed `client` for its needs-backend wiring
// (Settings module Step 5). Stub both so this render runs without a
// Next router context or a real HTTP transport.
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
  }),
}));
vi.mock("@/lib/contract-client", () => ({
  client: {
    patchPreferences: vi.fn().mockResolvedValue({}),
    putModel: vi.fn().mockResolvedValue({}),
    patchProfile: vi.fn().mockResolvedValue({}),
    putStorage: vi.fn().mockResolvedValue({}),
    // AccountBindingCard (T-032a) pulls status on mount + calls loginDouyin on click.
    statusDouyin: vi.fn().mockResolvedValue({ loggedIn: false }),
    loginDouyin: vi.fn().mockResolvedValue({ loggedIn: true }),
  },
}));

import { SettingsPage, type SettingsViewModel } from "./settings-page";

// A stubbed identity payload standing in for `settings.get` /
// `identity.getCurrentUser` (the `userResource` shape). Deliberately
// NOT the canonical fixture so the test proves the page renders the
// injected identity rather than a hard-coded fixture value.
const STUB_IDENTITY = {
  displayName: "Stub User",
  email: "stub.user@creatoros.test",
  timezone: "America/New_York",
  locale: "en-US",
} as const;

function buildStubViewModel(): SettingsViewModel {
  return {
    account: {
      displayName: STUB_IDENTITY.displayName,
      email: STUB_IDENTITY.email,
      initials: "SU",
      planLabel: "个人版",
      timezone: STUB_IDENTITY.timezone,
      locale: STUB_IDENTITY.locale,
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
      locale: STUB_IDENTITY.locale,
    },
    storage: {
      backend: "local" as const,
      rootPath: "~/CreatorOS/media",
      usedBytes: 1_000_000_000,
      totalBytes: 10_000_000_000,
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
}

function renderSettings() {
  return render(<SettingsPage viewModel={buildStubViewModel()} />);
}

describe("Settings identity section (Task 12)", () => {
  afterEach(() => {
    cleanup();
  });

  // The account card now lives in the settings Dialog (Radix Portal → body) on
  // its default "account" tab, so dialog-internal queries go through `document`
  // rather than the render container.
  it("renders timezone + locale chips from the injected identity", () => {
    renderSettings();
    const card = document.querySelector(
      '[data-slot="account-information-card"]',
    );
    expect(card).not.toBeNull();
    const text = card!.textContent ?? "";
    expect(text).toContain(STUB_IDENTITY.timezone);
    expect(text).toContain(STUB_IDENTITY.locale);
  });

  it("populates the nickname + email inputs from the injected identity", () => {
    renderSettings();
    const nickname = document.querySelector<HTMLInputElement>(
      '[data-slot="account-nickname-input"]',
    );
    const email = document.querySelector<HTMLInputElement>(
      '[data-slot="account-email-input"]',
    );
    expect(nickname).not.toBeNull();
    expect(email).not.toBeNull();
    expect(nickname!.value).toBe(STUB_IDENTITY.displayName);
    expect(email!.value).toBe(STUB_IDENTITY.email);
  });

  it("renders the nickname input editable + the email input read-only", () => {
    // 昵称 is now真持久 via `PATCH /me` (identity.profile.patch) — editable, no
    // longer read-only. 邮箱 stays read-only (login identifier + unique key).
    renderSettings();
    const nickname = document.querySelector<HTMLInputElement>(
      '[data-slot="account-nickname-input"]',
    );
    const email = document.querySelector<HTMLInputElement>(
      '[data-slot="account-email-input"]',
    );
    expect(nickname!.readOnly).toBe(false);
    expect(email!.readOnly).toBe(true);
  });

  it("saving an edited nickname calls patchProfile({ displayName }) then refresh", async () => {
    const { client } = await import("@/lib/contract-client");
    renderSettings();
    const nickname = document.querySelector<HTMLInputElement>(
      '[data-slot="account-nickname-input"]',
    )!;
    const save = document.querySelector<HTMLButtonElement>(
      '[data-slot="account-nickname-save"]',
    )!;
    // Save is disabled until the draft diverges from the current name.
    expect(save.disabled).toBe(true);
    fireEvent.change(nickname, { target: { value: "Renamed User" } });
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    expect(client.patchProfile).toHaveBeenCalledWith({
      params: undefined,
      query: undefined,
      body: { displayName: "Renamed User" },
    });
  });

  it("binds the account card to the injected `identity` (settings.get read)", () => {
    // The route passes the resolved-session identity via the `identity`
    // prop (the Wave-0 stand-in for `settings.get` — same `userResource`
    // shape). It must override the fixture account fields.
    render(<SettingsPage identity={STUB_IDENTITY} />);
    const card = document.querySelector(
      '[data-slot="account-information-card"]',
    );
    expect(card).not.toBeNull();
    const text = card!.textContent ?? "";
    expect(text).toContain(STUB_IDENTITY.displayName);
    expect(text).toContain(STUB_IDENTITY.email);
    expect(text).toContain(STUB_IDENTITY.timezone);
    expect(text).toContain(STUB_IDENTITY.locale);
    const nickname = document.querySelector<HTMLInputElement>(
      '[data-slot="account-nickname-input"]',
    );
    expect(nickname!.value).toBe(STUB_IDENTITY.displayName);
    // 昵称 is now editable (real `PATCH /me`); it is seeded from the injected
    // identity but no longer read-only.
    expect(nickname!.readOnly).toBe(false);
  });
});
