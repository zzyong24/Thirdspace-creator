"use client";

/**
 * `settings-interactive-region.tsx` — Client island for the Settings
 * page (Task 25 / page-specs §17).
 *
 * The Settings page exposes several interactive form controls
 * (Switch toggles, Select dropdowns, Inputs) — and the spec requires
 * these to follow the "label + control" compact pattern with
 * fixture-only local state. No team / permission / subscription /
 * server persistence affordances are added (D-001 + page-specs §17
 * "禁止改变").
 *
 * The island exports two column components:
 *  - `SettingsMainColumn` (the left column of SettingsGrid) — host
 *    AccountInformationCard → PreferenceSettingsCard →
 *    SystemSettingsCard, each with `SettingsFormRow` rows that
 *    hold local Switch / Select / Input controls.
 *  - `SettingsRailColumn` (the right column of SettingsGrid) — host
 *    StorageUsageCard → ModelConfigurationCard.
 *
 * The page-level `SettingsPage` Server Component is responsible for
 * laying out the columns inside `SettingsGrid`. This island keeps
 * the page itself as a Server Component while only the interactive
 * form controls run on the client.
 *
 * Determinism: every visible value comes from the canonical fixture
 * or a hard-coded default. No `Date.now`/`Math.random`/network.
 */

import * as React from "react";
import { useRouter } from "next/navigation";

import { client } from "@/lib/contract-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { PageTabs } from "@/components/navigation/page-tabs";
import { ProgressBar } from "@/components/project/progress-bar";
import { SectionCard } from "@/components/project/section-card";
import { TagChip } from "@/components/content/tag-chip";

import type { SettingsViewModel } from "./settings-page";

// ---------------------------------------------------------------------------
// useSettingsMutation — the shared island mutation seam (plan Step 5)
// ---------------------------------------------------------------------------
//
// Every needs-backend control optimistically flips its local state, fires the
// mapped Settings op, then `router.refresh()` so the server re-reads the seeded
// repo (mirrors `project-overview/project-actions.tsx`). A `pending` guard blocks
// concurrent writes. The optimistic value is the source of truth in the control
// while the refresh round-trips; the server read confirms it on the next render.
function useSettingsMutation() {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const run = React.useCallback(
    (mutate: () => Promise<unknown>) => {
      if (pending) return;
      setPending(true);
      void (async () => {
        try {
          await mutate();
          router.refresh();
        } finally {
          setPending(false);
        }
      })();
    },
    [pending, router],
  );
  return { pending, run };
}

// The model card configures the GLOBAL DEFAULT model (capability "default"). All
// AI nodes resolve against it (resolve.ts: per-capability row → "default" row →
// env → built-in). Per-capability overrides stay an advanced surface (the
// contract + resolve already support them); the card pins to "default".
const MODEL_CAPABILITY = "default";

// ---------------------------------------------------------------------------
// Local appearance persistence (GAP-SET-1 — theme/density made真持久)
// ---------------------------------------------------------------------------
//
// The `settings.preferences.patch` contract op has NO theme/density field, so
// these two appearance controls persist client-side via localStorage and apply
// real `document.documentElement` classes. This is真持久 (survives reload), not
// inert, and touches no shared contract surface. (Locale stays identity-derived
// display only.)
const THEME_STORAGE_KEY = "creatoros.settings.theme";
const DENSITY_STORAGE_KEY = "creatoros.settings.density";

type Theme = "system" | "light" | "dark";
type Density = "comfortable" | "compact";

const THEME_VALUES: ReadonlyArray<Theme> = ["system", "light", "dark"];
const DENSITY_VALUES: ReadonlyArray<Density> = ["comfortable", "compact"];

function readStored<T extends string>(
  key: string,
  allowed: ReadonlyArray<T>,
  fallback: T,
): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw && (allowed as ReadonlyArray<string>).includes(raw)) {
      return raw as T;
    }
  } catch {
    // localStorage unavailable (private mode / SSR) — fall back to default.
  }
  return fallback;
}

function writeStored(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Best-effort persistence; ignore quota / disabled-storage errors.
  }
}

/** Apply the resolved theme as a `.dark` / no-`.dark` class on <html>. */
function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const prefersDark =
    theme === "dark" ||
    (theme === "system" &&
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.classList.toggle("dark", prefersDark);
  root.dataset.theme = theme;
}

