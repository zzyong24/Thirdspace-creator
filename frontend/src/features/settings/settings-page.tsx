/**
 * Settings page (Task 25 / page-specs §17).
 *
 * The `/settings` global resource-center landing page. Composes, in
 * the spec order:
 *
 *   SettingsPage
 *   ├── SettingsTabs                  (8 tabs in approved order)
 *   └── SettingsGrid
 *       ├── MainSettings              (AccountInformationCard →
 *       │                               PreferenceSettingsCard →
 *       │                               SystemSettingsCard)
 *       └── SettingsRail              (StorageUsageCard →
 *                                       ModelConfigurationCard →
 *                                       OtherSettingsCard)
 *
 * Layout invariants (page-specs §17, D-003, D-005):
 *  - The route is a global resource-center route. The Header region
 *    is in `global` mode with the page title "设置" and description
 *    "账号、偏好与系统" (configured by `(creator)/shell-router.tsx`).
 *  - The shared Sidebar uses the approved `assistant` contextual-card
 *    variant (D-003). The page itself does NOT render the global
 *    Sidebar — that lives in `(creator)/layout.tsx`.
 *  - The SettingsTabs strip renders 8 tabs in the approved order
 *    (page-specs §17 "顶部设置 Tab 保持八项及顺序").
 *  - The SettingsGrid is a two-column grid (left wide / right narrow).
 *  - The MainSettings column stacks Account → Preference → System
 *    vertically (page-specs §17 "账户信息、偏好设置、系统设置
 *    纵向排列").
 *  - The SettingsRail column stacks Storage → Model → Other
 *    vertically (page-specs §17 "存储空间、模型配置、导入导出和
 *    删除账户位于右栏").
 *  - Form rows follow the "label + control" compact pattern.
 *  - No team / permission / collaboration settings are added
 *    (D-001 + page-specs §17 "禁止改变": "不新增团队或权限设置").
 *  - No subscription detail page is added (page-specs §17
 *    "禁止改变": "不增加订阅管理详情页").
 *  - ModelConfigurationCard stays on this page — NOT a separate route
 *    (page-specs §17 "禁止改变": "不把模型配置移到独立页面").
 *  - Controls have fixture-only local state. No server persistence.
 *  - No new dependencies, no fixture mutation, no Date.now /
 *    Math.random / network access.
 *
 * The page is a Server Component. It does not own a Sidebar or a
 * TopHeader — those live in `(creator)/layout.tsx` and are mounted
 * once for the whole route group.
 */

import * as React from "react";

import { PageTabs } from "@/components/navigation/page-tabs";
import { canonicalDataset } from "@/fixtures/canonical";

import {
  SettingsMainColumn,
  SettingsRailColumn,
} from "./settings-interactive-region";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface SettingsPageProps {
  /**
   * Override hook for tests; defaults to the canonical dataset.
   * The page does not consume network or runtime data — it pulls
   * everything from the fixed fixtures (D-010) so SSR output is
   * deterministic.
   */
  readonly viewModel?: SettingsViewModel;
}

export interface SettingsViewModel {
  readonly account: AccountInformation;
  readonly preferences: PreferencesState;
  readonly system: SystemState;
  readonly storage: StorageState;
  readonly model: ModelState;
}

export interface AccountInformation {
  readonly displayName: string;
  readonly email: string;
  readonly initials: string;
  readonly planLabel: string;
  readonly timezone: string;
}

export interface PreferencesState {
  readonly defaultHome: string;
  readonly defaultCreationMode: "guided" | "flexible" | "freeform";
  readonly defaultVisibility: "private" | "unlisted" | "public";
  readonly autosaveEnabled: boolean;
  readonly analyticsEnabled: boolean;
}

export interface SystemState {
  readonly theme: "system" | "light" | "dark";
  readonly density: "comfortable" | "compact";
  readonly notifications: boolean;
  readonly locale: string;
}

export interface StorageState {
  readonly usedGb: number;
  readonly totalGb: number;
  readonly breakdown: ReadonlyArray<StorageBreakdownRow>;
}

export interface StorageBreakdownRow {
  readonly id: string;
  readonly label: string;
  readonly valueGb: number;
  readonly tone: "neutral" | "brand" | "success" | "warning";
}

export interface ModelState {
  readonly provider: "anthropic" | "openai" | "google";
  readonly model: "claude-sonnet" | "gpt-4o" | "gemini-2";
  readonly temperature: number;
}

// ---------------------------------------------------------------------------
// SettingsTabs — 8 tabs in the approved order
// ---------------------------------------------------------------------------

const SETTINGS_TABS: ReadonlyArray<{ id: string; label: string }> = [
  { id: "account", label: "账户" },
  { id: "preferences", label: "偏好" },
  { id: "notifications", label: "通知" },
  { id: "appearance", label: "外观" },
  { id: "integrations", label: "集成" },
  { id: "storage", label: "存储" },
  { id: "data", label: "数据" },
  { id: "about", label: "关于" },
];

// ---------------------------------------------------------------------------
// View model — derived from canonical dataset, with deterministic
// fallbacks so the page is never empty.
// ---------------------------------------------------------------------------

function buildSettingsViewModel(): SettingsViewModel {
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
    account: buildAccount(user.displayName),
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
      provider: "anthropic",
      model: "claude-sonnet",
      temperature: 0.6,
    },
  };
}

function buildAccount(displayName: string): AccountInformation {
  const initials = computeInitials(displayName);
  return {
    displayName,
    email: "zyongzhu@creatoros.local",
    initials,
    planLabel: "个人版",
    timezone: "Asia/Shanghai",
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

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function SettingsPage({ viewModel }: SettingsPageProps = {}) {
  const vm = viewModel ?? buildSettingsViewModel();
  return (
    <main
      data-app="creatoros"
      data-page="settings"
      data-settings-id="settings-root"
      className="flex flex-col gap-section-gap"
    >
      <SettingsTabsRow />
      <div
        data-slot="settings-grid"
        className="grid grid-cols-1 gap-card-gap lg:grid-cols-[minmax(0,1fr)_304px]"
      >
        <SettingsMainColumn viewModel={vm} />
        <SettingsRailColumn viewModel={vm} />
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// SettingsTabsRow — 8 tabs in the approved order
// ---------------------------------------------------------------------------

function SettingsTabsRow() {
  return (
    <div
      data-slot="settings-tabs"
      aria-label="设置分类导航"
      className="border-b border-border/50 pb-1.5"
    >
      <PageTabs
        tabs={SETTINGS_TABS}
        defaultValue={SETTINGS_TABS[0]!.id}
        ariaLabel="设置分类导航"
      />
    </div>
  );
}
