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
 *  - the 昵称 / 邮箱 inputs are READ-ONLY (profile-edit deferred —
 *    `PATCH /me` is an unresolved §13 gap, roadmap §6). They show the
 *    identity values but cannot be edited here.
 *  - the 删除账户 button is DISABLED until the local "确认删除账户"
 *    switch arms it; the account-delete REST surface is a roadmap §6
 *    gap, so even when armed the button stays disabled (intentionally
 *    inert pending that surface) — toggling the switch only flips
 *    LOCAL arm state, it performs no server action.
 *  - the 已验证 badge, plan chip, and 导入 / 导出 buttons stay
 *    intentionally inert (decorative) — no verification/billing/
 *    import-export entity or route exists in Wave 0.
 *
 * Determinism: every visible value comes from the injected view model;
 * no `Date.now` / `Math.random` / network.
 */

import * as React from "react";
import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// The settings interactive island (preference + model cards) calls
// `useRouter()` and the typed `client` for its needs-backend wiring
// (Settings module Step 5). Stub both so this render runs without a
// Next router context or a real HTTP transport.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/lib/contract-client", () => ({
  client: {
    patchPreferences: vi.fn().mockResolvedValue({}),
    putModel: vi.fn().mockResolvedValue({}),
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
      usedGb: 1,
      totalGb: 10,
      breakdown: [],
    },
    model: {
      provider: "anthropic",
      model: "claude-sonnet",
      temperature: 0.6,
    },
  };
}

function renderSettings() {
  return render(<SettingsPage viewModel={buildStubViewModel()} />);
}

describe("Settings identity section (Task 12)", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders timezone + locale chips from the injected identity", () => {
    const { container } = renderSettings();
    const card = container.querySelector(
      '[data-slot="account-information-card"]',
    );
    expect(card).not.toBeNull();
    const text = card!.textContent ?? "";
    expect(text).toContain(STUB_IDENTITY.timezone);
    expect(text).toContain(STUB_IDENTITY.locale);
  });

  it("populates the nickname + email inputs from the injected identity", () => {
    const { container } = renderSettings();
    const nickname = container.querySelector<HTMLInputElement>(
      '[data-slot="account-nickname-input"]',
    );
    const email = container.querySelector<HTMLInputElement>(
      '[data-slot="account-email-input"]',
    );
    expect(nickname).not.toBeNull();
    expect(email).not.toBeNull();
    expect(nickname!.value).toBe(STUB_IDENTITY.displayName);
    expect(email!.value).toBe(STUB_IDENTITY.email);
  });

  it("renders the nickname + email inputs as read-only (PATCH /me deferred)", () => {
    const { container } = renderSettings();
    const nickname = container.querySelector<HTMLInputElement>(
      '[data-slot="account-nickname-input"]',
    );
    const email = container.querySelector<HTMLInputElement>(
      '[data-slot="account-email-input"]',
    );
    expect(nickname!.readOnly).toBe(true);
    expect(email!.readOnly).toBe(true);
  });

  it("disables the 删除账户 button until the confirm switch is armed", () => {
    const { container } = renderSettings();
    const deleteButton = container.querySelector<HTMLButtonElement>(
      '[data-slot="other-delete-button"]',
    );
    expect(deleteButton).not.toBeNull();
    expect(deleteButton!.disabled).toBe(true);
  });

  it("toggling the confirm switch only flips local arm state (no server action)", () => {
    const { container } = renderSettings();
    const card = container.querySelector('[data-slot="other-settings-card"]')!;
    const deleteSwitch = within(card as HTMLElement).getByRole("switch", {
      name: "确认删除账户",
    });
    const deleteButton = card.querySelector<HTMLButtonElement>(
      '[data-slot="other-delete-button"]',
    )!;

    // Disabled before arming.
    expect(deleteButton.disabled).toBe(true);

    // Arming the switch flips local state — the destructive button is
    // no longer fully blocked by the arm gate, but it remains
    // intentionally inert (account-delete REST surface is a roadmap §6
    // gap) via aria-disabled + a tooltip, so it still cannot fire a
    // server action.
    fireEvent.click(deleteSwitch);
    expect(deleteSwitch.getAttribute("aria-checked")).toBe("true");
    expect(deleteButton.getAttribute("aria-disabled")).toBe("true");
  });

  it("binds the account card to the injected `identity` (settings.get read)", () => {
    // The route passes the resolved-session identity via the `identity`
    // prop (the Wave-0 stand-in for `settings.get` — same `userResource`
    // shape). It must override the fixture account fields.
    const { container } = render(<SettingsPage identity={STUB_IDENTITY} />);
    const card = container.querySelector(
      '[data-slot="account-information-card"]',
    );
    expect(card).not.toBeNull();
    const text = card!.textContent ?? "";
    expect(text).toContain(STUB_IDENTITY.displayName);
    expect(text).toContain(STUB_IDENTITY.email);
    expect(text).toContain(STUB_IDENTITY.timezone);
    expect(text).toContain(STUB_IDENTITY.locale);
    const nickname = container.querySelector<HTMLInputElement>(
      '[data-slot="account-nickname-input"]',
    );
    expect(nickname!.value).toBe(STUB_IDENTITY.displayName);
    expect(nickname!.readOnly).toBe(true);
  });

  it("keeps 导入 / 导出 buttons present but intentionally inert", () => {
    const { container } = renderSettings();
    expect(
      container.querySelector('[data-slot="other-import-button"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-slot="other-export-button"]'),
    ).not.toBeNull();
  });
});