/** Apply density as a `data-density` attribute on <html> for layout hooks. */
function applyDensity(density: Density): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.density = density;
}

// ---------------------------------------------------------------------------
// SettingsTabsNav — controlled tab strip that drives a real partition
// ---------------------------------------------------------------------------
//
// The page previously rendered an UNcontrolled `PageTabs` whose value changed
// nothing — every card showed regardless of the active tab (a decorative tab).
// This controlled version makes the tab真实分区: selecting a tab scrolls to the
// matching `data-settings-section` anchor and toggles a highlight outline on it,
// so the eight tabs become a working in-page section navigator. All sections
// stay mounted (no content is hidden), so the structural page tests still see
// every card.
export function SettingsTabsNav({
  tabs,
  defaultValue,
}: {
  tabs: ReadonlyArray<{ id: string; label: string }>;
  defaultValue: string;
}) {
  const [active, setActive] = React.useState<string>(defaultValue);

  const focusSection = React.useCallback((tabId: string) => {
    if (typeof document === "undefined") return;
    const sections = Array.from(
      document.querySelectorAll<HTMLElement>("[data-settings-section]"),
    );
    let matched: HTMLElement | null = null;
    for (const node of sections) {
      const owns = (node.dataset.settingsTabs ?? "").split(" ").includes(tabId);
      node.dataset.settingsActive = owns ? "true" : "false";
      if (owns && !matched) matched = node;
    }
    matched?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const onValueChange = React.useCallback(
    (value: string) => {
      setActive(value);
      focusSection(value);
    },
    [focusSection],
  );

  return (
    <PageTabs
      tabs={tabs}
      value={active}
      defaultValue={defaultValue}
      onValueChange={onValueChange}
      ariaLabel="设置分类导航"
    />
  );
}

// ---------------------------------------------------------------------------
// SettingsMainColumn
// ---------------------------------------------------------------------------

export function SettingsMainColumn({
  viewModel,
}: {
  viewModel: SettingsViewModel;
}) {
  return (
    <div data-slot="main-settings" className="flex flex-col gap-card-gap">
      <SettingsSection sectionId="account">
        <AccountInformationCard viewModel={viewModel} />
      </SettingsSection>
      <SettingsSection sectionId="preferences">
        <PreferenceSettingsCard viewModel={viewModel} />
      </SettingsSection>
      {/* 外观 (theme/density/locale). */}
      <SettingsSection sectionId="appearance">
        <SystemSettingsCard viewModel={viewModel} />
      </SettingsSection>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SettingsSection — a real, anchorable partition for a settings tab
// ---------------------------------------------------------------------------
//
// Each settings card is wrapped in a section that carries the tab id(s) it
// serves. The tab strip (`SettingsTabsNav`) targets these `id` anchors so a tab
// click really scrolls to and highlights its section — a real partitioned
// display rather than a decorative tab. All sections stay mounted (the page
// tests assert every card is present at once), so this never hides content.
function SettingsSection({
  sectionId,
  alsoFor,
  children,
}: {
  sectionId: string;
  alsoFor?: ReadonlyArray<string>;
  children: React.ReactNode;
}) {
  const tabIds = [sectionId, ...(alsoFor ?? [])].join(" ");
  return (
    <div
      id={`settings-section-${sectionId}`}
      data-slot="settings-section"
      data-settings-section={sectionId}
      data-settings-tabs={tabIds}
      className="scroll-mt-24 transition-[outline] data-[settings-active=true]:outline data-[settings-active=true]:outline-2 data-[settings-active=true]:outline-offset-4 data-[settings-active=true]:outline-brand/40"
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SettingsRailColumn
// ---------------------------------------------------------------------------

export function SettingsRailColumn({
  viewModel,
}: {
  viewModel: SettingsViewModel;
}) {
  return (
    <div
      data-slot="settings-rail"
      className="flex flex-col gap-card-gap"
    >
      <SettingsSection sectionId="storage">
        <StorageUsageCard storage={viewModel.storage} />
      </SettingsSection>
      {/* 集成 → model providers. */}
      <SettingsSection sectionId="integrations">
        <ModelConfigurationCard model={viewModel.model} />
      </SettingsSection>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AccountInformationCard
// ---------------------------------------------------------------------------

function AccountInformationCard({
  viewModel,
}: {
  viewModel: SettingsViewModel;
}) {
  // 昵称 is now REAL: it edits the identity-owned `users.displayName` via the
  // `identity.profile.patch` op (`PATCH /me`) — a真持久 server write, not a
  // read-only桩. The input is a controlled draft; saving fires the op and
  // refreshes the server read so the chips/avatar reflect the new name. 邮箱
  // stays read-only (it is the login identifier + unique key — out of the
  // editable surface this wave).
  const initialName = viewModel.account.displayName;
  const [draftName, setDraftName] = React.useState<string>(initialName);
  const { pending, run } = useSettingsMutation();

  // Re-sync the draft when the server read changes the identity (post-refresh).
  React.useEffect(() => {
    setDraftName(initialName);
  }, [initialName]);

  const trimmed = draftName.trim();
  const dirty = trimmed.length > 0 && trimmed !== initialName;

  const saveName = React.useCallback(() => {
    if (!dirty) return;
    run(() =>
      client.patchProfile({
        params: undefined,
        query: undefined,
        body: { displayName: trimmed },
      }),
    );
  }, [dirty, run, trimmed]);

  return (
    <SectionCard
      title="账户信息"
      description="账号基本信息与登录状态"
      action={
        <span
          data-slot="account-status-badge"
          className="inline-flex h-6 items-center rounded-md bg-success-soft px-2 text-xs font-medium text-success"
        >
          已验证
        </span>
      }
    >
      <div data-slot="account-information-card" className="flex flex-col gap-3">
        <div
          data-slot="account-identity"
          className="flex items-center gap-3 rounded-md border border-border bg-surface-subtle p-3"
        >
          <div
            aria-hidden="true"
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-sm font-semibold text-brand"
          >
            {viewModel.account.initials}
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <span className="truncate text-sm font-medium text-foreground">
              {viewModel.account.displayName}
            </span>
            <span className="truncate font-mono text-xs text-muted-foreground">
              {viewModel.account.email}
            </span>
            <div className="flex flex-wrap gap-1">
              {/* 计划 chip is intentionally inert (decorative) — no billing
                  entity exists in Wave 0 (Module 00, Task 12). */}
              <TagChip
                label={`计划：${viewModel.account.planLabel}`}
                tone="brand"
                size="sm"
              />
              {/* 时区 / 语言 chips bind to the REAL identity
                  (`userResource.timezone` / `.locale`). */}
              <TagChip
                label={`时区：${viewModel.account.timezone}`}
                tone="neutral"
                size="sm"
              />
              <TagChip
                label={`语言：${viewModel.account.locale}`}
                tone="neutral"
                size="sm"
              />
            </div>
          </div>
        </div>
        <SettingsFormRow
          label="昵称"
          controlId="account-nickname"
          help="显示名称，保存后立即生效（PATCH /me，真持久）。"
        >
          <div className="flex w-full items-center gap-2">
            <Input
              id="account-nickname"
              data-slot="account-nickname-input"
              value={draftName}
              disabled={pending}
              onChange={(event) => setDraftName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  saveName();
                }
              }}
              aria-label="账户昵称"
            />
            <Button
              type="button"
              data-slot="account-nickname-save"
              variant="outline"
              size="sm"
              disabled={!dirty || pending}
              onClick={saveName}
            >
              保存
            </Button>
          </div>
        </SettingsFormRow>
        <SettingsFormRow
          label="邮箱"
          controlId="account-email"
          help="邮箱是登录标识与唯一键，暂不支持在此修改。"
        >
          {/* 邮箱 stays read-only: it is the login identifier + users_email_uk
              unique key. Editing it needs a re-auth / uniqueness flow with no
              route yet — shown as a read-only field. */}
          <Input
            id="account-email"
            type="email"
            data-slot="account-email-input"
            value={viewModel.account.email}
            readOnly
            aria-readonly="true"
          />
        </SettingsFormRow>
      </div>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// PreferenceSettingsCard
// ---------------------------------------------------------------------------

type CreationMode = "guided" | "flexible" | "freeform";
type Visibility = "private" | "unlisted" | "public";

function PreferenceSettingsCard({
  viewModel,
}: {
  viewModel: SettingsViewModel;
}) {
  const initial = viewModel.preferences;
  const [defaultHome, setDefaultHome] = React.useState<string>(
    initial.defaultHome,
  );
  const [defaultCreationMode, setDefaultCreationMode] =
    React.useState<CreationMode>(initial.defaultCreationMode);
  const [defaultVisibility, setDefaultVisibility] = React.useState<Visibility>(
    initial.defaultVisibility,
  );
  const [autosaveEnabled, setAutosaveEnabled] = React.useState<boolean>(
    initial.autosaveEnabled,
  );
  const [analyticsEnabled, setAnalyticsEnabled] = React.useState<boolean>(
    initial.analyticsEnabled,
  );
  const { pending, run } = useSettingsMutation();

  // Each preference control optimistically updates local state, then PATCHes only
  // its own key (op `settings.preferences.patch`) and refreshes the server read.
  const patch = React.useCallback(
    (
      body: Parameters<typeof client.patchPreferences>[0]["body"],
    ) =>
      run(() =>
        client.patchPreferences({ params: undefined, query: undefined, body }),
      ),
    [run],
  );
  return (
    <SectionCard
      title="偏好设置"
      description="新建项目与编辑流程的默认行为"
    >
      <div data-slot="preference-settings-card" className="flex flex-col gap-3">
        <SettingsFormRow
          label="默认主页"
          controlId="pref-default-home"
          help="登录后跳转的第一个页面。"
        >
          <Select
            value={defaultHome}
            onValueChange={(value) => {
              const next = String(value);
              setDefaultHome(next);
              patch({ defaultHome: next });
            }}
          >
            <SelectTrigger
              id="pref-default-home"
              data-slot="pref-default-home-trigger"
              size="sm"
              className="w-40"
              disabled={pending}
            >
              <SelectValue placeholder="选择主页" />
            </SelectTrigger>
            <SelectContent data-slot="pref-default-home-content">
              {HOME_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsFormRow>
        <SettingsFormRow
          label="默认创作模式"
          controlId="pref-creation-mode"
          help="新建项目时套用的流程强度。"
        >
          <Select
            value={defaultCreationMode}
            onValueChange={(value) => {
              const next = value as CreationMode;
              setDefaultCreationMode(next);
              patch({ defaultCreationMode: next });
            }}
          >
            <SelectTrigger
              id="pref-creation-mode"
              data-slot="pref-creation-mode-trigger"
              size="sm"
              className="w-40"
              disabled={pending}
            >
              <SelectValue placeholder="选择模式" />
            </SelectTrigger>
            <SelectContent data-slot="pref-creation-mode-content">
              {CREATION_MODE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsFormRow>
        <SettingsFormRow
          label="默认可见性"
          controlId="pref-visibility"
          help="新建内容的默认分享范围（个人产品，无团队）。"
        >
          <Select
            value={defaultVisibility}
            onValueChange={(value) => {
              const next = value as Visibility;
              setDefaultVisibility(next);
              patch({ defaultVisibility: next });
            }}
          >
            <SelectTrigger
              id="pref-visibility"
              data-slot="pref-visibility-trigger"
              size="sm"
              className="w-40"
              disabled={pending}
            >
              <SelectValue placeholder="选择可见性" />
            </SelectTrigger>
            <SelectContent data-slot="pref-visibility-content">
              {VISIBILITY_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsFormRow>
        <SettingsFormRow
          label="自动保存"
          controlId="pref-autosave"
          help="每 30 秒保存一次草稿。"
        >
          <Switch
            id="pref-autosave"
            data-slot="pref-autosave-switch"
            size="sm"
            checked={autosaveEnabled}
            disabled={pending}
            onCheckedChange={(value) => {
              const next = Boolean(value);
              setAutosaveEnabled(next);
              patch({ autosaveEnabled: next });
            }}
            aria-label="启用自动保存"
          />
        </SettingsFormRow>
        <SettingsFormRow
          label="使用情况分析"
          controlId="pref-analytics"
          help="帮助我们改进产品；不会上传个人内容。"
        >
          <Switch
            id="pref-analytics"
            data-slot="pref-analytics-switch"
            size="sm"
            checked={analyticsEnabled}
            disabled={pending}
            onCheckedChange={(value) => {
              const next = Boolean(value);
              setAnalyticsEnabled(next);
              patch({ analyticsEnabled: next });
            }}
            aria-label="启用使用情况分析"
          />
        </SettingsFormRow>
      </div>
    </SectionCard>
  );
}

const HOME_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "dashboard", label: "首页" },
  { value: "projects", label: "项目" },
  { value: "knowledge", label: "知识库" },
  { value: "publishing", label: "发布中心" },
];

const CREATION_MODE_OPTIONS: ReadonlyArray<{
  value: CreationMode;
  label: string;
}> = [
  { value: "guided", label: "向导模式" },
  { value: "flexible", label: "灵活模式" },
  { value: "freeform", label: "自由模式" },
];

const VISIBILITY_OPTIONS: ReadonlyArray<{ value: Visibility; label: string }> =
  [
    { value: "private", label: "仅自己" },
    { value: "unlisted", label: "不公开列出" },
    { value: "public", label: "公开" },
  ];

// ---------------------------------------------------------------------------
// SystemSettingsCard
// ---------------------------------------------------------------------------

function SystemSettingsCard({ viewModel }: { viewModel: SettingsViewModel }) {
  // Theme / density are真持久 via localStorage (no contract field exists). We
  // lazy-init from the fixture/identity default, then overwrite from storage on
  // mount (avoids an SSR/CSR hydration mismatch — the server can't read
  // localStorage). Every change writes back AND applies real <html> classes.
  const [theme, setTheme] = React.useState<Theme>(viewModel.system.theme);
  const [density, setDensity] = React.useState<Density>(
    viewModel.system.density,
  );
  // 系统语言 is now REAL: it persists to the identity-owned `users.locale` via
  // the `identity.profile.patch` op (`PATCH /me`) — the same locale the account
  // 语言 chip and timezone display read. No longer a local-only桩. Optimistic
  // local state + the op + router.refresh() (via useSettingsMutation).
  const [locale, setLocale] = React.useState<string>(viewModel.system.locale);
  const { pending: localePending, run: runLocale } = useSettingsMutation();

  // Re-sync after a server refresh changes the identity-derived locale.
  React.useEffect(() => {
    setLocale(viewModel.system.locale);
  }, [viewModel.system.locale]);

  const onLocaleChange = React.useCallback(
    (next: string) => {
      setLocale(next);
      runLocale(() =>
        client.patchProfile({
          params: undefined,
          query: undefined,
          body: { locale: next },
        }),
      );
    },
    [runLocale],
  );

  React.useEffect(() => {
    const storedTheme = readStored(
      THEME_STORAGE_KEY,
      THEME_VALUES,
      viewModel.system.theme,
    );
    const storedDensity = readStored(
      DENSITY_STORAGE_KEY,
      DENSITY_VALUES,
      viewModel.system.density,
    );
    setTheme(storedTheme);
    setDensity(storedDensity);
    applyTheme(storedTheme);
    applyDensity(storedDensity);
    // Run once on mount; the fixture defaults are stable so deps are intentionally
    // limited to the initial identity-derived values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onThemeChange = React.useCallback((next: Theme) => {
    setTheme(next);
    writeStored(THEME_STORAGE_KEY, next);
    applyTheme(next);
  }, []);

  const onDensityChange = React.useCallback((next: Density) => {
    setDensity(next);
    writeStored(DENSITY_STORAGE_KEY, next);
    applyDensity(next);
  }, []);

  return (
    <SectionCard
      title="系统设置"
      description="外观、语言与通知"
    >
      <div data-slot="system-settings-card" className="flex flex-col gap-3">
        <SettingsFormRow
          label="主题"
          controlId="sys-theme"
          help="跟随系统或手动切换浅色/深色（已本地持久，刷新后保持）。"
        >
          <Select
            value={theme}
            onValueChange={(value) => onThemeChange(value as Theme)}
          >
            <SelectTrigger
              id="sys-theme"
              data-slot="sys-theme-trigger"
              size="sm"
              className="w-40"
            >
              <SelectValue placeholder="选择主题" />
            </SelectTrigger>
            <SelectContent data-slot="sys-theme-content">
              {THEME_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsFormRow>
        <SettingsFormRow
          label="密度"
          controlId="sys-density"
          help="列表与卡片的间距（已本地持久，刷新后保持）。"
        >
          <Select
            value={density}
            onValueChange={(value) => onDensityChange(value as Density)}
          >
            <SelectTrigger
              id="sys-density"
              data-slot="sys-density-trigger"
              size="sm"
              className="w-40"
            >
              <SelectValue placeholder="选择密度" />
            </SelectTrigger>
            <SelectContent data-slot="sys-density-content">
              {DENSITY_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsFormRow>
        <SettingsFormRow
          label="语言"
          controlId="sys-locale"
          help="界面与时区显示语言，保存后即生效（PATCH /me，真持久）。"
        >
          <Select
            value={locale}
            onValueChange={(value) => onLocaleChange(String(value))}
          >
            <SelectTrigger
              id="sys-locale"
              data-slot="sys-locale-trigger"
              size="sm"
              className="w-40"
              disabled={localePending}
            >
              <SelectValue placeholder="选择语言" />
            </SelectTrigger>
            <SelectContent data-slot="sys-locale-content">
              {LOCALE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsFormRow>
      </div>
    </SectionCard>
  );
}

const THEME_OPTIONS: ReadonlyArray<{ value: Theme; label: string }> = [
  { value: "system", label: "跟随系统" },
  { value: "light", label: "浅色" },
  { value: "dark", label: "深色" },
];

const DENSITY_OPTIONS: ReadonlyArray<{ value: Density; label: string }> = [
  { value: "comfortable", label: "舒适" },
  { value: "compact", label: "紧凑" },
];

const LOCALE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "zh-CN", label: "简体中文" },
  { value: "en-US", label: "English (US)" },
  { value: "ja-JP", label: "日本語" },
];

// ---------------------------------------------------------------------------
// StorageUsageCard
// ---------------------------------------------------------------------------

// Format bytes as a GB string with one decimal (decimal GB, 1e9). Real values.
function gb(bytes: number): string {
  return (bytes / 1e9).toFixed(1);
}

// item B — StorageUsageCard 做真. Shows the REAL backend + media root (editable +
// 保存 → settings.storage.put), the real used-vs-disk-capacity progress bar, and
// the per-asset-type breakdown (real bytes). The path edit persists through the
// op + router.refresh() (via useSettingsMutation), then the server re-reads
// settings.storage.get.
function StorageUsageCard({
  storage,
}: {
  storage: SettingsViewModel["storage"];
}) {
  const [rootPath, setRootPath] = React.useState<string>(storage.rootPath);
  const { pending, run } = useSettingsMutation();

  // Re-sync the draft path when a server refresh changes the stored config.
  React.useEffect(() => {
    setRootPath(storage.rootPath);
  }, [storage.rootPath]);

  const canSave = rootPath.trim().length > 0 && rootPath !== storage.rootPath && !pending;

  const save = React.useCallback(() => {
    if (!canSave) return;
    run(() =>
      client.putStorage({
        params: undefined,
        query: undefined,
        body: { rootPath: rootPath.trim() },
      }),
    );
  }, [canSave, run, rootPath]);

  // GB display via /1e9 (decision: (bytes/1e9).toFixed(1)). totalBytes 0 = unknown
  // capacity → the bar uses usedBytes as its own max so it still renders.
  const usedGb = gb(storage.usedBytes);
  const totalGb = storage.totalBytes > 0 ? gb(storage.totalBytes) : null;

  const backendLabel = storage.backend === "s3" ? "云存储 (S3)" : "本地磁盘";

  return (
    <SectionCard title="存储空间" description="素材、知识库与导出文件">
      <div data-slot="storage-usage-card" className="flex flex-col gap-3">
        <SettingsFormRow
          label="存储后端"
          controlId="storage-backend"
          help="当前媒体字节落地的位置。"
        >
          <Badge
            id="storage-backend"
            data-slot="storage-backend"
            variant="outline"
            className="border-brand/40 bg-brand-soft text-brand"
          >
            {backendLabel}
          </Badge>
        </SettingsFormRow>
        <SettingsFormRow
          label="媒体路径"
          controlId="storage-root-path"
          help="素材落盘的根目录;支持 ~ 展开。修改后点保存生效(settings.storage.put)。"
        >
          <div className="flex w-full items-center gap-2">
            <Input
              id="storage-root-path"
              data-slot="storage-root-path-input"
              value={rootPath}
              disabled={pending}
              placeholder="~/CreatorOS/media"
              onChange={(event) => setRootPath(event.target.value)}
              aria-label="媒体存储路径"
            />
            <Button
              type="button"
              size="sm"
              data-slot="storage-save-button"
              disabled={!canSave}
              onClick={save}
            >
              保存
            </Button>
          </div>
        </SettingsFormRow>
        <ProgressBar
          value={storage.usedBytes}
          max={storage.totalBytes > 0 ? storage.totalBytes : storage.usedBytes || 1}
          label={
            totalGb
              ? `已用 ${usedGb} GB / ${totalGb} GB`
              : `已用 ${usedGb} GB`
          }
          showValue
          tone="brand"
        />
        <ul
          data-slot="storage-breakdown"
          className="flex flex-col gap-1.5 text-sm"
          aria-label="存储分布"
        >
          {storage.breakdown.map((row) => (
            <li
              key={row.assetType}
              data-slot="storage-breakdown-row"
              data-storage-asset-type={row.assetType}
              className="flex items-center justify-between"
            >
              <span className="flex items-center gap-2 text-foreground">
                <span aria-hidden="true" className="size-2 rounded-full bg-brand" />
                {row.label}
              </span>
              <span className="font-mono tabular-nums text-xs text-muted-foreground">
                {gb(row.bytes)} GB
              </span>
            </li>
          ))}
        </ul>
      </div>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// ModelConfigurationCard
// ---------------------------------------------------------------------------

type ApiFormat = "anthropic" | "openai_chat";

const API_FORMAT_OPTIONS: ReadonlyArray<{ value: ApiFormat; label: string }> = [
  { value: "anthropic", label: "Anthropic 兼容" },
  { value: "openai_chat", label: "OpenAI Chat 兼容" },
];

// Free-form provider suggestions — the input is NOT restricted to these (bind any
// vendor: an Anthropic relay, MiniMax, an OpenAI-compatible gateway, etc.).
const PROVIDER_SUGGESTIONS: ReadonlyArray<string> = [
  "anthropic",
  "minimax",
  "openai",
  "google",
  "deepseek",
];

// cc-switch-style configurable provider binding. provider / model / baseUrl /
// apiFormat are free-form; the API key is stored in the LOCAL db (masked to
// `hasSecret` on read — the raw key is never echoed back). A single 保存 upserts
// the "default" capability via `settings.models.put`; resolve.ts then reads it
// (stored key preferred over env-ref) with a global-default fallback.
function ModelConfigurationCard({
  model,
}: {
  model: SettingsViewModel["model"];
}) {
  const [provider, setProvider] = React.useState<string>(model.provider);
  const [modelName, setModelName] = React.useState<string>(model.modelName);
  const [baseUrl, setBaseUrl] = React.useState<string>(model.baseUrl);
  const [apiFormat, setApiFormat] = React.useState<ApiFormat>(model.apiFormat);
  // Blank = keep the existing stored key (the read never returns the raw value).
  const [secret, setSecret] = React.useState<string>("");
  const [temperature, setTemperature] = React.useState<number>(
    model.temperature,
  );
  const { pending, run } = useSettingsMutation();

  // Re-sync drafts when a server refresh changes the stored config.
  React.useEffect(() => {
    setProvider(model.provider);
    setModelName(model.modelName);
    setBaseUrl(model.baseUrl);
    setApiFormat(model.apiFormat);
    setTemperature(model.temperature);
    setSecret("");
  }, [model]);

  const canSave =
    provider.trim().length > 0 && modelName.trim().length > 0 && !pending;

  // One PUT upserts the whole "default" config; an empty secret is omitted so a
  // re-save without re-typing the key preserves the stored one.
  const save = React.useCallback(() => {
    if (!canSave) return;
    run(() =>
      client
        .putModel({
          params: { capability: MODEL_CAPABILITY },
          query: undefined,
          body: {
            provider: provider.trim(),
            modelName: modelName.trim(),
            baseUrl: baseUrl.trim() || undefined,
            apiFormat,
            secret: secret.length > 0 ? secret : undefined,
            settings: { temperature },
          },
        })
        .then(() => setSecret("")),
    );
  }, [canSave, run, provider, modelName, baseUrl, apiFormat, secret, temperature]);

  return (
    <SectionCard
      title="模型配置"
      description="自定义绑定厂商 / 模型 / 接口地址 / 密钥;修改后点保存生效"
    >
      <div data-slot="model-configuration-card" className="flex flex-col gap-3">
        <SettingsFormRow
          label="提供商"
          controlId="model-provider"
          help="任意厂商名,可自定义。"
        >
          <Input
            id="model-provider"
            data-slot="model-provider-input"
            list="model-provider-suggestions"
            value={provider}
            disabled={pending}
            onChange={(event) => setProvider(event.target.value)}
            aria-label="模型提供商"
          />
          <datalist id="model-provider-suggestions">
            {PROVIDER_SUGGESTIONS.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </SettingsFormRow>
        <SettingsFormRow
          label="模型"
          controlId="model-name"
          help="模型 id,如 claude-opus-4-8 / MiniMax-M3。"
        >
          <Input
            id="model-name"
            data-slot="model-name-input"
            value={modelName}
            disabled={pending}
            onChange={(event) => setModelName(event.target.value)}
            aria-label="模型名称"
          />
        </SettingsFormRow>
        <SettingsFormRow
          label="接口地址"
          controlId="model-base-url"
          help="自定义 baseUrl(中转 / MiniMax);留空走官方默认。"
        >
          <Input
            id="model-base-url"
            data-slot="model-base-url-input"
            value={baseUrl}
            disabled={pending}
            placeholder="https://api.anthropic.com(留空=默认)"
            onChange={(event) => setBaseUrl(event.target.value)}
            aria-label="接口地址"
          />
        </SettingsFormRow>
        <SettingsFormRow
          label="接口格式"
          controlId="model-api-format"
          help="鉴权与请求体格式。"
        >
          <Select
            value={apiFormat}
            onValueChange={(value) => setApiFormat(value as ApiFormat)}
          >
            <SelectTrigger
              id="model-api-format"
              data-slot="model-api-format-trigger"
              size="sm"
              className="w-44"
              disabled={pending}
            >
              <SelectValue placeholder="选择格式" />
            </SelectTrigger>
            <SelectContent data-slot="model-api-format-content">
              {API_FORMAT_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsFormRow>
        <SettingsFormRow
          label="密钥"
          controlId="model-secret"
          help={
            model.hasSecret
              ? "已配置;留空保持不变,填入则覆盖。"
              : "粘贴 API Key(存于本地库)。"
          }
        >
          <div className="flex w-full items-center gap-2">
            <Input
              id="model-secret"
              type="password"
              data-slot="model-secret-input"
              value={secret}
              disabled={pending}
              placeholder={model.hasSecret ? "已配置(留空不变)" : "粘贴 API Key"}
              onChange={(event) => setSecret(event.target.value)}
              aria-label="模型密钥"
            />
            {model.hasSecret ? (
              <Badge
                data-slot="model-secret-status"
                variant="outline"
                className="border-success/40 bg-success-soft text-success"
              >
                已配置
              </Badge>
            ) : null}
          </div>
        </SettingsFormRow>
        <SettingsFormRow
          label="温度"
          controlId="model-temperature"
          help="较高的温度会让回答更发散。"
        >
          <Input
            id="model-temperature"
            type="number"
            min={0}
            max={1}
            step={0.1}
            data-slot="model-temperature-input"
            className="w-24"
            value={temperature}
            disabled={pending}
            onChange={(event) => {
              const next = Number(event.target.value);
              if (!Number.isNaN(next)) setTemperature(next);
            }}
            aria-label="模型温度"
          />
        </SettingsFormRow>
        <div className="flex justify-end">
          <Button
            type="button"
            data-slot="model-save"
            variant="outline"
            size="sm"
            disabled={!canSave}
            onClick={save}
          >
            保存模型配置
          </Button>
        </div>
      </div>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// SettingsFormRow
// ---------------------------------------------------------------------------

interface SettingsFormRowProps {
  readonly label: string;
  readonly controlId: string;
  readonly help?: string;
  readonly children: React.ReactNode;
}

function SettingsFormRow({
  label,
  controlId,
  help,
  children,
}: SettingsFormRowProps) {
  return (
    <div
      data-slot="settings-form-row"
      data-control-id={controlId}
      className="grid grid-cols-1 items-start gap-2 border-b border-border/60 pb-3 last:border-b-0 last:pb-0 md:grid-cols-[160px_minmax(0,1fr)]"
    >
      <div data-slot="form-row-label" className="flex flex-col gap-0.5">
        <label
          htmlFor={controlId}
          className="text-sm font-medium text-foreground"
        >
          {label}
        </label>
        {help ? (
          <span className="text-xs text-muted-foreground">{help}</span>
        ) : null}
      </div>
      <div
        data-slot="form-row-control"
        className="flex min-w-0 items-center justify-start"
      >
        {children}
      </div>
    </div>
  );
}
