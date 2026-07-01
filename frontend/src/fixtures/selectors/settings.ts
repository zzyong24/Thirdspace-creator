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
    // Multimodal (image / video) generation model config (SPEC 2026-07-01 M3).
    // Unconfigured by default — the recording page's AI-generate stays honestly
    // disabled until the user binds a provider/model/key here. minimax is the
    // suggested provider today (M1 shipped a minimax adapter) but the field is
    // free-form (extensible to other vendors).
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

// Deterministic fixture fallback (item B — real shape: bytes, not GB). The
// `(creator)/settings` route overlays the real `settings.storage.get` values;
// this fixture only keeps SSR non-empty before the read resolves.
function buildStorage(): StorageState {
  return {
    backend: "local",
    rootPath: "~/CreatorOS/media",
    usedBytes: 18_000_000_000,
    totalBytes: 64_000_000_000,
    breakdown: [
      { assetType: "video", label: "视频素材", bytes: 9_200_000_000, tone: "brand" },
      { assetType: "image", label: "图片素材", bytes: 4_400_000_000, tone: "success" },
      { assetType: "audio", label: "音频素材", bytes: 2_100_000_000, tone: "warning" },
      { assetType: "document", label: "文档与导出", bytes: 2_300_000_000, tone: "neutral" },
    ],
  };
}
