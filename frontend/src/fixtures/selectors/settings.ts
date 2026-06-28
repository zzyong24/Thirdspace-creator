/**
 * Settings selector.
 *
 * Maps the canonical dataset to the `SettingsViewModel` consumed by the
 * Settings page. Pure and deterministic — no `Date.now`, `Math.random`
 * or network access. The page imports `buildSettingsViewModel` from
 * `@/fixtures/selectors` and never dereferences `canonicalDataset` for
 * data shaping.
 */

import { canonicalDataset } from "../canonical";
import type {
  AccountInformation,
  SettingsViewModel,
  StorageState,
} from "@/features/settings/settings-page";

// ---------------------------------------------------------------------------
// View model — derived from canonical dataset, with deterministic
// fallbacks so the page is never empty.
// ---------------------------------------------------------------------------

export function buildSettingsViewModel(): SettingsViewModel {
  const user = canonicalDataset.user;
  const preferences =
    canonicalDataset.userPreferences[0] ??
    {
      id: "pref-fallback",
      userId: user.id,
      defaultHome: "dashboard",
      defaultCreationMode: "guided" as const,
      defaultVisibility: "private" as const,
      autosaveEnabled: true,
      fileNamingRule: "{project}-{stage}-{date}",
      analyticsEnabled: true,
    };

  return {
    account: buildAccount(user),
    preferences: {
      defaultHome: preferences.defaultHome,
      defaultCreationMode: preferences.defaultCreationMode,
      defaultVisibility: preferences.defaultVisibility,
      autosaveEnabled: preferences.autosaveEnabled,
      analyticsEnabled: preferences.analyticsEnabled,
    },
    system: {
      theme: "system",
      density: "comfortable",
      notifications: true,
      locale: user.locale,
    },
    storage: buildStorage(),
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
}

function buildAccount(user: {
  displayName: string;
  email: string;
  timezone: string;
  locale: string;
}): AccountInformation {
  const initials = computeInitials(user.displayName);
  return {
    displayName: user.displayName,
    email: user.email,
    initials,
    // planLabel + 已验证 badge stay intentionally inert (decorative) —
    // no billing/verification entity exists in Wave 0 (Module 00, Task 12).
    planLabel: "个人版",
    timezone: user.timezone,
    locale: user.locale,
  };
}

function computeInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 1);
  return `${parts[0]!.charAt(0)}${parts[parts.length - 1]!.charAt(0)}`.toUpperCase();
}

function buildStorage(): StorageState {
  return {
    usedGb: 18,
    totalGb: 64,
    breakdown: [
      { id: "st-video", label: "视频素材", valueGb: 9.2, tone: "brand" },
      { id: "st-image", label: "图片素材", valueGb: 4.4, tone: "success" },
      { id: "st-audio", label: "音频素材", valueGb: 2.1, tone: "warning" },
      { id: "st-doc", label: "文档与导出", valueGb: 2.3, tone: "neutral" },
    ],
  };
}
