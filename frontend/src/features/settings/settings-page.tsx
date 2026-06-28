/**
 * Settings page (Task 25 / page-specs §17).
 *
 * The `/settings` global resource-center landing page. Composes, in
 * the spec order:
 *
 *   SettingsPage
 *   ├── SettingsTabs                  (5 tabs in approved order)
 *   └── SettingsGrid
 *       ├── MainSettings              (AccountInformationCard →
 *       │                               PreferenceSettingsCard →
 *       │                               SystemSettingsCard)
 *       └── SettingsRail              (StorageUsageCard →
 *                                       ModelConfigurationCard)
 *
 * Layout invariants (page-specs §17, D-003, D-005):
 *  - The route is a global resource-center route. The Header region
 *    is in `global` mode with the page title "设置" and description
 *    "账号、偏好与系统" (configured by `(creator)/shell-router.tsx`).
 *  - The shared Sidebar uses the approved `assistant` contextual-card
 *    variant (D-003). The page itself does NOT render the global
 *    Sidebar — that lives in `(creator)/layout.tsx`.
 *  - The SettingsTabs strip renders 5 tabs in the approved order
 *    (account / preferences / appearance / integrations / storage).
 *  - The SettingsGrid is a two-column grid (left wide / right narrow).
 *  - The MainSettings column stacks Account → Preference → System
 *    vertically (page-specs §17 "账户信息、偏好设置、系统设置
 *    纵向排列").
 *  - The SettingsRail column stacks Storage → Model vertically
 *    (page-specs §17 "存储空间、模型配置位于右栏").
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

import { buildSettingsViewModel } from "@/fixtures/selectors";

import {
  SettingsMainColumn,
  SettingsRailColumn,
  SettingsTabsNav,
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
  /**
   * Real logged-in identity (Module 00, Task 12). When supplied (by the
   * `(creator)/settings` route, which resolves the session through the
   * identity service — the `userResource` shape `settings.get` will
   * serve in Wave 1), the account card's display name / email / timezone
   * / locale come from the REAL user instead of the fixture default. The
   * preference / system / storage / model rows stay fixture-derived
   * (their persistence is the Settings module, Wave 1). Omitted in unit
   * tests, which inject the full `viewModel` directly.
   */
  readonly identity?: SettingsIdentity;
  /**
   * Real DB-backed model config for the "default" capability (read by the
   * `(creator)/settings` route via `settings.models.list`). When supplied, the
   * model card reflects the stored provider / model / baseUrl / format /
   * hasSecret instead of the fixture default. Omitted in unit tests.
   */
  readonly model?: ModelState;
}

/** The identity fields the Settings account card binds to (`userResource`). */
export interface SettingsIdentity {
  readonly displayName: string;
  readonly email: string;
  readonly timezone: string;
  readonly locale: string;
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
  /**
   * BCP-47 locale tag from the user's identity (`userResource.locale`).
   * Rendered as a real identity chip (Module 00, Task 12); the 已验证
   * badge + plan chip stay intentionally inert (decorative).
   */
  readonly locale: string;
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
  /** The configured capability — the card pins to the global "default". */
  readonly capability: string;
  /** Free-form provider name (bind any vendor). */
  readonly provider: string;
  /** Free-form model id (e.g. claude-opus-4-8 / MiniMax-M3). */
  readonly modelName: string;
  /** Custom baseUrl (relay / MiniMax); "" = official default. */
  readonly baseUrl: string;
  /** Wire/auth format. */
  readonly apiFormat: "anthropic" | "openai_chat";
  /** Masked: a secret is configured (raw value never sent to the client). */
  readonly hasSecret: boolean;
  readonly temperature: number;
}

// ---------------------------------------------------------------------------
// SettingsTabs — 5 tabs in the approved order
// ---------------------------------------------------------------------------

const SETTINGS_TABS: ReadonlyArray<{ id: string; label: string }> = [
  { id: "account", label: "账户" },
  { id: "preferences", label: "偏好" },
  { id: "appearance", label: "外观" },
  { id: "integrations", label: "集成" },
  { id: "storage", label: "存储" },
];

// ---------------------------------------------------------------------------
// Identity overlay (Module 00, Task 12)
// ---------------------------------------------------------------------------

/**
 * Overlay the real logged-in identity onto the account card of a base
 * view model. Pure — no `Date.now` / `Math.random` / network. Only the
 * account display fields are replaced; everything else is untouched.
 */
function applyIdentity(
  base: SettingsViewModel,
  identity: SettingsIdentity,
): SettingsViewModel {
  return {
    ...base,
    account: {
      ...base.account,
      displayName: identity.displayName,
      email: identity.email,
      timezone: identity.timezone,
      locale: identity.locale,
      initials: computeAccountInitials(identity.displayName),
    },
    system: {
      ...base.system,
      locale: identity.locale,
    },
  };
}

function computeAccountInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 1).toUpperCase();
  return `${parts[0]!.charAt(0)}${parts[parts.length - 1]!.charAt(0)}`.toUpperCase();
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function SettingsPage({
  viewModel,
  identity,
  model,
}: SettingsPageProps = {}) {
  const base = viewModel ?? buildSettingsViewModel();
  const withIdentity = identity ? applyIdentity(base, identity) : base;
  const vm = model ? { ...withIdentity, model } : withIdentity;
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
      {/* Controlled tab strip: selecting a tab scrolls to and highlights its
          matching settings section (real partitioned navigation), instead of
          the prior decorative no-op tabs. */}
      <SettingsTabsNav tabs={SETTINGS_TABS} defaultValue={SETTINGS_TABS[0]!.id} />
    </div>
  );
}
